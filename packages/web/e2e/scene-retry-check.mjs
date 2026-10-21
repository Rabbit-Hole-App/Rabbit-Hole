// The Blender scene card's Retry against the LOCAL stack only (render fairness, 2026-10-21). The scene route is answered here,
// so no job starts and no renderer is reached; every other model-capable request is aborted and counted. Steps:
//   1. Build the scene -> Generate posts confirmed, and no retry;
//   2. a failed render shows its reason and a Retry scene button;
//   3. Retry scene, then its Generate clicked three times at once, posts retry: true (the server renders a failed scene
//      again only then);
//   4. the retried scene shows Blender rendering;
//   5. those repeated clicks sent exactly one retry, so one render (owner, 11:10 PT);
//   6. a busy refusal (429 render_limited) shows its why-and-when sentence on the card, with Retry scene;
//   7. no model-capable request was sent.
// Before this change step 3 fails: the card posted no retry, so Retry showed the same failure again.
// Usage: BASE=http://127.0.0.1:9561 SMALL_CP=http://127.0.0.1:9563 VARS=<cp .dev.vars> node e2e/scene-retry-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9561';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9563';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('scene-retry-check runs against the local stack only');
const OUT = process.argv[2] || 'scene-retry-shots';
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `scr-${run}@example.com`, secret }) })).json();
const created = await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie: `small_session=${session}`, origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Scene retry ${run}` }) });
if (!created.ok) throw Error(`POST /api/canvases: HTTP ${created.status}`);
const canvas = await created.json();

// The scene endpoint as the server answers it: a first build fails, a retry renders, a later build is refused as busy.
const BUSY = 'Your other scene is still rendering. Each learner renders one at a time across all canvases, so everyone gets a turn. Try again in about a minute, when it has finished.';
const posts = [], refused = [], outside = [];
let scenes = [];
const reply = body => {
  if (body.retry) { scenes = [{ id: 'p1', key: 'b'.repeat(64), status: 'rendering', retryable: true }]; return { status: 202, json: { scenes, placementId: 'p1' } }; }
  if (!scenes.length) { scenes = [{ id: 'p1', key: 'a'.repeat(64), status: 'failed', error: 'Blender could not export this scene', retryable: true }]; return { status: 202, json: { scenes, placementId: 'p1' } }; }
  return { status: 429, headers: { 'Retry-After': '60' }, json: { error: BUSY, code: 'render_limited', reason: 'learner_active', retryAfterSeconds: 60 } };
};
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|board$|tutor\/|assess|grade|home-ask|image|inline\/|journey|video|transcribe|tts|voice\/|dive|explore|course|cad\/|artifact))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) { outside.push(url.hostname); return route.abort(); }
  if (url.pathname === '/api/learn/scene') {
    if (request.method() === 'GET') return route.fulfill({ json: { scenes } });
    const body = JSON.parse(request.postData() || '{}');
    posts.push(body);
    return route.fulfill(reply(body));
  }
  if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(url.pathname)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
  if (MODEL.test(url.pathname) && request.method() !== 'GET') { refused.push(url.pathname); return route.abort(); }
  return route.fallback();
};

const results = [];
const total = 7;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message.split('\n')[0]}`); }
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.route('**/*', router);
const page = await context.newPage();
page.on('pageerror', error => console.log('PAGEERROR:', error.message));
await page.goto(`${BASE}/apps/${canvas.name}`);
const lesson = page.locator('[aria-label="Lesson canvas"]');
const insertScene = async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Blender scene' }).click();
  return lesson.locator('[data-block-id]').last();
};
const confirm = async card => { await card.locator('[data-generate-scene]').click(); await card.locator('[data-paid-generate]').click(); };
const posted = async count => { for (let i = 0; i < 100 && posts.length < count; i += 1) await page.waitForTimeout(100); assert.equal(posts.length, count, `POSTs: ${posts.length}`); };

await page.locator('[aria-label="Insert lesson block"]').waitFor({ timeout: 60000 });
const card = await insertScene();
await card.getByText('Perspective projection').waitFor({ timeout: 10000 });
await step('Build the scene -> Generate posts confirmed, and no retry', async () => {
  await confirm(card);
  await posted(1);
  assert.deepEqual([posts[0].confirmed, posts[0].retry], [true, false]);
});
await step('a failed render shows its reason and a Retry scene button', async () => {
  await card.getByText('Blender could not export this scene').waitFor({ timeout: 15000 });
  await card.getByRole('button', { name: 'Retry scene' }).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/failed.png` });
await step('Retry scene, then Generate clicked three times at once, posts retry: true', async () => {
  // Retry scene only opens the paid confirmation; its Generate starts the job, so that is the button pressed repeatedly.
  // The three clicks reach the button itself before the page re-renders (mouse clicks after the first would land on the
  // card, where a double-click opens it as a Rabbit Hole).
  await card.getByRole('button', { name: 'Retry scene' }).click();
  await card.locator('[data-paid-generate]').evaluate(button => { button.click(); button.click(); button.click(); });
  await posted(2);
  assert.deepEqual([posts[1].confirmed, posts[1].retry], [true, true]);
});
await step('the retried scene shows Blender rendering', () => card.getByText('Blender is rendering').waitFor({ timeout: 15000 }));
await step('the repeated clicks sent exactly one retry', async () => {
  // The card has settled into rendering and is polling; any second retry would have been posted by now.
  await page.waitForRequest(request => request.url().includes('/api/learn/scene') && request.method() === 'GET', { timeout: 15000 });
  assert.deepEqual([posts.filter(body => body.retry === true).length, posts.length], [1, 2]);
});
await page.screenshot({ path: `${OUT}/retried.png` });
await step('a busy refusal shows why and when to retry on the card, with Retry scene', async () => {
  const other = await insertScene();
  await other.getByText('Perspective projection').waitFor({ timeout: 10000 });
  await confirm(other);
  await posted(3);
  await other.getByText(BUSY).waitFor({ timeout: 15000 });
  await other.getByRole('button', { name: 'Retry scene' }).waitFor({ timeout: 5000 });
  await page.screenshot({ path: `${OUT}/busy.png` });
});
await step('no model-capable request was sent', () => assert.deepEqual(refused, []));
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`scene-retry-check: ${passed}/${total} passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
