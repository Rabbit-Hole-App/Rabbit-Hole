// Pan the lesson canvas until an element on it sits inside the viewport. The
// canvas is a transformed surface, not a scrolling page, so Playwright cannot
// scroll a card into view; a plain wheel over the canvas pans it (AdaptiveCanvas
// wheel handler), which is what a reader does.
export async function reveal(page, canvas, element, margin = 60) {
  const area = await canvas.boundingBox();
  const viewport = page.viewportSize();
  const top = Math.max(area.y, 0) + margin, bottom = Math.min(area.y + area.height, viewport.height) - margin;
  for (let i = 0; i < 80; i += 1) {
    const box = await element.boundingBox();
    if (!box) return;
    const dy = box.height > bottom - top || box.y < top ? box.y - top : box.y + box.height > bottom ? box.y + box.height - bottom : 0;
    if (Math.abs(dy) < 2) return;
    await page.mouse.move(area.x + area.width - 24, area.y + area.height / 2);
    await page.mouse.wheel(0, Math.max(-1500, Math.min(1500, dy)));
    await page.waitForTimeout(60);
  }
}
