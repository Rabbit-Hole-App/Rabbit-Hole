// The free-rescore rubric (docs/features/tutor-v2-rescore-20261001/rubric.md): equivalent behaviour passes,
// different behaviour still fails. Rows are hand-built in the recorded-row shape; no model is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rescoreRows } from '../e2e/tutor-bench-rescore.mjs';

const base = { stage: 'X', group: 'routine', category: 'c', golden: false, checks: {}, pass: false, jev_calls: 1, larger_calls: 0, escalation: 'settled', jev_outcome: 'settled', larger_outcome: null, audit: { consent: 0, policy: 0, resource: 0 }, transitions: [], events: [], selected: [], actions: [] };
const one = row => rescoreRows([{ ...base, ...row }])[0];

test('rubric: a question answered with an answer passes; a question-only reply or a different card fails', () => {
  assert.equal(one({ trace: 'B-question', turn: 0, row: 'not_yet_observed', actions: [{ type: 'respond_text' }, { type: 'ask_question' }] }).new.actions, true, 'an optional predict question is an allowed extra');
  assert.equal(one({ trace: 'B-question', turn: 0, row: 'not_yet_observed', actions: [{ type: 'ask_question' }] }).new.actions, false, 'no answer: TEXT is never replaced');
  const nav = { trace: 'GT-04', turn: 0, row: 'uncertain', events: [] };
  assert.equal(one({ ...nav, actions: [{ type: 'focus_part', card: 'depth-attention-deep', part_id: 'shapes', mode: 'navigate' }, { type: 'respond_text' }] }).new.actions, true, 'focus_part on the card = show the card');
  assert.equal(one({ ...nav, actions: [{ type: 'show_authored_card', card: 'depth-attention-deep', mode: 'suggest' }, { type: 'respond_text' }] }).new.actions, false, 'a chip does not honour an explicit request');
  assert.equal(one({ ...nav, actions: [{ type: 'show_authored_card', card: 'depth-attention-guided', mode: 'navigate' }, { type: 'respond_text' }] }).new.actions, false, 'another card');
});

test('rubric: evidence polarity and state are strict; confidence and multiplicity are not', () => {
  const gt01 = { trace: 'GT-01', turn: 0, row: 'uncertain_unsettled', selected: ['attention/looks-back-never-ahead'], transitions: [{ claim: 'attention/looks-back-never-ahead', from: 'not_yet_observed', to: 'uncertain' }] };
  const unsure = one({ ...gt01, events: ['attention/looks-back-never-ahead:pass?'], escalation: 'low_consequence', actions: [{ type: 'ask_question' }] });
  assert.deepEqual([unsure.new.evidence, unsure.new.route, unsure.new.actions], [true, true, true], 'one unsettled pass = the expected pass; unsettled route asks its clarifying question');
  assert.equal(one({ ...gt01, events: ['attention/looks-back-never-ahead:pass', 'attention/looks-back-never-ahead:fail'] }).new.evidence, false, 'a fail the script does not have');
  assert.equal(one({ ...gt01, transitions: [{ claim: 'attention/looks-back-never-ahead', from: 'not_yet_observed', to: 'understood' }], events: ['attention/looks-back-never-ahead:pass'] }).new.evidence, false, 'a different state');
});

test('rubric: routes are strict apart from settled vs unsettled uncertainty; scripted faults that did not happen are not applicable', () => {
  assert.equal(one({ trace: 'B-misconception-repeated', turn: 1, row: 'misconception_explain', actions: [{ type: 'respond_text' }] }).new.route, false);
  assert.equal(one({ trace: 'GT-03', turn: 0, row: 'misconception', actions: [{ type: 'focus_part', card: 'c11-causal-mask', part_id: 'x', mode: 'suggest' }] }).new.actions, true, 'Socratic: a counterexample on the card = a diagnostic question');
  const jev = one({ trace: 'B-jev-error', turn: 0, row: 'uncertain', jev_outcome: 'settled', actions: [] });
  assert.deepEqual([jev.na_fault, Object.keys(jev.new)], [true, []]);
  assert.equal(one({ trace: 'B-jev-error', turn: 0, row: 'not_yet_observed', jev_outcome: 'timeout', events: [], actions: [{ type: 'respond_text' }] }).na_fault, false, 'the fault happened: scored');
});
