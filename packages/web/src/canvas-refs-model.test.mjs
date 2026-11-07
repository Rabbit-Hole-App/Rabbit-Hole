import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REFS, REF_CARD, cardParam, reIdRefs, refCardSpot, withRef, withoutRef, withoutCardParam } from './canvas-refs-model.js';
import { chromeObstacles } from './canvas-slots.js';

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

test('insertRefCard placement: a click hemmed in by a sticky and a card column still lands in view, near the click', () => {
  // Toolbar's failing board: placeNote's rings put the card left of the click, off-screen, while the view had room below.
  const visible = { x: 84, y: 60, w: 1200, h: 900 }, point = { x: 140, y: 160 };
  const obstacles = [{ x: 190, y: 130, w: 160, h: 160 }, ...[70, 262, 455, 645].map(y => ({ x: 510, y, w: 345, h: 175 }))];
  const spot = refCardSpot(point, obstacles, visible), box = { x: spot.x, y: spot.y, ...REF_CARD };
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  assert.equal(spot.offscreen, false);
  assert.ok(box.x >= visible.x && box.x + box.w <= visible.x + visible.w, 'inside the view');
  assert.ok(!obstacles.some(obstacle => overlap(box, obstacle)) && !overlap(box, { ...point, w: 1, h: 1 }), 'free, the point uncovered');
  assert.ok(Math.hypot(spot.x - point.x, spot.y - point.y) < 260, 'near the click');
});

test('insertRefCard placement: a spot in view keeps clear of the floating bottom chrome, the hidden hooks corner included', () => {
  // canvas-refs-check step 2's board (C:/s/spec/refs-flake, surface px at view {0,0,1}): the column a1-a4, a reference card and
  // a sticky; the view's centre is on a3. Placed among the cards alone, the card lands lower right, where the Next Steps
  // skeleton appears the moment the insert changes their input.
  const view = { x: 0, y: 0, z: 1 }, height = 952, visible = { x: 24, y: 24, w: 1152, h: 904 }, centre = { x: 600, y: 476 };
  const obstacles = [[380, 24, 820, 195], [380, 215, 820, 386], [380, 406, 820, 577], [380, 597, 820, 725], [24, 276, 344, 348], [59, 83, 221, 245]]
    .map(([l, t, r, b]) => ({ x: l, y: t, w: r - l, h: b - t }));
  const hooks = { left: 1068, right: 1276, top: 688 }, zoom = { left: -28, right: 156, top: 770 };
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const under = (spot, rect) => overlap({ x: spot.x, y: spot.y, ...REF_CARD }, { x: rect.left, y: rect.top, w: rect.right - rect.left, h: height - rect.top });
  assert.ok(under(refCardSpot(centre, obstacles, visible), hooks), 'the board reproduces the bug: without the chrome the card lands under the hooks');
  const spot = refCardSpot(centre, [...obstacles, ...chromeObstacles([hooks, zoom], height, view)], visible);
  assert.equal(spot.offscreen, false);
  assert.ok(!under(spot, hooks) && !under(spot, zoom), `clear of the bottom chrome (${spot.x},${spot.y})`);
  assert.ok(!obstacles.some(box => overlap({ x: spot.x, y: spot.y, ...REF_CARD }, box)), 'and of every card');
  // UI-19 (owner, 2026-10-21): on a narrow canvas (a 640 px row less the 84 px tools column) the one minimap floats lower
  // left above the zoom row; its column (184 x 124 minimap, 8 px gap, 32 px zoom row, 12 px in) is chrome like the zoom row.
  const narrow = { height: 844, visible: { x: 24, y: 24, w: 508, h: 796 }, centre: { x: 150, y: 700 } };
  const stack = { left: 12, right: 196, top: 844 - 12 - 32 - 8 - 124 };
  const underStack = spot => overlap({ x: spot.x, y: spot.y, ...REF_CARD }, { x: stack.left, y: stack.top, w: stack.right - stack.left, h: narrow.height - stack.top });
  assert.ok(underStack(refCardSpot(narrow.centre, [], narrow.visible)), 'without the chrome the card lands under the minimap');
  const clear = refCardSpot(narrow.centre, chromeObstacles([stack], narrow.height, view), narrow.visible);
  assert.ok(!clear.offscreen && !underStack(clear), `with it, clear of the minimap and zoom column (${clear.x},${clear.y})`);
  // World units: the same chrome at another camera is the same screen region.
  assert.deepEqual(chromeObstacles([hooks], height, { x: -100, y: 50, z: 2 }), [{ x: 584, y: 319, w: 104, h: 132 }]);
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
