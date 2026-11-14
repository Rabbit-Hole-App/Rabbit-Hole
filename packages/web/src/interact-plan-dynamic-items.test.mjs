// Brief 24 task 2: a plan's index control may carry `items: { by, options }` (the host's step list that follows a select input, behind inputs_v2).
// Plan validation checks it with precise paths; the program manifest declaration carries it unchanged; without the capability it is refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interactFixtures } from './interact-plan-fixtures.js';
import { interactCapabilities } from './interact-control-catalogue.js';
import { parseScenePlan, planProblems, indexLists } from './interact-plan.js';
import { nativeDeclaration } from './interact-composition.js';

const { capabilities, plans } = await interactFixtures();
const clone = value => structuredClone(value);
const caps = await interactCapabilities({ renderers: ['spec', 'program'], stateful: true, componentControls: ['choice', 'bool', 'index', 'indices'], evidenceIds: ['kinematics_note'], inputsV2: true });
const list = n => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, label: `Step ${i + 1}` }));
const DYNAMIC = { by: 'moment', options: { before: list(2), top: list(3), after: list(2) } };

// The fixture's select ("moment": before / top / after) plus one index control.
const base = (items, c = caps) => {
  const plan = clone(plans.staticAdjustable), select = plan.controls[0];
  plan.controls = [select, {
    id: 'pick', label: 'Step', type: 'index', purpose: 'Step through the items.', selectionReason: 'Ordered items are a state choice.', nativeControlId: 'spec.index_picker', binding: { kind: 'input', id: 'pick' },
    default: 1, dataRef: 'rows', presentation: 'picker', items, affects: [{ scope: 'main', kind: 'entity', id: 'ball' }],
  }];
  plan.mode.adjustableIds = ['moment', 'pick']; plan.scene.checkpoints = [];
  plan.scene.runtime.catalogueHash = c.catalogueHash;
  return plan;
};
const refuses = (plan, code, pathPart, c = caps) => {
  const result = parseScenePlan(plan, c);
  assert.equal(result.ok, false, `expected ${code} at ${pathPart}`);
  assert.ok(result.problems.some(p => p.code === code && p.path.includes(pathPart)), `expected ${code} at ${pathPart}; got ${result.problems?.map(p => `${p.code}@${p.path}`).join(', ')}`);
};

test('static items are accepted as before, with or without inputs_v2', () => {
  assert.equal(parseScenePlan(base(list(3), capabilities), capabilities).ok, true);
  assert.equal(parseScenePlan(base(list(3)), caps).ok, true);
  assert.deepEqual(indexLists({ items: list(3) }).map(l => l.length), [3]);
});

test('dynamic items are accepted with inputs_v2 and the program declaration carries { by, options } unchanged', () => {
  const plan = base(DYNAMIC);
  assert.deepEqual(planProblems(plan), []);
  const result = parseScenePlan(plan, caps);
  assert.equal(result.ok, true, result.ok ? '' : result.problems.map(p => `${p.code}@${p.path}`).join(', '));
  assert.deepEqual(indexLists(plan.controls[1]).map(l => l.length), [2, 3, 2]);
  assert.deepEqual(nativeDeclaration(plan.controls[1], 'program').native.declaration.items, DYNAMIC, 'the manifest input keeps the plan shape');
});

test('dynamic items are refused without the inputs_v2 capability, at the control items path', () => {
  refuses(base(DYNAMIC, capabilities), 'capability_missing', 'controls.1.items', capabilities);
});

test('dynamic items: `by` must name a select input of the plan, the options exactly the select\'s values, 2 to 12 unique items per list, the default fits every list', () => {
  refuses(base({ ...DYNAMIC, by: 'nothing' }), 'dangling_reference', 'controls.1.items.by');
  refuses(base({ ...DYNAMIC, by: 'pick' }), 'dangling_reference', 'controls.1.items.by');
  refuses(base({ by: 'moment', options: { before: list(2), top: list(3) } }), 'options_incomplete', 'controls.1.items.options.after');
  refuses(base({ by: 'moment', options: { ...DYNAMIC.options, later: list(2) } }), 'options_unknown', 'controls.1.items.options.later');
  refuses(base({ by: 'moment', options: { ...DYNAMIC.options, top: list(1) } }), 'too_small', 'controls.1.items.options.top');
  refuses(base({ by: 'moment', options: { ...DYNAMIC.options, top: list(13) } }), 'too_large', 'controls.1.items.options.top');
  refuses(base({ by: 'moment', options: { ...DYNAMIC.options, top: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] } }), 'duplicate_id', 'controls.1.items.options.top');
  const pastShortest = base(DYNAMIC); pastShortest.controls[1].default = 2; // "before" and "after" have 2 items
  refuses(pastShortest, 'default_out_of_range', 'controls.1.default');
});
