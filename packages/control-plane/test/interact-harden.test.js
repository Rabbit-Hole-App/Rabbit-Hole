// /interact build roles, hardened against the brittleness classes real Opus runs exposed on the design roles (an over-long field, a result nested under one key, a refused schema,
// a cut-off reply, a review voided by one sentence). Every provider reply is scripted (no network, no paid call); the schemas, prompts, checks and stages are the real ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHash } from '../../web/src/interact-plan.js';
import { fixtureDraft } from '../../web/src/interact-build-fixtures.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { INTERACT_BUILD_SYSTEM, MANIFEST_LIMITS_TEXT, programToolSchema, STATEFUL_MANIFEST_PROPERTIES } from '../src/agents/explain-author.js';
import { INTERACT_REPAIR_SYSTEM, interactRepairTool } from '../src/agents/explain-repair.js';
import { InteractModelError, INTERACT_LIMITS, INTERACT_ROLES } from '../src/interact-models.js';
import { normalizeStructured } from '../src/interact-model-adapters.js';
import { buildScene, buildSchema, schemaOptions, validateBuildOutput } from '../src/interact-build.js';
import { REVIEW_TOOL } from '../src/explain-review.js';
import { lenientFindingText, checkRound, repairRound } from '../src/interact-checks.js';
import { fixtureCaptureCard, fixtureContext, fixtureScript } from '../src/interact-fixtures.js';

const { capabilities, plans } = await interactFixtures();
const clone = value => structuredClone(value);
const job = async (name = 'standard', extra = {}) => ({ id: `job-${name}`, plan: clone(plans[name]), planHash: await planHash(plans[name]), capabilities, ...extra });
const longSummary = d => { d.main.program.manifest.summary = 'The ball is tossed and falls back. '.repeat(14); return d; };
const scene = draft => ({ kind: 'scene', ...draft });
const candidate = async (name = 'standard', extra = {}) => {
  const j = await job(name, extra), draft = fixtureDraft(name), built = await validateBuildOutput(j, draft, fixtureContext());
  assert.ok(built.artifacts, JSON.stringify(built.details));
  return { ...j, draft, artifacts: built.artifacts, composition: built.composition };
};
const reviewIds = input => (String(input).match(/Captures to review: (.*)/)?.[1] ?? '').split(', ').filter(Boolean);
const passAll = input => ({ captures: reviewIds(input).map(id => ({ id, semantic: 'pass', visual: 'pass', findings: [] })) });

// ---- 1. limits: stated in the prompt, strict in the schema, and one correction call when a long answer trips one ----
test('every length, count and range limit of the program manifest is stated in both build prompts, from the very schema the provider is given', () => {
  const found = [];
  const walk = (schema, path) => {
    if (!schema || typeof schema !== 'object') return;
    for (const [key, unit] of [['maxLength', 'characters'], ['maxItems', 'items'], ['maximum', 'at most']]) if (typeof schema[key] === 'number') found.push([path, schema[key], unit]);
    for (const [name, child] of Object.entries(schema.properties ?? {})) walk(child, path ? `${path}.${name}` : name);
    if (schema.items) walk(schema.items, `${path}[]`);
  };
  walk({ properties: { ...programToolSchema({ stateful: true }).properties.manifest.properties } }, '');
  assert.ok(found.length >= 20, `the manifest has ${found.length} limits`);
  for (const [path, limit] of found) {
    assert.ok(MANIFEST_LIMITS_TEXT.includes(`${path} ${limit}`), `the prompt text states ${path} ${limit}`);
  }
  for (const system of [INTERACT_BUILD_SYSTEM, INTERACT_REPAIR_SYSTEM]) assert.ok(system.includes(MANIFEST_LIMITS_TEXT), 'both build prompts carry the manifest limits');
  assert.match(INTERACT_REPAIR_SYSTEM, /no longer calls an approved helper.*changing the arguments you pass to that helper/, 'a repair keeps calling the approved helpers (a live run lost three rounds to helper_missing)');
  assert.ok(STATEFUL_MANIFEST_PROPERTIES.viewport, 'the stateful extras are exported for the prompt');
  assert.match(INTERACT_BUILD_SYSTEM, /1120 x 860/, 'the frame size the reviewer can take is stated');
});

test('a build whose summary is over its 400 characters gets ONE correction call that names the field; the corrected build continues', async () => {
  const ctx = fixtureContext({ script: fixtureScript('standard', { build_author: ({ n }) => scene(n === 1 ? longSummary(fixtureDraft('standard')) : fixtureDraft('standard')) }) });
  const result = await buildScene(await job(), ctx);
  assert.ok(result.artifacts && result.composition, JSON.stringify(result.problems));
  assert.equal(ctx.adapter.log.length, 2, 'the refused call and exactly one correction');
  const [first, second] = ctx.adapter.log;
  assert.equal(first.input.correction, undefined);
  assert.match(second.input.correction.instruction, /WHOLE corrected/);
  assert.ok(second.input.correction.problems.some(p => /manifest\.summary/.test(p) && /longer than 400/.test(p)), 'the correction names the exact field and limit');
  assert.deepEqual(second.input.approvedPlan, first.input.approvedPlan, 'the plan is forwarded unchanged');
  assert.equal(result.call.role, 'build_author');
});

test('a second refusal stops the build with the refusal, and never makes a third call', async () => {
  const ctx = fixtureContext({ script: fixtureScript('standard', { build_author: () => scene(longSummary(fixtureDraft('standard'))) }) });
  await assert.rejects(async () => buildScene(await job(), ctx), error => error instanceof InteractModelError && error.code === 'schema_mismatch');
  assert.equal(ctx.adapter.log.length, 2);
});

test('a correction that cannot be sent (no call left) leaves the first refusal as the error, not a budget error', async () => {
  const ctx = fixtureContext({ script: fixtureScript('standard', { build_author: () => scene(longSummary(fixtureDraft('standard'))) }),
    admit: async ({ role }) => { ctx.sent = (ctx.sent ?? 0) + 1; if (ctx.sent > 1) throw Object.assign(new InteractModelError('call_ceiling', `The ${role} role is limited.`), { sent: false }); } });
  await assert.rejects(async () => buildScene(await job(), ctx), error => error.code === 'schema_mismatch');
  assert.equal(ctx.adapter.log.length, 1);
});

test('a correction that is refused for another reason than the ceiling (the job moved on, the allowance) is that error', async () => {
  const ctx = fixtureContext({ script: fixtureScript('standard', { build_author: () => scene(longSummary(fixtureDraft('standard'))) }),
    admit: async () => { ctx.sent = (ctx.sent ?? 0) + 1; if (ctx.sent > 1) throw Object.assign(new Error('This explanation changed while it was working.'), { abandoned: true }); } });
  await assert.rejects(async () => buildScene(await job(), ctx), error => error.abandoned === true);
  assert.equal(ctx.adapter.log.length, 1);
});

test('an infrastructure failure on the first call is never corrected', async () => {
  const ctx = fixtureContext({ script: fixtureScript('standard', { build_author: () => { throw new InteractModelError('http_error', 'HTTP 500', { sent: true }); } }) });
  await assert.rejects(async () => buildScene(await job(), ctx), { code: 'http_error' });
  assert.equal(ctx.adapter.log.length, 1);
});

test('a repair reply the schema refuses gets ONE correction call; a corrected repair is validated like any repair', async () => {
  const j = { ...(await candidate()), failure: { stage: 'check', problems: ['[numeric_mismatch] velocity at cp-top is 1, expected 0'], findings: [] }, round: 0 };
  const fixed = fixtureDraft('standard'); fixed.main.program.manifest.summary += ' x';
  const ctx = fixtureContext({ script: fixtureScript('standard', { build_repair: ({ n }) => ({ operation: 'artifacts', ...(n === 1 ? longSummary(fixtureDraft('standard')) : fixed) }) }) });
  const out = await repairRound(j, ctx);
  assert.equal(out.status, 'repaired', JSON.stringify(out.failure ?? out.reason));
  assert.equal(ctx.adapter.log.length, 2);
  assert.ok(ctx.adapter.log[1].input.correction.problems.some(p => /manifest\.summary/.test(p)));
  assert.deepEqual(ctx.adapter.log[1].input.failure, ctx.adapter.log[0].input.failure, 'the repair is asked about the same failure');
});

test('a repair refused twice is a failed round, not a dead job: the original failure is kept and the refusal is added to it', async () => {
  const failure = { stage: 'review', problems: [], findings: [{ category: 'spec', severity: 'major', target: { capture: 'cp-top' }, message: 'The label overlaps the ball.' }] };
  const j = { ...(await candidate()), failure, round: 1 };
  const ctx = fixtureContext({ script: fixtureScript('standard', { build_repair: () => ({ operation: 'artifacts', ...longSummary(fixtureDraft('standard')) }) }) });
  const out = await repairRound(j, ctx);
  assert.equal(out.status, 'repaired_invalid');
  assert.equal(out.round, 2, 'the round is spent');
  assert.deepEqual(out.draft, j.draft, 'the candidate to repair is unchanged');
  assert.equal(out.failure.stage, 'review');
  assert.deepEqual(out.failure.findings, failure.findings, 'the findings the repair has to answer are kept');
  assert.match(out.failure.problems[0], /previous repair reply was refused/);
  assert.match(out.failure.problems[0], /manifest\.summary/);
  assert.equal(ctx.adapter.log.length, 2);
});

test('a repair refusal that is not about its content (a transport failure) still propagates', async () => {
  const j = { ...(await candidate()), failure: { stage: 'check', problems: ['x'], findings: [] }, round: 0 };
  const ctx = fixtureContext({ script: fixtureScript('standard', { build_repair: () => { throw new InteractModelError('truncated', 'cut off', { sent: true }); } }) });
  await assert.rejects(() => repairRound(j, ctx), { code: 'truncated' });
  assert.equal(ctx.adapter.log.length, 1);
});

// ---- the reviewer: a slip in one finding or one missing capture does not void the review ----
const checkJob = async () => candidate('standard', { oracle: null });
const reviewCtx = review => fixtureContext({ script: fixtureScript('standard', { build_review: review }), captureCard: fixtureCaptureCard() });

test('a review with one invented category gets ONE correction call that names it, and the corrected review decides', async () => {
  const ctx = reviewCtx(({ input, n }) => (n === 1
    ? { captures: reviewIds(input).map((id, i) => ({ id, semantic: 'pass', visual: 'pass', findings: i === 0 ? [{ verdict: 'visual', category: 'layout', severity: 'minor', message: 'Slightly small labels.', repairable: true }] : [] })) }
    : passAll(input)));
  const out = await checkRound(await checkJob(), ctx);
  assert.equal(out.status, 'ready', JSON.stringify(out.failure ?? out.reason));
  const calls = ctx.adapter.log.filter(c => c.role === 'build_review');
  assert.equal(calls.length, 2);
  assert.match(String(calls[1].input), /category/);
  assert.match(String(calls[1].input), /refused/);
  assert.equal(out.calls.length, 1, 'the one answer that was used is the one recorded');
});

test('a review that leaves one capture without a verdict is asked once to cover every capture', async () => {
  const ctx = reviewCtx(({ input, n }) => (n === 1 ? { captures: passAll(input).captures.slice(1) } : passAll(input)));
  const out = await checkRound(await checkJob(), ctx);
  assert.equal(out.status, 'ready', JSON.stringify(out.failure ?? out.reason));
  const calls = ctx.adapter.log.filter(c => c.role === 'build_review');
  assert.equal(calls.length, 2);
  assert.match(String(calls[1].input), /has no verdict/);
  assert.equal(out.calls.length, 2, 'both answers were paid for and recorded');
});

test('a review that is refused twice is the same error as before; nothing is accepted', async () => {
  const ctx = reviewCtx(() => ({ captures: [{ id: 'nope', semantic: 'pass', visual: 'pass', findings: [] }] }));
  await assert.rejects(async () => checkRound(await checkJob(), ctx), { code: 'invalid_review' });
  assert.equal(ctx.adapter.log.filter(c => c.role === 'build_review').length, 2, 'one correction, never a third call');
});

// ---- 2. pinned numbers ----
test('the call ceilings leave room for one correction per refused answer, and the reviewer can write findings for every capture', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(INTERACT_LIMITS.calls).filter(([r]) => r.startsWith('build_'))), { build_author: 2, build_review: 5, build_repair: 4 },
    'author: 1 + a correction; reviewer: 1 + three repairs + a correction; repair: three rounds + a correction');
  assert.equal(INTERACT_ROLES.build_review.maxOutputTokens, 10000, '6 captures x several findings of up to ~200 tokens each, and the legacy 3,000 stays for legacy jobs');
});

// ---- 3. wrappers on the build tool schemas ----
test('a result nested under one undefined key is unwrapped for the build, repair and review tools too, only when the inner value satisfies the real schema', async () => {
  const plan = plans.standard, draft = fixtureDraft('standard');
  const cases = [
    ['build', buildSchema(plan), scene(draft), 'build_scene'],
    ['repair', interactRepairTool(schemaOptions(plan)).input_schema, { operation: 'artifacts', ...draft }, 'repair_scene'],
    ['review', lenientFindingText(REVIEW_TOOL.input_schema), { captures: [{ id: 'start', semantic: 'pass', visual: 'pass', findings: [] }] }, 'report_review'],
  ];
  for (const [name, schema, inner, key] of cases) {
    const out = normalizeStructured({ candidates: [{ source: 'tool call', value: { [key]: inner } }], schema });
    assert.deepEqual(out, inner, `${name}: unwrapped`);
    assert.throws(() => normalizeStructured({ candidates: [{ source: 'tool call', value: { [key]: inner, note: 'x' } }], schema }), { code: 'schema_mismatch' }, `${name}: two keys are never unwrapped`);
    const broken = clone(inner); delete broken[Object.keys(broken)[0]];
    assert.throws(() => normalizeStructured({ candidates: [{ source: 'tool call', value: { [key]: broken } }], schema }), { code: 'schema_mismatch' }, `${name}: an inner value that does not satisfy the schema stays refused`);
  }
  // Also as a JSON string (the model sent main as text): the schema-directed unwrapping applies inside the build envelope.
  const asText = { kind: 'scene', main: JSON.stringify(draft.main), supporting: JSON.stringify(draft.supporting) };
  assert.deepEqual(normalizeStructured({ candidates: [{ source: 'tool call', value: asText }], schema: buildSchema(plan) }), scene(draft));
});

// ---- 5. the real capture path against the fake one ----
test('the real page reports up to 24 texts of 160 characters per capture: the reviewer\'s trace block still fits its byte limit and the review is not declared incomplete', async () => {
  const capture = fixtureCaptureCard(), texts = Array.from({ length: 24 }, (_, i) => `label ${i} `.padEnd(160, 'x'));
  const noisy = async args => (await capture(args)).map(c => ({ ...c, trace: { ...c.trace, texts }, supports: Object.fromEntries(Object.entries(c.supports).map(([id, s]) => [id, { ...s, trace: { ...s.trace, texts } }])) }));
  const ctx = fixtureContext({ script: fixtureScript('standard', { build_review: ({ input }) => passAll(input) }), captureCard: noisy });
  const out = await checkRound(await checkJob(), ctx);
  assert.equal(out.status, 'ready', JSON.stringify(out.reason ?? out.failure));
  const sent = ctx.adapter.log.find(c => c.role === 'build_review').input;
  assert.ok(String(sent).includes('Execution traces'), 'the reviewer reads the traces');
});

// ---- 6. a reply that leaves out a part is a repairable problem, not a crash of the repair step ----
test('a scene reply without its supporting list (the schema only requires kind) is reported as a problem and the repair step can still read it', async () => {
  const ctx = fixtureContext({ script: fixtureScript('standard', { build_author: () => ({ kind: 'scene', main: fixtureDraft('standard').main }), build_repair: () => ({ operation: 'none', reason: 'cannot say' }) }) });
  const j = await job(), built = await buildScene(j, ctx);
  assert.ok(built.problems?.some(p => /supporting/.test(p)), JSON.stringify(built.problems));
  const out = await repairRound({ ...j, draft: built.draft, failure: { stage: 'validate', problems: built.problems, findings: [] }, round: 0 }, ctx);
  assert.equal(out.status, 'no_progress', 'the repair role was reached');
  assert.equal(ctx.adapter.log.at(-1).role, 'build_repair');
  assert.deepEqual(ctx.adapter.log.at(-1).input.currentArtifacts.supporting, [], 'the missing list reads as no panels, and the problem names what is missing');
  const none = fixtureContext({ script: fixtureScript('standard', { build_author: () => ({ kind: 'scene' }), build_repair: () => ({ operation: 'none', reason: 'cannot say' }) }) });
  const empty = await buildScene(j, none);
  assert.ok(empty.problems);
  assert.equal((await repairRound({ ...j, draft: empty.draft, failure: { stage: 'validate', problems: empty.problems, findings: [] }, round: 0 }, none)).status, 'no_progress');
});

// ---- owner 2026-11-07: sentence ranges for the manifest texts ----
test('both build prompts state the sentence ranges and the byte limits next to the character limits, and the correction names field, limit and range', async () => {
  for (const system of [INTERACT_BUILD_SYSTEM, INTERACT_REPAIR_SYSTEM]) {
    assert.match(system, /manifest\.summary 1 to 2 sentences/);
    assert.match(system, /manifest\.description 2 to 4 short sentences/);
    assert.match(system, /manifest\.instructions 1 to 2 short sentences/);
    for (const limit of ['title 120', 'summary 400', 'description 600', 'instructions 300', 'assumptions 8', 'assumptions[] 300', 'source 16384 bytes', 'manifest 4096 bytes', 'frame objects 60']) assert.ok(system.includes(limit), limit);
    assert.match(system, /Never put instructions or explanation in the drawn frame text/);
  }
  const d = fixtureDraft('standard'); d.main.program.manifest.description = 'It falls. '.repeat(70);
  const ctx = fixtureContext({ script: fixtureScript('standard', { build_author: ({ n }) => scene(n === 1 ? d : fixtureDraft('standard')) }) });
  assert.ok((await buildScene(await job(), ctx)).artifacts);
  const named = ctx.adapter.log[1].input.correction.problems.find(p => /manifest\.description/.test(p));
  assert.match(named, /longer than 600 characters; it must be 2 to 4 short sentences, at most 600 characters/);
});
