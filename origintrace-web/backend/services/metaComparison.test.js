import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compareWithMeta} from './metaComparison.js';
import {searchEvidence} from './sourceDiscovery.js';
import {getMetaBudget,MAX_COST} from './metaBudget.js';
test('Meta comparison uses guarded backend endpoint and reconciles mocked usage',async()=>{
 const env={...process.env},fetch=globalThis.fetch;
 try{
  process.env.META_BUDGET_DB=join(mkdtempSync(join(tmpdir(),'comparison-')),'budget.sqlite');process.env.META_API_DISABLED='false';process.env.META_API_KEY='mock-secret';
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://api.meta.ai/v1/chat/completions');const body=JSON.parse(options.body);
   assert.equal(body.model,'muse-spark-1.3');assert.equal(body.tools,undefined);assert.equal(body.max_completion_tokens,4096);
   assert.match(body.messages[1].content,/Harbor rescue/);
   const ledger=getMetaBudget();assert.equal(ledger.db.prepare('SELECT amount FROM reservations').get().amount,MAX_COST);
   return Response.json({usage:{prompt_tokens:100,completion_tokens:50},choices:[{finish_reason:'stop',message:{content:JSON.stringify({comparisons:[{id:'0',assessment:'related',reason:'Both discuss the harbor rescue.'}]})}}]});
  };
  const result=await compareWithMeta([{title:'Harbor rescue',excerpt:'Crew rescued'}],{caption:'Harbor rescue'},'user');
  assert.equal(result.comparisons[0].assessment,'related');assert.equal(getMetaBudget().db.prepare('SELECT active FROM reservations').get().active,0);
 }finally{process.env=env;globalThis.fetch=fetch;}
});
test('comparison rejects invented or duplicate candidate IDs',async()=>{
 for(const comparisons of [[{id:'https://invented.example',assessment:'related',reason:'guess'}],[{id:'0',assessment:'certain',reason:'guess'}],[]]){
  await assert.rejects(compareWithMeta([{title:'Report'}],{},'user',{request:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({comparisons})}}]})}),/comparison/);
 }
});
test('Meta web search fails closed before any paid dispatch',async()=>{
 const env={...process.env},fetch=globalThis.fetch;
 try{
  delete process.env.SEARCH_PROVIDER;process.env.META_API_KEY='mock';globalThis.fetch=()=>assert.fail('No paid call allowed');
  delete process.env.META_SEARCH_BILLING_MODE;
  const r=await searchEvidence(['Dover harbor rescue']);assert.equal(r.diagnostics.provider,'meta');assert.equal(r.diagnostics.status,'blocked');assert.match(r.warning,/META_SEARCH_BILLING_MODE=best_effort/);
 }finally{process.env=env;globalThis.fetch=fetch;}
});
