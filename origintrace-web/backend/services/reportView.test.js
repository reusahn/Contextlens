import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderReportView,renderFootageTimeline,bindReportDisclosure} from '../../frontend/src/reportView.js';
import {buildLifeHistory} from './footageHistory.js';
import {buildCategoryReport} from './contentCategories.js';
const report=()=>({status:'Preliminary evidence review',summary:'A recipe shows how to prepare noodles.',pipeline:{vision:'skipped: video unavailable'},
 categoryReport:buildCategoryReport({caption:'Food recipe tutorial'}),
 lifeHistory:buildLifeHistory({inputUrl:'https://example.com/clip',sources:[{url:'https://example.com/report',title:'Noodle recipe',publishedAt:'2020-04-02',excerpt:'A related recipe.'}]}),
 sources:[{title:'Retrieved source details',url:'https://example.com/report',score:60}],visibleClues:[],uncertainty:['Media access limited.'],generatedAt:'2026-11-04T00:00:00Z'});
test('overview exposes chart, chronology and short context before hidden full research',()=>{
 const html=renderReportView(report());
 const split=html.indexOf('id="fullReportDetails"'),overview=html.slice(0,split),details=html.slice(split);
 assert.ok(overview.includes('category-radar'));assert.ok(overview.includes('lineage-track'));assert.ok(overview.includes('The short version'));
 assert.ok(overview.includes('Based on available text'));assert.ok(!overview.includes('Retrieved source details'));
 assert.match(details,/aria-labelledby="fullReportHeading" hidden/);
 for(const text of ['Retrieved source details','Analysis progress','Clip text','Unknowns &amp; limitations'])assert.ok(details.includes(text),text);
 assert.match(overview,/aria-expanded="false" aria-controls="fullReportDetails"/);
});
test('lineage orders valid dates, separates undated posts and does not claim copying',()=>{
 const html=renderFootageTimeline({timeline:[{title:'Later',date:'2022-01-01'},{title:'Unknown',date:null},{title:'Earlier',date:'2020-01-01'}]});
 assert.ok(html.indexOf('Earlier')<html.indexOf('Later'));assert.ok(html.includes('Date unknown'));assert.match(html,/not confirmed copies/);
 assert.match(renderFootageTimeline(null),/No supported dates/);
});
test('disclosure supports opening and closing and updates accessible state',()=>{
 const attrs={'aria-expanded':'false'};let click;
 const button={getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v,addEventListener:(_event,fn)=>click=fn};
 const details={hidden:true};
 bindReportDisclosure({querySelector:s=>s==='#fullReportToggle'?button:details});
 click();assert.equal(details.hidden,false);assert.equal(attrs['aria-expanded'],'true');assert.match(button.innerHTML,/Hide the full report/);
 click();assert.equal(details.hidden,true);assert.equal(attrs['aria-expanded'],'false');assert.match(button.innerHTML,/See the full report/);
});
test('untrusted text and unsafe links are escaped; a sparse report still renders',()=>{
 const r=report();r.summary='<script>alert(1)</script>';r.sources[0].url='javascript:alert(1)';
 const html=renderReportView(r);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));
 assert.ok(renderReportView({}).includes('See the full report'));
});
