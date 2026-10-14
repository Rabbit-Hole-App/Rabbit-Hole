// Curious where this goes? (docs/features/professor-next-steps.md 2.8, owner task 2): the canvas side - one read once the
// canvas has been still, settling at once while typed words differ, focus on recent edits. Fake timers; no React.
import test from 'node:test';
import assert from 'node:assert/strict';
import { curiousSnapshot, semanticReader } from './curious-context.js';

function clock() {
  const timers = new Map();
  let id = 0;
  return {
    setTimer: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
    clearTimer: key => timers.delete(key),
    fire: () => { const entries = [...timers]; timers.clear(); for (const [, t] of entries) t.fn(); },
    pending: () => timers.size,
    last: () => [...timers.values()].at(-1)?.ms,
  };
}
const board = (text = 'binary search tree') => ({
  shapes: [{ id: 's1', kind: 'ellipse', x1: 0, y1: 0, x2: 40, y2: 40, text: '8' }],
  items: [{ id: 't1', kind: 'text', x: 300, y: 0, w: 200, text }, { id: 't2', kind: 'text', x: 300, y: 200, w: 200, text: 'in-order walk' }],
  links: [], blocks: [], groups: [], exchanges: [],
});
function rig() {
  const c = clock(), reports = [], live = { board: board(), editor: null, selection: [] };
  const reader = semanticReader({ board: () => live.board, editor: () => live.editor, selection: () => live.selection, report: r => reports.push(r), setTimer: c.setTimer, clearTimer: c.clearTimer });
  return { c, reports, live, reader };
}

test('a burst of changes is one read, once the canvas has been still for 150 ms', () => {
  const r = rig();
  for (let i = 0; i < 10; i++) { r.live.board = board(`tree ${i}`); r.reader.changed(); }
  assert.deepEqual([r.reader.reads(), r.c.pending(), r.c.last()], [0, 1, 150], 'nothing read mid-burst');
  r.c.fire();
  assert.equal(r.reader.reads(), 1);
  assert.equal(r.reader.value().fingerprint, curiousSnapshot(board('tree 9')).fingerprint, 'the read is of the last state');
  assert.deepEqual(r.reports, [{ fingerprint: r.reader.value().fingerprint, settling: false }]);
});

test('a move reads the same fingerprint; a same-id text edit reads a new one', () => {
  const r = rig();
  r.reader.changed(); r.c.fire();
  const first = r.reader.value().fingerprint;
  r.live.board = { ...board(), shapes: [{ ...board().shapes[0], y1: 500, y2: 540 }] };
  r.reader.changed(); r.c.fire();
  assert.equal(r.reader.value().fingerprint, first);
  r.live.board = board('AVL tree');
  r.reader.changed(); r.c.fire();
  assert.notEqual(r.reader.value().fingerprint, first);
});

test('typed words that differ from the last read settle at once, before the read; a caret move or opening an editor does not', () => {
  const r = rig();
  r.reader.changed(); r.c.fire();
  r.live.editor = { id: 't1', text: 'binary search tree' };
  r.reader.changed();
  assert.equal(r.reports.some(x => x.settling), false, 'opening an editor is not a change');
  r.c.fire();
  r.reader.changed();
  assert.equal(r.reports.some(x => x.settling), false, 'the same words (a caret move) are not a change');
  r.c.fire();
  const before = r.reports.length;
  r.live.editor = { id: 't1', text: 'binary search tree, balanced' };
  r.reader.changed();
  assert.deepEqual(r.reports.at(-1), { fingerprint: r.reader.value().fingerprint, settling: true }, 'settling at once');
  r.live.editor = { id: 't1', text: 'binary search tree, balanced?' };
  r.reader.changed();
  assert.equal(r.reports.length, before + 1, 'one settling report per burst');
  r.live.board = board('binary search tree, balanced?');
  r.c.fire();
  assert.equal(r.reports.at(-1).settling, false);
});

test('the read is focused on recent edits, then the selection', () => {
  const r = rig();
  r.reader.changed(); r.c.fire();
  r.live.board = { ...board(), items: [board().items[0], { ...board().items[1], text: 'pre-order walk' }] };
  r.live.selection = ['s1'];
  r.reader.changed(); r.c.fire();
  assert.deepEqual(r.reader.value().snapshot.objects.map(o => o.id), ['t2', 's1', 't1']);
});

test('dispose cancels a pending read', () => {
  const r = rig();
  r.reader.changed();
  r.reader.dispose();
  assert.equal(r.c.pending(), 0);
});
