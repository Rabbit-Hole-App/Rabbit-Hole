import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTRACT_LIMITS } from './explain-program/contract.js';
import { CONTROL_TYPES, getInteractControlCatalogue, interactCapabilities } from './interact-control-catalogue.js';
import { interactFixtures } from './interact-plan-fixtures.js';
import { parseScenePlan } from './interact-plan.js';

const ids = catalogue => catalogue.map(d => d.id);
const types = (catalogue, renderer) => new Set(catalogue.filter(d => d.renderer === renderer).map(d => d.semanticType));
const ALL_COMPONENTS = ['choice', 'bool', 'index', 'indices'];

test('descriptors carry the specified fields and are frozen', () => {
  const catalogue = getInteractControlCatalogue({ renderers: ['spec', 'program'], stateful: true, componentControls: ALL_COMPONENTS });
  assert.ok(Object.isFrozen(catalogue));
  for (const d of catalogue) {
    assert.deepEqual(Object.keys(d).sort(), ['id', 'limits', 'nativeType', 'presentation', 'purposeHint', 'renderer', 'requires', 'semanticType']);
    assert.ok(CONTROL_TYPES.includes(d.semanticType));
    assert.ok(d.id.startsWith(`${d.renderer}.`));
    assert.ok(Object.isFrozen(d));
  }
  assert.equal(new Set(ids(catalogue)).size, catalogue.length, 'ids are unique');
});

test('Boolean and multi-select are refused on program-only profiles', () => {
  const program = getInteractControlCatalogue({ renderers: ['program'], stateful: true, componentControls: ALL_COMPONENTS });
  const offered = types(program, 'program');
  for (const missing of ['boolean', 'multi_select', 'index']) assert.equal(offered.has(missing), false, `${missing} is not wired on the program renderer`);
  assert.equal(program.some(d => d.renderer === 'spec'), false, 'a disabled renderer contributes nothing');
  assert.deepEqual([...offered].sort(), ['action', 'number', 'playback', 'reset', 'scrubber', 'select', 'target']);

  // And the plan validator refuses them: componentControls cannot make a program scene gain a Boolean switch.
  const spec = getInteractControlCatalogue({ renderers: ['spec'], componentControls: ALL_COMPONENTS });
  assert.equal(types(spec, 'spec').has('boolean'), true);
  assert.equal(types(spec, 'spec').has('multi_select'), true);
});

test('index is a discrete state choice and never a continuous number slider', () => {
  const spec = getInteractControlCatalogue({ renderers: ['spec'], componentControls: ALL_COMPONENTS });
  assert.equal(types(spec, 'spec').has('number'), false, 'the declarative generic slider is an index slider, not a number slider');
  const index = spec.filter(d => d.semanticType === 'index');
  assert.deepEqual(index.map(d => d.presentation).sort(), ['picker', 'slider']);
  assert.ok(index.every(d => d.nativeType === 'index' && d.limits.maxItems === 256));
  const program = getInteractControlCatalogue({ renderers: ['program'] });
  const number = program.find(d => d.semanticType === 'number');
  assert.equal(number.nativeType, 'number');
  assert.equal(number.presentation, 'slider');
  assert.deepEqual(number.requires, ['number_inputs']);
  assert.equal(program.some(d => d.semanticType === 'index'), false);
});

test('stateful actions and targets exist only when the stateful program is enabled', () => {
  const off = getInteractControlCatalogue({ renderers: ['program'], stateful: false });
  assert.equal(off.some(d => d.semanticType === 'action' || d.semanticType === 'target'), false);
  assert.equal(off.some(d => d.requires.includes('stateful')), false);
  const on = getInteractControlCatalogue({ renderers: ['program'], stateful: true });
  const action = on.find(d => d.id === 'program.action'), target = on.find(d => d.id === 'program.target');
  assert.equal(action.limits.maxControls, CONTRACT_LIMITS.actions);
  assert.equal(target.limits.maxControls, CONTRACT_LIMITS.targets);
  assert.equal(target.limits.drag, true);
  assert.deepEqual(action.requires, ['stateful']);
  const spec = getInteractControlCatalogue({ renderers: ['spec'], stateful: true, componentControls: ALL_COMPONENTS });
  assert.equal(spec.some(d => d.semanticType === 'action' || d.semanticType === 'target'), false, 'the declarative renderer has no program-style action event');
});

test('component declarations decide which declarative widgets are offered, with their actual domain limits', () => {
  assert.deepEqual([...types(getInteractControlCatalogue({ renderers: ['spec'] }), 'spec')].sort(), ['playback', 'reset', 'scrubber'], 'a widget no component declares is not offered');
  const some = getInteractControlCatalogue({ renderers: ['spec'], componentControls: ['choice', 'index'] });
  assert.deepEqual([...types(some, 'spec')].sort(), ['index', 'playback', 'reset', 'scrubber', 'select']);
  const limited = getInteractControlCatalogue({ renderers: ['spec'], componentControls: { choice: { maxOptions: 5 }, index: { maxItems: 12 }, indices: { maxItems: 1000 } } });
  assert.equal(limited.find(d => d.id === 'spec.select').limits.maxOptions, 5);
  assert.equal(limited.find(d => d.id === 'spec.index_picker').limits.maxItems, 12);
  assert.equal(limited.find(d => d.id === 'spec.multi_select').limits.maxItems, 256, 'never above the plan cap of 256');
  assert.equal(getInteractControlCatalogue({ renderers: ['spec'], componentControls: { choice: { maxOptions: 99 } } }).find(d => d.id === 'spec.select').limits.maxOptions, CONTRACT_LIMITS.options);
  assert.throws(() => getInteractControlCatalogue({ renderers: ['spec'], componentControls: ['vec2'] }), /not a declarative input type/);
});

test('program limits reuse the runtime contract limits', () => {
  const program = getInteractControlCatalogue({ renderers: ['program'] });
  const select = program.find(d => d.id === 'program.select');
  assert.equal(select.limits.maxOptions, CONTRACT_LIMITS.options);
  assert.equal(select.limits.maxCombinations, CONTRACT_LIMITS.optionCombinations);
  assert.equal(select.limits.maxControls, CONTRACT_LIMITS.inputs);
  assert.equal(program.find(d => d.id === 'program.number').limits.maxControls, CONTRACT_LIMITS.inputs);
});

test('valid native ids are the only ids a plan may use', async () => {
  const { capabilities, plans } = await interactFixtures();
  const offered = new Set(ids(capabilities.catalogue));
  for (const [name, plan] of Object.entries(plans)) {
    for (const control of plan.controls) assert.ok(offered.has(control.nativeControlId), `${name}: ${control.nativeControlId}`);
  }
  const invented = structuredClone(plans.deep); invented.controls[2].nativeControlId = 'program.range_slider';
  assert.equal(parseScenePlan(invented, capabilities).problems[0].code, 'unknown_native_control');
});

test('the catalogue rejects bad inputs and the capabilities bundle binds a hash', async () => {
  assert.throws(() => getInteractControlCatalogue({}), /enabled renderers/);
  assert.throws(() => getInteractControlCatalogue({ renderers: [] }), /enabled renderers/);
  assert.throws(() => getInteractControlCatalogue({ renderers: ['three'] }), /unknown renderer/);
  const a = await interactCapabilities({ renderers: ['program'] });
  const b = await interactCapabilities({ renderers: ['program'], stateful: true });
  assert.match(a.catalogueHash, /^[0-9a-f]{64}$/);
  assert.notEqual(a.catalogueHash, b.catalogueHash, 'a different enabled set is a different catalogue');
  assert.equal((await interactCapabilities({ renderers: ['program'] })).catalogueHash, a.catalogueHash);
});

// Drift guard: the catalogue is a claim about what the audited components wire. If a widget is added or removed there, this fails
// and the catalogue must be revisited (never expose a widget that is not wired, never hide one that is).
test('the catalogue matches the widgets the source actually wires', () => {
  const controls = readFileSync(new URL('./SceneControls.jsx', import.meta.url), 'utf8');
  const registry = controls.match(/const WIDGETS = \{([^}]*)\}/)[1];
  assert.deepEqual([...registry.matchAll(/(\w+):/g)].map(m => m[1]).sort(), ['bool', 'choice', 'index', 'indices']);
  assert.match(controls, /declaration\.presentation === 'slider' \? IndexSlider/);
  const program = readFileSync(new URL('./explain-program/ProgramScene.jsx', import.meta.url), 'utf8');
  for (const marker of ['function NumberInput', 'data-program-action', 'data-program-target', 'data-scene-reset', 'data-animation-play']) assert.ok(program.includes(marker), marker);
  assert.equal(/BoolToggle|IndexPicker|IndicesMarks/.test(program), false, 'ProgramScene wires no Boolean, index or multi-select widget');
});
