// bench-coverage.mjs aggregation proof ($0, no network): fabricated rows, the JEV majority with a tie broken by mean probability, shares, agreement, the both-none list and the report text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { jevTop, summarize, reportMarkdown, normalize } from '../../../scripts/interact/bench-coverage.mjs';

const rep = (choice, p) => ({ choice, confidence: p, probabilities: { [choice]: p } });
const row = (prompt, jev, sonnetChoice) => ({ set: 's', prompt, jev, sonnetChoice, sonnetReason: 'r' });

test('the JEV bucket is the majority of the repeats; a tie goes to the higher mean probability; errors do not vote', () => {
  assert.equal(jevTop([rep('none', 0.6), rep('curve-sliders', 0.9), rep('none', 0.7)]), 'none');
  assert.equal(jevTop([rep('none', 0.6), rep('curve-sliders', 0.9)]), 'curve-sliders');
  assert.equal(jevTop([{ choice: 'error' }, rep('before-after', 0.5), { choice: 'error' }]), 'before-after');
  assert.equal(jevTop([{ choice: 'error' }]), null);
});

test('shares, agreement overall and per mechanism, self-consistency and the both-none list', () => {
  const rows = [
    row('a', [rep('curve-sliders', 0.9), rep('curve-sliders', 0.8), rep('curve-sliders', 0.9)], 'curve-sliders'),
    row('b', [rep('none', 0.9), rep('none', 0.9), rep('stepper-states', 0.5)], 'none'),
    row('c', [rep('stepper-states', 0.9), rep('stepper-states', 0.9), rep('stepper-states', 0.9)], 'graph-active-path'),
    row('d', [rep('none', 0.9), rep('none', 0.9), rep('none', 0.9)], 'before-after'),
  ];
  const s = summarize(rows);
  assert.equal(s.n, 4); assert.equal(s.agree, 2);
  assert.deepEqual([s.jevShare.none, s.sonnetShare.none, s.jevShare['stepper-states'], s.sonnetShare['graph-active-path']], [2, 1, 1, 1]);
  assert.deepEqual(s.perMechanism.none, { either: 2, both: 1 }); assert.deepEqual(s.perMechanism['curve-sliders'], { either: 1, both: 1 });
  assert.equal(s.unanimous, 3); assert.deepEqual(s.bothNone.map(r => r.prompt), ['b']);
  const md = reportMarkdown(s, { spendUsd: 0.1 });
  assert.match(md, /JEV majority vs Sonnet, same bucket: \*\*2 of 4 \(50%\)\*\*/); assert.match(md, /Prompts both classifiers put in `none` \(1\)/); assert.match(md, /- \[s\] b/);
});

test('prompts are deduplicated by normalized text', () => assert.equal(normalize('  How does  X work? '), normalize('how does x work')));
