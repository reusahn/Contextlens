// Local authenticated bridge. The API key never enters extension storage.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {analyzeWithMuse}=require('./context-engine');
const {identifyViral,describeViral,matchViral,readableFrames}=require('./viral-engine');
const {createBudget,dailyLimit}=require('./budget');
const baseline=require('../benchmarks/baseline-v09.cjs');
function loadEnv(file=path.join(__dirname,'.env')) {
  if(fs.existsSync(file))for(const row of fs.readFileSync(file,'utf8').split(/\r?\n/)) {
    const m=row.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');
  }
}
function createBridge({token,modelApiKey='',maxDaily=200,budgetFile='',fetchImpl=fetch}={}) {
  if(!token)throw Error('A pairing token is required');
  const budget=createBudget({limit:maxDaily,file:budgetFile});
  const cache=new Map(),byId=new Map();
  function prune(){for(const [key,row]of cache)if(Date.now()-row.time>3600000){cache.delete(key);byId.delete(row.id);}while(cache.size>32){const key=cache.keys().next().value;byId.delete(cache.get(key).id);cache.delete(key);}}
  function write(res,status,data){res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin||'',allowed=/^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    if(allowed){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Content-Type,X-ContextLens-Token');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS,GET');res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){res.writeHead(allowed?204:403);res.end();return;}
    if(req.method==='GET'&&req.url==='/health'){write(res,200,{status:'ready',model:'muse-spark-1.3',keyConfigured:!!modelApiKey,remaining:budget.remaining(),limit:budget.limit,used:budget.used(),date:budget.date(),resetAt:'UTC midnight',pipeline:'observe-retrieve-verify-v3-temporal'});return;}
    if(req.method!=='POST'||!['/api/context','/api/viral','/api/describe','/api/match','/api/baseline'].includes(req.url)){write(res,404,{error:'Not found'});return;}
    if(req.headers['x-contextlens-token']!==token){write(res,401,{error:'Invalid pairing token'});return;}
    try {
      let length=0;const chunks=[];
      for await(const chunk of req){length+=chunk.length;if(length>14000000){const e=Error('Body too large');e.status=413;throw e;}chunks.push(chunk);}
      let payload;try{payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{const e=Error('Invalid JSON body');e.status=400;throw e;}
      const bad=message=>{const e=Error(message);e.status=400;throw e;};
      if(!payload||typeof payload!=='object'||Array.isArray(payload))bad('Invalid payload');
      if(req.url!=='/api/match'&&(typeof payload.caption!=='string'||typeof payload.postUrl!=='string'))bad('Missing caption or postUrl');
      if(String(payload.caption||'').length>1000||String(payload.postUrl||'').length>500||String(payload.audioId||'').length>30||String(payload.audioTitle||'').length>120)bad('Text length exceeded');
      if(payload.candidates&&(!Array.isArray(payload.candidates)||payload.candidates.length>500))bad('Invalid candidate list');
      if(['/api/viral','/api/describe'].includes(req.url)&&!payload.videoDataUrl) {
        if(!Array.isArray(payload.imageDataUrls)||payload.imageDataUrls.length>8||readableFrames(payload.imageDataUrls).length!==payload.imageDataUrls.length||payload.imageDataUrls.length<2)bad('Two to eight JPEG frames required');
        if(payload.frameTimes&&(!Array.isArray(payload.frameTimes)||payload.frameTimes.length!==payload.imageDataUrls.length||payload.frameTimes.some(v=>!Number.isFinite(v)||v<0)))bad('Invalid frame timestamps');
      }
      if(req.url==='/api/context'&&payload.imageDataUrl&&(typeof payload.imageDataUrl!=='string'||payload.imageDataUrl.length>150000))bad('Invalid context frame');
      if(!modelApiKey){write(res,503,{error:'Add META_API_KEY to bridge/.env first'});return;}
      prune();
      const common={...payload,modelApiKey,fetchImpl,beforeRequest:budget.spend};let result;
      if(req.url==='/api/describe') {
        const digest=crypto.createHash('sha256').update(JSON.stringify({caption:payload.caption,audioId:payload.audioId,audioTitle:payload.audioTitle,frames:payload.imageDataUrls,times:payload.frameTimes,video:payload.videoDataUrl})).digest('hex');
        const previous=cache.get(digest);
        if(previous)result={...previous.observation,analysis:{...previous.observation.analysis,cacheHit:true}};
        else {
          const observation=await describeViral(common),id=crypto.randomUUID();
          observation.evidenceId=id;
          const frames=readableFrames(payload.imageDataUrls),row={id,time:Date.now(),observation,frames};
          cache.set(digest,row);byId.set(id,row);prune();result=observation;
        }
      }else if(req.url==='/api/match') {
        const row=byId.get(payload.evidenceId);
        if(!row){write(res,409,{error:'Observation expired. Retry the clip.',code:'observation-expired'});return;}
        result=await matchViral({...common,observation:row.observation,imageDataUrls:row.frames,referenceFrames:id=>byId.get(id)?.frames||[]});
        result.evidenceId=row.id;
      }else if(req.url==='/api/baseline')result=await baseline.identifyViral(common);
      else if(req.url==='/api/viral')result=await identifyViral(common);
      else {budget.spend();result=await analyzeWithMuse(common);}
      write(res,200,result);
    }catch(error){write(res,error.code==='local-budget-exhausted'?429:error.status===429?503:error.status||502,{error:String(error.message||error).slice(0,160),code:error.code|| (error.status===429?'provider-rate-limit':'analysis-error')});}
  });
  return {server,budget};
}
if(require.main===module) {
  loadEnv();
  const token=process.env.CL_BRIDGE_TOKEN||crypto.randomBytes(16).toString('hex'),port=Number(process.env.CL_BRIDGE_PORT||8766);
  const modelApiKey=process.env.META_API_KEY||process.env.MODEL_API_KEY||'';
  const {server,budget}=createBridge({token,modelApiKey,maxDaily:dailyLimit(process.env.DAILY_META_LIMIT),budgetFile:process.env.CL_BUDGET_FILE||path.join(__dirname,'.contextlens-usage.json')});
  server.listen(port,'127.0.0.1',()=>{
    console.log(`\nContextLens bridge: http://127.0.0.1:${port}\nMeta API key ${modelApiKey?'configured':'NOT configured'}\nPairing token (paste in extension popup): ${token}\nDaily call cap: ${budget.limit}; remaining: ${budget.remaining()} (UTC midnight; survives restarts)\nKeep your token and API key private.\n`);
  });
}
module.exports={createBridge,loadEnv};
