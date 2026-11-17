// AR-C1/C2/C4: connector geometry, derivation and colours (release 146).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ARROW, arrowhead, connectorColors, connectorGeometry, connectorsOf, contrast, drawConnector, samplePath, sideOfTarget, PALETTE_ORDER } from './connector.js';

const box = (x, y, w, h) => ({ x, y, w, h });
const SRC = box(1000, 0, 600, 800);

// Two non-adjacent segments of the polyline cross.
function selfIntersects(points) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const cross = (a, b, c, d) => o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  for (let i = 0; i < points.length - 1; i += 1) for (let j = i + 2; j < points.length - 1; j += 1) if (cross(points[i], points[i + 1], points[j], points[j + 1])) return true;
  return false;
}
const mirror = (b, cx) => box(2 * cx - b.x - b.w, b.y, b.w, b.h);

const GRID = {
  'target right, level': [box(1800, 200, 440, 300), 300],
  'target right, far above': [box(1800, -900, 440, 300), 300],
  'target right, far below': [box(1800, 1500, 440, 300), 300],
  'target left, level': [box(400, 200, 440, 300), 300],
  'target left, below': [box(400, 1200, 440, 300), 300],
  'target left, above': [box(300, -700, 440, 300), 100],
  'target above, overlapping horizontally': [box(1100, -500, 440, 300), 100],
  'target below, overlapping horizontally': [box(1100, 900, 440, 300), 700],
  'target overlapping the source': [box(1200, 100, 440, 300), 300],
  'very tall target': [box(1800, 0, 440, 6000), 300],
  'tiny gap right': [box(1630, 300, 440, 300), 300],
  'tiny gap left': [box(1000 - 30 - 440, 300, 440, 300), 300],
  'gap exactly at the minimum': [box(1600 + ARROW.minRun, 300, 440, 300), 300],
  'target hugging the tail': [box(1601, 350, 440, 300), 300],
};

test('the grid: every path is a loop-free curve, tail and head on the facing edges', () => {
  for (const [name, [target, anchorY]] of Object.entries(GRID)) {
    const g = connectorGeometry({ source: SRC, target, anchorY });
    assert.ok(!selfIntersects(samplePath(g)), `${name}: loops`);
    const side = sideOfTarget(SRC, target);
    assert.equal(g.side, side, name);
    assert.equal(g.tail.x, side === 'right' ? SRC.x + SRC.w : SRC.x, name);
    assert.equal(g.head.x, side === 'right' ? target.x : target.x + target.w, name);
    assert.ok(g.tail.y >= SRC.y && g.tail.y <= SRC.y + SRC.h, `${name}: tail off the source`);
    assert.equal(g.head.y, target.y + target.h / 2, name);
    assert.ok(samplePath(g).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
  }
});

test('a very tall source with the passage far down: the tail is on the passage line', () => {
  const tall = box(1000, 0, 600, 5400);
  const g = connectorGeometry({ source: tall, target: box(1800, 2800, 440, 300), anchorY: 3000 });
  assert.equal(g.tail.y, 3000);
  assert.ok(!selfIntersects(samplePath(g)));
});

test('S mode: x is monotone toward the head (no spiral), the tangents at both ends are horizontal', () => {
  let s = 0;
  for (const [name, [target, anchorY]] of Object.entries(GRID)) {
    const g = connectorGeometry({ source: SRC, target, anchorY });
    if (g.mode !== 'S') continue;
    s += 1;
    const xs = samplePath(g).map(p => p.x), sign = g.side === 'right' ? 1 : -1;
    for (let i = 1; i < xs.length; i += 1) assert.ok((xs[i] - xs[i - 1]) * sign >= -1e-9, `${name}: x not monotone at ${i}`);
    const [p0, p1, p2, p3] = g.segments;
    assert.equal(p1.y, p0.y); assert.equal(p2.y, p3.y);
  }
  assert.ok(s >= 6, 'the grid has S cases');
});

test('a clear target gets the S; a target not clear of the tail by minRun degrades to the bounded gentle curve', () => {
  assert.equal(connectorGeometry({ source: SRC, target: GRID['target right, level'][0], anchorY: 300 }).mode, 'S');
  for (const name of ['target overlapping the source', 'tiny gap right', 'target hugging the tail', 'target above, overlapping horizontally']) {
    const g = connectorGeometry({ source: SRC, target: GRID[name][0], anchorY: GRID[name][1] });
    assert.equal(g.mode, 'gentle', name);
    const [p0, p1, p2, p3] = g.segments, chord = Math.hypot(p3.x - p0.x, p3.y - p0.y) || 1;
    const off = p => Math.abs((p3.x - p0.x) * (p0.y - p.y) - (p0.x - p.x) * (p3.y - p0.y)) / chord;
    assert.ok(off(p1) <= ARROW.maxBow + 1e-6 && off(p2) <= ARROW.maxBow + 1e-6, `${name}: bow`);
  }
});

test('mirror symmetry: the mirrored board gives the mirrored path (same y, mirrored x, opposite side)', () => {
  const cx = SRC.x + SRC.w / 2;
  for (const [name, [target, anchorY]] of Object.entries(GRID)) {
    const a = connectorGeometry({ source: SRC, target, anchorY });
    const m = connectorGeometry({ source: mirror(SRC, cx), target: mirror(target, cx), anchorY });
    const pa = samplePath(a), pm = samplePath(m);
    assert.equal(m.mode, a.mode, name);
    pa.forEach((p, i) => assert.ok(Math.abs(2 * cx - p.x - pm[i].x) < 1e-6 && Math.abs(p.y - pm[i].y) < 1e-6, `${name}: point ${i}`));
    if (Math.abs(target.x + target.w / 2 - cx) > 1e-9) assert.notEqual(m.side, a.side, name);
  }
});

test('the tail follows the passage line and is clamped inside the source', () => {
  const t = box(1800, 0, 440, 300);
  assert.equal(connectorGeometry({ source: SRC, target: t, anchorY: 520 }).tail.y, 520);
  assert.equal(connectorGeometry({ source: SRC, target: t, anchorY: -400 }).tail.y, SRC.y + ARROW.edgeInset);
  assert.equal(connectorGeometry({ source: SRC, target: t, anchorY: 9000 }).tail.y, SRC.y + SRC.h - ARROW.edgeInset);
  assert.equal(connectorGeometry({ source: SRC, target: t }).tail.y, 400, 'no passage: the source middle (Ask)');
});

test('the arrowhead is a small open V at the head pointing along the tangent, mirrored on the left', () => {
  const right = connectorGeometry({ source: SRC, target: box(1800, 200, 440, 300), anchorY: 300 });
  const left = connectorGeometry({ source: SRC, target: box(400, 200, 440, 300), anchorY: 300 });
  const nums = d => d.match(/-?\d+(\.\d+)?/g).map(Number);
  const [ax, , hx, hy, bx] = nums(arrowhead(right));
  assert.ok(ax < hx && bx < hx && hx === right.head.x && hy === right.head.y, 'wings trail behind the tip');
  const [lax, , lhx, , lbx] = nums(arrowhead(left));
  assert.ok(lax > lhx && lbx > lhx, 'left: wings trail to the right');
});

test('colours: the explain palette, deterministic from the target id, spread across ids, visible on light and dark canvas', () => {
  const ids = Array.from({ length: 80 }, (_, i) => `card-${i}`);
  assert.deepEqual(connectorColors('card-3'), connectorColors('card-3'));
  const used = new Set(ids.map(id => connectorColors(id).name));
  assert.ok(used.size >= 6, `only ${used.size} palette colours used`);
  for (const name of used) assert.ok(PALETTE_ORDER.includes(name));
  for (const id of ids) {
    const c = connectorColors(id);
    assert.ok(contrast(c.light, '#ffffff') >= 2, `${c.name} on light: ${contrast(c.light, '#ffffff').toFixed(2)}`);
    assert.ok(contrast(c.dark, '#191919') >= 3, `${c.name} on dark: ${contrast(c.dark, '#191919').toFixed(2)}`);
  }
});

test('connectorsOf: ask (parentCard with actionId, solid), explain (parentCard dy, dashed); a missing or self parent is skipped', () => {
  const blocks = [
    { id: 's' }, { id: 'a', parentCard: { id: 's', revision: 'r1', actionId: 'act1' } }, { id: 'e', parentCard: { id: 's', dy: 240 } },
    { id: 'orphan', parentCard: { id: 'gone' } }, { id: 'self', parentCard: { id: 'self' } },
  ];
  assert.deepEqual(connectorsOf(blocks), [{ id: 'arrow:a', from: 's', to: 'a', kind: 'ask' }, { id: 'arrow:e', from: 's', to: 'e', kind: 'explain', dy: 240 }]);
});

test('drawConnector: hidden when an end is missing or unmeasured (a card saved as minimized still draws: minimize was removed 2026-11-17); dy puts the tail on the highlighted line; a measured passage wins', () => {
  const blocks = [{ id: 's' }, { id: 'e', parentCard: { id: 's', dy: 240 } }];
  const boxes = { s: SRC, e: box(1800, 100, 440, 300) };
  const [c] = connectorsOf(blocks);
  assert.equal(drawConnector(c, blocks, boxes).geometry.tail.y, 240);
  assert.equal(drawConnector(c, blocks, boxes, { e: 610 }).geometry.tail.y, 610);
  assert.equal(drawConnector(c, blocks, { s: SRC }), null);
  assert.equal(drawConnector(c, [{ id: 's', minimized: true }, blocks[1]], boxes).kind, 'explain');
  assert.equal(drawConnector(c, [blocks[0], { ...blocks[1], minimized: true }], boxes).kind, 'explain');
  assert.equal(drawConnector(c, blocks, boxes).kind, 'explain');
});

test('wiring: the layer sits before the cards column and the links, has no z-index and takes no pointer; the highlight card records its source card and line', async () => {
  const { readFileSync } = await import('node:fs');
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), slash = readFileSync(new URL('./learn-slash.js', import.meta.url), 'utf8');
  const layer = canvas.indexOf('data-card-arrows'), links = canvas.indexOf('{links.map(link => {'), column = canvas.indexOf('<div ref={column} data-view-only-cards');
  assert.ok(layer > 0 && layer < links && links < column, 'below the links and every card');
  const tag = canvas.slice(canvas.lastIndexOf('<svg', layer), canvas.indexOf('>', layer));
  assert.match(tag, /pointer-events-none/); assert.doesNotMatch(tag, /z-\d|z-\[/);
  assert.match(canvas, /const arrows = useMemo\(\(\) => connectorsOf\(blocks\)/);
  assert.match(slash, /target\?\.beside && target\.id \? \{ parent: \{ id: target\.id, \.\.\.\(Number\.isFinite\(target\.alignY\) \? \{ dy: Math\.round\(target\.alignY\) \} : \{\}\) \} \}/);
});

test('the arrowhead is the same size on screen at every zoom (scale = 1 / zoom), ARROW.head pixels', () => {
  const g = connectorGeometry({ source: SRC, target: box(1800, 200, 440, 300), anchorY: 300 });
  for (const zoom of [0.2, 0.34, 1, 3]) {
    const [ax, ay, hx, hy] = arrowhead(g, 1 / zoom).match(/-?\d+(\.\d+)?/g).map(Number);
    assert.ok(Math.abs(Math.hypot(ax - hx, ay - hy) * zoom - ARROW.head) < 1e-6, `zoom ${zoom}`);
  }
});
