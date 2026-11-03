importScripts('shared.js');
const SETTINGS_KEY='cl_settings_v2',LIBRARY_KEY='cl_library_v2',DIAG_KEY='cl_diagnostics_v1',MAX_SCENES=500;
const read=keys=>chrome.storage.local.get(keys),put=data=>chrome.storage.local.set(data);
let work=Promise.resolve(),bridgeLimitReached=false;
async function diagnose(status,detail='') {
  const stored=await read([DIAG_KEY]),entries=Array.isArray(stored[DIAG_KEY])?stored[DIAG_KEY]:[];
  entries.unshift({time:new Date().toISOString(),status:String(status).slice(0,65),detail:String(detail).slice(0,175)});
  await put({[DIAG_KEY]:entries.slice(0,12)});
}
// Preserve existing UUIDs and account counts. A generated name is not proof
// that two saved groups should be merged, even when their keys collide.
function reconcileLibrary(library) {
  let changed=false;
  for(const scene of Object.values(library))if(scene?.concept?.viralKey) {
    const key=clCanonicalIdentity(scene.concept.viralKey);
    if(key&&key!==scene.concept.viralKey){scene.concept.viralKey=key;changed=true;}
  }
  return changed;
}
function findMotifCandidate(v,library) {
  return v?.specificity==='specific'&&v.visualConfirmed&&v.verification?.status==='matched'&&
    v.matchConfidence>=.84&&['same-action-format','same-event','same-meme-template','same-specific-subject'].includes(v.matchBasis)&&
    new Set(v.verification.sharedCues||[]).size>=2&&!(v.verification.conflicts||[]).length&&library[v.matchId]
    ?v.matchId:null;
}
function safeOriginTraceUrl(setting,payload) {
  let url;try{url=new URL(setting);}catch{throw Error('Invalid OriginTrace URL.');}
  if(!['https:','http:'].includes(url.protocol))throw Error('OriginTrace must use HTTP(S).');
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Use HTTPS for remote OriginTrace.');
  url.searchParams.set('url',String(payload.postUrl||'').slice(0,1200));
  url.searchParams.set('caption',String(payload.caption||'').slice(0,1600));url.searchParams.set('from','contextlens');return url.href;
}
function addAccount(scene,account,postUrl,caption) {
  scene.accounts=scene.accounts||[];
  if(!scene.accounts.some(x=>x.account===account))scene.accounts.push({account,postUrl:String(postUrl||'').slice(0,500),caption:String(caption||'').slice(0,500),time:Date.now()});
}
function bestScene(samples,library) {
  let best=null;
  for(const [id,scene]of Object.entries(library))for(const prior of [scene.samples,...(scene.sampleSets||[])]) {
    const result=clCompareSamples(samples,prior);
    if(result&&(!best||result.score<best.score))best={id,...result};
  }
  return best;
}
async function bridgeRequest(path,settings,payload) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),28000);
  try {
    const response=await fetch('http://127.0.0.1:8766'+path,{method:'POST',headers:{'Content-Type':'application/json','X-ContextLens-Token':settings.bridgeToken},body:JSON.stringify(payload),signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const e=Error(`AI HTTP ${response.status}: ${String(data.error||'Request rejected').slice(0,95)}`);e.localQuota=data.code==='local-budget-exhausted';throw e;}
    return data;
  }finally{clearTimeout(timer);}
}
async function identifyMotif(settings,library,media) {
  if(!settings.aiEnabled||!settings.shareFrame||!settings.bridgeToken||media.imageDataUrls.length<2)return null;
  if(bridgeLimitReached) {
    const health=await fetch('http://127.0.0.1:8766/health',{signal:AbortSignal.timeout(3000)}).then(r=>r.json()).catch(()=>({remaining:0}));
    if(!health.remaining)return {quotaExhausted:true};bridgeLimitReached=false;
  }
  try {
    // Each phase is a separate fetch below Chrome's service-worker fetch deadline.
    const observation=await bridgeRequest('/api/describe',settings,{...media,caption:String(media.caption||'').slice(0,800),postUrl:String(media.postUrl||'').slice(0,500),imageDataUrls:media.imageDataUrls.slice(0,8)});
    if(!CL_TOPICS.includes(observation.topic))throw Error('Invalid AI category');
    const candidates=Object.entries(library).filter(([,v])=>v.concept?.specificity==='specific').slice(0,MAX_SCENES)
      .map(([id,v])=>({id,...v.concept,audioId:v.audioId||'',audioTitle:v.audioTitle||'',priorCaptions:(v.accounts||[]).slice(-2).map(x=>String(x.caption||'').slice(0,150))}));
    const result=observation.specificity==='specific'&&candidates.length
      ?await bridgeRequest('/api/match',settings,{evidenceId:observation.evidenceId,audioId:media.audioId||'',candidates})
      :{...observation,verification:{status:'distinct',reason:'First observed specific target.',sharedCues:[],conflicts:[]}};
    await diagnose('AI observed and verified',`${result.label||'Unknown'} / ${result.verification?.status||result.specificity} / ${result.analysis?.frameCount||0} frames`);
    return result;
  }catch(error) {
    if(error.localQuota){bridgeLimitReached=true;await diagnose('AI budget exhausted','Semantic matching paused; existing groups remain available.');return {quotaExhausted:true};}
    await diagnose('AI request failed',error.message);return null;
  }
}
function conceptOf(v) {
  const fields=['topic','format','keyword','label','action','visualEvidence','specificity','viralKey','identityScope','aliases','entities','distinctiveCues','ocrText','semanticDescription','evidenceId','inferenceVersion'];
  return Object.fromEntries(fields.filter(k=>v[k]!==undefined).map(k=>[k,v[k]]));
}
async function register({account,samples,caption='',postUrl='',imageDataUrls=[],frameTimes=[],audioId='',audioTitle=''}) {
  const state=await read([SETTINGS_KEY,LIBRARY_KEY]),settings={...CL_DEFAULTS,...(state[SETTINGS_KEY]||{})},library=state[LIBRARY_KEY]||{};
  if(!settings.enabled)return {ok:false,status:'disabled',reason:'ContextLens is disabled.'};
  if(reconcileLibrary(library))await put({[LIBRARY_KEY]:library});
  const normalized=clNormalizeAccount(account);
  if(!normalized)return {ok:false,reason:'Account not identified; no blur applied.'};
  if(!Array.isArray(samples)||samples.length<2||samples.length>8||samples.some(s=>!/^[0-9a-f]{16}$/.test(s?.hash||'')))return {ok:false,reason:'Not enough distinct video frames; no blur applied.'};
  const exact=bestScene(samples,library);let sceneId=exact?.id||null,identified=null,matchingMode=exact?'matching-footage':'new-video';
  if(!sceneId) {
    identified=await identifyMotif(settings,library,{caption,postUrl,imageDataUrls,frameTimes,audioId,audioTitle});
    if(identified?.quotaExhausted)return {ok:false,status:'budget-exhausted',reason:'Local Meta-call limit reached — not counted.'};
    if(!identified&&settings.aiEnabled&&settings.shareFrame&&settings.bridgeToken)return {ok:false,retryable:true,reason:imageDataUrls.length<2?'Video frames unavailable — not counted.':'AI unavailable — not counted. Click Retry.'};
    if(identified?.specificity==='insufficient'||identified?.verification?.status==='uncertain')return {ok:false,status:'unclassified',reason:'Insufficient evidence for a reliable identity — not counted.'};
    sceneId=findMotifCandidate(identified,library);
    if(sceneId)matchingMode='same-specific-viral-content';
  }
  if(!sceneId)sceneId=crypto.randomUUID();
  const hint=identified?{topic:identified.topic,context:identified.context,evidence:identified.evidence,provider:identified.provider}:clOfflineHint(caption);
  const scene=library[sceneId]||{samples,accounts:[],createdAt:Date.now(),hint,concept:identified?conceptOf(identified):null};
  if(identified) {
    if(!scene.concept)scene.concept=conceptOf(identified);
    else {
      scene.concept.aliases=[...new Set([...(scene.concept.aliases||[]),...(identified.aliases||[])])].slice(0,12);
      scene.concept.evidenceId=identified.evidenceId;
      if(scene.concept.format!=='Challenge'&&identified.format==='Challenge')scene.concept.format='Challenge';
    }
    scene.hint=hint;
    scene.lastDecision={mode:matchingMode,...identified.verification,time:Date.now()};
  }
  if(exact)scene.lastDecision={mode:'matching-footage',reason:'Ordered perceptual fingerprints and coarse colour layout match previously observed footage. This is an approximate visual match.',time:Date.now()};
  scene.sampleSets=scene.sampleSets||[];
  if(!exact)scene.sampleSets.push(samples);
  scene.sampleSets=scene.sampleSets.slice(-4);
  if(!scene.audioId&&/^[0-9]{3,30}$/.test(String(audioId)))scene.audioId=String(audioId);
  if(!scene.audioTitle&&audioTitle)scene.audioTitle=String(audioTitle).slice(0,120);
  addAccount(scene,normalized,postUrl,caption);scene.updatedAt=Date.now();library[sceneId]=scene;
  const entries=Object.entries(library).sort((a,b)=>(a[1].updatedAt||0)-(b[1].updatedAt||0));
  for(const [oldId]of entries.slice(0,Math.max(0,entries.length-MAX_SCENES)))delete library[oldId];
  await put({[LIBRARY_KEY]:library});
  const count=scene.accounts.length,fold=count>=clClampThreshold(settings.threshold)&&!(settings.alwaysShow||[]).includes(sceneId);
  return {ok:true,sceneId,count,fold,scene,hint:scene.hint,concept:scene.concept,matchingMode,matchedFrames:exact?.matchedFrames||0};
}
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  if(msg?.type==='CL_REGISTER') {
    if(!sender.url||!(/^https:\/\/www\.instagram\.com\//.test(sender.url)||/^http:\/\/127\.0\.0\.1:8765\//.test(sender.url))){respond({ok:false,reason:'Unsupported page'});return false;}
    work=work.catch(()=>{}).then(()=>register(msg));work.then(respond).catch(e=>respond({ok:false,reason:String(e.message||e)}));return true;
  }
  if(msg?.type==='CL_DIAGNOSTICS') {
    read([DIAG_KEY,LIBRARY_KEY]).then(d=>respond({ok:true,items:d[DIAG_KEY]||[],groups:Object.keys(d[LIBRARY_KEY]||{}).length})).catch(e=>respond({ok:false,error:e.message}));return true;
  }
  if(msg?.type==='CL_ORIGINTRACE') {
    read([SETTINGS_KEY]).then(s=>chrome.tabs.create({url:safeOriginTraceUrl({...CL_DEFAULTS,...s[SETTINGS_KEY]}.originTraceUrl,msg)})).then(()=>respond({ok:true})).catch(e=>respond({ok:false,error:e.message}));return true;
  }
  return false;
});
