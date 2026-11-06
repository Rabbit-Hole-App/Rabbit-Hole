import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMarkdownForActor } from '../src/roadmap/roadmap-source-reader.js';
import { readRoadmapSource } from '../src/roadmap/roadmap-source.js';

const REV = 'sha256:' + '1'.repeat(64);
// A D1 double that applies the real WHERE clause values (id, org, owner) to one stored row.
const env = (row, body = '# Notes\nGradient descent.', objects = { 'r2/f1': body }) => ({
  LEARN_DB: { prepare: () => ({ bind: (id, org, owner) => ({ first: async () => (row && row.id === id && row.org === org && row.owner_email === owner ? row : null) }) }) },
  LEARN_MEDIA: { get: async key => (objects[key] == null ? null : { text: async () => objects[key] }) },
});
const row = { id: 'f1', org: 'o', owner_email: 'a@x.test', name: 'notes.md', family: 'markdown', bytes: 24, sha256: REV, r2_key: 'r2/f1' };
const me = { org: 'o', actorEmail: 'a@x.test' };

test('the owner reads their stored Markdown at its revision', async () => {
  const out = await readMarkdownForActor(env(row), me, { key: 'file:f1', rev: REV });
  assert.deepEqual(out, { status: 'ok', text: '# Notes\nGradient descent.', rev: REV, name: 'notes.md', complete: true });
});

test('another learner, another org, an unknown id and a bad key all get the same answer or none', async () => {
  for (const [access, key] of [[{ org: 'o', actorEmail: 'b@x.test' }, 'file:f1'], [{ org: 'p', actorEmail: 'a@x.test' }, 'file:f1'], [me, 'file:nope']])
    assert.deepEqual(await readMarkdownForActor(env(row), access, { key, rev: REV }), { status: 'missing' });
  assert.equal((await readMarkdownForActor(env(row), me, { key: 'pdf:upload:x', rev: REV })).status, 'unsupported');
  assert.equal((await readMarkdownForActor(env(row), me, { key: 'file:f1/../x', rev: REV })).status, 'unsupported');
});

test('a changed revision, a non-Markdown source and a missing object are typed', async () => {
  assert.deepEqual(await readMarkdownForActor(env({ ...row, sha256: 'sha256:' + '2'.repeat(64) }), me, { key: 'file:f1', rev: REV }), { status: 'changed', rev: 'sha256:' + '2'.repeat(64) });
  assert.equal((await readMarkdownForActor(env({ ...row, family: 'pdf' }), me, { key: 'file:f1', rev: REV })).status, 'unsupported');
  assert.equal((await readMarkdownForActor(env(row, '', {}), me, { key: 'file:f1', rev: REV })).status, 'missing');
});

test('a file too big to read is reported incomplete, so the roadmap offers a passage and never a prefix', async () => {
  const big = await readMarkdownForActor(env({ ...row, bytes: 3 * 1024 * 1024 }), me, { key: 'file:f1', rev: REV });
  assert.equal(big.complete, false);
  const out = await readRoadmapSource({}, me, { ref: { key: 'file:f1', rev: REV }, scope: { kind: 'declared' } }, { readSourceForActor: (e, a, r) => readMarkdownForActor(env({ ...row, bytes: 3 * 1024 * 1024 }), a, r) });
  assert.deepEqual([out.status, out.reason, out.text], ['needs_clarification', 'source_incomplete', undefined]);
});

test('a large but readable file is read whole, and the roadmap bound then reports it too large with offers', async () => {
  const body = 'z'.repeat(50000);
  const out = await readRoadmapSource({}, me, { ref: { key: 'file:f1', rev: REV }, scope: { kind: 'declared' } }, { readSourceForActor: (e, a, r) => readMarkdownForActor(env({ ...row, bytes: 50000 }, body), a, r) });
  assert.deepEqual([out.status, out.reason, out.offers], ['needs_clarification', 'source_too_large', ['passage', 'section']]);
  const passage = await readRoadmapSource({}, me, { ref: { key: 'file:f1', rev: REV }, scope: { kind: 'passage', start: 100, end: 200 } }, { readSourceForActor: (e, a, r) => readMarkdownForActor(env({ ...row, bytes: 50000 }, body), a, r) });
  assert.deepEqual([passage.status, passage.text.length], ['ok', 100]);
});
