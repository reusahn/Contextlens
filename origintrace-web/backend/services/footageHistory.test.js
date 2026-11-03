import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {extractFrames,analyze} from './videoAnalyzer.js';
import {fileIdentity,buildLifeHistory} from './footageHistory.js';
import {compareWithMeta} from './metaComparison.js';
import {MetaBudget,MAX_COST,paidMetaRequest,OUTPUT_LIMIT} from './metaBudget.js';
const ffmpeg=process.env.FFMPEG_COMMAND||'ffmpeg';
const available=spawnSync(ffmpeg,['-version'],{stdio:'ignore'}).status===0;
test('real FFmpeg extracts first frame of short clips and five spaced frames of longer clips',{skip:!available},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'frames-test-'));
 try{
  for(const [duration,count] of [[1,1],[23,5]]){
   const path=join(dir,`clip-${duration}.mp4`);
   execFileSync(ffmpeg,['-nostdin','-loglevel','error','-f','lavfi','-i','testsrc2=size=128x96:rate=5','-t',String(duration),'-c:v','mpeg4',path],{stdio:'ignore',timeout:30000});
   const frames=await extractFrames(path);assert.equal(frames.length,count);assert.ok(frames.every(f=>Buffer.from(f,'base64')[0]===0xff));
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('timeline orders dated evidence and never invents origin or edits',()=>{
 const history=buildLifeHistory({sources:[{url:'https://example.com/new',title:'New claim',publishedAt:'2025-01-01',excerpt:'A current claim'},{url:'https://example.com/old',title:'Old coverage',publishedAt:'2020-01-01',excerpt:'An earlier claim'},{url:'https://example.com/no-date',title:'Undated'}]});
 assert.equal(history.timeline[0].title,'Old coverage');assert.equal(history.earliestLocated.title,'Old coverage');
 assert.equal(history.originalOrigin.status,'unestablished');assert.equal(history.modificationHistory.status,'unestablished');assert.equal(history.cryptographicProvenance.status,'not checked');
 assert.match(history.edges[0].relationship,/derivation not established/);
});
test('exact-file hash identifies bytes, not footage origin',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'identity-test-'));try{const path=join(dir,'clip');await writeFile(path,'abc');const identity=await fileIdentity(path);assert.equal(identity.digest,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');}finally{await rm(dir,{recursive:true,force:true});}
});
test('Meta historical claims require actual source quotes and valid chronological IDs',async()=>{
 const sources=[{url:'https://example.com/old',publishedAt:'2020-01-01',title:'Original report',excerpt:'The footage shows a rescue in Dover.'},{url:'https://example.com/new',publishedAt:'2025-01-01',title:'Current report',excerpt:'The footage was cropped and captioned as a rescue in Paris.'}];
 const result=await compareWithMeta(sources,{},'user',{request:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({comparisons:sources.map((_,i)=>({id:String(i),assessment:'related',reason:'Rescue footage'})),claimComparisons:[{earlierId:'0',laterId:'1',relationship:'contradicts',earlierClaim:'a rescue in Dover',laterClaim:'a rescue in Paris',reason:'Different reported places'},{earlierId:'0',laterId:'1',relationship:'contradicts',earlierClaim:'Invented quotation',laterClaim:'a rescue in Paris',reason:'Invented'}],modificationReports:[{id:'1',description:'Reported crop and recaption',evidenceQuote:'was cropped and captioned'}]})}}]})});
 assert.equal(result.claimComparisons.length,1);assert.equal(result.modificationReports.length,1);assert.equal(result.claimComparisons[0].earlierUrl,sources[0].url);
});
test('completed response with missing usage retains full cost but releases execution slot',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'terminal-budget-')),budget=new MetaBudget(join(dir,'budget.sqlite'));
 try{
  await paidMetaRequest({model:'muse-spark-1.3',max_completion_tokens:OUTPUT_LIMIT},'user',{budget,fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{}'}}]})});
  const row=budget.db.prepare('SELECT * FROM reservations').get();assert.equal(row.amount,MAX_COST);assert.equal(row.active,0);
 }finally{budget.close();await rm(dir,{recursive:true,force:true});}
});
test('uploaded video clues reach search and life-history report without paid calls',async()=>{
 const env={...process.env};process.env.META_API_KEY='mock';
 try{
  const report=await analyze({filePath:'/mock/upload.mp4',filename:'clip.mp4'},{extractFrames:async()=>['frame'],visionDescribe:async()=>({summary:'Rescue footage',visibleClues:['Dover Harbor sign'],searchTerms:['Dover rescue'],uncertainty:[]}),transcribeClip:async()=>({text:'Captain Alice saved the crew',source:'mock'}),searchEvidence:async(terms,context)=>{
   assert.ok(terms.includes('Dover Harbor sign'));assert.match(context.transcript,/Captain Alice/);
   return {sources:[{title:'Old rescue coverage',url:'https://example.com/old',publishedAt:'2020-01-01',relevance:1}],diagnostics:{status:'completed'},earliest:null};
  }});
  assert.equal(report.pipeline.frames,'1 frames extracted');assert.equal(report.pipeline.vision,'analyzed sampled frames');assert.equal(report.lifeHistory.timeline[0].title,'Old rescue coverage');
 }finally{process.env=env;}
});

test('history reconstruction searches before located date hints within six requests',async()=>{
 const {searchEvidence}=await import('./sourceDiscovery.js');const env={...process.env};process.env.SEARCH_PROVIDER='tavily';process.env.TAVILY_API_KEY='mock';process.env.META_TEXT_COMPARISON='false';const calls=[];
 try{
  const r=await searchEvidence(['Dover harbor rescue'],{reconstructHistory:true,clipPublishedAt:'2025-01-01'},{fetchImpl:async(_url,options)=>{
   const body=JSON.parse(options.body);calls.push(body);
   return Response.json({results:[{url:'https://example.com/rescue',title:'Dover harbor rescue',content:'Crew rescued in Dover harbor',published_date:body.end_date?'2020-01-01':'2024-01-01'}]});
  },pageFetcher:async()=>{throw Error('blocked');}});
  assert.ok(calls.length<=6);assert.equal(calls.filter(c=>c.end_date).length,2);assert.ok(calls.some(c=>c.end_date==='2024-01-01'));assert.equal(r.queryLog.filter(q=>q.kind==='historical date-filtered search').length,2);
 }finally{process.env=env;}
});
