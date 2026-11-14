import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const depths = { overview: 'brief', standard: 'balanced', deep: 'detailed' };
const subjects = ['merge-sort', 'tcp-handshake', 'mitosis'];
const fixtures = await Promise.all(Object.entries(depths).flatMap(([prefix, depth]) => subjects.map(async subject => {
  const name = `${prefix}-stepper-${subject}.composition.json`;
  const composition = JSON.parse(await readFile(new URL(`../../../docs/features/interact/references/${name}`, import.meta.url), 'utf8'));
  const html = await readFile(new URL(`../../../docs/features/interact/references/${name.replace('.composition.json', '.html')}`, import.meta.url), 'utf8');
  const scene = JSON.parse(html.match(/<script id="scene-model">const Scene = ([\s\S]*?);<\/script>/)[1]);
  return { name, subject, prefix, depth, composition, scene };
})));
const api = await import('./interact-stepper-data.js');

// These assertions catch stale or edited production constants against the independently stored owner-approved companions.
for (const fixture of fixtures) {
  test(`${fixture.name}: family data and both decoder paths preserve the approved companion`, () => {
    const { subject, prefix, depth, composition } = fixture;
    assert.deepEqual(api.referenceComposition(subject, depth), composition);
    assert.deepEqual(api.referenceComposition(composition.canonical, prefix), composition);
    const before = structuredClone(composition);
    const packet = api.packComposition(composition);
    const wire = JSON.parse(JSON.stringify(packet));
    assert.deepEqual(api.unpackComposition(wire), composition);
    assert.deepEqual(api.decodeComposition(wire), composition);
    const guest = runInNewContext(`JSON.stringify((${api.compositionDecoderSource})(${api.compositionSourceData(composition)}))`);
    assert.deepEqual(JSON.parse(guest), composition);
    assert.deepEqual(composition, before);
  });
}

// Card words come independently from the actual HTML Scene model, rather than the composition's aha observation.
for (const { name, subject, prefix, depth, composition, scene } of fixtures) {
  test(`${name}: host card words match the approved HTML Scene model`, () => {
    const expected = {
      title: scene.title, story: scene.concept, cardDescription: scene.concept,
      instructions: scene.instructions, heading: scene.heading,
    };
    assert.deepEqual(api.referenceCardWords(subject, depth), expected);
    assert.deepEqual(api.referenceCardWords(composition.canonical, prefix), expected);
    const changed = api.referenceCardWords(subject, depth);
    changed.title = 'changed';
    assert.deepEqual(api.referenceCardWords(subject, depth), expected);
  });
}

test('canonical subjects come from the three admitted companions and are not extended by aliases', () => {
  const approved = subjects.map(subject => fixtures.find(f => f.subject === subject).composition.canonical);
  assert.deepEqual(api.canonicalIds, approved);
  assert(Object.isFrozen(api.canonicalIds));
  assert.throws(() => api.referenceComposition('rag', 'balanced'), RangeError);
  assert.throws(() => api.referenceComposition('mitosis', 'future'), RangeError);
  assert.throws(() => api.referenceCardWords('rag', 'balanced'), RangeError);
  assert.throws(() => api.referenceCardWords('mitosis', 'future'), RangeError);
});

test('reference and decoder results are independent JSON trees even when packet nodes are shared', () => {
  const original = fixtures.find(f => f.subject === 'mitosis' && f.depth === 'detailed').composition;
  const one = api.referenceComposition('mitosis', 'detailed');
  const two = api.referenceComposition('mitosis', 'detailed');
  const expected = structuredClone(original);
  one.data.variants[0].regions[0].label = 'changed';
  assert.deepEqual(two, expected);
  assert.deepEqual(api.referenceComposition('mitosis', 'detailed'), expected);
  const decoded = api.unpackComposition(api.packComposition({ first: { label: 'same' }, second: { label: 'same' } }));
  decoded.first.label = 'changed';
  assert.equal(decoded.second.label, 'same');
});

test('packing is deterministic for equivalent JSON objects and packets stay below the source budget', () => {
  for (const { name, composition } of fixtures) {
    const reverseKeys = value => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)])) : value;
    const packet = api.packComposition(composition);
    assert.deepEqual(api.packComposition(reverseKeys(composition)), packet, name);
    assert.equal(api.compositionSourceData(composition), JSON.stringify(packet), name);
    assert(Buffer.byteLength(JSON.stringify(packet)) < 9 * 1024, name);
    assert(Buffer.byteLength(JSON.stringify(packet)) < Buffer.byteLength(JSON.stringify(composition)), name);
  }
});

test('interning preserves scalar types, punctuation, Unicode, special object keys and signed zero', () => {
  const composition = JSON.parse('{"__proto__":{"name":"ordinary data"},"constructor":"constructor","values":[1,"1",false,true,null,0,-0,1.5,"\\\"\\n\\u2028🧬",[],{}]}');
  const packet = JSON.parse(JSON.stringify(api.packComposition(composition)));
  const decoded = api.unpackComposition(packet);
  assert.deepEqual(decoded, composition);
  assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
  assert.equal(Object.prototype.name, undefined);
  assert(Object.hasOwn(decoded, '__proto__'));
  assert(Object.is(decoded.values[6], -0));
});

test('packing refuses non-JSON values and cyclic input instead of changing their meaning', () => {
  const cycle = {}; cycle.self = cycle;
  for (const value of [undefined, NaN, Infinity, () => 1, Symbol('x'), new Date(), { value: undefined }, [undefined], Array(1), cycle]) {
    assert.throws(() => api.packComposition(value), TypeError);
  }
});

test('host decoding rejects malformed packet shapes, types and references', () => {
  const bad = [
    null, {}, [], [2, [], [], [], null],
    [1, ['x'], [], [], -2], [1, [null], [], [], null],
    [1, ['x'], [[-1, -1]], [], null],
    [1, ['x'], [[0]], [], null],
    [1, [], [], [[0, 0]], 0],
    [1, [], [], [[0, 1], [0]], 0],
    [1, [], [], [[1]], 0],
    [1, ['x'], [[-1]], [[1]], 0],
    [1, [], [], [[0, 'untyped string']], 0],
    [1, [], [], [[0, [1, 2]]], 0],
    [1, [], [], [[0, [NaN]]], 0],
    [1, [], [], [[0, {}]], 0],
  ];
  for (const packet of bad) assert.throws(() => api.unpackComposition(packet), TypeError);
});

test('host decoding bounds table size, nesting, expanded values and expanded text before allocation', () => {
  assert.throws(() => api.unpackComposition([1, Array(8193).fill('x'), [], [], null]), TypeError);
  assert.throws(() => api.unpackComposition([1, ['x'.repeat(1024 * 1024 + 1)], [], [], -1]), TypeError);
  const deep = [[0]];
  for (let i = 0; i < 129; i++) deep.push([0, i]);
  assert.throws(() => api.unpackComposition([1, [], [], deep, deep.length - 1]), TypeError);
  const wide = [[0]];
  for (let i = 0; i < 30; i++) wide.push([0, i, i]);
  assert.throws(() => api.unpackComposition([1, [], [], wide, wide.length - 1]), TypeError);
  const text = ['x'.repeat(1024)];
  const repeated = [[0, ...Array(1025).fill(-1)]];
  assert.throws(() => api.unpackComposition([1, text, [], repeated, 0]), TypeError);
});

// Frame fixtures use the same typed data format without acquiring composition semantics.
test('generic value aliases preserve frame-like tables and scalar roots with the same codec', () => {
  const table = fixtures.map(({ composition }) => ({ id: composition.id, states: composition.data.variants.map(v => v.states) }));
  for (const value of [table, null, true, false, 1.5, -0, '', 'data']) {
    assert.deepEqual(api.unpackValue(JSON.parse(JSON.stringify(api.packValue(value)))), value);
  }
});

test('packing refuses an over-budget packet instead of returning data the host cannot decode', () => {
  const value = Array.from({ length: 200 }, (_, row) => Object.fromEntries(
    Array.from({ length: 300 }, (_, column) => [`field-${row + column}`, column]),
  ));
  assert.throws(() => api.packValue(value), TypeError);
});
