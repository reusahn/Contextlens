const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {describeViral,matchViral,identifyViral}=require('../bridge/viral-engine');
const {createBudget,dailyLimit}=require('../bridge/budget');
const {clRankCandidates,clCanonicalIdentity,clCompareSamples}=require('../extension/shared');
const frame='data:image/jpeg;base64,'+'A'.repeat(400);
const observation={topic:'Food',format:'Review',keyword:'Everfield Mochi',label:'Everfield Mochi shop',action:'Shows a sliced fruit-filled rice cake',visualEvidence:'Fruit inside translucent rice cake with a named shop box',specificity:'specific',viralKey:'everfield-mochi',visualConfirmed:true,identityScope:'place',aliases:['에버필드 모찌'],entities:['Everfield Mochi'],distinctiveCues:['named shop packaging','sliced rice cake with fruit'],context:'Named shop is claimed by the post; provenance is unverified.'};
const response=value=>({ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:10,completion_tokens:10}})});
test('candidate retrieval finds an old Korean alias among 500 groups with no caption overlap',()=>{
 const all=Array.from({length:499},(_,i)=>({id:'new-'+i,label:'Unrelated clip number '+i,topic:'Entertainment'}));
 all.push({id:'older-correct',label:'Everfield Mochi',aliases:['에버필드 모찌'],visualEvidence:'fruit inside rice cake',topic:'Food'});
 const ranked=clRankCandidates({entities:['에버필드'],distinctiveCues:['rice cake with fruit'],topic:'Food'},all,8);
 assert.equal(ranked[0].id,'older-correct');assert.equal(ranked.length,8);
});
test('canonical names accept a distinctive single-word product, reject broad labels',()=>{
 assert.equal(clCanonicalIdentity('Labubu'),'labubu');assert.equal(clCanonicalIdentity('food'),'');assert.equal(clCanonicalIdentity('dance'),'');
});
test('coarse colour disagreements cannot match footage despite identical hashes',()=>{
 const a=[{hash:'1234567890abcdef',luma:90,signature:Array(48).fill(0)},{hash:'abcdef1234567890',luma:100,signature:Array(48).fill(0)}];
 assert.equal(clCompareSamples(a,a.map(x=>({...x,signature:Array(48).fill(200)}))),null);
});
test('observation sees eight timestamped frames before any candidates or named-trend examples',async()=>{
 let req;const v=await describeViral({caption:'a product review',imageDataUrls:Array(8).fill(frame),frameTimes:[0,1,2,3,4,5,6,7],modelApiKey:'test',fetchImpl:async(_,opts)=>{req=JSON.parse(opts.body);return response(observation);}});
 assert.equal(v.analysis.frameCount,8);assert.equal(req.messages[1].content.filter(x=>x.type==='image_url').length,8);
 assert.doesNotMatch(req.messages[0].content,/Slick Back|ILLIT|Han Jeongseon/);assert.doesNotMatch(req.messages[1].content[0].text,/candidates/);
});
test('user-provided MP4 uses documented inline file content rather than claiming image-only input is video',async()=>{
 let req;const v=await describeViral({videoDataUrl:'data:video/mp4;base64,'+'A'.repeat(400),modelApiKey:'test',fetchImpl:async(_,opts)=>{req=JSON.parse(opts.body);return response(observation);}});
 assert.equal(v.analysis.inputMode,'video');assert.equal(req.messages[1].content[1].type,'file');assert.equal(req.messages[1].content[1].file.filename,'user-provided-clip.mp4');
});
for(const [name,result,expected]of [
 ['two distinctive cues',{status:'matched',matchId:'known',matchConfidence:.95,matchBasis:'same-specific-subject',sharedCues:['same named shop box','same fruit-filled rice cake'],conflicts:[]},'known'],
 ['a conflicting shop label',{status:'matched',matchId:'known',matchConfidence:.99,matchBasis:'same-specific-subject',sharedCues:['same rice cake','same plate'],conflicts:['different shop name']},null],
 ['one weak cue',{status:'matched',matchId:'known',matchConfidence:.99,matchBasis:'same-specific-subject',sharedCues:['same soundtrack'],conflicts:[]},null],
 ['repeated cue text',{status:'matched',matchId:'known',matchConfidence:.99,matchBasis:'same-specific-subject',sharedCues:['same shop','Same shop'],conflicts:[]},null],
 ['invented candidate ID',{status:'matched',matchId:'invented',matchConfidence:.99,matchBasis:'same-specific-subject',sharedCues:['same shop','same item'],conflicts:[]},null],
 ['same topic only',{status:'matched',matchId:'known',matchConfidence:.99,matchBasis:'same-topic',sharedCues:['food','dessert'],conflicts:[]},null],
 ['uncertain identity',{status:'uncertain',matchId:'known',matchConfidence:.99,matchBasis:'same-specific-subject',sharedCues:['same shop','same item'],conflicts:[]},null]
])test('verification handles '+name,async()=>{
 const v=await matchViral({observation,candidates:[{id:'known',...observation}],imageDataUrls:[frame,frame],modelApiKey:'test',fetchImpl:async()=>response(result)});
 assert.equal(v.matchId,expected);if(!expected)assert.notEqual(v.verification.status,'matched');
});
test('first unseen target needs one model call; an existing library requires independent verification',async()=>{
 let calls=0;const options={imageDataUrls:[frame,frame],modelApiKey:'test',fetchImpl:async()=>{calls++;return response(observation);}};
 await identifyViral({...options,candidates:[]});assert.equal(calls,1);
});
test('verification receives intermediate motion frames, not only endpoints',async()=>{
 const frames=Array.from({length:8},(_,i)=>'data:image/jpeg;base64,'+String.fromCharCode(65+i).repeat(400));let request;
 const result=await matchViral({observation,candidates:[{id:'known',...observation}],imageDataUrls:frames,referenceFrames:()=>frames,modelApiKey:'test',fetchImpl:async(_,opts)=>{
  request=JSON.parse(opts.body);return response({status:'matched',matchId:'known',matchConfidence:.95,matchBasis:'same-specific-subject',sharedCues:['named shop packaging','fruit rice cake'],conflicts:[],reason:'Two specific cues align.'});
 }});
 const images=request.messages[1].content.filter(v=>v.type==='image_url').map(v=>v.image_url.url);
 assert.deepEqual(images.slice(0,8),frames);assert.deepEqual(images.slice(8),[frames[0],frames[2],frames[5],frames[7]]);
 assert.equal(result.analysis.verificationFrameCount,8);
});
test('invalid completions retry at most once and every attempt is reserved',async()=>{
 let spent=0,requests=0;
 await assert.rejects(describeViral({imageDataUrls:[frame,frame],modelApiKey:'test',beforeRequest:()=>spent++,fetchImpl:async()=>{requests++;return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'not JSON'}}]})};}}),/Invalid model JSON/);
 assert.equal(spent,2);assert.equal(requests,2);
});
test('HTTP failures do not retry or expose provider response bodies',async()=>{
 let calls=0;
 await assert.rejects(describeViral({imageDataUrls:[frame,frame],modelApiKey:'test',fetchImpl:async()=>{calls++;return {ok:false,status:429,text:async()=> 'PRIVATE INPUT SHOULD NOT ESCAPE'};}}),/^Error: Meta API HTTP 429$/);assert.equal(calls,1);
});
test('budget exhaustion blocks a retry before another request',async()=>{
 const budget=createBudget({limit:1});let calls=0;
 await assert.rejects(describeViral({imageDataUrls:[frame,frame],modelApiKey:'test',beforeRequest:budget.spend,fetchImpl:async()=>{calls++;return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:''}}]})};}}),/Daily Meta call limit/);assert.equal(calls,1);
});
test('200 cap survives restarts and resets only at UTC midnight',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cl-budget-')),file=path.join(dir,'usage.json');let now=new Date('2026-11-03T23:59:00Z');
 try{const a=createBudget({limit:200,file,now:()=>now});for(let i=0;i<125;i++)a.spend();assert.equal(a.remaining(),75);
 const b=createBudget({limit:200,file,now:()=>now});assert.equal(b.remaining(),75);now=new Date('2026-11-04T00:00:00Z');assert.equal(b.remaining(),200);
 assert.equal(dailyLimit('bad'),200);assert.equal(dailyLimit('200'),200);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
module.exports={observation,frame,response};
