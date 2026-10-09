// Pan the lesson canvas until an element on it sits inside the viewport. The
// canvas is a transformed surface, not a scrolling page, so Playwright cannot
// scroll a card into view; a plain wheel over the canvas surface pans it
// (AdaptiveCanvas wheel handler), which is what a reader does. The wheel goes
// over the surface itself ([data-canvas-surface]), not the tools' gutter beside it.
//
// The bottom strip floats over the canvas (owner, 2026-10-08): the composer, the minimap and zoom, the hooks card. What a
// reader sees of a span of the page is above the highest of its controls over that span (AdaptiveCanvas.jsx chromeTop), so
// a card is "in view" only above them, never under the composer.
export const chromeFloor = (page, x0, x1) => page.evaluate(([from, to]) => {
  const boxes = node => { const rect = node.getBoundingClientRect(); return rect.width || rect.height ? [rect] : [...node.children].flatMap(boxes); };
  return Math.min(innerHeight, ...[...document.querySelectorAll('[data-canvas-bottom] > * > *')].flatMap(boxes)
    .filter(rect => rect.width && rect.height && rect.left < to && rect.right > from).map(rect => rect.top));
}, [x0, x1]);
export async function reveal(page, canvas, element, margin = 60) {
  const surface = canvas.locator('[data-canvas-surface]');
  const area = await ((await surface.count()) ? surface.first() : canvas).boundingBox();
  const viewport = page.viewportSize();
  const top = Math.max(area.y, 0) + margin;
  for (let i = 0; i < 80; i += 1) {
    const box = await element.boundingBox();
    if (!box) return;
    const bottom = Math.min(area.y + area.height, viewport.height, await chromeFloor(page, box.x, box.x + box.width)) - margin;
    const dy = box.height > bottom - top || box.y < top ? box.y - top : box.y + box.height > bottom ? box.y + box.height - bottom : 0;
    if (Math.abs(dy) < 2) return;
    await page.mouse.move(area.x + area.width - 24, area.y + area.height / 2);
    await page.mouse.wheel(0, Math.max(-1500, Math.min(1500, dy)));
    await page.waitForTimeout(60);
  }
}
