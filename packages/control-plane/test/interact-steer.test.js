// Item 5: JEV steer and triage. A fake fetch stands in for System One; a tripwire on globalThis.fetch proves nothing else is reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHash } from '../../web/src/interact-plan.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { buildInput, buildScene } from '../src/interact-build.js';
import { programRepairContent } from '../src/explain-program-stage.js';
import { fixtureContext } from '../src/interact-fixtures.js';
import { STEER_QUESTIONS, TRIAGE_QUESTIONS, steerBuild, steerEnabled, triageFailure } from '../src/interact-steer.js';

const { capabilities, plans } = await interactFixtures();
const plan = plans.standard;
const ON = { INTERACT_STEER: 'jev', TYPESAFE_API_KEY: 'k-test' };

let logs;
test.beforeEach(t => {
  const original = globalThis.fetch, log = console.log;
  logs = []; globalThis.fetch = () => { throw new Error('network call in a fixture test'); }; console.log = line => logs.push(line);
  t.after(() => { globalThis.fetch = original; console.log = log; });
});
const choice = (name, p) => ({ choice: name, confidence: p, probabilities: { [name]: p } });
const answers = (over = {}) => ({ sceneKind: choice('time', 0.9), objectBudget: choice('medium', 0.8), stateful: { noul: 0.1 },
  uses_vector: { noul: 0.9 }, uses_gate: { noul: 0.7 }, uses_groundMark: { noul: 0.61 }, uses_axis: { noul: 0.2 }, uses_plot: { noul: 0.59 }, uses_diagram: { noul: 0 }, ...over });
const fake = (body, calls = []) => async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return body instanceof Response ? body : Response.json(body); };

test('steerBuild: the System One request is the planner\'s shape and its answers become the steer object', async () => {
  const calls = [];
  const steer = await steerBuild(ON, plan, { fetchImpl: fake({ answers: answers(), usage: { input_tokens: 321 } }, calls) });
  assert.deepEqual({ ...steer, ms: 0 }, { sceneKind: 'time', composites: ['vector', 'gate', 'groundMark'], stateful: false, objectBudget: 'medium', ms: 0, inputTokens: 321 });
  const [{ url, init, body }] = calls;
  assert.equal(url, 'https://api.typesafe.ai/v1/systemone'); assert.equal(init.method, 'POST'); assert.equal(init.headers.Authorization, 'Bearer k-test'); assert.ok(init.signal instanceof AbortSignal);
  assert.equal(body.model, 'jev-latest'); assert.deepEqual(body.questions, STEER_QUESTIONS);
  assert.equal(body.state.title, plan.title); assert.ok(Object.values(body.state).every(v => typeof v !== 'string' || v.length <= 2000));
  assert.ok(logs.some(l => JSON.parse(l).event === 'interact_steer' && JSON.parse(l).call === 'steer' && Number.isFinite(JSON.parse(l).ms)), 'one log line per call, with ms');
});

test('the questions classify only: choice or noul, and no server limit or rule is written into one', () => {
  for (const q of [...Object.values(STEER_QUESTIONS), ...Object.values(TRIAGE_QUESTIONS)]) {
    assert.ok(['choice', 'noul'].includes(q.type));
    assert.ok(!/\b(at most|at least|never|always|must not|limit|\d+\s*(px|ms|bytes))\b/i.test(JSON.stringify(q)), q.instructions);
  }
});

test('a low-confidence kind or budget is left to the defaults', async () => {
  const steer = await steerBuild(ON, plan, { fetchImpl: fake({ answers: answers({ sceneKind: choice('static', 0.4), objectBudget: choice('large', 0.5), stateful: { noul: 0.7 } }) }) });
  assert.equal(steer.sceneKind, null); assert.equal(steer.objectBudget, 'medium'); assert.equal(steer.stateful, true);
});

test('off by default: no setting, no key, or another value is null with no request at all', async () => {
  let calls = 0; const fetchImpl = async () => { calls++; return Response.json({ answers: answers() }); };
  for (const env of [{}, { TYPESAFE_API_KEY: 'k' }, { INTERACT_STEER: 'jev' }, { INTERACT_STEER: 'on', TYPESAFE_API_KEY: 'k' }]) {
    assert.equal(steerEnabled(env), false); assert.equal(await steerBuild(env, plan, { fetchImpl }), null); assert.equal(await triageFailure(env, ['x'], { fetchImpl }), null);
  }
  assert.equal(calls, 0);
});

test('a timeout, an HTTP error, a bad body or incomplete answers are null with one interact_steer_failed line (reason, timeout, ms)', async () => {
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  assert.equal(await steerBuild(ON, plan, { fetchImpl: hang, timeoutMs: 15 }), null);
  const failed = () => logs.map(l => JSON.parse(l)).filter(l => l.event === 'interact_steer_failed');
  assert.equal(failed().length, 1); assert.equal(failed()[0].timeout, true); assert.equal(failed()[0].reason, 'timeout'); assert.equal(typeof failed()[0].ms, 'number');
  assert.equal(await steerBuild(ON, plan, { fetchImpl: fake(new Response('no', { status: 500 })) }), null); assert.equal(failed()[1].reason, 'http 500'); assert.equal(failed()[1].timeout, false);
  assert.equal(await steerBuild(ON, plan, { fetchImpl: fake({ answers: { sceneKind: choice('time', 1) } }) }), null); assert.equal(failed()[2].reason, 'incomplete answers');
  assert.equal(await steerBuild(ON, plan, { fetchImpl: async () => { throw new Error('boom'); } }), null); assert.equal(failed().length, 4);
  assert.equal(await triageFailure(ON, ['p'], { fetchImpl: hang, timeoutMs: 15 }), null); assert.equal(failed().length, 5); assert.equal(failed()[4].call, 'triage');
});

test('triageFailure classifies the failed rules and names the objects they quote; unsure is "other"; no problems is no call', async () => {
  const calls = [], problems = ['overlap: "label.v" and "ball.main" cover each other', { message: 'binding for \'speed\' missing', ids: ['speed', 'ctl.speed'] }];
  const triage = await triageFailure(ON, problems, { fetchImpl: fake({ answers: { failureClass: choice('geometry', 0.8) } }, calls) });
  assert.equal(triage.class, 'geometry'); assert.deepEqual(triage.objectIds, ['label.v', 'ball.main', 'speed', 'ctl.speed']);
  assert.deepEqual(calls[0].body.questions, TRIAGE_QUESTIONS); assert.match(calls[0].body.state.problems, /overlap/);
  assert.equal((await triageFailure(ON, problems, { fetchImpl: fake({ answers: { failureClass: choice('physics', 0.3) } }) })).class, 'other');
  assert.equal(await triageFailure(ON, [], { fetchImpl: fake({}, calls) }), null); assert.equal(calls.length, 1);
});

test('the build request is byte-identical to today\'s when the steer is null, and a steer lists only the named helpers and states the scene kind', async () => {
  const job = { id: 'job-standard', plan: structuredClone(plan), planHash: await planHash(plan), capabilities };
  const today = JSON.stringify(buildInput(job, plan, job.planHash));
  assert.equal(JSON.stringify(buildInput(job, plan, job.planHash, null)), today);
  const steered = buildInput(job, plan, job.planHash, { sceneKind: 'time', composites: ['vector'], stateful: false, objectBudget: 'medium' });
  assert.equal(steered.steer.sceneKind, 'time');
  const { props, figures } = steered.program.sdk;
  if (props) assert.deepEqual(Object.keys(props).sort(), ['usage', 'vector']); assert.ok(!figures, 'no figure helper was named');
  assert.equal(JSON.stringify({ ...steered, steer: undefined, program: undefined }), JSON.stringify({ ...JSON.parse(today), program: undefined }), 'nothing else in the input changed');
  // the whole call: a null steer sends the same request as no steer
  const sent = async steer => { const ctx = fixtureContext(); ctx.steer = steer; await buildScene({ id: 'j', plan: structuredClone(plan), planHash: job.planHash, capabilities }, ctx); return JSON.stringify(ctx.adapter.log[0]); };
  assert.equal(await sent(null), await sent(undefined));
});

test('programRepairContent sends the failing rules that name the triaged objects and the class; without a triage it is unchanged', () => {
  const program = { source: 'export function evaluate(){}', manifest: { title: 't' } };
  const job = { prompt: 'p', round: 0, program }, failure = { problems: ['"a" overlaps "b"', 'binding for "z" missing', 'readout "r" wrong'], findings: [] };
  const base = JSON.parse(programRepairContent(job, failure)[0].text);
  assert.deepEqual(base.problems, failure.problems); assert.ok(!('triage' in base));
  assert.deepEqual(JSON.parse(programRepairContent(job, { ...failure, triage: null })[0].text), base);
  const t = JSON.parse(programRepairContent(job, { ...failure, triage: { class: 'geometry', objectIds: ['a', 'b'] } })[0].text);
  assert.deepEqual(t.problems, ['"a" overlaps "b"']); assert.deepEqual(t.triage, { class: 'geometry', objectIds: ['a', 'b'] }); assert.equal(t.omitted, 2);
});
