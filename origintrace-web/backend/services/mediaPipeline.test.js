import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MetaBudget,AUDIO_MAX_COST} from './metaBudget.js';
import {wavDuration,transcribeMeta} from './metaSpeech.js';
import {platformInfo,extractPlatform} from './platformMedia.js';
import {embeddedInstagram} from './urlContext.js';
import {comparePublication} from './evidenceRanking.js';
import {analyze} from './videoAnalyzer.js';
function wav(seconds=1){const bytes=Buffer.alloc(44+seconds*32000);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(seconds*32000,40);return bytes;}
const ledger=()=>new MetaBudget(join(mkdtempSync(join(tmpdir(),'speech-budget-')),'budget.sqlite'));
test('speech validates actual PCM duration rather than caller estimate',()=>{
 assert.equal(wavDuration(wav(180)),180);assert.throws(()=>wavDuration(wav(181)),/limit/);
 const invalid=wav();invalid.writeUInt16LE(2,22);assert.throws(()=>wavDuration(invalid),/Unsupported/);
});
test('mocked Meta speech reserves and reconciles shared ledger',async()=>{
 const env={...process.env};const budget=ledger();process.env.META_API_KEY='mock';process.env.META_API_DISABLED='false';
 try{
  const result=await transcribeMeta(wav(10),'u',{budget,fetchImpl:async(url,options)=>{
   assert.equal(url,'https://api.meta.ai/v1/asr/transcribe');assert.ok(options.body instanceof FormData);
   assert.equal(budget.db.prepare('SELECT amount FROM reservations').get().amount,AUDIO_MAX_COST);
   return Response.json({transcript:'Dover harbor rescue',audioDurationMs:10000});
  }});
  assert.equal(result.text,'Dover harbor rescue');const r=budget.db.prepare('SELECT * FROM reservations').get();assert.equal(r.amount,500000);assert.equal(r.active,0);
 }finally{budget.close();process.env=env;}
});
test('speech timeout retains reservation; emergency stop prevents dispatch',async()=>{
 const env={...process.env};const budget=ledger();process.env.META_API_KEY='mock';process.env.META_API_DISABLED='false';
 try{
  await assert.rejects(transcribeMeta(wav(),'u',{budget,fetchImpl:async()=>{throw Error('secret');}}),/reservation retained/);
  assert.equal(budget.db.prepare('SELECT amount FROM reservations').get().amount,AUDIO_MAX_COST);assert.equal(budget.db.prepare('SELECT active FROM reservations').get().active,1);
  process.env.META_API_DISABLED='true';await assert.rejects(transcribeMeta(wav(),'v',{budget,fetchImpl:()=>assert.fail('network')}),/disabled/);
 }finally{budget.close();process.env=env;}
});
test('speech and text reservations share global concurrency and overage disable',()=>{
 const budget=ledger();try{
  const id=budget.reserve('a','audio');budget.reserve('b');assert.throws(()=>budget.reserve('c','audio'),/concurrency/);
  budget.reconcile(id,{audioDurationMs:181000});assert.throws(()=>budget.reserve('d'),/disabled/);
 }finally{budget.close();}
});
test('platform extractor validates post routes and extracts caption and timestamp',async()=>{
 assert.equal(await extractPlatform('https://example.com/video'),null);
 const info=platformInfo({description:'Dover harbor rescue',timestamp:1577836800,formats:[{url:'https://cdn.example.com/v.mp4',protocol:'https',ext:'mp4',vcodec:'h264',acodec:'aac'}]},'https://www.instagram.com/reel/abc/');
 assert.equal(info.caption,'Dover harbor rescue');assert.equal(info.video,'https://cdn.example.com/v.mp4');assert.equal(info.dates[0].value,'2020-01-01T00:00:00.000Z');
});
test('embedded Instagram extraction ignores other posts and reads matching public caption/media',()=>{
 const html='<script type="application/json">'+JSON.stringify({items:[{shortcode:'other',caption:{text:'Wrong event'}},{shortcode:'abc',caption:{text:'Dover harbor rescue'},video_url:'https://cdn.example.com/video.mp4'}]})+'</script>';
 const r=embeddedInstagram(html,'https://www.instagram.com/reel/abc/');assert.equal(r.caption,'Dover harbor rescue');assert.match(r.video,/video.mp4/);
});
test('platform video -> speech -> event search -> timestamp comparison works with mocks and cleans files',async()=>{
 const env={...process.env};delete process.env.META_API_KEY;let path;
 try{
  const report=await analyze({url:'https://www.instagram.com/reel/abc/'},{retrieveContext:async()=>({url:'https://www.instagram.com/reel/abc/',title:'Post',caption:'',video:null}),extractPlatform:async()=>({caption:'Dover harbor bridge rescue',video:'https://cdn.example.com/video.mp4',dates:[{value:'2020-01-03',source:'platform:upload timestamp'}]}),fetchPublic:async()=>({type:'video/mp4',bytes:Buffer.from('mock video')}),transcribeClip:async file=>{path=file;assert.ok(existsSync(file));return {text:'Captain Alice rescued twelve passengers',source:'Mock speech'};},searchEvidence:async(_terms,context)=>{
   assert.match(context.caption,/Dover/);assert.match(context.transcript,/Captain Alice/);assert.equal(context.clipPublishedAt,'2020-01-03T00:00:00.000Z');
   return {sources:[{title:'Dover rescue report',url:'https://example.com/report',publishedAt:'2020-01-01T00:00:00.000Z'}],earliest:null,diagnostics:{status:'completed'}};
  }});
  assert.equal(report.pipeline.video,'downloaded');assert.equal(report.pipeline.speech,'Mock speech');assert.equal(report.sources[0].daysRelativeToClip,-2);assert.ok(!existsSync(path));
 }finally{process.env=env;}
});
test('timestamp comparison never invents dates',()=>{assert.equal(comparePublication(null,'2020-01-01').daysRelativeToClip,null);assert.match(comparePublication('2020-01-01','2020-01-03').timestampComparison,/before/);});
