const fs=require('node:fs');
const path=require('node:path');
function dailyLimit(value) {
  const n=Number(value);return Number.isFinite(n)?Math.max(1,Math.min(10000,Math.floor(n))):200;
}
function createBudget({limit=200,file='',now=()=>new Date()}={}) {
  let state={date:'',used:0};
  if(file&&fs.existsSync(file)) {
    try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('Cannot read usage ledger; repair it before starting the bridge');}
    if(typeof state.date!=='string'||!Number.isInteger(state.used)||state.used<0)throw Error('Invalid usage ledger');
  }
  limit=dailyLimit(limit);
  function current(){const date=now().toISOString().slice(0,10);if(state.date!==date)state={date,used:0};return state;}
  function remaining(){return Math.max(0,limit-current().used);}
  function spend(){
    if(!remaining()){const e=Error('Daily Meta call limit reached');e.code='local-budget-exhausted';throw e;}
    current().used++;
    if(file){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});fs.renameSync(file+'.tmp',file);}
  }
  return {spend,remaining,limit,used:()=>current().used,date:()=>current().date};
}
module.exports={createBudget,dailyLimit};
