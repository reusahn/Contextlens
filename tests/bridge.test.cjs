const test=require('node:test'),assert=require('node:assert/strict');
const {createBridge}=require('../bridge/server');
const frame='data:image/jpeg;base64,'+'A'.repeat(400);
const observation={topic:'Fashion',format:'Review',label:'CIRRA K2 shoes',keyword:'CIRRA K2',visualConfirmed:true,specificity:'specific',viralKey:'cirra-k2-shoes',visualEvidence:'CIRRA K2 label on shoes with a split sole',action:'Shows split-sole shoes',identityScope:'product',distinctiveCues:['CIRRA K2 label','split sole'],aliases:[],entities:['CIRRA K2'],context:'Post claims a specific shoe model; provenance is unverified.'};
const answer=v=>({ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify(v)}}]})});
async function running(t,fetchImpl,maxDaily=200) {
 const {server,budget}=createBridge({token:'test-pairing',modelApiKey:'test-not-real',fetchImpl,maxDaily});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(route,payload,token='test-pairing')=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-ContextLens-Token':token},body:JSON.stringify(payload)});
 return {post,base,budget};
}
const input={caption:'CIRRA K2 review',postUrl:'https://www.instagram.com/reel/test/',imageDataUrls:[frame,frame],frameTimes:[0,1]};
test('bridge enforces authentication and validates inputs before spending',async t=>{
 let calls=0;const {post,budget}=await running(t,async()=>{calls++;return answer(observation);});
 assert.equal((await post('/api/describe',input,'wrong')).status,401);
 assert.equal((await post('/api/describe',{...input,imageDataUrls:[frame]})).status,400);
 assert.equal((await post('/api/describe',{...input,frameTimes:[0]})).status,400);
 assert.equal(calls,0);assert.equal(budget.used(),0);
});
test('descriptor cache avoids spending but verification runs against the current library',async t=>{
 let calls=0;const {post,budget}=await running(t,async(_,opts)=>{
 calls++;const name=JSON.parse(opts.body).response_format.json_schema.name;
 return answer(name==='clip_observation'?observation:{status:'matched',matchId:'known',matchConfidence:.95,matchBasis:'same-specific-subject',sharedCues:['CIRRA K2 label','distinctive split sole'],conflicts:[],reason:'Two specific product cues align.'});});
 const a=await (await post('/api/describe',input)).json();assert.ok(a.evidenceId);assert.equal(calls,1);
 const b=await (await post('/api/describe',input)).json();assert.equal(b.analysis.cacheHit,true);assert.equal(calls,1);
 const c=await (await post('/api/match',{evidenceId:a.evidenceId,candidates:[{id:'known',...observation}]})).json();
 assert.equal(c.matchId,'known');assert.equal(c.verification.status,'matched');assert.equal(calls,2);assert.equal(budget.used(),2);
 assert.equal((await post('/api/match',{evidenceId:'expired',candidates:[]})).status,409);
});
test('local quota and provider rate limits have different error codes',async t=>{
 const a=await running(t,async()=>answer(observation),1);
 await a.post('/api/describe',input);
 const limited=await a.post('/api/describe',{...input,caption:'a different caption'});
 assert.equal(limited.status,429);assert.equal((await limited.json()).code,'local-budget-exhausted');
 const b=await running(t,async()=>({ok:false,status:429,text:async()=> 'private provider body'}));
 const remote=await b.post('/api/describe',input);assert.equal(remote.status,503);assert.equal((await remote.json()).code,'provider-rate-limit');
});
test('health reports the configured 200 call cap and CORS rejects arbitrary websites',async t=>{
 const {base}=await running(t,async()=>answer(observation));const h=await (await fetch(base+'/health')).json();assert.equal(h.limit,200);
 const r=await fetch(base+'/api/describe',{method:'OPTIONS',headers:{Origin:'https://unrelated.example'}});assert.equal(r.status,403);
});
