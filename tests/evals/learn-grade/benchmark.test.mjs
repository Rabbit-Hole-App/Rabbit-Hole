import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PATTERNS, validateSet } from './set-rules.mjs';

const setPath = new URL('./benchmark-v1.json', import.meta.url);
test('benchmark-v1 is valid, balanced, and covers every pattern for every challenge', { skip: !existsSync(setPath) && 'benchmark-v1.json not written yet' }, () => {
  const set = JSON.parse(readFileSync(setPath, 'utf8'));
  assert.equal(set.version, 'benchmark-v1');
  assert.deepEqual(validateSet(set), []);
  assert.equal(set.challenges.length, 6);
  for (const challenge of set.challenges) {
    const patterns = set.cases.filter(item => item.challenge === challenge.id).map(item => item.pattern).sort();
    assert.deepEqual(patterns, [...PATTERNS].sort(), challenge.id);
  }
  const samples = set.challenges.filter(challenge => challenge.id.startsWith('nanogpt-'));
  assert.equal(samples.length, 2, 'both canvas samples are in v1');
});

test('the validator catches bad sets', () => {
  const set = { challenges: [{ id: 'c1', mode: 'challenge', prompt: 'P?', expects: ['a', 'b', 'c'] }], cases: [{ id: 'x', challenge: 'c1', pattern: 'idk', answer: 'I really have no idea at all about any of this', gold: { ideas: [false, false, false], misconception: false, non_attempt: true } }] };
  const problems = validateSet(set, { minPerMode: 1 });
  assert.ok(problems.some(problem => problem.includes('case id x')));
  assert.ok(problems.some(problem => problem.includes('at most 40')));
  assert.ok(problems.some(problem => problem.includes('explain_back: 0 cases < 1')));
});

test('the validator enforces the route input caps and the 6-challenge, 3-per-mode shape', () => {
  const set = {
    challenges: [{ id: 'c1', mode: 'challenge', prompt: 'x'.repeat(4001), expects: ['x'.repeat(301), '```js\ncode\n```', 'a fine idea'] }],
    cases: [],
  };
  const problems = validateSet(set, { minPerMode: 0 });
  assert.ok(problems.some(problem => problem.includes('prompt must be at most 4000')));
  assert.ok(problems.some(problem => problem.includes('each idea must be 1-300')));
  assert.ok(problems.some(problem => problem.includes('challenges: expected 6, got 1')));
  assert.ok(problems.some(problem => problem.includes('expected 3 challenge, got 1')));
  assert.ok(problems.some(problem => problem.includes('expected 3 explain_back, got 0')));
});
