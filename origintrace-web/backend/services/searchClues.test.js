import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractClues} from './searchClues.js';
import {matchArticle,rankMatched} from './evidenceRanking.js';
import {buildQueries,searchEvidence} from './sourceDiscovery.js';
import {emptyEvidenceMessage} from './videoAnalyzer.js';
test('extracts bounded quotations, names and short fragments from long context',()=>{
 const clues=extractClues({caption:'Captain Alice met Dover Harbor rescuers. She said "the bridge collapsed at midnight". '+ 'Please like share follow this video. '.repeat(100),transcript:'Rescuers evacuated twelve passengers safely.'});
 assert.ok(clues.some(c=>c.type==='quotation'&&c.text==='the bridge collapsed at midnight'));
 assert.ok(clues.some(c=>c.type==='name/place phrase'&&c.text.includes('Captain Alice')));
 assert.ok(clues.some(c=>c.text.includes('passengers')));
 assert.ok(clues.length<=24);assert.ok(clues.every(c=>c.text.length<=180));
});
test('one strong short clue retains a report despite unrelated caption sentences',()=>{
 const clues=extractClues({caption:'Dover harbor bridge rescue. I remember watching the sunset during vacation. Our family enjoyed restaurants across the region. Please like and share this video.'}).map(c=>c.text);
 const source={url:'https://example.com/report',title:'Dover harbor bridge rescue',excerpt:'Rescuers saved the crew.'};
 const matched=matchArticle(source,clues);
 assert.ok(matched.relevance>=0.6);assert.equal(rankMatched([{...source,...matched}]).sources.length,1);
 assert.equal(matchArticle({title:'Restaurant travel guide',excerpt:'Dining menus'},clues).relevance,0);
});
test('generic boilerplate and a single shared word do not establish a match',()=>{
 assert.deepEqual(extractClues({caption:'Please like share follow subscribe watch this video'}),[]);
 assert.equal(matchArticle({title:'Dover football',excerpt:'Local team'},['Dover harbor rescue']).relevance,0);
 assert.equal(matchArticle({title:'Harboring rescued animals',excerpt:''},['harbor rescue']).relevance,0);
});
test('queries use short extracted clues instead of long full transcripts',()=>{
 const queries=buildQueries({transcript:'Dover harbor bridge rescue saved twelve passengers. '+ 'We were watching the sunset with relatives. '.repeat(40)});
 assert.ok(queries.length<=6);assert.ok(queries.some(q=>q.includes('dover harbor')));assert.ok(queries.every(q=>q.split(/\s+/).length<=6));
});
test('empty conclusions distinguish configuration, failed search, zero hits and rejected candidates',()=>{
 assert.match(emptyEvidenceMessage({diagnostics:{status:'disabled'}}),/disabled/);
 assert.match(emptyEvidenceMessage({diagnostics:{status:'blocked'}}),/blocked/);
 assert.match(emptyEvidenceMessage({diagnostics:{status:'failed'}}),/All article searches failed/);
 assert.match(emptyEvidenceMessage({diagnostics:{status:'completed',candidates:0}}),/no article candidates/);
 assert.match(emptyEvidenceMessage({diagnostics:{status:'completed',candidates:8,checked:8}}),/retrieved 8 candidates/);
});
test('mocked retrieval reports rejected candidates and extracts long-caption clues',async()=>{
 const env={...process.env};process.env.SEARCH_PROVIDER='tavily';process.env.TAVILY_API_KEY='mock';process.env.META_TEXT_COMPARISON='false';
 try{
  const r=await searchEvidence([],{caption:'Dover harbor bridge rescue. A family vacation along distant beaches. Please share this footage.'},{fetchImpl:async()=>Response.json({results:[{url:'https://example.com/rescue',title:'Dover harbor bridge rescue',content:'Crew saved'},{url:'https://example.com/sports',title:'Football standings',content:'Team scores'}]}),pageFetcher:async()=>{throw Error('blocked');}});
  assert.equal(r.sources.length,1);assert.equal(r.diagnostics.candidates,2);assert.equal(r.diagnostics.checked,2);assert.equal(r.diagnostics.rejected,1);assert.ok(r.extractedClues.length>0);
 }finally{process.env=env;}
});
