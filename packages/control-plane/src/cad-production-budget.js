// Ongoing global model admission, keyed by UTC calendar month. Reservations are
// whole-job ceilings, not billed usage, and are never refunded after uncertainty.
export const CAD_PRODUCTION_BUDGET_NAME = 'cad:production-budget';
export const CAD_PRODUCTION_BUDGET_KEY = 'production:model-budget';
export const cadProductionEnforced = env => env.CAD_PRODUCTION_REQUIRED==='true'||env.CAD_PRODUCTION_ENABLED==='true';
const MICROS=1000000;
const problem=(message,status=503)=>Object.assign(new Error(message),{status});
export function cadProductionConfig(env){
 if(env.CAD_PRODUCTION_ENABLED!=='true')throw problem('Production CAD generation is not enabled.');
 const usd=Number(env.CAD_PRODUCTION_MONTHLY_MODEL_USD);
 if(!Number.isFinite(usd)||usd<=0||usd>10||Math.floor(usd*MICROS)<1)throw problem('The monthly CAD model allowance is not configured.');
 return{maxMicros:Math.floor(usd*MICROS)};
}
export function isCadProductionBudgetObject(state,env){return !!state.id&&!!env.CAD_JOBS&&String(state.id)===String(env.CAD_JOBS.idFromName(CAD_PRODUCTION_BUDGET_NAME));}
export function cadReservationMonths(now,deadline){
 if(!Number.isFinite(now)||!Number.isFinite(deadline)||deadline<=now)throw problem('The CAD job deadline has passed or is invalid.',409);
 const date=new Date(now),next=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1),following=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+2,1);
 if(deadline>=following)throw problem('A CAD job cannot reserve beyond the next calendar month.',400);
 const month=timestamp=>new Date(timestamp).toISOString().slice(0,7);
 return deadline>=next?[month(now),month(next)]:[month(now)];
}
// Storage-only operation; CadJobs serializes all users/boards on the fixed DO.
export async function reserveCadProductionModel(storage,env,input,{now=Date.now()}={}){
 const config=cadProductionConfig(env);
 if(!input||['jobId','boardId','ownerOrg','ownerEmail'].some(key=>typeof input[key]!=='string'||!input[key]||input[key].length>300)||!Number.isFinite(input.limitUsd)||input.limitUsd<=0||input.limitUsd>10)throw problem('Invalid CAD model reservation.',400);
 const months=cadReservationMonths(now,input.deadline),micros=Math.ceil(input.limitUsd*MICROS),identity={boardId:input.boardId,ownerOrg:input.ownerOrg,ownerEmail:input.ownerEmail,micros};
 const ledger=await storage.get(CAD_PRODUCTION_BUDGET_KEY)||{version:1,months:{}};
 if(ledger.version!==1)throw problem('The CAD budget ledger cannot be read safely.');
 const fresh=[];
 for(const month of months){
  const entry=ledger.months[month]||{reservedMicros:0,jobs:{}};
  if(Object.hasOwn(entry.jobs,input.jobId)){
   if(JSON.stringify(entry.jobs[input.jobId])!==JSON.stringify(identity))throw problem('This job already has a different reservation for this month.',409);
  }else{
   if(!Number.isSafeInteger(entry.reservedMicros)||entry.reservedMicros<0)throw problem('The CAD budget ledger cannot be read safely.');
   if(entry.reservedMicros+micros>config.maxMicros){
    ledger.pause={month,reason:'monthly_model_reservation_limit',at:now};await storage.put(CAD_PRODUCTION_BUDGET_KEY,ledger);
    throw problem(`The CAD model allowance for ${month} is reserved. New model work is paused.`,429);
   }
   fresh.push(month);
  }
 }
 // Validate all relevant months before making any reservation. One durable write
 // prevents partial cross-month admission on interruption.
 for(const month of fresh){
  const entry=ledger.months[month]||{reservedMicros:0,jobs:{}};
  Object.defineProperty(entry.jobs,input.jobId,{value:identity,enumerable:true,writable:true,configurable:true});entry.reservedMicros+=micros;ledger.months[month]=entry;
 }
 if(fresh.length)await storage.put(CAD_PRODUCTION_BUDGET_KEY,ledger);
 return{reserved:true,reused:fresh.length===0,months,jobMicros:micros,totals:Object.fromEntries(months.map(month=>[month,ledger.months[month].reservedMicros]))};
}
export async function cadProductionBudgetStatus(storage,env,{now=Date.now()}={}){
 const ledger=await storage.get(CAD_PRODUCTION_BUDGET_KEY)||{months:{}},month=new Date(now).toISOString().slice(0,7);
 let config;try{config=cadProductionConfig(env);}catch{return{enabled:false,paused:true,reason:'not_configured',month};}
 const totals=Object.fromEntries(Object.entries(ledger.months).map(([key,value])=>[key,{reservedMicros:value.reservedMicros,remainingMicros:Math.max(0,config.maxMicros-value.reservedMicros)}]));
 return{enabled:true,month,maxMicros:config.maxMicros,totals,paused:ledger.pause?.month===month||(totals[month]?.remainingMicros===0),reason:ledger.pause?.month===month?ledger.pause.reason:null,lastRefusal:ledger.pause||null,reservationsAreBilling:false};
}
export async function reserveCadProductionJob(env,job){
 cadProductionConfig(env);
 if(!env.CAD_JOBS)throw problem('The global CAD model ledger is unavailable.');
 const response=await env.CAD_JOBS.get(env.CAD_JOBS.idFromName(CAD_PRODUCTION_BUDGET_NAME)).fetch('https://cad/production-model-reservation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:job.id,boardId:job.boardId,ownerOrg:job.owner.org,ownerEmail:job.owner.email,limitUsd:job.limits.usd,deadline:job.deadline})});
 const result=await response.json().catch(()=>null);if(!response.ok||result?.reserved!==true)throw problem(result?.error||'The global CAD model reservation failed.',response.ok?503:response.status);return result;
}
