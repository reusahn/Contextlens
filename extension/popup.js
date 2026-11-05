const defaults = {...CL_DEFAULTS};
const el=id=>document.getElementById(id);
function groupLabels(scene) {
  const concept=scene.concept || {};
  const slick=concept.viralKey==='slick-back-glide';
  return {
    keyword:slick ? 'Slick Back' : String(concept.keyword || concept.label || 'Unidentified clip').slice(0,60),
    format:slick ? 'Challenge' : String(concept.format || 'Other').slice(0,32),
    category:clCategoryLabel(concept),
    subject:String(scene.hint?.topic || concept.topic || 'Other').slice(0,40)
  };
}
async function renderGroups() {
  const data=await chrome.storage.local.get(['cl_library_v2','cl_settings_v2']);
  const settings={...defaults,...data.cl_settings_v2},unit=clCountUnit(settings),threshold=Number(settings.threshold || 3);
  const scenes=Object.values(data.cl_library_v2 || {}).filter(v=>v?.concept?.specificity!=='insufficient');
  const total=scenes.reduce((a,v)=>a+clSceneCount(v,settings),0);
  el('stats').textContent=`${scenes.length} tracked groups · ${total} unique ${unit}`;

  const container=el('groupList');
  container.replaceChildren();
  if(!scenes.length){
    const empty=document.createElement('div');empty.className='group-empty';
    empty.textContent='No recognized viral content yet.';container.append(empty);return;
  }
  scenes.sort((a,b)=>clSceneCount(b,settings)-clSceneCount(a,settings) || (b.updatedAt||0)-(a.updatedAt||0));
  for(const scene of scenes.slice(0,6)) {
    const info=groupLabels(scene), count=clSceneCount(scene,settings);
    const item=document.createElement('div');item.className='group-item';
    const line=document.createElement('div');line.className='group-line';
    const keyword=document.createElement('span');keyword.className='group-title';keyword.textContent=info.category;
    const number=document.createElement('span');number.className='group-count';number.textContent=`${count}/${threshold}`;
    line.append(keyword,number);
    const detail=document.createElement('div');detail.className='group-tags';
    detail.textContent=`Tracking: ${info.keyword} · ${info.subject} · ${info.format} · ${count} ${unit}`;
    item.append(line,detail);container.append(item);
  }
}

async function load() {
  const data=await chrome.storage.local.get(['cl_settings_v2','cl_library_v2']);
  const s={...defaults,...data.cl_settings_v2};
  for (const name of ['enabled','aiEnabled','shareFrame']) el(name).checked=!!s[name];
  for (const name of ['bridgeToken','originTraceUrl']) el(name).value=s[name]||'';
  el('threshold').value=s.threshold;el('nValue').textContent=s.threshold;
  el('countUnit').value=clCountUnit(s);el('unitLabel').textContent=clCountUnit(s)==='posts'?'Unique posts (N)':'Unique accounts (N)';
  await renderGroups();
}
async function diagnostics() {
  await renderGroups();
  const local=await chrome.storage.local.get(['cl_diagnostics_v1']);
  const lines=(local.cl_diagnostics_v1||[]).slice(0,6).map(e=>{
    const date=new Date(e.time),hhmm=Number.isNaN(date.getTime())?'--:--':date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
    return `${hhmm} · ${e.status}\n${e.detail}`;
  });
  el('diagnostics').textContent=lines.length?lines.join('\n\n'):'No video classifications yet. Watch two or more clips, then refresh.';
  try {
    const res=await fetch('http://127.0.0.1:8766/health');
    if(!res.ok)throw Error(`HTTP ${res.status}`);
    const data=await res.json();
    el('bridgeStatus').textContent=`Local bridge: ${data.status || 'unknown'} · Key configured: ${data.keyConfigured?'yes':'no'} · Meta calls remaining: ${data.remaining ?? '?'}`+
      (data.remaining===0?' · Local call limit reached: new semantic matches paused.':'')+
      (data.pipeline==='observe-retrieve-verify-v3-temporal'?' · Temporal verification v3':' · Restart the updated bridge for temporal verification v3.');
  } catch {el('bridgeStatus').textContent='Local bridge unreachable (check Terminal: node server.js).';}
}
el('refreshDiagnostics').addEventListener('click',diagnostics);
el('threshold').addEventListener('input',()=>el('nValue').textContent=el('threshold').value);
el('countUnit').addEventListener('change',()=>el('unitLabel').textContent=el('countUnit').value==='posts'?'Unique posts (N)':'Unique accounts (N)');
el('save').addEventListener('click',async()=>{
  const old=(await chrome.storage.local.get(['cl_settings_v2'])).cl_settings_v2 || {};
  const url=el('originTraceUrl').value.trim();
  try {
    const u=new URL(url);
    if(u.protocol!=='https:' && !(u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)))throw Error();
  } catch {el('notice').textContent='Enter a valid HTTPS or localhost OriginTrace URL.';return;}
  await chrome.storage.local.set({cl_settings_v2:{...old,enabled:el('enabled').checked,threshold:Number(el('threshold').value),countUnit:el('countUnit').value,aiEnabled:el('aiEnabled').checked,shareFrame:el('shareFrame').checked,bridgeToken:el('bridgeToken').value.trim(),originTraceUrl:url}});
  el('notice').textContent='Settings saved. Reload Instagram tabs to rescan existing videos.';await diagnostics();
});
el('reset').addEventListener('click',async()=>{await chrome.storage.local.set({cl_library_v2:{},cl_diagnostics_v1:[]});el('notice').textContent='All counts cleared. Reload Instagram tabs to analyze again.';await load();await diagnostics();});
load();
diagnostics();
