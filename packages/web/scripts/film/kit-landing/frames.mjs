// Contact sheet for a video: screenshots at fixed times in a Playwright page (the encoder here cannot write images).
// Usage (from packages/web): node C:/s/spec/landing-tutor/capture/frames.mjs <video URL> <outDir> [step seconds]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = createRequire(join(process.cwd(), 'package.json'))('@playwright/test');
const [file, out, step = '5'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
await page.goto(new URL(file).origin + '/404'); await page.setContent(`<body style="margin:0;background:#000"><video muted src="${file}" style="display:block;width:100vw;height:100vh;object-fit:contain"></video></body>`);
const duration = await page.evaluate(() => new Promise(resolve => { const v = document.querySelector('video'); v.onloadedmetadata = () => resolve(v.duration); v.load(); }));
for (let t = 0; t < duration; t += Number(step)) {
  await page.evaluate(time => new Promise(resolve => { const v = document.querySelector('video'); v.onseeked = () => resolve(); v.currentTime = time; }), t);
  await page.screenshot({ path: join(out, `t${String(Math.round(t)).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 70 });
}
console.log(`ok ${Math.ceil(duration / Number(step))} frames of ${duration.toFixed(1)} s`);
await browser.close();
