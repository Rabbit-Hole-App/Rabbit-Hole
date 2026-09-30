import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

// One live shadow grade on the parallel clone (docs/features/jev-grading.md):
// the learner sees Opus, and the shadow grade goes direct to TypeSafe.
// Makes one real Opus call and one real Jev call. Prints no secrets.
const BASE = 'https://small-cp-dev-small-parallel.tryrabbithole.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `jev-direct-verify-${Date.now()}`;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'jev-verify' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) })).json()).session;
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'jev-verify' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const CHALLENGE = { id: 'c1', type: 'challenge', dx: 0, dy: 0, prompt: 'Why does softmax exponentiate the scores before normalising them?', hint: '', expects: ['exponentiating makes every score positive', 'dividing by the sum makes the outputs add up to one', 'larger scores get disproportionately more probability'], reveal: '', answer: null };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, block]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [block] }));
}, [KEY, CHALLENGE]);
const page = await context.newPage();
const seen = { grade: null, baseline: null };
page.on('response', async response => {
  const path = new URL(response.url()).pathname;
  if (path === '/api/learn/grade') seen.grade = { status: response.status(), body: await response.json().catch(() => null) };
  if (/^\/api\/learn\/grade\/\d+\/baseline$/.test(path)) seen.baseline = response.status();
});
await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
const card = page.locator('[data-block-id="c1"]');
await card.locator('input').waitFor({ timeout: 60000 });
await card.locator('input').fill('exp makes every score positive, dividing by the sum makes them add to one, and bigger scores win disproportionately');
await card.getByRole('button', { name: 'Commit' }).click();
await card.locator('[data-verdict]').waitFor({ timeout: 120000 });
for (let i = 0; i < 40 && (!seen.grade || seen.baseline == null); i += 1) await page.waitForTimeout(500);
const verdict = { grade: await card.locator('[data-answer]').getAttribute('data-grade'), text: (await card.locator('[data-verdict]').innerText()).trim().slice(0, 160) };
const g = seen.grade?.body || {};
console.log('board', BOARD);
console.log('learner sees', JSON.stringify(verdict));
console.log('shadow grade', seen.grade?.status, JSON.stringify({ grade_id: g.grade_id, status: g.status, transport: g.transport, model: g.model, jev_verdict: g.jev?.verdict, ms: g.ms, error: g.error }));
console.log('baseline', seen.baseline);
await browser.close();
