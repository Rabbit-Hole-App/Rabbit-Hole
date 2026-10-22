// EXP-T20 slice 3 (Lane L2): an /explain job's Chat refs are read on the server under the asker's access, never from the text
// the browser sent with them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPLAIN_REF_TEXT, resolveExplainRefs } from '../src/explain-context-refs.js';

const user = { org: 'o', email: 'a@example.com' }, board = { id: 'b1', app: 'canvas-1', board: 'main' };
const COMMIT = 'a'.repeat(40);
const codeRef = { sourceId: `code:octo/repo@${COMMIT}:src/heap.js`, kind: 'code', name: 'heap.js', version: COMMIT, range: { path: 'src/heap.js', start: 1, end: 9 } };
const cardRef = { sourceId: 'card:c1', kind: 'card', name: 'Heap notes', version: '', range: null, text: 'browser-sent words the server must not read' };
const fileRef = { sourceId: `file:fs_${'c'.repeat(24)}@${'b'.repeat(64)}`, kind: 'file', name: 'notes.pdf', version: '', range: null };

test('code and file refs are read by the server readers; other kinds are named only; browser text is never used', async () => {
  const seen = {};
  const code = async (env, who, refs, snapshot) => { seen.code = [who, refs.map(r => r.sourceId), snapshot]; return [{ name: 'heap.js', status: 'read', code: { path: 'src/heap.js', content: 'function siftDown() {}' } }]; };
  const files = async (req, env, refs, options) => { seen.files = [refs.map(r => r.sourceId), options]; return { coverage: new Map([[`${fileRef.sourceId}|null`, 'full text']]), blocks: ['[p. 1] A heap is a tree.'] }; };
  const out = await resolveExplainRefs({}, {}, { user, board }, [codeRef, cardRef, fileRef], { code, files });
  assert.deepEqual(seen.code, [user, [codeRef.sourceId], null]);
  assert.deepEqual(seen.files, [[fileRef.sourceId], { user, app: 'canvas-1' }], 'files are authorized on this canvas, as its owner');
  assert.deepEqual(out.refs.map(r => [r.kind, r.status]), [['code', 'read'], ['card', 'listed'], ['file', 'full text']]);
  assert.match(out.text, /siftDown/);
  assert.match(out.text, /A heap is a tree/);
  assert.doesNotMatch(out.text, /browser-sent/);
});

test('an unreadable repository or file is said, not read; malformed refs are refused; the text is bounded', async () => {
  const denied = await resolveExplainRefs({}, {}, { user, board }, [codeRef, fileRef], {
    code: async () => [{ name: 'heap.js', status: 'unavailable', reason: 'This code is not available to you' }],
    files: async () => { throw new Error('no access'); },
  });
  assert.deepEqual(denied.refs.map(r => r.status), ['unavailable', 'unavailable']);
  assert.equal(denied.text, '');
  await assert.rejects(resolveExplainRefs({}, {}, { user, board }, [{ kind: 'nope' }]), error => error.status === 400);
  await assert.rejects(resolveExplainRefs({}, {}, { user, board }, 'x'), error => error.status === 400);
  const big = await resolveExplainRefs({}, {}, { user, board }, [codeRef], { code: async () => [{ name: 'heap.js', status: 'read', code: { content: 'x'.repeat(EXPLAIN_REF_TEXT * 2) } }] });
  assert.equal(big.text.length, EXPLAIN_REF_TEXT);
});
