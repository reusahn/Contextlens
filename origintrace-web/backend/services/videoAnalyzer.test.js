import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {analyze, visionDescribe} from './videoAnalyzer.js';

const originalFetch = globalThis.fetch;
let savedEnv;
const description = {summary:'A street scene.',visibleClues:['A sign'],searchTerms:['street sign'],uncertainty:['No audio analyzed.']};
const completion = (content=JSON.stringify(description), finish_reason='stop') =>
  Response.json({usage:{prompt_tokens:100,completion_tokens:100},choices:[{finish_reason,message:{content}}]});

beforeEach(()=>{
 savedEnv = {...process.env};
 process.env.META_BUDGET_DB=join(mkdtempSync(join(tmpdir(),'meta-test-')),'budget.sqlite');
 process.env.META_API_DISABLED='false';
 process.env.PLATFORM_EXTRACTION_ENABLED='false';
 process.env.META_API_KEY='test-meta-key';
 delete process.env.META_MODEL;
 delete process.env.TAVILY_API_KEY;
 globalThis.fetch=async()=>{throw new Error('Unexpected network request');};
});
afterEach(()=>{process.env=savedEnv;globalThis.fetch=originalFetch;});

test('sends images and schema only to Meta with backend bearer auth',async()=>{
 let calls=0;
 globalThis.fetch=async(url,options)=>{
   calls++;
   assert.equal(url,'https://api.meta.ai/v1/chat/completions');
   assert.equal(options.headers.Authorization,'Bearer test-meta-key');
   assert.ok(options.signal instanceof AbortSignal);
   const body=JSON.parse(options.body);
   assert.equal(body.model,'muse-spark-1.3');
   assert.equal(body.max_completion_tokens,4096);
   assert.equal(body.messages[0].role,'developer');
   assert.deepEqual(body.messages[1].content[1],{type:'image_url',image_url:{url:'data:image/jpeg;base64,aW1hZ2U='}});
   assert.equal(body.response_format.type,'json_schema');
   assert.equal(body.response_format.json_schema.strict,true);
   return completion();
 };
 assert.deepEqual(await visionDescribe(['aW1hZ2U='],'clip.mp4'),description);
 assert.equal(calls,1);
});

test('blocks unpriced model without network',async()=>{
 process.env.META_MODEL='another-vision-model';
 await assert.rejects(visionDescribe(['image'],'clip.mp4'),/approved pricing/);
});
test('category profile travels through the existing vision call without another inference',async()=>{
 const categoryProfile={subject:'Food',formats:[{tag:'Recipe',weight:80,reason:'Visible ingredients and cooking steps'},{tag:'Tutorial',weight:20,reason:'Step labels'}]};
 let calls=0;
 globalThis.fetch=async(_url,options)=>{
  calls++;const body=JSON.parse(options.body);
  assert.ok(body.response_format.json_schema.schema.properties.categoryProfile);
  return completion(JSON.stringify({...description,categoryProfile}));
 };
 const result=await visionDescribe(['aW1hZ2U='],'clip.mp4');
 assert.deepEqual(result.categoryProfile,categoryProfile);assert.equal(calls,1);
});

test('skips provider when credentials or frames are absent',async()=>{
 assert.equal(await visionDescribe([],''),null);
 process.env.META_API_KEY=' ';
 assert.equal(await visionDescribe(['image'],''),null);
});

test('rejects errors, truncated output, refusals, and invalid frontend field types',async()=>{
 for(const response of [
   new Response('secret provider details',{status:401}),
   completion('{}','length'),
   completion('not JSON'),
   completion(JSON.stringify({...description,visibleClues:'wrong'})),
   completion('null'),
   Response.json({usage:{prompt_tokens:100,completion_tokens:100},choices:[{finish_reason:'stop',message:{refusal:'refused',content:null}}]}),
   Response.json({})
 ]){
   process.env.META_BUDGET_DB=join(mkdtempSync(join(tmpdir(),'meta-test-')),'budget.sqlite');
   globalThis.fetch=async()=>response;
   await assert.rejects(visionDescribe(['image'],''),error=>{
     assert.match(error.message,/Meta/);
     assert.doesNotMatch(error.message,/secret provider details/);
     return true;
   });
 }
});

test('missing credentials preserve the full frontend response contract without requests',async()=>{
 delete process.env.META_API_KEY;
 const report=await analyze({filePath:'/unused',filename:'clip.mp4'});
 assert.deepEqual(Object.keys(report).sort(),['categoryReport','mode','input','summary','visibleClues','searchTerms','earliestAppearance','sources','lifeHistory','confidenceNote','clipText','queries','pipeline','searchDiagnostics','extractedClues','conclusion','uncertainty','status','generatedAt'].sort());
 assert.equal(report.mode,'limited');
 assert.equal(report.input.filename,'clip.mp4');
 for(const field of ['visibleClues','searchTerms','sources','uncertainty']) assert.ok(Array.isArray(report[field]));
 assert.ok(report.uncertainty.some(w=>w.includes('META_API_KEY')));
 assert.equal(report.earliestAppearance,null);
});

test('inaccessible URL remains limited without fetching video bytes',async()=>{
 const report=await analyze({url:'https://www.instagram.com/reel/example'},{retrieveContext:async()=>{throw Error('blocked');}});
 assert.equal(report.mode,'limited');
 assert.equal(report.input.host,'www.instagram.com');
 assert.ok(report.uncertainty.some(w=>w.includes('could not be retrieved')));
});
