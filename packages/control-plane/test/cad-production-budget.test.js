import test from 'node:test';
import assert from 'node:assert/strict';
import {CadJobs} from '../src/cad-jobs.js';
import {cadProductionConfig,cadProductionEnforced,CAD_PRODUCTION_BUDGET_NAME,CAD_PRODUCTION_BUDGET_KEY,reserveCadProductionModel,reserveCadProductionJob,cadProductionBudgetStatus} from '../src/cad-production-budget.js';
const config={CAD_PRODUCTION_REQUIRED:'true',CAD_PRODUCTION_ENABLED:'true',CAD_PRODUCTION_MONTHLY_MODEL_USD:'10'};
const jan=Date.parse('2027-01-15T12:00:00Z'),boundary=Date.parse('2027-02-01T00:00:00Z');
function state(id){const data=new Map();let chain=Promise.resolve();return{id,data,storage:{get:async key=>structuredClone(data.get(key)),put:async(key,value)=>data.set(key,structuredClone(value)),setAlarm:async()=>{},getAlarm:async()=>null},blockConcurrencyWhile(fn){const run=chain.then(fn);chain=run.catch(()=>{});return run;}};}
const input=(id='job',now=jan,extra={})=>({jobId:id,boardId:'board-'+id,ownerOrg:'org-'+id,ownerEmail:id+'@test',limitUsd:0.2,deadline:now+600000,...extra});
function fixture(){const saved=state(CAD_PRODUCTION_BUDGET_NAME),env={...config};let actor;env.CAD_JOBS={idFromName:name=>name,get:id=>{assert.equal(id,CAD_PRODUCTION_BUDGET_NAME);return{fetch:(url,options)=>actor.fetch(new Request(url,options))};}};actor=new CadJobs(saved,env);return{saved,env,restart:()=>{actor=new CadJobs(saved,env);},request:value=>actor.fetch(new Request('https://cad/production-model-reservation',{method:'POST',body:JSON.stringify(value)})),status:()=>actor.fetch(new Request('https://cad/production-budget-status'))};}
test('concurrent users and boards reserve no more than fifty .20 whole jobs globally',async()=>{
 const f=fixture(),now=Date.now(),responses=await Promise.all(Array.from({length:55},(_,i)=>f.request(input('job'+i,now))));
 assert.equal(responses.filter(r=>r.status===200).length,50);assert.equal(responses.filter(r=>r.status===429).length,5);
 const status=await(await f.status()).json();assert.equal(status.totals[status.month].reservedMicros,10000000);assert.equal(status.paused,true);
 assert.equal(JSON.stringify(status).includes('@test'),false);assert.equal(JSON.stringify(status).includes('job0'),false);assert.equal(status.reservationsAreBilling,false);
});
test('restart and retries retain reservations without identity or budget reset',async()=>{
 const f=fixture(),value=input('job',Date.now());assert.equal((await f.request(value)).status,200);f.restart();assert.equal((await(await f.request(value)).json()).reused,true);
 for(const change of [{ownerEmail:'other@test'},{boardId:'other'},{limitUsd:0.1},{limitUsd:0.3}])assert.equal((await f.request({...value,...change})).status,409);
});
test('month rollover reserves the same job again without refunding the old month',async()=>{
 const s=state('test');await reserveCadProductionModel(s.storage,config,input(),{now:jan});
 const next=await reserveCadProductionModel(s.storage,config,input('job',boundary),{now:boundary});assert.equal(next.reused,false);
 const ledger=await s.storage.get(CAD_PRODUCTION_BUDGET_KEY);assert.equal(ledger.months['2027-01'].reservedMicros,200000);assert.equal(ledger.months['2027-02'].reservedMicros,200000);
 assert.equal((await reserveCadProductionModel(s.storage,config,input('job',boundary),{now:boundary})).reused,true);
});
test('pending work crossing UTC month boundary reserves both months before its first call',async()=>{
 const s=state('test'),now=boundary-60000,result=await reserveCadProductionModel(s.storage,config,input('pending',now),{now});
 assert.deepEqual(result.months,['2027-01','2027-02']);assert.deepEqual(result.totals,{'2027-01':200000,'2027-02':200000});
 assert.equal((await reserveCadProductionModel(s.storage,config,input('pending',boundary),{now:boundary})).reused,true);
});
test('cross-month admission is atomic if the next month has no remaining allowance',async()=>{
 const s=state('test');await reserveCadProductionModel(s.storage,config,input('future',boundary,{limitUsd:10}),{now:boundary});
 await assert.rejects(reserveCadProductionModel(s.storage,config,input('pending',boundary-60000),{now:boundary-60000}),error=>error.status===429);
 const ledger=await s.storage.get(CAD_PRODUCTION_BUDGET_KEY);assert.equal(ledger.months['2027-01'],undefined);assert.equal(ledger.months['2027-02'].reservedMicros,10000000);
});
test('missing/disabled required production configuration fails closed; legacy environments remain separate',()=>{
 assert.equal(cadProductionEnforced({}),false);assert.equal(cadProductionEnforced({CAD_PRODUCTION_REQUIRED:'true'}),true);
 for(const change of [{CAD_PRODUCTION_ENABLED:undefined},{CAD_PRODUCTION_ENABLED:'false'},{CAD_PRODUCTION_MONTHLY_MODEL_USD:undefined},{CAD_PRODUCTION_MONTHLY_MODEL_USD:'10.01'},{CAD_PRODUCTION_MONTHLY_MODEL_USD:'0'}])assert.throws(()=>cadProductionConfig({...config,...change}));
});
test('private global endpoints reject board objects and global objects reject ordinary job actions',async()=>{
 const f=fixture(),other=new CadJobs(state('board'),f.env);
 for(const path of ['production-model-reservation','production-budget-status'])assert.equal((await other.fetch(new Request('https://cad/'+path,{method:'POST',body:'{}'}))).status,404);
 const global=new CadJobs(f.saved,f.env);assert.equal((await global.fetch(new Request('https://cad/action',{method:'POST',body:JSON.stringify({action:'create'})}))).status,404);
});
test('calendar reset is automatic while exhausted previous-month status remains historical',async()=>{
 const s=state('test');await reserveCadProductionModel(s.storage,config,input('full',jan,{limitUsd:10}),{now:jan});await assert.rejects(reserveCadProductionModel(s.storage,config,input('over',jan),{now:jan}));
 const status=await cadProductionBudgetStatus(s.storage,config,{now:boundary});assert.equal(status.paused,false);assert.equal(status.lastRefusal.month,'2027-01');
 await reserveCadProductionModel(s.storage,config,input('next',boundary),{now:boundary});assert.equal((await s.storage.get(CAD_PRODUCTION_BUDGET_KEY)).months['2027-01'].reservedMicros,10000000);
});
for(const outcome of ['cancel','refused'])test(`global reservation ${outcome} permits no provider call`,async()=>{
 const saved=state('board'),env={...config,SMALL_ENV:'test'};let entered,release,calls=0;const started=new Promise(r=>{entered=r;}),paused=new Promise(r=>{release=r;});
 env.CAD_JOBS={idFromName:name=>name,get:()=>({fetch:async()=>{entered();await paused;return outcome==='refused'?Response.json({error:'budget full'},{status:429}):Response.json({reserved:true});}})};
 env.LEARN_MEDIA={get:async()=>({arrayBuffer:async()=>new Uint8Array([137,80,78,71]).buffer})};env.CAD_TEST_MODEL=async()=>{calls++;return{accepted:true};};
 const actor=new CadJobs(saved,env),job={id:'job1',boardId:'board',owner:{org:'test',email:'owner@test'},attempt:1,modelId:'model1',cardId:'card1',revisionId:'revision1',state:'checking',stage:'checking',modelPhase:'review',operation:'build',calls:1,reservedUsd:0.1,deadline:Date.now()+30000,limits:{calls:6,usd:0.2,elapsedMs:30000},brief:{title:'Plate',units:'mm',parameters:{},assumptions:[]},manifest:{artifacts:[{kind:'thumbnail',name:'thumbnail.png'}],validation:{baselinePassed:true}},limitations:[]};
 await saved.storage.put('job:job1',job);const advance=actor.advance(structuredClone(job)).catch(error=>error);await started;
 if(outcome==='cancel')assert.equal((await actor.fetch(new Request('https://cad/action',{method:'POST',body:JSON.stringify({action:'cancel',id:'job1'})}))).status,200);
 release();const result=await advance;assert.equal(calls,0);const current=await saved.storage.get('job:job1');assert.equal(current.calls,1);assert.equal(current.reservedUsd,0.1);
 if(outcome==='cancel')assert.equal(current.state,'cancelled');else assert.equal(result.status,429);
});

test('budget notifications run outside the gate, retry failed delivery, and deduplicate across restart',async()=>{
 const f=fixture(),now=Date.now(),month=new Date(now).toISOString().slice(0,7);let calls=0,inGate=false,succeed=false;
 const original=f.saved.blockConcurrencyWhile;
 f.saved.blockConcurrencyWhile=fn=>original.call(f.saved,async()=>{inGate=true;try{return await fn();}finally{inGate=false;}});
 f.env.CAD_BUDGET_ALERT_TOKEN='fixture-only-token-with-at-least-32-characters';
 f.env.CONTROL_PLANE={fetch:async request=>{
  assert.equal(inGate,false);calls++;assert.deepEqual(await request.json(),{month,kind:'model'});
  return Response.json({ok:succeed},{status:succeed?200:502});
 }};
 assert.equal((await f.request(input('full',now,{limitUsd:10}))).status,200);
 assert.equal((await f.request(input('denied',now))).status,429);assert.equal(calls,1);
 assert.equal(await f.saved.storage.get(`production:model-alert:${month}`),undefined);
 succeed=true;assert.equal((await f.request(input('denied',now))).status,429);assert.equal(calls,2);
 assert.equal(await f.saved.storage.get(`production:model-alert:${month}`),true);
 f.restart();assert.equal((await f.request(input('denied',now))).status,429);assert.equal(calls,2);
});

test('concurrent capacity denials send one notification without releasing reserved capacity',async()=>{
 const f=fixture(),now=Date.now();let calls=0,release,entered;const started=new Promise(r=>{entered=r;}),paused=new Promise(r=>{release=r;});
 f.env.CAD_BUDGET_ALERT_TOKEN='fixture-only-token-with-at-least-32-characters';
 f.env.CONTROL_PLANE={fetch:async()=>{calls++;entered();await paused;return Response.json({ok:true});}};
 await f.request(input('full',now,{limitUsd:10}));
 const first=f.request(input('over1',now));await started;
 assert.equal((await f.request(input('over2',now))).status,429);release();assert.equal((await first).status,429);assert.equal(calls,1);
 const status=await(await f.status()).json();assert.equal(status.totals[status.month].reservedMicros,10000000);
});

for(const code of ['busy','budget_exhausted'])test(`executor ${code} ${code==='busy'?'retains queued retry':'pauses model admission on every board'}`,async()=>{
 const f=fixture(),saved=state('board'),env={...f.env,SMALL_ENV:'test',CAD_JOB_SECRET:'fixture-only-secret-at-least-32-characters'},actor=new CadJobs(saved,env);
 actor.executor=async()=>Response.json({error:code},{status:429});
 const job={id:'job1',boardId:'board',owner:{org:'test',email:'owner@test'},attempt:1,modelId:'model1',cardId:'card1',revisionId:'revision1',origin:'https://test',state:'building',stage:'building',operation:'build',calls:1,reservedUsd:0.1,deadline:Date.now()+30000,limits:{calls:6,usd:0.2,elapsedMs:30000},source:{bytes:1,sha256:'fixture'},brief:{title:'Plate',units:'mm'},limitations:[]};
 await saved.storage.put('job:job1',job);await actor.advance(structuredClone(job));const current=await saved.storage.get('job:job1');
 if(code==='busy'){
  assert.equal(current.stage,'queued');assert.ok(current.dispatchAfter>Date.now());assert.equal(current.dispatchAt,null);
  assert.equal((await f.request(input('other-board',Date.now()))).status,200);
 }else{
  assert.equal(current.state,'failed');assert.match(current.error,/transfer allowance/);assert.equal(current.dispatchAfter,undefined);
  assert.equal((await f.request(input('other-board',Date.now()))).status,429);
  const status=await(await f.status()).json();assert.equal(status.transferPaused,true);assert.equal(status.reason,'monthly_transfer_limit');assert.equal(status.paused,true);
 }
});

test('transfer pause expires automatically in the next UTC month and preserves reservation history',async()=>{
 const {pauseCadProductionTransfer}=await import('../src/cad-production-budget.js'),s=state('test');
 await reserveCadProductionModel(s.storage,config,input(),{now:jan});await pauseCadProductionTransfer(s.storage,config,{now:jan});
 await assert.rejects(reserveCadProductionModel(s.storage,config,input(),{now:jan}),error=>error.status===429);
 assert.equal((await cadProductionBudgetStatus(s.storage,config,{now:boundary})).paused,false);
 await reserveCadProductionModel(s.storage,config,input('next',boundary),{now:boundary});
 assert.equal((await s.storage.get(CAD_PRODUCTION_BUDGET_KEY)).months['2027-01'].reservedMicros,200000);
});

test('a call admitted before midnight reserves the next month through its provider timeout window',async()=>{
 let captured;const env={...config,CAD_JOBS:{idFromName:name=>name,get:()=>({fetch:async(url,options)=>{captured=JSON.parse(options.body);return Response.json({reserved:true});}})}};
 const job={id:'near-midnight',boardId:'board',owner:{org:'org',email:'owner@test'},limits:{usd:0.2},deadline:boundary-30000};
 await reserveCadProductionJob(env,job);assert.equal(captured.deadline,job.deadline+120000);
 const s=state('test'),result=await reserveCadProductionModel(s.storage,config,captured,{now:boundary-60000});
 assert.deepEqual(result.months,['2027-01','2027-02']);assert.deepEqual(result.totals,{'2027-01':200000,'2027-02':200000});
});

test('deadline expiry during external thumbnail I/O prevents provider admission and counter increments',async()=>{
 const saved=state('board');let calls=0,release,entered;const paused=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
 const env={SMALL_ENV:'test',CAD_TEST_MODEL:async()=>{calls++;return{accepted:true};},LEARN_MEDIA:{get:async()=>{entered();await paused;return{arrayBuffer:async()=>new Uint8Array([137,80,78,71]).buffer};}}};
 const actor=new CadJobs(saved,env),job={id:'deadline-job',boardId:'board',owner:{org:'test',email:'owner@test'},attempt:1,modelId:'model1',cardId:'card1',revisionId:'revision1',state:'checking',stage:'checking',modelPhase:'review',operation:'build',calls:1,reservedUsd:0.1,deadline:Date.now()+30000,limits:{calls:6,usd:0.2,elapsedMs:30000},brief:{title:'Plate',units:'mm',parameters:{},assumptions:[]},manifest:{artifacts:[{kind:'thumbnail',name:'thumbnail.png'}],validation:{baselinePassed:true}},limitations:[]};
 await saved.storage.put('job:deadline-job',job);const advance=actor.advance(structuredClone(job)).catch(error=>error);await started;
 const latest=await saved.storage.get('job:deadline-job');latest.deadline=Date.now()-1;await saved.storage.put('job:deadline-job',latest);
 release();const result=await advance;assert.equal(result.status,409);assert.match(result.message,/time limit/);assert.equal(calls,0);
 const current=await saved.storage.get('job:deadline-job');assert.equal(current.calls,1);assert.equal(current.reservedUsd,0.1);assert.equal(current.modelInFlight,undefined);
});
