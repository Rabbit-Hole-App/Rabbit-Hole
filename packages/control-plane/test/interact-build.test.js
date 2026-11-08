// INT-04: the Scene Builder stage against the approved plan. Every role reply is scripted (no transport, no network); the sealing, composition,
// binding and runtime checks are the real ones. A tripwire on globalThis.fetch proves nothing leaves the process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../../web/src/explain-contract.js';
import { planHash } from '../../web/src/interact-plan.js';
import { resolveSupportInputs, resolveTimeline, verifyComposition } from '../../web/src/interact-composition.js';
import { FIXTURE_DRAFTS, fixtureDraft } from '../../web/src/interact-build-fixtures.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { InteractModelError } from '../src/interact-models.js';
import { InteractBuildError, buildInput, buildScene, validateBuildOutput } from '../src/interact-build.js';
import { INTERACT_BUILD_SYSTEM, interactBuildSchema } from '../src/agents/explain-author.js';
import { fixtureContext, fixtureScript } from '../src/interact-fixtures.js';

const { capabilities, plans } = await interactFixtures();
const clone = value => structuredClone(value);
const job = async (name = 'standard', extra = {}) => ({ id: `job-${name}`, plan: clone(plans[name]), planHash: await planHash(plans[name]), capabilities, ...extra });
const scene = draft => ({ kind: 'scene', ...draft });
const codes = result => (result.details ?? []).map(d => d.code);

let fetches;
test.beforeEach(t => {
  const original = globalThis.fetch;
  fetches = 0;
  globalThis.fetch = () => { fetches += 1; throw new Error('network call in a fixture test'); };
  t.after(() => { globalThis.fetch = original; assert.equal(fetches, 0, 'no network'); });
});
const run = async (name, reply, extra = {}) => {
  const ctx = fixtureContext({ script: fixtureScript(name, { build_author: typeof reply === 'function' ? reply : () => reply }) });
  const j = await job(name, extra);
  return { ctx, j, result: await buildScene(j, ctx) };
};

// ---- INT-04-C01: full plan, immutable Story, exact support IDs ----
test('the whole approved plan is forwarded, and the plan, Story and description are untouched by the build', async () => {
  const j = await job('standard'), before = canonicalJson(j.plan);
  const ctx = fixtureContext();
  const result = await buildScene(j, ctx);
  assert.ok(result.artifacts && result.composition, JSON.stringify(result.problems));
  const [sent] = ctx.adapter.log;
  const input = typeof sent.input === 'string' ? JSON.parse(sent.input) : sent.input;
  assert.deepEqual(input.approvedPlan, plans.standard, 'the full plan, Story and cardDescription included, goes to the builder');
  assert.equal(input.planHash, j.planHash);
  assert.deepEqual(input.panels.map(p => p.id), ['main', 'threeMoments']);
  assert.deepEqual(input.panels[1].runtime, plans.standard.supportingVisuals[0].runtime, 'every panel carries its approved runtime');
  assert.equal(input.timeline.durationSeconds, 6 / 9.8); assert.equal(input.timeline.atDefaultInputs.displayOffset, -3 / 9.8); assert.equal(input.timeline.playbackRate, 0.1);
  assert.ok(input.controlBindings.some(b => b.in === 'timeline' && b.declaration.part === 'scrubber'));
  assert.ok(new TextEncoder().encode(sent.system + JSON.stringify(sent.input)).length < 80000, 'inside the build_author input ceiling');
  assert.equal(sent.system, INTERACT_BUILD_SYSTEM); assert.match(sent.system, /never change it|never change/);
  assert.equal(canonicalJson(j.plan), before, 'the approved plan is immutable through a build');
  const visible = JSON.stringify(result.composition);
  assert.equal(result.composition.title, plans.standard.title); assert.equal(result.composition.cardDescription, plans.standard.cardDescription);
  assert.ok(!visible.includes(plans.standard.story.slice(0, 50)), 'the full Story stays in the design record; only Title and cardDescription are composition copy');
  assert.equal(result.composition.planHash, j.planHash);
  assert.equal(result.call.role, 'build_author'); assert.equal(result.call.requested.model, 'claude-opus-5-5');
  assert.deepEqual(await verifyComposition(result.composition, result.artifacts), []);
});

test('a plan that is not the approved one, or is not valid for the runtime, is refused before any call', async () => {
  const cases = [
    ['an unapproved plan hash', async () => ({ ...(await job()), planHash: 'a'.repeat(64) }), 'plan_not_approved'],
    ['no approval', async () => ({ ...(await job()), planHash: undefined }), 'plan_not_approved'],
    ['an edited Story under the old approval', async () => { const j = await job(); j.plan.story += ' Also, a new twist.'; return j; }, 'plan_not_approved'],
    ['an invalid timeline expression', async () => { const j = await job(); j.plan.mode.timeline.end = { op: 'divide', left: { op: 'literal', value: 6 }, right: { op: 'literal', value: 0 } }; return j; }, 'plan_invalid'],
    ['an unsupported runtime capability', async () => { const j = await job(); j.plan.scene.runtime.requiredCapabilities = ['teleport']; return j; }, 'plan_invalid'],
    ['a missing capability catalogue', async () => ({ ...(await job()), capabilities: undefined }), 'plan_missing'],
  ];
  for (const [name, make, code] of cases) {
    const ctx = fixtureContext();
    await assert.rejects(buildScene(await make(), ctx), error => error instanceof InteractBuildError && error.code === code, name);
    assert.equal(ctx.adapter.log.length, 0, `${name}: nothing was sent`);
  }
});

test('support IDs match the plan exactly: dropped, invented, duplicated or surplus panels return problems, never a composition', async () => {
  const draft = fixtureDraft('standard'), panel = draft.supporting[0];
  for (const [name, supporting, code] of [
    ['dropped', [], 'support_missing'], ['invented', [{ ...panel, id: 'bonus' }], 'support_unknown'], ['duplicated', [panel, clone(panel)], 'support_duplicate'],
  ]) {
    const { result } = await run('standard', scene({ main: draft.main, supporting }));
    assert.ok(result.problems, name); assert.equal(result.composition, undefined, name); assert.ok(codes(result).includes(code), `${name}: ${codes(result)}`);
    assert.equal(result.repairable, true);
  }
});

// ---- INT-04-C02/C05/C10: renderer, SDK tuple and every control ----
test('a third supporting panel is stopped by the provider schema, and by the trusted check behind it', async () => {
  const draft = fixtureDraft('standard'), panel = draft.supporting[0], three = [panel, { ...clone(panel), id: 'a' }, { ...clone(panel), id: 'b' }];
  await assert.rejects(run('standard', scene({ main: draft.main, supporting: three })), error => error.code === 'schema_mismatch');
  const checked = await validateBuildOutput(await job('standard'), { main: draft.main, supporting: three }, fixtureContext());
  assert.ok(codes(checked).includes('support_limit'));
});

test('a reply that needs another renderer or SDK is refused, never silently switched', async () => {
  const draft = fixtureDraft('standard');
  // A panel approved as a spec, answered with a program (the Overview plan is a declarative scene).
  let r = await run('overview', scene({ main: fixtureDraft('standard').main, supporting: [] }));
  assert.ok(codes(r.result).includes('renderer_mismatch'), JSON.stringify(r.result.details)); assert.ok(r.result.problems.some(p => /approved as spec/.test(p)));
  // ... and the other way round, past the provider schema, straight into the trusted check.
  const swapped = await validateBuildOutput(await job('standard'), { main: { kind: 'spec', spec: { version: 1, id: 'x', title: 'X', components: [], presentation: { mode: 'static' } } }, supporting: fixtureDraft('standard').supporting }, fixtureContext());
  assert.ok(codes(swapped).includes('renderer_mismatch'));
  draft.main.program.manifest.capabilities = ['time_playback', 'medium_visuals'];
  r = await run('standard', scene(draft));
  assert.ok(codes(r.result).includes('seal_refused'), codes(r.result)); assert.match(r.result.problems.join('\n'), /approved SDK tuple/);
  const stateful = fixtureDraft('standard'); Object.assign(stateful.supporting[0].artifact.program.manifest, { viewport: { width: 640, height: 400 }, actions: [], targets: [] });
  await assert.rejects(run('standard', scene(stateful)), error => error.code === 'schema_mismatch', 'the provider schema of a schema 1 plan has no stateful fields');
  const direct = await validateBuildOutput(await job('standard'), stateful, fixtureContext());
  assert.ok(codes(direct).some(c => c === 'invalid_program' || c === 'tuple_mismatch'), codes(direct));
});

test('every approved control maps to a native declaration, with its label, default, unit and range; extra and missing controls are refused', async () => {
  const mutations = {
    missing: [d => { d.main.program.manifest.inputs = []; }, 'control_missing'],
    extra: [d => { d.main.program.manifest.inputs.push({ type: 'number', id: 'wind', label: 'Wind', default: 0, min: 0, max: 1 }); }, 'control_extra'],
    label: [d => { d.main.program.manifest.inputs[0].label = 'Speed'; }, 'control_mismatch'],
    default: [d => { d.main.program.manifest.inputs[0].default = 4; }, 'control_mismatch'],
    unit: [d => { d.main.program.manifest.inputs[0].unit = 'mph'; }, 'control_mismatch'],
    range: [d => { d.main.program.manifest.inputs[0].min = 1; }, 'control_mismatch'],
    stepless: [d => { delete d.main.program.manifest.inputs[0].step; }, 'control_mismatch'],
    notTimed: [d => { delete d.main.program.manifest.duration; delete d.main.program.manifest.timeline; }, 'timeline_missing'],
    oldDuration: [d => { d.main.program.manifest.duration = 0.2; d.main.program.manifest.timeline.markers = []; }, 'duration_mismatch'],
    rate: [d => { d.main.program.manifest.timeline.playbackRate = 1; }, 'timeline_mismatch'],
  };
  for (const [name, [edit, code]] of Object.entries(mutations)) {
    const draft = fixtureDraft('deep'); edit(draft);
    const { result } = await run('deep', scene(draft));
    assert.ok(codes(result).includes(code), `${name}: ${JSON.stringify(result.details ?? result)}`);
    assert.equal(result.composition, undefined);
  }
});

test('visible copy: a manifest that carries the description or the Story is refused (the card shows them once, from the plan)', async () => {
  let draft = fixtureDraft('standard'); draft.main.program.manifest.cardDescription = plans.standard.cardDescription;
  assert.ok(codes((await run('standard', scene(draft))).result).includes('copy_duplicated'));
  draft = fixtureDraft('standard'); draft.main.program.manifest.description = plans.standard.story.slice(0, 590);
  assert.ok(codes((await run('standard', scene(draft))).result).includes('story_in_card'));
});

// ---- INT-04-C13: Deep launch speed resolves state and endpoint ----
test('Deep: launch speed 3.0 to 5.0 resolves the main state, the support input and the endpoint; no artifact claims an unbound control', async () => {
  const { result } = await run('deep', scene(fixtureDraft('deep')));
  assert.ok(result.composition, JSON.stringify(result.details));
  const c = result.composition, end = u => resolveTimeline(c, { launchSpeed: u }).end;
  assert.ok(Math.abs(end(3) - 0.612245) < 1e-6 && Math.abs(end(5) - 1.020408) < 1e-6);
  assert.equal(result.artifacts.main.program.manifest.duration, 2 * 5 / 9.8, 'manifest.duration is the maximum admitted duration');
  assert.deepEqual(resolveSupportInputs(c, 'comparePeaks', { launchSpeed: 4 }), { trialSpeed: 4 });
  assert.deepEqual(c.main.controls.map(x => [x.id, x.row]), [['play', 'transport'], ['scrub', 'transport'], ['speed', 'controls'], ['resetAll', 'controls']]);
});

// ---- gap, provider failure, schema ----
test('a capability gap is returned as a gap (a design correction), and a provider failure is not a build problem', async () => {
  let r = await run('standard', { kind: 'capability_gap', gap: { needs: ['experiment'], reason: 'The plan needs a control this runtime cannot draw.' } });
  assert.equal(r.result.gap.capability, 'explain'); assert.deepEqual(r.result.gap.needs, ['experiment']); assert.equal(r.result.artifacts, undefined);
  await assert.rejects(run('standard', () => { throw new InteractModelError('provider_unavailable', 'down', { sent: true }); }), error => error.code === 'provider_unavailable');
  const empty = await run('standard', () => ({ kind: 'scene' }));
  assert.equal(empty.result.repairable, true); assert.match(empty.result.problems[0], /main, supporting/, 'a scene with no artifacts is a build problem for repair, not a card');
});

test('the builder tool keeps within the interact-models schema subset and states the envelope; the legacy author tool is not changed', async () => {
  const schema = interactBuildSchema({ stateful: false });
  assert.deepEqual(Object.keys(schema.properties), ['kind', 'main', 'supporting', 'gap']);
  assert.equal(schema.properties.supporting.maxItems, 2);
  assert.ok(!JSON.stringify(schema).includes('exclusiveMinimum'), 'only keywords the adapter checker enforces');
  const input = buildInput({ evidence: [] }, plans.deep, 'h'.repeat(64));
  assert.ok(input.spec === undefined, 'the declarative catalogue is offered only when a panel was approved as a spec');
  const { programToolSchema } = await import('../src/agents/explain-author.js');
  assert.ok(JSON.stringify(programToolSchema()).includes('exclusiveMinimum'), 'the legacy program tool is exactly as it was');
});

test('validateBuildOutput is the same trusted check for a first build and a repair, and refuses a reply that is not an envelope', async () => {
  const j = await job('standard');
  const good = await validateBuildOutput(j, fixtureDraft('standard'), fixtureContext());
  assert.ok(good.artifacts && good.composition);
  const bad = await validateBuildOutput(j, { main: 1 }, fixtureContext());
  assert.equal(bad.repairable, true); assert.ok(bad.problems.length);
  assert.equal(good.composition.main.artifact.hash, good.artifacts.main.program.bundleHash);
  assert.ok(FIXTURE_DRAFTS.standard.main.program.source.length < 16 * 1024, 'the fixture is a real program within the source limit');
});
