// Automatic next proposal in the current UI against the LOCAL stack with a fake roadmap job server and no model call (Tutor ladder R6, fork tier): after a
// delivered card the next step appears by itself (one overlay, no propose request, no accept request, the delivered card does not move, no new Chat
// line), Ask holds it back and Tutor shows it, a server that offers nothing leaves the manual Propose next step working, and a reload shows the state the server holds.
// Written, never run by its author (browser automation is CI or owner only). Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/roadmap-auto-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fakeRoadmapServer } from './roadmap-fake-server.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('roadmap-auto-check runs against the local stack only');
const SHOTS = process.argv[2] || 'roadmap-auto-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 4; // bump with the steps below; the printed line is what CI reads
const CARD = 'cd_71e20ac49f8b3d5612a7c0e4';
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `roadmapauto-${run}@example.com`, secret, handle: `roadmapauto_${run}` }) })).json();
const canvas = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Roadmap auto ${run}` }) })).json();

const MODEL = /^\/api\/(ask$|learn\/(selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
const stray = [], errors = [], results = [];
let current = null;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); await current?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {}); }
};
const until = async (fn, label, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const browser = await chromium.launch();
const open = async options => {
  const server = fakeRoadmapServer(options);
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/api/learn/roadmap**', server.handler);
  await context.route('**/*', route => { const path = new URL(route.request().url()).pathname; if (MODEL.test(path) && route.request().method() !== 'GET') { stray.push(path); return route.abort(); } return route.fallback(); });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  current = page;
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 60000 });
  return { server, page };
};
const setMode = async (page, mode) => { await page.locator('[data-chat-pane]').getByRole('button', { name: 'Mode', exact: true }).click(); await page.getByRole('menuitemradio', { name: new RegExp(`^${mode}`) }).click(); };
const box = (page, id) => page.locator(`[data-block-id="${id}"]`).first().boundingBox();

try {
  await step('after a delivered card the next step appears by itself: one overlay, no propose or accept request, the card does not move, no new Chat line', async () => {
    const { server, page } = await open({ stage: 'generated', auto: true, autoAfterReads: 2 });
    await page.locator(`[data-block-id="${CARD}"]`).first().waitFor();
    await until(async () => server.count('/ack') === 1, 'acknowledged');
    const chatBefore = await page.locator('[data-roadmap-chat]').allInnerTexts();
    const cardBefore = await box(page, CARD);
    await page.locator('[data-roadmap-overlay]').waitFor();
    assert.equal(await page.locator('[data-roadmap-overlay]').count(), 1);
    assert.equal(server.count('/steps/propose'), 0);
    assert.equal(server.count('/accept'), 0);
    assert.deepEqual(await box(page, CARD), cardBefore, 'the camera and the card did not move');
    assert.equal((await page.locator('[data-roadmap-chat]').allInnerTexts()).length, chatBefore.length);
    await page.screenshot({ path: `${SHOTS}/1-auto-proposal.png` });
  });
  await step('Ask holds the proposal back; returning to Tutor shows it with no new request of ours', async () => {
    const { server, page } = await open({ stage: 'delivered' });
    await page.locator('[data-roadmap-overlay]').waitFor();
    await setMode(page, 'Ask');
    await until(async () => (await page.locator('[data-roadmap-overlay]').count()) === 0, 'hidden in Ask');
    const before = server.count('/steps/propose') + server.count('/accept');
    await setMode(page, 'Tutor');
    await page.locator('[data-roadmap-overlay]').waitFor();
    assert.equal(server.count('/steps/propose') + server.count('/accept'), before);
  });
  await step('when the server offers nothing (Auto-suggest off) no overlay appears and the manual Propose next step still works', async () => {
    const { server, page } = await open({ stage: 'generated', auto: true, autoAfterReads: 1e9 });
    await until(async () => server.count('/ack') === 1, 'acknowledged');
    await page.waitForTimeout(5000);
    assert.equal(await page.locator('[data-roadmap-overlay]').count(), 0);
    await page.getByRole('tab', { name: /^Table of contents/ }).click();
    await page.locator('[data-roadmap-propose-next]').click();
    await page.locator('[data-roadmap-overlay]').waitFor();
    assert.equal(server.count('/steps/propose'), 1);
  });
  await step('a reload shows the state the server holds (the proposal, once), and no stray model request or page error', async () => {
    const { page } = await open({ stage: 'delivered' });
    await page.locator('[data-roadmap-overlay]').waitFor();
    await page.reload();
    await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 60000 });
    await page.locator('[data-roadmap-overlay]').waitFor();
    assert.equal(await page.locator('[data-roadmap-overlay]').count(), 1);
    assert.deepEqual(stray, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL ? 0 : 1);
