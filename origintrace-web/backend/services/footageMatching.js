import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileIdentity} from './footageHistory.js';
import {fetchPublic,parsePage,canonicalUrl} from './urlContext.js';
import {verifiedDate} from './evidenceRanking.js';
const SIZE=32,FRAME_BYTES=SIZE*SIZE*3,FPS=2,MAX_FRAMES=60;
const boundedDate=v=>verifiedDate([{value:v,source:'page:videoobject:uploadDate'}]).publishedAt;
export function frameFingerprint(rgb,time){
 const gray=[],colors=[];let sum=0,squares=0;
 for(let i=0;i<rgb.length;i+=3){const g=rgb[i]*.299+rgb[i+1]*.587+rgb[i+2]*.114;gray.push(g);sum+=g;squares+=g*g;}
 for(let y=0;y<4;y++)for(let x=0;x<4;x++)for(let c=0;c<3;c++){
  let n=0;for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++)n+=rgb[((y*8+dy)*SIZE+x*8+dx)*3+c];colors.push(n/64);
 }
 const hash=[];for(let y=0;y<8;y++)for(let x=0;x<7;x++)hash.push(gray[(y*4+2)*SIZE+x*4+2]>gray[(y*4+2)*SIZE+(x+1)*4+2]?1:0);
 const mean=sum/gray.length;
 return {time,hash,colors,gray,std:Math.sqrt(Math.max(0,squares/gray.length-mean*mean))};
}
export function decodeFingerprints(file,{timeoutMs=6000}={}){return new Promise((resolve,reject)=>{
 const child=spawn(process.env.FFMPEG_COMMAND||'ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe,data','-i',file,'-t','30','-an','-vf',`fps=${FPS},scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2`,'-frames:v',String(MAX_FRAMES),'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{stdio:['ignore','pipe','ignore'],timeout:timeoutMs});
 const chunks=[];let size=0;
 child.stdout.on('data',data=>{size+=data.length;if(size>FRAME_BYTES*MAX_FRAMES){child.kill('SIGKILL');reject(Error('Frame limit exceeded'));}else chunks.push(data);});
 child.on('error',reject);child.on('close',code=>{
  if(code!==0)return reject(Error('Video decoding failed or timed out'));
  const bytes=Buffer.concat(chunks);if(!bytes.length||bytes.length%FRAME_BYTES)return reject(Error('No complete decoded frames'));
  resolve(Array.from({length:bytes.length/FRAME_BYTES},(_,i)=>frameFingerprint(bytes.subarray(i*FRAME_BYTES,(i+1)*FRAME_BYTES),i/FPS)));
 });
});}
const difference=(a,b)=>a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
function frameMatch(a,b){return a.std>=12&&b.std>=12&&difference(a.hash,b.hash)<=.12&&difference(a.colors,b.colors)<=12&&difference(a.gray,b.gray)<=15;}
export function compareFrameSequences(left,right){
 let best=[];
 for(let offset=-right.length+1;offset<left.length;offset++){
  let run=[];
  for(let j=0;j<right.length;j++){
   const i=j+offset;
   if(i>=0&&i<left.length&&frameMatch(left[i],right[j])){
    run.push({referenceTime:left[i].time,candidateTime:right[j].time,index:i});
    if(run.length>best.length)best=run.slice();
   }else run=[];
  }
 }
 const distinct=[];
 for(const pair of best)if(distinct.every(f=>difference(f.gray,left[pair.index].gray)>=5))distinct.push(left[pair.index]);
 const possible=best.length>=6&&best.length/Math.min(left.length,right.length)>=.6&&distinct.length>=3;
 return {status:possible?'possible match':'no match',method:'aligned-frame-fingerprints',matchedFrames:best.length,distinctFrames:distinct.length,
  alignment:best.map(({index,...pair})=>pair),sampledSeconds:30,
  qualification:'Approximate comparison of up to 30 seconds at 2 fps. Similarity requires review; it is not a calibrated probability or a confirmed origin. Crops, speed changes, overlays and later excerpts may be missed.'};
}
export async function compareFootageFiles(reference,candidate,{referenceIdentity,referenceFrames,decode=decodeFingerprints,timeoutMs=6000,deadline=Date.now()+20000}={}){
 const [left,right]=await Promise.all([referenceIdentity?Promise.resolve(referenceIdentity):fileIdentity(reference),fileIdentity(candidate)]);
 const decodeTime=()=>{if(Date.now()>=deadline)throw Error('Comparison deadline exceeded');return Math.min(timeoutMs,deadline-Date.now());};
 const frames=referenceFrames?await referenceFrames():await decode(reference,{timeoutMs:decodeTime()});
 if(!frames.length)throw Error('Submitted file has no decodable video frames');
 if(left.digest===right.digest)return {status:'confirmed',method:'exact-file-sha256',digest:left.digest,qualification:'Identical file bytes with decodable video; this does not identify the creator or first uploader.'};
 return compareFrameSequences(frames,await decode(candidate,{timeoutMs:decodeTime()}));
}
export async function verifyRetrievedFootage({referencePath,inputUrl='',candidates=[],comparisonUrl=''}={}, {fetcher=fetchPublic,decode=decodeFingerprints}={}){
 const result={status:'not checked',referenceAvailable:!!referencePath,comparisons:[],matchingUploads:[],qualification:'Exact files can be confirmed. Visual similarity is heuristic and requires review; article dates are not upload dates.'};
 if(!referencePath){result.reason='Submitted video bytes are unavailable; footage cannot be compared.';return result;}
 if(process.env.FOOTAGE_MATCH_ENABLED==='false'){result.reason='Footage comparison is disabled.';return result;}
 const started=Date.now(),remaining=()=>Math.max(1,20000-(Date.now()-started));
 const queue=[];
 const seen=new Set();
 const add=c=>{try{const mediaUrl=c.mediaUrl?canonicalUrl(c.mediaUrl):null,sourceUrl=canonicalUrl(c.sourceUrl||c.url);if(inputUrl&&sourceUrl===canonicalUrl(inputUrl)||seen.has(mediaUrl||sourceUrl))return;seen.add(mediaUrl||sourceUrl);queue.push({...c,sourceUrl,mediaUrl});}catch{}};
 if(comparisonUrl)add({sourceUrl:comparisonUrl,title:'Comparison URL'});
 for(const c of candidates)add(c);
 if(!queue.length){result.reason='No accessible candidate video links were discovered. Add a comparison URL to compare known footage.';return result;}
 const max=Math.max(1,Math.min(3,Number(process.env.FOOTAGE_MATCH_MAX_CANDIDATES)||2));
 const dir=await mkdtemp(join(tmpdir(),'origintrace-match-'));
 try{
  const identity=await fileIdentity(referencePath);let frames;
  const referenceFrames=()=>frames||(frames=decode(referencePath,{timeoutMs:Math.min(6000,remaining())}));
  for(const c of queue.slice(0,max)){
   if(Date.now()-started>=20000)break;
   const record={sourceUrl:c.sourceUrl,title:c.title||'Candidate video'};
   try{
    let mediaUrl=c.mediaUrl,uploadedAt=c.timestampSource==='videoobject:uploadDate'&&!c.uploadDateConflict?boundedDate(c.uploadedAt):null;
    const get=url=>fetcher(url,{maxBytes:30*1024*1024,timeoutMs:Math.min(8000,remaining()),redirects:2});
    let response=await get(mediaUrl||c.sourceUrl);
    if(/html/i.test(response.type)){
     const page=parsePage(response.bytes.toString('utf8'),response.url||c.sourceUrl);
     const media=page.mediaCandidates?.[0];mediaUrl=media?.mediaUrl||page.video;uploadedAt=media?.timestampSource==='videoobject:uploadDate'&&!media.uploadDateConflict?boundedDate(media.uploadedAt):null;
     if(!mediaUrl){record.status='unavailable';record.reason='Page provides no accessible video file.';result.comparisons.push(record);continue;}
     response=await get(mediaUrl);
    }
    if(!/^video\//i.test(response.type))throw Error('Not video');
    const file=join(dir,`candidate-${result.comparisons.length}`);await writeFile(file,response.bytes);
    const comparison=await compareFootageFiles(referencePath,file,{referenceIdentity:identity,referenceFrames,decode,timeoutMs:Math.min(6000,remaining()),deadline:started+20000});
    Object.assign(record,comparison,{mediaUrl:mediaUrl||response.url||c.sourceUrl,uploadedAt});
    if(comparison.status==='confirmed'&&uploadedAt)result.matchingUploads.push({url:c.sourceUrl,title:record.title,uploadedAt,
     footageMatch:{...comparison,verifiedBy:'origintrace-sha256-v1',evidenceUrl:record.mediaUrl},
     timestamp:{status:'supported',method:'page-video-upload',verifiedBy:'origintrace-videoobject-v1',evidenceUrl:c.sourceUrl}});
   }catch{record.status='unavailable';record.reason='Candidate retrieval or decoding failed, exceeded a limit, or was blocked. No match claim was made.';}
   result.comparisons.push(record);
  }
  result.status='completed';result.candidatesFound=queue.length;result.candidatesChecked=result.comparisons.length;
  result.elapsedMs=Date.now()-started;return result;
 }finally{await rm(dir,{recursive:true,force:true});}
}
