import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blueprintDesign, planCheck, trimGiven } from '../src/interact-blueprint-design.js';
import { InteractModelError } from '../src/interact-model-adapters.js';
import { quantitiesCorrectionMessage } from '../src/agents/interactive-blueprint/index.js';
import { LIMITS } from '../../web/src/interact-blueprint.js';
import { CONTRACT_LIMITS } from '../../web/src/explain-program/contract.js';

// Release brief (owner, 2026-11-24): the Plan (quantities) answer is checked against the form's limits before the Design call, with one correction. Job ej_89e4480162a445d4b52446f4c55e2eea: the Plan call
// returned a 41 character formula (the limit was 40); Design had to copy it exactly (check 2) and check 1 wanted it shorter, so the job could never pass. The fixture is that job's own Plan answer, as returned.
// The same day the owner raised the formula limit to the engine's own, 200 characters, and ruled that a formula is not limited by the card's boxes (no width rule); that answer now passes on the first call.
const failedAnswer = JSON.parse(readFileSync(new URL('./fixtures/blueprint-plan-answer-ej_89e4480.json', import.meta.url), 'utf8'));
const FAILED_FORMULA = failedAnswer.relationship.formula;
const OVER = LIMITS.formula + 1;
const withFormula = formula => ({ ...failedAnswer, relationship: { ...failedAnswer.relationship, formula } });
const text = value => JSON.stringify(value);
const job = { id: 'ej_test', prompt: 'how does a decision tree works?', depth: 'detailed', flow: { seed: 7 } };
const code = path => `\`${path}\``;
const tooLong = length => `${code('relationship.formula')} is ${length} characters; at most ${LIMITS.formula}.`;

// A scripted provider: the Plan answers in order, then the Design call (which fails without an answer, so the run ends there and the test reads what Design was sent).
// refused: an answer marked bad comes the way the adapter delivers one that breaks its schema (a schema_mismatch error carrying the text); otherwise it is a plain success, so the check cannot be leaning on the adapter.
function provider(planAnswers, { refused = false } = {}) {
  const seen = { plan: [], design: [] }; let n = 0;
  const interact = async (role, args) => {
    if (role === 'blueprint_quantities') {
      const answer = planAnswers[n++]; seen.plan.push(args.input);
      if (refused && answer.bad) throw Object.assign(new InteractModelError('schema_mismatch', `The structured result does not match its schema: $.relationship.formula: longer than ${LIMITS.formula}`, { sent: true }), { raw: text(answer.value) });
      return { output: answer.value, raw: text(answer.value), usage: { raw: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }, served: { model: 'gemini-4-hydrogen' }, stopReason: 'stop' };
    }
    seen.design.push(args.input);
    throw new InteractModelError('http_error', 'the Design call is not part of this test', { sent: true, providerStatus: 500 });
  };
  return { interact, seen };
}
const rolesOf = record => record.calls.map(call => call.role);

test('the formula limit is the engine\'s own: 200, and no more than a math object may hold', () => {
  assert.equal(LIMITS.formula, 200);
  assert.equal(LIMITS.formula <= CONTRACT_LIMITS.text, true, 'the card\'s formula is drawn as a math object whose tex is at most CONTRACT_LIMITS.text');
});

test('the failed job\'s own 41 character formula passes the Plan check on the first answer: one Plan call, then Design', async () => {
  assert.equal(FAILED_FORMULA.length, 41);
  assert.deepEqual(planCheck(failedAnswer), { ok: true, problems: [] });
  const { interact, seen } = provider([{ value: failedAnswer }]);
  const { blueprint } = await blueprintDesign(job, { interact });
  assert.deepEqual(rolesOf(blueprint), ['blueprint_quantities', 'blueprint_design']);
  assert.equal(seen.plan.length, 1);
  assert.equal(blueprint.settled.relationship.formula, FAILED_FORMULA, 'Design is given the formula as the Plan call returned it');
  assert.deepEqual([blueprint.quantities.final, blueprint.quantities.corrected, blueprint.planChecks.first.ok, blueprint.planChecks.corrected], ['first', null, true, null]);
});

test('a formula is not limited by the card\'s boxes: a wide formula under the limit passes (no width rule)', () => {
  const wide = 'W'.repeat(150); // about 2,800 px drawn, far wider than any box of the card
  assert.deepEqual(planCheck(withFormula(wide)), { ok: true, problems: [] });
});

test('a Plan answer whose given strings have a leading or trailing space is settled without them, and Design is given the trimmed text', async () => {
  const spaced = { ...failedAnswer, relationship: { ...failedAnswer.relationship, statement: `\n  ${failedAnswer.relationship.statement}  `, formula: `${FAILED_FORMULA} ` },
    quantities: failedAnswer.quantities.map((entry, k) => (k === 0 ? { ...entry, label: ` ${entry.label} `, meaning: `${entry.meaning}\n` } : entry)) };
  const { interact, seen } = provider([{ value: spaced }]);
  const { blueprint } = await blueprintDesign(job, { interact });
  assert.equal(seen.plan.length, 1, 'trimming is not a correction: one Plan call');
  assert.deepEqual(rolesOf(blueprint), ['blueprint_quantities', 'blueprint_design']);
  assert.equal(blueprint.settled.relationship.formula, FAILED_FORMULA);
  assert.equal(blueprint.settled.relationship.statement, failedAnswer.relationship.statement);
  assert.deepEqual([blueprint.settled.quantities[0].label, blueprint.settled.quantities[0].meaning], [failedAnswer.quantities[0].label, failedAnswer.quantities[0].meaning]);
  assert.ok(seen.design[0].includes(text(FAILED_FORMULA)) && !seen.design[0].includes(text(`${FAILED_FORMULA} `)), 'Design is given the trimmed formula');
  assert.equal(blueprint.quantities.raw, text(spaced), 'the record keeps the answer exactly as returned');
  assert.deepEqual(trimGiven(spaced), failedAnswer, 'every given string, at any depth');
});

test('a formula over the limit fails with the length sentence and gets ONE Plan retry; the retry\'s answer is the one Design is given', async () => {
  const long = withFormula('x'.repeat(OVER)), result = planCheck(long);
  assert.deepEqual(result, { ok: false, problems: [tooLong(OVER)] });
  const { interact, seen } = provider([{ value: long }, { value: failedAnswer }]);
  const { blueprint } = await blueprintDesign(job, { interact });
  assert.deepEqual(rolesOf(blueprint), ['blueprint_quantities', 'blueprint_quantities', 'blueprint_design']);
  assert.match(seen.plan[1], /first part of the blueprint/, 'the correction says the first part of the blueprint');
  assert.ok(seen.plan[1].includes(`1. ${tooLong(OVER)}`), 'the numbered length sentence');
  assert.ok(seen.plan[1].startsWith(seen.plan[0]) && seen.plan[1].includes(text(long)), 'the first message and the previous answer are in it');
  assert.equal(seen.design.length, 1);
  assert.ok(seen.design[0].includes(text(FAILED_FORMULA)) && !seen.design[0].includes('x'.repeat(OVER)), 'Design is given the corrected formula');
  assert.equal(blueprint.settled.relationship.formula, FAILED_FORMULA, 'the dice and settle use the corrected answer');
  assert.deepEqual([blueprint.quantities.final, blueprint.quantities.raw === text(failedAnswer), blueprint.quantities.first.raw === text(long), blueprint.quantities.corrected.raw === text(failedAnswer)], ['corrected', true, true, true], 'both answers are kept');
  assert.deepEqual([blueprint.planChecks.first.ok, blueprint.planChecks.first.problems, blueprint.planChecks.corrected.ok], [false, result.problems, true], 'and the check\'s problems');
});

test('the same over-limit answer arriving as the adapter\'s refusal (a schema_mismatch carrying the text) takes the same path', async () => {
  const { interact, seen } = provider([{ value: withFormula('x'.repeat(OVER)), bad: true }, { value: failedAnswer }], { refused: true });
  const { blueprint } = await blueprintDesign(job, { interact });
  assert.deepEqual(rolesOf(blueprint), ['blueprint_quantities', 'blueprint_quantities', 'blueprint_design']);
  assert.equal(blueprint.planChecks.corrected.ok, true);
  assert.ok(seen.plan[1].includes(`1. ${tooLong(OVER)}`));
  assert.equal(seen.design.length, 1);
});

test('both Plan answers over a limit: the job stops with the check\'s problems and makes no Design call', async () => {
  const { interact, seen } = provider([{ value: withFormula('x'.repeat(OVER)) }, { value: withFormula('x'.repeat(OVER + 5)) }]);
  const { blueprint, final } = await blueprintDesign(job, { interact });
  assert.deepEqual(rolesOf(blueprint), ['blueprint_quantities', 'blueprint_quantities']);
  assert.equal(seen.design.length, 0, 'zero Design calls');
  assert.deepEqual([blueprint.passed, final, blueprint.settled, blueprint.dice], [false, null, null, null], 'no dice were rolled');
  assert.deepEqual(blueprint.problems, [tooLong(OVER + 5)]);
  assert.equal(blueprint.planChecks.corrected.ok, false);
});

test('the check covers every given field, not only the formula: an over-long quantity label', async () => {
  const label = 'Distance between the class centers';
  const longLabel = { ...failedAnswer, quantities: failedAnswer.quantities.map((entry, k) => (k === 1 ? { ...entry, label } : entry)) };
  assert.equal(label.length > LIMITS.quantityLabel, true);
  assert.deepEqual(planCheck(longLabel).problems, [`${code('quantities[1].label')} is ${label.length} characters; at most ${LIMITS.quantityLabel}.`]);
  const { interact, seen } = provider([{ value: longLabel }, { value: failedAnswer }]);
  const { blueprint } = await blueprintDesign(job, { interact });
  assert.deepEqual(rolesOf(blueprint), ['blueprint_quantities', 'blueprint_quantities', 'blueprint_design']);
  assert.match(seen.plan[1], /quantities\[1\]\.label/);
});

test('the correction message says the first part of the blueprint, never the whole blueprint', () => {
  const message = quantitiesCorrectionMessage('FIRST', 'PREVIOUS', ['a problem', 'another']);
  assert.match(message, /^FIRST\n\nYour previous answer, the first part of the blueprint/);
  assert.match(message, /1\. a problem\n2\. another/);
  assert.doesNotMatch(message.replace(/the first part of the blueprint/g, ''), /whole blueprint|previous blueprint/i);
});
