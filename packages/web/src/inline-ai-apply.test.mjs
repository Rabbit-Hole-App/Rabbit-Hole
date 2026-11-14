import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTx, cardTx, describeChange, editTx, explainTx, placeNote, validateEdit } from './inline-ai-apply.js';
import { freezeTarget } from './inline-ai-context.js';
import { flowBoard, treeBoard, withBoxes } from './inline-ai-fixtures.js';

const frozenOf = (board, ids, range) => freezeTarget(board, ids, range ? { range } : {});

test('derived cards preserve the exact selected range through Accept and saved reload', () => {
  const board = flowBoard();
  const before = JSON.stringify(board);
  const frozen = frozenOf(board, ['para'], { id: 'para', from: 19, to: 51, text: 'Then the table renders every row' });
  const tx = cardTx({ requestId: 'range-card', block: { type: 'text', text: 'Explanation' }, frozen, board, route: 'explain' });
  const saved = JSON.parse(JSON.stringify(applyTx(board, tx)));
  const card = saved.blocks.find(entry => entry.id === tx.block.id);
  assert.deepEqual(card.inline.sources, ['para']);
  assert.deepEqual(card.inline.range, { id: 'para', from: 19, to: 51 });
  assert.equal(JSON.stringify(board), before, 'source board remains untouched');
  assert.equal(applyTx(saved, tx).blocks.length, saved.blocks.length, 'repeated Accept adds no duplicate');
  frozen.range.from = 0;
  assert.equal(tx.block.inline.range.from, 19, 'provenance is detached from mutable request state');
});

test('an edit may touch only the authorized ids, through the listed operations', () => {
  const board = flowBoard();
  const frozen = frozenOf(board, ['g1']);
  const out = validateEdit({ ops: [{ op: 'replace_text', id: 'g1', text: 'Load orders' }, { op: 'replace_text', id: 'g2', text: 'hacked' }, { op: 'delete', id: 'g1' }] }, frozen, board);
  assert.equal(out.ok, false);
  assert.deepEqual(out.errors, ['g2 is outside the selection.', '"delete" is not an allowed edit.']);
  const good = validateEdit({ ops: [{ op: 'replace_text', id: 'g1', text: 'Load orders' }] }, frozen, board);
  assert.equal(good.ok, true);
  assert.equal(good.changes[0].after.text, 'Load orders');
  assert.equal(good.changes[0].after.groupId, 'grp', 'group membership kept');
  assert.equal(good.changes[0].after.x1, 100, 'position kept');
});

test('a range edit inside a group replaces only that range, keeps the words around it and their formatting', () => {
  const board = flowBoard();
  const frozen = frozenOf(board, ['para', 'para2'], { id: 'para', from: 19, to: 51, text: 'Then the table renders every row' });
  assert.equal(validateEdit({ ops: [{ op: 'replace_text', id: 'para', text: 'x' }] }, frozen, board).ok, false, 'no whole-object rewrite from a range');
  assert.equal(validateEdit({ ops: [{ op: 'replace_text', id: 'para2', text: 'x' }] }, frozen, board).ok, false, 'no other group member');
  assert.equal(validateEdit({ ops: [{ op: 'replace_range', id: 'para', from: 0, to: 51, text: 'x' }] }, frozen, board).ok, false, 'no wider range');
  const out = validateEdit({ ops: [{ op: 'replace_range', id: 'para', from: 19, to: 51, text: 'Then the table draws each row' }] }, frozen, board);
  assert.equal(out.ok, true);
  const after = out.changes[0].after;
  assert.equal(after.text, 'Orders load first. Then the table draws each row, which can be slow for big lists.');
  assert.deepEqual(after.runs, [{ t: 'Orders load first. ' }, { t: 'Then the table draws each row', b: true }, { t: ', which can be slow for big lists.' }]);
  assert.equal(after.groupId, 'grp2');
  const tx = editTx({ requestId: 'r', changes: out.changes });
  const next = applyTx(board, tx);
  assert.equal(next.items.find(item => item.id === 'para2'), board.items.find(item => item.id === 'para2'), 'the other member is untouched');
});

test('a range edit refuses when the selected words changed meanwhile', () => {
  const board = flowBoard();
  const frozen = frozenOf(board, [], { id: 'para', from: 19, to: 51, text: 'Then the table renders every row' });
  const changed = { ...board, items: board.items.map(item => (item.id === 'para' ? { ...item, text: 'Totally different words now, longer than before.', runs: undefined } : item)) };
  assert.deepEqual(validateEdit({ ops: [{ op: 'replace_range', id: 'para', from: 19, to: 51, text: 'x' }] }, frozen, changed).errors, ['The selected words changed since you asked.']);
});

test('code keeps its Code mode; generated code is text, never run', () => {
  const board = flowBoard();
  const fixed = 'def total(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s';
  const out = validateEdit({ ops: [{ op: 'replace_text', id: 'code1', text: fixed }] }, frozenOf(board, ['code1']), board);
  assert.equal(out.ok, true);
  assert.equal(out.changes[0].after.mode, 'code');
  assert.equal(out.changes[0].after.text, fixed);
  assert.deepEqual(describeChange(out.changes[0]).after, fixed);
});

test('"make these labels larger" restyles the selected objects only, within the allowed values', () => {
  const board = treeBoard();
  const frozen = frozenOf(board, ['n3', 'n23']);
  const out = validateEdit({ ops: [{ op: 'set_style', id: 'n3', style: { fontSize: 24 } }, { op: 'set_style', id: 'n23', style: { fontSize: 24 } }] }, frozen, board);
  assert.equal(out.ok, true);
  assert.deepEqual(out.changes.map(change => [change.id, change.after.fontSize]), [['n3', 24], ['n23', 24]]);
  assert.equal(validateEdit({ ops: [{ op: 'set_style', id: 'n3', style: { fontSize: 9999 } }] }, frozen, board).changes[0].after.fontSize, 160, 'clamped as the size field clamps');
  assert.equal(validateEdit({ ops: [{ op: 'set_style', id: 'n3', style: { fontSize: 'huge' } }] }, frozen, board).ok, false);
  assert.equal(validateEdit({ ops: [{ op: 'set_style', id: 'n3', style: { x1: 0 } }] }, frozen, board).ok, false, 'position is not a style');
  const level = validateEdit({ ops: [{ op: 'set_style', id: 'n3', style: { level: 'h2' } }] }, frozen, board);
  assert.equal(level.changes[0].after.level, 'h2');
});

test('locked objects, gone objects and an empty edit with a limitation are refused with the reason', () => {
  const board = treeBoard();
  board.shapes[0].locked = true;
  assert.deepEqual(validateEdit({ ops: [{ op: 'replace_text', id: 'n1', text: 'x' }] }, frozenOf(board, ['n1']), board).errors, ['n1 is locked.']);
  const frozen = frozenOf(board, ['n3']);
  const gone = { ...board, shapes: board.shapes.filter(shape => shape.id !== 'n3') };
  assert.deepEqual(validateEdit({ ops: [{ op: 'replace_text', id: 'n3', text: 'x' }] }, frozen, gone).errors, ['n3 is no longer on the canvas.']);
  const limited = validateEdit({ ops: [], limitation: 'Renaming every node needs them selected.' }, frozen, board);
  assert.equal(limited.ok, false);
  assert.equal(limited.limitation, 'Renaming every node needs them selected.');
});

test('the note lands in free space beside the target, inside the view when it can, never over anything', () => {
  const board = withBoxes(treeBoard());
  const target = board.boxes.n23;
  const obstacles = Object.entries(board.boxes).filter(([id]) => id !== 'n23').map(([, box]) => box);
  const size = { w: 260, h: 64 };
  const place = placeNote(target, size, obstacles, { x: 0, y: 0, w: 1400, h: 900 });
  const over = obstacles.some(box => place.x < box.x + box.w && place.x + size.w > box.x && place.y < box.y + box.h && place.y + size.h > box.y);
  assert.equal(over, false);
  assert.equal(place.side, 'right');
  // A different layout: the right side is taken, so it goes elsewhere.
  const crowded = placeNote(target, size, [...obstacles, { x: target.x + target.w + 10, y: target.y - 200, w: 600, h: 500 }], null);
  assert.notEqual(crowded.side, 'right');
});

test('explain: one note and one annotation connector, with provenance; Accept twice adds them once', () => {
  const board = withBoxes(treeBoard());
  const frozen = frozenOf(board, ['n23']);
  const tx = explainTx({ requestId: 'r9', text: 'Node 23 is a child of node 4.', frozen, board, boxes: { target: board.boxes.n23, obstacles: [] }, size: { w: 260, h: 60 } });
  assert.equal(tx.links[0].kind, 'annotation');
  assert.equal(tx.links[0].to, 'n23');
  assert.deepEqual(tx.shapes[0].inline.sources, ['n23']);
  const once = applyTx(board, tx);
  const twice = applyTx(once, tx);
  assert.equal(twice.shapes.length, board.shapes.length + 1);
  assert.equal(twice.links.length, board.links.length + 1);
  assert.deepEqual(once.shapes.slice(0, board.shapes.length), board.shapes, 'the tree itself is unchanged');
  assert.deepEqual(once.links.slice(0, board.links.length), board.links);
  // A group gets one note and no per-member arrows.
  const group = explainTx({ requestId: 'g', text: 'Orders load, then the table renders.', frozen: frozenOf(flowBoard(), ['g1', 'g2']), board: flowBoard(), boxes: { target: { x: 100, y: 950, w: 410, h: 60 }, obstacles: [] }, size: { w: 260, h: 60 } });
  assert.equal(group.shapes.length, 1);
  assert.equal(group.links.length, 0);
});

test('a generated card goes after the target card with its provenance, once', () => {
  const board = flowBoard();
  const frozen = frozenOf(board, ['img1']);
  const tx = cardTx({ requestId: 'c1', block: { type: 'flow', title: 'Tree', spec: { nodes: [], edges: [] } }, frozen, board, route: 'diagram' });
  const next = applyTx(applyTx(board, tx), tx);
  assert.equal(next.blocks.length, 2);
  assert.equal(next.blocks[1].type, 'flow');
  assert.deepEqual(next.blocks[1].inline, { requestId: 'c1', mode: 'explain', route: 'diagram', sources: ['img1'] });
  assert.equal(tx.links[0].kind, 'annotation');
});

test('a generated card keeps the words typed into the editor as its prompt (card-prompt.md); none typed, none kept', () => {
  const board = flowBoard();
  const block = { type: 'flow', title: 'Tree', spec: { nodes: [], edges: [] } };
  const typed = cardTx({ requestId: 'c1', block, frozen: { ...frozenOf(board, ['img1']), words: '  draw this as a tree ' }, board, route: 'diagram' });
  assert.equal(typed.block.promptUsed, 'draw this as a tree');
  assert.equal(typed.links[0].promptUsed, undefined, 'the connector carries no prompt');
  const none = cardTx({ requestId: 'c2', block, frozen: frozenOf(board, ['img1']), board, route: 'diagram' });
  assert.ok(!Object.hasOwn(none.block, 'promptUsed'));
});

test('an unrelated concurrent edit survives an accepted edit', () => {
  const board = flowBoard();
  const out = validateEdit({ ops: [{ op: 'replace_text', id: 'g1', text: 'Load orders' }] }, frozenOf(board, ['g1']), board);
  const concurrently = { ...board, shapes: board.shapes.map(shape => (shape.id === 'g2' ? { ...shape, text: 'Draw the table' } : shape)) };
  const next = applyTx(concurrently, editTx({ requestId: 'r', changes: out.changes }));
  assert.equal(next.shapes.find(shape => shape.id === 'g2').text, 'Draw the table');
  assert.equal(next.shapes.find(shape => shape.id === 'g1').text, 'Load orders');
});
