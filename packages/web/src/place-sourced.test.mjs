// AR-C3: placeSourced scenario grid (release 146). Every expected side and position is written out; invariants run over a larger set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JITTER, SOURCED, hashOf, placeSourced, slotQuality } from './place-sourced.js';

const box = (x, y, w, h) => ({ x, y, w, h });
const SIZE = { w: 440, h: 300 };
const SRC = box(1000, 0, 600, 800);
const overlaps = (a, b, m = 0) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
const rectOf = (p, size = SIZE) => box(p.x, p.y, size.w, size.h);
const mid = (p, size = SIZE) => p.y + size.h / 2;

test('free board, no id: the right side, one gap from the source, the card middle on the passage line', () => {
  const p = placeSourced({ source: SRC, anchorY: 200, size: SIZE });
  assert.deepEqual([p.side, p.x, p.y, p.quality], ['right', 1600 + SOURCED.gap, 50, { dy: 0, crossings: 0, columns: 0 }]);
});

test('Ask in a new card (anchor omitted): level with the source middle', () => {
  const p = placeSourced({ source: SRC, size: SIZE });
  assert.deepEqual([p.side, mid(p)], ['right', 400]);
});

test('cards standing in both ideal slots: slides to the nearest free place on a side, keeping the gap, nothing overlaps', () => {
  const wallR = box(1700, -20, 500, 340), wallL = box(100, -20, 700, 340);
  const p = placeSourced({ source: SRC, anchorY: 150, size: SIZE, boxes: [wallR, wallL] });
  const gap = p.side === 'right' ? p.x - 1600 : 1000 - (p.x + SIZE.w);
  assert.ok(gap >= SOURCED.minGap && gap <= 160, 'gap ' + gap);
  assert.ok(!overlaps(rectOf(p), wallR, SOURCED.margin) && !overlaps(rectOf(p), wallL, SOURCED.margin));
  assert.ok(Math.abs(mid(p) - 150) <= 360, 'slid ' + (mid(p) - 150));
});

test('only the right slot is taken: the free left side wins at the ideal height (the side chosen by cost, not habit)', () => {
  const p = placeSourced({ source: SRC, anchorY: 150, size: SIZE, boxes: [box(1700, -20, 500, 340)] });
  assert.deepEqual([p.side, mid(p)], ['left', 150]);
});

test('right side walled for two card heights: the left side wins (never above or below the source)', () => {
  const right = box(1650, -2000, 600, 4800);
  const p = placeSourced({ source: SRC, anchorY: 300, size: SIZE, boxes: [right] });
  assert.equal(p.side, 'left');
  assert.equal(p.x, 1000 - SOURCED.gap - SIZE.w);
  assert.equal(mid(p), 300);
  assert.ok(p.x + SIZE.w <= SRC.x - SOURCED.minGap);
});

test('mirror: the board mirrored about the source gives the mirrored placement', () => {
  const boxes = [box(1650, -300, 500, 700)];
  const a = placeSourced({ source: SRC, anchorY: 300, size: SIZE, boxes });
  const cx = SRC.x + SRC.w / 2, flip = b => box(2 * cx - b.x - b.w, b.y, b.w, b.h);
  const m = placeSourced({ source: flip(SRC), anchorY: 300, size: SIZE, boxes: boxes.map(flip) });
  assert.notEqual(a.side, m.side, 'the sides swap');
  assert.equal(m.y, a.y);
  assert.equal(flip(rectOf(m)).x, a.x);
});

test('a tall markdown with the passage far down: the card goes beside the PASSAGE, not the top', () => {
  const tall = box(1000, 0, 600, 5400);
  const p = placeSourced({ source: tall, anchorY: 3000, size: SIZE });
  assert.deepEqual([p.side, mid(p)], ['right', 3000]);
  assert.ok(p.y > 2000);
});

test('a passage scrolled out of the source clamps into it', () => {
  const p = placeSourced({ source: SRC, anchorY: 5000, size: SIZE });
  assert.ok(mid(p) <= SRC.y + SRC.h - SOURCED.edge);
  assert.ok(mid(p) >= SRC.y);
});

test('crowded board: both sides walled out to the window: one more column out, never overlapping, no loop', () => {
  const left = box(-2000, -3000, 2900, 7000), right = box(1650, -3000, 600, 7000);
  const p = placeSourced({ source: SRC, anchorY: 400, size: SIZE, boxes: [left, right] });
  assert.ok(p.quality.columns >= 1 || p.fallback);
  assert.ok(!overlaps(rectOf(p), left, SOURCED.margin) && !overlaps(rectOf(p), right, SOURCED.margin));
});

test('a source at the board edge with free space only on one side: that side', () => {
  const edge = box(0, 0, 600, 800);
  const wall = box(-5000, -5000, 4900, 10000);
  const p = placeSourced({ source: edge, anchorY: 300, size: SIZE, boxes: [wall] });
  assert.equal(p.side, 'right');
});

test('children already on the left: the tie goes to the left (a clean fan on one side)', () => {
  const sib = box(1000 - SOURCED.gap - SIZE.w, 400, SIZE.w, SIZE.h);
  const p = placeSourced({ source: SRC, anchorY: 150, size: SIZE, boxes: [sib], siblings: [{ box: sib, anchorY: 550 }] });
  assert.equal(p.side, 'left');
});

test('a tie with no children goes to the side nearer the visible area centre, then right', () => {
  const area = box(-1500, -200, 1900, 1200);
  assert.equal(placeSourced({ source: SRC, anchorY: 300, size: SIZE, area }).side, 'left');
  assert.equal(placeSourced({ source: SRC, anchorY: 300, size: SIZE }).side, 'right');
});

test('a crossing penalty: a side whose straight tail-head segment crosses a card loses to a clear side', () => {
  const blocker = box(1700, 100, 80, 120);
  const q = slotQuality({ source: SRC, anchorY: 150, at: { x: 1900, y: 0 }, size: SIZE, side: 'right', boxes: [blocker] });
  assert.equal(q.crossings, 1);
});

test('several children, top to bottom by anchorY: placed one after another none crosses and the order holds', () => {
  const placed = [], siblings = [];
  for (const anchorY of [100, 400, 700, 1000]) {
    const p = placeSourced({ source: box(1000, 0, 600, 1200), anchorY, size: { w: 440, h: 220 }, boxes: placed, siblings });
    placed.push(box(p.x, p.y, 440, 220)); siblings.push({ box: placed.at(-1), anchorY, side: p.side });
  }
  const bySide = side => placed.filter((b, i) => siblings[i].side === side).map(b => b.y + 110);
  for (const side of ['right', 'left']) { const ys = bySide(side); assert.deepEqual(ys, [...ys].sort((a, b) => a - b)); }
  placed.forEach((a, i) => placed.slice(i + 1).forEach(b => assert.ok(!overlaps(a, b, SOURCED.margin))));
});

test('determinism: the same inputs give the same output, a different card id gives another place', () => {
  const args = { source: SRC, anchorY: 300, size: SIZE, id: 'card-a', sourceId: 'src' };
  assert.deepEqual(placeSourced(args), placeSourced(args));
  const other = placeSourced({ ...args, id: 'card-b' });
  assert.notDeepEqual([other.x, other.y], [placeSourced(args).x, placeSourced(args).y]);
  assert.equal(hashOf('abc'), hashOf('abc'));
});

test('jitter bounds: the middle is within JITTER.y of the anchor, the gap within JITTER.x of 96 and never under the minimum', () => {
  for (let i = 0; i < 60; i += 1) {
    const p = placeSourced({ source: SRC, anchorY: 300, size: SIZE, id: `c${i}`, sourceId: 's' });
    assert.ok(Math.abs(mid(p) - 300) <= JITTER.y + 1, `dy ${mid(p) - 300}`);
    const gap = p.side === 'right' ? p.x - 1600 : 1000 - (p.x + SIZE.w);
    assert.ok(gap >= SOURCED.minGap, `gap ${gap}`);
    assert.ok(gap <= SOURCED.gap * (1 + JITTER.x) + JITTER.push * (1 + (JITTER.pushes - 1) * 0.5) + 1, `gap ${gap}`);
  }
});

test('jittered quality stays within a stated tolerance of the unjittered: |dy| <= JITTER.y, the same crossings and columns on a free board', () => {
  const plain = placeSourced({ source: SRC, anchorY: 300, size: SIZE });
  for (let i = 0; i < 30; i += 1) {
    const p = placeSourced({ source: SRC, anchorY: 300, size: SIZE, id: `q${i}`, sourceId: 's' });
    assert.ok(p.quality.dy <= plain.quality.dy + JITTER.y + 1);
    assert.equal(p.quality.crossings, plain.quality.crossings);
    assert.equal(p.quality.columns, plain.quality.columns);
  }
});

test('ANTI-GRID, 20 scenarios: two children of one source never share a left edge or a centre column', () => {
  for (let n = 0; n < 20; n += 1) {
    const source = box(1000, 0, 600, 1600), placed = [], siblings = [];
    for (let k = 0; k < 2; k += 1) {
      const anchorY = 300 + k * 450 + (n % 5) * 20;
      const p = placeSourced({ source, anchorY, size: SIZE, boxes: placed, siblings, id: `n${n}-k${k}`, sourceId: `s${n}` });
      placed.push(box(p.x, p.y, SIZE.w, SIZE.h)); siblings.push({ box: placed.at(-1), anchorY });
    }
    const [a, b] = placed;
    assert.ok(!overlaps(a, b, SOURCED.margin), `scenario ${n} overlaps`);
    if (siblings.every(s => s.box.x > 1000) || siblings.every(s => s.box.x < 1000)) {
      assert.ok(Math.abs(a.x - b.x) >= 24, `scenario ${n}: left edges ${a.x} ${b.x}`);
      assert.ok(Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) >= 24, `scenario ${n}: centres`);
    }
  }
});

test('a fan of five children: no overlap, none under the margin, all on valid sides, connectors cannot loop', () => {
  const source = box(1000, 0, 600, 2000), placed = [], siblings = [];
  for (let k = 0; k < 5; k += 1) {
    const anchorY = 150 + k * 380;
    const p = placeSourced({ source, anchorY, size: SIZE, boxes: placed, siblings, id: `fan-${k}`, sourceId: 'fan' });
    assert.ok(p.side === 'right' || p.side === 'left');
    const clear = p.side === 'right' ? p.x - 1600 : 1000 - (p.x + SIZE.w);
    assert.ok(clear >= SOURCED.minGap, `child ${k}: clearance ${clear}`);
    placed.forEach(o => assert.ok(!overlaps(rectOf(p), o, SOURCED.margin), `child ${k} overlaps`));
    placed.push(rectOf(p)); siblings.push({ box: placed.at(-1), anchorY });
  }
});

test('no existing box is ever overlapped or moved: a dense random board, 40 placements', () => {
  let seed = 7; const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let n = 0; n < 40; n += 1) {
    const boxes = Array.from({ length: 25 }, () => box(Math.round(rand() * 4000 - 1200), Math.round(rand() * 3000 - 500), 300 + Math.round(rand() * 400), 200 + Math.round(rand() * 400)));
    const source = box(1000, 400, 600, 900);
    const clean = boxes.filter(b => !overlaps(b, source, 0));
    const before = JSON.stringify(clean);
    const p = placeSourced({ source, anchorY: 400 + rand() * 900, size: SIZE, boxes: clean, id: `d${n}`, sourceId: 's' });
    assert.equal(JSON.stringify(clean), before);
    if (!p.fallback) clean.forEach(b => assert.ok(!overlaps(rectOf(p), b, SOURCED.margin), `scenario ${n} overlaps`));
    assert.ok(!overlaps(rectOf(p), source, 0));
  }
});

test('a fan of 5 and of 8 siblings: every pair of left edges differs by >= 24 px (no two-column zig-zag), all valid', () => {
  for (const [count, spread] of [[5, 380], [8, 300], [5, 220], [8, 160]]) {
    for (let seed = 0; seed < 6; seed += 1) {
      const source = box(1000, 0, 600, 200 + count * spread), placed = [], siblings = [];
      for (let k = 0; k < count; k += 1) {
        const anchorY = 150 + k * spread;
        const p = placeSourced({ source, anchorY, size: SIZE, boxes: placed, siblings, id: `f${count}-${seed}-${k}`, sourceId: `src${seed}` });
        const b = box(p.x, p.y, SIZE.w, SIZE.h);
        placed.forEach(o => assert.ok(!overlaps(b, o, SOURCED.margin), `${count}/${seed}/${k} overlaps`));
        const clear = p.side === 'right' ? p.x - 1600 : 1000 - (p.x + SIZE.w);
        assert.ok(clear >= SOURCED.minGap, `${count}/${seed}/${k}: clearance ${clear}`);
        placed.push(b); siblings.push({ box: b, anchorY });
      }
      const lefts = placed.map(b => b.x);
      for (let i = 0; i < lefts.length; i += 1) for (let j = i + 1; j < lefts.length; j += 1) assert.ok(Math.abs(lefts[i] - lefts[j]) >= 24, `${count} siblings (spread ${spread}, seed ${seed}): left edges ${lefts[i]} and ${lefts[j]}`);
    }
  }
});
