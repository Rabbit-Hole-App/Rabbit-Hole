// Durable CAD workflow. Storage/alarm ownership follows LearnScenes; execution
// follows FileJobs' attempt-scoped callback protocol. No browser advances a job.
import { repositoryIdentity } from './repositories.js';
import { sharedAccess } from './learn-boards.js';
import { memberContext } from './canvas-comments.js';
import { paidRefusal } from './learn-paid.js';
import { callbackToken, tokenValid } from './file-jobs.js';
import { learnMedia } from './learn-storage.js';
import { CAD_LIMITS, CAD_TERMINAL, cadLimits, cadJson, cadError, cadBody, cadHash, newCadId, decodeCadId, validateCadRequest, publicCadJob, cadBlock, validateDesign } from './cad-contract.js';
import { saveCadSource, putCadOutput, publishCadArtifacts, validateCadManifest, cadStageKey } from './cad-artifacts.js';
import { cadModelRequest, runCadModel, cadReferenceImages } from './cad-model.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { notifyCadBudget } from './cad-budget-alert.js';
import { cadProductionEnforced, cadProductionConfig, isCadProductionBudgetObject, reserveCadProductionModel, reserveCadProductionJob, cadProductionBudgetStatus, pauseCadProductionTransfer, reportCadProductionTransferPause, recordCadInfrastructureExtras, reserveCadLifetimeBytes } from './cad-production-budget.js';

const PREFIX = '/api/learn/cad/jobs';
const LEASE = 90000;
const secretEnv = env => ({FILE_JOB_SECRET:env.CAD_JOB_SECRET});
const configured = env => env.CAD_JOBS && env.LEARN_DB && learnMedia(env) && (env.CAD_JOB_SECRET || '').length >= 32 &&
  (/^https:\/\//.test(env.CAD_EXECUTOR_URL || '') || env.SMALL_ENV === 'test' && /^http:\/\/(127\.0\.0\.1|localhost):/.test(env.CAD_EXECUTOR_URL || '')) && env.CAD_EXECUTOR_TOKEN;
const reply = (job, accepted) => ({job:publicCadJob(job),block:cadBlock(job,accepted)});
const jobKey = id => `job:${id}`;

async function boardAccess(req, env, id, body, write) {
  const q = new URL(req.url).searchParams;
  let row, user;
  if (!write && q.get('share')) { const found=await sharedAccess(req,env,q.get('share')); if(found instanceof Response) return found; row=found.row; }
  else if (!write && q.get('member')) { const found=await memberContext(req,env,q.get('member')); if(found instanceof Response)return found; row=found.row || found.board; }
  else {
    user=await repositoryIdentity(req,env); if(user instanceof Response)return user;
    row=id ? await env.LEARN_DB.prepare('SELECT * FROM learn_boards WHERE id=? AND org=? AND owner_email=?').bind(id,user.org,user.email).first()
      : await env.LEARN_DB.prepare('SELECT * FROM learn_boards WHERE app=? AND board=? AND org=? AND owner_email=?').bind(body.app || q.get('app'),body.board || q.get('board') || 'main',user.org,user.email).first();
  }
  if (!row || id && row.id!==id) return cadJson({error:'Not available'},404);
  return {row,user};
}

export async function cadRoute(path, req, env) {
  if (path!==PREFIX && !path.startsWith(`${PREFIX}/`)) return null;
  try {
    if (!env.CAD_JOBS || !env.LEARN_DB) return cadJson({error:'CAD jobs are not configured on this preview.'},503);
    const rest=path.slice(PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent), id=rest[0], boardId=id?decodeCadId(id):null;
    if (rest[1]==='attempts') {
      const attempt=Number(rest[2]);
      if(!await tokenValid(secretEnv(env),req,id,attempt)) return cadJson({error:'Unauthorized'},401);
      const stub=env.CAD_JOBS.get(env.CAD_JOBS.idFromName(boardId));
      const url=new URL('https://cad/callback');url.searchParams.set('id',id);url.searchParams.set('attempt',String(attempt));url.searchParams.set('action',rest[3]||'');if(rest[4])url.searchParams.set('name',rest[4]);
      return stub.fetch(new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:req.body,duplex:'half'}));
    }
    if (!['GET','POST'].includes(req.method)) return cadJson({error:'Method not allowed'},405);
    const body=req.method==='POST'?await cadBody(req):{};
    const access=await boardAccess(req,env,boardId,body,req.method==='POST');if(access instanceof Response)return access;
    // Shared snapshots use their saved immutable artifact references. Live job
    // history may contain private later edits and must not escape that snapshot.
    if(!access.user)return cadJson({error:'Shared CAD cards expose saved artifacts, not private job history.'},403);
    if(req.method==='POST' && env.CAD_VERIFICATION_BOARD_ID && access.row.id!==env.CAD_VERIFICATION_BOARD_ID)return cadJson({error:'CAD generation is restricted to the approved verification canvas.'},403);
    if(req.method==='POST'&&(!id||['retry','clarify'].includes(rest[1]))){const refusal=subscriptionOwnerRefusal(env,access.user);if(refusal)return refusal;}
    if(req.method==='POST' && !id) {
      validateCadRequest({...body,board:body.board||'main'});
      const refusal=paidRefusal(body);if(refusal)return refusal;
      if(!configured(env) || env.CAD_MODEL_ENABLED!=='true' && env.SMALL_ENV!=='test') return cadJson({error:'CAD generation is unavailable until its isolated executor and model route are configured.',code:'cad_not_configured'},503);
    }
    const action=req.method==='GET'?(id?'get':'list'):(id?rest[1]:'create');
    if(!['get','list','create','cancel','clarify','retry','accept','exports','placement'].includes(action) || rest.length>2) return cadJson({error:'Not found'},404);
    if(['clarify','retry'].includes(action)){const refusal=paidRefusal(body);if(refusal)return refusal;}
    const origin=env.CAD_JOB_ORIGIN || new URL(req.url).origin;
    const stub=env.CAD_JOBS.get(env.CAD_JOBS.idFromName(access.row.id));
    return stub.fetch('https://cad/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id,payload:body,board:access.row,user:access.user,origin})});
  } catch(error){return cadJson({error:error.status?error.message:'CAD is temporarily unavailable.'},error.status||503);}
}

export class CadJobs {
  constructor(state,env){this.state=state;this.env=env;this.activeModels=new Set();this.publications=new Set();this.budgetAlerts=new Set();}
  async locked(fn){
    // Cloudflare resets an object when an exception escapes this callback.
    // Expected conflicts must leave the short gate before being rethrown.
    const outcome=await this.state.blockConcurrencyWhile(async()=>{try{return {value:await fn()};}catch(error){return {error:{message:error.message,status:error.status}};}});
    if(outcome.error)throw Object.assign(new Error(outcome.error.message),{status:outcome.error.status});
    return outcome.value;
  }
  async save(job){job.updatedAt=Date.now();await this.state.storage.put(jobKey(job.id),job);}
  async wake(delay=50){const at=Date.now()+delay,current=await this.state.storage.getAlarm();if(!current||current>at)await this.state.storage.setAlarm(at);}
  async accepted(job){return this.state.storage.get(`model:${job.modelId}`);}
  async response(job,status=200){return cadJson(reply(job,await this.accepted(job)),status);}
  async notifyModelBudget(){
    const status=await this.locked(()=>cadProductionBudgetStatus(this.state.storage,this.env));
    if(status.transferPaused)return;
    const month=status.lastRefusal?status.month:null,kind=status.lastRefusal?.reason==='infra_limit'?'infrastructure':'model',alertId=`${kind}:${month}`;
    if(!month||this.budgetAlerts.has(alertId))return;
    this.budgetAlerts.add(alertId);
    try {
      const key=`production:${kind}-alert:${month}`;
      if(await this.state.storage.get(key))return;
      // No external request runs inside the global reservation mutex.
      if(await notifyCadBudget(this.env,{month,kind}))await this.state.storage.put(key,true);
    } finally {this.budgetAlerts.delete(alertId);}
  }
  async fetch(req){
    try {
      const path=new URL(req.url).pathname;
      if(path==='/production-model-reservation'){
        if(req.method!=='POST'||!isCadProductionBudgetObject(this.state,this.env))return cadJson({error:'Not found'},404);
        const input=await req.json();
        try{return cadJson(await this.locked(()=>reserveCadProductionModel(this.state.storage,this.env,input)));}
        catch(error){
          if(error.status===429)try{await this.notifyModelBudget();}catch{/* Notification cannot change admission or expose private errors. */}
          throw error;
        }
      }
      if(path==='/production-infrastructure-adjustment'){
        if(req.method!=='POST'||!isCadProductionBudgetObject(this.state,this.env))return cadJson({error:'Not found'},404);
        const input=await req.json();return cadJson(await this.locked(()=>recordCadInfrastructureExtras(this.state.storage,this.env,input)));
      }
      if(path==='/production-transfer-pause'){
        if(req.method!=='POST'||!isCadProductionBudgetObject(this.state,this.env))return cadJson({error:'Not found'},404);
        return cadJson(await this.locked(()=>pauseCadProductionTransfer(this.state.storage,this.env)));
      }
      if(path==='/production-budget-status'){
        if(req.method!=='GET'||!isCadProductionBudgetObject(this.state,this.env))return cadJson({error:'Not found'},404);
        return cadJson(await this.locked(()=>cadProductionBudgetStatus(this.state.storage,this.env)));
      }
      if(isCadProductionBudgetObject(this.state,this.env))return cadJson({error:'Not found'},404);
      if(path==='/callback')return await this.callback(req);
      const input=await req.json();
      // Only short persisted mutations are serialized. Network/model work runs from alarms.
      return await this.locked(()=>this.action(input));
    } catch(error){return cadJson({error:error.status?error.message:'CAD operation could not complete.'},error.status||503);}
  }
  async action({action,id,payload={},board,user,origin}) {
    if(action==='list'){
      const jobs=[...(await this.state.storage.list({prefix:'job:'})).values()].filter(j=>!j.hidden);
      // One current job per card; a later edit supersedes the older status card.
      const latest=new Map();for(const j of jobs.sort((a,b)=>a.createdAt-b.createdAt))latest.set(j.cardId,j);
      const items=await Promise.all([...latest.values()].map(async j=>reply(j,await this.accepted(j))));
      return cadJson({jobs:items.map(x=>x.job),blocks:items.map(x=>x.block)});
    }
    if(action==='create') {
      if(cadProductionEnforced(this.env))cadProductionConfig(this.env);
      const fingerprint=await cadHash(JSON.stringify([payload.cardId,payload.prompt,payload.context??null,payload.baseRevisionId??null]));
      const existing=await this.state.storage.get(`request:${payload.requestId}`);
      if(existing){if(existing.fingerprint!==fingerprint)throw cadError('Request identity belongs to a different CAD request',409);return this.response(await this.state.storage.get(jobKey(existing.id)));}
      const jobs=await this.state.storage.list({prefix:'job:'});if(jobs.size>=CAD_LIMITS.jobs)throw cadError('This canvas has reached its CAD job limit.',429);
      if([...jobs.values()].some(j=>j.cardId===payload.cardId && !CAD_TERMINAL.has(j.state) && !j.hidden))throw cadError('This card already has an active CAD job.',409);
      let modelId,previous;
      if(payload.baseRevisionId){
        previous=[...(await this.state.storage.list({prefix:'model:'})).values()].find(m=>m.cardId===payload.cardId && m.revisionId===payload.baseRevisionId);
        if(!previous)throw cadError('The model has changed. Reload before editing.',409);modelId=previous.modelId;
      } else if([...jobs.values()].some(j=>j.cardId===payload.cardId))throw cadError('This card already has a CAD model.',409);
      if(!payload.baseRevisionId){const state=JSON.parse(board.state_json||'{}');if((state.blocks||[]).some(b=>b.id===payload.cardId))throw cadError('This destination already contains a canvas card.',409);}
      id=newCadId(board.id);
      const limits=cadLimits(this.env),now=Date.now(),job={id,app:board.app,board:board.board,boardId:board.id,owner:{org:user.org,email:user.email,userId:user.userId||user.user_id},origin,
        cardId:payload.cardId,modelId:modelId||id,revisionId:`cr_${crypto.randomUUID().replaceAll('-','')}`,baseRevisionId:payload.baseRevisionId||null,
        prompt:payload.prompt.trim(),context:payload.context??null,state:'queued',stage:'queued',attempt:1,calls:0,repairs:0,reservedUsd:0,limits,
        createdAt:now,updatedAt:now,deadline:now+limits.elapsedMs,operation:'build',hidden:false,limitations:[],previousBrief:previous?.brief,previousSource:previous?.sourceText};
      // Alarm first: if saving fails it wakes harmlessly. Save and request fence are atomic.
      await this.wake();await this.state.storage.put({[jobKey(id)]:job,[`request:${payload.requestId}`]:{id,fingerprint}});
      return this.response(job,202);
    }
    const job=await this.state.storage.get(jobKey(id));if(!job)throw cadError('Not available',404);
    if(action==='get')return this.response(job);
    if(action==='placement'){
      if(typeof payload.hidden!=='boolean')throw cadError('A placement visibility is required');
      job.hidden=payload.hidden;
      // Hide every revision job so an older card cannot be resurrected by listing.
      for(const [key,other] of await this.state.storage.list({prefix:'job:'}))if(other.cardId===job.cardId){other.hidden=payload.hidden;await this.state.storage.put(key,other);}
      if(payload.hidden&&(!CAD_TERMINAL.has(job.state)||job.exportState==='preparing')){job.state='cancelled';job.stage='cancelled';job.cancelPending=true;job.pendingResult=null;job.exportState=job.exportState==='preparing'?'failed':job.exportState;}
      await this.save(job);await this.wake();return this.response(job);
    }
    if(action==='cancel'){
      if(job.exportState==='preparing'){job.exportState='failed';job.exportError='Export cancelled.';job.cancelPending=true;job.pendingResult=null;await this.save(job);await this.wake();return this.response(job);}
      if(job.state==='ready'&&job.awaitingAccept){job.awaitingAccept=false;job.state='cancelled';job.stage='cancelled';await this.save(job);return this.response(job);}
      if(!CAD_TERMINAL.has(job.state)){job.state='cancelled';job.stage='cancelled';job.cancelPending=true;job.pendingResult=null;await this.save(job);await this.wake();}
      return this.response(job);
    }
    if(action==='accept'){
      const current=await this.accepted(job);
      if(!job.awaitingAccept || job.state!=='ready' || !current || payload.expectedRevisionId!==current.revisionId || job.baseRevisionId!==current.revisionId)throw cadError('The accepted model changed. This preview cannot replace it.',409);
      await this.state.storage.put(`model:${job.modelId}`,this.modelRecord(job));job.awaitingAccept=false;await this.save(job);return this.response(job);
    }
    if(action==='clarify'){
      if(cadProductionEnforced(this.env))cadProductionConfig(this.env);
      if(job.state!=='waiting_for_answer'||typeof payload.answer!=='string'||!payload.answer.trim()||payload.answer.length>4000)throw cadError('Answer the pending design question.');
      job.answer=payload.answer;job.question=null;job.state='queued';job.stage='queued';job.deadline=Date.now()+job.limits.elapsedMs;await this.wake();await this.save(job);return this.response(job,202);
    }
    if(action==='retry'){
      if(cadProductionEnforced(this.env))cadProductionConfig(this.env);
      if(!['failed','cancelled'].includes(job.state))throw cadError('Only a failed or cancelled job can be retried.',409);
      if(job.pendingResult&&job.state==='failed'){
        job.state='checking';job.stage='publishing';job.error=null;job.deadline=Date.now()+job.limits.elapsedMs;
        await this.wake();await this.save(job);return this.response(job,202);
      }
      if(job.calls>=job.limits.calls||job.reservedUsd>=job.limits.usd)throw cadError('This job reached its accepted budget. Start a new explicitly confirmed request.',429);
      if(job.state==='failed'&&job.modelPhase==='review'&&['step','glb','thumbnail'].every(kind=>job.manifest?.artifacts.some(a=>a.kind===kind))){
        // A failed model review does not invalidate the already checked geometry.
        // Keep its attempt-scoped thumbnail and retry only the explicitly confirmed review.
        job.state='checking';job.stage='checking';job.error=null;job.modelInFlight=null;job.deadline=Date.now()+job.limits.elapsedMs;
        await this.wake();await this.save(job);return this.response(job,202);
      }
      if(job.manifest?.artifacts.some(a=>a.kind==='step')){
        const missing=['glb','thumbnail'].find(kind=>!job.manifest.artifacts.some(a=>a.kind===kind));
        if(missing){job.operation='export';job.exportFormat=missing;job.previewRecovery=true;}
      }
      job.pendingResult=null;job.attempt++;job.state=job.source?'building':'queued';job.stage=job.state;job.error=null;job.modelInFlight=null;job.dispatchAt=null;job.leaseUntil=null;job.deadline=Date.now()+job.limits.elapsedMs;job.hidden=false;await this.wake();await this.save(job);return this.response(job,202);
    }
    if(action==='exports'){
      if(!['stl','3mf'].includes(payload.format))throw cadError('Choose STL or 3MF.');
      const model=await this.accepted(job);if(!model?.manifest||model.revisionId!==job.revisionId)throw cadError('Accept this model before exporting it.',409);
      if(job.state!=='ready'||job.exportState==='preparing')throw cadError('Another operation is running.',409);
      if(job.manifest.artifacts.some(a=>a.kind===payload.format))return this.response(job);
      job.operation='export';job.exportFormat=payload.format;job.attempt++;job.exportState='preparing';job.exportError=null;job.dispatchAt=null;job.leaseUntil=null;job.deadline=Date.now()+job.limits.elapsedMs;
      await this.wake();await this.save(job);return this.response(job,202);
    }
    throw cadError('Unknown CAD action',404);
  }
  modelRecord(job){return {modelId:job.modelId,cardId:job.cardId,revisionId:job.revisionId,manifest:job.manifest,brief:job.brief,sourceText:job.sourceText};}
  async executor(path,body){return fetch(new URL(path,this.env.CAD_EXECUTOR_URL),{method:'POST',headers:{Authorization:`Bearer ${this.env.CAD_EXECUTOR_TOKEN}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(20000)});}
  async fail(job,message){
    if(job.operation==='export'&&job.manifest){job.exportState='failed';job.exportError=message;job.operation='build';}
    else {job.state='failed';job.stage='failed';job.error=message;}
    job.modelInFlight=null;await this.save(job);
  }
  async alarm(){
    // Re-arm before network work, so a terminated isolate always gets a recovery turn.
    await this.state.storage.setAlarm(Date.now()+30000);
    const entries=await this.state.storage.list({prefix:'job:'});let active=false;
    for(const [,snapshot] of entries){
      let job=await this.state.storage.get(jobKey(snapshot.id));
      if(job.cancelPending){await this.executor(`/jobs/${encodeURIComponent(job.id)}/${job.attempt}/cancel`).catch(()=>{});job=await this.state.storage.get(jobKey(job.id));job.cancelPending=false;await this.save(job);}
      if((CAD_TERMINAL.has(job.state)&&job.exportState!=='preparing')||job.state==='waiting_for_answer')continue;
      active=true;
      try {await this.advance(job);}catch(error){const current=await this.state.storage.get(jobKey(job.id));if(current&&current.state!=='cancelled')await this.fail(current,error.status?error.message:'CAD execution was interrupted. Retry explicitly.');}
    }
    if(active)await this.wake(1000);else await this.state.storage.deleteAlarm();
  }
  async advance(job){
    if(Date.now()>job.deadline)return this.fail(job,'CAD reached its accepted time limit.');
    if(job.pendingResult)return this.publish(job);
    if(job.dispatchAfter>Date.now())return;
    if(job.modelInFlight){if(this.activeModels.has(job.id))return;return this.fail(job,'A model request was interrupted; its cost may be unknown. Retry explicitly to continue.');}
    if(job.state==='queued'||job.state==='repairing'||job.modelPhase==='review'){
      const review=job.modelPhase==='review';let image;
      if(review){const artifact=job.manifest?.artifacts.find(a=>a.kind==='thumbnail');const staged=artifact&&await learnMedia(this.env).get(cadStageKey(job,artifact.name));if(staged){const bytes=new Uint8Array(await staged.arrayBuffer());if(bytes.length>1024*1024)throw cadError('CAD review thumbnail is too large.');image=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));}else throw cadError('CAD review thumbnail is unavailable.');}
      const reference=review?{blocks:[]}:await cadReferenceImages(this.env,job);
      const prepared=cadModelRequest(job,{review,image,pictures:reference.blocks||[]});
      // Global network reservation occurs outside the per-board concurrency gate.
      if(cadProductionEnforced(this.env))await reserveCadProductionJob(this.env,job);
      const reserved=await this.locked(async()=>{
        const current=await this.state.storage.get(jobKey(job.id));
        // Thumbnail/reference I/O may have yielded to Cancel, removal or Retry.
        // Recheck before spending, and persist both counters and the in-flight fence together.
        if(!current||current.attempt!==job.attempt||current.state!==job.state||current.state==='cancelled'||current.hidden||current.modelInFlight)return false;
        if(cadProductionEnforced(this.env))cadProductionConfig(this.env);
        if(Date.now()>=current.deadline)throw cadError('CAD reached its accepted time limit.',409);
        job=current;
        if(reference.notice&&!job.limitations.includes(reference.notice))job.limitations.push(reference.notice);
        if(job.calls+1>job.limits.calls||job.reservedUsd+prepared.reservedUsd>job.limits.usd)throw cadError('CAD reached its accepted model-call or spend limit.',429);
        // One explicitly scoped verification canvas shares a durable allowance across
        // all four scenarios, failures and restarts. Never refund uncertain requests.
        if(this.env.CAD_VERIFICATION_BOARD_ID){
          if(job.boardId!==this.env.CAD_VERIFICATION_BOARD_ID)throw cadError('CAD verification canvas does not match.',403);
            const usage=await this.state.storage.get('verification:usage')||{calls:0,reservedUsd:0};
            const maxCalls=Number(this.env.CAD_VERIFICATION_MAX_CALLS),maxUsd=Number(this.env.CAD_VERIFICATION_MAX_USD);
            if(!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>11||!Number.isFinite(maxUsd)||maxUsd<=0||maxUsd>1.10)throw cadError('CAD verification allowance is not configured.',503);
            if(usage.calls+1>maxCalls||usage.reservedUsd+prepared.reservedUsd>maxUsd)throw cadError('CAD verification allowance has been reached.',429);
            await this.state.storage.put('verification:usage',{calls:usage.calls+1,reservedUsd:usage.reservedUsd+prepared.reservedUsd});
        }
        job.calls++;job.reservedUsd+=prepared.reservedUsd;job.operationKey=`cad-${job.id.replace(/\W/g,'')}-${job.calls}`;
        job.modelInFlight=job.operationKey;job.state=review?'checking':'preparing';job.stage=job.state;await this.save(job);
        return true;
      });
      if(!reserved)return;
      this.activeModels.add(job.id);
      let result;try{result=await runCadModel(this.env,job,prepared);}finally{this.activeModels.delete(job.id);}
      const current=await this.state.storage.get(jobKey(job.id));if(current.state==='cancelled'||current.attempt!==job.attempt)return;
      job=current;job.modelInFlight=null;
      if(review){
        if(result?.accepted!==true){if(job.repairs>=Math.min(job.limits.repairs,cadLimits(this.env).repairs))return this.fail(job,'The model did not pass visual review within the repair limit.');job.repairs++;job.repairReason=JSON.stringify(result.problems||[]).slice(0,2000);job.previousSource=job.sourceText;job.previousBrief=job.brief;job.attempt++;job.revisionId=`cr_${crypto.randomUUID().replaceAll('-','')}`;job.state='repairing';job.modelPhase=null;job.dispatchAt=null;job.leaseUntil=null;await this.save(job);return;}
        job.modelPhase=null;job.state='ready';job.stage='ready';job.awaitingAccept=!!job.baseRevisionId;
        if(!job.awaitingAccept)await this.state.storage.put(`model:${job.modelId}`,this.modelRecord(job));await this.save(job);return;
      }
      const design=validateDesign(result);
      if(design.question){job.question=design.question;job.state='waiting_for_answer';job.stage=job.state;await this.save(job);return;}
      if(cadProductionEnforced(this.env)){
        const current=await this.locked(async()=>{
          const saved=await this.state.storage.get(jobKey(job.id));
          if(saved.state==='cancelled'||saved.attempt!==job.attempt)return null;
          reserveCadLifetimeBytes(saved,`source:${job.revisionId}`,new TextEncoder().encode(design.source).length);await this.save(saved);return saved;
        });
        if(!current)return;job.retainedStorage=current.retainedStorage;
      }
      job.brief=design.brief;job.checks=design.checks;job.sourceText=design.source;job.source=await saveCadSource(this.env,job,design.source);
      const afterSource=await this.state.storage.get(jobKey(job.id));if(afterSource.state==='cancelled'||afterSource.attempt!==job.attempt)return;
      job.state='building';job.stage='building';await this.save(job);return;
    }
    if(job.dispatchAt){if(job.leaseUntil<Date.now())return this.fail(job,'The CAD executor stopped responding. Saved artifacts are retained; retry explicitly.');return;}
    const exportStep=job.operation==='export'?job.manifest.artifacts.find(a=>a.kind==='step'):null;
    const base=`${job.origin}${PREFIX}/${encodeURIComponent(job.id)}/attempts/${job.attempt}`;
    const callback=await callbackToken(secretEnv(this.env),job.id,job.attempt);
    const body={schema:'cad-execute/1',job_id:job.id,attempt:job.attempt,revision_id:job.revisionId,operation:job.operation,
      source:{url:`${base}/source`,bytes:exportStep?.bytes||job.source.bytes,sha256:exportStep?.sha256||job.source.sha256},
      requirements:{units:job.brief.units,checks:job.checks||[]},formats:exportStep?[job.exportFormat]:['step','glb','thumbnail'],
      limits:{stage_seconds:job.limits.stageSeconds,total_seconds:job.limits.executionSeconds,memory_bytes:job.limits.memoryBytes,workspace_bytes:job.limits.workspaceBytes,artifact_bytes:job.limits.artifactBytes,total_artifact_bytes:job.limits.totalBytes},callback:{url:base,...callback}};
    // Persist ownership before dispatch. Re-dispatch of a lost HTTP response is never automatic.
    job.dispatchAt=Date.now();job.leaseUntil=Date.now()+LEASE;await this.save(job);
    const response=await this.executor('/jobs',body);
    const current=await this.state.storage.get(jobKey(job.id));if(current.state==='cancelled')return;
    if(response.status===429){
      const refusal=await response.json().catch(()=>null);
      if(refusal?.code==='budget_exhausted'||refusal?.error==='budget_exhausted'){
        try{if(cadProductionEnforced(this.env))await reportCadProductionTransferPause(this.env);}
        finally{await this.fail(current,'The monthly CAD executor transfer allowance is exhausted. New work is paused; saved artifacts are retained.');}
        return;
      }
      current.dispatchAt=null;current.leaseUntil=null;current.dispatchAfter=Date.now()+10000;current.stage='queued';await this.save(current);return;}
    if(!response.ok)await this.fail(current,'The isolated CAD executor did not accept this attempt. Retry explicitly.');
  }
  async publish(snapshot){
    if(this.publications.has(snapshot.id))return;
    this.publications.add(snapshot.id);
    try{
      if(cadProductionEnforced(this.env)){
        await reserveCadProductionJob(this.env,snapshot);
        for(const output of snapshot.pendingResult?.outputs||[]){
          if(snapshot.retainedStorage?.objects?.[`output:${snapshot.attempt}:${output.name}`]!==output.bytes*2)throw cadError('CAD artifact storage was not reserved before publication.',409);
        }
      }
      // R2 stream copies and D1 writes must never hold the 30-second DO gate.
      const body=snapshot.pendingResult,manifest=await publishCadArtifacts(this.env,snapshot,body);
      return await this.locked(async()=>{
        const job=await this.state.storage.get(jobKey(snapshot.id));
        if(job.attempt!==snapshot.attempt||job.state==='cancelled'||job.hidden||(snapshot.operation==='export'&&!snapshot.previewRecovery&&job.exportState!=='preparing'))throw cadError('Stale CAD publication',409);
        if(job.completedAttempt===job.attempt)return cadJson({committed:true,repeat:true});
        job.manifest=manifest;job.completedAttempt=job.attempt;job.pendingResult=null;
        job.limitations=body.validation?.unchecked||body.validation?.checks?.filter(c=>c.status==='unchecked').map(c=>c.reason||c.id||c.kind)||[];
        if(job.operation==='export'&&!job.previewRecovery){
          job.exportState='ready';job.operation='build';
          if((await this.accepted(job))?.revisionId===job.revisionId)await this.state.storage.put(`model:${job.modelId}`,this.modelRecord(job));
        }else{
          job.operation='build';job.previewRecovery=false;
          const missing=['glb','thumbnail'].filter(kind=>!job.manifest.artifacts.some(a=>a.kind===kind));
          if(missing.length){job.state='failed';job.stage='failed';job.error=`Geometry was saved; ${missing.join(' and ')} is unavailable. Retry prepares missing previews from the saved STEP without generating another design.`;}
          else{job.modelPhase='review';job.state='checking';job.stage='checking';}
        }
        await this.wake();await this.save(job);return cadJson({committed:true});
      });
    }catch(error){
      console.warn('CAD artifact publication failed',JSON.stringify({job:snapshot.id,attempt:snapshot.attempt,status:error.status||503,message:String(error.message).replace(/https?:\/\/\S+/g,'[url]').slice(0,300)}));throw error;
    }finally{this.publications.delete(snapshot.id);}
  }
  async callback(req){
    const url=new URL(req.url),id=url.searchParams.get('id'),attempt=Number(url.searchParams.get('attempt')),action=url.searchParams.get('action'),name=url.searchParams.get('name');
    let job=await this.state.storage.get(jobKey(id));
    if(job&&job.attempt===attempt&&job.completedAttempt===attempt&&action==='complete'&&req.method==='POST'&&job.state!=='cancelled'&&!job.hidden)return cadJson({committed:true,repeat:true});
    if(!job||job.attempt!==attempt||job.state==='cancelled'||job.state==='failed'||job.hidden)throw cadError('Stale CAD attempt',409);
    if(action==='source'&&req.method==='GET'){
      let key=job.source?.key;
      if(job.operation==='export'){const item=job.manifest.artifacts.find(a=>a.kind==='step');const row=await this.env.LEARN_DB.prepare('SELECT r2_key FROM file_derivatives WHERE source_id=? AND sha256=? AND kind=?').bind(job.source.id,item.sha256,'step').first();key=row?.r2_key;}
      const object=key&&await learnMedia(this.env).get(key);if(!object)throw cadError('Source unavailable',404);
      return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(object.size),'Cache-Control':'no-store'}});
    }
    if(action==='outputs'&&req.method==='PUT'){
      if(job.completedAttempt===attempt||CAD_TERMINAL.has(job.state)&&job.exportState!=='preparing')throw cadError('Stale CAD attempt',409);
      const length=Number(req.headers.get('content-length'));
      if(!Number.isSafeInteger(length)||length<1||length>job.limits.artifactBytes)throw cadError('Artifact exceeds its size limit',413);
      if(cadProductionEnforced(this.env))await reserveCadProductionJob(this.env,job);
      // Reserve output names/bytes before streaming so parallel callbacks cannot
      // exceed aggregate disk/storage limits with individually valid artifacts.
      await this.locked(async()=>{
        const current=await this.state.storage.get(jobKey(id));
        if(current.attempt!==attempt||current.state==='cancelled')throw cadError('Stale CAD attempt',409);
        const uploads=current.uploads?.attempt===attempt?current.uploads:{attempt,files:{}};
        if(!uploads.files[name]&&(Object.keys(uploads.files).length>=12||Object.values(uploads.files).reduce((n,x)=>n+x,0)+length>job.limits.totalBytes))throw cadError('CAD staging limit reached',413);
        if(uploads.files[name]&&uploads.files[name]!==length)throw cadError('Artifact length changed',409);
        if(cadProductionEnforced(this.env))reserveCadLifetimeBytes(current,`output:${attempt}:${name}`,length*2);
        uploads.files[name]=length;current.uploads=uploads;await this.save(current);
      });
      return cadJson(await putCadOutput(this.env,job,name,req),201);
    }
    if(req.method!=='POST')throw cadError('Method not allowed',405);
    const body=await cadBody(req,128000);
    if(action==='complete'){
      const reserved=await this.locked(async()=>{
        const current=await this.state.storage.get(jobKey(id));
        if(current.attempt!==attempt||current.state==='cancelled'||current.hidden)throw cadError('Stale CAD attempt',409);
        if(current.completedAttempt===attempt)return {done:true};
        validateCadManifest(current,body);current.pendingResult=body;current.stage='publishing';
        await this.wake();await this.save(current);return {job:current};
      });
      if(reserved.done)return cadJson({committed:true,repeat:true});
      return await this.publish(reserved.job)||cadJson({publishing:true},202);
    }
    return this.locked(async()=>{
      job=await this.state.storage.get(jobKey(id));if(job.attempt!==attempt||job.state==='cancelled'||job.hidden)throw cadError('Stale CAD attempt',409);
      if(action==='complete'&&job.completedAttempt===attempt)return cadJson({committed:true,repeat:true});
      if(CAD_TERMINAL.has(job.state)&&job.exportState!=='preparing')throw cadError('Stale CAD attempt',409);
      if(action==='progress'){
        if(job.completedAttempt===attempt)throw cadError('This attempt already completed',409);
        if(!['building','checking','exporting'].includes(body.stage))throw cadError('Invalid stage');
        if(job.operation!=='export'){job.stage=body.stage;job.state=body.stage;}job.leaseUntil=Date.now()+LEASE;await this.save(job);return cadJson({lease_until:job.leaseUntil});
      }
      if(action==='fail'){
        job.failureCode=typeof body.error==='string'&&/^[a-z_]{1,80}$/.test(body.error)?body.error:'executor_failed';
        // A delayed transport failure cannot erase a durably accepted completion.
        if(job.pendingResult){await this.save(job);await this.wake();return cadJson({publishing:true},202);}
        if(job.operation==='build'&&['execution_failed','validation_failed'].includes(body.error)&&typeof body.diagnostics==='string'&&body.diagnostics.trim()&&job.repairs<Math.min(job.limits.repairs,cadLimits(this.env).repairs)){
          job.repairs++;job.repairReason=body.diagnostics.slice(0,8000);job.previousSource=job.sourceText;job.previousBrief=job.brief;
          job.attempt++;job.revisionId=`cr_${crypto.randomUUID().replaceAll('-','')}`;job.state='repairing';job.stage='repairing';job.dispatchAt=null;job.leaseUntil=null;await this.wake();await this.save(job);return cadJson({repairing:true});
        }
        await this.fail(job,'The CAD executor could not complete this attempt. Valid saved artifacts are retained.');return cadJson({failed:true});
      }
      throw cadError('Unknown callback',404);
    });
  }
}
