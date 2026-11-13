// The template build (interact-template.js, brief 7 section 4): INTERACT_BUILD_KIND=template and a plan that names a template -> the program is generated from the plan and the build makes zero model
// calls; everything after it (validate, headless run, oracle, layout rules, seal, compose, shadow judge) is the real path; a problem is our bug and stops the job as template_error (no repair loop).
// The generator under test is whatever packages/web/src/interact-templates/generate.js exports (a stub answering with the scripted program until agent B's generator is merged).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainRoute } from '../src/explain-job.js';
import { planHash } from '../../web/src/interact-plan.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { verifyComposition } from '../../web/src/interact-composition.js';
import { OWNER, BOARD, designStack } from './interact-design-fixture.js';
import { fixtureContext } from '../src/interact-fixtures.js';
import { ledgerRow } from '../src/interact-ledger.js';
import { beginStage, endStage, newTiming } from '../src/explain-policy.js';
import { buildTemplate, templateGate } from '../src/interact-template.js';

test.beforeEach(t => { const log = console.log; console.log = () => {}; t.after(() => { console.log = log; }); });

const { referencePlans, referenceCapabilities } = await interactFixtures();
const ON = { INTERACT_BUILD_KIND: 'template' };

// A plan clone that names the one-body template, written for the gate and wiring tests only (the three toss plans carry the real formulas and slots in interact-plan-fixtures.js).
const templated = (over = {}) => {
  const plan = structuredClone(referencePlans.tossOverview), formulas = { velocity: 'launchSpeed - gravity * t', height: 'launchSpeed * t - gravity * t^2 / 2', gravity: 'gravity', apexTime: 'launchSpeed / gravity' };
  for (const q of plan.scene.quantities) if (formulas[q.id]) q.formula = formulas[q.id];
  plan.scene.template = 'one-body'; plan.scene.slots = { height: 'height', velocity: 'velocity', acceleration: 'gravity' };
  return Object.assign(plan, over);
};

test('the gate: the setting unset or a plan without a template takes the model build; a template with every slot resolved takes the template build; anything else says why and takes the model build', () => {
  const plan = templated();
  assert.equal(templateGate({}, plan), null, 'unset');
  assert.equal(templateGate({ INTERACT_BUILD_KIND: '' }, plan), null);
  const bare = structuredClone(plan); delete bare.scene.template; delete bare.scene.slots;
  assert.equal(templateGate(ON, bare), null, 'a plan that names no template');
  assert.deepEqual(templateGate(ON, plan), { ok: true, template: 'one-body' });
  assert.match(templateGate({ INTERACT_BUILD_KIND: 'templte' }, plan).reason, /not "template"/);
  const missing = structuredClone(plan); delete missing.scene.slots.velocity;
  assert.deepEqual(templateGate(ON, missing), { ok: false, reason: 'slot "velocity" is missing' });
  const noFormula = structuredClone(plan); noFormula.scene.slots.height = 'apexHeight'; delete noFormula.scene.quantities.find(q => q.id === 'apexHeight').formula; // the fixtures now give every quantity a formula
  assert.match(templateGate(ON, noFormula).reason, /slot "height" names "apexHeight", which has no formula/);
  const unknown = structuredClone(plan); unknown.scene.template = 'orbit';
  assert.match(templateGate(ON, unknown).reason, /unknown template "orbit"/);
  const withSupport = structuredClone(plan); withSupport.supportingVisuals = [{ id: 'extra' }];
  assert.match(templateGate(ON, withSupport).reason, /supporting panels/);
  const lanes = structuredClone(plan); lanes.scene.template = 'two-lane';
  assert.match(templateGate(ON, lanes).reason, /maps exactly 2 lanes/);
});

test('buildTemplate seals the generated program through the same validation as a model\'s and composes the card, with no role call (the context has no adapter)', async () => {
  const plan = templated(), job = { id: 'job-template', plan, planHash: await planHash(plan), capabilities: referenceCapabilities };
  const ctx = { ...fixtureContext(), adapters: {}, adapter: undefined }; // a call would find no adapter: the build must not make one
  const built = await buildTemplate(job, ctx);
  assert.ok(built.artifacts && built.composition, JSON.stringify(built.problems ?? built.details));
  assert.equal(built.planHash, job.planHash);
  assert.deepEqual(await verifyComposition(built.composition, built.artifacts), []);
});

test('a plan that is not the approved one is refused before anything is generated', async () => {
  const plan = templated(), job = { id: 'job-template', plan, planHash: 'not-the-hash', capabilities: referenceCapabilities };
  await assert.rejects(() => buildTemplate(job, fixtureContext()), /not the one the learner approved/);
});

// The job-level tests need the three toss plans to name their templates (agent D's fixture data); they run as soon as that data is merged.
const REAL = referencePlans.tossStandard.scene.template !== undefined;
const PIN = { INTERACT_DESIGN_FIXTURE: 'toss', EXPLAIN_DIAGNOSTICS: 'true', INTERACT_DESCRIPTION_FIT: 'estimate', INTERACT_SEEK: 'on', INTERACT_RUN: 'headless', INTERACT_REVIEW: 'shadow' };
const media = () => { const data = new Map(); return { put: async (key, bytes) => { data.set(key, bytes); }, get: async key => (data.has(key) ? { arrayBuffer: async () => data.get(key).buffer } : null), delete: async key => { data.delete(key); } }; };
function stack(t, env = {}) {
  const s = designStack(t);
  delete s.deps.descriptionFit;
  s.deps.buildScene = undefined; // the real build, not a test's legacy-shaped seam
  Object.assign(s.env, PIN, { ASSETS: { fetch: async () => new Response('x') }, LEARN_MEDIA: media() }, env);
  const real = globalThis.fetch, sent = [];
  globalThis.fetch = async (url, options) => { sent.push(String(url)); throw new Error(`a template job must not call out: ${url}`); };
  t.after(() => { globalThis.fetch = real; });
  const route = async path => {
    const e = { ...s.env, EXPLAIN_JOBS: { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) } };
    const response = await explainRoute(`/api/learn/explain/jobs${path.split('?')[0]}`, new Request(`https://dev.test/api/learn/explain/jobs${path}`), e, { identity: async () => OWNER });
    return { status: response.status, body: await response.json() };
  };
  return { ...s, sent, route, jobOf: id => s.state.data.get(`job:${id}`) };
}
async function run(s, depth) {
  const { body } = await s.create({ depth }), id = body.job.id;
  assert.equal((await s.design(id)).job.stage, 'awaiting_approval');
  assert.equal((await s.approve(id)).status, 202);
  for (let i = 0; i < 30; i++) { await s.actor.alarm(); const job = s.jobOf(id); if (['ready', 'failed', 'cancelled'].includes(job.stage) && !job.inFlight) break; }
  return { id, job: s.jobOf(id) };
}

test('Brief, Balanced and Detailed reach ready on the template build with ZERO model calls; the ledger row says template, repairs 0, true stage times and the hop wait', { skip: !REAL && 'waits for the toss plans to name their templates (agent D)' }, async t => {
  for (const depth of ['brief', 'balanced', 'detailed']) {
    const s = stack(t, ON), { id, job } = await run(s, depth);
    assert.equal(job.stage, 'ready', `${depth}: ${JSON.stringify([job.stopReason, job.failure, job.findings])}`);
    assert.equal(job.build.kind, 'template');
    assert.deepEqual(job.build.counts, { build_author: 0, build_review: 0, build_repair: 0 }, 'no build call counted');
    assert.deepEqual(job.calls.filter(c => c.role.startsWith('build_')), [], 'no build call recorded');
    assert.deepEqual(s.sent, [], `${depth}: no outbound call at all`);
    await s.actor.alarm();
    const { ledger } = (await s.route(`/${id}?board=${BOARD.id}&detail=1`)).body.diagnostics;
    assert.deepEqual([ledger.authorModel, ledger.buildKind, ledger.repairs, ledger.result, ledger.stopReason, ledger.oracleFailed], ['template', 'template', 0, 'ready', 'accepted', 0], depth);
    assert.ok(ledger.oracleChecked > 0, 'the real oracle ran');
    assert.equal(ledger.msAuthor, null, 'no provider round trip');
    for (const k of ['msValidate', 'msRun', 'msCheck', 'msCompose', 'msHopWait', 'msTotal']) assert.ok(ledger[k] >= 0, `${depth} ${k}`);
    assert.ok(ledger.msHopWait <= ledger.msTotal);
  }
});

test('the setting unset: the same plans take the model build (build_author is called)', { skip: !REAL && 'waits for the toss plans to name their templates (agent D)' }, async t => {
  const s = stack(t, { INTERACT_BUILD_PROFILE: 'scripted' }), { job } = await run(s, 'balanced');
  assert.equal(job.build.kind, undefined);
  assert.equal(job.build.counts.build_author, 1);
});

test('a template build that fails a check stops as template_error at once: no repair round, the problem text is the failure', { skip: !REAL && 'waits for the toss plans to name their templates (agent D)' }, async t => {
  const s = stack(t, ON), { generateProgram } = await import('../../web/src/interact-templates/generate.js');
  // A generated program with a frame object the contract refuses (a body listed twice under one id): the trusted validation names it and the job stops, it is not repaired.
  s.deps.generateProgram = plan => { const program = generateProgram(plan); program.source = `${program.source}\nconst __x = 1;`; program.manifest = { ...program.manifest, title: '' }; return program; };
  const { id, job } = await run(s, 'balanced');
  assert.equal(job.stage, 'failed');
  assert.equal(job.stopReason, 'template_error');
  assert.match(job.failure.message, /^The card could not be built from its template: /);
  assert.equal(job.build.counts.build_repair, 0);
  assert.ok(job.findings.length >= 1, 'the problem is kept for the ledger');
  assert.deepEqual(s.sent, []);
  const { ledger } = (await s.route(`/${id}?board=${BOARD.id}&detail=1`)).body.diagnostics;
  assert.deepEqual([ledger.result, ledger.buildKind, ledger.repairs], ['failed', 'template', 0]);
  assert.notEqual(ledger.repairCauses, '');
});

test('a generator that throws is a template_error too, with its message', { skip: !REAL && 'waits for the toss plans to name their templates (agent D)' }, async t => {
  const s = stack(t, ON);
  s.deps.generateProgram = () => { throw new Error('no formula for slot height'); };
  const { job } = await run(s, 'brief');
  assert.deepEqual([job.stage, job.stopReason], ['failed', 'template_error']);
  assert.match(job.failure.message, /template: no formula for slot height/);
});

test('a template row carries the true stage times, buildKind and msHopWait (what is left of msTotal); a model-build row keeps its wall-clock slices and says buildKind model', () => {
  const timing = newTiming('simple', 0);
  timing.marks.generate = 1000;
  beginStage(timing, 'authoring', 1000); endStage(timing, 'done', 1100);
  beginStage(timing, 'validating', 1100); endStage(timing, 'done', 1400);
  beginStage(timing, 'rendering', 1400); endStage(timing, 'done', 2000);
  timing.marks.result = 2000;
  const template = { id: 'j', stage: 'ready', stopReason: 'accepted', timing, calls: [], findings: [], build: { kind: 'template', ms: { gen: 5, validate: 2, run: 10, check: 3, compose: 1 } } };
  const row = ledgerRow(template);
  assert.deepEqual([row.authorModel, row.buildKind, row.repairs, row.msTotal, row.msAuthor, row.msValidate, row.msRun, row.msCheck, row.msCompose, row.msHopWait], ['template', 'template', 0, 1000, null, 2, 10, 3, 6, 979]);
  const model = ledgerRow({ ...template, build: { ms: { run: 0, check: 3, compose: 1 } }, calls: [{ role: 'build_author', status: 'settled', served: 'm', startedAt: 1000, endedAt: 1050, costMicros: 1 }] });
  assert.deepEqual([model.authorModel, model.buildKind, model.msHopWait, model.msAuthor], ['m', 'model', null, 50]);
});
