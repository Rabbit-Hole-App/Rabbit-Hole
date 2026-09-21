// Renders one viz-benchmarks scene-spec.json to a PNG via the real Learn
// renderer (AnimatedScene, through scene-render-harness) - no app shell, no
// auth, so a benchmark case never needs small-cp-dev running. Validation is
// whatever AnimatedScene's own validateScene(block.scene) does; a bad scene
// shows its error text in the frame div and this script fails loudly on it
// rather than screenshotting an error box.
//
// Usage: node viz-benchmark-capture.mjs <scene-spec.json> <output.png> [time]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const [, , sceneArg, outArg, timeArg] = process.argv;
if (!sceneArg || !outArg) {
  console.error('usage: node viz-benchmark-capture.mjs <scene-spec.json> <output.png> [time]');
  process.exit(1);
}
const scene = JSON.parse(readFileSync(sceneArg, 'utf8'));
const time = timeArg !== undefined ? Number(timeArg) : undefined;
const port = process.env.VITE_PORT || '5173';

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(`http://localhost:${port}/e2e/scene-render-harness.html`);
await page.waitForFunction(() => window.__sceneHarnessReady === true);
await page.evaluate(([s, t]) => window.__renderScene(s, t), [scene, time]);
const frame = page.locator('[data-animation-frame]');
await frame.waitFor({ timeout: 10000 });
const errorBox = page.locator('text=Invalid animation at');
if (await errorBox.count()) {
  console.error('SCENE INVALID:', await errorBox.first().textContent());
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(300); // let the pop springs settle
await frame.screenshot({ path: outArg });
console.log(`captured ${outArg}`);
await browser.close();
