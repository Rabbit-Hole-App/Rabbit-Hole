// Practice-card check (owner, 2026-10-08): a transfer-practice card on the nanoGPT slice board is graded right and wrong in the
// page. Against the KEYLESS journey stack only (e2e/journey-local-stack.md: fixture planners, no model key). Nothing reaches a
// model, and the provider tripwire must count 0.
//   P  practice on the slice board: a card answered right on its first attempt is graded passed; a card answered wrong is
//      graded failed and the retry on a fresh question is graded passed.
// Tutor cleanup P2 removed the browser Tutor with its evidence store, the claim states, the learning path's diagnostic probe
// (D) and the next_section move-on (N): there is no Tutor to record a card attempt, so what the attempt left as evidence and how
// the next turn routed are no longer checked here.
// ponytail: D and N went with the Tutor's journey start (journeyStarter is null in Chat until Tutor cleanup P4); the journey
// routes themselves are unit-tested, and no executable check covers a learning path in the page until P4 decides its fate.
// Usage: TUTOR_BASE=http://127.0.0.1:8868 SMALL_CP=http://127.0.0.1:8869 TEST_BYPASS_SECRET=... node e2e/practice-card-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { TUTOR_BOARD, cardModule } from '../src/learn-tutor-claims.js';

const BASE = process.env.TUTOR_BASE || 'http://127.0.0.1:8788';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('practice-card-check runs against a local stack only');
const secret = process.env.TEST_BYPASS_SECRET || readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const SHOTS = process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'e2e/shots/practice-card';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// The provider tripwire (e2e/provider-tripwire.js): the stack's own count of requests that tried to reach a provider.
const tripwire = async origin => { const response = await fetch(`${origin}/__provider-tripwire`).catch(() => null); const body = await response?.json().catch(() => null); return body ? body.hits.length : null; };
const trippedBefore = [await tripwire(BASE), await tripwire(CP)];

const email = `practice-card-${Date.now().toString(36)}@example.com`;
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...(init.headers || {}) } })).json();
const newCanvas = async title => (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).name;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
// Nothing reaches a model: Learn asks are canned and generation is refused. The check sends no Chat turn; these are a net.
const CANNED = 'A canned answer: no model was called.';
await context.route('**/api/learn/ask', route => route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `data: ${JSON.stringify({ text: CANNED })}\n\ndata: [DONE]\n\n` }));
await context.route('**/api/learn/home-ask', route => route.fulfill({ json: { answer: CANNED, references: [], offer_rabbit_hole: false } }));
await context.route(/\/api\/(learn\/(artifact|voice\/|assess|transcribe|image|tutor\/(plan|evaluate|handoff))|chat)/, route => route.abort());
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const shot = name => page.screenshot({ path: `${SHOTS}/${name}.png` });

// ---------- P: practice on the slice board ----------
const cardEl = id => page.locator('[data-block-id]:not([data-chat-block])', { hasText: cardModule(id).scene.title }).first();
// One graded attempt on the card's practice: pick `answer`, press Check, return the graded result. The controls are pressed
// with a DOM click: a card low on the board sits under the canvas's bottom bar, which would take a pointer click.
async function attempt(id, answer, fresh) {
  const card = cardEl(id), press = selector => card.locator(selector).dispatchEvent('click');
  await card.scrollIntoViewIfNeeded();
  await press(fresh ? '[data-practice-start]' : '[data-activity-new]');
  await press(`[data-scene-activity] [data-input-control="answer"][data-input-value="${answer}"]`);
  await press('[data-activity-check]');
  const graded = card.locator('[data-activity-feedback][data-activity-result]');
  await graded.waitFor({ timeout: 5000 });
  return graded.getAttribute('data-activity-result');
}

const slice = await newCanvas('Practice card check (slice)');
await page.goto(`${BASE}/apps/${slice}?board=${TUTOR_BOARD}`);
await page.locator('[data-tool-gutter]').waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
{
  const id = 'c11-causal-mask', { activity } = cardModule(id);
  const result = await attempt(id, activity.expected, true);
  check('P1 the right answer on the first attempt is graded passed', result === 'passed', result);
  await shot('P1-c11-right');
}
{
  const id = 'c10-weighted-values', { activity } = cardModule(id);
  const wrong = await attempt(id, 'top', true), right = await attempt(id, activity.expected, false);
  check('P2 a wrong first attempt fails, the retry passes', wrong === 'failed' && right === 'passed', `${wrong}, then ${right}`);
  await shot('P2-c10-wrong-then-right');
}

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
const trippedAfter = [await tripwire(BASE), await tripwire(CP)];
const hits = trippedAfter.some(n => n == null) || trippedBefore.some(n => n == null) ? null : trippedAfter[0] - trippedBefore[0] + trippedAfter[1] - trippedBefore[1];
console.log(`provider tripwire hits: ${hits ?? 'unreadable'}`);
check('the provider tripwire counted 0', hits === 0, hits == null ? 'GET /__provider-tripwire is not served: start the stack with the tripwire workers' : `${hits} hit(s)`);

await browser.close();
const passed = results.filter(r => r.ok).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
