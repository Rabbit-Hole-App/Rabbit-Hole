import { CAD_MODEL_TIMEOUT_MS } from './cad-model.js';
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
 const amount=name=>{const raw=env[name],value=Number(raw);if(raw===undefined||raw===''||!Number.isFinite(value)||value<0||value>35)throw problem('The CAD infrastructure allowance is not configured.');return Math.ceil(value*MICROS);};
 const fixedInfraMicros=amount('CAD_PRODUCTION_FIXED_INFRA_USD'),storageRateMicros=amount('CAD_PRODUCTION_STORAGE_USD_PER_GB_MONTH'),setupInfraMicros=amount('CAD_PRODUCTION_SETUP_INFRA_USD'),setupMonth=env.CAD_PRODUCTION_SETUP_INFRA_MONTH;
 if(storageRateMicros<=0||!/^\d{4}-(0[1-9]|1[0-2])$/.test(setupMonth||''))throw problem('The CAD infrastructure allowance is not configured.');
 return{maxMicros:Math.floor(usd*MICROS),fixedInfraMicros,storageRateMicros,setupInfraMicros,setupMonth,infraMaxMicros:35000000};
}
export function isCadProductionBudgetObject(state,env){return !!state.id&&!!env.CAD_JOBS&&String(state.id)===String(env.CAD_JOBS.idFromName(CAD_PRODUCTION_BUDGET_NAME));}
export function cadReservationMonths(now,deadline){
 if(!Number.isFinite(now)||!Number.isFinite(deadline)||deadline<=now)throw problem('The CAD job deadline has passed or is invalid.',409);
 const date=new Date(now),next=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1),following=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+2,1);
 if(deadline>=following)throw problem('A CAD job cannot reserve beyond the next calendar month.',400);
 const month=timestamp=>new Date(timestamp).toISOString().slice(0,7);
 return deadline>=next?[month(now),month(next)]:[month(now)];
}
// Decimal GB and rounded-up microdollars; the rate and fixed envelope must be
// conservatively verified at activation. This is admission accounting, not billing.
function infraProjection(ledger,config,month,extraBytes=0){
 const retainedBytes=(ledger.infrastructure?.retainedBytes||0)+extraBytes;
 if(!Number.isSafeInteger(retainedBytes)||retainedBytes<0)throw problem('The CAD infrastructure ledger cannot be read safely.');
 const storageMicros=Math.ceil(retainedBytes/1000000000*config.storageRateMicros),recordedMicros=ledger.infrastructure?.extras?.[month]||0;
 if(!Number.isSafeInteger(recordedMicros)||recordedMicros<0)throw problem('The CAD infrastructure ledger cannot be read safely.');
 const projectedMicros=config.fixedInfraMicros+storageMicros+recordedMicros+(month===config.setupMonth?config.setupInfraMicros:0);
 return{retainedBytes,storageMicros,recordedMicros,fixedMicros:config.fixedInfraMicros,setupMicros:month===config.setupMonth?config.setupInfraMicros:0,projectedMicros,limitMicros:config.infraMaxMicros,estimateOnly:true};
}
// Storage-only operation; CadJobs serializes all users/boards on the fixed DO.
export async function reserveCadProductionModel(storage,env,input,{now=Date.now()}={}){
 const config=cadProductionConfig(env);
 if(!input||!Number.isSafeInteger(input.artifactBytes)||input.artifactBytes<=0||['jobId','boardId','ownerOrg','ownerEmail'].some(key=>typeof input[key]!=='string'||!input[key]||input[key].length>300)||!Number.isFinite(input.limitUsd)||input.limitUsd<=0||input.limitUsd>10)throw problem('Invalid CAD model reservation.',400);
 const months=cadReservationMonths(now,input.deadline),micros=Math.ceil(input.limitUsd*MICROS),identity={boardId:input.boardId,ownerOrg:input.ownerOrg,ownerEmail:input.ownerEmail,micros};
 const ledger=await storage.get(CAD_PRODUCTION_BUDGET_KEY)||{version:1,months:{}};
 if(ledger.transferPause?.month===new Date(now).toISOString().slice(0,7))throw problem('The monthly CAD transfer allowance is exhausted. New CAD work is paused.',429);
 if(ledger.version!==1)throw problem('The CAD budget ledger cannot be read safely.');
 const retained=ledger.infrastructure?.jobs?.[input.jobId];
 const retainedIdentity={boardId:input.boardId,ownerOrg:input.ownerOrg,ownerEmail:input.ownerEmail,bytes:input.artifactBytes};
 if(retained&&JSON.stringify(retained)!==JSON.stringify(retainedIdentity))throw problem('This job already has a different artifact reservation.',409);
 const projectionMonths=new Set([...months,...Object.keys(ledger.infrastructure?.extras||{}).filter(month=>month>=months[0]),...(config.setupMonth>=months[0]?[config.setupMonth]:[])]);
 for(const month of projectionMonths){
  if(infraProjection(ledger,config,month,retained?0:input.artifactBytes).projectedMicros>config.infraMaxMicros){
   ledger.pause={month,reason:'infra_limit',at:now};await storage.put(CAD_PRODUCTION_BUDGET_KEY,ledger);
   throw problem(`The CAD infrastructure allowance for ${month} is reserved. New work is paused.`,429);
  }
 }
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
 if(!retained){
  ledger.infrastructure||={retainedBytes:0,jobs:{},extras:{}};
  Object.defineProperty(ledger.infrastructure.jobs,input.jobId,{value:retainedIdentity,enumerable:true,writable:true,configurable:true});
  ledger.infrastructure.retainedBytes+=input.artifactBytes;
 }
 if(fresh.length||!retained)await storage.put(CAD_PRODUCTION_BUDGET_KEY,ledger);
 return{reserved:true,reused:fresh.length===0,months,jobMicros:micros,totals:Object.fromEntries(months.map(month=>[month,ledger.months[month].reservedMicros]))};
}
export async function cadProductionBudgetStatus(storage,env,{now=Date.now()}={}){
 const ledger=await storage.get(CAD_PRODUCTION_BUDGET_KEY)||{months:{}},month=new Date(now).toISOString().slice(0,7);
 let config;try{config=cadProductionConfig(env);}catch{return{enabled:false,paused:true,reason:'not_configured',month};}
 const totals=Object.fromEntries(Object.entries(ledger.months).map(([key,value])=>[key,{reservedMicros:value.reservedMicros,remainingMicros:Math.max(0,config.maxMicros-value.reservedMicros)}]));
 const infrastructure=infraProjection(ledger,config,month);
 const transferPaused=ledger.transferPause?.month===month;
 return{enabled:true,month,maxMicros:config.maxMicros,totals,infrastructure,transferPaused,paused:infrastructure.projectedMicros>=config.infraMaxMicros||transferPaused||ledger.pause?.month===month||(totals[month]?.remainingMicros===0),reason:transferPaused?'monthly_transfer_limit':infrastructure.projectedMicros>=config.infraMaxMicros?'infra_limit':ledger.pause?.month===month?ledger.pause.reason:null,lastRefusal:ledger.pause||null,reservationsAreBilling:false};
}
// Include the entire bounded provider window even for a call admitted just before
// the job deadline. Aborting locally does not prove provider billing stopped;
// all reservations remain charged to this admission ledger without refunds.
export async function reserveCadProductionJob(env,job){
 cadProductionConfig(env);
 if(job.source&&!job.retainedStorage)throw problem('Existing CAD artifacts need retained-storage accounting before new production work.',409);
 if(!env.CAD_JOBS)throw problem('The global CAD model ledger is unavailable.');
 const response=await env.CAD_JOBS.get(env.CAD_JOBS.idFromName(CAD_PRODUCTION_BUDGET_NAME)).fetch('https://cad/production-model-reservation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:job.id,boardId:job.boardId,ownerOrg:job.owner.org,ownerEmail:job.owner.email,limitUsd:job.limits.usd,artifactBytes:job.limits.totalBytes,deadline:job.deadline+CAD_MODEL_TIMEOUT_MS})});
 const result=await response.json().catch(()=>null);if(!response.ok||result?.reserved!==true)throw problem(result?.error||'The global CAD model reservation failed.',response.ok?503:response.status);return result;
}

export async function pauseCadProductionTransfer(storage,env,{now=Date.now()}={}){
 cadProductionConfig(env);
 const ledger=await storage.get(CAD_PRODUCTION_BUDGET_KEY)||{version:1,months:{}};
 ledger.transferPause={month:new Date(now).toISOString().slice(0,7),at:now};
 await storage.put(CAD_PRODUCTION_BUDGET_KEY,ledger);
 return{paused:true,month:ledger.transferPause.month,reason:'monthly_transfer_limit'};
}
export async function reportCadProductionTransferPause(env){
 cadProductionConfig(env);
 if(!env.CAD_JOBS)throw problem('The global CAD model ledger is unavailable.');
 const response=await env.CAD_JOBS.get(env.CAD_JOBS.idFromName(CAD_PRODUCTION_BUDGET_NAME)).fetch('https://cad/production-transfer-pause',{method:'POST'});
 if(!response.ok)throw problem('The global CAD transfer pause could not be recorded.');
}

// Internal operator input is a monotonically increasing total for a UTC month,
// not an increment, so interrupted/repeated writes cannot charge it twice.
export async function recordCadInfrastructureExtras(storage,env,input){
 const config=cadProductionConfig(env);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input?.month||'')||!Number.isSafeInteger(input?.micros)||input.micros<0)throw problem('Invalid CAD infrastructure adjustment.',400);
 const ledger=await storage.get(CAD_PRODUCTION_BUDGET_KEY)||{version:1,months:{}};
 ledger.infrastructure||={retainedBytes:0,jobs:{},extras:{}};
 if(input.micros<(ledger.infrastructure.extras[input.month]||0))throw problem('Infrastructure adjustments cannot refund reserved cost.',409);
 ledger.infrastructure.extras[input.month]=input.micros;
 await storage.put(CAD_PRODUCTION_BUDGET_KEY,ledger);
 return infraProjection(ledger,config,input.month);
}

// Called inside the per-board mutation gate before R2 writes. The lifetime cap
// includes source objects and BOTH staged and published artifact copies.
export function reserveCadLifetimeBytes(job,key,bytes){
 if(typeof key!=='string'||!Number.isSafeInteger(bytes)||bytes<1||!Number.isSafeInteger(job.limits.totalBytes))throw problem('Invalid CAD retained storage reservation.',400);
 const ledger=job.retainedStorage||{bytes:0,objects:{}};
 if(Object.hasOwn(ledger.objects,key)){
  if(ledger.objects[key]!==bytes)throw problem('An immutable CAD storage reservation changed.',409);
  return;
 }
 if(!Number.isSafeInteger(ledger.bytes)||ledger.bytes+bytes>job.limits.totalBytes)throw problem('The CAD job lifetime retained-storage allowance is exhausted. Saved artifacts are retained.',413);
 Object.defineProperty(ledger.objects,key,{value:bytes,enumerable:true,writable:true,configurable:true});ledger.bytes+=bytes;job.retainedStorage=ledger;
}
