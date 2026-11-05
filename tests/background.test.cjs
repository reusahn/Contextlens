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
test('one account, different posts of a verified target reaches N; replay does not count',async()=>{
 let calls=0;
 const dance={...identified,contentType:'Dance',topic:'Entertainment',format:'Challenge',identityScope:'action',viralKey:'v-shaped-arm-footwork',label:'V-shaped arm and footwork sequence'};
 const app=setup(async(url,opts)=>{calls++;const p=JSON.parse(opts.body);return okay(url.endsWith('/api/describe')?dance:{...dance,matchId:p.candidates[0].id,matchConfidence:.95,matchBasis:'same-action-format',verification:{status:'matched',sharedCues:['V-shaped arms followed by wrist crossing','two side steps then heel lift'],conflicts:[],reason:'Same ordered movement; different performer and outfit.'}});});
 const a=await app.register('demo_account',1),b=await app.register('demo_account',2),c=await app.register('demo_account',3);
 assert.deepEqual([a.count,b.count,c.count],[1,2,3]);assert.equal(c.fold,true);assert.equal(c.unit,'posts');
 assert.equal(c.scene.accounts.length,1);assert.equal(c.scene.posts.length,3);
 const before=calls,replay=await app.register('demo_account',2);
 assert.equal(replay.count,3);assert.equal(calls,before);assert.equal(replay.sceneId,a.sceneId);
 app.data.cl_settings_v2.countUnit='accounts';
 assert.equal((await app.register('demo_account',3)).count,1);
});
test('same display category never merges different campaigns or products',async()=>{
 let n=0;
 const cases=[
  {...identified,contentType:'Protest',label:'Purple campaign',viralKey:'purple-circle-cross',identityScope:'campaign'},
  {...identified,contentType:'Protest',label:'Yellow campaign',viralKey:'yellow-circle-cross',identityScope:'campaign'},
  {...identified,topic:'Food',contentType:'Cake',label:'Green layer cake',viralKey:'green-layer-cake',identityScope:'product'},
  {...identified,topic:'Food',contentType:'Cake',label:'Chocolate cake',viralKey:'chocolate-cake',identityScope:'product'}
 ];let current;
 const app=setup(async url=>{if(url.endsWith('/api/describe'))return okay(current=cases[n++]);return okay({...current,verification:{status:'distinct',reason:'Different target; display category alone is not identity.',sharedCues:[],conflicts:['different target']}});});
 const results=[];for(let i=1;i<=4;i++)results.push(await app.register('demo_account',i));
 assert.deepEqual(results.map(v=>v.count),[1,1,1,1]);assert.equal(new Set(results.map(v=>v.sceneId)).size,4);
});
test('uncertain or insufficient targets explain why they were not counted',async()=>{
 const app=setup(async()=>okay({...identified,specificity:'insufficient',viralKey:'',visualEvidence:'Only a static pose is readable.'}));
 const result=await app.register('demo_account',1);assert.equal(result.status,'unclassified');
 assert.match(app.data.cl_diagnostics_v1[0].status,/uncertain/);assert.match(app.data.cl_diagnostics_v1[0].detail,/specificity: insufficient/);
 assert.equal(app.data.cl_library_v2,undefined);
});
test('profile or feed URL cannot inflate unique-post count',async()=>{
 const app=setup(async()=>okay(identified));
 const input={type:'CL_REGISTER',account:'demo_account',postUrl:'https://www.instagram.com/demo_account/reels/',samples:[{hash:'1234567890abcdef',luma:80},{hash:'abcdef1234567890',luma:100}],imageDataUrls:['frame','frame']};
 const a=await app.send(input),b=await app.send(input);
 assert.equal(a.count,0);assert.equal(b.count,0);assert.equal(a.fold,false);
 assert.match(app.data.cl_diagnostics_v1[0].status,/Post URL unavailable/);
});
