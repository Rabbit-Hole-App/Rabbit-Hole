// Roadmap UI wiring against the LOCAL stack with a fake roadmap job server and no model call (Tutor ladder R4, fork tier): the
// two-choice invitation and its dismissal, plain-Tab ownership (accepted only from the page or canvas, never from the composer,
// with Shift, or from another control), the square pill and no price text, the flag-off page, and Ask mode hiding new proposals.
// Written, never run by its author (browser automation is CI or owner only). Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/roadmap-command-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fakeRoadmapServer } from './roadmap-fake-server.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('roadmap-command-check runs against the local stack only');
const SHOTS = process.argv[2] || 'roadmap-command-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 6; // bump with the steps below; the printed line is what CI reads
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `roadmapcmd-${run}@example.com`, secret, handle: `roadmapcmd_${run}` }) })).json();
const canvas = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Roadmap command ${run}` }) })).json();

const MODEL = /^\/api\/(ask$|learn\/(selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
// Click empty canvas well below the canvas header (a click at the surface's top-left lands on the header, not the canvas).
const clickBlankCanvas = async page => { const surface = page.locator('[data-canvas-surface]'); const bounds = await surface.boundingBox(); await surface.click({ position: { x: 20, y: Math.min(bounds.height - 20, 650) } }); };
const stray = [], errors = [], results = [];
let current = null;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); await current?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {}); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const browser = await chromium.launch();
// A fresh context per scenario, each with its own fake server, so one scenario cannot leak state into the next.
const open = async (options, mode = null) => {
  const server = fakeRoadmapServer(options);
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/api/learn/roadmap**', server.handler);
  await context.route('**/*', route => { const path = new URL(route.request().url()).pathname; if (MODEL.test(path) && route.request().method() !== 'GET') { stray.push(path); return route.abort(); } return route.fallback(); });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  current = page;
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 60000 });
  if (mode) { await page.locator('[data-chat-pane]').getByRole('button', { name: 'Mode', exact: true }).click(); await page.getByRole('menuitemradio', { name: new RegExp(`^${mode}`) }).click(); }
  return { server, page, context };
};
const priceFree = async page => { const text = await page.locator('[data-roadmap-overlay], [data-roadmap-chat], [data-roadmap-plan]').allInnerTexts(); assert.doesNotMatch(text.join(' '), /\$|credit|cost|price|estimate|maximum/i); };

try {
  await step('the invitation offers exactly Explain on canvas and Just keep it here; dismissing hides only it, and a reload does not offer it again', async () => {
    const { server, page } = await open({ invitation: true });
    const card = page.locator('[data-roadmap-invitation]');
    await card.waitFor();
    assert.deepEqual(await card.getByRole('button').allInnerTexts(), ['Explain on canvas', 'Just keep it here']);
    await page.screenshot({ path: `${SHOTS}/1-invitation.png` });
    await card.getByRole('button', { name: 'Just keep it here' }).click();
    await until(async () => (await card.count()) === 0, 'invitation gone');
    assert.equal(server.count('/dismiss'), 1);
    await page.reload();
    await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('[data-roadmap-invitation]').count(), 0);
  });
  await step('the square pill reads Accept, Tab, Cancel, with no price, estimate or credits text anywhere', async () => {
    const { page } = await open({ stage: 'pending' });
    const overlay = page.locator('[data-roadmap-overlay]');
    await overlay.waitFor();
    assert.equal((await overlay.locator('[data-roadmap-pill] button').allInnerTexts()).map(text => text.replace(/\s+/g, '')).join('|'), 'AcceptTab|Cancel'); // whitespace between Accept and its Tab label is layout, not content
    assert.equal(await overlay.locator('[data-roadmap-pill]').evaluate(el => getComputedStyle(el.firstElementChild).borderRadius), '0px');
    await priceFree(page);
    await page.screenshot({ path: `${SHOTS}/2-pill.png` });
  });
  await step('Tab does not accept from the Chat composer, with Shift, or from another control', async () => {
    const { server, page } = await open({ stage: 'pending' });
    await page.locator('[data-roadmap-overlay]').waitFor();
    await page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"])').first().focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.getByRole('tab', { name: /^Table of contents/ }).focus();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    assert.equal(server.count('/accept'), 0);
  });
  await step('plain Tab with the keyboard on the canvas accepts once, and the second Tab does nothing', async () => {
    const { server, page } = await open({ stage: 'pending' });
    await page.locator('[data-roadmap-overlay]').waitFor();
    await clickBlankCanvas(page);
    await page.keyboard.press('Tab');
    await until(async () => server.count('/accept') === 1, 'one accept request');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    assert.equal(server.count('/accept'), 1);
    assert.equal(server.calls.find(c => c.path.endsWith('/accept')).body.proposalVersion, 1);
  });
  await step('flag off: no roadmap element anywhere and the page still works', async () => {
    const { page } = await open({ enabled: false, invitation: true, stage: 'pending' });
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('[data-roadmap-invitation], [data-roadmap-overlay], [data-roadmap-plan], [data-roadmap-next-ready]').count(), 0);
    assert.ok(await page.locator('[data-chat-pane] [data-chat-composer]').count());
  });
  await step('Ask mode shows no new proposal and Tab accepts nothing', async () => {
    const { server, page } = await open({ stage: 'pending' }, 'Ask');
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('[data-roadmap-overlay]').count(), 0);
    await clickBlankCanvas(page);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    assert.equal(server.count('/accept'), 0);
    assert.deepEqual(stray, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL ? 0 : 1);
