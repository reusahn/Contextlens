import {test,beforeEach,afterEach} from 'node:test';
let savedProvider,savedComparison;
beforeEach(()=>{process.env.PLATFORM_EXTRACTION_ENABLED='false';savedProvider=process.env.SEARCH_PROVIDER;savedComparison=process.env.META_TEXT_COMPARISON;process.env.SEARCH_PROVIDER='tavily';process.env.META_TEXT_COMPARISON='false';});
afterEach(()=>{if(savedProvider===undefined)delete process.env.SEARCH_PROVIDER;else process.env.SEARCH_PROVIDER=savedProvider;if(savedComparison===undefined)delete process.env.META_TEXT_COMPARISON;else process.env.META_TEXT_COMPARISON=savedComparison;});
import assert from 'node:assert/strict';
import {publicAddress,webUrl,parsePage,retrieveContext} from './urlContext.js';
import {buildQueries,searchEvidence} from './sourceDiscovery.js';
import {verifiedDate,rankMatched} from './evidenceRanking.js';
import {analyze} from './videoAnalyzer.js';
const page=(html,url='https://example.com/article')=>({url,type:'text/html',bytes:Buffer.from(html)});
test('rejects private targets, credentials and unsafe schemes',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.0.1','::1','::ffff:127.0.0.1','100.64.0.1'])assert.equal(publicAddress(ip),false);
 assert.equal(publicAddress('8.8.8.8'),true);
 for(const url of ['file:///etc/passwd','http://user:pass@example.com','http://example.com:3001'])assert.throws(()=>webUrl(url));
});
test('retrieves captions, video, subtitles and explicit publication dates',async()=>{
 const html='<title>Harbor bridge rescue</title><meta property="og:description" content="Captain Alice in Dover"><meta property="og:video" content="/clip.mp4"><meta property="article:published_time" content="2020-01-01"><track src="/captions.vtt">';
 const r=await retrieveContext('https://example.com',{fetcher:async url=>url.endsWith('.vtt')?page('WEBVTT\n00:00:01.000 --> 00:00:03.000\nHarbor bridge rescue'):page(html)});
 assert.equal(r.video,'https://example.com/clip.mp4');assert.match(r.transcript,/Harbor bridge rescue/);assert.equal(r.dates[0].value,'2020-01-01');
});
test('multiple bounded queries include exact quotations and identifying clues',()=>{
 const q=buildQueries({url:'https://example.com/clip',caption:'Alice in Dover says "the bridge is collapsing"',transcript:'We rescued the crew from the harbor',terms:['Dover bridge rescue','Captain Alice harbor']});
 assert.equal(q.length,6);assert.ok(q.includes('"the bridge is collapsing"'));assert.ok(q.includes('Dover bridge rescue'));
});
test('dates exclude future, missing, search-only and conflicting timestamps',()=>{
 assert.equal(verifiedDate([{value:'2999-01-01',source:'page:date'}]).publishedAt,null);
 assert.equal(verifiedDate([{value:'2020-01-01',source:'search:date'}]).publishedAt,null);
 assert.equal(verifiedDate([{value:'2020-01-01',source:'page:date'},{value:'2021-01-01',source:'search:date'}]).dateStatus,'conflicting dates');
 assert.equal(verifiedDate([{value:'2020-01-01',source:'page:date'}]).publishedAt,'2020-01-01T00:00:00.000Z');
});
test('mocked multi-search retrieves articles, rejects unrelated pages and verifies earliest date',async()=>{
 const saved=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY='mock';let calls=0;
 try{
  const r=await searchEvidence(['Dover bridge rescue','Captain Alice harbor'],{caption:'Dover bridge rescue'},{fetchImpl:async()=>{calls++;return Response.json({results:[{url:'https://reuters.com/rescue',title:'Dover bridge rescue',content:'Captain Alice harbor',published_date:'2020-01-01'},{url:'https://example.com/unrelated',title:'Sports results',content:'Football match'}]});},pageFetcher:async url=>page(url.includes('rescue')?'<title>Dover bridge rescue</title><meta property="article:published_time" content="2020-01-01"><p>Captain Alice harbor rescue</p>':'<title>Football match</title>',url)});
  assert.equal(calls,2);assert.equal(r.sources.length,1);assert.equal(r.earliest.url,'https://reuters.com/rescue');assert.equal(r.sources[0].retrievalStatus,'page retrieved');assert.ok(r.sources[0].score>0);
 }finally{if(saved===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=saved;}
});
test('URL context integrates with search and report without Meta calls',async()=>{
 const oldFetch=globalThis.fetch,saved=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY='mock';
 globalThis.fetch=async url=>{assert.equal(url,'https://api.tavily.com/search');return Response.json({results:[]});};
 try{
  const r=await analyze({url:'https://example.com/clip',transcript:'Dover harbor rescue'},{retrieveContext:async()=>({title:'Dover bridge rescue',caption:'Captain Alice',transcript:'',video:null})});
  assert.match(r.clipText.caption,/Captain Alice/);assert.equal(r.clipText.transcript,'Dover harbor rescue');assert.ok(r.queries.length>=2);assert.equal(r.earliestAppearance,null);
 }finally{globalThis.fetch=oldFetch;if(saved===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=saved;}
});
test('weighted score is transparent and earliest remains chronological',()=>{
 const r=rankMatched([{url:'https://example.com/a',publishedAt:'2020-01-01',relevance:1},{url:'https://reuters.com/a',publishedAt:'2021-01-01',relevance:1}]);
 assert.equal(r.earliest.url,'https://example.com/a');assert.equal(r.sources[0].url,'https://reuters.com/a');
});

test('Instagram metadata preserves apostrophes and decodes numeric entities',()=>{
 const r=parsePage(`<meta property="og:title" content="Rescue on Instagram"><meta property="og:description" content="Alice's rescue at Dover &#8212; crew safe"><meta property="og:video" content="javascript:bad">`,'https://www.instagram.com/reel/abc/');
 assert.equal(r.caption,"Alice's rescue at Dover — crew safe");assert.equal(r.video,null);
});
test('Instagram login pages are rejected rather than treated as clip descriptions',async()=>{
 await assert.rejects(retrieveContext('https://www.instagram.com/reel/abc/?igsh=tracking',{fetcher:async url=>{
  assert.equal(url,'https://www.instagram.com/reel/abc/');return page('<title>Login • Instagram</title><meta name="description" content="Create an account or log in to Instagram.">','https://www.instagram.com/accounts/login/');
 }}),/login screen/);
});
test('public structured video metadata supplies caption and video URL',()=>{
 const r=parsePage('<title>Instagram</title><script type="application/ld+json">{"@type":"VideoObject","description":"Dover harbor rescue by Captain Alice","contentUrl":"https://cdn.example.com/rescue.mp4"}</script>','https://www.instagram.com/reel/abc/');
 assert.equal(r.caption,'Dover harbor rescue by Captain Alice');assert.equal(r.video,'https://cdn.example.com/rescue.mp4');
});
test('URL-only search matches article hyperlink references despite Instagram tracking parameters',async()=>{
 const saved=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY='mock';
 try{
  const r=await searchEvidence([],{url:'https://www.instagram.com/reel/abc/?igsh=tracking'},{fetchImpl:async()=>Response.json({results:[{url:'https://example.com/report',title:'Footage investigation',content:'A video report'}]}),pageFetcher:async url=>page('<title>Footage investigation</title><p>Watch the footage</p><a href="https://instagram.com/reel/abc/">Original clip</a>',url)});
  assert.equal(r.sources.length,1);assert.equal(r.sources[0].matchStatus,'references submitted URL');
 }finally{if(saved===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=saved;}
});
test('indexed caption fallback expands search when Instagram blocks live metadata',async()=>{
 const saved=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY='mock';const requests=[];
 try{
  const r=await searchEvidence([],{url:'https://www.instagram.com/reel/abc/'},{fetchImpl:async(_url,options)=>{
   requests.push(JSON.parse(options.body).query);
   return Response.json({results:requests.length===1?[{url:'https://instagram.com/reel/abc/?igsh=x',title:'Captain Alice rescue',content:'Dover harbor bridge rescue by Captain Alice'}]:[{url:'https://example.com/report',title:'Dover harbor bridge rescue',content:'Dover harbor bridge rescue by Captain Alice'}]});
  },pageFetcher:async()=>{throw Error('blocked');}});
  assert.ok(requests.length>=2&&requests.length<=6);assert.ok(requests.some(q=>/dover harbor/i.test(q)));assert.match(r.indexedCaption,/Captain Alice/);assert.equal(r.sources.length,1);
 }finally{if(saved===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=saved;}
});
test('pipeline explains unavailable context and disabled search without invoking paid providers',async()=>{
 let searched=false;
 const r=await analyze({url:'https://www.instagram.com/reel/abc/?igsh=tracking'},{retrieveContext:async()=>{throw Error('login');},searchEvidence:async(_terms,context)=>{
  searched=true;assert.equal(context.url,'https://www.instagram.com/reel/abc/');return {sources:[],earliest:null,diagnostics:{status:'disabled'},warning:'Configure TAVILY_API_KEY'};
 }});
 assert.ok(searched);assert.equal(r.pipeline.context,'unavailable or login page');assert.equal(r.pipeline.vision,'skipped: video unavailable');assert.equal(r.pipeline.search,'disabled');
});
