import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_LIMITS, ScenePlanSchema, DesignReviewSchema, DesignRevisionSchema, DescriptionFitSchema, parseScenePlan, validatePlanBindings, scenePlanJsonSchema,
  evalScalar, scalarInterval, ScalarExprError, planHash, contentHash, descriptionFitProblems, checkEnvelope, legacyBriefToDraft, revisionProblems,
} from './interact-plan.js';
import { interactFixtures } from './interact-plan-fixtures.js';
import { interactCapabilities } from './interact-control-catalogue.js';

const { capabilities, plans } = await interactFixtures();
const clone = value => structuredClone(value);
const parse = plan => parseScenePlan(plan, capabilities);
const codes = result => (result.ok ? [] : result.problems.map(p => `${p.code}@${p.path}`));
const refuses = (plan, code, pathPart = '', caps = capabilities) => {
  const result = parseScenePlan(plan, caps);
  assert.equal(result.ok, false, `expected a refusal with ${code}`);
  assert.ok(result.problems.some(p => p.code === code && p.path.includes(pathPart)), `expected ${code} at ${pathPart}; got ${codes(result).join(', ')}`);
  for (const p of result.problems) assert.ok(typeof p.path === 'string' && p.code && p.message, 'every problem carries path, code and message');
};
const G = 9.8;

test('every fixture is a valid plan', () => {
  for (const [name, plan] of Object.entries(plans)) {
    const result = parse(plan);
    assert.equal(result.ok, true, `${name}: ${codes(result).join(', ')}`);
    assert.deepEqual(result.value, plan, 'nothing is stripped or rewritten');
  }
});

test('all depth/mode combinations remain independent', () => {
  const byMode = { static: plans.overview, time: plans.standard, experiment: plans.untimedExperiment };
  for (const depth of ['overview', 'standard', 'deep']) {
    for (const [kind, base] of Object.entries(byMode)) {
      const plan = { ...clone(base), depth };
      const result = parse(plan);
      assert.equal(result.ok, true, `${depth} + ${kind}: ${codes(result).join(', ')}`);
      assert.equal(result.value.mode.kind, kind);
    }
  }
  assert.equal(plans.deep.mode.kind, 'experiment');
  assert.equal(plans.deep.mode.timeline !== null, true, 'a timed Experiment is allowed');
  assert.equal(plans.untimedExperiment.mode.timeline, null, 'an untimed Experiment is allowed');
  refuses({ ...clone(plans.standard), depth: 'expert' }, 'invalid_value', 'depth');
});

test('missing controls differs from empty controls', () => {
  assert.equal(plans.overview.controls.length, 0);
  assert.equal(parse(plans.overview).ok, true, 'an explicit empty list is valid');
  const missing = clone(plans.overview); delete missing.controls;
  refuses(missing, 'missing_field', 'controls');
  refuses({ ...clone(plans.overview), controls: null }, 'invalid_type', 'controls');
  for (const key of ['supportingVisuals', 'assumptions', 'limitations', 'claims']) {
    const without = clone(plans.overview); delete without[key];
    refuses(without, 'missing_field', key);
  }
});

test('timeline and native control bindings agree', () => {
  const noPlayback = clone(plans.standard); noPlayback.controls = noPlayback.controls.filter(c => c.type !== 'playback');
  refuses(noPlayback, 'timeline_controls_mismatch', 'controls');
  const untimedWithTransport = clone(plans.overview);
  untimedWithTransport.controls = [clone(plans.standard.controls[0])];
  refuses(untimedWithTransport, 'timeline_controls_mismatch', 'controls');
  const wrongPolicy = clone(plans.standard); wrongPolicy.mode.onInputChange = 'recompute_still';
  refuses(wrongPolicy, 'on_input_change_mismatch', 'onInputChange');
  const staticWithTimeline = clone(plans.standard); staticWithTimeline.mode.kind = 'static';
  refuses(staticWithTimeline, 'mode_mismatch', 'timeline');
  const timeNoTimeline = clone(plans.standard); timeNoTimeline.mode.timeline = null; timeNoTimeline.mode.onInputChange = 'recompute_still';
  timeNoTimeline.controls = []; timeNoTimeline.scene.checkpoints.forEach(c => { c.time = null; });
  refuses(timeNoTimeline, 'mode_mismatch', 'timeline');
  const fixedWithSlider = clone(plans.standard); fixedWithSlider.controls.push(clone(plans.untimedExperiment.controls[0]));
  refuses(fixedWithSlider, 'mode_mismatch', 'controls'); // Over time has fixed inputs
  const noInput = clone(plans.untimedExperiment); noInput.controls = []; noInput.mode.adjustableIds = [];
  refuses(noInput, 'mode_mismatch', 'mode.kind');
  const timelineBinding = clone(plans.standard); timelineBinding.controls[0].binding = { kind: 'input', id: 'x' };
  assert.equal(parse(timelineBinding).ok, false, 'a playback control binds the native timeline');
  const untimedCheckpoint = clone(plans.untimedExperiment); untimedCheckpoint.scene.checkpoints[0].time = { op: 'literal', value: 1 };
  refuses(untimedCheckpoint, 'mode_mismatch', 'checkpoints.0.time');
  const adjustable = clone(plans.deep); adjustable.mode.adjustableIds = [];
  refuses(adjustable, 'dangling_reference', 'adjustableIds');
});

test('unknown evidence/input IDs are refused', () => {
  const evidence = clone(plans.standard); evidence.claims[0].evidenceIds = ['made_up'];
  refuses(evidence, 'unknown_evidence', 'claims.0.evidenceIds.0');
  const unknownInput = clone(plans.deep); unknownInput.scene.checkpoints[0].inputOverrides = { ghost: 1 };
  refuses(unknownInput, 'dangling_reference', 'inputOverrides.ghost');
  const expression = clone(plans.deep); expression.mode.timeline.end = { op: 'multiply', left: { op: 'literal', value: 2 }, right: { op: 'input', id: 'ghost' } };
  refuses(expression, 'unknown_input', 'timeline.end');
  const binding = clone(plans.deep); binding.supportingVisuals[0].parameterBindings[0].fromInputId = 'ghost';
  refuses(binding, 'dangling_reference', 'parameterBindings.0.fromInputId');
  const action = clone(plans.deep); action.scene.checkpoints[0].actions = ['ghost'];
  refuses(action, 'dangling_reference', 'checkpoints.0.actions.0');
  const override = clone(plans.deep); override.scene.checkpoints[0].inputOverrides = { launchSpeed: 9 };
  refuses(override, 'out_of_domain', 'inputOverrides.launchSpeed');
});

test('Story is not truncated to manifest summary', () => {
  const plan = clone(plans.standard);
  plan.story = `${plans.standard.story} `.repeat(Math.floor(PLAN_LIMITS.story / 700)).trim();
  assert.ok(plan.story.length > 2000, 'longer than any manifest summary (400) or brief meaning (1200)');
  const result = parse(plan);
  assert.equal(result.ok, true);
  assert.equal(result.value.story, plan.story, 'the full Story round-trips');
  plan.story = 'x'.repeat(PLAN_LIMITS.story);
  assert.equal(parse(plan).ok, true, 'the transport bound itself is admitted');
  plan.story = 'x'.repeat(PLAN_LIMITS.story + 1);
  refuses(plan, 'too_large', 'story'); // refused, never silently cut
  const html = { ...clone(plans.standard), story: 'A story with <script>alert(1)</script> inside.' };
  refuses(html, 'custom', 'story');
});

test('unsafe/out-of-domain timeline expression is refused', () => {
  const variants = {
    'an expression string': '2 * launchSpeed / 9.8',
    'an unknown operator': { op: 'pow', left: { op: 'literal', value: 2 }, right: { op: 'literal', value: 2 } },
    'a function-shaped node': { op: 'call', fn: 'Math.sqrt', args: [] },
    'an extra field': { op: 'literal', value: 1, code: 'alert(1)' },
    'a non-finite literal': { op: 'literal', value: Infinity },
    'a string literal value': { op: 'literal', value: '1' },
  };
  for (const [name, end] of Object.entries(variants)) {
    const plan = clone(plans.deep); plan.mode.timeline.end = end;
    const result = parse(plan);
    assert.equal(result.ok, false, name);
    assert.ok(result.problems.some(p => p.path.includes('timeline.end')), name);
  }
  let deep = { op: 'literal', value: 1 };
  for (let i = 0; i < 9; i += 1) deep = { op: 'add', left: deep, right: { op: 'literal', value: 1 } };
  const tooDeep = clone(plans.deep); tooDeep.mode.timeline.end = deep;
  refuses(tooDeep, 'unsafe_expression', 'timeline.end');
  const balanced = levels => (levels === 0 ? { op: 'literal', value: 1 } : { op: 'add', left: balanced(levels - 1), right: balanced(levels - 1) });
  let hostile = { op: 'literal', value: 1 };
  for (let i = 0; i < 20000; i += 1) hostile = { op: 'add', left: hostile, right: { op: 'literal', value: 1 } };
  const hostilePlan = clone(plans.deep); hostilePlan.mode.timeline.end = hostile;
  refuses(hostilePlan, 'unsafe_expression', 'timeline.end'); // the walk stops at the depth bound; no stack overflow
  const tooMany = clone(plans.deep); tooMany.mode.timeline.end = balanced(5); // 63 nodes, depth 6
  refuses(tooMany, 'unsafe_expression', 'timeline.end');

  const divZero = clone(plans.deep); divZero.mode.timeline.end = { op: 'divide', left: { op: 'literal', value: 2 }, right: { op: 'subtract', left: { op: 'input', id: 'launchSpeed' }, right: { op: 'literal', value: 4 } } };
  refuses(divZero, 'division_by_zero', 'timeline.end'); // u - 4 reaches 0 inside 3..5
  const negativeEnd = clone(plans.deep); negativeEnd.mode.timeline.end = { op: 'subtract', left: { op: 'literal', value: 0.2 }, right: { op: 'divide', left: { op: 'input', id: 'launchSpeed' }, right: { op: 'literal', value: G } } };
  refuses(negativeEnd, 'out_of_domain', 'timeline.end');
  const overCeiling = clone(plans.deep); overCeiling.mode.timeline.end = { op: 'multiply', left: { op: 'input', id: 'launchSpeed' }, right: { op: 'literal', value: 30 } };
  refuses(overCeiling, 'out_of_domain', 'timeline.end'); // 5 * 30 = 150 s > 120
  const marker = clone(plans.deep); marker.mode.timeline.markers[0].time = { op: 'multiply', left: { op: 'input', id: 'launchSpeed' }, right: { op: 'literal', value: 1 } };
  refuses(marker, 'out_of_domain', 'markers.0.time'); // u can land after 2u/g for some u
  const negativeMarker = clone(plans.standard); negativeMarker.mode.timeline.markers[0].time = { op: 'literal', value: -0.1 };
  refuses(negativeMarker, 'out_of_domain', 'markers.0.time');
  const checkpointOutside = clone(plans.standard); checkpointOutside.scene.checkpoints[0].time = { op: 'literal', value: 7 };
  refuses(checkpointOutside, 'out_of_domain', 'checkpoints.0.time');
  const infiniteOffset = clone(plans.standard); infiniteOffset.mode.timeline.displayOffset = { op: 'multiply', left: { op: 'literal', value: 1e308 }, right: { op: 'literal', value: 10 } };
  refuses(infiniteOffset, 'non_finite', 'displayOffset');
  const reads = clone(plans.standard); reads.mode.timeline.end = { op: 'input', id: 'launchSpeed' };
  refuses(reads, 'unknown_input', 'timeline.end'); // Standard's launch speed is fixed, not a declared input
  const badRate = clone(plans.standard); badRate.mode.timeline.playbackRate = 0;
  assert.equal(parse(badRate).ok, false);
});

test('ScalarExpr evaluates safely and refuses out-of-domain input', () => {
  const end = plans.deep.mode.timeline.end;
  assert.ok(Math.abs(evalScalar(end, { launchSpeed: 3 }) - 2 * 3 / G) < 1e-12);
  assert.throws(() => evalScalar(end, { launchSpeed: 9 }, { launchSpeed: [3, 5] }), error => error instanceof ScalarExprError && error.code === 'out_of_domain');
  assert.throws(() => evalScalar(end, {}), error => error.code === 'unknown_input');
  assert.throws(() => evalScalar({ op: 'divide', left: { op: 'literal', value: 1 }, right: { op: 'literal', value: 0 } }), error => error.code === 'division_by_zero');
  assert.throws(() => evalScalar({ op: 'multiply', left: { op: 'literal', value: 1e308 }, right: { op: 'literal', value: 10 } }), error => error.code === 'non_finite');
  assert.throws(() => evalScalar('1+1'), error => error.code === 'unsafe_expression');
  assert.throws(() => evalScalar({ op: 'literal', value: 1, toString() { return 'x'; }, valueOf: () => 1, constructor: Function }), ScalarExprError);
  assert.deepEqual(scalarInterval(end, { launchSpeed: [3, 5] }).map(v => Math.round(v * 1e6) / 1e6), [0.612245, 1.020408]);
});

test('endpoint is positive and finite across the Deep input domain', () => {
  const speed = plans.deep.controls.find(c => c.type === 'number');
  assert.deepEqual([speed.min, speed.max, speed.default, speed.step], [3.0, 5.0, 5.0, 0.1]);
  const [lo, hi] = scalarInterval(plans.deep.mode.timeline.end, { launchSpeed: [speed.min, speed.max] });
  assert.ok(lo > 0 && Number.isFinite(hi) && hi <= PLAN_LIMITS.timeline);
  for (let u = speed.min; u <= speed.max + 1e-9; u += speed.step) {
    const end = evalScalar(plans.deep.mode.timeline.end, { launchSpeed: u }, { launchSpeed: [speed.min - 1e-9, speed.max + 1e-9] });
    assert.ok(Number.isFinite(end) && end > 0, `endpoint at ${u}`);
    assert.ok(Math.abs(end - 2 * u / G) < 1e-6, 'matches 2u/g');
    assert.ok(Math.abs(evalScalar(plans.deep.mode.timeline.markers[0].time, { launchSpeed: u }) - u / G) < 1e-6, 'trial top is u/g');
    assert.equal(evalScalar(plans.deep.mode.timeline.displayOffset), 0, 'Deep never applies the negative Standard offset');
  }
  const at = u => evalScalar(plans.deep.mode.timeline.end, { launchSpeed: u });
  assert.ok(Math.abs(at(3) - 0.612245) < 1e-6 && Math.abs(at(5) - 1.020408) < 1e-6);
  assert.ok(Math.abs(evalScalar(plans.standard.mode.timeline.displayOffset) + 3 / G) < 1e-12);
  assert.ok(Math.abs(evalScalar(plans.standard.mode.timeline.end) - 6 / G) < 1e-12);
  // The canonical Deep drag: widening the admitted domain to touch zero makes the endpoint unprovable, so the plan is refused.
  const widened = clone(plans.deep); const control = widened.controls.find(c => c.type === 'number');
  Object.assign(control, { min: 0, default: 5, step: 0.1 });
  refuses(widened, 'out_of_domain', 'timeline.end');
});

test('Standard checkpoints resolve exactly to the apex and plus/minus 0.10 s', () => {
  const [before, top, after] = plans.standard.scene.checkpoints.map(c => evalScalar(c.time));
  assert.ok(Math.abs(before - (3 / G - 0.1)) < 1e-12 && Math.abs(top - 3 / G) < 1e-12 && Math.abs(after - (3 / G + 0.1)) < 1e-12);
  const offset = evalScalar(plans.standard.mode.timeline.displayOffset);
  assert.deepEqual([before + offset, top + offset, after + offset].map(v => Math.round(v * 1e9) / 1e9), [-0.1, 0, 0.1]);
  const tl = plans.standard.mode.timeline;
  assert.equal(tl.playbackRate, 0.1);
  assert.ok(Math.abs(evalScalar(tl.end) / tl.playbackRate - 6.12) < 0.01, 'about 6.12 wall seconds');
  assert.ok(Math.abs(evalScalar(tl.displayOffset) + 0.306) < 1e-3 && Math.abs(evalScalar(tl.end) + evalScalar(tl.displayOffset) - 0.306) < 1e-3);
  assert.deepEqual(tl.markers.map(m => evalScalar(m.time)), [before, top, after]);
  assert.equal(plans.standard.supportingVisuals.length, 1, 'the fixed three-moment panel is part of the plan');
});

test('dangling reference IDs are refused by name and path', () => {
  const observation = clone(plans.standard); observation.scene.observations[0].quantityIds = ['ghost'];
  refuses(observation, 'dangling_reference', 'scene.observations.0.quantityIds.0');
  const readout = clone(plans.standard); readout.scene.observations[0].readoutIds = ['ghost'];
  refuses(readout, 'dangling_reference', 'scene.observations.0.readoutIds.0');
  const affected = clone(plans.standard); affected.controls[0].affects = [{ scope: 'main', kind: 'entity', id: 'ghost' }];
  refuses(affected, 'dangling_reference', 'controls.0.affects.0');
  const scope = clone(plans.standard); scope.controls[0].affects = [{ scope: 'nowhere', kind: 'readout', id: 'x' }];
  refuses(scope, 'dangling_reference', 'controls.0.affects.0');
  const fixed = clone(plans.standard); fixed.mode.fixedValues.mystery = 1;
  refuses(fixed, 'dangling_reference', 'fixedValues.mystery');
  const both = clone(plans.deep); both.mode.fixedValues.launchSpeed = 4;
  refuses(both, 'duplicate_id', 'fixedValues.launchSpeed');
});

test('cross-panel references are refused', () => {
  const supportUsesMain = clone(plans.standard); supportUsesMain.supportingVisuals[0].observations[0].readoutIds = ['tossedVelocity'];
  refuses(supportUsesMain, 'dangling_reference', 'supportingVisuals.0.observations.0.readoutIds.0');
  const supportQuantity = clone(plans.standard); supportQuantity.supportingVisuals[0].observations[0].quantityIds = ['velocity'];
  refuses(supportQuantity, 'dangling_reference', 'supportingVisuals.0.observations.0.quantityIds.0'); // a support declares no quantities
  const mainUsesSupport = clone(plans.standard); mainUsesSupport.scene.observations[0].readoutIds = ['velocityTop'];
  refuses(mainUsesSupport, 'dangling_reference', 'scene.observations.0.readoutIds.0');
  const wrongKind = clone(plans.deep); wrongKind.controls[2].affects = [{ scope: 'comparePeaks', kind: 'quantity', id: 'trialOffset' }];
  refuses(wrongKind, 'dangling_reference', 'controls.2.affects.0');
  const wrongPanelReadout = clone(plans.deep); wrongPanelReadout.controls[2].affects = [{ scope: 'comparePeaks', kind: 'readout', id: 'trialTime' }];
  refuses(wrongPanelReadout, 'dangling_reference', 'controls.2.affects.0'); // trialTime is a main readout
  const reservedScope = clone(plans.standard); reservedScope.supportingVisuals[0].id = 'main';
  refuses(reservedScope, 'duplicate_id', 'supportingVisuals.0.id');
});

test('unknown fields, duplicate IDs and duplicate markers are refused', () => {
  for (const mutate of [
    plan => { plan.hash = 'abc'; },
    plan => { plan.scene.extra = 1; },
    plan => { plan.controls[0].html = '<b>x</b>'; },
    plan => { plan.mode.timeline.markers[0].style = 'x'; },
    plan => { plan.supportingVisuals[0].caption = 'x'; },
  ]) {
    const plan = clone(plans.standard); mutate(plan);
    refuses(plan, 'unknown_field');
  }
  const marker = clone(plans.standard); marker.mode.timeline.markers[1].id = marker.mode.timeline.markers[0].id;
  refuses(marker, 'duplicate_id', 'markers.1');
  const entities = clone(plans.standard); entities.scene.entities[1].id = entities.scene.entities[0].id;
  refuses(entities, 'duplicate_id', 'scene.entities.1');
  const controls = clone(plans.deep); controls.controls[3].id = controls.controls[0].id;
  refuses(controls, 'duplicate_id', 'controls.3');
  const bindings = clone(plans.deep); bindings.controls.push({ ...clone(bindings.controls[2]), id: 'speed2' });
  refuses(bindings, 'duplicate_binding', 'controls');
  const readouts = clone(plans.standard); readouts.scene.readoutIds = ['tossedVelocity', 'tossedVelocity'];
  refuses(readouts, 'duplicate_id', 'scene.readoutIds.1');
  const badId = clone(plans.standard); badId.scene.entities[0].id = 'has space';
  refuses(badId, 'invalid_format', 'scene.entities.0.id');
  const version = { ...clone(plans.standard), schemaVersion: 2 };
  refuses(version, 'unknown_version', 'schemaVersion');
  assert.equal(parseScenePlan('nope', capabilities).ok, false);
  assert.equal(parseScenePlan(null, capabilities).ok, false);
});

test('control details enforce range, step grid, options, items and reset', () => {
  const number = (mutate, code, path) => { const plan = clone(plans.deep); mutate(plan.controls[2]); refuses(plan, code, path); };
  number(c => { c.default = 4.55; }, 'default_off_grid', 'controls.2.default');
  number(c => { c.default = 6; }, 'default_out_of_range', 'controls.2.default');
  number(c => { c.min = 5; c.max = 3; c.default = 4; }, 'range_invalid', 'controls.2.max');
  number(c => { c.step = 0; }, 'too_small', 'controls.2.step');
  const select = clone(plans.staticAdjustable); select.controls[0].default = 'later';
  refuses(select, 'default_not_an_option', 'controls.0.default');
  const options = clone(plans.staticAdjustable); options.controls[0].options[1].value = options.controls[0].options[0].value;
  refuses(options, 'duplicate_id', 'controls.0.options.1');
  const url = clone(plans.deep); url.controls[2].purpose = 'See https://example.com/x for the answer';
  refuses(url, 'custom', 'controls.2.purpose');
  const metadata = clone(plans.deep); delete metadata.controls[2].selectionReason;
  refuses(metadata, 'missing_field', 'controls.2.selectionReason');
  const reset = clone(plans.standard); reset.controls.push(clone(plans.deep.controls[3]));
  refuses(reset, 'mode_mismatch', 'controls');
  const tooMany = clone(plans.deep); tooMany.controls = Array.from({ length: 25 }, (_, i) => ({ ...clone(plans.deep.controls[0]), id: `c${i}` }));
  refuses(tooMany, 'too_large', 'controls');

  const indexed = clone(plans.staticAdjustable);
  indexed.controls = [{
    id: 'pick', label: 'Item', type: 'index', purpose: 'Step through the items.', selectionReason: 'Ordered items are a state choice.', nativeControlId: 'spec.index_picker', binding: { kind: 'input', id: 'pick' },
    default: 1, dataRef: 'rows', presentation: 'picker', items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], affects: [{ scope: 'main', kind: 'entity', id: 'ball' }],
  }];
  indexed.mode.adjustableIds = ['pick']; indexed.scene.checkpoints = [];
  assert.equal(parse(indexed).ok, true);
  const empty = clone(indexed); empty.controls[0].items = [];
  refuses(empty, 'too_small', 'controls.0.items');
  const outOfRange = clone(indexed); outOfRange.controls[0].default = 3;
  refuses(outOfRange, 'default_out_of_range', 'controls.0.default');
  const slider = clone(indexed); slider.controls[0].presentation = 'slider';
  refuses(slider, 'incompatible_control', 'controls.0.presentation'); // spec.index_picker presents as picker
  const multi = clone(indexed); multi.controls[0] = { ...multi.controls[0], type: 'multi_select', nativeControlId: 'spec.multi_select', default: [0, 2] }; delete multi.controls[0].presentation;
  assert.equal(parse(multi).ok, true);
  multi.controls[0].default = [2, 0];
  refuses(multi, 'default_out_of_range', 'controls.0.default');
  const overrideList = clone(indexed); overrideList.controls[0] = { ...clone(multi.controls[0]), default: [0] }; overrideList.scene.checkpoints = [{ id: 'cp', label: 'cp', time: null, inputOverrides: { pick: 1 }, actions: [], expected: 'x' }];
  refuses(overrideList, 'override_not_scalar', 'inputOverrides.pick');
});

test('validatePlanBindings rejects invented, incompatible and unavailable controls', async () => {
  const invented = clone(plans.deep); invented.controls[2].nativeControlId = 'program.knob';
  refuses(invented, 'unknown_native_control', 'controls.2.nativeControlId');
  const crossRenderer = clone(plans.deep); crossRenderer.controls[2].nativeControlId = 'spec.select';
  refuses(crossRenderer, 'incompatible_control', 'controls.2.nativeControlId');
  const semantic = clone(plans.deep); semantic.controls[2].nativeControlId = 'program.select';
  refuses(semantic, 'incompatible_control', 'controls.2.nativeControlId');
  const boolean = clone(plans.deep);
  boolean.controls.push({ id: 'flag', label: 'Flag', type: 'boolean', purpose: 'Toggle.', selectionReason: 'x', nativeControlId: 'spec.boolean', binding: { kind: 'input', id: 'flag' }, default: false, affects: [{ scope: 'main', kind: 'entity', id: 'trialBall' }] });
  boolean.mode.adjustableIds.push('flag');
  refuses(boolean, 'unsupported_control', 'controls.4.type'); // main renderer is program: no Boolean switch
  // One compatible main renderer: a spec-only toggle cannot ride on a program scene, nor a program-only action on a spec scene.
  const action = clone(plans.deep);
  action.controls.push({ id: 'step', label: 'Step', type: 'action', purpose: 'Advance.', selectionReason: 'x', nativeControlId: 'program.action', binding: { kind: 'action', id: 'stepOnce' }, effect: 'Runs one step.', affects: [{ scope: 'main', kind: 'entity', id: 'trialBall' }] });
  refuses(action, 'stateful_unavailable', 'controls.4.nativeControlId'); // the runtime is schema 1, actions need schema 2
  const stateful = clone(action); stateful.scene.runtime = { ...stateful.scene.runtime, schemaVersion: 2, programTuple: { ...stateful.scene.runtime.programTuple, schemaVersion: 2 } };
  const statefulTuple = (await import('./explain-program/stamps.js')).SUPPORTED_PROGRAM_TUPLES.find(t => t.schemaVersion === 2 && t.sdkVersion === 'sdk-2');
  stateful.scene.runtime.programTuple = statefulTuple;
  assert.equal(parse(stateful).ok, true, 'the same plan is valid when the stateful program is selected and enabled');
  const off = await interactCapabilities({ renderers: ['spec', 'program'], stateful: false, componentControls: ['choice'], evidenceIds: ['kinematics_note'] });
  stateful.scene.runtime.catalogueHash = off.catalogueHash;
  refuses(stateful, 'unsupported_control', 'controls.4.type', off); // disabled stateful actions
  const mixed = clone(plans.staticAdjustable); mixed.controls[0].nativeControlId = 'program.select';
  refuses(mixed, 'incompatible_control', 'controls.0.nativeControlId');
  const tooManyOptions = clone(plans.staticAdjustable);
  tooManyOptions.controls[0].options = Array.from({ length: 8 }, (_, i) => ({ value: `o${i}`, label: `Option ${i}` })); tooManyOptions.controls[0].default = 'o0'; tooManyOptions.scene.checkpoints = [];
  const narrow = await interactCapabilities({ renderers: ['spec'], componentControls: { choice: { maxOptions: 5 } }, evidenceIds: [] });
  tooManyOptions.scene.runtime.catalogueHash = narrow.catalogueHash;
  refuses(tooManyOptions, 'limit_exceeded', 'controls.0.options', narrow);
  assert.deepEqual(validatePlanBindings(plans.standard, capabilities), []);
  assert.equal(validatePlanBindings(plans.standard, {}).at(0).code, 'capabilities_missing');
  assert.equal(parseScenePlan(plans.standard).ok, false, 'a plan is never accepted without capabilities');
  const manyInputs = clone(plans.deep);
  for (let i = 0; i < 4; i += 1) manyInputs.controls.push({ ...clone(plans.deep.controls[2]), id: `extra${i}`, binding: { kind: 'input', id: `extra${i}` } }), manyInputs.mode.adjustableIds.push(`extra${i}`);
  refuses(manyInputs, 'limit_exceeded', 'controls');
});

test('per-panel runtime records bind the catalogue and the sealed tuple', async () => {
  const stale = clone(plans.standard); stale.scene.runtime.catalogueHash = 'a'.repeat(64);
  refuses(stale, 'catalogue_mismatch', 'scene.runtime.catalogueHash');
  const supportStale = clone(plans.standard); supportStale.supportingVisuals[0].runtime.catalogueHash = 'b'.repeat(64);
  refuses(supportStale, 'catalogue_mismatch', 'supportingVisuals.0.runtime.catalogueHash');
  const invented = clone(plans.standard); invented.scene.runtime.programTuple = { ...invented.scene.runtime.programTuple, rendererVersion: 'renderer-99' };
  refuses(invented, 'unsupported_tuple', 'scene.runtime.programTuple');
  const mismatch = clone(plans.standard); mismatch.scene.runtime.sdkVersion = 'sdk-1';
  refuses(mismatch, 'runtime_tuple_mismatch', 'programTuple');
  const noRuntime = clone(plans.standard); delete noRuntime.supportingVisuals[0].runtime;
  refuses(noRuntime, 'missing_field', 'supportingVisuals.0.runtime'); // even a control-free panel declares its runtime
  const specWithTuple = clone(plans.overview); specWithTuple.scene.runtime.sdkVersion = 'sdk-2';
  assert.equal(parse(specWithTuple).ok, false, 'a spec panel nulls the program-only fields');
  const capability = clone(plans.standard); capability.scene.runtime.requiredCapabilities = ['teleportation'];
  refuses(capability, 'unsupported_capability', 'requiredCapabilities');
  const programOnly = await interactCapabilities({ renderers: ['program'], evidenceIds: ['kinematics_note'] });
  const overview = clone(plans.overview); overview.scene.runtime.catalogueHash = programOnly.catalogueHash;
  refuses(overview, 'renderer_unavailable', 'scene.runtime', programOnly);
  const clash = clone(plans.deep); clash.scene.readoutIds.push('launchSpeed');
  refuses(clash, 'duplicate_id', 'scene.readoutIds', capabilities);
});

test('canonical hashing is computed over validated data and ignores key order', async () => {
  const hash = await planHash(plans.standard);
  assert.match(hash, /^[0-9a-f]{64}$/);
  const reverseKeys = value => (Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().reverse().map(k => [k, reverseKeys(value[k])])) : value);
  const reordered = reverseKeys(plans.standard);
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(plans.standard));
  assert.equal(await planHash(reordered), hash, 'key order is not content');
  const swapped = clone(plans.standard); swapped.mode.timeline.markers.reverse();
  assert.notEqual(await planHash(swapped), hash, 'array order is meaningful');
  const edited = clone(plans.standard); edited.cardDescription += ' More.';
  assert.notEqual(await planHash(edited), hash, 'a changed approved content invalidates the hash');
  const rebound = clone(plans.standard); rebound.scene.runtime.catalogueHash = 'c'.repeat(64);
  assert.notEqual(await planHash(rebound), hash, 'the runtime binding is part of the hash');
  const supplied = { ...clone(plans.standard), hash };
  await assert.rejects(() => planHash(supplied), /valid ScenePlan/);
  refuses(supplied, 'unknown_field', 'hash'); // a model-supplied hash is never accepted
  assert.equal(await contentHash({ b: 1, a: 2 }), await contentHash({ a: 2, b: 1 }));
  assert.notEqual(await planHash(plans.deep), hash);
});

test('description fit is a render receipt: 2 to 4 rendered lines, never a character count', async () => {
  const plan = plans.standard;
  assert.ok(plan.cardDescription.length <= PLAN_LIMITS.cardDescription);
  const copyHash = await contentHash(plan.cardDescription);
  const receipt = widths => ({ descriptionHash: copyHash, styleVersion: 'card-v1', widths });
  assert.deepEqual(await descriptionFitProblems(plan, receipt([{ cardWidth: 360, lines: 4 }, { cardWidth: 560, lines: 3 }, { cardWidth: 820, lines: 2 }])), []);
  const long = await descriptionFitProblems(plan, receipt([{ cardWidth: 280, lines: 6 }]));
  assert.equal(long[0].code, 'description_fit');
  const single = await descriptionFitProblems(plan, receipt([{ cardWidth: 900, lines: 1 }]));
  assert.equal(single[0].code, 'description_fit', 'one line is also outside the contract');
  const stale = await descriptionFitProblems({ ...plan, cardDescription: 'Different copy.' }, receipt([{ cardWidth: 360, lines: 3 }]));
  assert.equal(stale[0].code, 'stale_receipt');
  assert.equal((await descriptionFitProblems(plan, { descriptionHash: 'x' }))[0].code, 'invalid_receipt');
  assert.equal(DescriptionFitSchema.safeParse(receipt([])).success, false, 'a receipt with no measured width proves nothing');
  // The schema accepts any in-bound text; only the receipt can say it fits.
  const short = { ...clone(plan), cardDescription: 'Short.' };
  assert.equal(parse(short).ok, true);
  const tooLong = { ...clone(plan), cardDescription: 'y'.repeat(PLAN_LIMITS.cardDescription + 1) };
  refuses(tooLong, 'too_large', 'cardDescription');
  refuses({ ...clone(plan), cardDescription: 'two\nparagraphs' }, 'custom', 'cardDescription');
  refuses({ ...clone(plan), cardDescription: '   ' }, 'custom', 'cardDescription');
  const missing = clone(plan); delete missing.cardDescription;
  refuses(missing, 'missing_field', 'cardDescription'); // separate required field, not derived from the Story at parse time
});

test('the JSON Schema is exported from the authoritative contract', () => {
  const schema = scenePlanJsonSchema();
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required.sort(), ['assumptions', 'cardDescription', 'claims', 'controls', 'depth', 'learningGoal', 'limitations', 'mode', 'scene', 'schemaVersion', 'story', 'supportingVisuals', 'title']);
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.ok(schema.$defs.ScalarExpr.oneOf.length === 3);
  assert.equal(schema.properties.mode.properties.timeline.anyOf.length, 2);
  assert.doesNotThrow(() => JSON.stringify(schema));
  assert.equal(scenePlanJsonSchema().$id, 'scene-plan-v1');
});

test('DesignReview and DesignRevision are strict records', async () => {
  const hash = await planHash(plans.standard);
  const review = {
    planHash: hash,
    learning: { goal: 'Explain why acceleration is -9.8 at the top.', likelyUnderstanding: 'Likely, from the scrubber.', visualEvidence: 'Arrows at three instants.', transfer: { prompt: 'A jumper at the top of a jump?', expectedReasoning: 'Gravity still acts.' }, teachBack: { prompt: 'Explain it to a friend.', expectedReasoning: 'Velocity passes through zero.' }, improvement: 'None needed.', score: 4 },
    sceneQuality: { accuracy: 'Correct.', clarity: 'Clear.', modeControls: 'Agree.', buildability: 'Buildable.', score: 5 },
    findings: [{ id: 'f1', severity: 'minor', category: 'layout', path: 'scene.description', claimId: null, message: 'Label could be shorter.', requiredChange: 'Shorten.', verification: 'Rendered capture.' }],
    openChecks: [{ kind: 'visual_needs_render', text: 'Check the arrow lengths in a render.' }],
    verdict: 'pass',
  };
  assert.equal(DesignReviewSchema.safeParse(review).success, true);
  const overridden = clone(review); overridden.findings[0].severity = 'major';
  const result = DesignReviewSchema.safeParse(overridden);
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].params.code, 'verdict_overridden', 'a major finding overrides a claimed pass');
  assert.equal(DesignReviewSchema.safeParse({ ...review, extra: 1 }).success, false);
  assert.equal(DesignReviewSchema.safeParse({ ...review, learning: { ...review.learning, score: 6 } }).success, false);
  assert.equal(DesignReviewSchema.safeParse({ ...review, planHash: 'short' }).success, false);

  const revision = { plan: clone(plans.standard), changes: [{ findingId: 'f1', paths: ['scene.description'], explanation: 'Shortened the label.' }], unresolvedFindingIds: [] };
  assert.equal(DesignRevisionSchema.safeParse(revision).success, true);
  assert.equal(DesignRevisionSchema.safeParse({ ...revision, hash: 'x' }).success, false, 'a self-reported hash is refused');
  assert.equal(DesignRevisionSchema.safeParse({ ...revision, fixed: true }).success, false, 'a self-reported fixed flag is refused');
  const patch = { ...revision, plan: { title: 'only a patch' } };
  assert.equal(DesignRevisionSchema.safeParse(patch).success, false, 'the whole plan comes back');
  const noDescription = clone(revision); delete noDescription.plan.cardDescription;
  assert.equal(DesignRevisionSchema.safeParse(noDescription).success, false, 'the description is preserved');
  assert.deepEqual(revisionProblems(plans.standard, revision), []);
  assert.equal(revisionProblems(plans.standard, { ...revision, plan: { ...revision.plan, depth: 'deep' } })[0].code, 'depth_changed');
});

test('maximum-size envelopes validate, and an over-limit envelope fails before sending without truncation', async () => {
  const plan = clone(plans.standard);
  plan.story = 'S'.repeat(PLAN_LIMITS.story);
  plan.scene.entities = Array.from({ length: PLAN_LIMITS.entities }, (_, i) => ({ id: `entity${i}`, label: `Entity ${i}`, purpose: 'p'.repeat(PLAN_LIMITS.entry) }));
  plan.scene.quantities = Array.from({ length: PLAN_LIMITS.quantities }, (_, i) => ({ id: `quantity${i}`, label: `Quantity ${i}`, unit: 'm/s', meaning: 'm'.repeat(PLAN_LIMITS.entry), reference: 'r'.repeat(PLAN_LIMITS.entry), relation: 'q'.repeat(PLAN_LIMITS.entry) }));
  plan.scene.observations = Array.from({ length: PLAN_LIMITS.observations }, (_, i) => ({ id: `obs${i}`, text: 'o'.repeat(PLAN_LIMITS.entry), quantityIds: ['quantity0'], readoutIds: ['tossedVelocity'] }));
  plan.scene.checkpoints = plan.scene.checkpoints.slice(0, 3);
  plan.mode.fixedValues = { quantity0: 1, quantity1: 2 };
  plan.claims = Array.from({ length: PLAN_LIMITS.claims }, (_, i) => ({ id: `claim${i}`, text: 'c'.repeat(PLAN_LIMITS.entry), evidenceIds: ['kinematics_note'], check: 'k'.repeat(PLAN_LIMITS.entry) }));
  plan.controls.forEach(c => { c.affects = [{ scope: 'main', kind: 'entity', id: 'entity0' }]; });
  const result = parse(plan);
  assert.equal(result.ok, true, codes(result).join(', '));
  const envelope = { plan: result.value, findings: [], evidence: ['kinematics_note'], capabilities: capabilities.catalogue };
  const size = checkEnvelope(envelope, 10_000_000);
  assert.equal(size.ok, true);
  assert.ok(size.bytes > 100_000, `a realistic maximum is large (${size.bytes} bytes)`);
  const small = checkEnvelope(envelope, 50_000);
  assert.equal(small.ok, false);
  assert.equal(small.problems[0].code, 'envelope_too_large');
  assert.equal(envelope.plan.story.length, PLAN_LIMITS.story, 'the Story is never shortened to fit');
  assert.equal(await planHash(result.value) === await planHash(plan), true);
});

test('only the legacy VisualBrief converts, and never into a reviewed plan', () => {
  const brief = { version: 1, proposal: { id: 'p1', version: 0 }, meaning: 'Why velocity zero is not acceleration zero.', assumptions: ['no air'], components: ['ballPath'], evidence: ['kinematics_note'] };
  const converted = legacyBriefToDraft(brief, 'standard');
  assert.equal(converted.ok, true);
  assert.equal(converted.reviewed, false);
  assert.equal(converted.draft.depth, 'standard');
  assert.equal(converted.draft.legacyMeaning, brief.meaning);
  for (const field of ['story', 'cardDescription', 'controls', 'mode', 'scene', 'title']) assert.equal(field in converted.draft, false, `${field} is not fabricated`);
  assert.equal(parse(converted.draft).ok, false, 'a legacy draft is not a ScenePlan');
  assert.equal(legacyBriefToDraft({ meaning: 'x' }, 'standard').ok, false);
  assert.equal(legacyBriefToDraft(brief, 'expert').ok, false);
  assert.equal(legacyBriefToDraft(plans.standard, 'standard').ok, false, 'a ScenePlan is not a VisualBrief');
});

test('executable content is refused wherever it hides', () => {
  const key = clone(plans.standard); key.scene.entities[0].onClick = 'x';
  assert.equal(parse(key).ok, false);
  const scheme = clone(plans.standard); scheme.scene.entities[0].purpose = 'javascript:alert(1)';
  refuses(scheme, 'executable_content', 'purpose');
  const html = clone(plans.standard); html.scene.description = '<img src=x onerror=alert(1)>';
  assert.equal(parse(html).ok, false);
  assert.equal(ScenePlanSchema.safeParse(html).success, false, 'the standalone schema is as strict as parseScenePlan');
});
