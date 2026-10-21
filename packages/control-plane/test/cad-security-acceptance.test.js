import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { startCadAcceptanceStack } from './cad-acceptance-stack.mjs';
import { callbackToken } from '../src/file-jobs.js';

// An explicit source directory permits independent review of a sibling candidate before
// integration. Receipts must identify that candidate and both dirty worktrees.
const implementation = process.env.CAD_IMPLEMENTATION_DIR
  ? pathToFileURL(resolve(process.env.CAD_IMPLEMENTATION_DIR, 'packages/control-plane/src/cad-jobs.js'))
  : new URL('../src/cad-jobs.js', import.meta.url);
const { cadRoute, CadJobs } = await import(implementation.href);
const request = (extra = {}) => ({ app: 'cad-a', board: 'main', cardId: 'cad-card', requestId: 'cad-request-1',
  prompt: 'Create an educational rectangular plate, 40 by 20 by 5 mm, with no extra features.', context: {}, confirmed: true, ...extra });
const setup = async (t, extraEnv = {}) => { const f = await startCadAcceptanceStack({ cadRoute, CadJobs, extraEnv }); t.after(() => f.close()); return f; };
const submit = (f, body = request(), opts = {}) => f.request('/api/learn/cad/jobs', { method: 'POST', body, ...opts });
const design = { source:'# Synthetic source; never executed.\n', brief:{title:'Synthetic plate',units:'mm',parameters:{length:40,width:20,height:5},assumptions:[],requirements:[]}, checks:[] };
const fakeModel = async job => job.modelPhase === 'review' ? {accepted:true,problems:[]} : design;

test('CAD: explicit review retry preserves checked artifacts and never rebuilds geometry', async t => {
  let failReview=true,modelCalls=0;
  const f=await setup(t,{CAD_TEST_MODEL:async job=>{modelCalls++;if(job.modelPhase==='review'&&failReview)throw Error('invalid review JSON');return fakeModel(job);}});
  const first=await(await submit(f)).json(),actor=f.objects.get('cad-board-a'),key=`job:${first.job.id}`;
  await finishWithSyntheticArtifacts(f,first.job.id,{review:false});
  await actor.instance.alarm();
  const failed=await actor.storage.get(key);assert.equal(failed.state,'failed');assert.equal(failed.modelPhase,'review');
  const retried=await(await f.request(`/api/learn/cad/jobs/${first.job.id}/retry`,{method:'POST',body:{confirmed:true}})).json();
  assert.equal(retried.job.state,'checking');assert.equal(retried.job.attempt,failed.attempt);
  failReview=false;await actor.instance.advance(await actor.storage.get(key));
  const ready=await actor.storage.get(key);assert.equal(ready.state,'ready');assert.deepEqual(ready.manifest,failed.manifest);assert.equal(modelCalls,3);
});
test('CAD: bounded verification counts failed requests durably across jobs and restarts', async t => {
  let calls=0;
  const f=await setup(t,{CAD_VERIFICATION_BOARD_ID:'cad-board-a',CAD_VERIFICATION_MAX_CALLS:'1',CAD_VERIFICATION_MAX_USD:'0.10',CAD_TEST_MODEL:async()=>{calls++;throw Error('synthetic provider failure');}});
  const first=await (await submit(f)).json(), actor=f.objects.get('cad-board-a');
  await assert.rejects(()=>actor.instance.advance(actor.data.get(`job:${first.job.id}`)),/synthetic provider failure/);
  actor.restart();
  const second=await (await submit(f,request({cardId:'second',requestId:'second'}))).json();
  await assert.rejects(()=>actor.instance.advance(actor.data.get(`job:${second.job.id}`)),/allowance has been reached/);
  assert.equal(calls,1);assert.equal((await actor.storage.get('verification:usage')).calls,1);
  assert.equal((await submit(f,request({app:'cad-b'}),{email:'other@test'})).status,403);
});
test('CAD: invalid operator limits fail closed before job acceptance', async t => {
  const f=await setup(t,{CAD_MAX_USD:'100'});
  assert.equal((await submit(f)).status,503);
  assert.equal(f.events.filter(e=>e.kind==='alarm').length,0);
});
test('CAD: two-call pilot allows generation and review but rejects a third call after restart', async t => {
  let calls=0;
  const f=await setup(t,{CAD_MAX_CALLS:'2',CAD_MAX_USD:'0.20',CAD_MAX_REPAIRS:'0',
    CAD_VERIFICATION_BOARD_ID:'cad-board-a',CAD_VERIFICATION_MAX_CALLS:'2',CAD_VERIFICATION_MAX_USD:'0.20',
    CAD_TEST_MODEL:async job=>{calls++;return fakeModel(job);}});
  const first=await(await submit(f)).json(),actor=f.objects.get('cad-board-a');
  await finishWithSyntheticArtifacts(f,first.job.id);
  assert.equal(calls,2);
  assert.equal((await actor.storage.get(`job:${first.job.id}`)).limits.repairs,0);
  actor.restart();
  const second=await(await submit(f,request({cardId:'pilot-third',requestId:'pilot-third'}))).json();
  await assert.rejects(()=>actor.instance.advance(actor.data.get(`job:${second.job.id}`)),/allowance has been reached/);
  assert.equal(calls,2);
  const usage=await actor.storage.get('verification:usage');
  assert.equal(usage.calls,2);assert.ok(usage.reservedUsd<=0.20);
});
async function finishWithSyntheticArtifacts(f, id, { kinds = ['step','glb','thumbnail'], review = true } = {}) {
  const actor = [...f.objects.values()][0], key = `job:${id}`;
  await actor.instance.advance(await actor.storage.get(key));
  const job = await actor.storage.get(key), token = (await callbackToken({FILE_JOB_SECRET:f.env.CAD_JOB_SECRET},id,job.attempt)).token;
  const callback = (action, body, method = 'POST', headers = {}) => {
    const path = `/api/learn/cad/jobs/${id}/attempts/${job.attempt}/${action}`;
    return cadRoute(path, new Request(`http://127.0.0.1${path}`, {method,headers:{authorization:`Bearer ${token}`,...headers},
      body:body instanceof Uint8Array ? body : JSON.stringify(body)}),f.env);
  };
  const outputs = [];
  for(const [name,kind,media_type] of [['model.step','step','model/step'],['model.glb','glb','model/gltf-binary'],['preview.png','thumbnail','image/png']]) {
    if(!kinds.includes(kind))continue;
    const bytes = new TextEncoder().encode(`synthetic ${name}: not actual CAD bytes`), sha256=createHash('sha256').update(bytes).digest('hex');
    const response = await callback(`outputs/${name}`,bytes,'PUT',{'content-length':String(bytes.length),'x-content-sha256':sha256});
    assert.equal(response.status,201,await response.clone().text());outputs.push({name,kind,media_type,bytes:bytes.length,sha256});
  }
  const result = {schema:'cad-execute-result/1',job_id:id,attempt:job.attempt,revision_id:job.revisionId,
    runtime:{cadgen:'0.7.21'},outputs,validation:{baselinePassed:true,units:'mm',checks:[],unchecked:['Synthetic fixture; no geometry inspected.']}};
  const completed = await callback('complete',result);assert.equal(completed.status,200,await completed.clone().text());
  const repeated = await callback('complete',result);assert.equal(repeated.status,200);assert.equal((await repeated.json()).repeat,true);
  if(review)await actor.instance.advance(await actor.storage.get(key));
  const ready = await (await f.request(`/api/learn/cad/jobs/${id}`)).json();if(review)assert.equal(ready.job.state,'ready');
  return ready;
}

test('CAD: unauthenticated creation and stranger board creation cannot create a job', async t => {
  const f = await setup(t);
  assert.equal((await submit(f, request(), { email: null })).status, 401);
  assert.equal((await submit(f, request(), { email: 'other@test' })).status, 404);
  assert.equal(f.objects.size, 0);
  assert.deepEqual(f.outbound, []);
});

test('CAD: missing explicit confirmation never schedules generation', async t => {
  const f = await setup(t);
  assert.equal((await submit(f, request({ confirmed: false }))).status, 428);
  assert.equal(f.events.filter(event => event.kind === 'alarm').length, 0);
});

test('CAD: acceptance persists a job and schedules its alarm; duplicate request returns its original identity', async t => {
  const f = await setup(t), first = await submit(f);
  assert.equal(first.status, 202, await first.clone().text());
  const created = await first.json();
  assert.ok(created.job.id); assert.equal(created.block.id, 'cad-card');
  assert.ok(f.events.some(event => event.kind === 'alarm') && f.events.some(event => event.kind === 'put'),
    'job persistence and durable wakeup must both finish before acknowledgment');
  const repeated = await submit(f); assert.equal(repeated.status, 200);
  const same = await repeated.json(); assert.equal(same.job.id, created.job.id); assert.equal(same.block.id, created.block.id);
  const listed = await (await f.request('/api/learn/cad/jobs?app=cad-a&board=main')).json();
  assert.equal(listed.jobs.length, 1); assert.equal(listed.blocks.length, 1);
});

test('CAD: reused request identity with changed intent cannot silently return or overwrite another design', async t => {
  const f = await setup(t); assert.equal((await submit(f)).status, 202);
  assert.equal((await submit(f, request({ prompt: 'Create a completely different 100 mm sphere.' }))).status, 409);
});

test('CAD: stranger cannot read, cancel, retry, clarify, accept, export or hide a private job', async t => {
  const f = await setup(t), { job } = await (await submit(f)).json(), path = `/api/learn/cad/jobs/${job.id}`;
  assert.equal((await f.request(path, { email: 'other@test' })).status, 404);
  for (const action of ['cancel', 'retry', 'clarify', 'accept', 'exports', 'placement']) {
    assert.equal((await f.request(`${path}/${action}`, { method: 'POST', email: 'other@test',
      body: { confirmed: true, answer: 'Use 10 mm.', expectedRevisionId: null, format: 'stl', hidden: true } })).status, 404, action);
  }
  const current = await (await f.request(path)).json(); assert.equal(current.job.state, 'queued');
});

test('CAD: logout does not delete the job and restored identity reconnects without another submission', async t => {
  const f = await setup(t), { job } = await (await submit(f)).json(), path = `/api/learn/cad/jobs/${job.id}`;
  assert.equal((await f.request(path, { email: null })).status, 401);
  for (const value of f.objects.values()) value.restart();
  const restored = await (await f.request(path)).json(); assert.equal(restored.job.id, job.id);
  const listed = await (await f.request('/api/learn/cad/jobs?app=cad-a&board=main')).json(); assert.equal(listed.jobs.length, 1);
});

test('CAD: removing a running placement cancels it; restoring visibility does not restart paid generation', async t => {
  const f = await setup(t), { job } = await (await submit(f)).json(), path = `/api/learn/cad/jobs/${job.id}`;
  const hidden = await f.request(`${path}/placement`, { method: 'POST', body: { hidden: true } }); assert.equal(hidden.status, 200);
  const listed = await (await f.request('/api/learn/cad/jobs?app=cad-a&board=main')).json(); assert.equal(listed.blocks.length, 0);
  const restored = await f.request(`${path}/placement`, { method: 'POST', body: { hidden: false } }); assert.equal(restored.status, 200);
  assert.equal((await (await f.request(path)).json()).job.state, 'cancelled');
});

test('CAD: failed alarm scheduling is never acknowledged as accepted generation', async t => {
  const f = await setup(t); f.setAlarmFailure(true);
  const response = await submit(f); assert.ok(response.status >= 500, `unexpected acceptance ${response.status}`);
  f.setAlarmFailure(false);
  const retry = await submit(f); assert.ok([200,202].includes(retry.status), await retry.clone().text());
  const alarms = await Promise.all([...f.objects.values()].map(value => value.storage.getAlarm()));
  assert.ok(alarms.some(value => value != null), 'the retry schedules a wakeup');
});

test('CAD: an interrupted in-flight model operation is never automatically reissued', async t => {
  let modelCalls = 0;
  const f = await setup(t, { CAD_TEST_MODEL: async () => { modelCalls++; throw Error('must not call'); } });
  const { job } = await (await submit(f)).json(), actor = [...f.objects.values()][0], key = `job:${job.id}`;
  const saved = await actor.storage.get(key);
  await actor.storage.put(key, { ...saved, state: 'preparing', modelInFlight: 'persisted-uncertain-operation', calls: 1, reservedUsd: 0.1 });
  actor.restart(); await actor.instance.alarm();
  const after = await actor.storage.get(key);
  assert.equal(modelCalls, 0); assert.equal(after.state, 'failed'); assert.match(after.error, /interrupted/i);
  assert.equal(after.calls, 1); assert.equal(after.reservedUsd, 0.1, 'unknown prior charge retained');
});

test('CAD: cancellation during a model response discards that response without saving generated source', async t => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const response = new Promise(resolve => { release = resolve; });
  let modelCalls = 0;
  const f = await setup(t, { CAD_TEST_MODEL: async () => { modelCalls++; entered(); return response; } });
  const { job } = await (await submit(f)).json(), actor = [...f.objects.values()][0], key = `job:${job.id}`;
  const advance = actor.instance.advance(await actor.storage.get(key)); await started;
  const cancelled = await f.request(`/api/learn/cad/jobs/${job.id}/cancel`, { method: 'POST' }); assert.equal(cancelled.status, 200);
  release({ source: 'do not publish', brief: { title:'Late', units:'mm', parameters:{length:40}, assumptions:[], requirements:[] }, checks:[] });
  await advance;
  const after = await actor.storage.get(key); assert.equal(after.state, 'cancelled'); assert.equal(modelCalls, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM file_sources').get().n, 0);
  assert.equal(f.media.objects.size, 0);
});

test('CAD: callback token is scoped to job and attempt, and cancellation rejects even a valid late callback', async t => {
  const f = await setup(t), { job } = await (await submit(f)).json();
  const other = await (await submit(f, request({ cardId:'second-card',requestId:'second-request' }))).json();
  const { token } = await callbackToken({ FILE_JOB_SECRET:f.env.CAD_JOB_SECRET }, job.id, 1);
  const invoke = (id, attempt) => cadRoute(`/api/learn/cad/jobs/${id}/attempts/${attempt}/progress`,
    new Request(`http://127.0.0.1/api/learn/cad/jobs/${id}/attempts/${attempt}/progress`, { method:'POST',
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({stage:'building'}) }), f.env);
  assert.equal((await invoke(other.job.id, 1)).status, 401);
  assert.equal((await invoke(job.id, 2)).status, 401);
  assert.equal((await f.request(`/api/learn/cad/jobs/${job.id}/cancel`, { method:'POST' })).status, 200);
  assert.equal((await invoke(job.id, 1)).status, 409);
  assert.equal((await (await f.request(`/api/learn/cad/jobs/${job.id}`)).json()).job.state, 'cancelled');
});

test('CAD: synthetic artifacts publish once and accepted edit rejects a stale second preview', async t => {
  const f=await setup(t,{CAD_TEST_MODEL:fakeModel}),initial=await (await submit(f)).json();
  const original=await finishWithSyntheticArtifacts(f,initial.job.id);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM file_derivatives').get().n,3,'duplicate completion must not duplicate artifacts');
  const firstEdit=await (await submit(f,request({requestId:'edit-1',baseRevisionId:original.block.revisionId}))).json();
  const proposal=await finishWithSyntheticArtifacts(f,firstEdit.job.id);
  assert.equal(proposal.block.revisionId,original.block.revisionId,'proposed revision must not replace accepted model');
  assert.ok(proposal.block.proposedRevisionId);
  const secondEdit=await (await submit(f,request({requestId:'edit-2',baseRevisionId:original.block.revisionId}))).json();
  await finishWithSyntheticArtifacts(f,secondEdit.job.id);
  const accepted=await f.request(`/api/learn/cad/jobs/${firstEdit.job.id}/accept`,{method:'POST',body:{expectedRevisionId:original.block.revisionId}});
  assert.equal(accepted.status,200);assert.equal((await accepted.json()).block.revisionId,proposal.block.proposedRevisionId);
  const stale=await f.request(`/api/learn/cad/jobs/${secondEdit.job.id}/accept`,{method:'POST',body:{expectedRevisionId:original.block.revisionId}});
  assert.equal(stale.status,409);
});

// docs/features/card-prompt.md: the card's Prompt row shows the words of the accepted revision. Only Accept answers them
// (to the owner), read from the accepted model; status, list and reject answers never carry a pending edit's words, so a
// card Accept, an inline Accept and an Accept after a reload all get them from the server, and a repeated Accept changes nothing.
test('CAD: Accept returns the accepted revision words as the card prompt; status, list and reject never carry an edit words', async t => {
  const f=await setup(t,{CAD_TEST_MODEL:fakeModel}),initial=await (await submit(f)).json();
  const original=await finishWithSyntheticArtifacts(f,initial.job.id);
  const HOLES='add two mounting holes',GLASS='make it out of glass';
  const read=async path=>JSON.stringify(await (await f.request(path)).json());
  const unleaked=async (edit,words)=>{
    for(const text of [JSON.stringify(edit),await read(`/api/learn/cad/jobs/${edit.job.id}`),await read('/api/learn/cad/jobs?app=cad-a&board=main')])
      assert.ok(!text.includes(words)&&!text.includes('promptUsed'),'a pending edit\'s words never leave the job');
  };
  // One active job per card: the rejected edit first, then the one accepted.
  const glass=await (await submit(f,request({requestId:'edit-glass',baseRevisionId:original.block.revisionId,prompt:GLASS}))).json();
  await finishWithSyntheticArtifacts(f,glass.job.id);await unleaked(glass,GLASS);
  const rejected=await (await f.request(`/api/learn/cad/jobs/${glass.job.id}/cancel`,{method:'POST'})).json();
  assert.ok(!JSON.stringify(rejected).includes(GLASS)&&!('promptUsed' in rejected.block),'a rejected edit gives the card no prompt');
  const holes=await (await submit(f,request({requestId:'edit-holes',baseRevisionId:original.block.revisionId,prompt:HOLES}))).json();
  await finishWithSyntheticArtifacts(f,holes.job.id);await unleaked(holes,HOLES);
  const accept=body=>f.request(`/api/learn/cad/jobs/${holes.job.id}/accept`,{method:'POST',body});
  const accepted=await accept({expectedRevisionId:original.block.revisionId});
  assert.equal(accepted.status,200);
  const first=await accepted.json();
  assert.equal(first.block.promptUsed,HOLES);
  assert.ok(!('prompt' in first.job),'the job status still holds no prompt');
  for(const expectedRevisionId of [original.block.revisionId,first.block.revisionId]){
    const again=await accept({expectedRevisionId});
    assert.equal(again.status,200,'a repeated Accept (the other button, a retry) is the same answer, not a conflict');
    const body=await again.json();
    assert.equal(body.block.promptUsed,HOLES);assert.equal(body.block.revisionId,first.block.revisionId);
  }
  assert.ok(!(await read(`/api/learn/cad/jobs/${holes.job.id}`)).includes(HOLES),'status after Accept still carries no words');
  const glassLate=await f.request(`/api/learn/cad/jobs/${glass.job.id}/accept`,{method:'POST',body:{expectedRevisionId:original.block.revisionId}});
  assert.equal(glassLate.status,409,'a rejected edit cannot be accepted');
});

test('CAD: rejecting a ready edit clears the proposal and keeps the accepted revision usable', async t => {
  const f=await setup(t,{CAD_TEST_MODEL:fakeModel}),initial=await (await submit(f)).json();
  const original=await finishWithSyntheticArtifacts(f,initial.job.id);
  const edit=await (await submit(f,request({requestId:'reject-edit',baseRevisionId:original.block.revisionId}))).json();
  await finishWithSyntheticArtifacts(f,edit.job.id);
  const response=await f.request(`/api/learn/cad/jobs/${edit.job.id}/cancel`,{method:'POST'});assert.equal(response.status,200);
  const rejected=await response.json();assert.equal(rejected.block.revisionId,original.block.revisionId);
  assert.ok(!rejected.job.awaitingAccept && !rejected.block.proposedRevisionId,'rejected preview must be removed');
});

test('CAD: optional export reuses saved STEP, makes no model call and preserves the model after export failure', async t => {
  let modelCalls=0;
  const f=await setup(t,{CAD_TEST_MODEL:async job=>{modelCalls++;return fakeModel(job);}}),initial=await (await submit(f)).json();
  const original=await finishWithSyntheticArtifacts(f,initial.job.id),actor=[...f.objects.values()][0],key=`job:${initial.job.id}`,before=modelCalls;
  const response=await f.request(`/api/learn/cad/jobs/${initial.job.id}/exports`,{method:'POST',body:{format:'stl'}});assert.equal(response.status,202);
  assert.equal((await f.request(`/api/learn/cad/jobs/${initial.job.id}/exports`,{method:'POST',body:{format:'3mf'}})).status,409);
  let dispatched;
  actor.instance.executor=async(path,body)=>{dispatched={path,body};return new Response('',{status:202});};
  await actor.instance.advance(await actor.storage.get(key));
  assert.equal(modelCalls,before);assert.equal(dispatched.body.operation,'export');assert.deepEqual(dispatched.body.formats,['stl']);
  const step=original.job.manifest.artifacts.find(item=>item.kind==='step');assert.equal(dispatched.body.source.sha256,step.sha256);
  const exporting=await actor.storage.get(key),token=(await callbackToken({FILE_JOB_SECRET:f.env.CAD_JOB_SECRET},initial.job.id,exporting.attempt)).token;
  const path=`/api/learn/cad/jobs/${initial.job.id}/attempts/${exporting.attempt}/fail`;
  const failed=await cadRoute(path,new Request(`http://127.0.0.1${path}`,{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({error:'export_failed'})}),f.env);
  assert.equal(failed.status,200);const current=await (await f.request(`/api/learn/cad/jobs/${initial.job.id}`)).json();
  assert.equal(current.job.state,'ready');assert.equal(current.job.exportState,'failed');assert.ok(current.job.exportError);
  assert.equal(current.block.revisionId,original.block.revisionId);assert.deepEqual(current.job.manifest.artifacts,original.job.manifest.artifacts);
  assert.equal(modelCalls,before);
});

test('CAD: a late export cannot roll back a newer accepted model revision',async t=>{
  const f=await setup(t,{CAD_TEST_MODEL:fakeModel}),initial=await(await submit(f)).json();
  const original=await finishWithSyntheticArtifacts(f,initial.job.id),actor=[...f.objects.values()][0];
  assert.equal((await f.request(`/api/learn/cad/jobs/${initial.job.id}/exports`,{method:'POST',body:{format:'stl'}})).status,202);
  const edit=await(await submit(f,request({requestId:'newer-edit',baseRevisionId:original.block.revisionId}))).json();
  const proposed=await finishWithSyntheticArtifacts(f,edit.job.id);
  assert.equal((await f.request(`/api/learn/cad/jobs/${edit.job.id}/accept`,{method:'POST',body:{expectedRevisionId:original.block.revisionId}})).status,200);
  const job=await actor.storage.get(`job:${initial.job.id}`),token=(await callbackToken({FILE_JOB_SECRET:f.env.CAD_JOB_SECRET},job.id,job.attempt)).token;
  const bytes=new TextEncoder().encode('synthetic STL'),sha256=createHash('sha256').update(bytes).digest('hex');
  const base=`/api/learn/cad/jobs/${job.id}/attempts/${job.attempt}`;
  const output=await cadRoute(`${base}/outputs/model.stl`,new Request(`http://127.0.0.1${base}/outputs/model.stl`,{method:'PUT',headers:{authorization:`Bearer ${token}`,'content-length':String(bytes.length),'x-content-sha256':sha256},body:bytes}),f.env);
  assert.equal(output.status,201);
  const completed=await cadRoute(`${base}/complete`,new Request(`http://127.0.0.1${base}/complete`,{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({schema:'cad-execute-result/1',job_id:job.id,attempt:job.attempt,revision_id:job.revisionId,runtime:{cadgen:'0.7.21'},outputs:[{name:'model.stl',kind:'stl',media_type:'model/stl',bytes:bytes.length,sha256}],validation:{baselinePassed:true,units:'mm',checks:[]}})}),f.env);
  assert.equal(completed.status,200);
  assert.equal((await actor.storage.get(`model:${job.modelId}`)).revisionId,proposed.job.revisionId);
});

test('CAD: public status omits private input context and reference provenance while durable job retains them', async t => {
  const privateMarker='PRIVATE_REFERENCE_DRAWING_SENTINEL';
  const f=await setup(t,{CAD_TEST_MODEL:async()=>({...design,brief:{...design.brief,references:[{title:privateMarker,url:'https://private.invalid/drawing'}],context:{privateMarker}}})});
  const created=await (await submit(f,request({context:{selected:[{title:privateMarker}]}}))).json(),actor=[...f.objects.values()][0],key=`job:${created.job.id}`;
  await actor.instance.advance(await actor.storage.get(key));
  const stored=await actor.storage.get(key);assert.match(JSON.stringify(stored.context),new RegExp(privateMarker));assert.match(JSON.stringify(stored.brief.references),new RegExp(privateMarker));
  const visible=await (await f.request(`/api/learn/cad/jobs/${created.job.id}`)).json();assert.doesNotMatch(JSON.stringify(visible),new RegExp(privateMarker));
  assert.equal(visible.job.brief.units,'mm');
});

test('CAD: missing required previews retain validated STEP and Retry dispatches export without another design call', async t => {
  let modelCalls=0;
  const f=await setup(t,{CAD_TEST_MODEL:async job=>{modelCalls++;return fakeModel(job);}}),created=await (await submit(f)).json();
  const partial=await finishWithSyntheticArtifacts(f,created.job.id,{kinds:['step'],review:false});
  assert.equal(partial.job.state,'failed');assert.match(partial.job.error,/Geometry was saved/);
  assert.ok(partial.job.manifest.artifacts.some(item=>item.kind==='step'));assert.ok(!partial.job.manifest.artifacts.some(item=>item.kind==='glb'));
  const before=modelCalls,response=await f.request(`/api/learn/cad/jobs/${created.job.id}/retry`,{method:'POST',body:{confirmed:true}});assert.equal(response.status,202);
  const actor=[...f.objects.values()][0];let dispatched;
  actor.instance.executor=async(path,body)=>{dispatched=body;return new Response('',{status:202});};
  await actor.instance.advance(await actor.storage.get(`job:${created.job.id}`));
  assert.equal(dispatched.operation,'export');assert.deepEqual(dispatched.formats,['glb']);
  assert.equal(dispatched.source.sha256,partial.job.manifest.artifacts.find(item=>item.kind==='step').sha256);
  assert.equal(modelCalls,before,'retrying required preview must not regenerate design');
  // Final visual review is deliberately not exercised here; it remains a separate counted model operation.
});
