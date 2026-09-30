import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceInputs, validateInputDeclarations } from './scene-inputs.js';

// The typed learning-input contract (spec: rabbit-hole interactive visuals v2,
// T01). Two separate gates with opposite failure modes: authored declarations
// THROW with an actionable message, raw learner/persisted values NEVER throw -
// they normalise deterministically to something the declaration allows.

const DATA = {
  tokens: ['river', 'flows', 'south', 'today'],
  patches: Array.from({ length: 16 }, (_, i) => [i]),
};

const DECLS = [
  { name: 'queryIndex', type: 'index', label: 'Query token', of: 'tokens', default: 0 },
  { name: 'maskEnabled', type: 'bool', label: 'Causal mask', default: true },
  { name: 'candidate', type: 'choice', label: 'Candidate', options: [{ id: 'A', label: 'Path A' }, { id: 'B', label: 'Path B' }, { id: 'C', label: 'Path C' }], default: 'A' },
  { name: 'answerPositions', type: 'indices', label: 'Your prediction', of: 'tokens', default: [] },
  { name: 'a', type: 'vec2', label: 'Vector a', range: 5, default: [3, 2] },
];

test('declarations validate: the fixture contract is accepted as authored', () => {
  const declared = validateInputDeclarations(DECLS, DATA);
  assert.equal(declared.length, 5);
});

test('declarations refuse: unknown type, bad default, missing domain, duplicates, collisions', () => {
  assert.throws(() => validateInputDeclarations([{ name: 'x', type: 'slider', label: 'X', default: 0 }], DATA), /type/);
  assert.throws(() => validateInputDeclarations([{ name: 'q', type: 'index', label: 'Q', of: 'tokens', default: 9 }], DATA), /default/);
  assert.throws(() => validateInputDeclarations([{ name: 'q', type: 'index', label: 'Q', of: 'missing', default: 0 }], DATA), /missing/);
  assert.throws(() => validateInputDeclarations([{ name: 'q', type: 'index', label: 'Q', of: 'tokens', default: 0 }, { name: 'q', type: 'bool', label: 'Q2', default: false }], DATA), /q/);
  // an input may not shadow the data it would join in the derive pool
  assert.throws(() => validateInputDeclarations([{ name: 'tokens', type: 'bool', label: 'T', default: false }], DATA), /tokens/);
  // a choice needs unique non-empty option ids and a default that is one of them
  assert.throws(() => validateInputDeclarations([{ name: 'c', type: 'choice', label: 'C', options: [{ id: 'A', label: 'a' }, { id: 'A', label: 'b' }], default: 'A' }], DATA), /option/i);
  assert.throws(() => validateInputDeclarations([{ name: 'c', type: 'choice', label: 'C', options: [{ id: 'A', label: 'a' }, { id: 'B', label: 'b' }], default: 'Z' }], DATA), /default/);
  // vec2 range is one symmetric positive number
  assert.throws(() => validateInputDeclarations([{ name: 'v', type: 'vec2', label: 'V', range: 0, default: [0, 0] }], DATA), /range/);
  assert.throws(() => validateInputDeclarations([{ name: 'v', type: 'vec2', label: 'V', range: 5, default: [9, 0] }], DATA), /default/);
  // an invalid combination is refused, not ignored: index with options
  assert.throws(() => validateInputDeclarations([{ name: 'q', type: 'index', label: 'Q', of: 'tokens', options: [{ id: 'A', label: 'a' }], default: 0 }], DATA), /options/);
});

test('missing and unknown raw keys: defaults in, strangers out', () => {
  const effective = coerceInputs(DECLS, { unrelated: 12 }, DATA);
  assert.deepEqual(effective, { queryIndex: 0, maskEnabled: true, candidate: 'A', answerPositions: [], a: [3, 2] });
  assert.equal('unrelated' in effective, false);
});

test('index: valid values pass, fractions snap, out-of-domain resets to default', () => {
  const at = raw => coerceInputs(DECLS, { queryIndex: raw }, DATA).queryIndex;
  assert.equal(at(2), 2);
  assert.equal(at(2.4), 2);
  assert.equal(at(3), 3);
  // out of the declared domain is stale content, not a nearby intention:
  // clamping 7 to 3 would silently reinterpret an old save after the token
  // list shrank, so it resets instead.
  assert.equal(at(7), 0);
  assert.equal(at(-1), 0);
  assert.equal(at('2'), 2);
  assert.equal(at(NaN), 0);
  assert.equal(at(Infinity), 0);
  assert.equal(at(null), 0);
  assert.equal(at({}), 0);
});

test('bool: only booleans are booleans', () => {
  const at = raw => coerceInputs(DECLS, { maskEnabled: raw }, DATA).maskEnabled;
  assert.equal(at(false), false);
  assert.equal(at(true), true);
  assert.equal(at('false'), true); // corrupt persistence falls back to the default
  assert.equal(at(0), true);
  assert.equal(at(undefined), true);
});

test('choice: stable option identity survives reorder; a removed id resets', () => {
  const at = raw => coerceInputs(DECLS, { candidate: raw }, DATA).candidate;
  assert.equal(at('B'), 'B');
  assert.equal(at('Z'), 'A');   // removed/renamed option: reset, never reinterpret
  assert.equal(at(1), 'A');     // an index is not an identity
  // the same saved id means the same option after the author reorders options
  const reordered = [{ ...DECLS[2], options: [...DECLS[2].options].reverse() }];
  assert.equal(coerceInputs(reordered, { candidate: 'B' }, DATA).candidate, 'B');
});

test('indices: canonical set - deduped, sorted, in-domain members only', () => {
  const at = raw => coerceInputs(DECLS, { answerPositions: raw }, DATA).answerPositions;
  assert.deepEqual(at([2, 0, 2, 1]), [0, 1, 2]);
  assert.deepEqual(at([3, 9, -1, 'x']), [3]);
  assert.deepEqual(at('nope'), []);
  assert.deepEqual(at([1.6]), [2]);
});

test('vec2: clamped to the symmetric range, finite always, -0 normalised', () => {
  const at = raw => coerceInputs(DECLS, { a: raw }, DATA).a;
  assert.deepEqual(at([2, -3]), [2, -3]);
  assert.deepEqual(at([9, -9]), [5, -5]);
  assert.deepEqual(at([-0, 1.23456]), [0, 1.235]);
  assert.deepEqual(at([NaN, 1]), [3, 2]);      // non-finite never reaches geometry
  assert.deepEqual(at([1]), [3, 2]);
  assert.deepEqual(at('x'), [3, 2]);
  assert.equal(Object.is(at([-0, 0])[0], -0), false);
});

test('coercion is idempotent and mutates neither the raw values nor the declarations', () => {
  const raw = Object.freeze({ queryIndex: 7.7, answerPositions: Object.freeze([2, 2, 9]), a: Object.freeze([12, -0]) });
  const decls = DECLS.map(d => Object.freeze({ ...d }));
  const once = coerceInputs(decls, raw, DATA);
  const twice = coerceInputs(decls, once, DATA);
  assert.deepEqual(twice, once);
  assert.deepEqual(raw, { queryIndex: 7.7, answerPositions: [2, 2, 9], a: [12, -0] });
});

test('malformed persisted shapes never throw', () => {
  for (const raw of [null, undefined, 42, 'junk', [], { a: { x: 1 } }, { answerPositions: {} }]) {
    assert.doesNotThrow(() => coerceInputs(DECLS, raw, DATA));
  }
});
