// The R4 smoke against the LOCAL stack with a fake roadmap job server and no model call (Tutor ladder R4, fork tier): invitation to
// plan to accept to Tab to one delivered card (save before acknowledgement), reload and a second device (still one card), Cancel,
// Propose next step, End roadmap, a failed card's Retry/Replace/Omit in Chat and the ToC, and a stale 409 showing the latest state; then the R6 automatic
// next proposal (flag-off server fake offers it): it appears by itself, Ask holds it back, a server offering nothing leaves manual Propose working, reload shows it once.
// What it cannot show: a real explanation (the server is faked; the real-model smoke is a separate, bounded paid check) or the
// Next step ready indicator for an offscreen source card (covered by roadmap-client.test.mjs until a source card can be placed).
// Written, never run by its author (browser automation is CI or owner only). Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/roadmap-mvp-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fakeRoadmapServer } from './roadmap-fake-server.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('roadmap-mvp-check runs against the local stack only');
const SHOTS = process.argv[2] || 'roadmap-mvp-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 12; // bump with the steps below; the printed line is what CI reads
const CARD = 'cd_71e20ac49f8b3d5612a7c0e4';
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `roadmapmvp-${run}@example.com`, secret, handle: `roadmapmvp_${run}` }) })).json();
const headers = { cookie: `small_session=${session}`, 'content-type': 'application/json' };
const make = async title => (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers, body: JSON.stringify({ title: `${title} ${run}` }) })).json();

const MODEL = /^\/api\/(ask$|learn\/(selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
// Click empty canvas well below the canvas header (a click at the surface's top-left lands on the header, not the canvas).
const clickBlankCanvas = async page => { const surface = page.locator('[data-canvas-surface]'); const bounds = await surface.boundingBox(); await surface.click({ position: { x: 20, y: Math.min(bounds.height - 20, 650) } }); };
const stray = [], errors = [], results = [];
let current = null;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); await current?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {}); }
};
const until = async (fn, label, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const browser = await chromium.launch();
const open = async (canvas, server, context = null) => {
  context ||= await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/api/learn/roadmap**', server.handler);
  await context.route('**/*', route => { const path = new URL(route.request().url()).pathname; if (MODEL.test(path) && route.request().method() !== 'GET') { stray.push(path); return route.abort(); } return route.fallback(); });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  current = page;
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 60000 });
  return page;
};
// R6 (folded from roadmap-auto-check.mjs): one fresh context and fake server per step, on a shared canvas.
const openAuto = async (canvas, options) => { const server = fakeRoadmapServer(options); return { server, page: await open(canvas, server) }; };
const setMode = async (page, mode) => { await page.locator('[data-chat-pane]').getByRole('button', { name: 'Mode', exact: true }).click(); await page.getByRole('menuitemradio', { name: new RegExp(`^${mode}`) }).click(); };
const box = (page, id) => page.locator(`[data-block-id="${id}"]`).first().boundingBox();
const toc = page => page.getByRole('tab', { name: /^Table of contents/ }).click();
const cards = page => page.locator(`[data-block-id="${CARD}"]`);

try {
  const main = await make('Roadmap smoke');
  const server = fakeRoadmapServer({ invitation: true });
  let page = await open(main, server);
  await step('Explain on canvas creates the roadmap from the invitation; the plan shows outcome, assumptions and stopping point in the ToC', async () => {
    await page.locator('[data-roadmap-invitation]').getByRole('button', { name: 'Explain on canvas' }).click();
    await until(async () => server.calls.some(c => c.method === 'POST' && (c.path === '' || c.path === '/')), 'create request');
    const create = server.calls.find(c => c.method === 'POST' && (c.path === '' || c.path === '/'));
    assert.ok(create.body.invitationId && create.body.source?.key && create.body.source.scope.kind === 'whole');
    await toc(page);
    const plan = page.locator('[data-roadmap-plan]');
    await plan.locator('[data-roadmap-outcome]').waitFor();
    for (const needle of ['Assumptions', 'Stopping point', 'Explanations']) assert.match(await plan.innerText(), new RegExp(needle));
    await page.screenshot({ path: `${SHOTS}/1-plan.png` });
  });
  await step('Edit plan opens the ToC conversation composer; Accept plan activates the roadmap and shows one pending proposal', async () => {
    await page.locator('[data-roadmap-edit-plan]').click();
    await page.locator('[data-toc-composer]').waitFor();
    await page.locator('[data-roadmap-accept-plan]').click();
    await until(async () => server.count('/accept-plan') === 1, 'accept-plan sent once');
    await page.locator('[data-roadmap-overlay]').waitFor();
    assert.equal(await page.locator('[data-roadmap-overlay]').count(), 1);
  });
  await step('Tab accepts the proposal once; the authorized card is inserted once, the board is saved, then the delivery is acknowledged', async () => {
    await clickBlankCanvas(page);
    await page.keyboard.press('Tab');
    await until(async () => server.count('/ack') >= 1, 'acknowledgement sent');
    const order = server.calls.filter(c => c.method === 'POST').map(c => c.path.split('/').pop());
    assert.deepEqual(order.slice(order.indexOf('accept')).filter(x => ['accept', 'deliver', 'ack'].includes(x)).slice(0, 3), ['accept', 'deliver', 'ack']);
    assert.equal(await cards(page).count(), 1);
    assert.equal(server.count('/accept'), 1);
    const ack = server.calls.find(c => c.method === 'POST' && c.path.endsWith('/ack'));
    assert.ok(Number.isInteger(ack.body.boardRevision) && ack.body.boardRevision >= 1, `the acknowledgement names the saved board revision, got ${ack.body.boardRevision}`);
    await page.screenshot({ path: `${SHOTS}/3-delivered.png` });
  });
  await step('reload and a second device show the same single card and no second purchase', async () => {
    await page.reload();
    await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 60000 });
    await cards(page).first().waitFor();
    assert.equal(await cards(page).count(), 1);
    const second = await open(main, server);
    await cards(second).first().waitFor();
    assert.equal(await cards(second).count(), 1);
    assert.equal(server.count('/accept'), 1);
    await second.context().close();
  });
  await step('Cancel pauses with Proposal cancelled; Propose next step offers a new proposal; End roadmap ends it', async () => {
    server.stage = 'delivered'; // step 1 delivered, step 2 proposed and pending
    await page.reload();
    await page.locator('[data-roadmap-overlay]').waitFor();
    await page.locator('[data-roadmap-cancel]').click();
    await until(async () => server.count('/cancel') === 1, 'cancel sent once');
    await page.getByText('Proposal cancelled').first().waitFor();
    assert.equal(await page.locator('[data-roadmap-overlay]').count(), 0, 'no automatic re-proposal');
    await toc(page);
    await page.locator('[data-roadmap-propose-next]').click();
    await page.locator('[data-roadmap-overlay]').waitFor();
    await page.locator('[data-roadmap-end]').click();
    await until(async () => server.count('/end') === 1, 'end sent once');
    await page.getByText('You reached the stopping point of this roadmap.', { exact: false }).first().waitFor();
    assert.ok(await cards(page).count() >= 1, 'delivered cards stay');
  });
  await step('a failed card is announced once through the existing error toast, and its Retry sends one retry', async () => {
    server.stage = 'failed';
    await page.reload();
    const note = page.locator('[data-toast-error]').filter({ hasText: 'could not be made' });
    await note.waitFor();
    assert.equal(await page.locator('[data-roadmap-recovery]').count(), 0, 'no recovery block in Chat or the Contents');
    await note.locator('[data-toast-action]').click();
    await until(async () => server.count('/retry') === 1, 'retry sent once');
  });
  await step('a stale accept (another device went first) shows the latest state with the plain sentence and buys nothing more', async () => {
    server.stage = 'pending';
    await page.reload();
    await page.locator('[data-roadmap-overlay]').waitFor();
    const before = server.count('/accept');
    server.stage = 'generating'; // the other device accepted
    await page.locator('[data-roadmap-accept]').click();
    await page.getByText('This roadmap changed. Showing the latest.').first().waitFor();
    assert.equal(server.count('/accept'), before, 'no accept applied');
    assert.equal(await page.locator('[data-roadmap-overlay]').count(), 0);
  });
  await step('a held result shows only the checking line, no result text; no stray model request or page error', async () => {
    server.stage = 'held';
    await page.reload();
    await page.getByText('Checking this explanation before it is added.').first().waitFor();
    assert.equal(server.count('/deliver'), 1, 'no delivery attempt for the held result (the earlier one was step 3)');
    assert.deepEqual(stray, []);
    assert.deepEqual(errors, []);
  });
  const auto = await make('Roadmap auto');
  await step('after a delivered card the next step appears by itself: one overlay, no propose or accept request, the card does not move, no new Chat line', async () => {
    const { server, page } = await openAuto(auto, { stage: 'generated', auto: true, autoAfterReads: 2 });
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
    await page.screenshot({ path: `${SHOTS}/9-auto-proposal.png` });
  });
  await step('Ask holds the proposal back; returning to Tutor shows it with no new request of ours', async () => {
    const { server, page } = await openAuto(auto, { stage: 'delivered' });
    await page.locator('[data-roadmap-overlay]').waitFor();
    await setMode(page, 'Ask');
    await until(async () => (await page.locator('[data-roadmap-overlay]').count()) === 0, 'hidden in Ask');
    const before = server.count('/steps/propose') + server.count('/accept');
    await setMode(page, 'Tutor');
    await page.locator('[data-roadmap-overlay]').waitFor();
    assert.equal(server.count('/steps/propose') + server.count('/accept'), before);
  });
  await step('when the server offers nothing (Auto-suggest off) no overlay appears and the manual Propose next step still works', async () => {
    const { server, page } = await openAuto(auto, { stage: 'generated', auto: true, autoAfterReads: 1e9 });
    await until(async () => server.count('/ack') === 1, 'acknowledged');
    await page.waitForTimeout(5000);
    assert.equal(await page.locator('[data-roadmap-overlay]').count(), 0);
    await toc(page);
    await page.locator('[data-roadmap-propose-next]').click();
    await page.locator('[data-roadmap-overlay]').waitFor();
    assert.equal(server.count('/steps/propose'), 1);
  });
  await step('a reload shows the state the server holds (the automatic proposal, once), and no stray model request or page error', async () => {
    const { page } = await openAuto(auto, { stage: 'delivered' });
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
