// Each actual attempt is charged to the local guard, including completion retries.
const clean=(v,max=240)=>typeof v==='string'?v.trim().slice(0,max):'';
function parseObject(raw) {
  const s=String(raw||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  let value;try{value=JSON.parse(s);}catch{throw Error('Invalid model JSON');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid model object');
  return value;
}
async function metaJson({system,content,schema,name,modelApiKey,fetchImpl=fetch,beforeRequest,model='muse-spark-1.3',timeoutMs=24000}) {
  if(!modelApiKey)throw Error('Missing server-side Meta Model API key');
  const deadline=Date.now()+timeoutMs;let last;
  for(let attempt=0;attempt<2;attempt++) {
    if(deadline-Date.now()<1000)break;
    if(beforeRequest)await beforeRequest();
    const response=await fetchImpl('https://api.meta.ai/v1/chat/completions',{
      method:'POST',headers:{Authorization:`Bearer ${modelApiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,messages:[{role:'developer',content:system},{role:'user',content}],max_completion_tokens:2400,reasoning_effort:'minimal',
        response_format:{type:'json_schema',json_schema:{name,schema}}}),signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))
    });
    const raw=await response.text();
    if(!response.ok){const e=Error(`Meta API HTTP ${response.status}`);e.status=response.status;throw e;}
    let data;try{data=JSON.parse(raw);}catch{throw Error('Meta API response was not JSON');}
    const choice=data.choices?.[0],message=choice?.message;
    const text=typeof message?.content==='string'?message.content:Array.isArray(message?.content)?message.content.filter(x=>x?.type==='text').map(x=>x.text||'').join(''):'';
    if(message?.refusal)throw Error('Meta declined this analysis');
    try {
      if(choice?.finish_reason==='length'||!text.trim())throw Error('Empty or truncated model completion');
      return {value:parseObject(text),usage:data.usage||{},attempts:attempt+1,model};
    }catch(error){last=error;}
  }
  throw last||Error('Meta analysis deadline exceeded');
}
module.exports={metaJson,parseObject,clean};
