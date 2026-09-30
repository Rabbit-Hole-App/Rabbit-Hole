// Render one board card module to a PNG through the real renderer
// (AnimatedScene via scene-render-harness), at chosen input values, so an
// author can SEE a card's pixels in each state it teaches - not only pass its
// scene gates. Needs a Vite dev server (npx vite --port 5199).
//
// Usage: VITE_PORT=5199 node e2e/card-capture.mjs <card-module.js> <out.png> ['{"input":value}'] [time]
//   the module must export `scene` (an animation scene).
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [, , moduleArg, outArg, inputsArg, timeArg] = process.argv;
if (!moduleArg || !outArg) {
  console.error('usage: node e2e/card-capture.mjs <card-module.js> <out.png> [\'{"input":value}\'] [time]');
  process.exit(1);
}
const { scene } = await import(pathToFileURL(resolve(moduleArg)).href);
if (!scene) throw new Error(`${moduleArg} does not export a scene`);
const inputs = inputsArg ? JSON.parse(inputsArg) : undefined;
const time = timeArg !== undefined ? Number(timeArg) : undefined;
const port = process.env.VITE_PORT || '5199';

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(`http://localhost:${port}/e2e/scene-render-harness.html`);
await page.waitForFunction(() => window.__sceneHarnessReady === true);
await page.evaluate(([s, t, i]) => window.__renderScene(s, t, i), [JSON.parse(JSON.stringify(scene)), time, inputs]);
const frame = page.locator('[data-animation-frame]');
await frame.waitFor({ timeout: 10000 });
if (await page.locator('text=Invalid animation at').count()) {
  console.error('SCENE INVALID:', await page.locator('text=Invalid animation at').first().textContent());
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(400); // let the pop springs settle
await frame.screenshot({ path: outArg });
console.log(`captured ${outArg}${inputs ? ` at ${JSON.stringify(inputs)}` : ''}`);
await browser.close();
