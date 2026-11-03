const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const identified={topic:'Politics',format:'News Event',label:'A specific podium statement',keyword:'Podium statement',action:'A speaker raises a chart at the podium',visualEvidence:'Chart held beside the named conference backdrop',specificity:'specific',visualConfirmed:true,viralKey:'podium-statement',identityScope:'event',evidenceId:'cached-observation'};
function setup(fetchImpl,initial={}) {
 let handler;const data={cl_settings_v2:{enabled:true,threshold:3,aiEnabled:true,shareFrame:true,bridgeToken:'test'},...initial},tabs=[];
 const chrome={storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,structuredClone(data[k])])),set:async v=>Object.assign(data,structuredClone(v))}},runtime:{onMessage:{addListener:f=>handler=f}},tabs:{create:async x=>tabs.push(x)}};
 const ctx=vm.createContext({chrome,console,BigInt,crypto:crypto.webcrypto,setTimeout,clearTimeout,URL,AbortController,AbortSignal,Date,Math,fetch:fetchImpl});
 ctx.importScripts=()=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/shared.js'),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/background.js'),'utf8'),ctx);
 const send=(msg,sender='https://www.instagram.com/reels/')=>new Promise(r=>handler(msg,{url:sender},r));
 const register=(account,n)=>send({type:'CL_REGISTER',account,caption:'untrusted caption',postUrl:`https://www.instagram.com/reel/${n}/`,samples:[0,1,2].map(i=>({hash:crypto.createHash('sha256').update(`${n}-${i}`).digest('hex').slice(0,16),luma:80+i*40})),imageDataUrls:['frame','frame'],frameTimes:[0,1]});
 return {data,tabs,register,send};
}
const okay=v=>({ok:true,json:async()=>v});
test('colliding model keys and shared audio never bypass distinct-event verification',async()=>{
 const app=setup(async url=>okay(url.endsWith('/api/describe')?identified:{...identified,matchId:null,matchConfidence:.99,verification:{status:'distinct',reason:'Different statement on another date.',sharedCues:[],conflicts:['different event']}}));
 const a=await app.register('alice',1),b=await app.register('bob',2);assert.equal(a.count,1);assert.equal(b.count,1);assert.notEqual(a.sceneId,b.sceneId);assert.equal(Object.keys(app.data.cl_library_v2).length,2);
});
test('uncertain identity leaves counts unchanged instead of creating a new singleton',async()=>{
 const app=setup(async url=>okay(url.endsWith('/api/describe')?identified:{...identified,verification:{status:'uncertain',sharedCues:[],conflicts:[]}}));
 await app.register('alice',1);const b=await app.register('bob',2);assert.equal(b.status,'unclassified');assert.equal(Object.keys(app.data.cl_library_v2).length,1);assert.equal(Object.values(app.data.cl_library_v2)[0].accounts.length,1);
});
test('upstream failure creates no fake group and offers an explicit retry',async()=>{
 const app=setup(async()=>({ok:false,status:503,json:async()=>({error:'provider unavailable'})}));const result=await app.register('alice',1);assert.equal(result.retryable,true);assert.equal(app.data.cl_library_v2,undefined);
});
test('no model request is sent with frame sharing disabled',async()=>{
 let calls=0;const app=setup(async()=>{calls++;throw Error('should not call');},{cl_settings_v2:{enabled:true,aiEnabled:true,shareFrame:false,bridgeToken:'test'}});
 await app.register('alice',1);assert.equal(calls,0);
});
test('disabled extension does not count a queued post',async()=>{
 const app=setup(async()=>{throw Error('must not call');},{cl_settings_v2:{enabled:false}});const result=await app.register('alice',1);assert.equal(result.status,'disabled');assert.equal(app.data.cl_library_v2,undefined);
});
test('OriginTrace opens a new tab and rejects unsafe destination schemes',async()=>{
 const app=setup(async()=>({}));const result=await app.send({type:'CL_ORIGINTRACE',postUrl:'https://www.instagram.com/reel/abc/',caption:'a & b'});
 assert.equal(result.ok,true);const url=new URL(app.tabs[0].url);assert.equal(url.searchParams.get('caption'),'a & b');assert.equal(url.searchParams.get('from'),'contextlens');
 app.data.cl_settings_v2.originTraceUrl='javascript:alert(1)';const blocked=await app.send({type:'CL_ORIGINTRACE'});assert.equal(blocked.ok,false);assert.equal(app.tabs.length,1);
});
test('unsupported sites cannot register observations',async()=>{
 const app=setup(async()=>({}));const result=await app.send({type:'CL_REGISTER'},'https://unrelated.example/');assert.equal(result.ok,false);assert.match(result.reason,/Unsupported/);
});
