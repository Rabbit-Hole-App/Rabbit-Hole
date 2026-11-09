import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPLANATION_GUIDANCE } from '../src/learn-primitives.js';
import { QUESTIONS } from '../src/explanation-planner.js';

// Owner 2026-11-09 (the cross-validation card drew a trend line across folds): categorical or index x is a bar-chart, never a line.
test('the coordinate-plot contract says folds, classes, models and runs are a bar-chart, not a line', () => {
  const clause = "if the x values are categories or indices (folds, classes, models, runs), use a bar-chart (grouped when comparing series), not a line; a line's x is a quantity that varies continuously (time, epochs, p, size)";
  assert.equal(EXPLANATION_GUIDANCE.split(clause).length, 2, 'once');
  assert.ok(EXPLANATION_GUIDANCE.indexOf('coordinate-plot for data on two axes') < EXPLANATION_GUIDANCE.indexOf(clause) && EXPLANATION_GUIDANCE.indexOf(clause) < EXPLANATION_GUIDANCE.indexOf('bar-chart for comparing quantities'));
});

test('the planner kind criteria say the same for coordinate-plot, bar-chart and sample-set', () => {
  const kinds = QUESTIONS.kind.criteria;
  assert.match(kinds['coordinate-plot'], /its x is a quantity that varies continuously \(time, epochs, p, size\), never categories or indices/);
  assert.match(kinds['bar-chart'], /any series over categories or indices \(folds, classes, models, runs\), such as training vs validation error per fold, grouped when comparing series/);
  assert.match(kinds['sample-set'], /not the error or score measured per fold/);
});
