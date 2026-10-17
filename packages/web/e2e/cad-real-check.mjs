// Bounded real CAD verification. Invocation is intentionally separate from fixture checks.
// Owner must confirm deployed subscription/budget routing before setting RUN_CAD_REAL.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const env=process.env;
assert.equal(env.RUN_CAD_REAL,'approved-four-scenarios');
assert.equal(env.CAD_ROUTE_VERIFIED,'true','Owner must verify subscription access/billing route first');
assert.equal(env.CAD_BUDGET_GUARD_VERIFIED,'11-calls-1.10-usd','Confirm persisted deployed guard, not a client estimate');
const base=env.BASE,app=env.CAD_VERIFICATION_APP,board=env.CAD_VERIFICATION_BOARD||'main',boardId=env.CAD_VERIFICATION_BOARD_ID,session=env.SMALL_SESSION;
assert.equal(base,'https://rabbit-hole-web-dev-cad-integration.tryrabbithole.workers.dev');
for(const value of [app,boardId,session,env.CANDIDATE_SHA])assert.ok(value,'Required dev verification configuration is missing');
const out=resolve(env.OUT||'e2e/shots/cad-real');mkdirSync(out,{recursive:true});
const receipt=resolve(out,'results.json');assert.ok(!existsSync(receipt),'Existing receipt: stop rather than rerun paid scenarios');
const resumeId=env.CAD_RESUME_JOB_ID,expectedResumeId='cj.ODE4Nzc3MDgtZmE4MC00ZTQxLWJjY2MtMTM2OTc1MDRjZDE5.c2350817297f4a0ebd95a485af9cc7ac';
let priorReceipt;
if(resumeId){
 assert.equal(env.CAD_RESUME_MODE,'retry-saved-source-once');assert.equal(resumeId,expectedResumeId);
 assert.equal(env.CAD_RESUME_EXECUTOR_ATTEMPTS,'3','Confirm capacity for three remaining executor attempts');
 assert.equal(env.CAD_REPAIRS_DISABLED_VERIFIED,'true','Verify automatic repairs disabled for existing and new jobs');
 assert.ok(env.CAD_PRIOR_RECEIPT,'Prior failed receipt is required');assert.notEqual(resolve(env.CAD_PRIOR_RECEIPT),receipt);
 priorReceipt=JSON.parse(readFileSync(env.CAD_PRIOR_RECEIPT,'utf8'));
 assert.equal(priorReceipt.app,app);assert.equal(priorReceipt.boardId,boardId);assert.equal(priorReceipt.base,base);
 assert.equal(priorReceipt.jobsCreated,1);assert.equal(priorReceipt.results.length,1);
 assert.equal(priorReceipt.results[0].name,'simple dimensioned part');assert.equal(priorReceipt.results[0].status,'failed');
 assert.ok(priorReceipt.results[0].error.includes(expectedResumeId));assert.equal(priorReceipt.usageAfter.usedMicros,14210);
 assert.equal(priorReceipt.usageAfter.reservedMicros,0);assert.equal(priorReceipt.usageAfter.unknownAttempts,0);
 assert.equal(env.CAD_PRIOR_PROVIDER_REQUESTS,'1','Confirm reconciled first-run provider request count');
}
const results=[],started=Date.now(),scope=`?app=${encodeURIComponent(app)}&board=${encodeURIComponent(board)}`;
const report={sha:env.CANDIDATE_SHA,base,app,boardId,startedAt:new Date().toISOString(),expectedProviderRequests:7,maximumProviderRequests:11,maximumUsd:1.10,providerRequestCount:null,actualCostUsd:null,results,limits:['No automatic scenario retry or new jobs beyond four.','Actual provider count/cost require per-operation ledger reconciliation; monthly usage is not attributed cost.','Hole count, centers, pocket depth and feature preservation require additional trusted inspection; current validator cannot establish them.','This API harness does not substitute for deployed UI placement/preview/reload browser evidence.']};
if(priorReceipt)report.resume={jobId:resumeId,priorSha:priorReceipt.sha,priorReceiptSha256:createHash('sha256').update(readFileSync(env.CAD_PRIOR_RECEIPT)).digest('hex'),startingProviderRequests:1,startingActualCostUsd:0.01421,expectedAdditionalProviderRequests:6,maximumAdditionalProviderRequests:10,remainingProviderCeilingUsd:1.08579,remainingExecutorAttempts:3,automaticRepairsDisabled:true,countsScope:'Current resume pass only; prior failed run is retained separately',globalGuard:'Existing persisted eleven-request/$1.10 guard is not reset',retryIssued:false};
const save=()=>writeFileSync(receipt,JSON.stringify(report,null,2));save();
const api=async(path,method='GET',body)=>{
 const response=await fetch(base+path,{method,headers:{cookie:`small_session=${session}`,origin:base,'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(30000),...(body===undefined?{}:{body:JSON.stringify(body)})});
 assert.ok(response.ok,`${method} ${path.split('?')[0]} returned ${response.status}`);return response.json();
};
const jobPath=id=>`/api/learn/cad/jobs/${encodeURIComponent(id)}`;
const usage=async()=>{try{const value=await api('/api/learn/usage');return Object.fromEntries(['usedMicros','reservedMicros','estimatedMicros','unknownAttempts','unknownReservedMicros','unavailable'].filter(k=>k in value).map(k=>[k,value[k]]));}catch{return {unavailable:'access'};}};
const poll=async id=>{const end=Date.now()+16*60*1000;while(Date.now()<end){const result=await api(jobPath(id)+scope);if(['ready','failed','cancelled','waiting_for_answer'].includes(result.job.state))return result;await new Promise(r=>setTimeout(r,3000));}throw Error('Bounded wait expired; existing job retained; no retry issued');};
let created=0;
const create=async(prompt,extra={})=>{assert.ok(++created<=(resumeId?3:4));return api('/api/learn/cad/jobs','POST',{app,board,cardId:randomUUID(),requestId:randomUUID(),prompt,context:null,confirmed:true,...extra});};
const close=(actual,wanted)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-wanted)<=0.01,`Measured ${actual} expected ${wanted}`);
async function inspect(result,expected){
 assert.equal(result.job.state,'ready');const m=result.job.manifest;
 assert.equal(m.revisionId,result.job.revisionId);assert.equal(m.units,'mm');assert.equal(m.validation.baselinePassed,true);
 for(const [axis,value] of Object.entries(expected.bounds))close(m.validation.facts.bounds_mm[axis],value);
 assert.equal(m.validation.facts.solid_count,1);if(expected.volume)close(m.validation.facts.volume_mm3,expected.volume);
 const artifacts=[];
 for(const kind of ['step','glb','thumbnail']){
  const artifact=m.artifacts.find(a=>a.kind===kind);assert.ok(artifact,`${kind} retained`);
  const url=new URL(artifact.url,base);assert.equal(url.origin,base);assert.match(url.pathname,/^\/api\/learn\/files\//);for(const [key,value] of new URLSearchParams(scope.slice(1)))url.searchParams.set(key,value);
  const response=await fetch(url,{headers:{cookie:`small_session=${session}`},redirect:'error',signal:AbortSignal.timeout(30000)});assert.ok(response.ok,`${kind} download ${response.status}`);
  const data=Buffer.from(await response.arrayBuffer());assert.equal(data.length,artifact.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),artifact.sha256);
  if(kind==='glb')assert.equal(data.readUInt32LE(0),0x46546c67);if(kind==='step')assert.match(data.subarray(0,100).toString(),/ISO-10303-21/);
  writeFileSync(resolve(out,`${result.job.revisionId}.${kind==='thumbnail'?'png':kind}`),data);artifacts.push({kind,bytes:artifact.bytes,sha256:artifact.sha256});
 }
 return {revisionId:m.revisionId,parameters:m.parameters,validation:m.validation,artifacts,runtime:m.runtime,timings:m.timings};
}
async function scenario(name,fn){const row={name,status:'running',startedAt:new Date().toISOString()};results.push(row);save();try{Object.assign(row,await fn(),{status:'passed'});}catch(error){row.status='failed';row.error=error.message;throw error;}finally{row.finishedAt=new Date().toISOString();save();}}
try{
 const current=await api(`/api/learn/boards/${encodeURIComponent(app)}/${encodeURIComponent(board)}`);assert.equal(current.board_id,boardId,'Exact approved board required');
 const prior=await api('/api/learn/cad/jobs'+scope);
 if(resumeId){assert.equal(prior.jobs.length,1,'Resume refuses any already-started later scenario');assert.equal(prior.jobs[0].id,resumeId);assert.equal(prior.jobs[0].state,'failed','Only explicitly failed first job may retry');}
 else assert.equal(prior.jobs.length,0,'Use the approved fresh board; existing jobs require owner reconciliation');
 report.usageBefore=await usage();save();let featured;
 await scenario('simple dimensioned part',async()=>{
  let accepted;
  if(resumeId){
   assert.equal(env.CAD_SAVED_SOURCE_VERIFIED,'true','Coordinator must confirm stored source exists before retry');
   report.resume.retryIssued=true;save(); // Persistent receipt prevents a second invocation after uncertainty.
   accepted=await api(jobPath(resumeId)+'/retry','POST',{app,board,confirmed:true});
   assert.equal(accepted.job.id,resumeId);assert.equal(accepted.job.state,'building','Saved-source retry must bypass initial generation');
  }else accepted=await create('Create an educational rectangular solid plate, exactly 40 x 20 x 5 mm, one solid, no holes or decorations. Named parameters length=40, width=20, thickness=5. Independently check XYZ bounds, volume 4000 mm3 and solid count.');
  const result=await poll(accepted.job.id);return {jobId:accepted.job.id,resumedSavedSource:!!resumeId,...await inspect(result,{bounds:{x:40,y:20,z:5},volume:4000})};
 });
 await scenario('meaningful features',async()=>{const accepted=await create('Create one 60 x 40 x 5 mm plate spanning x=0..60,y=0..40,z=0..5. Four diameter-4 mm through holes centered at (10,10),(50,10),(10,30),(50,30) mm. Centered rectangular 20 x 10 mm pocket from the top, depth 2 mm (bottom z=3), sharp corners, no extra features. Check exterior bounds, solid validity and circular diameter; explicitly mark hole count/placement and pocket depth unchecked if trusted inspection lacks support.');featured=await poll(accepted.job.id);return {jobId:accepted.job.id,...await inspect(featured,{bounds:{x:60,y:40,z:5}}),blockedAssertions:['hole count and centers','pocket depth']};});
 await scenario('invariant-preserving edit',async()=>{const before=featured.job.revisionId,accepted=await create('Change only the existing centered pocket depth from 2 mm to 3 mm (bottom z=2). Preserve plate 60 x 40 x 5 mm, four diameter-4 mm through holes at (10,10),(50,10),(10,30),(50,30), pocket width20 length10, all other geometry unchanged. Report unsupported checks honestly.',{cardId:featured.job.cardId,baseRevisionId:before});const result=await poll(accepted.job.id);assert.equal(result.job.awaitingAccept,true);assert.equal(result.block.revisionId,before);const evidence=await inspect(result,{bounds:{x:60,y:40,z:5}});await api(jobPath(result.job.id)+'/accept','POST',{app,board,expectedRevisionId:before});const reloaded=await api(jobPath(result.job.id)+scope);assert.equal(reloaded.block.revisionId,result.job.revisionId);return {jobId:result.job.id,...evidence,blockedAssertions:['pocket depth independently measured','hole pattern preservation','UI preview, placement, size, connections and reload']};});
 await scenario('clarification only',async()=>{const accepted=await create('Make a replacement bracket that must mate exactly with my existing hardware. I have not provided interface dimensions, hole spacing, or units. Ask for the missing critical dimensions before creating geometry.');const result=await poll(accepted.job.id);assert.equal(result.job.state,'waiting_for_answer');assert.ok(result.job.question?.trim());assert.ok(!result.job.manifest?.artifacts?.length);return {jobId:result.job.id,question:result.job.question,assertions:['question returned','no guessed geometry'],manualReviewRequired:'Question must request actual interface dimensions and units; no answer or follow-on request sent.'};});
}catch(error){report.error=error.message;process.exitCode=1;}
finally{report.usageAfter=await usage();report.elapsedMs=Date.now()-started;report.jobsCreated=created;report.cumulativeJobsCreated=(resumeId?1:0)+created;report.counts={passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,skipped:0,interrupted:4-results.length};save();console.log(JSON.stringify(report.counts));}
