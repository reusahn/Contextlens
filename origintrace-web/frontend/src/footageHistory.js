const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function link(url,title){try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))throw Error();return `<a href="${escape(u.href)}" target="_blank" rel="noopener noreferrer">${escape(title)}</a>`;}catch{return escape(title);}}
export function renderLifeHistory(h){
 if(!h)return '';
 return `<section class="report-section"><h3>Life history of the footage</h3><p class="muted">${escape(h.status)}. Chronological order does not establish copying or derivation.</p>
 <div class="metric"><small>ORIGINAL ORIGIN</small><strong>${escape(h.originalOrigin.status)}</strong><p>${escape(h.originalOrigin.reason)}</p><small>EARLIEST LOCATED RELATED COVERAGE</small><p>${h.earliestLocated?`${escape(h.earliestLocated.date)} · ${link(h.earliestLocated.url,h.earliestLocated.title)}`:'No supported publication date located.'}</p></div>
 <ol class="history-timeline">${h.timeline.map(n=>`<li><small>${escape(n.date||'Date unconfirmed')} · ${escape(n.kind)}</small><p>${link(n.url,n.title)}</p><p>${escape(n.claimExcerpt||'')}</p><small>${escape(n.identityStatus)}</small></li>`).join('')||'<li>No related appearances located.</li>'}</ol>
 <h3>Historical and current claims</h3>${h.claimComparisons.map(c=>`<article class="source-card"><p>${link(c.earlierUrl,'Earlier source')}: “${escape(c.earlierClaim)}”</p><p>${link(c.laterUrl,'Later source')}: “${escape(c.laterClaim)}”</p><p>${escape(c.relationship)}: ${escape(c.reason)}</p><small>${escape(c.qualification)}</small></article>`).join('')||'<p class="muted">No supported dated claim comparison available. This does not establish agreement between sources.</p>'}
 <h3>Modification history</h3><p class="muted">${escape(h.modificationHistory.status)}. ${escape(h.modificationHistory.reason)}</p>${h.modificationHistory.reports.map(m=>`<article class="source-card"><p>${link(m.url,'Source report')}: ${escape(m.description)}</p><p>“${escape(m.evidenceQuote)}”</p><small>${escape(m.qualification)}</small></article>`).join('')}
 <h3>Content Credentials / cryptographic provenance</h3><p class="muted">${escape(h.cryptographicProvenance.status)}. ${escape(h.cryptographicProvenance.qualification)} ${link(h.cryptographicProvenance.reference,'About C2PA and Content Credentials')}</p>
 ${h.identity?`<p class="muted">Exact-file SHA-256: <code>${escape(h.identity.digest)}</code><br>${escape(h.identity.qualification)}</p>`:''}
 <ul class="report-list">${h.limitations.map(x=>`<li>${escape(x)}</li>`).join('')}</ul></section>`;
}
