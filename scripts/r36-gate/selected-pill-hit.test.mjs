import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { adaptSelectedPill } from './fixture-adapters.mjs';

const fixture = readFileSync(new URL('../../packages/web/e2e/selected-pill-check.mjs', import.meta.url), 'utf8');
const adapted = adaptSelectedPill(fixture);
const start = adapted.indexOf('const intendedSelectionPoint =');
const end = adapted.indexOf('const press =', start);
assert.ok(start >= 0 && end > start);

function scene({ scale = 0.2, viewOnly = false, port = false, covered = false, item = false } = {}) {
  const rect = { left: 500, top: 156.2, width: 600 * scale, height: 300 * scale };
  rect.right = rect.left + rect.width; rect.bottom = rect.top + rect.height;
  const handleRect = { ...rect, height: 24 * scale, bottom: rect.top + 24 * scale };
  const target = { closest: () => null, contains: node => [handle, button, portNode].includes(node), getBoundingClientRect: () => rect, querySelector: selector => selector === '[data-drag-handle]' ? handle : null };
  const handle = { getBoundingClientRect: () => handleRect, closest: selector => selector.includes('data-drag-handle') || selector.includes('data-drag-zone') ? handle : null };
  const button = { closest: selector => selector.includes('button') ? button : null };
  const portNode = { closest: selector => selector.includes('data-port') || selector.includes('button') ? portNode : null };
  const surface = { closest: selector => selector === '[data-canvas-surface]' ? surface : null };
  const panel = { closest: selector => selector.includes('data-chat-pane') ? panel : null };
  const inside = (x, y, r) => x > r.left && x < r.right && y > r.top && y < r.bottom;
  const document = { querySelector: () => target, elementFromPoint: (x, y) => {
    if (covered) return panel;
    if (!inside(x, y, rect)) return null;
    if (viewOnly) return surface;
    if (item) return target;
    if (!inside(x, y, handleRect)) return button; // New notebook header control at old unscaled y+8.
    if (port && Math.abs(x - (rect.left + rect.width / 2)) < 8) return portNode;
    return handle;
  } };
  const context = vm.createContext({ document });
  vm.runInContext(adapted.slice(start, end).replace('const intendedSelectionPoint =', 'globalThis.pick ='), context);
  const box = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  return { pick: side => context.pick({ evaluate: (fn, args) => fn(args) }, { id: 'k-nb', item }, box, side), document, target, handle, button, surface, rect };
}
for (const scale of [0.2, 1]) test(`measured card drag-strip hit at ${scale * 100}% avoids controls`, async () => {
  const s = scene({ scale });
  const point = await s.pick(false);
  assert.ok(point); assert.equal(s.document.elementFromPoint(point.x, point.y), s.handle);
  assert.ok(point.y < s.rect.top + 24 * scale);
  if (scale === 0.2) assert.equal(s.document.elementFromPoint(s.rect.left + s.rect.width / 2, s.rect.top + 8), s.button);
});
test('connection port is avoided with another real drag-strip point', async () => {
  const s = scene({ port: true }); const point = await s.pick(false);
  assert.ok(point); assert.equal(s.document.elementFromPoint(point.x, point.y), s.handle);
});
test('read-only cards use bare canvas inside the intended target, never a panel', async () => {
  const s = scene({ viewOnly: true }); const point = await s.pick(true);
  assert.ok(point); assert.equal(s.document.elementFromPoint(point.x, point.y), s.surface);
  assert.equal(await scene({ viewOnly: true, covered: true }).pick(false), null);
});
test('item selection keeps its original center rather than requiring a card handle', async () => {
  const s = scene({ item: true }); const point = await s.pick(false);
  assert.ok(point); assert.equal(point.x, s.rect.left + s.rect.width / 2); assert.equal(point.y, s.rect.top + s.rect.height / 2);
});
