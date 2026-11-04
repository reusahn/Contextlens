import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeMetaSearch,searchMeta} from './metaSearch.js';
import {MetaBudget,SEARCH_ESTIMATED_COST} from './metaBudget.js';
const response=queries=>({status:'completed',usage:{input_tokens:100,output_tokens:50},output:[{type:'web_search_call',status:'completed',action:{type:'search',queries},results:[{url:'https://example.com/report',title:'Harbor rescue',snippet:'Dover harbor rescue'}]}]});
test('strict billing mode dispatches no Meta search',async()=>{
 const env={...process.env};delete process.env.META_SEARCH_BILLING_MODE;
 try{await assert.rejects(searchMeta('harbor','u',{fetchImpl:()=>assert.fail('network')}),/opt-in/);}finally{process.env=env;}
});
test('Meta citations are normalized without treating model text as an article/date',()=>{
 const data=response(['harbor']);data.output.push({type:'message',content:[{type:'output_text',text:'Unverified model story',annotations:[{type:'url_citation',url:'javascript:bad',title:'Bad link'}]}]});
 const results=normalizeMetaSearch(data).results;assert.equal(results.length,1);assert.equal(results[0].published_date,null);assert.equal(results[0].content,'Dover harbor rescue');
 assert.equal(normalizeMetaSearch({output:[{type:'message',content:[]}]}).results.length,0);
});
test('documented raw hits and citations preserve snippets without inventing publication dates',()=>{
 const data=response(['harbor']);
 data.output.unshift({type:'reasoning'});
 data.output.push({type:'message',content:[{type:'output_text',text:'A generated date: 1999-01-01',annotations:[
  {type:'url_citation',url:'https://example.com/report',title:'Harbor rescue'},
  {type:'url_citation',url:'https://example.com/second',title:'Second report'}
 ]}]});
 const {results}=normalizeMetaSearch(data);
 assert.equal(results.length,2);assert.equal(results[0].content,'Dover harbor rescue');
 assert.equal(results[1].content,'');assert.ok(results.every(x=>x.published_date===null));
 const unsearched={output:data.output.filter(x=>x.type!=='web_search_call')};
 assert.equal(normalizeMetaSearch(unsearched).results.length,0);
 assert.match(normalizeMetaSearch(unsearched).warning,/did not complete/);
});
test('empty completed search explains missing evidence',()=>{
 const data=response(['harbor']);data.output[0].results=[];
 assert.match(normalizeMetaSearch(data).warning,/no usable source/);
});
test('opted-in mocked search reserves estimated query cost and reconciles reported tokens/queries',async()=>{
 const env={...process.env};process.env.META_SEARCH_BILLING_MODE='best_effort';process.env.META_API_KEY='mock';process.env.META_API_DISABLED='false';
 const budget=new MetaBudget(join(mkdtempSync(join(tmpdir(),'meta-search-')),'budget.sqlite'));
 try{
  const result=await searchMeta('Dover rescue','u',{budget,fetchImpl:async(url,options)=>{
   assert.equal(url,'https://api.meta.ai/v1/responses');const body=JSON.parse(options.body);assert.equal(body.max_tool_calls,1);assert.equal(body.max_output_tokens,4096);assert.equal(body.store,false);assert.deepEqual(body.include,['web_search_call.results']);
   assert.equal(budget.db.prepare('SELECT amount FROM reservations').get().amount,SEARCH_ESTIMATED_COST);return Response.json(response(['Dover rescue']));
  }});
  assert.equal(result.results.length,1);const row=budget.db.prepare('SELECT * FROM reservations').get();assert.equal(row.active,0);assert.equal(row.amount,100*1250+50*4250+2500000);
 }finally{budget.close();process.env=env;}
});
test('unknown query usage keeps estimated cost and excess queries disable future dispatch',async()=>{
 const env={...process.env};process.env.META_SEARCH_BILLING_MODE='best_effort';process.env.META_API_KEY='mock';process.env.META_API_DISABLED='false';
 const budget=new MetaBudget(join(mkdtempSync(join(tmpdir(),'meta-search-')),'budget.sqlite'));
 try{
  const data=response(['harbor']);delete data.output[0].action;
  await searchMeta('harbor','u',{budget,fetchImpl:async()=>Response.json(data)});
  assert.equal(budget.db.prepare('SELECT amount FROM reservations').get().amount,SEARCH_ESTIMATED_COST);
  await searchMeta('harbor','u',{budget,fetchImpl:async()=>Response.json(response(Array(9).fill('harbor')))});
  assert.throws(()=>budget.reserve('next'),/disabled/);
 }finally{budget.close();process.env=env;}
});

test('Meta provider integrates with article retrieval using one guarded search request and no Tavily calls',async()=>{
 const {searchEvidence}=await import('./sourceDiscovery.js');const env={...process.env};process.env.SEARCH_PROVIDER='meta';process.env.META_SEARCH_BILLING_MODE='best_effort';process.env.META_API_KEY='mock';process.env.META_API_DISABLED='false';process.env.META_TEXT_COMPARISON='false';process.env.META_BUDGET_DB=join(mkdtempSync(join(tmpdir(),'meta-discovery-')),'budget.sqlite');let calls=0;
 try{
  const r=await searchEvidence(['Dover harbor rescue'],{reconstructHistory:true},{fetchImpl:async url=>{calls++;assert.equal(url,'https://api.meta.ai/v1/responses');return Response.json(response(['Dover harbor rescue']));},pageFetcher:async url=>({url,type:'text/html',bytes:Buffer.from('<title>Dover harbor rescue</title><meta property="article:published_time" content="2020-01-01"><p>Dover harbor rescue</p>')})});
  assert.equal(calls,1);assert.equal(r.diagnostics.provider,'meta');assert.equal(r.sources.length,1);assert.equal(r.earliest.publishedAt,'2020-01-01T00:00:00.000Z');
 }finally{process.env=env;}
});
