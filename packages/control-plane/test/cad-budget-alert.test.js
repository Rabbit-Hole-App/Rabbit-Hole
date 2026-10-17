import test from 'node:test';
import assert from 'node:assert/strict';
import {cadBudgetAlert,notifyCadBudget} from '../src/cad-budget-alert.js';
const token='fixture-token-'.repeat(4), month=new Date().toISOString().slice(0,7);
const env={CAD_BUDGET_ALERT_TOKEN:token,CAD_BUDGET_ALERT_EMAIL:'owner@example.test'};
const request=(body={month,kind:'model'},auth=token)=>new Request('https://cp/internal/cad-budget-alert',{method:'POST',headers:{authorization:`Bearer ${auth}`},body:typeof body==='string'?body:JSON.stringify(body)});
test('fixed owner, sanitized message and monthly idempotency key for each budget',async()=>{
  for(const kind of ['model','transfer']){
    let captured;
    assert.equal((await cadBudgetAlert(request({month,kind}),env,{sendEmail:async(...args)=>{captured=args;return true;}})).status,200);
    assert.equal(captured[1],env.CAD_BUDGET_ALERT_EMAIL);
    assert.equal(captured[2],'Rabbit Hole CAD monthly budget reached');
    assert.match(captured[3],new RegExp(`${kind} budget reached for ${month}`));
    assert.deepEqual(captured[4],{idempotencyKey:`cad-budget-${month}-${kind}`});
  }
});
test('invalid token, missing token and invalid configured recipient never send',async()=>{
  let calls=0;const deps={sendEmail:async()=>{calls++;return true;}};
  assert.equal((await cadBudgetAlert(request({},'wrong'),env,deps)).status,401);
  assert.equal((await cadBudgetAlert(request(),{},deps)).status,503);
  assert.equal((await cadBudgetAlert(request(),{...env,CAD_BUDGET_ALERT_EMAIL:'owner@example.test\r\nother@example.test'},deps)).status,503);
  assert.equal(calls,0);
});
test('reject recipient/prompt injection, old month, unknown kind and oversized streamed body',async()=>{
  let calls=0;const deps={sendEmail:async()=>{calls++;return true;}};
  for(const body of [{month,kind:'model',to:'attacker@example.test'},{month,kind:'model',prompt:'private'}, {month:'2000-01',kind:'model'},{month,kind:'anything'},null,'invalid'])
    assert.equal((await cadBudgetAlert(request(body),env,deps)).status,400);
  assert.equal((await cadBudgetAlert(request(' '.repeat(257)),env,deps)).status,413);
  assert.equal(calls,0);
});
test('email failure is retryable without exposing provider error',async()=>{
  for(const sendEmail of [async()=>false,async()=>{throw Error('private provider detail');}]){
    const response=await cadBudgetAlert(request(),env,{sendEmail});
    assert.equal(response.status,502);assert.deepEqual(await response.json(),{ok:false});
  }
});
test('caller uses service binding and returns success only for accepted notification',async()=>{
  let calls=0;
  const configured={...env,CONTROL_PLANE:{fetch:async req=>{
    calls++;assert.equal(new URL(req.url).pathname,'/internal/cad-budget-alert');
    assert.equal(req.headers.get('authorization'),`Bearer ${token}`);
    assert.deepEqual(await req.json(),{month,kind:'model'});return Response.json({ok:true});
  }}};
  assert.equal(await notifyCadBudget(configured,{month,kind:'model'}),true);assert.equal(calls,1);
  assert.equal(await notifyCadBudget(configured,{month,kind:'model',recipient:'other'}),false);assert.equal(calls,1);
  assert.equal(await notifyCadBudget(env,{month,kind:'model'}),false);
  for(const fetch of [async()=>Response.json({ok:false},{status:502}),async()=>{throw Error('private');}])
    assert.equal(await notifyCadBudget({...env,CONTROL_PLANE:{fetch}},{month,kind:'model'}),false);
});
