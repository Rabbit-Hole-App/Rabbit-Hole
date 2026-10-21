// Show dimensions labels and the Quick edit draft store (cad-controls UI phase): which value is Requested, Assumed or
// Measured, that an edit's stale measurements never reach the labels, and that a draft survives a reload per revision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateControls } from './cad-parameters.js';
import { dimensionLabels } from './cad-dimensions.js';
import { draftInput, draftKey, readDraft, withDraft, writeDraft } from './cad-draft-store.js';

const plate = validateControls(JSON.parse(readFileSync(new URL('../../cad-execute/fixtures/plate-holes/design.json', import.meta.url), 'utf8')).brief.controls);
const values = Object.fromEntries(plate.parameters.filter(p => p.role === 'input').map(p => [p.id, p.value]));
const manifest = (revisionId = 'r1', controlsRevision = revisionId) => ({ revisionId,
  validation: { baselinePassed: true, geometry_units: 'mm', checks: [{ id: 'size_x', kind: 'bounds_mm', axis: 'x', status: 'passed', actual: 120 }, { id: 'size_z', kind: 'bounds_mm', axis: 'z', status: 'passed', actual: 5 }, { id: 'hole_d', kind: 'circular_diameter_mm', status: 'passed', actual: 6 }],
    facts: { bounds_mm: { x: 120, y: 40, z: 5 }, bounds_min_mm: [-60, -20, 0], bounds_max_mm: [60, 20, 5], circular_edges: [{ diameter_mm: 6, center_mm: [-30, 0, 5] }, { diameter_mm: 6, center_mm: [0, 0, 5] }] } },
  controls: { schema: 'cad-controls/1', revisionId: controlsRevision, definitions: plate, values, computed: {}, bindings: Object.keys(values) } });

test('dimension labels: measured extents with the input that requested or assumed them; one label per feature', () => {
  const { items, revisionId } = dimensionLabels(manifest());
  assert.equal(revisionId, 'r1');
  const by = Object.fromEntries(items.map(i => [i.key, i]));
  assert.deepEqual(Object.keys(by), ['axis:x', 'axis:y', 'axis:z', 'feature:hole_diameter'], 'two equal holes give one label');
  assert.deepEqual(by['axis:x'].input, { id: 'length', label: 'Length', value: 120, unit: 'mm', kind: 'requested' });
  assert.equal(by['axis:z'].input.kind, 'assumed', 'thickness was chosen by the brief');
  assert.equal(by['axis:y'].input, null, 'a size check without an axis maps no input; the measurement still shows');
  assert.equal(by['axis:y'].measured, 40);
  assert.deepEqual(by['axis:x'].point, [0, 0, 0.02], 'middle of the x edge along the minimum corner, in GLB metres');
  assert.deepEqual(by['feature:hole_diameter'].point, [-0.03, 0.005, -0]);
});

test('dimension labels: controls of another revision are stale, an unmeasured model says Not measured', () => {
  const stale = dimensionLabels(manifest('r2', 'r1'));
  assert.ok(stale.items.every(i => i.input === null), 'stale definitions never label a new revision');
  assert.ok(!stale.items.some(i => i.key.startsWith('feature:')));
  const none = dimensionLabels({ revisionId: 'r3', validation: { baselinePassed: false } });
  assert.equal(none.available, false); assert.equal(none.label, 'Not measured.'); assert.deepEqual(none.items, []);
});

test('draft store: typed text, per-revision keys, reload, and a value equal to the accepted one leaves the draft', () => {
  assert.equal(draftInput('length', '12.5'), 12.5); assert.equal(draftInput('count', '2.5'), 2.5);
  assert.equal(draftInput('length', ''), ''); assert.equal(draftInput('length', '12mm'), '12mm', 'kept as text so validation names it');
  assert.equal(draftInput('choice', 'two_holes'), 'two_holes'); assert.equal(draftInput('boolean', true), true);
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  const key = draftKey('org:me@x', 'card', 'r1');
  assert.notEqual(key, draftKey('org:me@x', 'card', 'r2')); assert.notEqual(key, draftKey('org:other@x', 'card', 'r1'));
  let draft = withDraft({}, 'hole_diameter', 9, 6); writeDraft(storage, key, draft);
  assert.deepEqual(readDraft(storage, key), { hole_diameter: 9 }, 'a reload reads the draft back');
  draft = withDraft(draft, 'hole_diameter', 6, 6); writeDraft(storage, key, draft);
  assert.equal(store.size, 0, 'back to the accepted value: nothing kept');
  store.set(key, '{broken'); assert.deepEqual(readDraft(storage, key), {});
  assert.deepEqual(readDraft({ getItem() { throw Error('blocked'); } }, key), {});
});
