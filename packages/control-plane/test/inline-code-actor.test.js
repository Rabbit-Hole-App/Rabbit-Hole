import test from 'node:test';
import assert from 'node:assert/strict';
import {inlineCodeActorFetch,inlineCodeActorAlarm} from '../src/inline-code-actor.js';
const owner={org:'org',email:'owner'},id='cj_'+'a'.repeat(32);
function fixture(){
 const records=new Map(),alarms=[];let tail=Promise.resolve(),executions=0;
 const storage={get:async key=>structuredClone(records.get(key)),put:async(key,value)=>records.set(key,structuredClone(value)),list:async({prefix})=>new Map([...records].filter(([key])=>key.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)])),setAlarm:async time=>alarms.push(time),transaction(fn){const task=tail.then(()=>fn(storage));tail=task.catch(()=>{});return task;}};
 const state={storage},env={INLINE_CODE_ENABLED:'true',INLINE_CODE_MAX_RUNS:'20',INLINE_CODE_MAX_MICROS:'100000',INLINE_CODE_RESERVE_MICROS:'5000',INLINE_CODE_LOADER:{load(){}}};
 const digest=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
 const deps={execute:async({code,input})=>{executions++;return {status:'ok',result:2,stdout:[],sourceSha256:await digest(code),inputSha256:await digest(JSON.stringify(input))};}};
 const body={id,owner,scope:{app:'canvas-12345678',board:'main'},language:'javascript',code:'return 2;',input:null,executionConfirmed:true,maxReservedMicros:5000};
 const request=(action,patch={})=>new Request('https://internal/inline-code/'+action,{method:'POST',body:JSON.stringify({...body,...patch})});
 const call=(action,patch={},s=state)=>inlineCodeActorFetch(s,env,request(action,patch),deps);
 return {records,alarms,state,env,deps,body,call,storage,executions:()=>executions};
}
test('create arms before acknowledgement, duplicate reserves once, one alarm completes once',async()=>{
 const h=fixture();assert.equal((await h.call('create')).status,201);assert.ok(h.alarms.length>=2);assert.equal((await h.call('create')).status,201);assert.equal(h.records.get('code:budget').runs,1);
 await inlineCodeActorAlarm(h.state,h.env,h.deps);await inlineCodeActorAlarm(h.state,h.env,h.deps);assert.equal(h.executions(),1);assert.equal((await(await h.call('status')).json()).job.phase,'succeeded');
});
test('alarm scheduling failure cannot acknowledge admission and duplicate safely rearms',async()=>{
 const h=fixture();const original=h.storage.setAlarm;let n=0;h.storage.setAlarm=async time=>{if(++n===2)throw Error('fixture');return original(time);};assert.equal((await h.call('create')).status,409);assert.equal(h.records.get('code:budget').runs,1);h.storage.setAlarm=original;assert.equal((await h.call('create')).status,201);await inlineCodeActorAlarm(h.state,h.env,h.deps);assert.equal(h.executions(),1);
});
test('restart recovers started as unknown without reexecution and continues next queued job',async()=>{
 const h=fixture();await h.call('create');const second='cj_'+'b'.repeat(32);await h.call('create',{id:second});h.records.set('code:job:'+id,{...h.records.get('code:job:'+id),phase:'started'});const restarted={storage:h.storage};await inlineCodeActorAlarm(restarted,h.env,h.deps);assert.equal(h.records.get('code:job:'+id).phase,'unknown');assert.equal(h.executions(),0);await inlineCodeActorAlarm(restarted,h.env,h.deps);assert.equal(h.records.get('code:job:'+second).phase,'succeeded');assert.equal(h.executions(),1);
});
test('status/cancel use persisted policy when off; foreign owner denied; queued never executes',async()=>{
 const h=fixture();await h.call('create');delete h.env.INLINE_CODE_MAX_RUNS;delete h.env.INLINE_CODE_LOADER;h.env.INLINE_CODE_ENABLED='false';const restarted={storage:h.storage};assert.equal((await h.call('status',{owner:{org:'org',email:'other'}},restarted)).status,404);assert.equal((await h.call('status',{},restarted)).status,200);assert.equal((await h.call('cancel',{},restarted)).status,200);await inlineCodeActorAlarm(restarted,h.env,h.deps);assert.equal(h.executions(),0);assert.equal(h.records.get('code:budget').reservedMicros,5000);
});
test('same cached coordinator cancels active execution without overwriting cancellation',async()=>{
 const h=fixture();let started,release;const began=new Promise(r=>started=r);h.deps.execute=({signal})=>new Promise(resolve=>{release=()=>resolve({status:'cancelled'});signal.addEventListener('abort',release,{once:true});started();});await h.call('create');const run=inlineCodeActorAlarm(h.state,h.env,h.deps);await began;assert.equal((await h.call('cancel')).status,200);await run;assert.equal((await(await h.call('status')).json()).job.phase,'cancelled');
});
test('disabled admission cancels queued job; changed policy rejects new admission; legacy untouched',async()=>{
 const h=fixture();assert.equal(await inlineCodeActorAlarm(h.state,h.env,h.deps),false);h.records.set('legacy',{keep:true});await h.call('create');h.env.INLINE_CODE_MAX_RUNS='21';assert.equal((await h.call('create',{id:'cj_'+'b'.repeat(32)})).status,409);h.env.INLINE_CODE_ENABLED='false';await inlineCodeActorAlarm(h.state,h.env,h.deps);assert.equal(h.records.get('code:job:'+id).phase,'cancelled');assert.deepEqual(h.records.get('legacy'),{keep:true});assert.equal(h.executions(),0);
});
