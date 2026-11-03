// Extension-owned Shadow DOM + manual top-layer popover, outside React's tree.
// Native button focus/Enter/Space defaults are preserved.
(() => {
  const host=document.createElement('div');host.setAttribute('data-contextlens-overlay','');
  host.style.cssText='all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:hidden!important;pointer-events:none!important;z-index:2147483647!important;';
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');
  style.textContent=`
    :host{color-scheme:dark}.cl-layer{position:fixed;pointer-events:none;overflow:hidden;border-radius:12px;font-family:system-ui,sans-serif}
    *{box-sizing:border-box}.cl-count-badge{position:absolute;top:12px;left:12px;z-index:3;border-radius:99px;padding:7px 12px;background:#0e1719ed;color:#b5f889;font:600 11px/1.2 system-ui,sans-serif;border:1px solid #b5f8894a;pointer-events:none;max-width:94%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cl-muted-badge{color:#c8ddd0}.cl-retry-badge{pointer-events:auto;cursor:pointer}.cl-context-card{position:absolute;inset:0;z-index:2;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;background:#090f11ed;color:#eef4ef;text-align:center;overflow:auto;overscroll-behavior:contain}
    .cl-kicker{font:700 10px/1.4 system-ui;letter-spacing:.16em;color:#a6f17e}.cl-title{font-size:23px;line-height:1.2;font-weight:750;color:white}.cl-tags{display:flex;gap:7px;justify-content:center}.cl-category{padding:5px 11px;border:1px solid #7f9ba3;border-radius:99px;color:#cfdfdf;font:700 11px system-ui}
    .cl-account-row{font:750 12px/1.4 system-ui;color:#b5f889}.cl-context-text{max-width:360px;margin:0;color:#d4e0db;font:400 13px/1.5 system-ui}.cl-evidence{font:500 10px/1.4 system-ui;color:#9fb9af}.cl-why{max-width:350px;color:#b3c7bf;font:400 11px/1.45 system-ui}.cl-why summary{cursor:pointer}
    .cl-actions{display:flex;flex-wrap:wrap;gap:9px;justify-content:center;margin-top:4px}.cl-context-card button{appearance:none;pointer-events:auto;cursor:pointer;border:0;border-radius:8px;padding:11px 13px;font:700 11px/1.2 system-ui;min-height:38px}.cl-primary{background:#a6f17e;color:#101c13}.cl-link{background:#172522;color:#e6f5e3;border:1px solid #b1c2bb77!important}button:focus-visible,summary:focus-visible{outline:2px solid white;outline-offset:3px}
    .cl-layer[data-compact] .cl-context-card{padding:10px;gap:6px}.cl-layer[data-compact] .cl-title{font-size:16px}.cl-layer[data-compact] .cl-context-text{font-size:11px}.cl-layer[data-compact] .cl-why{display:none}
+  `;
  shadow.append(style);(document.body||document.documentElement).append(host);
  try{host.setAttribute('popover','manual');host.showPopover();}catch{host.removeAttribute('popover');}
  for(const event of ['pointerdown','pointerup','mousedown','mouseup','click','dblclick','touchstart','touchend','contextmenu','keydown','keyup'])shadow.addEventListener(event,e=>e.stopPropagation());
  const layers=new Map();let pending=false;
  function update(){
    pending=false;
    for(const [video,layer]of layers) {
      if(!video.isConnected){layer.remove();layers.delete(video);resize.unobserve(video);continue;}
      const r=video.getBoundingClientRect(),visible=r.width>=80&&r.height>=80&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&getComputedStyle(video).visibility!=='hidden';
      layer.hidden=!visible;layer.style.display=visible?'block':'none';
      if(visible){Object.assign(layer.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});layer.toggleAttribute('data-compact',r.height<340||r.width<250);}
    }
  }
  function schedule(){if(!pending){pending=true;requestAnimationFrame(update);}}
  const resize=new ResizeObserver(schedule);
  function attach(video){if(!layers.has(video)){const layer=document.createElement('div');layer.className='cl-layer';shadow.append(layer);layers.set(video,layer);resize.observe(video);}schedule();return layers.get(video);}
  function remove(video){layers.get(video)?.remove();layers.delete(video);resize.unobserve(video);}
  window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
  window.addEventListener('pagehide',()=>{resize.disconnect();host.remove();},{once:true});
  globalThis.CLOverlay={attach,remove,update:schedule};
})();
