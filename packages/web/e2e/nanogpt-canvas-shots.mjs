// Screenshot the nanoGPT lesson canvas at chosen pages AND fail on overlapping
// text shapes (text inside its own tile/box is geo-vs-text and stays allowed).
// Run from packages/web with the preview server on :5186 (see nanogpt-audio-check.mjs):
//   node e2e/nanogpt-canvas-shots.mjs out-dir [pages...]   (pages default 0..5)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] || '.';
const pages = process.argv.slice(3).map(Number);
const wanted = pages.length ? pages : [0, 1, 2, 3, 4, 5];
mkdirSync(outDir, { recursive: true });
const app = {
  name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository',
  repo: 'karpathy/nanoGPT', description: '', owner_email: 'builder@example.test',
  deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z',
  visibility: 'domain', members: [], teams: [], observations: [], canEdit: true,
  email: 'builder@example.test', schedule: null, commit_sha: 'abc123',
};
const replies = {
  '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] },
  '/api/apps/nanogpt': app,
  '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true },
  '/api/repositories/nanogpt': { ...app, status: 'ready' },
  '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] },
  '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] },
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.route('**/api/**', route => route.fulfill({ json: replies[new URL(route.request().url()).pathname] || {} }));
page.on('pageerror', error => console.log('pageerror:', error.message));
await page.goto('http://localhost:5186/apps/nanogpt?tab=learn');
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForTimeout(4000); // let the lesson auto-start
const canvas = page.locator('[aria-label="Lesson canvas"]');
let failures = 0;
const slider = page.locator('input[aria-label="Lesson timeline"]');
await slider.waitFor({ state: 'visible' });
for (const index of wanted) {
  // Scrub to the end of the page so the full scene is drawn, paused.
  await slider.evaluate((el, value) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, String((index + 1) * 1000 - 1));
  await page.waitForTimeout(1500);
  await canvas.screenshot({ path: `${outDir}/canvas-page-${index + 1}.png` });
  const overlaps = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, text: (el.textContent || '').trim().slice(0, 32) }; };
    const texts = [...document.querySelectorAll('.tl-shape[data-shape-type="text"]')].map(rect).filter(s => s.w && s.h && s.text);
    const boxes = [...document.querySelectorAll('.tl-shape[data-shape-type="geo"]')].map(rect).filter(s => s.w && s.h);
    const bad = [];
    for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) {
      const A = texts[a], B = texts[b];
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ox > 6 && oy > 6) bad.push(`text/text "${A.text}" <-> "${B.text}" (${Math.round(ox)}x${Math.round(oy)}px)`);
    }
    // A text that meaningfully enters a box must sit fully inside it.
    for (const T of texts) for (const B of boxes) {
      const ox = Math.min(T.x + T.w, B.x + B.w) - Math.max(T.x, B.x);
      const oy = Math.min(T.y + T.h, B.y + B.h) - Math.max(T.y, B.y);
      if (ox <= 0 || oy <= 0) continue;
      const coverage = (ox * oy) / (T.w * T.h);
      const inside = T.x >= B.x - 6 && T.y >= B.y - 6 && T.x + T.w <= B.x + B.w + 6 && T.y + T.h <= B.y + B.h + 6;
      if (coverage > 0.3 && !inside) bad.push(`text/box "${T.text}" sticks out of its box (${Math.round(coverage * 100)}% in)`);
    }
    return bad;
  });
  overlaps.forEach(entry => console.log(`  OVERLAP page ${index + 1}: ${entry}`));
  failures += overlaps.length;
  console.log(`saved canvas-page-${index + 1}.png (${overlaps.length} overlaps)`);
}
await browser.close();
if (failures) { console.log(`FAIL: ${failures} overlapping text pairs`); process.exit(1); }
console.log('PASS: no overlapping canvas text');
