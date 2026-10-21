// motion_request.context (owner brief 2026-10-21 message 7 item 4; frozen in motion-activation-brief.md): the bounds and the
// repository-card rule every reader shares. The resolver's use of it is learn-render/motion/resolution.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTION_TEXT_MAX, validateMotionContext } from '../src/motion-context.js';

test('context: absent or empty is none; a card is its id, kind, title and plain text', () => {
  for (const none of [undefined, null, {}]) assert.equal(validateMotionContext(none), null);
  assert.deepEqual(validateMotionContext({ selection: { cardId: 'c1', kind: 'Explanation', text: 'Binary search halves a sorted range.' } }), { selection: { cardId: 'c1', kind: 'Explanation', text: 'Binary search halves a sorted range.' } });
  assert.equal(SELECTION_TEXT_MAX, 4000);
  assert.equal(validateMotionContext({ selection: { cardId: 'c1', kind: 'K', text: 'é'.repeat(4000) } }).selection.text.length, 4000);
});

test('context: oversize, missing or unknown fields are refused; only a repository card carries one-commit refs', () => {
  const ref = { commit: 'b'.repeat(40), path: 'src/a.py', start: 1, end: 300 };
  assert.deepEqual(validateMotionContext({ selection: { cardId: 'k', kind: 'repo-code', title: 'a.py', sourceRefs: [ref] } }).selection.sourceRefs, [ref]);
  for (const [bad, why] of [
    [[], /an object/], [{ selection: 'x' }, /selection: an object/], [{ other: 1 }, /unknown field other/],
    [{ selection: { kind: 'K', text: 't' } }, /cardId/], [{ selection: { cardId: 'c', text: 't' } }, /kind/],
    [{ selection: { cardId: 'c', kind: 'K', text: 't'.repeat(4001) } }, /text: a non-empty string of at most 4000/],
    [{ selection: { cardId: 'c', kind: 'K', title: 't'.repeat(301), text: 't' } }, /title/],
    [{ selection: { cardId: 'c', kind: 'Explanation', text: 't', sourceRefs: [ref] } }, /only a repository card/],
    [{ selection: { cardId: 'c', kind: 'repo-code', sourceRefs: [] } }, /1 to 8 refs/],
    [{ selection: { cardId: 'c', kind: 'repo-code', sourceRefs: [{ ...ref, end: 301 }] } }, /at most 300/],
    [{ selection: { cardId: 'c', kind: 'repo-code', sourceRefs: [{ ...ref, commit: 'b'.repeat(39) }] } }, /commit/],
    [{ selection: { cardId: 'c', kind: 'repo-code', sourceRefs: [ref, { ...ref, commit: 'c'.repeat(40) }] } }, /the card's one full 40-hex commit/],
    [{ selection: { cardId: 'c', kind: 'repo-code', sourceRefs: [{ ...ref, path: `a${String.fromCharCode(92)}b.py` }] } }, /relative repository path/],
    [{ selection: { cardId: 'c', kind: 'repo-code', sourceRefs: [{ ...ref, url: 'https://x' }] } }, /unknown field url/],
  ]) assert.throws(() => validateMotionContext(bad), why, JSON.stringify(bad).slice(0, 80));
});
