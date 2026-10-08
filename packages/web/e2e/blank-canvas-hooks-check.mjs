// Next Steps on a blank canvas (owner, 2026-10-08; docs/features/professor-next-steps.md 1.2): a new canvas with no card shows
// its three hooks at rest - grounded in the title when the title says something, three distinct starter hooks when it is
// Untitled. Against the KEYLESS journey stack only (e2e/journey-local-stack.md): the hook planner answers from its fixtures,
// no model key is bound, and nothing here presses Send.
// Usage: TUTOR_BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 TEST_BYPASS_SECRET=... node e2e/blank-canvas-hooks-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.TUTOR_BASE || 'http://127.0.0.1:8788';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('TUTOR_BASE must be a local stack');
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
const secret = process.env.TEST_BYPASS_SECRET || readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const SHOTS = process.argv[2] || 'e2e/shots/blank-canvas-hooks';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `blank-hooks-${Date.now().toString(36)}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const newCanvas = async title => (await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title }) })).json()).name;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const errors = [], hooks = [], asked = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('request', request => {
  if (request.method() === 'GET') return;
  const path = new URL(request.url()).pathname;
  if (path === '/api/learn/tutor/next-steps') hooks.push(request.postDataJSON?.() || null);
  else if (/^\/api\/(ask|learn\/(tutor\/plan|ask|home-ask))/.test(path)) asked.push(path);
});

// One blank canvas: its card shows three distinct hooks at rest, from one hook request and no question sent.
async function blank(label, title) {
  const name = await newCanvas(title);
  const before = hooks.length;
  await page.goto(`${BASE}/apps/${name}`);
  const card = page.locator('section[data-next-steps="ready"]');
  const shown = await card.waitFor({ timeout: 60000 }).then(() => true, () => false);
  const options = shown ? (await card.locator('[data-next-step]').allInnerTexts()).map(text => text.trim()) : [];
  check(`${label}: a blank canvas shows three hooks at rest`, options.length === 3 && options.every(Boolean), options.join(' | '));
  check(`${label}: the three hooks are distinct`, new Set(options.map(text => text.toLowerCase())).size === 3);
  check(`${label}: one hook request, for a canvas with no blocks`, hooks.length - before >= 1 && (hooks.at(-1)?.input?.blocks?.length ?? 0) === 0, `${hooks.length - before} request(s)`);
  await page.screenshot({ path: `${SHOTS}/${label.replace(/\W+/g, '-')}.png` });
}

await blank('untitled', '');
await blank('titled', 'Attention in transformers');
check('nothing was asked: no Tutor turn, no ask', asked.length === 0, asked.join(', '));
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
