const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {CL_TOPICS,clClampThreshold,clNormalizeAccount,clCompareSamples,clOfflineHint}=require('../extension/shared.js');
const {parseModelText,analyzeWithMuse}=require('../bridge/context-engine.js');
test('15 subject categories, threshold 2-25',()=>{
  assert.equal(CL_TOPICS.length,15);
  assert.equal(new Set(CL_TOPICS).size,15);
  assert.equal(clClampThreshold(0),2);assert.equal(clClampThreshold(28),25);
  assert.equal(clClampThreshold('bad'),3);
});
test('distinct accounts normalized and invalid account rejected',()=>{
  assert.equal(clNormalizeAccount('@Test.User'),'test.user');
  assert.equal(clNormalizeAccount('reel/account'),'');
});
test('visual matching needs two ordered nonduplicate frames',()=>{
  const left=[{hash:'1234567890abcdef',luma:80},{hash:'abcdef1234567890',luma:100},{hash:'1029384756abcdef',luma:90}];
  assert.equal(clCompareSamples(left,left).matchedFrames,2);
  assert.equal(clCompareSamples(left.slice(0,1),left),null);
  assert.equal(clCompareSamples(left,[left[2],left[1],left[0]]),null);
});
test('offline fallback is not mistaken for verified provenance',()=>{
  const h=clOfflineHint('A funny meme reaction');assert.equal(h.topic,'Memes');
  assert.match(h.context,/not been verified/);
});
test('Muse Spark response shape validates categories',()=>{
  assert.equal(parseModelText('{"topic":"Food","context":"A chef prepares pasta. Original context unverified."}').topic,'Food');
  assert.equal(parseModelText('{"topic":"My fake category","context":"Scene."}').topic,'Other');
  assert.throws(()=>parseModelText('not json'));
});
test('Meta request uses server-side bearer key and image is optional',async()=>{
  let req;
  const response=await analyzeWithMuse({caption:'Food joke',postUrl:'https://www.instagram.com/reel/demo/',modelApiKey:'test-server-key',fetchImpl:async(url,options)=>{
    req={url,options};return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'{"topic":"Food","context":"A food meme. Original context unverified."}'}}]})};
  }});
  assert.equal(response.topic,'Food');
  assert.match(req.url,/meta.ai\/v1\/chat\/completions/);
  assert.equal(req.options.headers.Authorization,'Bearer test-server-key');
});
test('background counts only distinct accounts and folds at N',async()=>{
  const data={cl_settings_v2:{countUnit:'accounts'}};let listener;
  const chrome={storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,data[k]])),set:async items=>Object.assign(data,items)}},runtime:{onMessage:{addListener:fn=>{listener=fn;}}},tabs:{create:async()=>({})}};
  const context=vm.createContext({chrome,console,BigInt,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,URL,fetch:async()=>({ok:false,status:401}),AbortController,Date,Math});
  context.importScripts=()=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/shared.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/background.js'),'utf8'),context);
  const samples=[{hash:'1234567890abcdef',luma:88},{hash:'abcdef1234567890',luma:102},{hash:'1029384756abcdef',luma:90}];
  const send=(account,url)=>new Promise(resolve=>listener({type:'CL_REGISTER',account,samples,caption:'meme',postUrl:url},
    {url:'https://www.instagram.com/reels/'},resolve));
  const a=await send('alpha','https://www.instagram.com/reel/a/');
  assert.equal(a.count,1);assert.equal(a.fold,false);
  const again=await send('alpha','https://www.instagram.com/reel/a2/');
  assert.equal(again.count,1);assert.equal(again.fold,false);
  const b=await send('beta','https://www.instagram.com/reel/b/');
  assert.equal(b.count,2);assert.equal(b.fold,false);
  const c=await send('gamma','https://www.instagram.com/reel/c/');
  assert.equal(c.count,3);assert.equal(c.fold,true);
  assert.equal(Object.values(data.cl_library_v2).length,1);
});
const {identifyViral,parseViralModelResponse}=require('../bridge/viral-engine.js');
test('Meta semantic result only counts a specific visually grounded candidate',()=>{
  const base={visualConfirmed:true,viralKey:'gliding-illusion-movement',topic:'Memes',label:'Slick-back illusion movement',action:'gliding backwards',visualEvidence:'feet appear to float',context:'A repeated gliding dance illusion.',specificity:'specific',matchId:'candidate-a',matchConfidence:0.96,matchBasis:'same-action-format'};
  assert.equal(parseViralModelResponse(JSON.stringify(base),['candidate-a']).matchId,'candidate-a');
  assert.equal(parseViralModelResponse(JSON.stringify({...base,matchConfidence:0.79}),['candidate-a']).matchId,null);
  assert.equal(parseViralModelResponse(JSON.stringify({...base,specificity:'insufficient'}),['candidate-a']).matchId,null);
  assert.equal(parseViralModelResponse(JSON.stringify({...base,matchId:'not-provided'}),['candidate-a']).matchId,null);
  assert.equal(parseViralModelResponse(JSON.stringify({...base,matchBasis:'same-topic'}),['candidate-a']).matchId,null);
});
test('Muse identification uses 2 ordered image samples and server key',async()=>{
  const frame='data:image/jpeg;base64,'+'A'.repeat(400);
  let sent;
  const result=await identifyViral({caption:'',imageDataUrls:[frame,frame],candidates:[],modelApiKey:'test-only',fetchImpl:async(url,opts)=>{
    sent={url,opts};return{ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({topic:'Memes',label:'Gliding illusion',action:'feet glide',visualEvidence:'sliding feet',context:'A glide-like dance.',specificity:'specific',matchId:null,matchConfidence:0,matchBasis:'none'})}}]})};
  }});
  assert.equal(result.label,'Gliding illusion');
  assert.equal(sent.opts.headers.Authorization,'Bearer test-only');
  assert.equal(JSON.parse(sent.opts.body).messages[1].content.filter(x=>x.type==='image_url').length,2);
  await assert.rejects(identifyViral({caption:'Slick Back',imageDataUrls:[],candidates:[],modelApiKey:'test-only'}),/two readable/);
});
test('distinct videos of one specific motif can reach N=3, generic topics cannot',async()=>{
  const db={cl_settings_v2:{enabled:true,threshold:3,aiEnabled:true,shareFrame:true,bridgeToken:'test-pairing',countUnit:'accounts'}};
  let handler;let calls=0;
  const chrome={storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,db[k]])),set:async v=>Object.assign(db,v)}},runtime:{onMessage:{addListener:f=>handler=f}},tabs:{create:async()=>({})}};
  const context=vm.createContext({chrome,console,BigInt,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,URL,AbortController,Date,Math,
    fetch:async(url,opts)=>{
      calls++;const payload=JSON.parse(opts.body);
      const observation={topic:'Memes',format:'Challenge',label:'Distinctive glide movement',action:'illusory gliding feet',visualEvidence:'heels lift while sliding sideways',context:'A glide illusion trend. Origins unverified.',specificity:'specific',viralKey:'gliding-illusion-movement',visualConfirmed:true,evidenceId:'observation-1',identityScope:'action',evidence:'AI interpretation',provider:'Meta Muse Spark 1.3',analysis:{frameCount:2}};
      if(url.endsWith('/api/describe'))return {ok:true,json:async()=>observation};
      assert.match(url,/\/api\/match$/);
      return {ok:true,json:async()=>({...observation,matchId:payload.candidates[0]?.id,matchConfidence:.94,matchBasis:'same-action-format',verification:{status:'matched',sharedCues:['alternating raised heels','sideways glide without visible steps'],conflicts:[],reason:'Same distinctive glide sequence.'}})};
    }});
  context.importScripts=()=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/shared.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/background.js'),'utf8'),context);
  const send=(who,i)=>new Promise(resolve=>handler({type:'CL_REGISTER',account:who,
    samples:[{hash:(0x1234567811111111n+BigInt(i)*0x101010101010101n).toString(16).slice(0,16).padStart(16,'0'),luma:90},
      {hash:(0xabcdef2222222222n+BigInt(i)*0x101010101010101n).toString(16).slice(0,16).padStart(16,'0'),luma:100},
      {hash:(0x8421381234567890n+BigInt(i)*0x101010101010101n).toString(16).slice(0,16).padStart(16,'0'),luma:110}],
    caption:'An interesting clip',postUrl:`https://www.instagram.com/reel/${i}/`,imageDataUrls:['frame1','frame2']},
    {url:'https://www.instagram.com/reels/'},resolve));
  const a=await send('user_a',1),b=await send('user_b',2),c=await send('user_c',3);
  assert.deepEqual([a.count,b.count,c.count],[1,2,3]);
  assert.equal(c.fold,true);assert.equal(c.matchingMode,'same-specific-viral-content');
  assert.equal(calls,5);
  assert.equal(Object.keys(db.cl_library_v2).length,1);
  const d=await send('user_c',4); assert.equal(d.count,3); // same account twice
});
