// Stage C explicit escalation policy (docs/features/tutor-architecture-v2.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escalation } from '../src/agents/learn-tutor-escalation.js';

const T = { yes: 0.7, no: 0.3 };
const claim = (extra = {}) => ({ id: 'c', concept: 'x', statement: 's', ideas: ['a', 'b'], misconceptions: [{ id: 'm0', check: 'x' }], drawn: 'd', ...extra });
const SPEC = { answering: false, claims: [claim()], gaps: [{ concept: 'softmax', statement: 's', claims: ['c'] }] };
const base = { attempt: 1, c0_idea0: 1, c0_idea1: 0, c0_mis0: 0, c0_transfer: 0, g0: 0 };

test('settled JEV never escalates', () => {
  assert.deepEqual(escalation(SPEC, base, T), { escalate: false, reason: 'settled', uncertain: [] });
});

test('an uncertain idea or transfer check on its own is low consequence: retain uncertain', () => {
  assert.equal(escalation(SPEC, { ...base, c0_idea1: 0.55 }, T).reason, 'low_consequence');
  assert.equal(escalation(SPEC, { ...base, c0_transfer: 0.5 }, T).reason, 'low_consequence');
  assert.equal(escalation(SPEC, { ...base, attempt: 0.5 }, T).escalate, false);
});

test('an uncertain gap check decides a Rabbit Hole suggestion: escalate', () => {
  assert.deepEqual(escalation(SPEC, { ...base, g0: 0.5 }, T), { escalate: true, reason: 'gap', uncertain: ['g0'] });
});

test('an uncertain misconception check escalates only when it would be the second settled one', () => {
  assert.equal(escalation(SPEC, { ...base, c0_idea0: 0, c0_mis0: 0.5 }, T).reason, 'low_consequence');
  const prior = { ...SPEC, claims: [claim({ prior_misconceptions: ['m0'] })] };
  assert.equal(escalation(prior, { ...base, c0_idea0: 0, c0_mis0: 0.5 }, T).reason, 'misconception');
});

test('a confident pass beside an uncertain misconception, or the reverse, is a contradiction: escalate', () => {
  assert.equal(escalation(SPEC, { ...base, c0_mis0: 0.5 }, T).reason, 'contradiction');
  assert.equal(escalation(SPEC, { ...base, c0_idea0: 0.5, c0_mis0: 1 }, T).reason, 'contradiction');
});

test('one idea both stated (yes or unsure) and contradicted is a contradiction; an uncertain contradiction check alone is low consequence (D7)', () => {
  const d7 = { ...base, c0_contra0: 0, c0_contra1: 0 };
  assert.equal(escalation(SPEC, { ...d7, c0_idea1: 0.5, c0_contra1: 1 }, T).reason, 'contradiction');
  assert.equal(escalation(SPEC, { ...d7, c0_contra0: 1, c0_transfer: 0.5 }, T).reason, 'contradiction');
  assert.equal(escalation(SPEC, { ...d7, c0_contra1: 0.5 }, T).reason, 'low_consequence');
  assert.equal(escalation(SPEC, { ...d7, c0_contra0: 0.5 }, T).reason, 'low_consequence', 'stated and only maybe contradicted: low consequence');
});
