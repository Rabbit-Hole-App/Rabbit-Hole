// Card feedback, the R1 acceptance path (Explain-on-Canvas roadmap 3.2) in the real app, against the LOCAL stack only, with no model
// call: the card feedback route is a fake server in this browser that answers as the real one does (its list holds only cards on the
// canvas's saved board, read from the real board route, so a deleted card drops out).
// Covers: rate a generated card; reload and it is still rated; Progress with NO goal lists it under "Your feedback" beside
// "No learning goal set yet", and the row takes the learner to the card; with a goal Progress shows the same list apart from the skills;
// clear the rating, reload: nothing in Progress; rate, delete the card: Progress names no card and has no target; a shared view shows
// no control and makes no feedback request; no model request and no page error.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/card-feedback-mvp-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('card-feedback-mvp-check runs against the local stack only');
const SHOTS = process.argv[2] || 'card-feedback-mvp-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 8; // bump with the steps below; the printed line is what CI reads
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cardfbmvp-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } })).json().catch(() => null);
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Card feedback MVP ${run}` }) });
const BOARD = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [
  { id: 'gen', type: 'explanation', dx: 0, dy: 0, title: 'Balance sheets', body: 'Assets equal liabilities plus equity.' },
  { id: 'src', type: 'wiki', dx: 0, dy: 0, title: 'Balance sheet' },
] };
await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: BOARD }) });

const MODEL = /^\/api\/(ask$|learn\/(ask|selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
const stray = [], errors = [], results = [];
const fake = { values: new Map(), revisions: new Map(), puts: [], gets: 0 };
let page, context;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); await page?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {}); }
};
const until = async (fn, label, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 150)); } throw Error(label); };
const savedIds = async () => new Set(((await api(`/api/learn/boards/${canvas.name}/main`))?.state?.blocks ?? []).map(block => block.id));

const router = async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  if (path === '/api/learn/card-feedback') {
    if (request.method() === 'GET') {
      fake.gets += 1;
      const live = await savedIds();
      return route.fulfill({ json: { items: [...fake.values].filter(([cardId]) => live.has(cardId)).map(([cardId, value]) => ({ cardId, value, revision: fake.revisions.get(cardId), title: 'Balance sheets' })) } });
    }
    const body = request.postDataJSON();
    fake.puts.push({ cardId: body.cardId, value: body.value });
    fake.values.set(body.cardId, body.value); // a cleared rating stays as a row with no value, as the real route keeps it
    fake.revisions.set(body.cardId, (fake.revisions.get(body.cardId) ?? 0) + 1);
    return route.fulfill({ json: { cardId: body.cardId, value: body.value, revision: fake.revisions.get(body.cardId), updatedAt: new Date().toISOString() } });
  }
  if (MODEL.test(path)) { stray.push(`${request.method()} ${path}`); return route.abort(); }
  return route.continue();
};

const browser = await chromium.launch();
const open = async () => {
  context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/api/**', router);
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await card('gen').waitFor({ state: 'visible', timeout: 60000 });
};
const card = id => page.locator(`[data-block-id="${id}"]`);
const thumb = (id, which) => card(id).locator(`[data-card-thumb="${which}"]`);
const summary = () => page.locator('[data-card-feedback-summary]');
const progress = async () => { await page.locator('[data-panel-tab="progress"]').click(); await page.locator('[data-progress-pane]').waitFor({ timeout: 20000 }); };
const rate = async which => { const before = fake.puts.length; await card('gen').hover({ position: { x: 20, y: 30 } }); await thumb('gen', which).click(); await until(async () => fake.puts.length === before + 1, `a save for ${which}`); };
const reload = async () => { await page.waitForTimeout(2500); await context.close(); await open(); }; // the canvas autosave settles first

try {
  await open();

  await step('rate a generated card: the thumb is chosen and the rating is saved', async () => {
    await rate('up');
    assert.deepEqual(fake.puts.at(-1), { cardId: 'gen', value: 'up' });
    assert.equal(await thumb('gen', 'up').getAttribute('aria-pressed'), 'true');
  });

  await step('after a reload the card is still rated', async () => {
    await reload();
    await card('gen').hover({ position: { x: 20, y: 30 } });
    await until(async () => (await thumb('gen', 'up').getAttribute('aria-pressed')) === 'true', 'the rating comes back from the server');
  });

  await step('Progress with no goal lists the rating, labelled as the learner\'s own, and the row takes them to the card', async () => {
    await progress();
    await page.locator('[data-progress-empty]').waitFor({ timeout: 20000 });
    await summary().waitFor({ timeout: 20000 });
    const text = await summary().innerText();
    assert.match(text, /Your feedback/);
    assert.match(text, /Private to you\. What you said about a card, not an assessment of what you know\./);
    assert.match(text, /Understood \(1\)/);
    assert.match(text, /Balance sheets/);
    assert.doesNotMatch(text, /Still unclear/);
    await page.screenshot({ path: `${SHOTS}/progress-no-goal.png` });
    await summary().locator('[data-card-feedback-card="gen"]').click();
    await until(async () => (await card('gen').getAttribute('aria-current')) === 'true', 'the card is selected and in view');
  });

  await step('with a goal Progress still lists the same ratings, apart from the skills', async () => {
    const at = { app: canvas.name, board: 'main' };
    const state = (await api(`/api/learn/coaching?app=${canvas.name}&board=main`)).state;
    await api('/api/learn/coaching', { method: 'POST', body: JSON.stringify({ ...at, actionId: `goal-${run}`, expectedRevision: state.revision, action: 'create_goal', payload: { label: 'Read a balance sheet', criteria: [{ criterionId: 'c1', label: 'Read assets', requirement: 'Say what assets are', requiresReasoning: false }] } }) });
    await page.reload();
    await card('gen').waitFor({ state: 'visible', timeout: 60000 });
    await progress();
    await page.locator('[data-progress-goal]').waitFor({ timeout: 20000 });
    await summary().waitFor({ timeout: 20000 });
    assert.match(await summary().innerText(), /Understood \(1\)/);
    await page.screenshot({ path: `${SHOTS}/progress-goal.png` });
  });

  await step('clearing the rating removes it from Progress, also after a reload', async () => {
    await page.locator('[data-panel-tab="chat"]').click();
    await rate('up');
    assert.deepEqual(fake.puts.at(-1), { cardId: 'gen', value: null });
    await reload();
    await progress();
    await page.locator('[data-progress-goal],[data-progress-empty]').first().waitFor({ timeout: 20000 });
    await summary().waitFor({ timeout: 20000 });
    assert.equal(await page.locator('[data-card-feedback-card]').count(), 0, 'no row once the rating is cleared');
    assert.match(await summary().innerText(), /Nothing rated yet\./);
  });

  await step('a deleted card leaves Progress with no row and no target', async () => {
    await rate('down');
    await progress();
    await summary().locator('[data-card-feedback-card="gen"]').waitFor({ timeout: 20000 });
    await card('gen').click({ position: { x: 20, y: 30 } });
    await page.keyboard.press('Delete');
    await until(async () => (await card('gen').count()) === 0, 'the card is deleted');
    await page.locator('[data-panel-tab="chat"]').click();
    await progress();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-card-feedback-card]').count(), 0, 'no row and no target for the deleted card');
    assert.match(await summary().innerText(), /Nothing rated yet\./);
    await until(async () => !(await savedIds()).has('gen'), 'the deletion is saved');
  });

  await step('a shared view shows no control and makes no feedback request', async () => {
    await context.close(); // the owner's page autosaves: it must not race the restore below
    await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: BOARD }) });
    const shared = await api(`/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: BOARD }) });
    const viewer = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const before = [fake.gets, fake.puts.length];
    await viewer.route('**/api/**', router);
    const link = await viewer.newPage();
    link.on('pageerror', error => errors.push(error.message));
    await link.goto(`${BASE}/b/${shared.sharing.view}`);
    await link.locator('[data-block-id="gen"]').waitFor({ state: 'visible', timeout: 60000 });
    await link.locator('[data-block-id="gen"]').hover({ position: { x: 20, y: 30 } });
    await link.waitForTimeout(800);
    assert.equal(await link.locator('[data-card-thumbs], [data-card-thumb]').count(), 0);
    assert.deepEqual([fake.gets, fake.puts.length], before, 'no feedback request from a shared view');
    await link.screenshot({ path: `${SHOTS}/shared-view.png` });
    await viewer.close();
  });

  await step('no model request and no page error', async () => {
    assert.deepEqual(stray, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await context?.close().catch(() => {});
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL && results.length === TOTAL ? 0 : 1);
