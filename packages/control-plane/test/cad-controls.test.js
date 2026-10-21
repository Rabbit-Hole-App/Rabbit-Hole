// CAD controls lifecycle (C:/s/spec/cad-controls/design.md): brief-first approval behind CAD_BRIEF_FIRST, parameter
// rebuilds without a model call, stale acceptance, failed-rebuild recovery. Real SQLite/HTTP routes, simulated DO
// storage, a stubbed model and a stubbed executor: wiring and lifecycle only, never real geometry or model quality.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { startCadAcceptanceStack } from './cad-acceptance-stack.mjs';
import { callbackToken } from '../src/file-jobs.js';
import { cadRoute, CadJobs } from '../src/cad-jobs.js';
import { cadModelRequest } from '../src/cad-model.js';
import { requestSpendBound } from '../src/learn-spend.js';

const plate = () => JSON.parse(readFileSync(new URL('../../cad-execute/fixtures/plate-holes/design.json', import.meta.url), 'utf8'));
const PROMPT = 'Make a plate with a row of holes for a small shelf bracket.';
const request = (extra = {}) => ({ app: 'cad-a', board: 'main', cardId: 'cad-card', requestId: 'req-1', prompt: PROMPT, context: { selected: [] }, confirmed: true, ...extra });
const BOARD = 'cad-board-a';

async function setup(t, { briefFirst = false, design = plate, env = {} } = {}) {
  const calls = [], sent = [], executorCaps = ['parameters'];
  const model = async (job, prepared) => {
    calls.push({ phase: job.modelPhase === 'review' ? 'review' : job.modelPhase === 'brief' ? 'brief' : job.approval ? 'source' : 'single', prepared, job });
    if (job.modelPhase === 'review') return { accepted: true, problems: [] };
    if (job.modelPhase === 'brief') return design();
    // An approved build tries to rewrite requirements and drop checks; the server must ignore both.
    if (job.approval) return { source: '# synthetic source; never executed\n', brief: { ...design().brief, requirements: ['anything goes'] }, checks: [] };
    return { ...design(), source: '# synthetic source; never executed\n' };
  };
  const f = await startCadAcceptanceStack({ cadRoute, CadJobs, extraEnv: { CAD_TEST_MODEL: model, ...(briefFirst ? { CAD_BRIEF_FIRST: 'true' } : {}), ...env } });
  t.after(() => f.close());
  const actor = () => f.objects.get(BOARD);
  // The executor's /health capability list (cad-execute CAPABILITIES); tests empty it to stand in for an older executor.
  const stubExecutor = () => { actor().instance.executor = async (path, body) => { if (path === '/jobs') sent.push(body); return new Response('{}', { status: 202 }); }; actor().instance.executorSupports = async c => executorCaps.includes(c); };
  const job = async id => actor().storage.get(`job:${id}`);
  const advance = async id => { stubExecutor(); await actor().instance.advance(await job(id)); return job(id); };
  const post = (path, body, email) => f.request(path, { method: 'POST', body, ...(email !== undefined ? { email } : {}) });
  const api = id => `/api/learn/cad/jobs/${encodeURIComponent(id)}`;
  // The executor's callbacks for the current attempt: synthetic outputs, validation echoing the resolved checks.
  async function deliver(id, { controls, fail } = {}) {
    const current = await job(id), token = (await callbackToken({ FILE_JOB_SECRET: f.env.CAD_JOB_SECRET }, id, current.attempt)).token;
    const callback = (action, body, method = 'POST', headers = {}) => {
      const path = `${api(id)}/attempts/${current.attempt}/${action}`;
      return cadRoute(path, new Request(`http://127.0.0.1${path}`, { method, headers: { authorization: `Bearer ${token}`, ...headers }, body: body instanceof Uint8Array ? body : JSON.stringify(body) }), f.env);
    };
    if (fail) { const r = await callback('fail', fail); assert.equal(r.status, 200, await r.clone().text()); return job(id); }
    const outputs = [];
    for (const [name, kind, media_type] of [['model.step', 'step', 'model/step'], ['model.glb', 'glb', 'model/gltf-binary'], ['thumbnail.png', 'thumbnail', 'image/png'], ['validation.json', 'validation', 'application/json']]) {
      const bytes = new TextEncoder().encode(`synthetic ${name} ${current.revisionId}`), sha256 = createHash('sha256').update(bytes).digest('hex');
      const r = await callback(`outputs/${name}`, bytes, 'PUT', { 'content-length': String(bytes.length), 'x-content-sha256': sha256 });
      assert.equal(r.status, 201, await r.clone().text()); outputs.push({ name, kind, media_type, bytes: bytes.length, sha256 });
    }
    const validation = { baselinePassed: true, passed: true, units: 'mm', geometry_units: 'mm', facts: { bounds_mm: { x: 120, y: 40, z: 5 } },
      checks: current.checks.map(c => ({ id: c.id, kind: c.kind, status: 'passed', passed: true, actual: c.value, expected: c.value, tolerance: c.tolerance })) };
    const r = await callback('complete', { schema: 'cad-execute-result/1', job_id: id, attempt: current.attempt, revision_id: current.revisionId, runtime: { cadgen: '0.7.21' }, outputs, validation, ...(controls ? { controls } : {}) });
    assert.equal(r.status, 200, await r.clone().text());
    return job(id);
  }
  const allRead = { read: ['length', 'width', 'thickness', 'hole_diameter', 'hole_count', 'hole_spacing'], computed: { edge_margin: 27, unknown_value: 1 } };
  // A first model, built and accepted through the existing single-call path.
  async function acceptedModel() {
    const created = await (await post('/api/learn/cad/jobs', request())).json();
    await advance(created.job.id); await advance(created.job.id);
    await deliver(created.job.id, { controls: allRead });
    const ready = await advance(created.job.id);
    assert.equal(ready.state, 'ready'); assert.equal(ready.awaitingAccept, false);
    return { id: created.job.id, revisionId: ready.revisionId };
  }
  return { f, calls, sent, job, advance, post, api, deliver, acceptedModel, allRead, actor, executorCaps };
}

test('CAD brief-first is off by default: one call returns source as today', async t => {
  const s = await setup(t);
  const created = await (await s.post('/api/learn/cad/jobs', request())).json();
  const job = await s.advance(created.job.id);
  assert.equal(job.state, 'building'); assert.deepEqual(s.calls.map(c => c.phase), ['single']);
  assert.equal(job.briefHash, undefined); assert.ok(job.sourceText);
});

test('CAD brief-first: brief prepared, stops for approval, survives refresh, edits revalidate without a call', async t => {
  const s = await setup(t, { briefFirst: true });
  const created = await (await s.post('/api/learn/cad/jobs', request())).json();
  let job = await s.advance(created.job.id);
  assert.equal(job.state, 'awaiting_approval'); assert.equal(job.sourceText, undefined); assert.equal(job.source, undefined);
  assert.deepEqual(s.calls.map(c => c.phase), ['brief']);
  assert.equal(s.calls[0].prepared.request.max_tokens, 2500); assert.match(s.calls[0].prepared.request.system, /Do not write source code/);
  assert.ok(job.phaseUsd.interpretation > 0 && job.phaseUsd.interpretation <= 0.10);
  // Refresh: the review state is the durable job record; alarms never advance it.
  const fetched = await (await s.f.request(s.api(created.job.id))).json();
  assert.equal(fetched.job.state, 'awaiting_approval'); assert.equal(fetched.job.request, PROMPT); assert.equal(fetched.job.briefHash, job.briefHash);
  assert.equal(fetched.job.brief.controls.schema, 'cad-params/1');
  await s.actor().instance.alarm(); assert.equal(s.calls.length, 1);
  const hash = job.briefHash, brief = path => `${s.api(created.job.id)}/brief`;
  assert.equal((await s.post(brief(), { expectedBriefHash: 'stale', brief: { assumptions: ['x'] } })).status, 409);
  const reprompt = await s.post(brief(), { expectedBriefHash: hash, prompt: 'something else' });
  assert.equal(reprompt.status, 409); assert.equal((await reprompt.json()).code, 'reprepare_required');
  const fewer = structuredClone(job.brief.controls); fewer.parameters = fewer.parameters.filter(p => p.id !== 'hole_spacing'); fewer.constraints = fewer.constraints.filter(c => c.right !== 'hole_spacing' && c.left !== 'hole_spacing');
  const structural = await s.post(brief(), { expectedBriefHash: hash, brief: { controls: fewer } });
  assert.equal(structural.status, 409); assert.equal((await structural.json()).code, 'reprepare_required');
  const invalid = structuredClone(job.brief.controls); invalid.parameters.find(p => p.id === 'hole_diameter').value = 12; invalid.parameters.find(p => p.id === 'width').value = 10;
  const refused = await s.post(brief(), { expectedBriefHash: hash, brief: { controls: invalid } });
  assert.equal(refused.status, 422); assert.match((await refused.json()).error, /narrower than the plate/);
  // A supported field edit: new assumption and a new count. Server revalidates, re-derives checks, needs approval again.
  const edited = structuredClone(job.brief.controls); edited.parameters.find(p => p.id === 'hole_count').value = 4;
  const ok = await (await s.post(brief(), { expectedBriefHash: hash, brief: { controls: edited, assumptions: ['Four 6 mm holes at 30 mm pitch'], missing: ['Shelf screw size'] } })).json();
  assert.notEqual(ok.job.briefHash, hash); assert.equal(ok.job.approval, null);
  job = await s.job(created.job.id);
  assert.ok(Math.abs(job.checks.find(c => c.id === 'volume').value - (120 * 40 * 5 - 4 * Math.PI * 9 * 5)) < 1e-9);
  assert.equal(s.calls.length, 1, 'no model call for a field edit');
  const approve = body => s.post(`${s.api(created.job.id)}/approve`, body);
  assert.equal((await approve({ briefHash: job.briefHash })).status, 428, 'approval is an explicit paid confirmation');
  assert.equal((await approve({ briefHash: hash, confirmed: true })).status, 409, 'the old approval hash is stale');
  assert.match((await (await approve({ briefHash: job.briefHash, confirmed: true })).json()).error, /missing information/);
  const cleared = await (await s.post(brief(), { expectedBriefHash: job.briefHash, brief: { missing: [] } })).json();
  const approved = await approve({ briefHash: cleared.job.briefHash, confirmed: true });
  assert.equal(approved.status, 202);
  const approvedBrief = (await s.job(created.job.id)).brief, approvedChecks = (await s.job(created.job.id)).checks;
  // Generation receives the approved brief and may not rewrite it or weaken its checks.
  job = await s.advance(created.job.id);
  assert.deepEqual(s.calls.map(c => c.phase), ['brief', 'source']);
  const data = JSON.parse(s.calls[1].prepared.request.messages[0].content.at(-1).text);
  assert.deepEqual(data.approvedBrief, approvedBrief); assert.equal(data.request, undefined);
  assert.match(s.calls[1].prepared.request.system, /cad_params import value, computed/);
  assert.deepEqual(job.brief, approvedBrief); assert.deepEqual(job.checks, approvedChecks); assert.equal(job.checks.length, 6);
  assert.equal(job.state, 'building'); assert.ok(job.phaseUsd.generation > 0);
  job = await s.advance(created.job.id);
  assert.equal(s.sent.at(-1).parameters.values.hole_count, 4, 'validated values travel as data');
  await s.deliver(created.job.id, { controls: s.allRead });
  job = await s.advance(created.job.id);
  assert.equal(job.state, 'ready'); assert.deepEqual(s.calls.map(c => c.phase), ['brief', 'source', 'review']);
  assert.deepEqual(Object.keys(job.phaseUsd).sort(), ['generation', 'interpretation', 'review']);
  const listed = await (await s.f.request('/api/learn/cad/jobs?app=cad-a&board=main')).json();
  const block = JSON.stringify(listed.blocks[0]);
  assert.ok(!block.includes(PROMPT) && !block.includes('contextUsed') && !block.includes('Shelf screw'), 'the board block carries no private request detail');
  assert.deepEqual(listed.blocks[0].manifest.controls.bindings, s.allRead.read);
  assert.deepEqual(listed.blocks[0].manifest.controls.computed, { edge_margin: 27 }, 'undeclared reports are dropped');
});

test('CAD rebuild: validated values, no model call, preview then Accept; stale acceptance refused', async t => {
  const s = await setup(t);
  const base = await s.acceptedModel(), modelCalls = s.calls.length;
  const rebuild = (body, email) => s.post(`${s.api(base.id)}/rebuild`, { requestId: 'rb-1', expectedRevisionId: base.revisionId, ...body }, email);
  assert.equal((await rebuild({ values: { hole_diameter: 9 } }, 'other@test')).status, 404, 'only the owner rebuilds');
  assert.equal((await rebuild({ expectedRevisionId: 'cr_old', values: { hole_diameter: 9 } })).status, 409);
  for (const [values, pattern] of [[{ hole_count: 2.5 }, /whole number/], [{ edge_margin: 3 }, /computed/], [{ hole_diameter: 45 }, /at most 30/], [{ hole_diameter: 20, width: 15 }, /narrower than the plate/], [{ hole_diameter: 6 }, /No parameter changed/]]) {
    const r = await rebuild({ requestId: `bad-${JSON.stringify(values)}`, values });
    assert.equal(r.status, 422, JSON.stringify(values)); assert.match((await r.json()).error, pattern);
  }
  const started = await rebuild({ values: { hole_diameter: 9 } });
  assert.equal(started.status, 202);
  const { job: proposed } = await started.json();
  assert.equal(proposed.rebuild, true); assert.equal(proposed.state, 'building'); assert.equal(proposed.baseRevisionId, base.revisionId);
  assert.equal((await rebuild({ requestId: 'rb-2', values: { hole_count: 4 } })).status, 409, 'one change at a time');
  assert.equal((await rebuild({ values: { hole_diameter: 9 } })).status, 200, 'same request identity returns the same job');
  let job = await s.advance(proposed.id);
  const accepted = await s.job(base.id);
  assert.equal(job.source.sha256, accepted.source.sha256, 'the same saved source text');
  assert.notEqual(job.source.id, accepted.source.id, 'stored per revision, as every revision is');
  job = await s.advance(proposed.id);
  const dispatched = s.sent.at(-1);
  assert.deepEqual(dispatched.parameters.values, { length: 120, width: 40, thickness: 5, hole_diameter: 9, hole_count: 3, hole_spacing: 30 });
  const expected = Object.fromEntries(dispatched.requirements.checks.map(c => [c.id, c.value]));
  assert.equal(expected.hole_d, 9); assert.equal(expected.size_x, 120, 'unrelated expectations unchanged');
  assert.ok(Math.abs(expected.volume - (120 * 40 * 5 - 3 * Math.PI * 4.5 * 4.5 * 5)) < 1e-9);
  job = await s.deliver(proposed.id, { controls: s.allRead });
  assert.equal(job.state, 'ready'); assert.equal(job.awaitingAccept, true);
  assert.equal(s.calls.length, modelCalls, 'no model call for a rebuild, not even review');
  const listed = await (await s.f.request('/api/learn/cad/jobs?app=cad-a&board=main')).json();
  assert.equal(listed.blocks[0].revisionId, base.revisionId, 'the accepted model stays until Accept');
  assert.equal(listed.blocks[0].proposedRevisionId, job.revisionId);
  const accept = body => s.post(`${s.api(proposed.id)}/accept`, body);
  assert.equal((await accept({ expectedRevisionId: 'cr_other' })).status, 409);
  assert.equal((await accept({ expectedRevisionId: base.revisionId })).status, 200);
  const model = await s.actor().storage.get(`model:${accepted.modelId}`);
  assert.equal(model.revisionId, job.revisionId); assert.equal(model.manifest.controls.values.hole_diameter, 9);
  // A preview built from the old revision can no longer be accepted.
  const second = await (await s.post(`${s.api(proposed.id)}/rebuild`, { requestId: 'rb-3', expectedRevisionId: job.revisionId, values: { hole_count: 4 } })).json();
  await s.advance(second.job.id); await s.advance(second.job.id); await s.deliver(second.job.id, { controls: s.allRead });
  assert.equal((await s.post(`${s.api(second.job.id)}/cancel`, {})).status, 200, 'Discard');
  assert.equal((await s.post(`${s.api(second.job.id)}/accept`, { expectedRevisionId: job.revisionId })).status, 409);
  assert.equal((await s.actor().storage.get(`model:${accepted.modelId}`)).revisionId, job.revisionId);
});

test('CAD rebuild failure keeps the accepted model, explains a source rejection, never repairs', async t => {
  const s = await setup(t);
  const base = await s.acceptedModel(), modelCalls = s.calls.length;
  const started = await (await s.post(`${s.api(base.id)}/rebuild`, { requestId: 'rb-fail', expectedRevisionId: base.revisionId, values: { hole_count: 4, hole_spacing: 40 } })).json();
  await s.advance(started.job.id); await s.advance(started.job.id);
  const failed = await s.deliver(started.job.id, { fail: { error: 'execution_failed', phase: 'build', diagnostics: 'Traceback (most recent call last):\n  File "model.py", line 15\nValueError: The 4 holes need 126 mm but the plate is only 120 mm long.\nTraceback (most recent call last):\nsubprocess.CalledProcessError: returned non-zero exit status 1.' } });
  assert.equal(failed.state, 'failed'); assert.equal(failed.attempt, 1, 'no repair attempt'); assert.equal(failed.repairs, 0);
  assert.match(failed.error, /The model rejected these values: The 4 holes need 126 mm but the plate is only 120 mm long\. The accepted model is unchanged\./);
  assert.equal(s.calls.length, modelCalls);
  const model = await s.actor().storage.get(`model:${(await s.job(base.id)).modelId}`);
  assert.equal(model.revisionId, base.revisionId);
  const retried = await (await s.post(`${s.api(started.job.id)}/retry`, { confirmed: true })).json();
  assert.equal(retried.job.state, 'building', 'retry re-runs the executor, not a model');
  await s.advance(started.job.id);
  assert.equal(s.calls.length, modelCalls);
});

test('CAD rebuild is refused for models without source bindings (legacy, imported, unbound)', async t => {
  const legacy = await setup(t, { design: () => ({ brief: { title: 'Legacy plate', units: 'mm', parameters: { length: 40 }, assumptions: [], requirements: [] }, checks: [] }) });
  const created = await (await legacy.post('/api/learn/cad/jobs', request())).json();
  await legacy.advance(created.job.id); await legacy.advance(created.job.id); await legacy.deliver(created.job.id); const ready = await legacy.advance(created.job.id);
  const r = await legacy.post(`${legacy.api(created.job.id)}/rebuild`, { requestId: 'x', expectedRevisionId: ready.revisionId, values: { length: 50 } });
  assert.equal(r.status, 409); const body = await r.json(); assert.equal(body.code, 'not_deterministic'); assert.match(body.error, /Edit with AI/);
  const unbound = await setup(t);
  const made = await (await unbound.post('/api/learn/cad/jobs', request())).json();
  await unbound.advance(made.job.id); await unbound.advance(made.job.id); await unbound.deliver(made.job.id, { controls: { read: [], computed: {} } }); const built = await unbound.advance(made.job.id);
  const refused = await unbound.post(`${unbound.api(made.job.id)}/rebuild`, { requestId: 'y', expectedRevisionId: built.revisionId, values: { length: 130 } });
  assert.equal(refused.status, 409); assert.equal((await refused.json()).code, 'not_deterministic');
});

test('CAD interpretation call stays inside the existing per-call reservation', () => {
  const design = plate();
  const job = { modelPhase: 'brief', prompt: 'x'.repeat(4000), context: { text: 'y'.repeat(12000) }, brief: design.brief };
  const { request: prepared, reservedUsd } = cadModelRequest(job);
  assert.equal(prepared.max_tokens, 2500); assert.ok(reservedUsd <= 0.07, String(reservedUsd));
  // The existing per-call cap still refuses oversized context before any spend; it is not raised for the new phase.
  assert.throws(() => cadModelRequest({ ...job, prompt: 'x'.repeat(8000), context: { text: 'y'.repeat(30000) } }), /per-call/);
  const source = cadModelRequest({ approval: { briefHash: 'h' }, brief: design.brief, checkSpecs: design.checks, context: {} });
  assert.equal(source.request.max_tokens, 6000);
  assert.ok(requestSpendBound(source.request, 'claude-sonnet-5-5') <= 0.10);
});

test('CAD brief-first: Cancel during review spends nothing more and contacts no executor', async t => {
  const s = await setup(t, { briefFirst: true });
  const created = await (await s.post('/api/learn/cad/jobs', request())).json();
  await s.advance(created.job.id);
  const cancelled = await (await s.post(`${s.api(created.job.id)}/cancel`, {})).json();
  assert.equal(cancelled.job.state, 'cancelled');
  const job = await s.job(created.job.id);
  assert.equal(job.cancelPending, undefined); assert.equal(job.source, undefined);
  await s.actor().instance.alarm();
  assert.equal(s.calls.length, 1); assert.equal(s.sent.length, 0);
  assert.equal((await s.post(`${s.api(created.job.id)}/approve`, { briefHash: job.briefHash, confirmed: true })).status, 409);
});

test('CAD rebuild Accept keeps the last accepted prompt and records the parameter revision', async t => {
  const s = await setup(t);
  const base = await s.acceptedModel();
  const started = await (await s.post(`${s.api(base.id)}/rebuild`, { requestId: 'rb-p', expectedRevisionId: base.revisionId, values: { hole_diameter: 9, hole_count: 4 } })).json();
  await s.advance(started.job.id); await s.advance(started.job.id); const ready = await s.deliver(started.job.id, { controls: s.allRead });
  const accepted = await (await s.post(`${s.api(started.job.id)}/accept`, { expectedRevisionId: base.revisionId })).json();
  assert.equal(accepted.block.promptUsed, PROMPT, 'a parameter-only Accept keeps the prompt');
  const model = await s.actor().storage.get(`model:${(await s.job(base.id)).modelId}`);
  assert.equal(model.prompt, PROMPT);
  assert.deepEqual(model.revisions.map(r => [r.kind, r.parentRevisionId, r.revisionId]), [['generated', null, base.revisionId], ['parameters', base.revisionId, ready.revisionId]]);
  assert.deepEqual(model.revisions[1].changes, [{ id: 'hole_diameter', label: 'Hole diameter', unit: 'mm', from: 6, to: 9 }, { id: 'hole_count', label: 'Number of holes', from: 3, to: 4 }]);
  assert.deepEqual(accepted.block.revisions, model.revisions, 'the card gets the history');
  assert.ok(!JSON.stringify(accepted.block.revisions).includes(PROMPT), 'revisions carry no words');
});

test('CAD rebuild Discard hands the card back to its accepted job, also after a failure and on reload', async t => {
  const s = await setup(t);
  const base = await s.acceptedModel();
  const started = await (await s.post(`${s.api(base.id)}/rebuild`, { requestId: 'rb-d', expectedRevisionId: base.revisionId, values: { hole_diameter: 9 } })).json();
  await s.advance(started.job.id); await s.advance(started.job.id); await s.deliver(started.job.id, { controls: s.allRead });
  const discarded = await (await s.post(`${s.api(started.job.id)}/cancel`, {})).json();
  assert.equal(discarded.block.jobId, base.id); assert.equal(discarded.block.status, 'ready'); assert.equal(discarded.block.revisionId, base.revisionId);
  const listed = await (await s.f.request('/api/learn/cad/jobs?app=cad-a&board=main')).json();
  assert.equal(listed.blocks[0].jobId, base.id, 'a reload restores the accepted job, not the discarded preview');
  const failing = await (await s.post(`${s.api(base.id)}/rebuild`, { requestId: 'rb-f', expectedRevisionId: base.revisionId, values: { hole_count: 5 } })).json();
  await s.advance(failing.job.id); await s.advance(failing.job.id);
  const failed = await s.deliver(failing.job.id, { fail: { error: 'execution_failed', phase: 'build', diagnostics: 'ValueError: too many holes' } });
  assert.equal(failed.state, 'failed');
  const dropped = await (await s.post(`${s.api(failing.job.id)}/cancel`, {})).json();
  assert.equal(dropped.block.jobId, base.id); assert.equal((await s.job(failing.job.id)).state, 'cancelled');
  assert.equal((await s.actor().storage.get(`model:${(await s.job(base.id)).modelId}`)).revisionId, base.revisionId);
});

test('CAD rebuild is refused before dispatch when the executor lacks parameter support', async t => {
  const s = await setup(t);
  const base = await s.acceptedModel(), sentBefore = s.sent.length;
  s.executorCaps.length = 0;
  const refused = await s.post(`${s.api(base.id)}/rebuild`, { requestId: 'rb-u', expectedRevisionId: base.revisionId, values: { hole_diameter: 9 } });
  assert.equal(refused.status, 409); const body = await refused.json();
  assert.equal(body.code, 'executor_unsupported'); assert.match(body.error, /cannot rebuild from parameter values.*Edit with AI/);
  assert.equal((await (await s.f.request('/api/learn/cad/jobs?app=cad-a&board=main')).json()).jobs.length, 1, 'no job was created');
  // No answer from /health is not evidence of an old executor: a retryable 503, still before any job.
  s.actor().instance.executorSupports = async () => null;
  const silent = await s.post(`${s.api(base.id)}/rebuild`, { requestId: 'rb-n', expectedRevisionId: base.revisionId, values: { hole_diameter: 9 } });
  assert.equal(silent.status, 503); assert.equal((await silent.json()).code, 'executor_unavailable');
  assert.equal((await (await s.f.request('/api/learn/cad/jobs?app=cad-a&board=main')).json()).jobs.length, 1);
  s.actor().instance.executorSupports = async c => s.executorCaps.includes(c);
  // A rebuild accepted by a supporting executor, then retried after the executor was replaced by an older one.
  s.executorCaps.push('parameters');
  const started = await (await s.post(`${s.api(base.id)}/rebuild`, { requestId: 'rb-s', expectedRevisionId: base.revisionId, values: { hole_diameter: 9 } })).json();
  assert.equal(started.job.state, 'building', 'the supported path starts');
  await s.advance(started.job.id); s.executorCaps.length = 0;
  const failed = await s.advance(started.job.id);
  assert.equal(failed.state, 'failed'); assert.match(failed.error, /cannot rebuild from parameter values.*The accepted model is unchanged/);
  assert.equal(s.sent.length, sentBefore, 'nothing reached the executor');
  assert.equal((await s.actor().storage.get(`model:${(await s.job(base.id)).modelId}`)).revisionId, base.revisionId);
});

test('CAD brief-first needs three calls: with the production CAD_MAX_CALLS=2 the job fails before its visual review', async t => {
  // wrangler.rabbit-hole-prod.jsonc sets CAD_MAX_CALLS 2; brief, source and review are three calls. Ceilings are unchanged here.
  const s = await setup(t, { briefFirst: true, env: { CAD_MAX_CALLS: '2' } });
  const created = await (await s.post('/api/learn/cad/jobs', request())).json();
  const job = await s.advance(created.job.id);
  const approved = await s.post(`${s.api(created.job.id)}/approve`, { briefHash: job.briefHash, confirmed: true });
  assert.equal(approved.status, 202);
  await s.advance(created.job.id); await s.advance(created.job.id); await s.deliver(created.job.id, { controls: s.allRead });
  await s.actor().instance.alarm();
  const failed = await s.job(created.job.id);
  assert.equal(failed.state, 'failed'); assert.match(failed.error, /model-call or spend limit/);
  assert.deepEqual(s.calls.map(c => c.phase), ['brief', 'source'], 'the review call is never made');
});
