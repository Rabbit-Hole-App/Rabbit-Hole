// A hole's opening turn (holeOpening, in learn-tutor.js since the Tutor cleanup P1 moved it out of learn-next-steps.js, which
// no longer imports the Tutor): a carried hook opens the hole once; without a guided mark a restored hole is never opened again.
// Deleted with learn-tutor.js in P2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { markGuidedEntry, openOnce } from './learn-opening.js';
import { carryStep } from './learn-next-steps.js';
import { holeOpening, openingQuestion } from './learn-tutor.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { NANOGPT } from './learn-tutor-claims.js';

// ---- Shared canvases (Task 11): the pending and carried step, and the viewer's own claim states. ----
const memory = () => { const m = new Map(); return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

// Fix round 1 item 3: a hole's opening (LearnTutor.jsx calls holeOpening in its effect), behaviourally.
test('holeOpening: a carried step opens the hole once as a next_step with no question, and the opening question never follows', () => {
  const s = memory(), record = { dive_id: 'canvas-0000beef', title: 'Masks', origin: { parent: { app: 'share:k', board: 'main' } } };
  const step = { suggestion_id: 'ns_01010101.2', learning_goal: 'g' };
  let saved = emptyStore(), loads = 0;
  const load = () => { loads += 1; return saved; };
  const open = over => holeOpening({ storage: s, load, record, hookTurns: true, settled: true, active: true, domain: () => NANOGPT, mint: () => 'o1', ...over });
  carryStep(s, record.dive_id, step);
  // Hook turns do not run here yet (the hole's Tutor context is not resolved): the step is kept and nothing is read.
  assert.deepEqual(open({ hookTurns: false }), { store: null, opening: null });
  assert.deepEqual([loads, [...s.m.values()].map(v => JSON.parse(v))], [0, [step]], 'still stored, untouched');
  const first = open({ active: false });
  assert.deepEqual(first.opening, { key: `${record.dive_id}:o1`, next_step: step, entry: null });
  assert.equal('question' in first.opening, false);
  saved = first.store;
  assert.equal(openingQuestion(saved, record), null, 'marked opened: no opening question later');
  assert.deepEqual([s.m.size, open().opening], [0, null], 'taken once; the hole was opened by the step');
  // Without a carried step: the usual opening question, only where the Tutor is active, and (owner 4a, 2026-10-20) only for
  // an explicit guided entry: without its mark (a URL restore, a refresh in a new tab, Back, a reopen) the hole opens quietly.
  saved = emptyStore();
  assert.deepEqual(open({ active: false }), { store: null, opening: null });
  assert.equal(open().opening, null, 'no guided entry: no opening turn');
  saved = emptyStore();
  markGuidedEntry(s, record.dive_id);
  const asked = open();
  assert.deepEqual([asked.opening, openingQuestion(asked.store, record)], [{ key: `${record.dive_id}:o1`, question: 'Take me into Masks.', entry: null }, null]);
  // Merge of Tasks 10 and 11 (Task 10 fix round 4): the opening question uses the live title, the record title only as a fallback.
  saved = emptyStore();
  markGuidedEntry(s, record.dive_id);
  assert.deepEqual(open({ title: 'Mask notes' }).opening, { key: `${record.dive_id}:o1`, question: 'Take me into Mask notes.', entry: null });
  assert.deepEqual(open({ record: null }), { store: null, opening: null });
});

// Merge fix a: the opening waits for Task 10's hook context (LearnTutor passes settled: hookContext is not null) - never while
// the record or a journey hole's parent journey read is unresolved, so a carried step never runs on the canvas domain inside a
// journey hole. Once settled it runs: on the dive domain, or on the canvas domain after a refusal (hook turns only, askStep).
test('holeOpening: nothing is taken or asked until the hook context settles; then the carried step opens the hole once', () => {
  const s = memory(), record = { dive_id: 'canvas-0000feed', title: 'Falls', journey: { journey_id: 'lj_a', section_id: 's2', concept_ids: [], claim_ids: [] } };
  const step = { suggestion_id: 'ns_02020202.1', learning_goal: 'g' };
  let loads = 0;
  const load = () => { loads += 1; return emptyStore(); };
  const open = over => holeOpening({ storage: s, load, record, hookTurns: true, active: false, domain: () => NANOGPT, mint: () => 'o1', ...over });
  carryStep(s, record.dive_id, step);
  // The parent read pending: the canvas domain (hook turns, no typed Tutor), or a typed Tutor that is not the hole's yet.
  for (const active of [false, true]) assert.deepEqual(open({ settled: false, active }), { store: null, opening: null });
  assert.deepEqual([loads, [...s.m.values()]], [0, [JSON.stringify(step)]], 'nothing read; the step kept as it was');
  // Settled with a refusal: the canvas-domain hole takes it once (the dock sends it with askStep).
  assert.deepEqual(open({ settled: true }).opening, { key: `${record.dive_id}:o1`, next_step: step, entry: null });
  // Taken once; a settled typed Tutor asks its opening question as before for a guided entry (owner 4a; this load never
  // saves, so the hole is not marked).
  assert.equal(s.m.size, 0);
  markGuidedEntry(s, record.dive_id);
  assert.deepEqual(open({ settled: true, active: true }).opening, { key: `${record.dive_id}:o1`, question: 'Take me into Falls.', entry: null });
});

// A carried opening is sent once even when the dock remounts (the hole's board landing from the server remounts the canvas);
// a later, distinct carry into the same hole is a new opening, sent exactly once (curious-context lane, 2026-10-13).
test('openOnce: each carried opening sends once across a remount; a second, distinct carry into the same hole sends exactly once', () => {
  const s = memory(), record = { dive_id: 'canvas-0000cafe', title: 'Heaps', origin: { parent: { app: 'share:k', board: 'main' } } };
  const open = () => holeOpening({ storage: s, load: () => emptyStore(), record, hookTurns: true, settled: true, active: false, domain: () => NANOGPT }).opening;
  const sent = new Set();
  carryStep(s, record.dive_id, { suggestion_id: 'ns_03030303.1', learning_goal: 'g1' });
  const first = open();
  assert.equal(openOnce(sent, first.key), true, 'the first carry sends');
  assert.equal(openOnce(sent, first.key), false, 'a remounted dock never sends it again');
  carryStep(s, record.dive_id, { suggestion_id: 'ns_03030303.1', learning_goal: 'g1' });
  const second = open();
  assert.notEqual(second.key, first.key, 'a later carry into the same hole is a new opening, even of the same hook');
  assert.deepEqual([openOnce(sent, second.key), openOnce(sent, second.key)], [true, false], 'sent exactly once');
  for (let i = 0; i < 60; i++) openOnce(sent, `k${i}`);
  assert.equal(sent.size, 50, 'at most 50 keys');
  assert.equal(sent.has(first.key), false, 'the oldest go first');
  assert.equal(openOnce(sent, ''), false);
});
