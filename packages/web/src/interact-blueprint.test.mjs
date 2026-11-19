import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { BUILT, FULL_SCHEMA, BUILT_SCHEMA, LIMITS, parseBlueprint, providerSchema, quantitiesProviderSchema } from './interact-blueprint.js';

// Brief 38 step 2: the code's schema against the reference schema (docs/features/interact/interactive-blueprint.schema.json), and the BUILT subset.
const require = createRequire(import.meta.url), Ajv = require('ajv/dist/2020');
const DOCS = new URL('../../../docs/features/interact/', import.meta.url), read = name => JSON.parse(readFileSync(new URL(name, DOCS), 'utf8'));
const reference = new Ajv({ strict: false }).compile(read('interactive-blueprint.schema.json'));
const examples = read('interactive-blueprint-examples.json'), broken = read('interactive-blueprint-broken.json');
const accepts = { reference: value => reference(value), full: value => FULL_SCHEMA.safeParse(value).success, built: value => BUILT_SCHEMA.safeParse(value).success };
const copy = value => structuredClone(value);

test('the code\'s full schema and the reference schema accept the same seven examples', () => {
  assert.deepEqual(Object.keys(examples), ['pendulum', 'throw', 'softmax', 'attention', 'descent', 'sorting', 'tokenizer']);
  for (const [name, blueprint] of Object.entries(examples)) { assert.equal(accepts.reference(blueprint), true, `reference, ${name}`); assert.equal(accepts.full(blueprint), true, `full, ${name}: ${JSON.stringify(parseBlueprint(blueprint, FULL_SCHEMA).issues?.[0])}`); }
});

test('both refuse each of the twelve broken copies of the pendulum example', () => {
  assert.equal(Object.keys(broken).length, 12);
  for (const [name, blueprint] of Object.entries(broken)) { assert.equal(accepts.reference(blueprint), false, `reference, ${name}`); assert.equal(accepts.full(blueprint), false, `full, ${name}`); }
});

test('the BUILT schema takes the two examples that use only built options (pendulum, thrown ball) and refuses the five that use a named one', () => {
  for (const name of ['pendulum', 'throw']) assert.equal(parseBlueprint(examples[name]).ok, true, name);
  for (const name of ['softmax', 'attention', 'descent', 'sorting', 'tokenizer']) assert.equal(parseBlueprint(examples[name]).ok, false, name);
  for (const blueprint of Object.values(broken)) assert.equal(accepts.built(blueprint), false);
});

// Every limit in LIMITS: a form at the limit is accepted and one past it refused, by the reference and the code alike. [path in the pendulum example, limit]
const edit = (path, value) => { const blueprint = copy(examples.pendulum); let at = blueprint; for (const key of path.slice(0, -1)) at = at[key]; at[path.at(-1)] = value; return blueprint; };
const text = (n, c = 'a') => c.repeat(n);
const LIMITED_TEXTS = [
  [['relationship', 'statement'], LIMITS.statement], [['relationship', 'formula'], LIMITS.formula], [['relationship', 'assumptions', 0], LIMITS.assumption],
  [['quantities', 0, 'label'], LIMITS.quantityLabel], [['quantities', 0, 'unit'], LIMITS.quantityUnit], [['quantities', 0, 'meaning'], LIMITS.meaning],
  [['things', 0, 'label'], LIMITS.thingLabel], [['inputs', 0, 'label'], LIMITS.inputLabel], [['inputs', 0, 'unit'], LIMITS.inputUnit],
  [['time', 'label'], LIMITS.timeLabel], [['time', 'unit'], LIMITS.timeUnit], [['math', 'outputs', 0, 'unit'], LIMITS.outputUnit], [['math', 'outputs', 0, 'meaning'], LIMITS.meaning],
  [['pictures', 'main', 'unit'], LIMITS.pictureUnit], [['pictures', 'main', 'parts', 1, 'id'], LIMITS.id],
  [['pictures', 'panel', 'title'], LIMITS.title], [['pictures', 'panel', 'x', 'label'], LIMITS.axisLabel], [['pictures', 'panel', 'x', 'unit'], LIMITS.axisUnit],
  [['pictures', 'panel', 'y', 'label'], LIMITS.axisLabel], [['pictures', 'panel', 'y', 'unit'], LIMITS.axisUnit], [['pictures', 'panel', 'series', 0, 'label'], LIMITS.seriesLabel],
  [['values', 0, 'label'], LIMITS.valueLabel], [['values', 0, 'unit'], LIMITS.valueUnit], [['explanation', 'cases', 0, 'text'], LIMITS.line], [['explanation', 'otherwise'], LIMITS.line],
  [['lesson', 'title'], LIMITS.lessonTitle], [['lesson', 'description'], LIMITS.description[1]], [['lesson', 'instructions'], LIMITS.instructions], [['lesson', 'goal'], LIMITS.goal],
];
test('every told text limit is the same in the code and in the reference: a text at the limit is accepted, one character over is refused, by both', () => {
  for (const [path, max] of LIMITED_TEXTS) {
    const id = path.at(-1) === 'id', at = text(max, id ? 'x' : 'a'), over = text(max + 1, id ? 'x' : 'a');
    assert.deepEqual([accepts.reference(edit(path, at)), accepts.full(edit(path, at))], [true, true], `at ${path.join('.')} = ${max}`);
    assert.deepEqual([accepts.reference(edit(path, over)), accepts.full(edit(path, over))], [false, false], `over ${path.join('.')} = ${max}`);
  }
  // the description has a least length as well
  assert.deepEqual([accepts.reference(edit(['lesson', 'description'], text(LIMITS.description[0] - 1))), accepts.full(edit(['lesson', 'description'], text(LIMITS.description[0] - 1)))], [false, false]);
});

test('counts are the same in the code and in the reference: controls, values, claims, quantities, things, explanation lines, parts and series', () => {
  const grow = (list, n) => { const out = []; while (out.length < n) out.push(copy(list[out.length % list.length])); return out; };
  const bounds = [[['inputs'], LIMITS.inputs], [['values'], LIMITS.values], [['claims'], LIMITS.claims], [['quantities'], LIMITS.quantities], [['things'], LIMITS.things], [['explanation', 'cases'], LIMITS.cases], [['pictures', 'panel', 'series'], LIMITS.series], [['math', 'outputs'], LIMITS.outputs], [['pictures', 'main', 'parts'], LIMITS.parts]];
  for (const [path, [min, max]] of bounds) {
    let list = examples.pendulum; for (const key of path) list = list[key];
    for (const [n, expected] of [[max, true], [max + 1, false], [min - 1, min === 0 ? true : false]]) {
      if (n < 0) continue;
      const blueprint = edit(path, grow(list, n)); assert.deepEqual([accepts.reference(blueprint), accepts.full(blueprint)], [expected, expected], `${path.join('.')} with ${n}`);
    }
  }
  const lines = n => edit(['explanation', 'always'], Array.from({ length: n }, () => 'a line')); // 0 to 3
  assert.deepEqual([3, 4].map(n => accepts.full(lines(n))), [true, false]); assert.deepEqual([3, 4].map(n => accepts.reference(lines(n))), [true, false]);
});

test('claims.at is a list of { input, value } of 1 to 3 entries, not an open map', () => {
  const claim = at => ({ type: 'equal', value: 'periodB', to: 'periodA', at });
  const withAt = at => { const blueprint = copy(examples.pendulum); blueprint.claims[3] = claim(at); return blueprint; };
  for (const [at, expected] of [[[{ input: 'lengthB', value: 1 }], true], [[], false], [{ lengthB: 1 }, false], [[{ input: 'a', value: 1 }, { input: 'b', value: 2 }, { input: 'c', value: 3 }, { input: 'd', value: 4 }], false], [[{ input: 'lengthB' }], false]])
    assert.deepEqual([accepts.reference(withAt(at)), accepts.full(withAt(at)), accepts.built(withAt(at))], [expected, expected, expected], JSON.stringify(at));
});

test('the provider schema is the form restricted to BUILT, its fields in the form\'s order, and names no option that is only named', () => {
  const json = providerSchema(), order = ['version', 'relationship', 'quantities', 'things', 'inputs', 'time', 'math', 'pictures', 'values', 'explanation', 'layout', 'claims', 'lesson'];
  assert.deepEqual(Object.keys(json.properties), order); assert.deepEqual(json.required, order); assert.equal(json.additionalProperties, false);
  assert.deepEqual(Object.keys(json.properties.relationship.properties), ['statement', 'formula', 'assumptions']);
  const text = JSON.stringify(json);
  for (const named of ['"index"', '"steps"', '"textList"', '"grid"', '"sweeps"', '"textFrom"', '"rect"', '"curve"', '"sumsTo"', '"between"', '"holds"', '"atTime"', '"scatter"', '"bar-chart"', '"heatmap"', '"token-links"', '"range"'])
    assert.equal(text.includes(named), false, `${named} is in the provider schema`);
  for (const built of ['"number"', '"select"', '"boolean"', '"continuous"', '"flag"', '"line"', '"dot"', '"arrow"', '"trace"', '"label"', '"coordinate-plot"', '"unchanged"', '"increases"', '"decreases"', '"equal"'])
    assert.equal(text.includes(built), true, `${built} is missing from the provider schema`);
  assert.equal(JSON.stringify(json.properties.time).includes('"none"'), false); // "none" is also a layout answer, so the time mode is looked at alone
  assert.deepEqual(BUILT.parts, ['line', 'dot', 'arrow', 'trace', 'label']);
  assert.deepEqual(Object.keys(quantitiesProviderSchema().properties), ['relationship', 'quantities']);
});
