#!/usr/bin/env node
// Offline preparation + opt-in, paid real-provider semantic benchmark.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {clCanonicalIdentity}=require('../extension/shared');
function metrics(rows,threshold=3) {
 let tp=0,fp=0,fn=0,falseBlur=0,missed=0,trueBlurTotal=0,visibleTotal=0;
 const truths=new Map(),predicted=new Map();
 for(let i=0;i<rows.length;i++) {
  const row=rows[i];
  const truth=truths.get(row.expectedGroup)||new Set();truth.add(row.account);truths.set(row.expectedGroup,truth);
  let predictionCount=0;
  if(row.predictedGroup){const group=predicted.get(row.predictedGroup)||new Set();group.add(row.account);predicted.set(row.predictedGroup,group);predictionCount=group.size;}
  const shouldBlur=truth.size>=threshold,didBlur=predictionCount>=threshold;
  if(shouldBlur){trueBlurTotal++;if(!didBlur)missed++;}else{visibleTotal++;if(didBlur)falseBlur++;}
  for(let j=0;j<i;j++) {
   const correct=rows[j].expectedGroup===row.expectedGroup;
   const grouped=!!row.predictedGroup&&rows[j].predictedGroup===row.predictedGroup;
   if(grouped&&correct)tp++;if(grouped&&!correct)fp++;if(!grouped&&correct)fn++;
  }
 }
 const fraction=(n,d)=>d?n/d:null,precision=fraction(tp,tp+fp),recall=fraction(tp,tp+fn);
 return {posts:rows.length,pairwise:{tp,fp,fn,precision,recall,f1:precision!==null&&recall!==null&&precision+recall?2*precision*recall/(precision+recall):null},
  blur:{falseBlur,nonRepeatedPosts:visibleTotal,falseBlurRate:fraction(falseBlur,visibleTotal),missedRepetitions:missed,repeatedPosts:trueBlurTotal,missedRepetitionRate:fraction(missed,trueBlurTotal)},
  unclassifiedRate:fraction(rows.filter(x=>!x.predictedGroup).length,rows.length)};
}
function quantile(values,p){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b);return s[Math.max(0,Math.ceil(s.length*p)-1)];}
function prepare(file,mode,dir) {
 const count=mode==='baseline'?3:mode==='video'?2:8,size=mode==='baseline'?240:512;
 // Sample a bounded eight-second segment, preserving aspect ratio. No network media fetches.
 const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8'}).trim());
 if(!Number.isFinite(duration)||duration<=.2)throw Error('Cannot read video duration: '+file);
 const seconds=Math.min(8,duration),images=[],times=[];let videoDataUrl='';
 if(mode==='video') {
  const clip=path.join(dir,'clip.mp4');
  execFileSync('ffmpeg',['-y','-v','error','-i',file,'-t',String(seconds),'-an','-vf',`scale=${size}:${size}:force_original_aspect_ratio=decrease`,'-r','8','-c:v','libx264','-preset','fast','-crf','26','-pix_fmt','yuv420p',clip]);
  const bytes=fs.readFileSync(clip);if(bytes.length>8500000)throw Error('Prepared clip exceeds inline budget');
  videoDataUrl='data:video/mp4;base64,'+bytes.toString('base64');
 }
 for(let i=0;i<count;i++) {
  const time=Math.min(seconds-.1,.05+(seconds-.15)*i/(count-1)),dest=path.join(dir,`frame-${i}.jpg`);
  const filter=mode==='baseline'?`scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2`:`scale=${size}:${size}:force_original_aspect_ratio=decrease`;
  execFileSync('ffmpeg',['-y','-v','error','-ss',String(time),'-i',file,'-frames:v','1','-vf',filter,'-q:v','6',dest]);
  images.push('data:image/jpeg;base64,'+fs.readFileSync(dest).toString('base64'));times.push(time);
 }
 return {imageDataUrls:images,frameTimes:times,...(videoDataUrl?{videoDataUrl}: {})};
}
async function main() {
 const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
 if(args.includes('--help')||!arg('--manifest')){console.log('Usage: node tools/evaluate.cjs --manifest /path/manifest.json --mode baseline|frames|video [--run] [--max-posts 100] [--out benchmarks/results/run.json]\nWithout --run: validate local inputs only; no API calls. With --run: use your running bridge and its configured daily guard.');return;}
 const mode=arg('--mode','frames');if(!['baseline','frames','video'].includes(mode))throw Error('Invalid mode');
 const manifestPath=path.resolve(arg('--manifest')),manifest=JSON.parse(fs.readFileSync(manifestPath)),posts=(manifest.posts||[]).slice(0,Math.max(1,Number(arg('--max-posts','100'))));
 if(!posts.length)throw Error('Add labelled local videos to manifest.posts');
 for(const row of posts){if(!row.id||!row.account||!row.expectedGroup||!row.path)throw Error('Each row requires id, account, expectedGroup, path');row.path=path.resolve(path.dirname(manifestPath),row.path);if(!fs.existsSync(row.path))throw Error('Missing local video: '+row.path);}
 if(new Set(posts.map(x=>x.id)).size!==posts.length)throw Error('Post IDs must be unique');
 console.log(JSON.stringify({mode,posts:posts.length,paidRequestsEnabled:args.includes('--run')}));if(!args.includes('--run'))return;
 const {loadEnv}=require('../bridge/server');loadEnv();const token=process.env.CL_BRIDGE_TOKEN||process.env.CL_BENCH_TOKEN;
 if(!token)throw Error('Set CL_BRIDGE_TOKEN in .env (or CL_BENCH_TOKEN to the token printed by your running bridge)');
 const base='http://127.0.0.1:8766',health=()=>fetch(base+'/health').then(r=>r.json()),start=await health();
 if(!start.keyConfigured)throw Error('Configure the running bridge key first');
 const request=async(route,payload)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-ContextLens-Token':token},body:JSON.stringify(payload),signal:AbortSignal.timeout(65000)});const data=await r.json();if(!r.ok)throw Error(`${r.status}: ${data.error}`);return data;};
 const groups=new Map(),rows=[];
 for(const post of posts) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cl-eval-'));
  try {
   const prepStart=Date.now(),media=prepare(post.path,mode,dir),prepMs=Date.now()-prepStart;
   const candidates=[...groups].map(([id,g])=>({id,...g.concept,priorCaptions:g.captions.slice(-2),audioId:g.audioId||''}));
   const common={caption:String(post.caption||'').slice(0,800),postUrl:'http://local-evaluation/'+encodeURIComponent(post.id),audioId:String(post.audioId||''),audioTitle:String(post.audioTitle||''),...media};
   const startMs=Date.now();let result;
   if(mode==='baseline') {
    const tokens=new Set(common.caption.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]);
    const score=c=>{const t=[c.keyword,c.label,c.viralKey,...c.priorCaptions].join(' ').toLowerCase();return Math.min(3,[...tokens].filter(w=>t.split(/[^\p{L}\p{N}]+/u).includes(w)).length);};
    const shortlist=[...candidates].reverse().sort((a,b)=>score(b)-score(a)).slice(0,35);
    result=await request('/api/baseline',{...common,candidates:shortlist});
   }else {
    const observation=await request('/api/describe',common);
    result=observation.specificity==='specific'&&candidates.length?await request('/api/match',{evidenceId:observation.evidenceId,candidates,audioId:common.audioId}):observation;
   }
   let predictedGroup=null;
   if(result.specificity==='specific'&&result.visualConfirmed&&result.viralKey&&result.verification?.status!=='uncertain') {
    if(mode==='baseline')predictedGroup=groups.has(result.matchId)?result.matchId:[...groups].find(([,g])=>clCanonicalIdentity(g.concept.viralKey)===clCanonicalIdentity(result.viralKey))?.[0]||null;
    else predictedGroup=result.verification?.status==='matched'&&groups.has(result.matchId)?result.matchId:null;
    if(!predictedGroup)predictedGroup=crypto.randomUUID();
    const g=groups.get(predictedGroup)||{concept:result,captions:[],audioId:post.audioId};g.captions.push(common.caption);groups.set(predictedGroup,g);
   }
   rows.push({id:post.id,account:post.account,expectedGroup:post.expectedGroup,predictedGroup,latencyMs:Date.now()-startMs,prepMs,decision:result.verification?.status||result.specificity,analysis:result.analysis||null});
   console.log(`${rows.length}/${posts.length} ${post.id}: ${rows.at(-1).decision}`);
  }catch(e){rows.push({id:post.id,account:post.account,expectedGroup:post.expectedGroup,predictedGroup:null,error:e.message});if(/429/.test(e.message))break;}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 const end=await health(),calls=start.date&&end.date&&start.date!==end.date?null:start.remaining-end.remaining;
 const report={scope:'Labelled local-video semantic path, not a full Instagram UX benchmark',mode,metrics:metrics(rows,manifest.threshold||3),latencyMs:{p50:quantile(rows.map(x=>x.latencyMs).filter(Number.isFinite),.5),p95:quantile(rows.map(x=>x.latencyMs).filter(Number.isFinite),.95)},actualMetaAttempts:calls,callsPer100Posts:calls===null?null:100*calls/rows.length,costUsd:null,costNote:'No unverified pricing assumptions. Read provider usage for billed cost.',errors:rows.filter(x=>x.error).length,rows};
 const output=path.resolve(arg('--out',`benchmarks/results/${mode}.json`));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log('Report: '+output);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={metrics,prepare,quantile};
