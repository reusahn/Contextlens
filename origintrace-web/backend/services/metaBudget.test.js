import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MetaBudget,MAX_COST,INPUT_LIMIT,OUTPUT_LIMIT,paidMetaRequest} from './metaBudget.js';
const path=()=>join(mkdtempSync(join(tmpdir(),'budget-')),'ledger.sqlite');
test('shared persistent budget cannot exceed $100',()=>{
 const p=path(),a=new MetaBudget(p),b=new MetaBudget(p);
 for(let i=0;i<75;i++){const id=a.reserve(`user${i}`);a.reconcile(id,{prompt_tokens:INPUT_LIMIT,completion_tokens:OUTPUT_LIMIT});}
 assert.throws(()=>b.reserve('other'),/budget/);
 assert.ok(a.db.prepare('SELECT sum(amount) AS n FROM reservations').get().n<=100_000_000_000);
 a.close();const c=new MetaBudget(p);assert.throws(()=>c.reserve('restart'),/budget/);b.close();c.close();
});
test('global concurrency and uncertain reservations survive restart',()=>{
 const p=path(),a=new MetaBudget(p),b=new MetaBudget(p);
 const id=a.reserve('a');b.reserve('b');a.reconcile(id,{});
 assert.throws(()=>b.reserve('c'),/concurrency/);
 a.close();const c=new MetaBudget(p);assert.throws(()=>c.reserve('c'),/concurrency/);
 c.reconcile(id,{prompt_tokens:1,completion_tokens:1});b.reserve('c');b.close();c.close();
});
test('per-user rate limit',()=>{
 const a=new MetaBudget(path());
 for(let i=0;i<5;i++){const id=a.reserve('same');a.reconcile(id,{prompt_tokens:1,completion_tokens:1});}
 assert.throws(()=>a.reserve('same'),/rate limit/);a.reserve('different');a.close();
});
test('disable blocks network',async()=>{
 const a=new MetaBudget(path());process.env.META_API_DISABLED='true';
 try{await assert.rejects(paidMetaRequest({model:'muse-spark-1.3',max_completion_tokens:OUTPUT_LIMIT},'u',{budget:a,fetchImpl:()=>assert.fail('network')}),/disabled/);}
 finally{delete process.env.META_API_DISABLED;a.close();}
});
test('mock failures, timeouts, missing usage and success',async()=>{
 for(const fetchImpl of [async()=>{throw new DOMException('secret','TimeoutError');},async()=>new Response('',{status:500}),async()=>Response.json({}),async()=>Response.json({usage:{prompt_tokens:10,completion_tokens:20}})]){
  const a=new MetaBudget(path());
  await paidMetaRequest({model:'muse-spark-1.3',max_completion_tokens:OUTPUT_LIMIT},'u',{budget:a,fetchImpl}).catch(e=>assert.doesNotMatch(e.message,/secret/));
  const row=a.db.prepare('SELECT * FROM reservations').get();
  assert.equal(row.amount,row.active?MAX_COST:10*1250+20*4250);a.close();
 }
});
test('out-of-bounds usage persistently disables API',()=>{
 const a=new MetaBudget(path()),id=a.reserve('u');
 a.reconcile(id,{prompt_tokens:INPUT_LIMIT+1,completion_tokens:OUTPUT_LIMIT});
 assert.throws(()=>a.reserve('v'),/disabled/);a.close();
});
