import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// This is the distinction between "derived from shared data" and "the same
// numbers happen to appear in three places": nothing enforces the latter,
// and this test enforces the former. Cases 01, 03 and 04 each carry their
// OWN exampleData - none of them reads another case's file at render time,
// so each is fully reproducible alone, from a clean checkout, in any order
// (see docs/superpowers/specs/2026-09-18-visual-language-and-motion-design.md).
// What makes them ONE canonical dataset rather than three coincidentally
// matching ones is that this test fails, and names the case, the moment any
// of the three stops matching viz-benchmarks/illustrated-transformer/shared/
// river-flows-south-example.json.
const SHARED_PATH = new URL('../../../viz-benchmarks/illustrated-transformer/shared/river-flows-south-example.json', import.meta.url);
const shared = JSON.parse(readFileSync(SHARED_PATH, 'utf8'));

const CASES = ['01-self-attention-computation-flow', '03-attention-score-matrix', '04-softmax-attention-weights'];
const load = caseName => JSON.parse(readFileSync(
  new URL(`../../../viz-benchmarks/illustrated-transformer/cases/${caseName}/generated/latest/scene-spec.json`, import.meta.url),
  'utf8',
));

test('shared example data file declares Q, K and V for the three tokens', () => {
  assert.deepEqual(shared.tokens, ['river', 'flows', 'south']);
  for (const key of ['Q', 'K', 'V']) {
    assert.equal(shared[key].length, 3, `${key} needs one row per token`);
    for (const row of shared[key]) assert.equal(row.length, 3, `${key}'s rows must all share a width`);
  }
});

for (const caseName of CASES) {
  test(`case ${caseName}: exampleData.Q/K/V is byte-identical to the shared canonical dataset`, () => {
    const raw = load(caseName);
    assert.ok(raw.exampleData, `${caseName} has no exampleData at all`);
    for (const key of ['Q', 'K', 'V']) {
      assert.deepEqual(raw.exampleData[key], shared[key], `${caseName}'s exampleData.${key} does not match the shared canonical dataset`);
    }
  });
}
