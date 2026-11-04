/* ContextLens v1.0 — stable motif tracking and evidence statuses; visual-first specific viral motif matching.
 * Never scrapes feeds in bulk, auto-scrolls, or downloads Instagram media.
 * Unreadable frames, unknown accounts, and uncertain matches are left visible.
 */
(() => {
  const ACCOUNT_BUILD = 'account-depth32-2026-11-04';
  const ACCOUNT_MAX_DEPTH = 32;
  console.info('[ContextLens] Loaded', ACCOUNT_BUILD, chrome.runtime.id);
  const DEFAULT = {enabled: true, threshold: 3, aiEnabled: false, alwaysShow: []};
  let settings = DEFAULT;
  let library = {};
  const observed = new WeakSet();
  const liveVideos = new Set();
  const states = new WeakMap();
  const id = 'cl_' + Math.random().toString(36).slice(2);
  const blockedPaths = new Set(['reels', 'reel','explore','stories','p','direct','accounts','about','legal','developer','privacy']);
  function userFromHref(href) {
    try {
      const url = new URL(href, location.href);
      if (url.hostname !== location.hostname) return '';
      const chunks = url.pathname.split('/').filter(Boolean);
      const profilePath = chunks.length === 1 || (chunks.length === 2 && chunks[1].toLowerCase() === 'reels');
      if (!profilePath || blockedPaths.has(chunks[0].toLowerCase())) return '';
      return /^[a-zA-Z0-9._]{1,30}$/.test(chunks[0]) ? chunks[0].toLowerCase() : '';
    } catch { return ''; }
  }
  function findContainer(video) {
    return video.closest('[data-cl-post]') || video.closest('article') ||
      video.closest('div[role="presentation"]') || video.parentElement?.parentElement || video.parentElement;
  }
  function accountOf(video, wrapper) {
    const labeled = video.closest('[data-cl-post]')?.getAttribute('data-cl-account');
    if (labeled && /^[a-zA-Z0-9._]{1,30}$/.test(labeled)) return labeled.toLowerCase();
    // For Instagram, only trust usernames linked from the post's own header.
    const article = video.closest('article');
    const header = article?.querySelector('header');
    const sources = [header, article?.querySelector('div[role="button"] a[href]')];
    for (const root of sources) {
      if (!root) continue;
      const links = root.matches?.('a[href]') ? [root] : [...root.querySelectorAll('a[href]')];
      for (const link of links) {
        const name = userFromHref(link.href);
        if (name) return name;
      }
    }
    // Reels can put the creator beside several nested video wrappers. Walk
    // outward, but never search the page or a container spanning other players.
    for (let el=video.parentElement, depth=0; el && depth<ACCOUNT_MAX_DEPTH; el=el.parentElement, depth++) {
      if (el.matches('body, main, [role="main"]') || el.querySelectorAll('video').length!==1) break;
      const list = el.querySelectorAll('a[href]');
      for (const link of list) {
        // Comment authors and mentions are not evidence of the posting account.
        if (link.closest('ul, [role="list"]') &&
            !link.closest('header')) continue;
        const name = userFromHref(link.href);
        const label=String(link.textContent||'').trim().replace(/^@/,'').toLowerCase();
        if (name && (label===name || link.closest('header'))) return name;
      }
      if (el===article) break;
    }
    return '';
  }
  function postUrlOf(video, wrapper) {
    const explicit = video.closest('[data-cl-post]')?.dataset.clUrl;
    if (explicit) return explicit;
    const direct = video.closest('article')?.querySelector('a[href*="/reel/"], a[href*="/p/"]') || wrapper?.querySelector?.('a[href*="/reel/"], a[href*="/p/"]');
    try { if (direct?.href) return new URL(direct.href, location.href).href; } catch {}
    return location.href;
  }
  function captionOf(video, wrapper) {
    const explicit = video.closest('[data-cl-post]')?.dataset.clCaption;
    if (explicit) return explicit.slice(0, 500);
    const article = video.closest('article');
    const captionNode = article?.querySelector('h1') || article?.querySelector('ul li span') || wrapper?.querySelector('[data-cl-caption]');
    return (captionNode?.textContent || '').trim().slice(0, 500);
  }
  function fingerprintFrame(video) {
    if (video.readyState < 2 || video.videoWidth < 24 || video.videoHeight < 24) return null;
    try {
      const c = document.createElement('canvas'); c.width = 9; c.height = 8;
      const ctx = c.getContext('2d', {willReadFrequently:true});
      ctx.drawImage(video, video.videoWidth * .1, video.videoHeight * .1,
        video.videoWidth * .8, video.videoHeight * .8, 0,0,9,8);
      const p = ctx.getImageData(0,0,9,8).data;
      let bits='', brightness=0, min=255,max=0;
      const grey=[];
      for (let i=0;i<72;i++) {
        const j=i*4, g=Math.round(p[j]*.299+p[j+1]*.587+p[j+2]*.114);
        grey.push(g); brightness+=g; min=Math.min(min,g); max=Math.max(max,g);
      }
      if (max-min<22) return null;  // blank / uniform scenes are not evidence.
      for(let y=0;y<8;y++) for(let x=0;x<8;x++) bits += grey[y*9+x]>grey[y*9+x+1]?'1':'0';
      if (bits==='0'.repeat(64) || bits==='1'.repeat(64)) return null;
      const signature=[];
      for(let y=0;y<4;y++)for(let x=0;x<4;x++){const n=(y*2*9+x*2)*4;signature.push(p[n],p[n+1],p[n+2]);}
      return {hash:BigInt('0b'+bits).toString(16).padStart(16,'0'),luma:Math.round(brightness/72),signature,time:video.currentTime};
    } catch { return null; /* video frame inaccessible: no auto-blur */ }
  }
  function samplePreview(video) {
    if (!settings.aiEnabled || !settings.shareFrame || !video.videoWidth) return '';
    try {
      const c=document.createElement('canvas'),scale=Math.min(1,512/Math.max(video.videoWidth,video.videoHeight));
      c.width=Math.max(1,Math.round(video.videoWidth*scale));c.height=Math.max(1,Math.round(video.videoHeight*scale));
      const ctx=c.getContext('2d');ctx.drawImage(video,0,0,c.width,c.height);
      let result=c.toDataURL('image/jpeg',.72);
      if(result.length>149000)result=c.toDataURL('image/jpeg',.48);
      return result.length<=149000?result:'';
    } catch { return ''; }
  }
  // Audio is metadata provided by the post UI, not extracted from the actual audio waveform.
  // The identity can corroborate a visually observed named trend, but is NOT
  // sufficient on its own to count unrelated videos featuring one soundtrack.
  function audioOf(video, wrapper) {
    const test=video.closest('[data-cl-post]');
    const title=String(test?.getAttribute('data-cl-audio-title')||'').trim().slice(0,120);
    const directId=String(test?.getAttribute('data-cl-audio-id')||'').trim();
    if (title || /^[0-9]{3,30}$/.test(directId)) return {title,id:/^[0-9]{3,30}$/.test(directId)?directId:''};
    const article=video.closest('article')||wrapper;
    const audioLink=article?.querySelector?.('a[href*="/reels/audio/"],a[href*="/audio/"]');
    if (!audioLink) return {title:'',id:''};
    let id='';
    try{const m=new URL(audioLink.href,location.href).pathname.match(/\/(?:reels\/)?audio\/(\d+)/);id=m?.[1]||'';}catch{}
    const candidate=String(audioLink.textContent||'').trim().slice(0,120);
    const titleText=/^(original audio|audio unavailable)$/i.test(candidate)?'':candidate;
    return {title:titleText,id};
  }
  function statusBadge(st, text, kind='neutral') {
    if (!st.container?.isConnected) return;
    if(!st.badge){st.badge=document.createElement('div');st.badge.className='cl-count-badge';CLOverlay.attach(st.video).appendChild(st.badge);}
    st.badge.className='cl-count-badge'+(kind==='muted'?' cl-muted-badge':'');
    st.badge.textContent='◉ ContextLens · '+text;
    st.badge.title=st.reason||'ContextLens checks specific viral phenomena, not broad topics.';
  }
  function makeButton(text, klass, fn) {
    const b=document.createElement('button'); b.type='button';b.textContent=text;b.className=klass;
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();fn();});return b;
  }
  function clearWidgets(video) {
    const st=states.get(video); if (!st) return;
    st.badge?.remove(); st.fold?.remove(); st.badge=null; st.fold=null;st.drawSignature='';CLOverlay.remove(video);
    video.classList.remove('cl-video-blurred');
  }
  // Subject, format, and keyword are intentionally independent metadata.
  // Neither a broad subject nor the format alone can merge two viral groups.
  function sceneMetadata(scene) {
    const concept=scene.concept || {};
    const hint=scene.hint || {};
    const key=String(concept.viralKey||'');
    return {
      subject: String(hint.topic || concept.topic || 'Other').slice(0,40),
      format: key==='slick-back-glide' ? 'Challenge' : String(concept.format || 'Other').slice(0,32),
      // The precise key remains private/internal to the matching algorithm.
      keyword: key==='slick-back-glide' ? 'Slick Back' : String(concept.keyword || concept.label || 'Unidentified clip').slice(0,70)
    };
  }
  function getScene(st) {
    if(!st?.sceneId) return null;
    if(library[st.sceneId])return library[st.sceneId];
    const alias=Object.entries(library).find(([,scene])=>(scene.aliasIds||[]).includes(st.sceneId));
    if(!alias)return null;
    st.sceneId=alias[0];
    return alias[1];
  }
  function sceneShouldBlur(st, scene) {
    return !!(scene && settings.enabled && (scene.accounts||[]).length>=Number(settings.threshold||3) &&
      !(settings.alwaysShow||[]).includes(st.sceneId) && !st.show);
  }
  // Keep the button callback independent of the overlay DOM. Once clicked,
  // the overlay is removed by draw(), but the current video remains available.
  function revealVideo(video) {
    const st=states.get(video);
    if(!st) return;
    st.show=true;
    try {
      draw(video);
      // Resume only after an explicit user click, never while the blur is active.
      if(video.paused && typeof video.play==='function')Promise.resolve(video.play()).catch(()=>{});
    } catch(error) {
      // Never keep someone's video blurred after a display-layer error.
      console.warn('[ContextLens] Could not update reveal overlay:',error);
      video.classList.remove('cl-video-blurred');
      st.fold?.remove();st.fold=null;
    }
  }
  function draw(video) {
    const st=states.get(video); if (!st || !st.sceneId) return;
    const scene=getScene(st);
    if (!scene) {clearWidgets(video);st.sceneId='';st.samples=[];return;}
    const count = (scene.accounts || []).length;
    const threshold=Number(settings.threshold || 3);
    const meta=sceneMetadata(scene);
    const active = sceneShouldBlur(st,scene);
    const container=st.container;
    if(!container?.isConnected) return;

    // A solitary unrelated post should not appear to reset a previously
    // recognized trend from 2/3 to 1/3. Show progress on-video from 2/3;
    // all individual group counts remain visible in the popup.
    if (count>=2) statusBadge(st,`${meta.format} · ${Math.min(count,threshold)}/${threshold} accounts`);
    else statusBadge(st,`${meta.format} · tracking`,'muted');
    st.badge.title=`Subject: ${meta.subject} | Format: ${meta.format} | Group-local account count: ${count}`;
    if(!active) {video.classList.remove('cl-video-blurred');st.fold?.remove();st.fold=null;st.drawSignature='';return;}
    video.classList.add('cl-video-blurred');
    // At N, halt playback/autoplay as well as applying the visual blur.
    try {if(!video.paused && typeof video.pause==='function')video.pause();} catch {}
    if(!st.fold){
      st.fold=document.createElement('section');
      st.fold.className='cl-context-card';
      st.fold.setAttribute('aria-label','ContextLens repeated viral content');
      st.fold.setAttribute('role','group');
      CLOverlay.attach(video).appendChild(st.fold);
    }
    const hint=scene.hint||{topic:'Other',context:'Context not yet verified.',evidence:'Unverified'};
    const signature=JSON.stringify([count,threshold,meta,scene.hint,scene.lastDecision]);
    if(st.drawSignature===signature)return;
    st.drawSignature=signature;
    st.fold.replaceChildren();
    const pill=document.createElement('div');pill.className='cl-kicker';pill.textContent='REPEATED VIRAL CONTENT';
    const title=document.createElement('div');title.className='cl-title';title.textContent=meta.format;
    const badges=document.createElement('div');badges.className='cl-tags';
    const subjectTag=document.createElement('span');subjectTag.className='cl-category cl-subject';subjectTag.textContent=meta.subject;
    badges.append(subjectTag);
    const countRow=document.createElement('div');countRow.className='cl-account-row';
    countRow.textContent=`Seen on ${Math.min(count,threshold)} / ${threshold} unique accounts`;
    const contextText = document.createElement('p');
    contextText.className = 'cl-context-text';
    contextText.textContent = String(hint.context || 'Original context not verified.');
    const evidence=document.createElement('div'); evidence.className='cl-evidence';
    evidence.textContent=hint.evidence || 'AI interpretation · Not verified';
    const actions=document.createElement('div');actions.className='cl-actions';
    actions.append(
      makeButton('Investigate in OriginTrace ↗','cl-primary',()=>{
        chrome.runtime.sendMessage({type:'CL_ORIGINTRACE',postUrl:st.postUrl,caption:st.caption},res=>{
          if(chrome.runtime.lastError || !res?.ok) {
            evidence.textContent='Unable to open OriginTrace. Check its URL in extension settings.';
          }
        });
      }),
      makeButton('Show video','cl-link',()=>revealVideo(video))
    );
    const why=document.createElement('details');why.className='cl-why';
    const summary=document.createElement('summary');summary.textContent='Why grouped?';
    const explanation=document.createElement('div');explanation.textContent=scene.lastDecision?.reason||'Two ordered visual samples match previously observed footage. Perceptual matching can make mistakes.';
    why.append(summary,explanation);
    st.fold.append(pill, title, badges, countRow, contextText, evidence, why, actions);
    CLOverlay.update();
  }
  function ingest(video, st) {
    if (st.working || st.retryable || st.unclassified || st.sceneId || st.samples.length<2) return;
    st.working=true;
    const sentAccount=st.account, sentPostUrl=st.postUrl, sentMediaSource=st.mediaSource,sentGeneration=st.generation;
    const ordered=st.previews.map((url,i)=>({url,time:st.previewTimes[i]})).sort((a,b)=>a.time-b.time);
    chrome.runtime.sendMessage({type:'CL_REGISTER',account:st.account,samples:st.samples.slice(0,8),
      caption:st.caption,postUrl:st.postUrl,imageDataUrls:ordered.map(x=>x.url),frameTimes:ordered.map(x=>x.time),
      audioId:st.audio.id,audioTitle:st.audio.title}, res=>{
      // An Instagram Reel can replace the media inside the same <video> element
      // while an async model request is pending. Never attach the old reply to
      // the newly displayed post.
      if(st.generation!==sentGeneration || st.account!==sentAccount || st.postUrl!==sentPostUrl || st.mediaSource!==sentMediaSource) return;
      st.working=false;
      if (chrome.runtime.lastError || !res?.ok) {
        st.reason=res?.reason||'Cannot inspect this clip';
        if(res?.status==='budget-exhausted') {
          st.unclassified=true;st.retryable=false;
          statusBadge(st,'AI limit reached · not counted','muted');return;
        }
        if(res?.status==='unclassified') {
          st.unclassified=true;
          st.retryable=false;
          statusBadge(st,'Unclassified · not counted','muted');
          return;
        }
        if(res?.retryable) {
          st.retryable=true;
          st.badge?.remove();
          const badge=document.createElement('button');badge.type='button';
          badge.className='cl-count-badge cl-retry-badge';
          badge.textContent='◉ ContextLens · AI unavailable · Retry';
          badge.title=st.reason;
          badge.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();
            st.retryable=false;st.reason='';badge.remove();st.badge=null;ingest(video,st);});
          st.badge=badge;
          if(st.container?.isConnected)CLOverlay.attach(video).appendChild(badge);
        }
        return;
      }
      st.badge?.remove();st.badge=null;st.retryable=false;st.unclassified=false;
      st.sceneId=res.sceneId;
      const scene=res.scene || library[res.sceneId] || {accounts:[] ,hint:res.hint,concept:res.concept};
      if(!scene.accounts.some(x=>x.account===st.account)) scene.accounts.push({account:st.account});
      library[res.sceneId]=scene;
      draw(video);
    });
  }
  function sample(video,st) {
    // Instagram may recycle video nodes during navigation. Recheck attribution.
    const nowContainer=findContainer(video)||st.container;
    const containerMoved=nowContainer!==st.container;
    if(containerMoved){clearWidgets(video);st.container=nowContainer;}
    const nowAccount=accountOf(video,st.container);
    const nowPostUrl=postUrlOf(video,st.container);
    const nowAudio=audioOf(video,st.container);
    const nowMediaSource=String(video.currentSrc||video.src||'').split('?')[0];
    if (nowAccount !== st.account || nowPostUrl!==st.postUrl || nowAudio.id!==st.audio.id || (nowMediaSource && st.mediaSource && nowMediaSource!==st.mediaSource)) {
      st.account=nowAccount; st.postUrl=nowPostUrl;st.mediaSource=nowMediaSource;st.audio=nowAudio;
      st.caption=captionOf(video,st.container);
      st.samples=[];st.previews=[];st.previewTimes=[];st.sceneId='';st.show=false;st.retryable=false;st.unclassified=false;st.reason='';st.firstSeenAt=Date.now();st.firstVisibleAt=0;st.generation++;st.working=false;clearWidgets(video);
    } else if(!st.mediaSource && nowMediaSource) st.mediaSource=nowMediaSource;
    st.audio=nowAudio;if(!st.working)st.caption=captionOf(video,st.container);
    if(containerMoved&&st.sceneId)draw(video);
    if (!settings.enabled || st.sceneId || st.retryable || st.unclassified || !st.container?.isConnected) return;
    const rect=typeof video.getBoundingClientRect==='function' ? video.getBoundingClientRect() : {width:0,height:0,bottom:0,top:0};
    const isVisible=rect.width>=120 && rect.height>=100 && rect.bottom>0 && rect.top<innerHeight && rect.right>0 && rect.left<innerWidth && !document.hidden && getComputedStyle(video).visibility!=='hidden';
    if(!isVisible){
      // Finish an already-observed clip when a user scrolls before eight frames.
      // Never capture new pixels from a hidden/off-screen video.
      if(st.samples.length>=2&&st.previews.length>=3&&!st.working)ingest(video,st);
      return;
    }
    if(!st.firstVisibleAt)st.firstVisibleAt=Date.now();
    if(!st.account) {
      if(isVisible && Date.now()-st.firstSeenAt>1800 && !st.working) {
        statusBadge(st,'Account unavailable · not counted','muted');
        if(!st.accountDiagnosticLogged) {
          st.accountDiagnosticLogged=true;
          const ancestors=[];
          for(let el=video.parentElement,depth=0;el && depth<ACCOUNT_MAX_DEPTH;el=el.parentElement,depth++) {
            ancestors.push({depth,tag:el.tagName,role:el.getAttribute('role'),
              videos:el.querySelectorAll('video').length,
              boundary:el.matches('body, main, [role="main"]'),
              links:[...el.querySelectorAll('a[href]')].slice(0,25).map(link=>({
                path:new URL(link.href,location.href).pathname,
                account:userFromHref(link.href),
                label:String(link.textContent||'').trim().slice(0,60),
                inList:!!link.closest('ul, [role="list"]'),inHeader:!!link.closest('header')
              }))});
            if(el.matches('body, main, [role="main"]'))break;
          }
          console.info('[ContextLens] Account lookup diagnostic',ACCOUNT_BUILD,JSON.stringify(ancestors));
        }
      }
      return;
    }
    if (video.paused && !video.srcObject && video.readyState<2) return;
    const value=fingerprintFrame(video);
    if(!value) {
      if(isVisible && Date.now()-st.firstSeenAt>5500 && !st.working)
        statusBadge(st,'Frames unavailable · not counted','muted');
      return;
    }
    if(st.samples.length<8 && st.samples.every(x=>Math.abs((x.time??-10)-video.currentTime)>=.5))st.samples.push(value);
    // Sample across playback time, not three near-identical frames at the start.
    const wantsVision=settings.aiEnabled && settings.shareFrame && !!settings.bridgeToken;
    const frameGoal=Number.isFinite(video.duration)?Math.min(8,Math.max(2,Math.floor(video.duration/.55))):8;
    if(wantsVision && st.previews.length<frameGoal &&
       st.previewTimes.every(t=>Math.abs(t-video.currentTime)>=.55)) {
      const frame=samplePreview(video);
      if(frame){st.previews.push(frame);st.previewTimes.push(video.currentTime);}
    }
    if(st.samples.length>=2 && (!wantsVision || st.previews.length>=frameGoal || (st.previews.length>=2 && Date.now()-st.firstVisibleAt>8500))) {
      if(!st.working)statusBadge(st,'Analyzing…','muted');
      ingest(video,st);
    }
  }
  function watchVideo(video) {
    if(observed.has(video)){liveVideos.add(video);return;}
    observed.add(video);liveVideos.add(video);
    const container=findContainer(video);
    if(!container) return;
    const st={video,generation:0,firstVisibleAt:0,container,account:accountOf(video,container),postUrl:postUrlOf(video,container),audio:audioOf(video,container),mediaSource:String(video.currentSrc||video.src||'').split('?')[0],caption:captionOf(video,container),samples:[],previews:[],previewTimes:[],firstSeenAt:Date.now(),retryable:false,unclassified:false,reason:'',sceneId:'',working:false,show:false};
    states.set(video,st);
    const scan=()=>sample(video,st);
    video.addEventListener('playing',scan);
    video.addEventListener('timeupdate',scan);
    video.addEventListener('loadeddata',scan);
    video.addEventListener('play',()=>{
      const scene=getScene(st);
      if(sceneShouldBlur(st,scene)) {try{video.pause();}catch{}}
    });
    // Sample without changing playback or scrolling behavior.
    const handle=setInterval(()=>{
      if(!video.isConnected){clearInterval(handle);return;}
      sample(video,st);
    },650);
    setTimeout(scan,100);
    setTimeout(()=>clearInterval(handle),18000);
  }
  function scan(root=document) {
    if (!settings.enabled) return;
    if(root.tagName==='VIDEO') watchVideo(root);
    root.querySelectorAll?.('video').forEach(watchVideo);
  }
  function refresh() {
    for(const video of liveVideos) {
      if(!video.isConnected){clearWidgets(video);liveVideos.delete(video);continue;}
      const st=states.get(video);
      if(settings.enabled && st) sample(video,st); // Also detects recycled reel / account.
      if(st?.sceneId) draw(video);
      else if(!settings.enabled) clearWidgets(video);
    }
  }
  chrome.storage.local.get(['cl_settings_v2','cl_library_v2'],data=>{
    settings={...DEFAULT,...data.cl_settings_v2};
    library=data.cl_library_v2 || {};
    scan();
  });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local')return;
    if(changes.cl_settings_v2)settings={...DEFAULT,...changes.cl_settings_v2.newValue};
    if(changes.cl_library_v2)library=changes.cl_library_v2.newValue||{};
    if(settings.enabled) scan();
    refresh();
  });
  const observer=new MutationObserver(muts=>{CLOverlay.update();for(const m of muts)for(const node of m.addedNodes)if(node.nodeType===1)scan(node);});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  // Detect SPA video-node reuse without continually recreating the overlay
  // (which could interrupt the user's attempt to click Show video).
  const monitor=setInterval(()=>{
    if(document.hidden)return;
    for(const video of liveVideos){
      if(!video.isConnected){clearWidgets(video);liveVideos.delete(video);continue;}
      const st=states.get(video);
      if(settings.enabled && st)sample(video,st);
    }
  },1600);
  // Cleanly release state on page unload, and never inject on other domains.
  window.addEventListener('pagehide',()=>{observer.disconnect();clearInterval(monitor);},{once:true});
})();
