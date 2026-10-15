import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REFS, REF_CARD, cardParam, reIdRefs, refCardSpot, withRef, withoutRef, withoutCardParam } from './canvas-refs-model.js';

const card = { id: 'c1', type: 'explanation', dx: 0, dy: 0 };

test('addRef: a card gains a ref; the same target again is exists; a canvas-ref card, a missing card and the 21st are refused', () => {
  const added = withRef(card, 'board-b', 'r1');
  assert.deepEqual(added, { refs: [{ id: 'r1', target: 'board-b' }] });
  assert.equal(card.refs, undefined, 'the card itself is untouched');
  assert.deepEqual(withRef({ ...card, refs: added.refs }, 'board-b'), { reason: 'exists' });
  assert.deepEqual(withRef({ id: 'x', type: 'canvas-ref', refs: [{ id: 'r', target: 'board-c' }] }, 'board-d'), { reason: 'unsupported' });
  assert.deepEqual(withRef(undefined, 'board-b'), { reason: 'unsupported' }, 'a chat card, item or shape is not a block');
  assert.deepEqual(withRef(card, ''), { reason: 'unsupported' });
  const full = { ...card, refs: Array.from({ length: MAX_REFS }, (_, i) => ({ id: `r${i}`, target: `t${i}` })) };
  assert.deepEqual(withRef(full, 'one-more'), { reason: 'limit' });
});

test('removeRef drops one ref; an unknown ref is null (no undo step)', () => {
  const block = { ...card, refs: [{ id: 'r1', target: 'a' }, { id: 'r2', target: 'b' }] };
  assert.deepEqual(withoutRef(block, 'r1'), [{ id: 'r2', target: 'b' }]);
  assert.equal(withoutRef(block, 'nope'), null);
  assert.equal(withoutRef(card, 'r1'), null);
});

test('Undo restores refs: the snapshot taken before an edit still holds the refs it had', () => {
  // canvasApi snapshots the blocks array, then maps the card to a new object (AdaptiveCanvas addRef/removeRef).
  const history = [];
  let blocks = [{ ...card, refs: [{ id: 'r1', target: 'a' }] }];
  const edit = (id, refs) => { history.push(blocks); blocks = blocks.map(block => (block.id === id ? { ...block, refs } : block)); };
  edit('c1', withoutRef(blocks[0], 'r1'));
  assert.deepEqual(blocks[0].refs, []);
  blocks = history.pop();
  assert.deepEqual(blocks[0].refs, [{ id: 'r1', target: 'a' }]);
  edit('c1', withRef(blocks[0], 'b', 'r2').refs);
  blocks = history.pop();
  assert.deepEqual(blocks[0].refs, [{ id: 'r1', target: 'a' }], 'undoing an add leaves the one ref, never a duplicate');
});

test('pasteIds re-id: a copy keeps the targets under new ref ids', () => {
  const refs = [{ id: 'r1', target: 'a' }, { id: 'r2', target: 'b' }];
  const copy = reIdRefs(refs);
  assert.deepEqual(copy.map(ref => ref.target), ['a', 'b']);
  assert.ok(copy.every((ref, i) => ref.id && ref.id !== refs[i].id));
  assert.notEqual(copy[0].id, copy[1].id);
  assert.deepEqual(refs, [{ id: 'r1', target: 'a' }, { id: 'r2', target: 'b' }], 'the source keeps its ids');
});

test('insertRefCard placement: near the point, never on an obstacle or the point, inside the view when it fits', () => {
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const visible = { x: 0, y: 0, w: 1200, h: 800 };
  const obstacles = [{ x: 380, y: 200, w: 400, h: 300 }, { x: 0, y: 0, w: 300, h: 150 }];
  // Empty-canvas points: the menu that passes one opens on empty canvas.
  for (const point of [{ x: 340, y: 300 }, { x: 900, y: 300 }, { x: 100, y: 600 }]) {
    const spot = refCardSpot(point, obstacles, visible);
    const box = { x: spot.x, y: spot.y, ...REF_CARD };
    assert.ok(!obstacles.some(obstacle => overlap(box, obstacle)), `free at ${JSON.stringify(point)}`);
    assert.ok(!overlap(box, { ...point, w: 1, h: 1 }), 'the point stays uncovered');
    assert.equal(spot.offscreen, false);
    assert.ok(Math.hypot(spot.x - point.x, spot.y - point.y) < 600, 'near the point');
  }
});

test('card= parsing: the id or null, and the address without it', () => {
  assert.equal(cardParam('?card=abc-123'), 'abc-123');
  assert.equal(cardParam('?x=1&card=%20k-exp%20'), 'k-exp');
  assert.equal(cardParam('?card='), null);
  assert.equal(cardParam(''), null);
  assert.equal(cardParam(`?card=${'a'.repeat(201)}`), null);
  assert.equal(withoutCardParam('https://x.dev/apps/n?card=abc&tab=links#h'), '/apps/n?tab=links#h');
  assert.equal(withoutCardParam('https://x.dev/c/b1?card=abc'), '/c/b1');
});
