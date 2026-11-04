import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,access} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {compareFootageFiles,verifyRetrievedFootage,decodeFingerprints} from './footageMatching.js';
import {parsePage} from './urlContext.js';
import {assessOrigin} from './footageHistory.js';
import {analyze} from './videoAnalyzer.js';
import {renderFootageVerification} from '../../frontend/src/footageHistory.js';
const ffmpeg=process.env.FFMPEG_COMMAND||'ffmpeg';
const available=spawnSync(ffmpeg,['-version'],{stdio:'ignore'}).status===0;
const run=args=>execFileSync(ffmpeg,['-nostdin','-hide_banner','-loglevel','error',...args],{stdio:'ignore',timeout:15000});
const page=(uploaded='2020-01-01')=>`<title>Candidate clip</title><script type="application/ld+json">${JSON.stringify({'@type':'VideoObject',contentUrl:'https://cdn.example.com/clip.mp4',uploadDate:uploaded})}</script>`;
test('video-specific upload metadata is separate from article dates and conflicting dates are rejected',()=>{
 const article=parsePage('<meta property="article:published_time" content="2011-01-01"><meta property="og:video" content="https://cdn.example.com/clip.mp4">','https://example.com/report');
 assert.equal(article.mediaCandidates[0].uploadedAt,null);
 const explicit=parsePage(page(),'https://example.com/post');assert.equal(explicit.mediaCandidates[0].uploadedAt,'2020-01-01');
 const conflict=parsePage(page()+page('2021-01-01'),'https://example.com/post');assert.equal(conflict.mediaCandidates[0].uploadedAt,null);assert.equal(conflict.mediaCandidates[0].uploadDateConflict,true);
});
test('missing reference, inaccessible candidates and absent candidates remain explicit without false matches',async()=>{
 const missing=await verifyRetrievedFootage({comparisonUrl:'https://example.com/post'},{fetcher:()=>assert.fail('network')});
 assert.equal(missing.status,'not checked');assert.match(missing.reason,/unavailable/);
 const absent=await verifyRetrievedFootage({referencePath:'/not-used'},{fetcher:()=>assert.fail('network')});assert.match(absent.reason,/No accessible candidate/);
 const dir=await mkdtemp(join(tmpdir(),'footage-unavailable-'));try{
  const ref=join(dir,'ref');await writeFile(ref,'reference');
  const result=await verifyRetrievedFootage({referencePath:ref,comparisonUrl:'https://example.com/private'},{fetcher:async()=>{throw Error('blocked');}});
  assert.equal(result.comparisons[0].status,'unavailable');assert.equal(result.matchingUploads.length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('real decoded sequences detect reencoding and excerpts, reject unrelated/static footage',{skip:!available},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'footage-sequence-'));
 try{
  const ref=join(dir,'ref.mp4'),encoded=join(dir,'encoded.mp4'),excerpt=join(dir,'excerpt.mp4'),other=join(dir,'other.mp4'),still=join(dir,'still.mp4'),still2=join(dir,'still2.mp4'),reversed=join(dir,'reversed.mp4');
  run(['-f','lavfi','-i','testsrc2=size=128x96:rate=12','-t','6','-c:v','mpeg4','-q:v','2',ref]);
  run(['-i',ref,'-c:v','mpeg4','-q:v','5',encoded]);
  run(['-i',ref,'-ss','1','-t','4','-c:v','mpeg4','-q:v','3',excerpt]);
  run(['-i',ref,'-vf','reverse','-c:v','mpeg4','-q:v','3',reversed]);
  run(['-f','lavfi','-i','smptebars=size=128x96:rate=12','-t','6','-c:v','mpeg4',other]);
  run(['-f','lavfi','-i','color=red:size=128x96:rate=12','-t','6','-c:v','mpeg4',still]);
  run(['-i',still,'-c:v','mpeg4','-q:v','8',still2]);
  const exact=await compareFootageFiles(ref,ref);assert.equal(exact.status,'confirmed');assert.equal(exact.method,'exact-file-sha256');
  const reencoded=await compareFootageFiles(ref,encoded);assert.equal(reencoded.status,'possible match',JSON.stringify(reencoded));
  const approximate=await verifyRetrievedFootage({referencePath:ref,comparisonUrl:'https://example.com/post'},{fetcher:async url=>url.endsWith('/post')?{url,type:'text/html',bytes:Buffer.from(page())}:{url,type:'video/mp4',bytes:await readFile(encoded)}});
  assert.equal(approximate.comparisons[0].status,'possible match');assert.equal(approximate.matchingUploads.length,0);
  assert.equal(assessOrigin({originEvidence:approximate}).status,'origin unknown');
  const shorter=await compareFootageFiles(ref,excerpt);assert.equal(shorter.status,'possible match',JSON.stringify(shorter));assert.ok(shorter.alignment[0].referenceTime>shorter.alignment[0].candidateTime);
  assert.equal((await compareFootageFiles(ref,other)).status,'no match');
  assert.equal((await compareFootageFiles(ref,reversed)).status,'no match');
  assert.notEqual((await compareFootageFiles(still,still2)).status,'possible match');
  await assert.rejects(decodeFingerprints(join(dir,'missing')),/failed/);
  const invalid=join(dir,'invalid');await writeFile(invalid,'Not a video');
  await assert.rejects(compareFootageFiles(invalid,invalid),/failed/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('exact candidate files with explicit upload dates drive origin findings; candidates are cleaned up',{skip:!available},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'footage-origin-'));
 try{
  const ref=join(dir,'ref.mp4');run(['-f','lavfi','-i','testsrc2=size=128x96:rate=5','-t','2','-c:v','mpeg4',ref]);
  const bytes=await readFile(ref);let candidatePath;
  const result=await verifyRetrievedFootage({referencePath:ref,comparisonUrl:'https://example.com/post'}, {
   fetcher:async url=>url.endsWith('/post')?{type:'text/html',url,bytes:Buffer.from(page())}:{type:'video/mp4',url,bytes}
  });
  assert.equal(result.comparisons[0].status,'confirmed');assert.equal(result.matchingUploads.length,1);
  assert.equal(result.matchingUploads[0].timestamp.status,'supported');
  assert.equal(assessOrigin({inputUrl:'https://example.com/submitted',clipPublication:'2024-01-01',originEvidence:result}).status,'earlier upload found');
  assert.ok(renderFootageVerification(result).includes('Identical file SHA-256'));
  const undated=await verifyRetrievedFootage({referencePath:ref,candidates:[{sourceUrl:'https://example.com/post',mediaUrl:'https://cdn.example.com/clip.mp4',uploadedAt:'2011-01-01'}]},{fetcher:async url=>({type:'video/mp4',url,bytes})});
  assert.equal(undated.comparisons[0].status,'confirmed');assert.equal(undated.matchingUploads.length,0);
  const encoded=join(dir,'encoded.mp4');run(['-i',ref,'-c:v','mpeg4','-q:v','6',encoded]);
  await verifyRetrievedFootage({referencePath:ref,comparisonUrl:'https://example.com/direct.mp4'}, {fetcher:async url=>({type:'video/mp4',url,bytes:await readFile(encoded)}),decode:async file=>{if(file!==ref)candidatePath=file;return [{time:0,gray:[0],hash:[0],colors:[0],std:0}];}});
  assert.ok(candidatePath);await assert.rejects(access(dirname(candidatePath)));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('analysis invokes actual verifier for retrieved candidates before deleting its downloaded reference',{skip:!available},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'footage-pipeline-'));const env={...process.env};
 try{
  delete process.env.META_API_KEY;
  const ref=join(dir,'ref.mp4');run(['-f','lavfi','-i','testsrc2=size=64x64:rate=5','-t','1','-c:v','mpeg4',ref]);const bytes=await readFile(ref);
  const media=parsePage(page(),'https://example.com/candidate').mediaCandidates[0];
  const result=await analyze({url:'https://example.com/submitted'},{
   retrieveContext:async()=>({title:'Submitted',caption:'Clip',video:'https://cdn.example.com/submitted.mp4',dates:[]}),
   fetchPublic:async url=>({url,type:'video/mp4',bytes}),extractFrames:async()=>[],transcribeClip:async()=>({text:'',warning:'No audio'}),
   searchEvidence:async()=>({sources:[],earliest:null,mediaCandidates:[media],diagnostics:{status:'completed'}})
  });
  assert.equal(result.footageVerification.comparisons[0].status,'confirmed');
  assert.equal(result.lifeHistory.originalOrigin.status,'earliest matching upload located');
  const dated=await analyze({url:'https://example.com/submitted'},{
   retrieveContext:async()=>({title:'Submitted',caption:'Clip',video:'https://cdn.example.com/submitted.mp4',mediaCandidates:[{...media,mediaUrl:'https://cdn.example.com/submitted.mp4',uploadedAt:'2024-01-01'}],dates:[]}),
   fetchPublic:async url=>({url,type:'video/mp4',bytes}),extractFrames:async()=>[],transcribeClip:async()=>({text:'',warning:'No audio'}),
   searchEvidence:async()=>({sources:[],earliest:null,mediaCandidates:[media],diagnostics:{status:'completed'}})
  });
  assert.equal(dated.lifeHistory.originalOrigin.status,'earlier upload found');
 }finally{process.env=env;await rm(dir,{recursive:true,force:true});}
});
test('source discovery retains video links and upload metadata independently of article publication',async()=>{
 const env={...process.env};
 try{
  process.env.SEARCH_PROVIDER='tavily';process.env.TAVILY_API_KEY='mock';process.env.META_TEXT_COMPARISON='false';
  const {searchEvidence}=await import('./sourceDiscovery.js');
  const evidence=await searchEvidence(['Noodle recipe'],{}, {
   fetchImpl:async()=>Response.json({results:[{url:'https://example.com/article',title:'Noodle recipe',content:'Noodle recipe instructions',published_date:'2011-01-01'}]}),
   pageFetcher:async url=>({url,type:'text/html',bytes:Buffer.from('<meta property="article:published_time" content="2011-01-01">'+page('2020-01-01')+'<p>Noodle recipe instructions</p>')})
  });
  assert.equal(evidence.mediaCandidates[0].uploadedAt,'2020-01-01');assert.equal(evidence.mediaCandidates[0].mediaUrl,'https://cdn.example.com/clip.mp4');
  assert.equal(evidence.sources[0].publishedAt,'2011-01-01T00:00:00.000Z');
 }finally{process.env=env;}
});
