const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function link(url,title){try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))throw Error();return `<a href="${escape(u.href)}" target="_blank" rel="noopener noreferrer">${escape(title)}</a>`;}catch{return escape(title);}}
export function originAssessment(h){
 const known=['origin unknown','earliest matching upload located','creator attribution supported','earlier upload found'];
 const origin=h?.originalOrigin;
 const assessment=origin&&known.includes(origin.status)?origin:{status:'origin unknown',reason:'No supported uploader or creator attribution is available in this report.',findings:[],qualification:'The first recording and globally first upload remain unproven.'};
 return {...assessment,displayLabel:assessment.status==='origin unknown'?'Likely the original post':assessment.status};
}
export function renderFootageVerification(v){
 if(!v)return '';
 return `<section class="report-section"><h3>Footage-match verification</h3><p class="muted">${escape(v.qualification||'Footage comparison could not complete.')}</p>${v.reason?`<p>${escape(v.reason)}</p>`:''}
 ${(v.comparisons||[]).map(c=>`<article class="source-card"><div class="source-header"><p>${link(c.sourceUrl,c.title||'Candidate footage')}</p><span class="pill">${escape(c.status)}</span></div>
 <p>${escape(c.reason||c.qualification||'')}</p><small>Method: ${escape(c.method||'not compared')} · Video upload date: ${escape(c.uploadedAt||'unconfirmed')}</small>
 ${c.digest?`<p>Identical file SHA-256: <code>${escape(c.digest)}</code></p>`:''}
 ${c.method==='aligned-frame-fingerprints'?`<p>${Number(c.matchedFrames)||0} consecutive matching sampled frames; ${Number(c.distinctFrames)||0} distinct visual samples.</p><details><summary>Frame alignment evidence</summary><p>${(c.alignment||[]).slice(0,20).map(a=>`Submitted ${escape(a.referenceTime)}s ↔ candidate ${escape(a.candidateTime)}s`).join('<br>')||'No aligned frames.'}</p></details>`:''}</article>`).join('')}
 <p class="muted">${v.candidatesFound!==undefined?`${Number(v.candidatesChecked)||0} of ${Number(v.candidatesFound)||0} candidate videos checked. `:''}Visual similarity alone does not change the origin status. Creator attribution requires separate corroboration.</p></section>`;
}
export function renderLifeHistory(h){
 if(!h)return '';
 const origin=originAssessment(h);
 return `<section class="report-section"><h3>Life history of the footage</h3><p class="muted">${escape(h.status)}. Chronological order does not establish copying or derivation.</p>
 <div class="metric"><small>ORIGIN ASSESSMENT</small><strong>${escape(origin.displayLabel)}</strong>${origin.status==='origin unknown'?'<small>UNVERIFIED ORIGIN</small>':''}<p>${escape(origin.reason)}</p><p>${escape(origin.qualification)}</p>
 ${(origin.findings||[]).map(f=>`<div class="origin-finding"><h4>${escape(f.status)}</h4><p>${escape(f.reason)}</p><ul class="report-list">${(f.uploads||[]).map(u=>`<li>${link(u.url,u.title)} · ${escape(u.uploadedAt)}<br>Match: ${escape(u.footageMatch?.method)} · ${link(u.footageMatch?.evidenceUrl,'Matching evidence')}<br>Upload timestamp: ${link(u.timestamp?.evidenceUrl,'Timestamp evidence')} (${escape(u.timestamp?.status)} · ${escape(u.timestamp?.method)})</li>`).join('')}${(f.attributions||[]).map(a=>`<li>${escape(a.creator)} · ${link(a.uploadUrl,'Matching upload')}<br>Reviewed by ${escape(a.reviewedBy)} · ${a.evidenceUrls.map((url,i)=>link(url,`Supporting evidence ${i+1}`)).join(' · ')}</li>`).join('')}</ul></div>`).join('')}
 <small>EARLIEST LOCATED RELATED COVERAGE</small><p>${h.earliestLocated?`${escape(h.earliestLocated.date)} · ${link(h.earliestLocated.url,h.earliestLocated.title)}`:'No supported publication date located.'}</p></div>
 <ol class="history-timeline">${h.timeline.map(n=>`<li><small>${escape(n.date||'Date unconfirmed')} · ${escape(n.kind)}</small><p>${link(n.url,n.title)}</p><p>${escape(n.claimExcerpt||'')}</p><small>${escape(n.identityStatus)}</small></li>`).join('')||'<li>No related appearances located.</li>'}</ol>
 <h3>Historical and current claims</h3>${h.claimComparisons.map(c=>`<article class="source-card"><p>${link(c.earlierUrl,'Earlier source')}: “${escape(c.earlierClaim)}”</p><p>${link(c.laterUrl,'Later source')}: “${escape(c.laterClaim)}”</p><p>${escape(c.relationship)}: ${escape(c.reason)}</p><small>${escape(c.qualification)}</small></article>`).join('')||'<p class="muted">No supported dated claim comparison available. This does not establish agreement between sources.</p>'}
 <h3>Modification history</h3><p class="muted">${escape(h.modificationHistory.status)}. ${escape(h.modificationHistory.reason)}</p>${h.modificationHistory.reports.map(m=>`<article class="source-card"><p>${link(m.url,'Source report')}: ${escape(m.description)}</p><p>“${escape(m.evidenceQuote)}”</p><small>${escape(m.qualification)}</small></article>`).join('')}
 <h3>Content Credentials / cryptographic provenance</h3><p class="muted">${escape(h.cryptographicProvenance.status)}. ${escape(h.cryptographicProvenance.qualification)} ${link(h.cryptographicProvenance.reference,'About C2PA and Content Credentials')}</p>
 ${h.identity?`<p class="muted">Exact-file SHA-256: <code>${escape(h.identity.digest)}</code><br>${escape(h.identity.qualification)}</p>`:''}
 <ul class="report-list">${h.limitations.map(x=>`<li>${escape(x)}</li>`).join('')}</ul></section>`;
}
