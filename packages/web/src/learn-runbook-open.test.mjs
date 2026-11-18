import test from 'node:test';
import assert from 'node:assert/strict';
import { answersOpenCode, openRunbookLink } from './learn-runbook.js';
import { openSourceLine } from './run-card-knobs.js';

const COMMIT = '3adf61e0000000000000000000000000000000aa';
const CANVAS = { appName: 'repo-nanogpt', repo: 'karpathy/nanoGPT', commit: COMMIT };
const HREF = `https://github.com/karpathy/nanoGPT/blob/${COMMIT}/README.md#L82-L103`;

function sent(open, args) {
  const events = [];
  const result = open(...args, { dispatch: event => { events.push(event); return true; }, open: () => {} });
  return { result, detail: events[0]?.detail };
}

test('a Runbook citation answers by repository: a card with no app or another commit still opens the snapshot file', () => {
  const { result, detail } = sent(openRunbookLink, [HREF, { repo: 'karpathy/nanoGPT', commit: COMMIT }]); // an older card: no app
  assert.equal(result, true);
  assert.deepEqual({ path: detail.path, start: detail.start, end: detail.end, sameRepo: detail.sameRepo }, { path: 'README.md', start: 82, end: 103, sameRepo: true });
  assert.equal(answersOpenCode(detail, CANVAS), true);
  assert.equal(answersOpenCode({ ...detail, commit: 'other', app: 'another-app' }, CANVAS), true, 'same repository, any commit');
  assert.equal(answersOpenCode({ ...detail, repo: 'someone/else' }, CANVAS), false, 'another repository is left to GitHub');
  assert.equal(answersOpenCode({ ...detail, repo: 'KARPATHY/nanogpt' }, CANVAS), true, 'repository names compare without case');
});

test('a Run card source line answers the same way', () => {
  const { result, detail } = sent(openSourceLine, ['sample.py:14', { repo: 'karpathy/nanoGPT', commit: COMMIT }]);
  assert.equal(result, true);
  assert.deepEqual({ path: detail.path, start: detail.start, end: detail.end }, { path: 'sample.py', start: 14, end: 14 });
  assert.equal(answersOpenCode(detail, CANVAS), true);
});

test('a code card event keeps its own rule: this app and this commit only', () => {
  const card = { app: 'repo-nanogpt', commit: COMMIT, path: 'model.py' };
  assert.equal(answersOpenCode(card, CANVAS), true);
  assert.equal(answersOpenCode({ ...card, commit: 'other' }, CANVAS), false);
  assert.equal(answersOpenCode({ ...card, app: 'other' }, CANVAS), false);
  assert.equal(answersOpenCode({ app: 'repo-nanogpt', commit: COMMIT }, CANVAS), false, 'no path');
  assert.equal(answersOpenCode({ sameRepo: true, path: 'a.py' }, CANVAS), false, 'sameRepo with no repo says nothing');
});
