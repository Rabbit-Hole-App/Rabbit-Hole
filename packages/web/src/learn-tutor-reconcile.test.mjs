// Stage D evidence reconciler (docs/features/tutor-architecture-v2.md): observations in, locked
// states out; a failed evaluation changes nothing; one fail is never a misconception.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, reconcile } from './learn-tutor-evidence.js';

const CLAIM = 'attention-output/weighted-average';
const obs = (result, extra = {}) => ({ concept: 'attention-output', claim: CLAIM, result, kind: null, settled: true, evaluator: 'jev', source: 'free_text', ...extra });
const ref = { card: 'c10-weighted-values', turn_id: 't' };

test('an errored evaluation adds nothing and changes no state', () => {
  const out = reconcile(emptyStore(), { status: 'error', events: [obs('fail')] }, ref);
  assert.equal(out.added, 0);
  assert.deepEqual(out.transitions, []);
  assert.equal(out.states[CLAIM].state, 'not_yet_observed');
});

test('one named wrong model is uncertain; the same one again is a misconception; a settled transfer pass supersedes it', () => {
  let out = reconcile(emptyStore(), { status: 'settled', events: [obs('misconception', { misconception_id: 'picks-top-value' })] }, ref);
  assert.deepEqual(out.transitions, [{ claim: CLAIM, from: 'not_yet_observed', to: 'uncertain' }]);
  out = reconcile(out.store, { status: 'settled', events: [obs('misconception', { misconception_id: 'picks-top-value' })] }, ref);
  assert.equal(out.states[CLAIM].state, 'misconception');
  out = reconcile(out.store, { status: 'uncertain', events: [obs('pass', { kind: 'demonstrated_in_transfer', settled: false })] }, ref);
  assert.equal(out.states[CLAIM].state, 'misconception', 'an unsettled pass changes nothing');
  out = reconcile(out.store, { status: 'settled', events: [obs('pass', { kind: 'demonstrated_in_transfer' })] }, ref);
  assert.deepEqual(out.transitions, [{ claim: CLAIM, from: 'misconception', to: 'understood' }]);
  assert.ok(out.store.events.every(event => event.ref === ref));
});

test('a restated pass on the drawn case is not understood; conflicting evidence stays uncertain', () => {
  let out = reconcile(emptyStore(), { status: 'settled', events: [obs('pass', { kind: 'demonstrated_here' })] }, ref);
  assert.equal(out.states[CLAIM].state, 'uncertain');
  out = reconcile(emptyStore(), { status: 'settled', events: [obs('pass', { kind: 'demonstrated_in_transfer' }), obs('fail')] }, ref);
  assert.equal(out.states[CLAIM].state, 'uncertain');
});
