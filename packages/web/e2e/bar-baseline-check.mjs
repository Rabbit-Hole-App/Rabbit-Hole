// Every bar in a bars object stands on the same baseline, lit or not: renders
// real scenes through the shared renderer (scene-render-harness, Vite dev
// server) and measures each bar rect's bottom edge after the lit bar's pop has
// settled. Usage: VITE_PORT=5199 node e2e/bar-baseline-check.mjs <card-module.js> ['{"input":value}'] ...
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [, , moduleArg, ...states] = process.argv;
const { scene } = await import(pathToFileURL(resolve(moduleArg)).href);
const browser = await chromium.launch();
let failures = 0;
for (const inputs of states.length ? states.map(s => JSON.parse(s)) : [undefined]) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${process.env.VITE_PORT || '5199'}/e2e/scene-render-harness.html`);
  await page.waitForFunction(() => window.__sceneHarnessReady === true);
  await page.evaluate(([s, i]) => window.__renderScene(s, undefined, i), [JSON.parse(JSON.stringify(scene)), inputs]);
  await page.locator('[data-animation-frame]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(900); // the lit bar's spring settles
  const groups = await page.evaluate(() => [...document.querySelectorAll('[data-animation-frame] svg g')]
    .filter(g => g.querySelector(':scope > rect[rx="4"]') && g.parentElement.querySelector(':scope > line'))
    .map(g => g.querySelector(':scope > rect').getBoundingClientRect().bottom));
  const bottoms = [...new Set(groups.map(b => Math.round(b * 10) / 10))];
  const ok = groups.length > 1 && Math.max(...groups) - Math.min(...groups) < 0.6;
  if (!ok) failures += 1;
  console.log(`${JSON.stringify(inputs || {})}: ${groups.length} bars, bottoms ${bottoms.join(', ')} -> ${ok ? 'same baseline' : 'MISALIGNED'}`);
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
