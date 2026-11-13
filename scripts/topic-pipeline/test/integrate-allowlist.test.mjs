import assert from 'node:assert/strict';
import test from 'node:test';
import { allowed } from '../stages/05-integrate.mjs';

const ctx = { topic: 'logistic-regression', fixture: false, dryRun: false };
const author = { references: [{ id: 'ml-logistic-regression-accuracy-trap', authored: true }] };
const preview = 'docs/features/explain-on-canvas/handoff/phase02-library/illustrations/';

test('every depth and detail variant folder of an authored reference is allowed', () => {
  for (const variant of ['', '-brief', '-balanced', '-detailed', '-detail', '-brief-detail', '-detailed-detail']) {
    for (const file of ['408.svg', 'natural.svg', '960.svg', 'spec.json']) assert.ok(allowed(`${preview}ml-logistic-regression-accuracy-trap${variant}/${file}`, ctx, author), `${variant} ${file}`);
  }
  assert.ok(allowed('packages/web/src/tutor-diagrams/__snapshots__/ml-logistic-regression-accuracy-trap-balanced.svg', ctx, author));
});

test('another reference, a stray file in a variant folder and non-topic paths stay out', () => {
  assert.equal(allowed(`${preview}ml-logistic-regression-other-balanced/408.svg`, ctx, author), false);
  assert.equal(allowed(`${preview}ml-logistic-regression-accuracy-trap-balanced/notes.txt`, ctx, author), false);
  assert.equal(allowed('scripts/topic-pipeline/run.mjs', ctx, author), false);
});
