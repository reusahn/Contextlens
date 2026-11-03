// Synthetic API contract checks, NOT real-world recognition accuracy.
const fs=require('node:fs'),path=require('node:path');
const {describeViral,matchViral}=require('../bridge/viral-engine');
const {loadEnv}=require('../bridge/server'),{createBudget}=require('../bridge/budget');
async function main(){
 if(!process.argv.includes('--run')){console.log('Add --run to make approximately 6 real Meta requests on synthetic product fixtures. This is not an accuracy benchmark.');return;}
 loadEnv();const budget=createBudget({limit:process.env.DAILY_META_LIMIT,file:path.join(__dirname,'../bridge/.contextlens-usage.json')});
 const dir=path.join(__dirname,'../tests/fixtures/provider'),frames=name=>[0,1,2].map(i=>'data:image/jpeg;base64,'+fs.readFileSync(path.join(dir,`${name}-${i}.jpg`)).toString('base64'));
 const common={modelApiKey:process.env.META_API_KEY||process.env.MODEL_API_KEY,beforeRequest:budget.spend},start=budget.used(),checks=[];
 const a=await describeViral({...common,imageDataUrls:frames('a'),frameTimes:[0,1,2],caption:'A CIRRA K2 camera product demonstration.'});a.evidenceId='fixture-a';checks.push({name:'image observation schema',passed:a.specificity==='specific',label:a.label});console.log('Image observation returned.');
 const b=await describeViral({...common,imageDataUrls:frames('b'),frameTimes:[0,1,2],caption:'Another review of the CIRRA K2 camera.'});
 const match=await matchViral({...common,observation:b,imageDataUrls:frames('b'),candidates:[{id:'known-a',...a}],referenceFrames:()=>frames('a').slice(0,2)});checks.push({name:'same synthetic product verification',passed:match.matchId==='known-a',decision:match.verification});console.log('Positive verification returned.');
 const c=await describeViral({...common,imageDataUrls:frames('negative'),frameTimes:[0,1,2],caption:'CIRRA M8 headphones. Another item from the same brand.'});
 const negative=await matchViral({...common,observation:c,imageDataUrls:frames('negative'),candidates:[{id:'known-a',...a}],referenceFrames:()=>frames('a').slice(0,2)});checks.push({name:'different product from same brand stays separate',passed:negative.matchId===null,decision:negative.verification});console.log('Negative verification returned.');
 const video=await describeViral({...common,videoDataUrl:'data:video/mp4;base64,'+fs.readFileSync(path.join(dir,'owned-clip.mp4')).toString('base64'),caption:'A synthetic CIRRA K2 camera clip.'});checks.push({name:'inline MP4 API contract',passed:video.analysis.inputMode==='video'&&video.visualConfirmed,inputMode:video.analysis.inputMode});console.log('MP4 observation returned.');
 const report={scope:'Synthetic API contract checks only. No Instagram accuracy claim.',passed:checks.every(x=>x.passed),actualMetaAttempts:budget.used()-start,checks};
 const out=path.join(__dirname,'../benchmarks/results/provider-smoke.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(!report.passed)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
