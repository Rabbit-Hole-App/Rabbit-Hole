import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadedPaperId, paperObjectKey, uploadedPaperTitle, PAPER_UPLOAD_LIMIT } from '../src/learn-paper.js';

const identity = { org: 'workspace-a', name: 'nanogpt', email: 'owner@example.test' };

test('an upload id is the literal prefix and twelve hex characters', () => {
  assert.equal(uploadedPaperId('upload:0123456789ab'), 'upload:0123456789ab');
  for (const bad of ['upload:0123456789', 'upload:0123456789abc', 'upload:0123456789AB', 'upload:', 'uploads:0123456789ab', '2501.1234', '', null, undefined, 42]) {
    assert.throws(() => uploadedPaperId(bad), /paper/i, `rejects ${JSON.stringify(bad)}`);
  }
});

// An arXiv id must never satisfy the upload gate, or the two paths cross.
test('an arXiv id is not an upload id', () => {
  assert.throws(() => uploadedPaperId('1706.03762'));
  assert.throws(() => uploadedPaperId('https://arxiv.org/abs/1706.03762'));
});

test('a traversal attempt cannot escape the prefix', () => {
  for (const bad of ['upload:../../etc', 'upload:0123456789a/', 'upload:0123456789a.']) assert.throws(() => uploadedPaperId(bad));
});

test('the object key is namespaced by identity and ends with the id', async () => {
  const key = await paperObjectKey(identity, 'upload:0123456789ab');
  assert.ok(key.startsWith('learn-papers/'), key);
  assert.ok(key.endsWith('/upload:0123456789ab'), key);
});

// The key must come from the session, never from anything a caller can choose,
// or one learner could read another's upload by asking for their key.
test('a different identity gives a different key for the same id', async () => {
  const mine = await paperObjectKey(identity, 'upload:0123456789ab');
  const theirs = await paperObjectKey({ ...identity, email: 'someone@example.test' }, 'upload:0123456789ab');
  assert.notEqual(mine, theirs);
  const otherApp = await paperObjectKey({ ...identity, name: 'other' }, 'upload:0123456789ab');
  assert.notEqual(mine, otherApp);
});

test('the same identity is stable across calls', async () => {
  assert.equal(await paperObjectKey(identity, 'upload:0123456789ab'), await paperObjectKey({ ...identity }, 'upload:0123456789ab'));
});

test('the key carries no raw address', async () => {
  const key = await paperObjectKey(identity, 'upload:0123456789ab');
  assert.ok(!key.includes('owner@example.test'), key);
  assert.ok(!key.includes('workspace-a'), key);
});

// A filename becomes a title, so it must survive the trip and stay bounded.
test('a title is trimmed, bounded, and never empty', () => {
  assert.equal(uploadedPaperTitle('lecture notes.pdf'), 'lecture notes.pdf');
  assert.equal(uploadedPaperTitle('   spaced.pdf  '), 'spaced.pdf');
  assert.equal(uploadedPaperTitle(''), 'Uploaded PDF');
  assert.equal(uploadedPaperTitle(null), 'Uploaded PDF');
  assert.equal(uploadedPaperTitle('x'.repeat(400)).length, 200);
});

// Control characters would travel into a header and into the model's context.
test('a title cannot smuggle newlines', () => {
  assert.equal(uploadedPaperTitle('a\nb\rc\td'), 'a b c d');
});

test('the upload ceiling is stated once and is conservative', () => {
  assert.equal(PAPER_UPLOAD_LIMIT, 5 * 1024 * 1024);
});
