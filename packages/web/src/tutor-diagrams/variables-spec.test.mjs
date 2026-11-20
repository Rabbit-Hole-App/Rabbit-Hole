// The optional `variables` list of every diagram kind (spec.js): the parser accepts it everywhere, checks each entry, and no JSON schema a model is shown carries it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { authorJsonSchema, parseTutorDiagram, tutorDiagramAuthorJsonSchema, tutorDiagramJsonSchema, variablesJsonSchema } from './spec.js';

const gallery = JSON.parse(readFileSync(new URL('./kind-gallery.json', import.meta.url), 'utf8'));
const entry = (extra = {}) => ({ name: 'k', role: 'input', type: 'int', min: 1, max: 7, value: 2, ...extra });
const withVariables = (spec, variables) => ({ ...spec, diagram: { ...spec.diagram, variables } });

test('every kind of the gallery parses with a variables list and without one', () => {
  assert.ok(gallery.length >= 20, `${gallery.length} kinds`);
  for (const spec of gallery) {
    assert.ok(parseTutorDiagram(spec), spec.diagram.kind);
    const parsed = parseTutorDiagram(withVariables(spec, [entry(), entry({ name: 'r', role: 'result', at: 'title', value: undefined })]));
    assert.equal(parsed.diagram.variables.length, 2, spec.diagram.kind);
  }
});

test('a variable: a name, a role, a type, limits, and exactly one of at or value (a number or a list of numbers)', () => {
  const spec = gallery.find(item => item.diagram.kind === 'bar-chart');
  const refuses = (variables, why) => assert.throws(() => parseTutorDiagram(withVariables(spec, variables)), why);
  assert.ok(parseTutorDiagram(withVariables(spec, [entry({ value: [1, 2, 3] })])));
  assert.ok(parseTutorDiagram(withVariables(spec, [entry({ value: undefined, at: 'series.0.points.*.y' })])));
  refuses([entry({ at: 'title' })], /Give exactly one of at or value/);
  refuses([entry({ value: undefined })], /Give exactly one of at or value/);
  refuses([entry({ min: 5, max: 1 })], /min must not exceed max/);
  refuses([entry({ name: '1bad' })], /Use a short name/);
  refuses([entry({ name: 'has space' })], /Use a short name/);
  refuses([entry({ role: 'output' })], /./);
  refuses([entry({ type: 'string' })], /./);
  refuses([entry({ value: undefined, at: 'a..b' })], /Use a dot path/);
  refuses([entry({ extra: 1 })], /./);
  refuses([], /./);
  refuses(Array.from({ length: 9 }, (_, i) => entry({ name: `v${i}` })), /./);
  refuses([entry({ value: [] })], /./);
  refuses([entry({ value: Array.from({ length: 13 }, () => 1) })], /./);
});

test('no JSON schema a model is shown carries variables; variablesJsonSchema() is the one copy', () => {
  for (const schema of [tutorDiagramJsonSchema, tutorDiagramAuthorJsonSchema, authorJsonSchema()]) assert.equal(JSON.stringify(schema).includes('"variables"'), false);
  const schema = variablesJsonSchema();
  assert.equal(schema.type, 'array');
  assert.deepEqual([schema.minItems, schema.maxItems], [1, 8]);
  assert.deepEqual(schema.items.required, ['name', 'role', 'type', 'min', 'max']);
  assert.deepEqual(schema.items.properties.role.enum, ['input', 'result']);
  assert.deepEqual(schema.items.properties.type.enum, ['int', 'float']);
  const value = schema.items.properties.value;
  assert.equal(value.anyOf.length, 2, 'value is a number or a list of numbers');
  assert.equal(value.anyOf[0].type, 'number');
  assert.equal(value.anyOf[1].type, 'array');
  assert.equal(value.anyOf[1].items.type, 'number');
});
