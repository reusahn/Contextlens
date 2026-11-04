import {renderCategoryReport} from './contentCategories.js';
import {renderLifeHistory,originAssessment,renderFootageVerification} from './footageHistory.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function link(url,title){try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))throw Error();return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>`;}catch{return esc(title);}}
const date=value=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value)):'Date unknown';
function brief(value){const text=String(value||'').replace(/\s+/g,' ').trim();return text.length<=440?text:text.slice(0,437).replace(/\s+\S*$/,'')+'…';}
function timelineGraph(nodes,{label,emptyMessage,context=false}){
 const dated=nodes.filter(n=>n.date&&Number.isFinite(Date.parse(n.date))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 const undated=nodes.filter(n=>!n.date||!Number.isFinite(Date.parse(n.date)));
 return `${dated.length?`<div class="lineage-scroll" tabindex="0" role="region" aria-label="${esc(label)}; scroll to explore"><ol class="lineage-track">${dated.map(n=>`<li class="lineage-event${n.kind==='submitted post'?' lineage-submitted':''}"><time datetime="${esc(n.date)}">${date(n.date)}</time><span class="lineage-dot" aria-hidden="true"></span><small>${context?'RELATED COVERAGE':n.kind==='submitted post'?'SUBMITTED POST':'MATCHING UPLOAD'}</small><p>${link(n.url,n.title)}</p>${context&&n.claimExcerpt?`<p class="lineage-excerpt">${esc(brief(n.claimExcerpt).slice(0,180))}</p>`:''}</li>`).join('')}</ol></div>`:`<div class="lineage-empty">${esc(emptyMessage)}</div>`}
 ${undated.length?`<div class="lineage-undated"><span>Date unknown</span>${undated.map(n=>`<span>${link(n.url,n.title)}</span>`).join('')}</div>`:''}`;
}
export function renderFootageTimeline(history){
 const timeline=(Array.isArray(history?.timeline)?history.timeline:[]).filter(n=>n.kind==='matching upload'||n.kind==='submitted post');
 const origin=originAssessment(history);
 return `<section class="overview-timeline"><div class="overview-section-heading"><span>02 / FOOTAGE TIMELINE</span><h3>Footage timeline</h3></div><p class="overview-note">Submitted footage and confirmed matching uploads. Connections show chronology, not confirmed copies or a first uploader.</p>
 ${timelineGraph(timeline,{label:'Horizontal footage timeline',emptyMessage:'No supported footage dates yet. The available evidence does not establish a footage timeline.'})}
 <p class="overview-note">Origin assessment: <strong>${esc(origin.displayLabel)}</strong>${origin.status==='origin unknown'?' (unverified)':''}. ${esc(origin.reason)} Spacing is for readability, not elapsed time.</p></section>`;
}
export function renderRelatedContextTimeline(history,sources=[]){
 const nodes=new Map();
 for(const n of Array.isArray(history?.timeline)?history.timeline:[])if(n.kind==='related coverage')nodes.set(n.url||n.id,n);
 for(const [i,s] of (Array.isArray(sources)?sources:[]).entries()){
  const key=s.url||`source-${i}`;
  const previous=nodes.get(key);
  nodes.set(key,{url:s.url,title:s.title||previous?.title,date:s.publishedAt||previous?.date||null,kind:'related coverage',claimExcerpt:s.excerpt||previous?.claimExcerpt||''});
 }
 return `<section class="overview-timeline related-context-timeline"><div class="overview-section-heading"><span>03 / RELATED CONTEXT</span><h3>Related-context timeline</h3></div><p class="overview-note">How related reporting appeared over time. Article publication dates describe coverage, not when this footage was recorded or uploaded.</p>
 ${timelineGraph([...nodes.values()],{label:'Horizontal related-context timeline',emptyMessage:nodes.size?'Related sources were found, but none has a supported publication date. Undated sources are listed below.':'No related coverage has been located yet.',context:true})}
 <p class="overview-note">Sources may discuss the same subject without showing the same footage. Spacing is for readability, not elapsed time.</p></section>`;
}
function renderSources(r){
 const sources=Array.isArray(r.sources)?r.sources:[];
 return sources.length?sources.map((s,i)=>`<article class="source-card"><div class="source-header"><div><small>SOURCE ${String(i+1).padStart(2,'0')} · ${esc(s.domain)} · ${esc(s.publishedAt||'DATE UNKNOWN')}</small><p>${link(s.url,s.title)}</p></div><div class="source-score">${Number.isFinite(s.score)?Math.round(s.score):'—'}/100</div></div><p>${esc(s.excerpt)}</p><small>${s.metaComparison?`Meta text assessment: ${esc(s.metaComparison.assessment)} — ${esc(s.metaComparison.reason)}<br>`:''}${esc(s.timestampComparison||'Publication comparison unavailable.')}<br>Matched clues: ${esc((s.matchedClues||[]).join(' · '))}<br>${esc(s.matchStatus)} · ${esc(s.dateStatus)} · ${esc(s.retrievalStatus)}</small><small>Heuristic score: domain ${Math.round((s.weightFactors?.domain||0)*100)}% · time ${Math.round((s.weightFactors?.chronology||0)*100)}% · relevance ${Math.round((s.weightFactors?.relevance||0)*100)}%<br>${esc(s.scoreExplanation||'')}</small></article>`).join(''):`<p class="muted">${esc(r.conclusion||'No matching reports retained. Review search diagnostics and extracted clues.')}</p>`;
}
function renderFullReport(r){
 const earliest=r.earliestAppearance,d=r.searchDiagnostics;
 return `<section class="report-section"><h3>Search Report</h3><p>${esc(r.conclusion)}</p><h3>Earliest discoverable appearance</h3><div class="metric"><small>EARLIEST DATE IN RETRIEVED SOURCES</small><strong>${earliest?esc(earliest.date):'Not established'}</strong><p>${earliest?`${link(earliest.url,earliest.title)}<br>${esc(earliest.qualification)}`:'No original upload timestamp can be verified from the available evidence.'}</p></div></section>
 <section class="report-section"><h3>Analysis progress</h3><ul class="report-list">${Object.entries(r.pipeline||{}).map(([stage,status])=>`<li>${esc(stage)}: ${esc(status)}</li>`).join('')}</ul><h3>Post publication time</h3><p>${esc(r.clipText?.publication?.publishedAt||'Unconfirmed')} — post metadata, not event time or first upload.</p><h3>Clip text</h3><p>${esc(r.clipText?.caption)}</p><p>${esc(r.clipText?.transcript||'No transcript available.')}</p><h3>Extracted search clues</h3><p>${esc((r.extractedClues||[]).map(c=>`${c.type}: ${c.text}`).join(' · ')||'No clip-specific clues extracted.')}</p><h3>Search results</h3><p>${d?esc(`Queries: ${d.queriesAttempted||0}; failed: ${d.queriesFailed||0}; candidates: ${d.candidates||0}; checked: ${d.checked||0}; matched: ${d.matched||0}; rejected: ${d.rejected||0}; unchecked: ${d.unchecked||0}`):'No search diagnostics available.'}</p><h3>Searches performed</h3><p>${esc((r.queries||[]).join(' · '))}</p></section>
 <section class="report-section"><h3>Visible clues</h3>${r.visibleClues?.length?`<ul class="report-list">${r.visibleClues.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`:'<p class="muted">No analyzed video frames available.</p>'}</section>
 <section class="report-section"><h3>Sources and weighted evidence</h3><p class="muted">${esc(r.confidenceNote)}</p><div class="sources">${renderSources(r)}</div></section>${renderFootageVerification(r.footageVerification)}${renderLifeHistory(r.lifeHistory)}
 <section class="report-section"><h3>Unknowns &amp; limitations</h3><ul class="report-list">${(r.uncertainty||[]).map(u=>`<li>${esc(u)}</li>`).join('')||'<li>Independent verification is still required.</li>'}</ul></section>`;
}
export function renderReportView(r){
 const sources=Array.isArray(r.sources)?r.sources:[];
 const visual=r.pipeline?.vision==='analyzed sampled frames';
 return `<div class="report-bar"><span class="report-label">02 / SEARCH REPORT</span><button class="export-btn" id="exportReport" type="button">↓ EXPORT JSON</button></div>
 <div class="report-overview"><header class="overview-header"><h2>Your footage, at a glance.</h2><span class="pill">${esc(r.status||'Preliminary evidence review')}</span></header>
 <section class="category-report" aria-label="Content category report">${renderCategoryReport(r.categoryReport)}</section>
 ${renderFootageTimeline(r.lifeHistory)}
 ${renderRelatedContextTimeline(r.lifeHistory,r.sources)}
 <section class="overview-context"><div class="overview-section-heading"><span>04 / CONTEXT</span><h3>The short version</h3></div><p class="context-description">${esc(brief(r.summary)||'There is not enough clip-specific context to describe this footage yet.')}</p><div class="overview-evidence"><span>${sources.length} related ${sources.length===1?'source':'sources'}</span><span>${visual?'Sampled frames analyzed':'Based on available text; video not visually analyzed'}</span></div><p class="overview-note">Related reporting can add context, but does not establish that sources show the same footage or that their claims are true.</p></section>
 </div>
 <div class="full-report-action"><button id="fullReportToggle" class="full-report-toggle" type="button" aria-expanded="false" aria-controls="fullReportDetails">See the full report <span aria-hidden="true">↓</span></button><p>Sources, extracted text, analysis details, and limitations.</p></div>
 <div id="fullReportDetails" class="full-report-details" role="region" aria-labelledby="fullReportHeading" hidden><h2 id="fullReportHeading">Full search report</h2><p class="report-summary">${esc(r.summary)}</p>${renderFullReport(r)}</div>
 <p class="muted report-footer">Generated ${esc(Number.isFinite(Date.parse(r.generatedAt))?new Date(r.generatedAt).toLocaleString():'at an unknown time')} · Preliminary research, not a fact-check verdict.</p>`;
}
export function bindReportDisclosure(root){
 const button=root.querySelector('#fullReportToggle'),details=root.querySelector('#fullReportDetails');
 if(!button||!details)return;
 button.addEventListener('click',()=>{
  const expanded=button.getAttribute('aria-expanded')!=='true';
  details.hidden=!expanded;button.setAttribute('aria-expanded',String(expanded));
  button.innerHTML=expanded?'Hide the full report <span aria-hidden="true">↑</span>':'See the full report <span aria-hidden="true">↓</span>';
 });
}
