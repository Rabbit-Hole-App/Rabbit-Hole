// Brief 12 section 1: INTERACT_DESIGN_KIND=fast. The design_authoring stage makes ONE design_fill call (Gemini Flash Lite), expands the brief, checks it and goes straight to design_verifying and
// awaiting_approval; a refusal gets one correction call; a second refusal falls back to the Opus author in the same job. Unset, nothing changes (interact-design.test.js and the rest of the suite).
// Scripted provider only: no paid call, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { briefSchema, extractBrief } from '../../web/src/interact-plan-brief.js';
import { CHAIN_ENDPOINTS } from '../src/explanation-fast-chain.js';
import { INTERACT_ROLES, interactReservation, resolveInteractProfile } from '../src/interact-models.js';
import { fillSystem } from '../src/interact-design-fill.js';
import { defaultThreshold, pickThreshold } from '../src/interact-design-pick.js';
import { designCapabilities } from '../src/interact-design.js';
import { templatePrecheck } from '../src/interact-template.js';
import { readFileSync } from 'node:fs';
import { SCENE_TEACHING_GUIDE } from '../src/agents/interact-design-author.js';
import { PLAN, clone, designStack } from './interact-design-fixture.js';

test.beforeEach(t => { const log = console.log; console.log = () => {}; t.after(() => { console.log = log; }); });

const { referencePlans } = await interactFixtures();
const GOOD = extractBrief(referencePlans.tossOverview); // a brief the checks accept (the approved Overview, as a brief)
const completion = (content, model) => ({ id: 'c1', model, choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(content) }, finish_reason: 'stop' }], usage: { prompt_tokens: 9000, completion_tokens: 900, total_tokens: 9900 } });

// answers: one per fill call, in order (the last repeats): a brief, or a function (n, request body) -> a brief. Anthropic calls still go to the scripted provider's own fetch.
// pick: the JEV answer { choice, confidence } (default: a confident fit of the vertical throw), or a function (url, init) -> Response, which may throw (a timeout).
function fastStack(t, { answers, script, env = {}, evidence, pick = { choice: 'vertical-throw', confidence: 0.95 } } = {}) {
  const s = designStack(t, { script, ...(evidence ? { evidence } : {}) });
  Object.assign(s.env, { INTERACT_DESIGN_KIND: 'fast', GEMINI_API_KEY: 'g-test', TYPESAFE_API_KEY: 'tk-test', ...env });
  const inner = globalThis.fetch, fills = [], picks = [];
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://api.typesafe.ai/v1/systemone') { picks.push(JSON.parse(init.body)); return typeof pick === 'function' ? pick(url, init) : Response.json({ answers: { family: pick } }); }
    if (String(url) !== CHAIN_ENDPOINTS.google.url) return inner(url, init);
    const body = JSON.parse(init.body), n = fills.length + 1, one = answers[Math.min(n - 1, answers.length - 1)];
    fills.push(body);
    return Response.json(completion(typeof one === 'function' ? one(n, body) : one, body.model));
  };
  return { ...s, fills, picks, jobOf: id => s.state.data.get(`job:${id}`) };
}
const SEEK = { INTERACT_SEEK: 'on' }; // the reference toss plans use the scrubber
const userOf = body => JSON.parse(body.messages.at(-1).content);

test('the fast path: one fill call reaches awaiting_approval with no review, no reviser and no Opus call; the plan names its template, slots and words', async t => {
  const s = fastStack(t, { answers: [GOOD], env: SEEK });
  const { body } = await s.create({ depth: 'brief', prompt: 'At the highest point of a vertical throw, is acceleration zero?' });
  const { job, seen } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval', JSON.stringify(job.failure));
  assert.deepEqual(seen.filter(x => x.startsWith('design_')), ['design_authoring', 'design_verifying'], 'no review, no revision');
  assert.equal(s.fills.length, 1); assert.deepEqual(s.model.roles(), [], 'no Opus design call');
  assert.equal(s.fills[0].model, 'gemini-3.5-flash-lite');
  assert.equal(job.flow.designKind, 'fast');
  assert.deepEqual([job.design.fast.kind, job.design.fast.fallback, job.design.fast.calls, job.design.fast.firstProblem], ['fast', 'none', 1, null]);
  assert.equal(job.design.fast.model, 'gemini-3.5-flash-lite'); assert.ok(job.design.fast.costUsd > 0);
  assert.ok(job.design.plan.scene.template && job.design.plan.scene.slots && job.design.plan.scene.words, 'template, slots and words: Generate takes the template build');
  assert.deepEqual(job.calls.map(c => c.role), ['design_fill']);
  assert.deepEqual([job.design.counts.author, job.design.counts.review, job.design.counts.revise, job.design.counts.fill], [0, 0, 0, 1]);
  const input = userOf(s.fills[0]); assert.deepEqual(Object.keys(input), ['request', 'depth']);
  assert.ok(s.fills[0].messages[0].content.startsWith(SCENE_TEACHING_GUIDE), 'the teaching guide is the start of the system text, verbatim');
});

test('the reservation of a fast job is the fill and its correction; the Opus design roles are added only when the fallback starts', async t => {
  const profile = resolveInteractProfile('opus-baseline'), fast = interactReservation(profile, 'fast'), opus = interactReservation(profile);
  assert.ok(fast.preparationMicros > 0 && fast.preparationMicros < opus.preparationMicros / 10, 'two cheap calls, not the Opus design');
  assert.equal(fast.generationMicros, opus.generationMicros); assert.deepEqual(fast.unknownRoles, []);
  const s = fastStack(t, { answers: [GOOD], env: SEEK });
  const { body } = await s.create({ depth: 'brief' });
  assert.equal(s.jobOf(body.job.id).reservation.preparationMicros, fast.preparationMicros);
  const s2 = fastStack(t, { answers: [{ nonsense: true }], env: SEEK });
  const { body: b2 } = await s2.create({ depth: 'balanced' });
  await s2.design(b2.job.id);
  assert.equal(s2.jobOf(b2.job.id).reservation.preparationMicros, fast.preparationMicros + opus.preparationMicros);
});

test('a wrong formula gets ONE correction with the exact problem line and the previous brief; the corrected brief passes', async t => {
  const wrong = clone(GOOD); wrong.formulas.height.formula = 'launchSpeed * t';
  const s = fastStack(t, { answers: [wrong, GOOD], env: SEEK });
  const { body } = await s.create({ depth: 'brief' });
  const { job } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval'); assert.equal(s.fills.length, 2); assert.deepEqual(s.model.roles(), []);
  const second = userOf(s.fills[1]);
  assert.equal(second.correction.problems.length, 1); assert.match(second.correction.problems[0], /^formula height at /);
  assert.deepEqual(second.previous, wrong);
  assert.deepEqual([job.design.fast.kind, job.design.fast.fallback, job.design.fast.calls], ['fast', 'none', 2]);
  assert.match(job.design.fast.firstProblem, /^formula height at /);
});

test('two refused fills fall back to the Opus author in the same job: author, review, revise, verify, then awaiting_approval; the fast record keeps the first problem', async t => {
  const s = fastStack(t, { answers: [{ nonsense: true }], script: { author: () => clone(PLAN.standard) } });
  const { body } = await s.create({ depth: 'balanced' });
  const { job, seen } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval', JSON.stringify(job.failure));
  assert.equal(s.fills.length, 2, 'the fill and its one correction, no more');
  assert.deepEqual(s.model.roles().slice(0, 3), ['author', 'review', 'revise']);
  assert.deepEqual(seen.filter(x => x.startsWith('design_')), ['design_authoring', 'design_reviewing', 'design_revising', 'design_verifying']);
  assert.deepEqual([job.design.fast.kind, job.design.fast.fallback, job.design.fast.calls], ['opus', 'after_correction', 2]);
  assert.ok(job.design.fast.firstProblem.length > 0 && job.design.fast.firstProblem.length <= 300);
  assert.deepEqual(job.calls.map(c => c.role), ['design_fill', 'design_fill', 'design_author', 'design_review', 'design_revise']);
});

test('a missing Gemini key sends nothing, makes no second fill and falls back to the Opus author', async t => {
  const s = fastStack(t, { answers: [GOOD], env: { GEMINI_API_KEY: '' }, script: { author: () => clone(PLAN.standard) } });
  const { body } = await s.create({ depth: 'balanced' });
  const { job } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval'); assert.equal(s.fills.length, 0);
  assert.deepEqual([job.design.fast.kind, job.design.fast.calls, job.design.fast.fallback], ['opus', 1, 'after_correction']);
  assert.match(job.design.fast.firstProblem, /credential_missing/);
});

test('INTERACT_DESIGN_KIND unset is today: the Opus design runs, no fill call, no design.fast, the reservation has no fill; a misspelling is refused', async t => {
  const s = fastStack(t, { answers: [GOOD], env: { INTERACT_DESIGN_KIND: '' }, script: { author: () => clone(PLAN.standard) } });
  const { body } = await s.create({ depth: 'balanced' });
  const { job } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval'); assert.equal(s.fills.length, 0);
  assert.equal(job.design.fast, undefined); assert.equal(job.flow.designKind, undefined);
  assert.deepEqual(s.model.roles().slice(0, 3), ['author', 'review', 'revise']);
  assert.equal(job.reservation.preparationMicros, interactReservation(resolveInteractProfile('opus-baseline')).preparationMicros);
  const bad = fastStack(t, { answers: [GOOD], env: { INTERACT_DESIGN_KIND: 'faster' } });
  const refused = await bad.create({ depth: 'brief' });
  assert.equal(refused.status, 503); assert.equal(refused.body.code, 'flow_misconfigured');
});

test('the fill system text is the teaching guide verbatim plus the family, the keys, the grammar and three added lines; no example plan', () => {
  const text = fillSystem('detailed', briefSchema('detailed'));
  assert.ok(text.startsWith(SCENE_TEACHING_GUIDE));
  for (const line of ['launchHeight is a number: write it as a literal, never as a name in a formula.', 'A formula has at most 32 nodes.', 'The detailed timeline counts time from the launch, and a marker is never before 0.']) assert.ok(text.includes(line), line);
  assert.equal(INTERACT_ROLES.design_fill.calls, 2);
});

test('a job with no evidence still passes: the family claims drop the reference note they cite (a real job supplies none)', async t => {
  const s = fastStack(t, { answers: [GOOD], env: SEEK, evidence: [] });
  const { body } = await s.create({ depth: 'brief' });
  const { job } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval', JSON.stringify(job.failure)); assert.equal(s.fills.length, 1);
  assert.ok(job.design.plan.claims.every(c => c.evidenceIds.length === 0));
});

const OPUS = { author: () => clone(PLAN.standard) }; // the scripted Opus author of a gap or a fallback
// ---- the pick (brief 13): one JEV call first; a gap goes to the Opus design with no fill ----
test('the pick runs first and a fit goes to that family fill: one JEV call, one fill, the pick is recorded on the job', async t => {
  const s = fastStack(t, { answers: [GOOD], env: SEEK, evidence: [] });
  const { body } = await s.create({ depth: 'brief' });
  const { job } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval'); assert.equal(s.picks.length, 1); assert.equal(s.fills.length, 1);
  assert.deepEqual(Object.keys(s.picks[0].questions.family.criteria), ['vertical-throw', 'none'], 'the question is built from the registry');
  const { pick } = job.design.fast;
  assert.deepEqual([pick.family, pick.confidence, pick.reason, typeof pick.ms], ['vertical-throw', 0.95, 'fit', 'number']);
  assert.deepEqual([job.design.fast.kind, job.design.fast.fallback], ['fast', 'none']);
});

test('a pick of none is a gap: no fill call, the Opus author runs in the same job, fallback gap, the Opus roles are reserved', async t => {
  const s = fastStack(t, { answers: [GOOD], pick: { choice: 'none', confidence: 0.8 }, script: OPUS });
  const { body } = await s.create({ depth: 'balanced' });
  const before = s.jobOf(body.job.id).reservation.preparationMicros;
  const { job, seen } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval', JSON.stringify(job.failure));
  assert.equal(s.fills.length, 0, 'no fill, no correction'); assert.ok(s.model.roles().includes('author'), 'the Opus author ran');
  assert.deepEqual([job.design.fast.kind, job.design.fast.fallback, job.design.fast.calls, job.design.fast.pick.family, job.design.fast.pick.reason], ['opus', 'gap', 0, null, 'none']);
  const profile = resolveInteractProfile('opus-baseline');
  assert.equal(job.reservation.preparationMicros, before + interactReservation(profile).preparationMicros);
  assert.ok(seen.includes('design_authoring'));
});

test('a JEV timeout, a JEV error and a missing key are gaps too, never a learner-visible error', async t => {
  for (const [label, opts] of [['timeout', { pick: () => { throw Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' }); } }], ['http 500', { pick: () => new Response('no', { status: 500 }) }], ['no key', { env: { TYPESAFE_API_KEY: '' } }]]) {
    const s = fastStack(t, { answers: [GOOD], script: OPUS, ...opts });
    const { body } = await s.create({ depth: 'balanced' });
    const { job } = await s.design(body.job.id);
    assert.equal(job.stage, 'awaiting_approval', label + ' ' + JSON.stringify(job.failure)); assert.equal(s.fills.length, 0, label);
    assert.deepEqual([job.design.fast.fallback, job.design.fast.pick.family], ['gap', null], label);
  }
});

test('a fit below the threshold is a gap; INTERACT_PICK_THRESHOLD moves the line', async t => {
  const low = { choice: 'vertical-throw', confidence: 0.6 };
  const s = fastStack(t, { answers: [GOOD], pick: low, script: OPUS });
  const { body } = await s.create({ depth: 'balanced' });
  const { job } = await s.design(body.job.id);
  assert.deepEqual([job.design.fast.fallback, job.design.fast.pick.reason, s.fills.length], ['gap', 'below_threshold', 0], '0.6 is under the one-family default of 0.7');
  const s2 = fastStack(t, { answers: [GOOD], env: { ...SEEK, INTERACT_PICK_THRESHOLD: '0.5' }, pick: low, evidence: [] });
  const { body: b2 } = await s2.create({ depth: 'brief' });
  const { job: j2 } = await s2.design(b2.job.id);
  assert.deepEqual([j2.design.fast.fallback, s2.fills.length], ['none', 1], 'the setting lowers the line to 0.5');
});

test('the default threshold is a function of the registry size; the setting overrides it, bad values are ignored', () => {
  const one = [{ id: 'a' }], two = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual([defaultThreshold(1), defaultThreshold(2), defaultThreshold(3)], [0.7, 0.9, 0.9]);
  assert.deepEqual([pickThreshold({}, one), pickThreshold({}, two)], [0.7, 0.9]);
  assert.equal(pickThreshold({ INTERACT_PICK_THRESHOLD: '0.55' }, two), 0.55); assert.equal(pickThreshold({ INTERACT_PICK_THRESHOLD: '0' }, two), 0);
  assert.deepEqual([pickThreshold({ INTERACT_PICK_THRESHOLD: 'x' }, one), pickThreshold({ INTERACT_PICK_THRESHOLD: '7' }, two), pickThreshold({ INTERACT_PICK_THRESHOLD: '' }, one)], [0.7, 0.9, 0.7]);
// The captured failure of the fast clone (2026-11-14, three of three Detailed plans): the model's own checkpoint asks for gravity 1, where body-plot's acceleration arrow (3.4 px per m/s^2) is shorter than the
// minimum an arrow is drawn at, so the build's oracle refused the card at Generate. The precheck runs the build's checks at design time so the correction (or the Opus fallback) hears it first.
const GRAVITY_ONE = JSON.parse(readFileSync(new URL('./fixtures/fast-detailed-gravity1-plan.json', import.meta.url), 'utf8'));
const BUILD = { INTERACT_BUILD_KIND: 'template', INTERACT_SEEK: 'on', EXPLAIN_PROGRAM_ENABLED: 'true', EXPLAIN_PROGRAM_STATEFUL: 'true' };

test('the precheck names the arrow the template cannot draw; the pinned Deep plan and a non-template build pass it', async () => {
  const capabilities = await designCapabilities(BUILD, { evidence: [{ id: 'kinematics_note' }] });
  const bad = await templatePrecheck(GRAVITY_ONE, { env: BUILD, capabilities: await designCapabilities(BUILD, { evidence: [] }) });
  assert.equal(bad.length, 1); assert.match(bad[0], /^template build: \[arrow_direction\] the arrow "vec.a" is not drawn at cp-fastTop/);
  assert.deepEqual(await templatePrecheck(referencePlans.tossDeep, { env: BUILD, capabilities }), []);
  assert.deepEqual(await templatePrecheck(GRAVITY_ONE, { env: { ...BUILD, INTERACT_BUILD_KIND: undefined }, capabilities }), [], 'the model build has no template to try');
});

test('a Detailed brief the template cannot draw gets ONE correction naming the arrow, then the corrected brief passes (template build on)', async t => {
  const goodDeep = extractBrief(referencePlans.tossDeep), s = fastStack(t, { answers: [extractBrief(GRAVITY_ONE), goodDeep], env: { ...SEEK, INTERACT_BUILD_KIND: 'template' }, evidence: [] });
  const { body } = await s.create({ depth: 'detailed' });
  const { job } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval', JSON.stringify(job.failure)); assert.equal(s.fills.length, 2); assert.deepEqual(s.model.roles(), []);
  assert.match(userOf(s.fills[1]).correction.problems[0], /^template build: \[arrow_direction\] the arrow "vec.a" is not drawn at cp-fastTop/);
});
