import {renderReportView,bindReportDisclosure} from './reportView.js';
const $=id=>document.getElementById(id);
let inputMode='url';const reportHistory=[];
function setMode(mode){inputMode=mode;for(const m of ['url','upload']){$(m+'Pane').hidden=m!==mode;$(m+'Tab').classList.toggle('selected',m===mode);$(m+'Tab').setAttribute('aria-selected',String(m===mode));}}
$('urlTab').onclick=()=>setMode('url');$('uploadTab').onclick=()=>setMode('upload');
$('videoFile').onchange=()=>{$('fileName').textContent=$('videoFile').files[0]?.name||'';};
const drop=$('dropzone');for(const event of ['dragover','dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.toggle('dragover',event==='dragover');if(event==='drop'&&e.dataTransfer.files.length){$('videoFile').files=e.dataTransfer.files;$('fileName').textContent=e.dataTransfer.files[0].name;}});
for(const btn of document.querySelectorAll('.nav-item'))btn.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b===btn));for(const v of ['analyze','reports','method'])$(v+'View').hidden=btn.dataset.view!==v;});
async function checkHealth(){try{const r=await fetch('/api/health');if(!r.ok)throw Error();const h=await r.json();$('apiStatus').textContent=`Server ready · AI ${h.vision?'on':'off'} · Search ${h.search?'on':'off'}${h.capabilities&&!h.capabilities.ffmpeg?' · FFmpeg missing':''}${h.capabilities&&!h.capabilities.platformExtractor?' · yt-dlp missing':''}${h.budget?.blocked?' · AI blocked: '+h.budget.reason:''}`;$('apiDot').classList.toggle('off',Boolean(h.budget?.blocked));}catch{$('apiStatus').textContent='Backend offline';$('apiDot').classList.add('off');}}checkHealth();
function renderReport(r){
 $('report').innerHTML=renderReportView(r);
 bindReportDisclosure($('report'));
 $('report').hidden=false;$('exportReport').onclick=()=>{const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='origintrace-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);};
}
$('analyzeForm').addEventListener('submit',async e=>{
 e.preventDefault();$('error').hidden=true;$('report').hidden=true;
 const fd=new FormData();fd.append('caption',$('captionInput').value.trim());fd.append('transcript',$('transcriptInput').value.trim());if(inputMode==='url'){const url=$('urlInput').value.trim();if(!url){$('error').textContent='Please enter a video URL.';$('error').hidden=false;return;}fd.append('url',url);}else{const file=$('videoFile').files[0];if(!file){$('error').textContent='Please select a video.';$('error').hidden=false;return;}fd.append('video',file);}
 $('loading').hidden=false;$('analyzeButton').disabled=true;
 try{const response=await fetch('/api/analyze',{method:'POST',body:fd});const result=await response.json();if(!response.ok)throw new Error(result.error+(result.details?`: ${result.details}`:''));renderReport(result);reportHistory.unshift(result);$('reportCount').textContent=String(reportHistory.length);renderArchive();$('report').scrollIntoView({behavior:'smooth',block:'start'});}catch(err){$('error').textContent=err.message;$('error').hidden=false;}finally{checkHealth();$('loading').hidden=true;$('analyzeButton').disabled=false;}
});
function renderArchive(){const list=$('reportList');list.replaceChildren();if(!reportHistory.length){list.textContent='No reports in this session yet.';return;}reportHistory.forEach((r,i)=>{const b=document.createElement('button');const title=document.createElement('strong');title.textContent=r.input.filename||r.input.url||`Report ${i+1}`;const date=document.createElement('small');date.textContent=`${new Date(r.generatedAt).toLocaleString()} · ${r.status}`;b.append(title,date);b.onclick=()=>{document.querySelector('[data-view="analyze"]').click();renderReport(r);$('report').scrollIntoView({behavior:'smooth'});};list.append(b);});}renderArchive();

// ContextLens deep-link handoff: prefill only, no automatic investigation or upload.
// The person reviewing the content explicitly decides when to submit to OriginTrace.
(() => {
  const p = new URLSearchParams(location.search);
  if (p.get('from') !== 'contextlens') return;
  const inputUrl = p.get('url') || '';
  const caption = p.get('caption') || '';
  try {
    const parsed = new URL(inputUrl);
    if (['https:', 'http:'].includes(parsed.protocol) && inputUrl.length <= 1200) {
      $('urlInput').value = inputUrl;
      setMode('url');
    }
  } catch {}
  if (caption && caption.length <= 2000) $('captionInput').value = caption;
})();
