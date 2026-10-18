// Standalone keyless Chromium pixel proof; no server, network or application state.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await readFile(new URL('../src/inline-image-transforms.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  const results = await page.evaluate(async source => {
    const { transformImage } = await import(`data:text/javascript;base64,${btoa(source)}`);
    const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = '#0000ff'; ctx.fillRect(1, 0, 1, 1);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const before = [...new Uint8Array(await blob.arrayBuffer())];
    async function pixels(operation) {
      const result = await transformImage(blob, operation);
      if (!result.ok) throw new Error(result.reason);
      const image = await createImageBitmap(result.blob);
      const output = document.createElement('canvas'); output.width = image.width; output.height = image.height;
      const context = output.getContext('2d'); context.drawImage(image, 0, 0); image.close();
      return { width: output.width, height: output.height, rgba: [...context.getImageData(0, 0, output.width, output.height).data] };
    }
    return {
      crop: await pixels({ type: 'crop', x: 1, y: 0, width: 1, height: 1 }),
      rotate: await pixels({ type: 'rotate', quarterTurns: 1 }),
      pad: await pixels({ type: 'pad', width: 4, height: 1, color: 'transparent' }),
      solid: await pixels({ type: 'pad', width: 4, height: 1, color: '#00ff00' }),
      resize: await pixels({ type: 'resize', width: 4, height: 4 }),
      originalUnchanged: JSON.stringify(before) === JSON.stringify([...new Uint8Array(await blob.arrayBuffer())]),
    };
  }, source);
  assert.deepEqual(results.crop, { width: 1, height: 1, rgba: [0, 0, 255, 255] });
  assert.deepEqual(results.rotate, { width: 1, height: 2, rgba: [255, 0, 0, 255, 0, 0, 255, 255] });
  assert.deepEqual(results.pad.rgba, [0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]);
  assert.deepEqual(results.solid.rgba.slice(0, 4), [0, 255, 0, 255]);
  assert.deepEqual([results.resize.width, results.resize.height], [4, 2]);
  assert.deepEqual(results.resize.rgba.slice(0, 4), [255, 0, 0, 255]);
  assert.equal(results.originalUnchanged, true);
  console.log('7 passed / 0 failed / 0 skipped: actual Chromium image transform pixel assertions');
} finally { await browser.close(); }
