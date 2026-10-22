// Next Steps on a blank canvas. Owner decision 3a (2026-10-20, Tutor workflow) reverses the at-rest hooks of 2026-10-08
// (docs/features/professor-next-steps.md 1.2): opening a canvas, or selecting Tutor on it, makes no model call. A new blank
// canvas asks for no hooks in Auto (the default) or in Tutor On, and Tutor On shows its static welcome instead (and, owner
// 2026-10-21, Curious's empty state with Suggest, which asks nothing until pressed). Against the
// KEYLESS journey stack only (e2e/journey-local-stack.md): no model key is bound, and nothing here presses Send.
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

// One blank canvas: no hook request at rest, in Auto or after selecting Tutor; Tutor On shows the static welcome.
async function blank(label, title) {
  const name = await newCanvas(title);
  const before = hooks.length;
  await page.goto(`${BASE}/apps/${name}`);
  const pane = page.locator('[data-chat-pane]');
  await pane.locator('[data-chat-composer] textarea').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000); // past the 1200 ms hook debounce
  check(`${label}: Auto at rest asks for no hooks and shows none`, hooks.length === before && await page.locator('[data-next-steps]').count() === 0, `${hooks.length - before} request(s)`);
  await pane.getByRole('button', { name: 'Mode', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Tutor/ }).click();
  const welcome = page.locator('[data-tutor-entry="welcome"]');
  const shown = await welcome.waitFor({ timeout: 15000 }).then(() => true, () => false);
  await page.waitForTimeout(3000);
  check(`${label}: Tutor On shows the static welcome`, shown && /What would you like to learn or work on here\?/.test(await welcome.innerText().catch(() => '')));
  // Owner ruling 2026-10-21 (View > Curious on must visibly show): at rest Tutor On shows Curious's empty state, No
  // suggestions yet with its Suggest button, and still asks for nothing; no hook card until the learner asks.
  const empty = page.locator('[data-hooks-slot] section[data-next-steps="empty"]');
  const emptyShown = await empty.waitFor({ timeout: 5000 }).then(() => true, () => false);
  check(`${label}: Tutor On at rest asks for no hooks, shows no hook card, and shows Curious's empty state with Suggest`, hooks.length === before
    && await page.locator('[data-next-step]').count() === 0 && await page.locator('[data-next-steps]:not([data-next-steps="empty"])').count() === 0
    && emptyShown && /No suggestions yet/.test(await empty.innerText().catch(() => '')) && await empty.getByRole('button', { name: 'Suggest next steps' }).isVisible(),
    `${hooks.length - before} request(s)`);
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
