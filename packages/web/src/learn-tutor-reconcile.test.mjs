// Stage D evidence reconciler (docs/features/tutor-architecture-v2.md): observations in, locked
// states out; a failed evaluation changes nothing; one fail is never a misconception.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendEvents, deriveClaimStates, emptyStore, practiceEvents, reconcile } from './learn-tutor-evidence.js';
import { cardModule } from './learn-tutor-claims.js';
import { cardBlock } from './nanogpt/board.js';
import { applyCheck, enterPractice, setActivityAnswer } from './scene-activity.js';

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

// Decision 7: free-text events carry their idea; understood needs every idea covered by a settled
// pass, or a claim-level (practice) pass.
test('a transfer pass on one idea of a two-idea claim is not understood; both ideas passed in transfer are', () => {
  let out = reconcile(emptyStore(), { status: 'settled', events: [obs('pass', { kind: 'demonstrated_in_transfer', idea: 0 })] }, ref);
  assert.equal(out.states[CLAIM].state, 'uncertain');
  out = reconcile(out.store, { status: 'settled', events: [obs('pass', { kind: 'demonstrated_in_transfer', idea: 1 })] }, ref);
  assert.equal(out.states[CLAIM].state, 'understood');
});

test('a practice pass alone is claim-level: understood', () => {
  const pass = obs('pass', { kind: 'demonstrated_in_transfer', evaluator: 'deterministic', source: 'card_practice' });
  assert.equal(reconcile(emptyStore(), { status: 'settled', events: [pass] }, ref).states[CLAIM].state, 'understood');
});

test('completeness exception: an incomplete enumeration on card practice (c11 "0 to Q-1", no self) stays a fail', () => {
  const card = cardBlock(cardModule('c11-causal-mask'));
  const block = applyCheck(setActivityAnswer(enterPractice(card), 'before'));
  const { store, events } = practiceEvents(emptyStore(), block, { card_id: 'c11-causal-mask' }, null);
  assert.deepEqual(events.map(event => [event.result, event.misconception_id, 'idea' in event]), [['fail', 'excludes-self', false]]);
  const { store: next } = appendEvents(store, events);
  const id = 'causal-mask/reads-self-and-earlier';
  assert.equal(deriveClaimStates(next.events)[id].state, 'uncertain');
  // A later explanation in transfer that covers only idea 0 neither removes the fail nor makes it understood.
  const later = reconcile(next, { status: 'settled', events: [{ concept: 'causal-mask', claim: id, result: 'pass', kind: 'demonstrated_in_transfer', idea: 0, settled: true, evaluator: 'jev', source: 'free_text' }] }, ref);
  assert.equal(later.states[id].state, 'uncertain');
  assert.ok(later.store.events.some(event => event.source === 'card_practice' && event.result === 'fail'));
});
