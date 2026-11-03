import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

// Verified 2026-10-31: https://dev.meta.ai/docs/pricing-rate-limits
// Integer nano-USD: $1.25/M input and $4.25/M output. No cache discount assumed.
export const OUTPUT_LIMIT = 4096;
export const INPUT_LIMIT = 1048576 - OUTPUT_LIMIT;
export const MAX_COST = INPUT_LIMIT * 1250 + OUTPUT_LIMIT * 4250;
export const AUDIO_LIMIT_SECONDS = 180;
export const AUDIO_MAX_COST = 9_000_000; // $0.18/hour * 180 seconds, nano-USD
export const SEARCH_ESTIMATED_QUERIES=8; // Estimate only: Meta has no documented enforced query cap.
export const SEARCH_QUERY_COST=2_500_000; // $2.50 / 1,000 queries, nano-USD
export const SEARCH_ESTIMATED_COST=MAX_COST+SEARCH_ESTIMATED_QUERIES*SEARCH_QUERY_COST;
const BUDGET = 100_000_000_000;
export class MetaControlError extends Error {
 constructor(message, status=503){super(message);this.name='MetaControlError';this.status=status;}
}
export class MetaBudget {
 constructor(path){
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  this.db=new DatabaseSync(path);
  this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
   CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY, amount INTEGER NOT NULL, active INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS attempts(user TEXT NOT NULL, at INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS attempts_user_at ON attempts(user,at);
   CREATE TABLE IF NOT EXISTS controls(id INTEGER PRIMARY KEY CHECK(id=1), disabled INTEGER NOT NULL);
   INSERT OR IGNORE INTO controls VALUES(1,0);`);
  if(!this.db.prepare('PRAGMA table_info(reservations)').all().some(c=>c.name==='kind'))this.db.exec("ALTER TABLE reservations ADD COLUMN kind TEXT NOT NULL DEFAULT 'text'");
 }
 transaction(fn){
  this.db.exec('BEGIN IMMEDIATE');
  try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 reserve(user,kind='text'){return this.transaction(()=>{
  if(!['text','audio','search'].includes(kind))throw new MetaControlError('Unsupported reservation type');
  if(kind==='search'&&process.env.META_SEARCH_BILLING_MODE!=='best_effort')throw new MetaControlError('Meta search billing opt-in required');
  const maximum=kind==='audio'?AUDIO_MAX_COST:kind==='search'?SEARCH_ESTIMATED_COST:MAX_COST;
  if(process.env.META_API_DISABLED !== 'false' && process.env.META_API_DISABLED !== undefined || this.db.prepare('SELECT disabled FROM controls').get().disabled)
   throw new MetaControlError('Meta API disabled');
  const now=Date.now();
  this.db.prepare('DELETE FROM attempts WHERE at <= ?').run(now-60000);
  const identity=createHash('sha256').update(String(user||'anonymous')).digest('hex');
  if(this.db.prepare('SELECT count(*) AS n FROM attempts WHERE user=?').get(identity).n>=5)
   throw new MetaControlError('Meta request rate limit reached',429);
  const totals=this.db.prepare('SELECT coalesce(sum(amount),0) AS cost, coalesce(sum(active),0) AS active FROM reservations').get();
  if(totals.active>=2)throw new MetaControlError('Meta concurrency limit reached',429);
  if(totals.cost+maximum>BUDGET)throw new MetaControlError('Meta cumulative $100 budget exhausted',402);
  const id=randomUUID();
  this.db.prepare('INSERT INTO reservations(id,amount,active,kind) VALUES(?,?,1,?)').run(id,maximum,kind);
  this.db.prepare('INSERT INTO attempts VALUES(?,?)').run(identity,now);
  return id;
 });}
 reconcile(id,usage){return this.transaction(()=>{
  const row=this.db.prepare('SELECT * FROM reservations WHERE id=?').get(id);
  if(!row?.active)return;
  if(row.kind==='audio'){
   const ms=usage?.audioDurationMs;
   if(!Number.isSafeInteger(ms)||ms<0)return;
   const cost=Math.floor(ms/1000)*50_000;
   if(!Number.isSafeInteger(cost))return;
   if(ms>AUDIO_LIMIT_SECONDS*1000){this.db.prepare('UPDATE controls SET disabled=1').run();this.db.prepare('UPDATE reservations SET amount=?,active=0 WHERE id=?').run(Math.max(row.amount,cost),id);return;}
   this.db.prepare('UPDATE reservations SET amount=?,active=0 WHERE id=?').run(cost,id);return;
  }
  const input=usage?.prompt_tokens, output=usage?.completion_tokens;
  if(!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(output)||output<0)return;
  const queries=row.kind==='search'?usage?.searchQueries:0;
  if(!Number.isSafeInteger(queries)||queries<0)return;
  const cost=input*1250+output*4250+queries*SEARCH_QUERY_COST;
  if(!Number.isSafeInteger(cost))return;
  if(input>INPUT_LIMIT||output>OUTPUT_LIMIT||row.kind==='search'&&queries>SEARCH_ESTIMATED_QUERIES){
   this.db.prepare('UPDATE controls SET disabled=1').run();
   this.db.prepare('UPDATE reservations SET amount=?,active=0 WHERE id=?').run(Math.max(row.amount,cost),id);
   return;
  }
  this.db.prepare('UPDATE reservations SET amount=?,active=0 WHERE id=?').run(cost,id);
 });}
 completeKnownTerminal(id){return this.transaction(()=>{
  // Retain the full monetary reservation when usage is unknown, but a known terminal
  // response cannot still occupy a provider execution slot.
  this.db.prepare('UPDATE reservations SET active=0 WHERE id=?').run(id);
 });}
 status(){
  const row=this.db.prepare('SELECT coalesce(sum(amount),0) AS cost,coalesce(sum(active),0) AS active FROM reservations').get();
  const disabled=Boolean(this.db.prepare('SELECT disabled FROM controls WHERE id=1').get().disabled)||process.env.META_API_DISABLED!==undefined&&process.env.META_API_DISABLED!=='false';
  return {disabled,outstanding:row.active,concurrencyLimit:2,blocked:disabled||row.active>=2||row.cost+MAX_COST>BUDGET,reason:disabled?'Meta API disabled':row.active>=2?'Outstanding or uncertain requests fill the concurrency limit; operator review required':row.cost+MAX_COST>BUDGET?'Insufficient budget for the next maximum text reservation':null};
 }
 close(){this.db.close();}
}
let ledger, ledgerPath;
export function getMetaBudget(){
 const path=process.env.META_BUDGET_DB || new URL('../data/meta-budget.sqlite',import.meta.url).pathname;
 if(path!==ledgerPath){ledger?.close();ledger=new MetaBudget(path);ledgerPath=path;}
 return ledger;
}
export async function paidMetaRequest(body,user,{budget=getMetaBudget(),fetchImpl=globalThis.fetch}={}){
 if(body.model!=='muse-spark-1.3')throw new MetaControlError('Meta model has no approved pricing');
 if(body.max_completion_tokens!==OUTPUT_LIMIT || body.tools || Buffer.byteLength(JSON.stringify(body))>8*1024*1024)
  throw new MetaControlError('Meta request exceeds enforced limits');
 const id=budget.reserve(user);
 try{
  const response=await fetchImpl('https://api.meta.ai/v1/chat/completions',{
   method:'POST',headers:{Authorization:`Bearer ${process.env.META_API_KEY?.trim()}`,'Content-Type':'application/json'},
   signal:AbortSignal.timeout(60000),body:JSON.stringify(body)
  });
  // HTTP failures, invalid JSON, absent usage and timeouts retain the full reservation.
  if(!response.ok)throw new MetaControlError(`Meta analysis returned HTTP ${response.status}`);
  const data=await response.json();
  budget.reconcile(id,data.usage);
  if(Array.isArray(data.choices)&&data.choices.length&&data.choices.every(c=>['stop','length','content_filter'].includes(c.finish_reason)))budget.completeKnownTerminal(id);
  return data;
 }catch(error){if(error instanceof MetaControlError)throw error;throw new MetaControlError('Meta request failed; budget reservation retained');}
}

export function readBudgetStatus(){
 const path=process.env.META_BUDGET_DB||new URL('../data/meta-budget.sqlite',import.meta.url).pathname;
 if(!existsSync(path))return {blocked:process.env.META_API_DISABLED!==undefined&&process.env.META_API_DISABLED!=='false',outstanding:0,reason:null};
 let db;try{
  db=new DatabaseSync(path,{readOnly:true});
  const row=db.prepare('SELECT coalesce(sum(amount),0) AS cost,coalesce(sum(active),0) AS active FROM reservations').get();
  const disabled=Boolean(db.prepare('SELECT disabled FROM controls WHERE id=1').get().disabled)||process.env.META_API_DISABLED!==undefined&&process.env.META_API_DISABLED!=='false';
  return {disabled,outstanding:row.active,concurrencyLimit:2,blocked:disabled||row.active>=2||row.cost+MAX_COST>BUDGET,reason:disabled?'Meta API disabled':row.active>=2?'Outstanding or uncertain requests fill the concurrency limit; operator review required':row.cost+MAX_COST>BUDGET?'Insufficient budget for a maximum text reservation':null};
 }catch{return {blocked:true,reason:'Budget ledger cannot be read; check backend storage'};}finally{db?.close();}
}
