import test from 'node:test';
import assert from 'node:assert/strict';
import {cadBudgetAlert,notifyCadBudget} from '../src/cad-budget-alert.js';
const token='fixture-token-'.repeat(4), month=new Date().toISOString().slice(0,7);
const env={CAD_BUDGET_ALERT_TOKEN:token,CAD_BUDGET_ALERT_EMAIL:'owner@example.test'};
const request=(body={month,kind:'model'},auth=token)=>new Request('https://cp/internal/cad-budget-alert',{method:'POST',headers:{authorization:`Bearer ${auth}`},body:typeof body==='string'?body:JSON.stringify(body)});

test('explicit delivery test uses fixed content and a separate repeatable provider idempotency key',async()=>{
  const sent=[]; const deps={sendEmail:async(...args)=>{sent.push(args);return true;}};
  for(let i=0;i<2;i++)assert.equal((await cadBudgetAlert(request({month,kind:'delivery-test'}),env,deps)).status,200);
  assert.equal(sent[0][1],env.CAD_BUDGET_ALERT_EMAIL);
  assert.equal(sent[0][2],'CAD budget alert delivery test');
  assert.match(sent[0][3],/does not indicate budget exhaustion/);
  assert.match(sent[0][3],/does not change CAD budgets or pause work/);
  assert.deepEqual(sent[0][4],{idempotencyKey:`cad-budget-delivery-test-${month}`});
  assert.deepEqual(sent[1],sent[0]);
  assert.equal((await cadBudgetAlert(request(),env,deps)).status,200);
  assert.notEqual(sent[2][4].idempotencyKey,sent[0][4].idempotencyKey);
});

test('delivery test cannot bypass authentication, customize email or be emitted by budget actors',async()=>{
  let calls=0;const deps={sendEmail:async()=>{calls++;return true;}};
  const body={month,kind:'delivery-test'};
  assert.equal((await cadBudgetAlert(request(body,'wrong'),env,deps)).status,401);
  for(const extra of [{to:'other@example.test'},{message:'private'},{prompt:'private'},{month:'2000-01'}])
    assert.equal((await cadBudgetAlert(request({...body,...extra}),env,deps)).status,400);
  assert.equal((await cadBudgetAlert(new Request('https://cp/internal/cad-budget-alert'),env,deps)).status,405);
  assert.equal(await notifyCadBudget({...env,CONTROL_PLANE:{fetch:async()=>{calls++;}}},body),false);
  assert.equal(calls,0);
  const failure=await cadBudgetAlert(request(body),env,{sendEmail:async()=>{throw Error('secret');}});
  assert.equal(failure.status,502);assert.deepEqual(await failure.json(),{ok:false});
});
test('fixed owner, sanitized message and monthly idempotency key for each budget',async()=>{
  for(const kind of ['model','transfer','infrastructure']){
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
test('infrastructure alerts require authentication and reject recipient or prompt injection',async()=>{
  let calls=0;const deps={sendEmail:async()=>{calls++;return true;}};
  assert.equal((await cadBudgetAlert(request({month,kind:'infrastructure'},'wrong'),env,deps)).status,401);
  for(const extra of [{to:'attacker@example.test'},{prompt:'private card content'}])
    assert.equal((await cadBudgetAlert(request({month,kind:'infrastructure',...extra}),env,deps)).status,400);
  assert.equal(calls,0);
  assert.equal(await notifyCadBudget({...env,CONTROL_PLANE:{fetch:async req=>cadBudgetAlert(req,env,deps)}},{month,kind:'infrastructure'}),true);
  assert.equal(calls,1);
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
