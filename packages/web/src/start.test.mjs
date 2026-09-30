import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSubmit, pathOr, repositoryDecision, slugOf, teachPrompt, titleFromQuestion } from './start.js';

test('the dialog opens on the path it was asked for, Repository otherwise', () => {
  for (const path of ['repository', 'sources', 'question', 'blank']) assert.equal(pathOr(path), path);
  assert.equal(pathOr(undefined), 'repository');
  assert.equal(pathOr('share'), 'repository');
});

// The dialog renders WP1's router decision (agent/router.js rule 2) for the workspace's catalog;
// it never re-derives it (user decision, 2026-09-28).
const CTX = {
  catalog: [{ name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT', branch: 'master' }],
  scope: { org: 'gmail-com', kind: 'workspace', slug: null, title: null, selected: null },
};
const NANO = { slug: 'repo-1a2b3c4d-nanogpt', kind: 'repository', title: 'karpathy/nanoGPT' };

test('an unconnected repository connects; a connected one opens; another branch of it offers the choice', () => {
  assert.deepEqual(repositoryDecision('https://github.com/karpathy/minGPT', CTX),
    { type: 'command', name: 'connect_repository', args: { url: 'https://github.com/karpathy/minGPT', repo: 'karpathy/minGPT' } });
  assert.deepEqual(repositoryDecision('https://github.com/Karpathy/nanoGPT.git', CTX), { type: 'command', name: 'open_resource', args: NANO });
  assert.deepEqual(repositoryDecision('https://github.com/karpathy/nanoGPT/tree/dev', CTX), {
    type: 'choose',
    options: [
      { label: 'karpathy/nanoGPT (master) · Project', name: 'open_resource', args: NANO },
      { label: 'Connect karpathy/nanoGPT at dev', name: 'connect_repository', args: { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', branch: 'dev', newBranch: true } },
    ],
  });
});

test('anything that is not a repository link has no decision', () => {
  for (const text of ['https://gitlab.com/karpathy/nanoGPT', 'nanoGPT', '', 'how does https://github.com/karpathy/minGPT work?']) assert.equal(repositoryDecision(text, CTX), null, text);
});

test('Question: the canvas is named after the question, and depth rides the prompt', () => {
  assert.equal(titleFromQuestion('  why   does attention\n scale by sqrt(dk)? '), 'why does attention scale by sqrt(dk)?');
  assert.equal(titleFromQuestion('x'.repeat(200)).length, 80);
  assert.equal(teachPrompt(' why? ', null), 'why?');
  assert.equal(teachPrompt('why?', 'Deep dive'), 'why?\n\nDepth: Deep dive');
});

test('submit is possible only when the path has what it needs', () => {
  const f = { url: '', sources: '', method: 'upload', question: '', blank: '' };
  assert.equal(canSubmit('repository', f), false);
  assert.equal(canSubmit('repository', { ...f, url: 'https://github.com/a/b' }), true);
  assert.equal(canSubmit('question', { ...f, question: '   ' }), false);
  assert.equal(canSubmit('question', { ...f, question: 'why?' }), true);
  assert.equal(canSubmit('sources', f), true);
  assert.equal(canSubmit('sources', { ...f, method: 'connection' }), false); // every connection source is Planned (T02 §5)
  assert.equal(canSubmit('blank', f), true); // the title is optional: Untitled canvas
});

test('the new canvas slug is read from the command result', () => {
  assert.equal(slugOf('/apps/canvas-1a2b3c4d'), 'canvas-1a2b3c4d');
  assert.equal(slugOf('/apps/canvas-1a2b3c4d?tab=learn'), 'canvas-1a2b3c4d');
  assert.equal(slugOf(undefined), null);
});
