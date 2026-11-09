// Owner 2026-11-09: the token-links contract. A token-links card shows the heaviest weight's value on its link and says in the caption that the weights sum to one, so the prose ("the six sum to 1") and
// the picture (one value shown) agree. It is prompt text, never schema: the Gemini bundles are untouched (explanation-gemini-illustration-bundles.test.js pins their sizes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE02_DIAGRAM_GUIDANCE } from '../src/explanation-references.js';

test('the guidance states the token-links contract once', () => {
  const sentence = 'For token-links, show the value of the heaviest weight on its link and say in the caption that the weights sum to one.';
  assert.equal(PHASE02_DIAGRAM_GUIDANCE.split(sentence).length, 2);
});
