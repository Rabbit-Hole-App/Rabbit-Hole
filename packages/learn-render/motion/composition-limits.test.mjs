import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPOSITION_LIMITS, COMPLEXITY_CLASSES, checkCompositionLimits, complexityClass, measureComposition } from './composition-limits.js';

const jsx = (n, text = 'Hi') => `export default () => (<AbsoluteFill>${Array.from({ length: n }, () => `<Sequence from={0}><div>${text}</div></Sequence>`).join('')}</AbsoluteFill>);`;

test('the limit table is stable: three classes, each ceiling at most the next one\'s, every name present', () => {
  assert.deepEqual(COMPLEXITY_CLASSES, ['simple', 'standard', 'heavy']);
  const keys = ['layers', 'elements', 'text_chars', 'asset_bytes', 'duration_seconds'];
  for (const c of COMPLEXITY_CLASSES) assert.deepEqual(Object.keys(COMPOSITION_LIMITS[c]), keys, c);
  for (const k of keys) assert.ok(COMPOSITION_LIMITS.simple[k] <= COMPOSITION_LIMITS.standard[k] && COMPOSITION_LIMITS.standard[k] <= COMPOSITION_LIMITS.heavy[k], k);
  assert.ok(Object.isFrozen(COMPOSITION_LIMITS) && Object.isFrozen(COMPOSITION_LIMITS.simple));
});

test('metrics are read from the source without running it', () => {
  const m = measureComposition(jsx(3, 'Hello there'), { durationSeconds: 20 });
  assert.deepEqual([m.layers, m.duration_seconds], [4, 20]);
  assert.ok(m.text_chars >= 33 && m.text_chars <= 36, 'the three texts, give or take the arrow in the module line');
  assert.ok(m.elements >= 7 && m.asset_bytes > 100);
  assert.equal(measureComposition('<div data-start="0"><p data-start="2">x</p></div>', { durationSeconds: 5 }).layers, 2, 'HyperFrames layers');
});

test('classes: the smallest that holds every metric; beyond the heaviest is refused before rendering; an uncovered class is refused too', () => {
  assert.equal(complexityClass(measureComposition(jsx(3), { durationSeconds: 10 })), 'simple');
  assert.equal(complexityClass(measureComposition(jsx(12), { durationSeconds: 10 })), 'standard');
  assert.equal(complexityClass(measureComposition(jsx(30), { durationSeconds: 10 })), 'heavy');
  const huge = checkCompositionLimits(jsx(80), { durationSeconds: 10 });
  assert.equal(huge.ok, false); assert.match(huge.reason, /beyond the supported limits.*layers 81 over 40/);
  assert.equal(checkCompositionLimits(jsx(3), { durationSeconds: 10, allowed: ['simple', 'standard'] }).ok, true);
  const uncovered = checkCompositionLimits(jsx(30), { durationSeconds: 10, allowed: ['simple', 'standard'] });
  assert.deepEqual([uncovered.ok, uncovered.class], [false, 'heavy']); assert.match(uncovered.reason, /not covered for these settings/);
  assert.equal(checkCompositionLimits(jsx(3), { durationSeconds: 10, allowed: [] }).ok, false, 'an empty cover covers nothing');
  assert.equal(checkCompositionLimits(jsx(3), { durationSeconds: 61 }).ok, false, 'duration is a limit too');
});
