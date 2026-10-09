// Stage D evidence reconciler (docs/features/tutor-architecture-v2.md): observations in, locked
// states out; a failed evaluation changes nothing; one fail is never a misconception.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendEvents, claimCoverage, deriveClaimStates, emptyStore, practiceEvents, reconcile } from './learn-tutor-evidence.js';
import { sectionCompletion } from './learn-journey.js';
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

// Beta hardening item 5b (owner 2026-10-09): current evidence decides. Each idea's latest settled event decides it (a later fail
// uncovers an earlier pass, a later pass covers again); a claim-level negative (a practice fail, a named misconception) counts
// against every idea; understood is every idea currently passed plus a settled transfer pass with no later negative; section
// completion reads the same current evidence, looser than understood. Missing evidence is never a pass.
test('pass A, fail A, transfer pass B is not understood and does not complete the section', () => {
  const run = list => appendEvents(emptyStore(), list).store.events;
  const events = run([obs('pass', { idea: 0, kind: 'demonstrated_here' }), obs('fail', { idea: 0 }), obs('pass', { idea: 1, kind: 'demonstrated_in_transfer' })]);
  assert.notEqual(deriveClaimStates(events)[CLAIM].state, 'understood');
  assert.deepEqual(claimCoverage(events, CLAIM), { settled_ideas: [1], missing_ideas: [0], failed_ideas: [0], transfer: true, transfer_seq: 3 });
  const journey = criterion => ({ section_plan: { completion_evidence: [{ claim: CLAIM, minimum: criterion }] }, evidence: { seq: events.length, events }, registry: { claims: { [CLAIM]: { ideas: ['a', 'b'] } } } });
  for (const minimum of ['demonstrated_here', 'demonstrated_in_transfer']) assert.equal(sectionCompletion(journey(minimum)).met, false, minimum);
  assert.equal(sectionCompletion(journey('attempted')).met, true, 'it was attempted');
  // Stating idea A again: covered again, now understood and complete.
  const again = run([...events.map(({ seq, ...e }) => e), obs('pass', { idea: 0, kind: 'demonstrated_in_transfer' })]);
  assert.equal(deriveClaimStates(again)[CLAIM].state, 'understood');
  assert.equal(sectionCompletion({ ...journey('demonstrated_in_transfer'), evidence: { seq: again.length, events: again } }).met, true);
});

test('current evidence: a claim-level negative counts against every idea until a later pass; unsettled events never decide', () => {
  const run = list => appendEvents(emptyStore(), list).store.events;
  const both = [obs('pass', { idea: 0, kind: 'demonstrated_in_transfer' }), obs('pass', { idea: 1, kind: 'demonstrated_in_transfer' })];
  assert.equal(deriveClaimStates(run(both))[CLAIM].state, 'understood');
  const practiceFail = run([...both, obs('fail', { source: 'card_practice' })]);
  assert.deepEqual(claimCoverage(practiceFail, CLAIM).failed_ideas, [0, 1], 'a claim-level fail counts against all ideas');
  assert.notEqual(deriveClaimStates(practiceFail)[CLAIM].state, 'understood');
  const named = run([...both, obs('misconception', { misconception_id: 'picks-top-value' })]);
  assert.deepEqual(claimCoverage(named, CLAIM).missing_ideas, [0, 1], 'a named wrong model too');
  const recovered = run([...both, obs('fail', { idea: 1 }), obs('pass', { idea: 1, kind: 'demonstrated_here' })]);
  assert.deepEqual(claimCoverage(recovered, CLAIM).settled_ideas, [0, 1], 'a later pass covers the idea again');
  const unsettled = run([...both, obs('fail', { idea: 0, settled: false })]);
  assert.equal(deriveClaimStates(unsettled)[CLAIM].state, 'understood', 'an unsettled fail decides nothing');
});
