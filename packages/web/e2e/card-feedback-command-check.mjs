// Card feedback controls (Explain-on-Canvas roadmap R1) in the real app, against the LOCAL stack only, with no model call: the card
// feedback route is a fake server in this browser (one Map, the real route's answers: 404 unknown_card, 400 not_rateable, 200).
// Covers: a generated card draws a Understood / Still unclear pair under it that is hidden at rest and stays hidden when the card is only
// selected; hovering the card reveals it; pressing either thumb turns it blue (aria-pressed) and the other off; pressing the chosen
// one again clears; keyboard: Tab from the card reaches the pair, focus reveals it with a visible focus ring, Space and Enter rate
// and neither opens or moves the card; an imported source card has no pair; a failed save puts the earlier value back and says so;
// no model request and no page error. Needs the page mount (LearnPage CardFeedbackScope) and the fake route only; no D1 table.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/card-feedback-command-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('card-feedback-command-check runs against the local stack only');
const SHOTS = process.argv[2] || 'card-feedback-command-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 8; // bump with the steps below; the printed line is what CI reads
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cardfb-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } })).json().catch(() => null);
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Card feedback ${run}` }) });
const BOARD = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [
  { id: 'gen', type: 'explanation', dx: 0, dy: 0, title: 'Balance sheets', body: 'Assets equal liabilities plus equity.' },
  { id: 'src', type: 'wiki', dx: 0, dy: 0, title: 'Balance sheet' },
] };
await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: BOARD }) });

const MODEL = /^\/api\/(ask$|learn\/(ask|selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
const stray = [], errors = [], results = [];
const fake = { values: new Map(), puts: [], gets: 0, failNext: false };
let page;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); await page?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {}); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const router = async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  if (path === '/api/learn/card-feedback') {
    if (request.method() === 'GET') { fake.gets += 1; return route.fulfill({ json: { items: [...fake.values].map(([cardId, value]) => ({ cardId, value, title: 'Balance sheets' })) } }); }
    const body = request.postDataJSON();
    fake.puts.push({ cardId: body.cardId, value: body.value });
    if (fake.failNext) { fake.failNext = false; return route.fulfill({ status: 503, json: { error: 'feedback_unavailable' } }); }
    if (body.cardId !== 'gen') return route.fulfill({ status: 400, json: { error: 'not_rateable' } });
    if (body.value === null) fake.values.delete(body.cardId); else fake.values.set(body.cardId, body.value);
    return route.fulfill({ json: { cardId: body.cardId, value: body.value } });
  }
  if (MODEL.test(path)) { stray.push(`${request.method()} ${path}`); return route.abort(); }
  return route.continue();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.route('**/api/**', router);
page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const card = id => page.locator(`[data-block-id="${id}"]`);
const pair = id => card(id).locator('[data-card-thumbs]');
const thumb = (id, which) => card(id).locator(`[data-card-thumb="${which}"]`);
const opacity = async id => Number(await pair(id).evaluate(node => getComputedStyle(node).opacity));
const color = async (id, which) => thumb(id, which).evaluate(node => getComputedStyle(node).color);
const BLUE = 'rgb(35, 131, 226)';

try {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await card('gen').waitFor({ state: 'visible', timeout: 60000 });

  await step('a generated card has a Understood / Still unclear pair under it, hidden at rest and when only the card is selected', async () => {
    assert.deepEqual(await pair('gen').getAttribute('aria-label'), 'Rate this card');
    assert.equal(await thumb('gen', 'up').getAttribute('aria-label'), 'Understood');
    assert.equal(await thumb('gen', 'down').getAttribute('aria-label'), 'Still unclear');
    await page.mouse.move(5, 5);
    assert.equal(await opacity('gen'), 0, 'hidden at rest');
    await card('gen').click({ position: { x: 20, y: 30 } });
    await until(async () => (await card('gen').getAttribute('aria-current')) === 'true', 'the card is selected');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    assert.equal(await opacity('gen'), 0, 'selection alone does not reveal the pair');
    const box = await card('gen').boundingBox(), under = await pair('gen').boundingBox();
    assert.ok(under.y >= box.y + box.height - 1, 'the pair sits under the card');
  });

  await step('an imported source card has no control', async () => {
    assert.equal(await card('src').count(), 1);
    assert.equal(await pair('src').count(), 0);
  });

  await step('hover reveals the pair; either thumb turns blue and the other off; pressing the chosen one clears', async () => {
    await card('gen').hover({ position: { x: 20, y: 30 } });
    await until(async () => (await opacity('gen')) === 1, 'the pair shows on hover');
    assert.equal(await thumb('gen', 'up').getAttribute('aria-pressed'), 'false');
    await thumb('gen', 'up').click();
    await until(async () => fake.puts.length === 1, 'a save');
    assert.deepEqual(fake.puts.at(-1), { cardId: 'gen', value: 'up' });
    assert.equal(await thumb('gen', 'up').getAttribute('aria-pressed'), 'true');
    assert.equal(await color('gen', 'up'), BLUE);
    await thumb('gen', 'down').click();
    await until(async () => fake.puts.length === 2, 'the other thumb saves');
    assert.deepEqual([await thumb('gen', 'up').getAttribute('aria-pressed'), await thumb('gen', 'down').getAttribute('aria-pressed')], ['false', 'true']);
    assert.equal(await color('gen', 'down'), BLUE);
    await pair('gen').screenshot({ path: `${SHOTS}/selected-down.png` });
    await thumb('gen', 'down').click();
    await until(async () => fake.puts.length === 3, 'clearing saves');
    assert.deepEqual(fake.puts.at(-1), { cardId: 'gen', value: null });
    assert.equal(await thumb('gen', 'down').getAttribute('aria-pressed'), 'false');
    assert.equal(fake.values.size, 0);
  });

  await step('the pointer leaving hides a chosen pair again: selection of a thumb does not keep it open', async () => {
    await thumb('gen', 'up').click();
    await until(async () => fake.puts.length === 4, 'a save');
    await page.mouse.move(5, 5);
    await until(async () => (await opacity('gen')) === 0, 'hidden again');
    assert.equal(await thumb('gen', 'up').getAttribute('aria-pressed'), 'true', 'still chosen while hidden');
    await thumb('gen', 'up').click({ force: true }); // clear for the next steps
    await until(async () => fake.puts.length === 5, 'cleared');
  });

  await step('keyboard: Tab from the card reaches the pair, focus reveals it with a visible ring, Space and Enter rate', async () => {
    await page.mouse.move(5, 5);
    await card('gen').focus();
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-card-thumb'));
    for (let tabs = 0; tabs < 8 && (await focused()) !== 'up'; tabs += 1) await page.keyboard.press('Tab'); // the card's own controls come first
    assert.equal(await focused(), 'up', 'Tab reaches Understood');
    assert.equal(await opacity('gen'), 1, 'own focus reveals the pair');
    assert.notEqual(await thumb('gen', 'up').evaluate(node => getComputedStyle(node).outlineStyle), 'none', 'a visible focus ring');
    await page.keyboard.press('Space');
    await until(async () => fake.puts.length === 6, 'Space rates');
    assert.deepEqual(fake.puts.at(-1), { cardId: 'gen', value: 'up' });
    await page.keyboard.press('Tab');
    assert.equal(await focused(), 'down');
    await page.keyboard.press('Enter');
    await until(async () => fake.puts.length === 7, 'Enter rates');
    assert.deepEqual(fake.puts.at(-1), { cardId: 'gen', value: 'down' });
    assert.equal(await page.locator('[role="dialog"]').count(), 0, 'neither key opened the card');
    await pair('gen').screenshot({ path: `${SHOTS}/keyboard-focus.png` });
    await page.keyboard.press('Space'); // clear
    await until(async () => fake.puts.length === 8, 'cleared');
  });

  await step('a failed save puts the earlier value back and says so', async () => {
    await card('gen').hover({ position: { x: 20, y: 30 } });
    fake.failNext = true;
    await thumb('gen', 'up').click();
    await page.getByText('Your feedback was not saved. Try again.').waitFor({ timeout: 10000 });
    assert.equal(await thumb('gen', 'up').getAttribute('aria-pressed'), 'false');
  });

  await step('no rating request was ever made for the source card', async () => {
    assert.equal(fake.values.has('src'), false);
    assert.equal(fake.puts.every(put => put.cardId === 'gen'), true);
  });

  await step('no model request and no page error', async () => {
    assert.deepEqual(stray, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await context.close();
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL && results.length === TOTAL ? 0 : 1);
