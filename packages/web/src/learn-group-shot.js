// A picture of a group, drawn from its data rather than screenshotted from
// the DOM: strokes, shapes and text render faithfully; dropped images render
// from their cached bitmaps; every other card becomes a labelled placeholder
// (an iframe's pixels are cross-origin and not ours to read). Good enough for
// the tutor to see the arrangement the learner is asking about.

import { stickyTone } from './learn-style-panel.js';

const CARD_FALLBACK = { w: 560, h: 120 };

const wrapText = (ctx, text, x, y, maxWidth, lineHeight, maxLines = 12) => {
  const words = String(text || '').split(/\s+/);
  let line = '', lines = 0;
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = word;
      if (++lines >= maxLines) return;
    } else line = probe;
  }
  if (line) ctx.fillText(line, x, y + lines * lineHeight);
};

export async function groupShot({ box, members, strokes, shapes, items, blocks, bounds, cachedAsset, dark = false }) {
  const pad = 24;
  const width = box.right - box.left + pad * 2, height = box.bottom - box.top + pad * 2;
  const scale = Math.min(1, 1400 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  const ink = dark ? '#ffffff' : '#37352f';
  ctx.fillStyle = dark ? '#191919' : '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(pad - box.left, pad - box.top);
  const has = id => members.has(id);
  const themed = color => (color === '#37352f' ? ink : color || ink);

  // Cards first, so ink drawn over them stays on top.
  for (const block of blocks) {
    if (!has(block.id)) continue;
    const at = bounds[block.id] || { x: 0, y: 0, ...CARD_FALLBACK };
    if (block.type === 'file' && block.kind === 'image' && cachedAsset) {
      try {
        const file = await cachedAsset(block.assetKey);
        if (file) {
          const bitmap = await createImageBitmap(file);
          ctx.drawImage(bitmap, at.x, at.y, at.w, at.h);
          continue;
        }
      } catch { /* fall through to the placeholder */ }
    }
    ctx.strokeStyle = dark ? '#3f3f3f' : '#e3e2de';
    ctx.fillStyle = dark ? '#232323' : '#f7f6f3';
    ctx.beginPath();
    ctx.roundRect(at.x, at.y, at.w, at.h, 12);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = themed(null);
    ctx.font = '600 14px system-ui';
    const label = block.title || block.label || block.text || block.type;
    wrapText(ctx, `[${block.type}] ${label}`, at.x + 12, at.y + 24, at.w - 24, 18, 3);
  }
  for (const stroke of strokes) {
    ctx.strokeStyle = stroke.tool === 'highlighter' ? '#fde047' : themed(stroke.color);
    ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.5 : stroke.opacity ?? 1;
    ctx.lineWidth = stroke.width || 2;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    stroke.points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const shape of shapes) {
    if (!has(shape.id)) continue;
    ctx.strokeStyle = themed(shape.color);
    ctx.lineWidth = shape.width || 2;
    ctx.globalAlpha = shape.opacity ?? 1;
    const x = Math.min(shape.x1, shape.x2), y = Math.min(shape.y1, shape.y2);
    const w = Math.abs(shape.x2 - shape.x1), h = Math.abs(shape.y2 - shape.y1);
    ctx.beginPath();
    if (shape.kind === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else if (shape.kind === 'line' || shape.kind === 'arrow' || shape.kind === 'curve') { ctx.moveTo(shape.x1, shape.y1); ctx.lineTo(shape.x2, shape.y2); }
    else ctx.roundRect(x, y, w, h, shape.round ? 14 : 2);
    if (shape.fill) { ctx.fillStyle = shape.fill; ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = shape.opacity ?? 1; }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const item of items) {
    if (!has(item.id) || !item.text) continue;
    const size = item.level === 'h1' ? 32 : item.level === 'h2' ? 24 : item.level === 'h3' ? 19 : item.level === 'h4' ? 16 : 14;
    ctx.fillStyle = themed(item.color);
    if (item.kind === 'sticky') { const tone = stickyTone(item.color); ctx.fillStyle = tone.bg; ctx.fillRect(item.x, item.y, item.w || 160, item.h || 160); ctx.fillStyle = tone.text; }
    ctx.font = `${size >= 16 ? 600 : 400} ${size}px system-ui`;
    wrapText(ctx, item.text, item.x + (item.kind === 'sticky' ? 12 : 0), item.y + size, (item.w || (item.kind === 'sticky' ? 160 : 420)) - (item.kind === 'sticky' ? 24 : 0), size * 1.35);
  }
  return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
