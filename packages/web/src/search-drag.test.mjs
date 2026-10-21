import test from 'node:test';
import assert from 'node:assert/strict';
import { applySearchDrop, dropSpot, linkCardFor, searchDrag, searchDragPayload, searchDropPlan } from './search-drag.js';

// UI-13 (owner brief 2026-10-21 message 21 item 2): what a Search result dropped on the canvas does.
const blocks = [{ id: 'card', type: 'explanation' }, { id: 'ref-card', type: 'canvas-ref', refs: [{ id: 'r', target: 'board-linked' }] }];
const boxes = { card: { x: 100, y: 50, w: 400, h: 200 }, 'ref-card': { x: 0, y: 600, w: 320, h: 72 }, item: { x: 10, y: 10, w: 160, h: 24 } };
const canvas = (extra = {}) => ({ readOnly: false, locked: new Set(), blocks, box: id => boxes[id] || null, ...extra });

test('only objects on this canvas and available linked canvases can be dragged', () => {
  assert.deepEqual(searchDragPayload({ kind: 'card', objectId: 'card', title: 'Card' }), { kind: 'object', id: 'card', title: 'Card' });
  assert.deepEqual(searchDragPayload({ kind: 'item', objectId: 'item', title: 'Note' }), { kind: 'object', id: 'item', title: 'Note' });
  assert.deepEqual(searchDragPayload({ kind: 'link', title: 'Graphs', target: { kind: 'link', id: 'board-x' }, link: { href: '/apps/g' } }), { kind: 'link', target: 'board-x', title: 'Graphs' });
  assert.equal(searchDragPayload({ kind: 'link', title: 'Unavailable canvas', target: { id: 'x' }, link: { unavailable: true } }), null);
  assert.equal(searchDragPayload({ kind: 'comment', objectId: 'card' }), null, 'a comment is not a card');
  assert.equal(searchDragPayload({ kind: 'document', objectId: 'doc' }), null, 'a document block stays in the document');
});
test('an existing card is repositioned, never copied; the drop point is its top centre at any zoom', () => {
  const plan = searchDropPlan({ kind: 'object', id: 'card' }, canvas());
  assert.deepEqual(plan, { action: 'move', id: 'card', size: { w: 400, h: 200 }, label: 'Move here' });
  assert.deepEqual(dropSpot(plan, { x: 1000, y: 300 }), { x: 800, y: 300 });
  const moves = [], api = { moveTo: (id, spot) => { moves.push([id, spot]); return true; }, insertRefCard: () => assert.fail('a move never inserts') };
  assert.deepEqual(applySearchDrop(api, plan, { x: 1000, y: 300 }), { id: 'card', message: null });
  assert.deepEqual(moves, [['card', { x: 800, y: 300 }]]);
});
test('a linked canvas adds one link card at the drop; one already here is moved instead of duplicated', () => {
  const fresh = searchDropPlan({ kind: 'link', target: 'board-new' }, canvas());
  assert.equal(fresh.action, 'link'); assert.deepEqual(fresh.size, { w: 320, h: 72 });
  const inserted = [];
  assert.deepEqual(applySearchDrop({ insertRefCard: (target, point, at) => { inserted.push([target, point, at]); return 'new-id'; } }, fresh, { x: 500, y: 100 }), { id: 'new-id', message: null });
  assert.deepEqual(inserted, [['board-new', null, { x: 340, y: 100 }]]);
  const again = searchDropPlan({ kind: 'link', target: 'board-linked' }, canvas());
  assert.equal(again.action, 'move'); assert.equal(again.id, 'ref-card');
  assert.match(again.message, /already on this canvas/);
  assert.equal(linkCardFor(blocks, 'board-linked').id, 'ref-card'); assert.equal(linkCardFor(blocks, 'other'), null);
});
test('a view-only canvas, a locked card or a vanished object refuses with a reason and changes nothing', () => {
  for (const [payload, extra, reason] of [
    [{ kind: 'object', id: 'card' }, { readOnly: true }, /view-only/],
    [{ kind: 'link', target: 'board-new' }, { readOnly: true }, /view-only/],
    [{ kind: 'object', id: 'card' }, { locked: new Set(['card']) }, /locked/],
    [{ kind: 'link', target: 'board-linked' }, { locked: new Set(['ref-card']) }, /locked/],
    [{ kind: 'object', id: 'gone' }, {}, /no longer on the canvas/]]) {
    const plan = searchDropPlan(payload, canvas(extra));
    assert.equal(plan.action, 'refuse'); assert.match(plan.reason, reason);
    assert.deepEqual(applySearchDrop({ moveTo: () => assert.fail('no move'), insertRefCard: () => assert.fail('no insert') }, plan, { x: 0, y: 0 }), { message: plan.reason });
  }
});
test('the drag in progress is kept for the canvas and cleared at its end', () => {
  const drag = searchDrag.start({ kind: 'object', id: 'card' });
  assert.equal(searchDrag.current(), drag);
  drag.outcome = { message: null };
  assert.equal(searchDrag.end(), drag); assert.equal(searchDrag.current(), null);
});
