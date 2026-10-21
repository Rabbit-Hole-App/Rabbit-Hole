// cad-params/1 validation and the control descriptors derived from it, over the five distinct fixture schemas the local
// executor also builds (packages/cad-execute/fixtures). Proves controls come from definitions, not ids or shapes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateControls, validateValues, structuralChange } from './cad-parameters.js';
import { quickEditModel } from './cad-quick-edit-model.js';
import { cadDimensions, glbPoint } from './cad-dimensions.js';

const fixture = name => JSON.parse(readFileSync(new URL(`../../cad-execute/fixtures/${name}/design.json`, import.meta.url), 'utf8'));
const controlsOf = name => validateControls(fixture(name).brief.controls);
const manifestFor = (controls, { bindings = controls.parameters.filter(p => p.role === 'input').map(p => p.id), computed = {}, checks = [], revisionId = 'r1', controlsRevision = revisionId } = {}) => ({
  revisionId, validation: { baselinePassed: true, geometry_units: 'mm', checks, facts: { bounds_mm: { x: 1, y: 2, z: 3 } } },
  controls: { schema: 'cad-controls/1', revisionId: controlsRevision, definitions: controls, values: Object.fromEntries(controls.parameters.filter(p => p.role === 'input').map(p => [p.id, p.value])), computed, bindings } });

test('each fixture schema validates and yields controls from its own definitions', () => {
  const controls = Object.fromEntries(['linked-cube', 'plate-holes', 'cylinder', 'bracket'].map(n => [n, quickEditModel(manifestFor(controlsOf(n)))]));
  const kinds = model => Object.fromEntries(model.parameters.map(p => [p.id, p.control]));
  assert.deepEqual(kinds(controls['linked-cube']), { edge: 'slider', face_diagonal: 'readonly' });
  assert.deepEqual(kinds(controls['plate-holes']), { length: 'number', width: 'number', thickness: 'number', hole_diameter: 'number', hole_count: 'integer', hole_spacing: 'number', edge_margin: 'readonly' });
  assert.equal(kinds(controls.cylinder).radius, 'slider');
  assert.equal(kinds(controls.bracket).mounting, 'select');
  assert.deepEqual(controls['plate-holes'].primary.map(p => p.id), ['length', 'width', 'thickness', 'hole_diameter'], 'priority orders, the rest go under More parameters');
  assert.deepEqual(controls['plate-holes'].more.map(p => p.id), ['hole_count', 'hole_spacing', 'edge_margin']);
  for (const [name, model] of Object.entries(controls)) {
    assert.equal(model.available, true);
    // An input the brief chose (assumed: true in its definition) is Assumed, never Requested.
    const defs = new Map(controlsOf(name).parameters.map(p => [p.id, p]));
    for (const p of model.parameters) assert.equal(p.provenance, p.role === 'computed' ? 'computed' : defs.get(p.id).assumed ? 'assumed' : 'requested');
  }
  assert.deepEqual(controls['plate-holes'].parameters.filter(p => p.provenance === 'assumed').map(p => p.id), ['thickness', 'hole_count', 'hole_spacing']);
});

test('the same definitions under other ids and labels give the same controls (no name recognition)', () => {
  const original = controlsOf('plate-holes');
  const renamed = structuredClone(fixture('plate-holes').brief.controls), id = old => `p${old.length}_${old.split('').reverse().join('')}`;
  for (const p of renamed.parameters) { p.id = id(p.id); p.label = `Parameter ${p.id}`; if (p.dependsOn) p.dependsOn = p.dependsOn.map(id); }
  for (const c of renamed.constraints) { c.left = id(c.left); c.right = id(c.right); }
  const shape = m => m.parameters.map(p => [p.control, p.unit, p.min, p.max, p.step]);
  assert.deepEqual(shape(quickEditModel(manifestFor(validateControls(renamed)))), shape(quickEditModel(manifestFor(original))));
});

test('missing units, bad bounds and invalid defaults are refused', () => {
  const base = fixture('cylinder').brief.controls;
  const variant = change => { const c = structuredClone(base); change(c); return () => validateControls(c); };
  assert.throws(variant(c => { delete c.parameters[0].unit; }), /explicit units/);
  assert.throws(variant(c => { c.parameters[0].unit = 'furlong'; }), /explicit units/);
  assert.throws(variant(c => { c.parameters[0].min = 50; c.parameters[0].max = 10; }), /min above max/);
  assert.throws(variant(c => { c.parameters[0].value = 1000; }), /at most/);
  assert.throws(variant(c => { c.parameters.push({ ...c.parameters[0] }); }), /unique/);
  assert.throws(variant(c => { c.parameters[2].dependsOn = ['nope']; }), /unknown input/);
  assert.throws(variant(c => { c.schema = 'other'; }), /cad-params\/1/);
  assert.throws(variant(c => { c.parameters[0].slider = true; delete c.parameters[0].max; }), /min and max for a slider/);
  const count = structuredClone(fixture('plate-holes').brief.controls);
  count.parameters.find(p => p.type === 'count').value = 2.5;
  assert.throws(() => validateControls(count), /whole number/);
  const broken = structuredClone(fixture('plate-holes').brief.controls);
  broken.parameters.find(p => p.id === 'hole_diameter').value = 50;
  assert.throws(() => validateControls(broken), /break a constraint|at most/);
});

test('edited values: types, bounds, choices, constraints, computed and unbound inputs', () => {
  const plate = controlsOf('plate-holes'), bound = plate.parameters.filter(p => p.role === 'input').map(p => p.id);
  assert.deepEqual(validateValues(plate, { hole_count: 4 }, { bound }).problems, []);
  assert.match(validateValues(plate, { hole_count: 2.5 }, { bound }).problems[0].message, /whole number/);
  assert.match(validateValues(plate, { width: '40' }, { bound }).problems[0].message, /number/);
  assert.match(validateValues(plate, { edge_margin: 3 }, { bound }).problems[0].message, /computed/);
  assert.match(validateValues(plate, { length: 100 }, { bound: ['width'] }).problems[0].message, /not bound/);
  const constraint = validateValues(plate, { hole_diameter: 20, width: 15 }, { bound }).problems;
  assert.equal(constraint[0].constraint, 'hole_fits_width');
  assert.match(constraint[0].message, /narrower than the plate.*Hole diameter must be less than Width/);
  const bracket = controlsOf('bracket'), all = bracket.parameters.filter(p => p.role === 'input').map(p => p.id);
  assert.match(validateValues(bracket, { mounting: 'three_holes' }, { bound: all }).problems[0].message, /listed choices/);
  assert.equal(validateValues(bracket, { hole_diameter: 29 }, { bound: all }).problems[0].constraint, 'hole_in_width', 'offset applies');
  const { values } = validateValues(bracket, { base_length: 90 }, { bound: all });
  assert.equal(values.base_length, 90); assert.equal(values.upright_height, 50, 'unrelated inputs carry over');
});

test('structural change is distinguished from a field edit', () => {
  const a = controlsOf('bracket'), b = structuredClone(a);
  b.parameters[0].label = 'Foot length'; b.parameters[0].value = 70;
  assert.equal(structuralChange(a, b), false);
  b.parameters[0].unit = 'in';
  assert.equal(structuralChange(a, b), true);
  const c = structuredClone(a); c.parameters.pop();
  assert.equal(structuralChange(a, c), true);
});

test('imported or legacy models get no pretend controls', () => {
  assert.equal(quickEditModel({ revisionId: 'r', parameters: { width: 10 }, validation: {} }).reason, 'no_controls');
  assert.equal(quickEditModel(null).available, false);
  const unbound = quickEditModel(manifestFor(controlsOf('linked-cube'), { bindings: [] }));
  assert.equal(unbound.available, false); assert.equal(unbound.reason, 'no_bindings');
  assert.ok(unbound.parameters.every(p => p.control === 'readonly'));
});

test('draft values stay apart from measured values; stale measurements are not shown', () => {
  const controls = controlsOf('linked-cube');
  const checks = [{ id: 'size_x', kind: 'bounds_mm', status: 'passed', actual: 20, expected: 20 }];
  const model = quickEditModel(manifestFor(controls, { checks }), { draft: { edge: 35 } });
  const edge = model.parameters.find(p => p.id === 'edge');
  assert.equal(edge.value, 20); assert.equal(edge.draft, 35);
  // kind (and axis, when the report gives one) say what was measured, so a value is not read as the parameter's own.
  assert.deepEqual(edge.measured, { status: 'passed', kind: 'bounds_mm', value: 20, expected: 20, unit: 'mm', checkId: 'size_x', revisionId: 'r1' });
  assert.equal(model.draft.canPreview, true);
  assert.deepEqual(model.request, { expectedRevisionId: 'r1', values: { edge: 35 } });
  assert.equal(quickEditModel(manifestFor(controls), { draft: { edge: 999 } }).draft.canPreview, false);
  const stale = quickEditModel(manifestFor(controls, { checks, controlsRevision: 'older' }));
  assert.equal(stale.parameters[0].measured.label, 'Not measured.');
  assert.equal(quickEditModel(manifestFor(controls)).parameters.find(p => p.id === 'face_diagonal').value, null, 'not reported is not invented');
});

test('dimension data: overall extents with anchors, feature diameters only when measured, GLB axes', () => {
  const plate = controlsOf('plate-holes');
  const manifest = manifestFor(plate, { checks: [{ id: 'hole_d', kind: 'circular_diameter_mm', status: 'passed', actual: 6 }, { id: 'size_x', kind: 'bounds_mm', status: 'passed', actual: 120 }] });
  Object.assign(manifest.validation.facts, { bounds_mm: { x: 120, y: 40, z: 5 }, bounds_min_mm: [-60, -20, -2.5], bounds_max_mm: [60, 20, 2.5], circular_edges: [{ diameter_mm: 6, center_mm: [-30, 0, 2.5] }, { diameter_mm: 120, center_mm: [0, 0, 0] }] });
  const dims = cadDimensions(manifest);
  assert.deepEqual(dims.overall[0], { axis: 'x', status: 'measured', value: 120, unit: 'mm', anchor: { from: [-60, -20, -2.5], to: [60, -20, -2.5] } });
  assert.deepEqual(dims.features, [{ parameterId: 'hole_diameter', kind: 'diameter', status: 'measured', value: 6, unit: 'mm', anchor: { center: [-30, 0, 2.5] } }]);
  assert.equal(cadDimensions({ revisionId: 'r', validation: { baselinePassed: false } }).label, 'Not measured.');
  const legacy = cadDimensions({ revisionId: 'r', validation: { baselinePassed: true, geometry_units: 'mm', checks: [{ id: 'hole_d', status: 'passed', actual: 6 }], facts: { bounds_mm: { x: 1, y: 2, z: 3 } } } });
  assert.equal(legacy.overall[0].anchor, null); assert.deepEqual(legacy.features, []);
  assert.deepEqual(glbPoint([10, 20, 30]), [0.01, 0.03, -0.02]);
});
