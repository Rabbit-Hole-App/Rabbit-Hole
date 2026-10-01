// Stage B claim candidate selector (docs/features/tutor-architecture-v2.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAIMS } from './learn-tutor-claims.js';
import { CUES, selectClaims } from './learn-tutor-select.js';

const GUIDED = ['attention/scores-from-dot-products', 'attention/weights-from-scores'];
const GUIDED_POOL = [...GUIDED, 'softmax/normalizes-to-one', 'softmax/gaps-set-sharpness'];
const C11 = ['causal-mask/reads-self-and-earlier', 'causal-mask/applied-before-softmax'];
const C11_POOL = [...C11, 'softmax/normalizes-to-one', 'softmax/gaps-set-sharpness'];

test('every cue belongs to a registry claim', () => {
  for (const id of Object.keys(CUES)) assert.ok(CLAIMS[id], id);
});

test('"Why does softmax make these weights sum to one?" selects normalizes-to-one, not every attention or softmax claim', () => {
  const out = selectClaims('Why does softmax make these weights sum to one?', { candidates: GUIDED_POOL, fallback: GUIDED });
  assert.deepEqual(out.selected, ['attention/weights-from-scores', 'softmax/normalizes-to-one']);
  assert.equal(out.available, 4);
  assert.equal(out.fallback, false);
  assert.ok(!out.selected.includes('softmax/gaps-set-sharpness'));
  assert.ok(!out.selected.includes('attention/scores-from-dot-products'));
});

test('a mask message on c11 keeps the claim it touches; the sibling it never mentions is dropped', () => {
  assert.deepEqual(selectClaims('Each position reads itself and all earlier positions, never its next character.', { candidates: C11_POOL, fallback: C11 }).selected,
    ['causal-mask/reads-self-and-earlier']);
  assert.deepEqual(selectClaims("The mask hides the future so it can't cheat. It's applied after softmax to zero those weights.", { candidates: C11_POOL, fallback: C11 }).selected,
    ['causal-mask/reads-self-and-earlier', 'causal-mask/applied-before-softmax']);
});

test('cues match at word starts only: "already" is not "read", "arrow" is not "row"', () => {
  const out = selectClaims('I already drew an arrow.', { candidates: C11_POOL, fallback: C11 });
  assert.equal(out.fallback, true);
  assert.deepEqual(out.selected, C11);
});

test('no cue at all keeps the target claims (fallback); forced claims are always kept', () => {
  assert.deepEqual(selectClaims('Hmm, still 100.', { candidates: C11_POOL, forced: ['causal-mask/reads-self-and-earlier'], fallback: C11 }).selected, C11);
  assert.deepEqual(selectClaims('It is about the softmax gaps.', { candidates: C11_POOL, forced: ['causal-mask/reads-self-and-earlier'], fallback: C11 }).selected,
    ['causal-mask/reads-self-and-earlier', 'softmax/gaps-set-sharpness']);
});

test('a concept name alone selects that concept\'s candidates', () => {
  assert.deepEqual(selectClaims('What is softmax for?', { candidates: GUIDED_POOL, fallback: GUIDED }).selected, ['softmax/normalizes-to-one', 'softmax/gaps-set-sharpness']);
});
