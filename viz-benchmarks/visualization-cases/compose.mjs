// EXP-T01 comparison.png: original left, result right, full images at their own aspect ratio on a
// neutral background, each labelled. No image library is installed, so the pixels are composed on a
// canvas in headless Chromium (Playwright, already a web dev dependency) driven by this script.
//
//   node compose.mjs <reference> <generated.png> <out.png> [result label]
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageInfo } from './cases.mjs';

const PAD = 24, LABEL = 36, MAX_H = 900;

// Pure placement: never upscales, keeps aspect ratio, result to the right of the original.
// A missing result yields only the original panel; nothing is fabricated in its place.
export function comparisonLayout(left, right) {
  const sizes = [left, right].filter(Boolean);
  const target = Math.min(MAX_H, Math.max(...sizes.map(s => s.height)));
  let x = PAD;
  const panels = sizes.map(s => {
    const scale = Math.min(1, target / s.height);
    const w = Math.round(s.width * scale), h = Math.round(s.height * scale);
    const panel = { x, y: PAD + LABEL, w, h };
    x += w + PAD;
    return panel;
  });
  return { width: x, height: PAD + LABEL + Math.max(...panels.map(p => p.h)) + PAD, panels };
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const dataUrl = path => `data:${MIME[extname(path).toLowerCase()] || 'image/png'};base64,${readFileSync(path).toString('base64')}`;

export async function composeComparison(referencePath, generatedPath, outPath, { resultLabel = 'Result', leftLabel = 'Original' } = {}) {
  if (!generatedPath) throw new Error('no result to compare; a failed run keeps its missing-result state');
  const sizes = [referencePath, generatedPath].map(p => imageInfo(readFileSync(p)));
  if (sizes.some(s => !s)) throw new Error('unreadable image header');
  const layout = comparisonLayout(sizes[0], sizes[1]);
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // No navigation: an empty page, images passed as data URLs, the canvas exported as PNG.
    const png = await page.evaluate(async ({ layout, urls, labels }) => {
      const canvas = Object.assign(document.createElement('canvas'), { width: layout.width, height: layout.height });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#eceae6'; ctx.fillRect(0, 0, layout.width, layout.height);
      for (const [i, p] of layout.panels.entries()) {
        const img = new Image(); img.src = urls[i]; await img.decode();
        for (let y = 0; y < p.h; y += 12) for (let x = 0; x < p.w; x += 12) { // checkerboard shows transparency honestly
          ctx.fillStyle = ((x + y) / 12) % 2 ? '#d8d6d2' : '#f6f5f3';
          ctx.fillRect(p.x + x, p.y + y, Math.min(12, p.w - x), Math.min(12, p.h - y));
        }
        ctx.drawImage(img, p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#222'; ctx.font = '600 18px sans-serif'; ctx.fillText(labels[i], p.x, p.y - 12);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, { layout, urls: [dataUrl(referencePath), dataUrl(generatedPath)], labels: [leftLabel, resultLabel] });
    writeFileSync(outPath, Buffer.from(png, 'base64'));
    return { outPath, ...layout };
  } finally { await browser.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [ref, gen, out, label] = process.argv.slice(2);
  if (!ref || !gen || !out) { console.error('usage: node compose.mjs <reference> <generated.png> <out.png> [label]'); process.exit(1); }
  const result = await composeComparison(ref, gen, out, { resultLabel: label || 'Result' });
  console.log(`wrote ${result.outPath} ${result.width}x${result.height}`);
}
