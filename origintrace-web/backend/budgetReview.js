import {config} from 'dotenv';
import {fileURLToPath} from 'node:url';
import {getMetaBudget} from './services/metaBudget.js';
config({path:fileURLToPath(new URL('../.env',import.meta.url))});
const budget=getMetaBudget();
try{
 const args=process.argv.slice(2);
 if(args.length===2&&args[0]==='--confirm-terminal'){
  const id=args[1];const row=budget.db.prepare('SELECT id,amount,active FROM reservations WHERE id=?').get(id);
  if(!row)throw Error('Reservation not found');
  budget.completeKnownTerminal(id);
  console.log('Marked provider execution as terminal. Full accounted cost retained; no budget refunded.');
 }else if(!args.length){
  console.log(JSON.stringify({status:budget.status(),outstanding:budget.db.prepare('SELECT id,amount AS nanoUSD,kind FROM reservations WHERE active=1').all()},null,2));
  console.log('After independently confirming a provider request has terminated, use: npm run budget:review -w backend -- --confirm-terminal RESERVATION_ID');
  console.log('Never confirm terminal merely to restore capacity. This command retains all accounted cost.');
 }else throw Error('Usage: budgetReview.js [--confirm-terminal RESERVATION_ID]');
}finally{budget.close();}
