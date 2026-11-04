import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCategoryReport,FORMAT_TAGS} from './contentCategories.js';
import {renderCategoryReport} from '../../frontend/src/contentCategories.js';
import {analyze} from './videoAnalyzer.js';
test('retains every ContextLens format and adds finer OriginTrace tags',()=>{
 for(const tag of ['Challenge','Meme','Trend','News Event','Reaction','Remix','Performance','Tutorial','Review','Advertisement','Clip','Other','Recipe','Vlog','Unboxing'])assert.ok(FORMAT_TAGS.includes(tag),tag);
});
test('Food subject and Recipe/Tutorial formats remain independent, with explicit text provenance',()=>{
 const r=buildCategoryReport({caption:'A food recipe tutorial: ingredients and step by step instructions.'});
 assert.equal(r.subject,'Food');assert.equal(r.method,'explicit-text-cues');
 assert.deepEqual(r.formats.map(x=>x.tag),['Tutorial','Recipe']);
 assert.equal(r.axes.find(a=>a.id==='learning').share,100);
 assert.equal(r.axes.length,6);assert.equal(r.formats.reduce((n,f)=>n+f.share,0),100);
});
test('Food alone does not invent a recipe, review, or promotion',()=>{
 const r=buildCategoryReport({caption:'A beautiful bowl of noodles at a restaurant.'});
 assert.equal(r.subject,'Food');assert.equal(r.status,'insufficient');assert.equal(r.formats.length,0);assert.ok(r.axes.every(a=>a.share===0));
});
test('model estimates normalize exactly, reject bad tags/weights and deduplicate',()=>{
 const r=buildCategoryReport({vision:{categoryProfile:{subject:'Food',formats:[
  {tag:'Recipe',weight:3,reason:'Visible preparation steps'},
  {tag:'Tutorial',weight:2,reason:'Instruction cards'},
  {tag:'Review',weight:1,reason:'Tasting assessment'},
  {tag:'Recipe',weight:70},{tag:'invented',weight:40},{tag:'Advertisement',weight:-5},{tag:'Clip',weight:Infinity}
 ]}}});
 assert.equal(r.method,'model-relative-weights');assert.equal(r.formats.length,3);
 assert.equal(r.formats.reduce((n,f)=>n+f.share,0),100);assert.equal(r.axes.reduce((n,a)=>n+a.share,0),100);
 assert.equal(r.formats[0].share,50);assert.equal(r.formats[1].share,33);assert.equal(r.formats[2].share,17);
});
test('empty evidence has no invented distribution; indexed text is qualified',()=>{
 assert.equal(buildCategoryReport().status,'insufficient');
 assert.match(buildCategoryReport({caption:'Recipe',indexed:true}).basis,/Unverified search-index/);
});
test('URL caption classification works without video and ignores unrelated article categories',async()=>{
 const report=await analyze({url:'https://example.com/clip'}, {
  retrieveContext:async()=>({title:'Cooking',caption:'Food recipe tutorial',video:null}),
  searchEvidence:async()=>({sources:[{url:'https://example.com/news',title:'Election news interview',excerpt:'Politics'}],earliest:null,diagnostics:{status:'completed'}})
 });
 assert.equal(report.pipeline.vision,'skipped: video unavailable');
 assert.equal(report.categoryReport.subject,'Food');
 assert.equal(report.categoryReport.method,'explicit-text-cues');
 assert.ok(!report.categoryReport.formats.some(f=>f.tag==='News Event'||f.tag==='Interview'));
 assert.ok(JSON.parse(JSON.stringify(report)).categoryReport.axes.length===6);
});
test('chart renders six labeled axes, exact shares, escaped model text and empty/legacy states',()=>{
 const r=buildCategoryReport({caption:'food recipe tutorial'});
 r.summary='<script>bad()</script>';
 const html=renderCategoryReport(r);
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 assert.equal((html.match(/class="radar-node"/g)||[]).length,6);assert.ok(html.includes('aria-labelledby='));assert.ok(html.includes('50%'));
 assert.ok(!renderCategoryReport(buildCategoryReport()).includes('class="radar-area"'));
 assert.match(renderCategoryReport(null),/predates category analysis/);
});
