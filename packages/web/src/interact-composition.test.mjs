import test from 'node:test';
import assert from 'node:assert/strict';
import { sealProgram } from './explain-program/contract.js';
import { PROGRAM_STAMPS, STATEFUL_VISUAL_PROGRAM_STAMPS } from './explain-program/stamps.js';
import {
  CARD_ORDER, CardCompositionSchema, CompositionError, compileCardComposition, controlDeclarations, createSnapshotResolver, nativeDeclaration, resolveSupportInputs, resolveTimeline,
  validateCompositionBindings, verifyComposition,
} from './interact-composition.js';
import { FIXTURE_DRAFTS, G, fixtureDraft, sealEnvelope, tossDrop } from './interact-build-fixtures.js';
import { interactFixtures } from './interact-plan-fixtures.js';

const { plans } = await interactFixtures();
const clone = value => structuredClone(value);
const T = tossDrop();
const built = async (name, edit = d => d) => { const draft = fixtureDraft(name); edit(draft); return sealEnvelope(draft); };
const codes = problems => problems.map(p => p.code);
const refuses = async (plan, name, edit, code, planEdit = p => p) => {
  const p = clone(plan); planEdit(p); const problems = validateCompositionBindings(p, await built(name, edit));
  assert.ok(problems.some(x => x.code === code), `expected ${code}; got ${JSON.stringify(problems)}`);
  await assert.rejects(async () => compileCardComposition(p, await built(name, edit)), error => error instanceof CompositionError && error.problems.some(x => x.code === code));
  return problems;
};

test('the fixture builds satisfy their approved plans, and compile to a composition in card order', async () => {
  for (const name of ['standard', 'deep']) {
    const artifacts = await sealEnvelope(FIXTURE_DRAFTS[name]);
    assert.deepEqual(validateCompositionBindings(plans[name], artifacts), [], name);
    const composition = await compileCardComposition(plans[name], artifacts);
    assert.deepEqual(CardCompositionSchema.safeParse(composition).success, true);
    assert.deepEqual(composition.order.filter(r => CARD_ORDER.includes(r)), composition.order);
    assert.deepEqual([composition.order[0], composition.order[1]], ['title', 'description'], 'Title then the one description, before any scene');
    assert.ok(composition.order.indexOf('supporting') < composition.order.indexOf('main') && composition.order.indexOf('main') < composition.order.indexOf('transport'), 'support, then the scene, then its adjacent transport');
    assert.equal(composition.order.at(-1), name === 'deep' ? 'controls' : 'transport', 'nothing follows the controls');
    assert.equal(composition.title, plans[name].title); assert.equal(composition.cardDescription, plans[name].cardDescription);
    assert.deepEqual(composition.main.runtime, plans[name].scene.runtime);
    assert.deepEqual(composition.supporting.map(s => [s.id, s.runtime, s.readOnly, s.snapshotTime]), plans[name].supportingVisuals.map(s => [s.id, s.runtime, true, 0]));
    const text = JSON.stringify(composition);
    assert.ok(!text.includes(plans[name].story.slice(0, 40)), 'the Story is not in the composition');
    assert.ok(!/selectionReason|"purpose"/.test(text), 'design metadata is not card content');
  }
});

test('the composition binds the plan hash and the whole envelope: a swapped or edited panel is detected', async () => {
  const artifacts = await sealEnvelope(FIXTURE_DRAFTS.standard), composition = await compileCardComposition(plans.standard, artifacts);
  assert.match(composition.planHash, /^[0-9a-f]{64}$/); assert.match(composition.envelopeHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(await verifyComposition(composition, artifacts), []);
  const other = await built('standard', d => { d.supporting[0].artifact.program.source += '\n// edited'; });
  assert.ok((await verifyComposition(composition, other)).some(p => p.code === 'composition_swapped'), 'a support panel cannot be swapped independently');
  const forged = { ...composition, envelopeHash: '0'.repeat(64) };
  assert.ok((await verifyComposition(forged, artifacts)).some(p => p.code === 'composition_swapped'));
  assert.ok((await verifyComposition({ ...composition, extra: 1 }, artifacts)).some(p => p.code === 'composition_invalid'), 'unknown fields are refused, not stripped');
  const edited = clone(artifacts); edited.main.program.source += ' ';
  await assert.rejects(compileCardComposition(plans.standard, edited), error => error.problems.some(p => p.code === 'artifact_hash_mismatch'));
});

test('Standard timeline: internal elapsed 0 to 2u/g, display offset -u/g, markers exactly at the apex and 0.10 s either side', async () => {
  const composition = await compileCardComposition(plans.standard, await sealEnvelope(FIXTURE_DRAFTS.standard));
  const t = resolveTimeline(composition, {});
  assert.equal(t.start, 0); assert.ok(Math.abs(t.end - 0.612245) < 1e-6); assert.equal(t.end, 6 / G);
  assert.equal(t.displayOffset, -3 / G); assert.ok(Math.abs(t.displayStart - -0.306122) < 1e-6 && Math.abs(t.displayEnd - 0.306122) < 1e-6);
  assert.deepEqual(t.markers.map(m => m.time), [T.apex - 0.1, T.apex, T.apex + 0.1]);
  assert.deepEqual([t.label, t.playbackRate, t.step, t.onInputChange], ['Time from the apex', 0.1, 0.01, 'reset_pause']);
  assert.deepEqual(resolveTimeline(composition, { launchSpeed: 9 }), t, 'an input the plan does not declare changes nothing');
});

test('Deep timeline: launch speed 3.0 to 5.0 moves the endpoint and the marker together, from the same declared domain', async () => {
  const composition = await compileCardComposition(plans.deep, await sealEnvelope(FIXTURE_DRAFTS.deep));
  const at = u => resolveTimeline(composition, { launchSpeed: u });
  assert.ok(Math.abs(at(3).end - 0.612245) < 1e-6); assert.ok(Math.abs(at(5).end - 1.020408) < 1e-6);
  assert.equal(at(5).end, 2 * 5 / G); assert.equal(at(5).markers[0].time, 5 / G); assert.ok(Math.abs(at(3).markers[0].time - 3 / G) < 1e-12);
  assert.equal(at(3).displayOffset, 0, 'Deep never uses the Standard negative origin'); assert.equal(at(5).displayEnd, at(5).end);
  assert.deepEqual(resolveTimeline(composition, {}), at(5), 'the default is 5.0 m/s');
  assert.equal(at(99).end, at(5).end, 'a value outside the declared domain is clamped like a program input');
  assert.equal(at(-1).end, at(3).end);
  assert.deepEqual(resolveSupportInputs(composition, 'comparePeaks', { launchSpeed: 3.5 }), { trialSpeed: 3.5 }, 'the support panel is bound through parameterBindings');
  assert.deepEqual(resolveSupportInputs(composition, 'comparePeaks', {}), { trialSpeed: 5 });
  assert.throws(() => resolveSupportInputs(composition, 'nope'), CompositionError);
});

test('an untimed plan resolves no timeline', async () => {
  const plan = plans.untimedExperiment, draft = { main: { kind: 'program', program: { manifest: { title: 'T', summary: 'Peak height against launch speed.', description: 'A ball at its peak.', assumptions: [], inputs: [{ type: 'number', id: 'launchSpeed', label: 'Launch speed', unit: 'm/s', default: 3, min: 1, max: 5, step: 0.5 }],
    readouts: [{ id: 'peakReadout', label: 'Peak', unit: 'm', decimals: 2 }], capabilities: ['number_inputs'] }, source: 'export function evaluate({ inputs }) { return { frame: sdk.frame([sdk.circle("b", 1, 1, 2)], { readouts: [{ id: "peakReadout", value: 1 }] }), quantities: {} }; }' } }, supporting: [] };
  const composition = await compileCardComposition(plan, await sealEnvelope(draft));
  assert.equal(resolveTimeline(composition, {}), null); assert.equal(composition.main.timeline, null);
  assert.deepEqual(composition.order, ['title', 'description', 'main', 'controls'], 'no transport row, no support row, no space for them');
});

// ---- INT-01-C04: semantic control IDs to native declarations ----
test('each semantic control type maps to one native declaration, and an unavailable one is refused', () => {
  const { declarations, problems } = controlDeclarations(plans.deep);
  assert.deepEqual(problems, []);
  const by = Object.fromEntries(declarations.map(d => [d.controlId, d]));
  assert.deepEqual(by.play.in, 'timeline'); assert.deepEqual(by.play.declaration.labels, { paused: 'Play', playing: 'Pause', ended: 'Replay' });
  assert.deepEqual(by.scrub.declaration, { part: 'scrubber', unit: 's', step: 0.01 });
  assert.deepEqual(by.speed, { controlId: 'speed', nativeControlId: 'program.number', type: 'number', binding: { kind: 'input', id: 'launchSpeed' }, in: 'manifest.inputs',
    declaration: { type: 'number', id: 'launchSpeed', label: 'Launch speed', unit: 'm/s', default: 5, min: 3, max: 5, step: 0.1 } });
  assert.deepEqual(by.resetAll.in, 'card.reset');
  const select = plans.staticAdjustable.controls[0];
  assert.deepEqual(nativeDeclaration(select, 'program').native.declaration, { type: 'select', id: 'moment', label: 'Moment', default: 'top', options: select.options });
  assert.deepEqual(nativeDeclaration(select, 'spec').native, { in: 'presentation.experiments', declaration: { id: 'moment', domain: { values: ['before', 'top', 'after'] } } });
  assert.equal(nativeDeclaration({ type: 'action', binding: { kind: 'action', id: 'go' }, label: 'Go' }, 'program').native.in, 'manifest.actions');
  assert.deepEqual(nativeDeclaration({ type: 'target', binding: { kind: 'target', id: 'a' }, label: 'A', interaction: 'drag' }, 'program').native, { in: 'manifest.targets', declaration: { id: 'a', label: 'A', drag: true } });
  assert.equal(nativeDeclaration({ type: 'boolean', binding: { kind: 'input', id: 'b' }, label: 'B' }, 'program').ok, false, 'no program Boolean switch');
  assert.equal(nativeDeclaration({ type: 'number', binding: { kind: 'input', id: 'n' }, label: 'N' }, 'spec').ok, false, 'no spec continuous slider');
});

// ---- INT-04-C01/C05: bindings, supports, runtime, copy ----
test('exact support IDs: a dropped, invented, duplicated or third panel is refused', async () => {
  await refuses(plans.standard, 'standard', d => { d.supporting = []; }, 'support_missing');
  await refuses(plans.standard, 'standard', d => { d.supporting[0].id = 'other'; }, 'support_unknown');
  await refuses(plans.standard, 'standard', d => { d.supporting.push(clone(d.supporting[0])); }, 'support_duplicate');
  await refuses(plans.standard, 'standard', d => { d.supporting.push({ id: 'a', artifact: d.supporting[0].artifact }, { id: 'b', artifact: d.supporting[0].artifact }); }, 'support_limit');
});

test('every panel keeps its approved renderer, SDK tuple, helpers and capabilities (no silent switch)', async () => {
  const sealWith = async (bundle, stamps) => ({ kind: 'program', program: (await sealProgram(bundle, stamps)).value });
  // A support panel sealed with the old sdk-1 tuple, or as a stateful schema 2 program, is not the approved sdk-2 schema 1 tuple.
  for (const [stamps, code] of [[PROGRAM_STAMPS, 'tuple_mismatch'], [STATEFUL_VISUAL_PROGRAM_STAMPS, 'tuple_mismatch']]) {
    const draft = fixtureDraft('standard');
    const artifacts = await sealEnvelope(draft);
    const bundle = clone(draft.supporting[0].artifact.program);
    if (stamps.schemaVersion === 2) Object.assign(bundle.manifest, { viewport: { width: 640, height: 400 }, actions: [], targets: [] });
    artifacts.supporting[0].artifact = await sealWith(bundle, stamps);
    assert.ok(codes(validateCompositionBindings(plans.standard, artifacts)).includes(code), `${stamps.sdkVersion ?? ''}${stamps.schemaVersion}`);
  }
  const artifacts = await sealEnvelope(FIXTURE_DRAFTS.standard);
  artifacts.main = { kind: 'spec', spec: { version: 1, id: 'x', title: 'X', components: [], presentation: { mode: 'static' } } };
  assert.ok(codes(validateCompositionBindings(plans.standard, artifacts)).includes('renderer_mismatch'), 'a spec for an approved program');
  await refuses(plans.standard, 'standard', d => { d.supporting[0].artifact.program.manifest.capabilities = []; }, 'capability_missing');
  await refuses(plans.standard, 'standard', d => { d.main.program.manifest.capabilities.push('select_inputs'); }, 'capability_not_approved');
  await refuses(plans.standard, 'standard', () => {}, 'helper_missing', p => { p.supportingVisuals[0].runtime.requiredHelpers = ['plot']; });
  await refuses(plans.standard, 'standard', () => {}, 'tuple_mismatch', p => { p.scene.runtime.programTuple = { ...p.scene.runtime.programTuple, fingerprints: { ...p.scene.runtime.programTuple.fingerprints, sdk: 'f'.repeat(64) } }; });
});

test('control bindings: missing, extra and changed controls are refused; labels, defaults, units and ranges are the plan', async () => {
  await refuses(plans.deep, 'deep', d => { d.main.program.manifest.inputs = []; }, 'control_missing');
  await refuses(plans.deep, 'deep', d => { d.main.program.manifest.inputs.push({ type: 'number', id: 'extra', label: 'Extra', default: 1, min: 0, max: 2 }); }, 'control_extra');
  await refuses(plans.deep, 'deep', d => { d.main.program.manifest.inputs[0].label = 'Speed'; }, 'control_mismatch');
  await refuses(plans.deep, 'deep', d => { d.main.program.manifest.inputs[0].default = 4; }, 'control_mismatch');
  await refuses(plans.deep, 'deep', d => { d.main.program.manifest.inputs[0].max = 6; }, 'control_mismatch');
  await refuses(plans.deep, 'deep', d => { d.main.program.manifest.inputs[0].unit = 'cm/s'; }, 'control_mismatch');
  await refuses(plans.deep, 'deep', d => { delete d.main.program.manifest.inputs[0].step; }, 'control_mismatch');
  await refuses(plans.deep, 'deep', d => { d.main.program.manifest.readouts.pop(); }, 'readout_missing');
});

test('timeline bindings: the program declares the maximum duration, the approved pacing, origin and markers', async () => {
  await refuses(plans.standard, 'standard', d => { d.main.program.manifest.duration = 4; d.main.program.manifest.timeline.markers = d.main.program.manifest.timeline.markers.slice(0, 1); }, 'duration_mismatch');
  await refuses(plans.deep, 'deep', d => { d.main.program.manifest.duration = 3 * 2 / G; }, 'duration_mismatch'); // the old default-sized duration cannot play the 5.0 m/s flight
  await refuses(plans.standard, 'standard', d => { d.main.program.manifest.timeline.playbackRate = 1; }, 'timeline_mismatch');
  await refuses(plans.standard, 'standard', d => { d.main.program.manifest.timeline.displayOffset = 0; }, 'timeline_mismatch');
  await refuses(plans.standard, 'standard', d => { d.main.program.manifest.timeline.markers[1].time = 0.3; }, 'timeline_mismatch');
  await refuses(plans.standard, 'standard', d => { delete d.main.program.manifest.timeline; }, 'timeline_missing');
  await refuses(plans.standard, 'standard', d => { delete d.main.program.manifest.duration; delete d.main.program.manifest.timeline; }, 'timeline_missing');
});

test('support panels are control-free read-only snapshots: no clock, no unbound input, compatible bindings only', async () => {
  await refuses(plans.deep, 'deep', d => { d.supporting[0].artifact.program.manifest.duration = 1; }, 'support_clock');
  await refuses(plans.deep, 'deep', d => { d.supporting[0].artifact.program.manifest.inputs.push({ type: 'number', id: 'free', label: 'Free', default: 1, min: 0, max: 2 }); }, 'support_input_unbound');
  await refuses(plans.deep, 'deep', d => { d.supporting[0].artifact.program.manifest.inputs[0].min = 4; }, 'binding_incompatible');
  await refuses(plans.deep, 'deep', d => { d.supporting[0].artifact.program.manifest.inputs[0].id = 'renamed'; }, 'binding_incompatible');
  await refuses(plans.standard, 'standard', d => { d.supporting[0].artifact.program.manifest.readouts.pop(); }, 'readout_missing');
  await refuses(plans.standard, 'standard', d => { d.supporting[0].artifact.program.manifest.inputs.push({ type: 'number', id: 'free', label: 'Free', default: 1, min: 0, max: 2 }); }, 'support_input_unbound');
});

test('visible copy: only the composition shows Title and cardDescription; the Story is not copied into a manifest', async () => {
  await refuses(plans.standard, 'standard', d => { d.main.program.manifest.cardDescription = plans.standard.cardDescription; }, 'copy_duplicated');
  await refuses(plans.standard, 'standard', d => { d.main.program.manifest.description = plans.standard.story.slice(0, 590); }, 'story_in_card');
});

// ---- INT-04-C14: support snapshots under the two-Worker limit ----
test('support snapshots evaluate one at a time, are cached by artifact hash and bound inputs, and a stale answer is fenced', async () => {
  const composition = await compileCardComposition(plans.deep, await sealEnvelope(FIXTURE_DRAFTS.deep));
  composition.supporting.push({ ...clone(composition.supporting[0]), id: 'second' }); // a second support: the sequential rule is what matters
  let running = 0, peak = 0, calls = 0, release = null;
  const evaluate = async ({ inputs }) => { calls += 1; running += 1; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 1)); if (release) await release; running -= 1; return { frame: JSON.stringify(inputs) }; };
  const resolver = createSnapshotResolver({ evaluate });
  const first = await resolver.resolve(composition, { launchSpeed: 4 });
  assert.equal(first.complete, true); assert.equal(first.snapshots.length, 2); assert.equal(peak, 1, 'never two hosts at once');
  assert.equal(calls, 1, 'two panels with the same artifact and bound state share one evaluation... within one pass the second is a cache hit');
  assert.deepEqual(first.snapshots.map(s => s.cached), [false, true]);
  await resolver.resolve(composition, { launchSpeed: 4 }); assert.equal(calls, 1, 'same artifact and bound inputs: cache hit');
  await resolver.resolve(composition, { launchSpeed: 3 }); assert.equal(calls, 2, 'a changed input state is evaluated again');
  // A newer request while an older one is in flight: the older answer is dropped.
  let open; release = new Promise(r => { open = r; });
  const older = resolver.resolve(composition, { launchSpeed: 3.5 });
  await new Promise(r => setTimeout(r, 5));
  release = null; const newer = await resolver.resolve(composition, { launchSpeed: 4.5 });
  open(); const stale = await older;
  assert.deepEqual([stale.stale, stale.complete], [true, false], 'a stale result never masquerades as a complete card'); assert.equal(newer.complete, true);
  resolver.invalidate(); // an input change fences whatever is still in flight
});
