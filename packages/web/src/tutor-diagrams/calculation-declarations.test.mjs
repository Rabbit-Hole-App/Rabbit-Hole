// Merge check of the same-JSON change set: a reference whose stored diagram holds a number must say how its numbers come about (a calculation, or "none needed"), a reference that declares a function stores
// exactly what the function gives, and every stored diagram still parses. calculation-undeclared.json is the frozen list of the references that had numbers and declared nothing when the change set landed: it
// only gets shorter (a reference that declares is removed from it; an id is never added).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fillDiagramText, hasFunction, isDeclared, runCalculation, unfilledNumbers } from './calculation.js';
import { diagramReferences } from './reference-library.js';
import { parseTutorDiagram } from './spec.js';

const frozen = JSON.parse(readFileSync(new URL('./calculation-undeclared.json', import.meta.url), 'utf8'));
const listed = new Set(frozen.ids);

// Any number in the diagram other than the variables list (a number written inside a text does not count: the numeric fields are the figure's data).
const hasNumber = (node, key = '') => {
  if (key === 'variables') return false;
  if (typeof node === 'number') return true;
  if (Array.isArray(node)) return node.some(item => hasNumber(item, key));
  return node !== null && typeof node === 'object' && Object.entries(node).some(([name, item]) => hasNumber(item, name));
};
// Every stored spec of a reference: its spec, its detail spec, each depth's spec and detail spec (its template too, when it has one).
const storedSpecs = reference => [
  ['spec', reference.spec], ['detailSpec', reference.detailSpec], ['template', reference.template],
  ...Object.entries(reference.depths ?? {}).flatMap(([depth, entry]) => [[`depths.${depth}.spec`, entry.spec], [`depths.${depth}.detailSpec`, entry.detailSpec], [`depths.${depth}.template`, entry.template]]),
].filter(([, spec]) => spec?.diagram);
const hasNumbers = reference => storedSpecs(reference).some(([path, spec]) => !path.endsWith('template') && hasNumber(spec.diagram));
const byId = new Map(diagramReferences.map(reference => [reference.id, reference]));

test('the four references of the change set declare: two with a function, two that need none (top-k is parked, docs/features/explain/parked.md)', () => {
  const declared = new Set(diagramReferences.filter(isDeclared).map(ref => ref.id)), withFunction = new Set(diagramReferences.filter(hasFunction).map(ref => ref.id));
  for (const id of ['regression-mean-baseline', 'softmax-probabilities']) assert.ok(withFunction.has(id), `${id} has a function`);
  for (const id of ['confusion-matrix-counts', 'ml-self-attention-token-links']) assert.ok(declared.has(id) && !withFunction.has(id), `${id} declares none needed`);
  assert.deepEqual([...declared].sort(), ['confusion-matrix-counts', 'ml-self-attention-token-links', 'regression-mean-baseline', 'softmax-probabilities'], 'four declared references in all');
  assert.equal(declared.has('ml-sampling-top-k'), false, 'top-k declares nothing while it is parked');
});

test('a reference whose stored diagram holds a number declares its calculation, or its id is on the frozen list', () => {
  const missing = diagramReferences.filter(ref => hasNumbers(ref) && !isDeclared(ref) && !listed.has(ref.id)).map(ref => ref.id);
  assert.deepEqual(missing, [], `declare a calculation (a function, or calculation: { none: true }) for: ${missing.join(', ')}. Never add an id to calculation-undeclared.json.`);
});

test('the frozen list holds real reference ids, once each, sorted, and only references that do not declare (the list only gets shorter)', () => {
  assert.ok(Array.isArray(frozen.ids) && frozen.ids.length > 0 && typeof frozen.note === 'string');
  assert.equal(listed.size, frozen.ids.length, 'no id twice');
  assert.deepEqual([...frozen.ids], [...frozen.ids].sort(), 'sorted');
  const unknown = frozen.ids.filter(id => !byId.has(id));
  assert.deepEqual(unknown, [], `not a reference id: ${unknown.join(', ')}`);
  const declared = frozen.ids.filter(id => isDeclared(byId.get(id)));
  assert.deepEqual(declared, [], `these now declare: remove them from calculation-undeclared.json: ${declared.join(', ')}`);
  const noNumbers = frozen.ids.filter(id => !hasNumbers(byId.get(id)));
  assert.deepEqual(noNumbers, [], `these hold no number any more: remove them from calculation-undeclared.json: ${noNumbers.join(', ')}`);
});

// Every spec (and depth spec) of a reference with a function: running the function on the stored spec gives exactly the stored results, and filling the template with them gives the stored spec.
for (const reference of diagramReferences.filter(hasFunction)) {
  test(`${reference.id}: the stored numbers are what the function gives, in the spec and in every depth`, () => {
    const holders = [['spec', reference], ...Object.entries(reference.depths ?? {}).map(([depth, entry]) => [`depths.${depth}`, entry])];
    assert.ok(holders.length >= 1);
    for (const [path, holder] of holders) {
      const stored = holder.spec.diagram, run = runCalculation(stored, reference.calculation);
      assert.equal(run.problem, undefined, `${path}: ${run.problem}`);
      assert.deepEqual(run.overwritten, [], `${path}: the function changes ${run.overwritten.join(', ')}`);
      assert.deepEqual(run.diagram, stored, `${path}: the function's diagram is the stored one`);
      assert.deepEqual(unfilledNumbers(stored), [], `${path}: no "?" for a number`);
      assert.equal(JSON.stringify(stored).includes('{{v:'), false, `${path}: no placeholder left in the stored spec`);
      if (holder.template) {
        const template = runCalculation(holder.template.diagram, reference.calculation);
        assert.deepEqual(template.overwritten, [], `${path} template: its numbers are the function's`);
        assert.deepEqual(fillDiagramText(template.diagram, template.values).diagram, stored, `${path}: the template filled is the stored spec`);
      }
    }
  });
}

// Every stored diagram of every reference parses with the parser the app uses.
const everySpec = diagramReferences.flatMap(reference => storedSpecs(reference).map(([path, spec]) => ({ id: reference.id, path, spec })));
test(`every stored diagram JSON of every reference parses (${everySpec.length} specs in ${diagramReferences.length} references)`, () => {
  assert.ok(everySpec.length > 0, 'the library is empty or unreadable');
  const failed = [];
  for (const { id, path, spec } of everySpec) { try { parseTutorDiagram(spec); } catch (error) { failed.push(`${id} ${path}: ${String(error.message).slice(0, 80)}`); } }
  assert.deepEqual(failed, [], `${everySpec.length} stored diagrams: ${failed.length} do not parse`);
});
