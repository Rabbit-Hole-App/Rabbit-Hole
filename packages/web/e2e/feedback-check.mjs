// Send feedback (docs/features/learn-feedback.md), against the LOCAL stack only: a bug report and a feature suggestion from the
// sidebar (Library, where Home and Explore share the same button) and from inside a canvas. Each Submit reaches the real
// POST /api/learn/feedback on the local app Worker and its local Learn media bucket, answers 201 with a support reference
// (RH-XXXX-XXXX), and the button confirms in place with that reference (no corner toast). The canvas button sits lower left,
// beside the zoom controls, over nothing, at desktop and phone size. One account may send 5 reports an hour: the sixth is a friendly
// refusal shown in the panel, with the text kept. No mail can leave: the local stack has no RESEND_API_KEY and no FEEDBACK_NOTIFY_TO,
// and its control plane binding refuses the mail request (dev-forwarding.js guardControlPlane), exactly as the sign-in tests rely on.
// Every model-capable non-GET request is aborted and counted. Owner rule 2026-10-21: Claude does not run browser checks; CI runs this one.
// Prints `ok <label>` per step, then `N/total checks passed`; exits 1 on a failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/feedback-check.mjs [shotsDir]
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const total = 8; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('feedback-check runs against the local stack only');
const SHOTS = process.argv[2] || 'feedback-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = process.env.TEST_BYPASS_SECRET || readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `feedback-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Feedback ${run}` }) });

const model = [], errors = [], sent = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|next-steps|selection|plan|course))/;
const router = route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) return route.abort();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && MODEL.test(url.pathname)) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  return route.fallback();
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.route('**/*', router);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
page.on('request', request => { if (request.url().includes('/api/learn/feedback')) sent.push(request.postDataJSON()); });

const results = [], failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 4).join(' / ')}`); await page.screenshot({ path: `${SHOTS}/fail-${failures.length}.png` }).catch(() => {}); }
};
const REF = /^RH-[0-9A-Z]{4}-[0-9A-Z]{4}$/;
const sidebar = () => page.locator('aside [data-feedback]').first();
const inCanvas = () => page.locator('[data-feedback]:not(aside [data-feedback])').first();
// Open the panel, choose the kind, type, Submit; the response of the one POST.
async function submit(button, kind, text) {
  await button.click();
  const panel = page.locator('[data-feedback-panel]');
  await panel.waitFor({ timeout: 10000 });
  await panel.getByRole('radio', { name: kind === 'bug' ? 'Report a bug' : 'Suggest a feature' }).click();
  await panel.locator('textarea').fill(text);
  const [response] = await Promise.all([page.waitForResponse(r => r.url().includes('/api/learn/feedback') && r.request().method() === 'POST'), panel.locator('[data-feedback-submit]').click()]);
  return { response, panel, body: await response.json().catch(() => ({})) };
}
// A report that went through: 201, a reference, the panel closed and the button confirming with that reference.
async function stored(button, kind, text, app) {
  const before = sent.length;
  const { response, panel, body } = await submit(button, kind, text);
  assert.equal(response.status(), 201, `status ${response.status()} ${JSON.stringify(body)}`);
  assert.match(body.ref, REF);
  await panel.waitFor({ state: 'detached', timeout: 5000 });
  const title = await button.getAttribute('title');
  assert.ok(title.startsWith('Sent, thank you') && title.includes(body.ref), `the button says: ${title}`);
  assert.equal(sent.length, before + 1, 'exactly one request');
  const request = sent[sent.length - 1];
  assert.deepEqual([request.app, request.kind, request.text], [app, kind, text]);
}

await check('1 the canvas button sits lower left, beside the zoom controls, over nothing, at desktop and phone size', async () => {
  for (const [label, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    await page.setViewportSize(size);
    await page.goto(`${BASE}/apps/${canvas.name}`);
    await inCanvas().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200);
    const boxes = await page.evaluate(() => {
      const box = node => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom }; };
      return { button: box([...document.querySelectorAll('[data-feedback]')].find(node => !node.closest('aside'))), zoom: box(document.querySelector('[data-zoom]')), composer: box(document.querySelector('[data-chat-pane] [data-chat-composer]')), vw: innerWidth, vh: innerHeight };
    });
    const overlaps = (a, b) => !!a && !!b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
    assert.ok(boxes.zoom, `${label}: the zoom controls are on the page`);
    assert.ok(boxes.button.x < boxes.vw / 2 && boxes.button.y > boxes.vh * 0.6 && !overlaps(boxes.button, boxes.zoom) && !overlaps(boxes.button, boxes.composer), `${label}: ${JSON.stringify(boxes)}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
});

await page.goto(`${BASE}/library`);
await sidebar().waitFor({ timeout: 60000 });
await check('2 sidebar: a bug report is stored (201) and the button confirms with its reference', async () => { await stored(sidebar(), 'bug', 'Feedback check: sidebar bug report.', null); await page.screenshot({ path: `${SHOTS}/sidebar-sent.png` }); });
await check('3 sidebar: a feature suggestion is stored (201) and the button confirms with its reference', async () => { await stored(sidebar(), 'idea', 'Feedback check: sidebar feature suggestion.', null); });

await page.goto(`${BASE}/apps/${canvas.name}`);
await inCanvas().waitFor({ timeout: 60000 });
await check('4 canvas: a bug report carries the canvas as its app, is stored (201) and the button confirms with its reference', async () => { await stored(inCanvas(), 'bug', 'Feedback check: canvas bug report.', canvas.name); await page.screenshot({ path: `${SHOTS}/canvas-sent.png` }); });
await check('5 canvas: a feature suggestion is stored (201) and the button confirms with its reference', async () => { await stored(inCanvas(), 'idea', 'Feedback check: canvas feature suggestion.', canvas.name); });
await check('6 the fifth report within the hour is still stored (201)', async () => { await stored(inCanvas(), 'bug', 'Feedback check: fifth report.', canvas.name); });
await check('7 the sixth is refused with a friendly message in the panel, the text is kept and no confirmation shows', async () => {
  const { response, panel, body } = await submit(inCanvas(), 'bug', 'Feedback check: sixth report.');
  assert.equal(response.status(), 429);
  assert.match(body.error, /sent a lot of feedback/);
  await panel.getByText(body.error, { exact: true }).waitFor({ timeout: 5000 });
  assert.equal(await panel.locator('textarea').inputValue(), 'Feedback check: sixth report.');
  assert.ok(!(await inCanvas().getAttribute('title') || '').startsWith('Sent, thank you'), 'no confirmation for a refused report');
  await page.screenshot({ path: `${SHOTS}/canvas-limited.png` });
});
await check('8 no model-capable request and no page error', async () => {
  assert.deepEqual(model, [], 'no model-capable request');
  assert.deepEqual(errors.filter(error => !/ResizeObserver/.test(error)), []);
});

await browser.close();
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total ? 0 : 1);
