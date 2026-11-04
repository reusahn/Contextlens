const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const point=(i,r)=>[210+Math.sin(i*Math.PI/3)*r,186-Math.cos(i*Math.PI/3)*r];
const points=r=>Array.from({length:6},(_,i)=>point(i,r).map(n=>n.toFixed(2)).join(',')).join(' ');
export function renderCategoryReport(report){
 if(!report)return '<p class="muted">This saved report predates category analysis. Run a new investigation to add category tags.</p>';
 const axes=Array.isArray(report.axes)&&report.axes.length===6?report.axes.map(a=>({...a,share:Math.max(0,Math.min(100,Number(a.share)||0))})):[];
 const formats=Array.isArray(report.formats)?[...report.formats].sort((a,b)=>b.share-a.share):[];
 const ready=report.status==='classified'&&axes.length===6&&formats.length>0;
 const chart=axes.length===6?`<svg class="category-radar" viewBox="0 0 420 390" role="img" aria-labelledby="category-chart-title category-chart-desc">
 <title id="category-chart-title">Content format relevance</title><desc id="category-chart-desc">${esc(ready?axes.map(a=>`${a.label}: ${a.share}%`).join('; '):'No category proportions available. An empty grid is shown.')}. Each axis runs from zero at the center to 100 percent at the edge. Exact values are listed beside the chart.</desc>
 ${[.25,.5,.75,1].map(scale=>`<polygon class="radar-grid" points="${points(110*scale)}"/>`).join('')}
 ${axes.map((a,i)=>{const [x,y]=point(i,110);return `<line class="radar-spoke" x1="210" y1="186" x2="${x}" y2="${y}"/>`;}).join('')}
 ${ready?`<polygon class="radar-area" points="${axes.map((a,i)=>point(i,110*a.share/100).join(',')).join(' ')}"/>`:''}
 ${axes.map((a,i)=>{const [x,y]=point(i,151);const [nx,ny]=point(i,110*a.share/100);return `${ready?`<circle class="radar-node" cx="${nx}" cy="${ny}" r="4"><title>${esc(a.label)}: ${a.share}%</title></circle>`:''}<text class="radar-label" x="${x}" y="${y}" text-anchor="middle">${esc(a.label)}<tspan x="${x}" dy="18" class="radar-value">${ready?a.share+'%':'—'}</tspan></text>`;}).join('')}
 <text class="radar-scale" x="217" y="174">0</text><text class="radar-scale" x="217" y="91">75</text>
 </svg>`:'';
 return `<div class="category-heading"><div><span class="category-eyebrow">CONTENT PROFILE</span><h3>What kind of content is this?</h3></div><span class="category-subject">${esc(report.subject||'Other')}</span></div>
 <p>${esc(report.summary)}</p><p class="category-basis">${esc(report.basis)} · ${report.method==='model-relative-weights'?'Model estimate':'Text cue estimate'}</p>
 <div class="category-layout"><figure class="category-figure">${chart}<figcaption>Six format families · fixed 0–100% scale</figcaption></figure><div class="category-details">
 ${ready?`<h4>Related format tags</h4><ol class="category-tags">${formats.map(f=>{const share=Math.max(0,Math.min(100,Number(f.share)||0));return `<li><div class="category-tag-row"><strong>${esc(f.tag)}</strong><span>${share}%</span></div><div class="category-meter" aria-hidden="true"><span style="width:${share}%"></span></div><p>${esc(f.reason)}</p></li>`;}).join('')}</ol>`:'<div class="category-empty"><strong>Classification pending evidence</strong><p>Provide a descriptive caption or transcript, or analyze accessible video frames. A URL alone does not establish content format.</p></div>'}
 </div></div><p class="category-qualification">${esc(report.qualification)}</p><details class="category-taxonomy"><summary>Explore the tag list and chart families</summary><p>Subject tags describe what the clip is about. Format tags describe how it is presented; multiple formats can apply.</p><ul>${(report.taxonomy?.families||[]).map(f=>`<li><strong>${esc(f.label)}:</strong> ${esc(f.tags.join(', '))}</li>`).join('')}</ul><p>Other is reserved for unsupported formats and does not receive an invented chart share.</p><p><strong>Subjects:</strong> ${esc((report.taxonomy?.subjects||[]).join(', '))}</p></details>`;
}
