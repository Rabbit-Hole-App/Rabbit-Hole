import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, evaluatorInput } from '../../../tests/evals/curriculum/cases.mjs';
import { scoreReviews } from '../../../tests/evals/curriculum/scoring.mjs';
import { validateOutline, validateOutlineRequest } from '../src/curriculum-outline.js';

test('frozen review cases satisfy the API schema and exclude labels from evaluator input', () => {
  assert.equal(CASES.filter(c => c.split === 'development').length, 6);
  assert.equal(CASES.filter(c => c.split === 'holdout').length, 4);
  for (const c of CASES) {
    validateOutline(c.candidate); validateOutlineRequest(c.input);
    assert.deepEqual(evaluatorInput(c), { input: c.input, candidate: c.candidate, reviewContext: { iteration: 1, previousFindings: [] } });
  }
});

test('scoring distinguishes detection, severity mistakes, unrelated rejections, and errors', () => {
  const row = (id, expected, verdict, findings = []) => ({ id, expected: { verdict: expected }, evaluation: { verdict, findings } });
  const results = [row('A', 'revise', 'ready', [{ id: 'F1', severity: 'minor' }]),
    row('B', 'revise', 'revise', [{ id: 'F1', severity: 'blocking' }]),
    row('C', 'revise', 'revise', [{ id: 'F1', severity: 'blocking' }]),
    row('D', 'ready', 'revise'), { id: 'E', error: 'provider unavailable' }];
  const notes = { A: { targetFindingIds: ['F1'] }, B: { targetFindingIds: ['F1'] },
    C: { targetFindingIds: [] }, D: { targetFindingIds: [] } };
  assert.deepEqual(scoreReviews(results, notes), { cases: 5, errors: 1, defective: 3, detected: 2, blocked: 1,
    missed: 1, severityMisses: 1, acceptable: 1, falseRejections: 1 });
  assert.throws(() => scoreReviews(results, {}), /Missing adjudication/);
  assert.throws(() => scoreReviews([results[0]], { A: { targetFindingIds: ['invented'] } }), /Unknown finding/);
});
