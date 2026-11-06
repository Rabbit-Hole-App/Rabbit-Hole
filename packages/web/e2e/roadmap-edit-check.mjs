// Proposal editing in the current UI against the LOCAL stack with a fake roadmap job server and no model call (Tutor ladder R5, fork tier): Ctrl/Cmd+K on
// the pending proposal opens a small editor, Enter shows a preview beside the unchanged original, Esc discards it with the version unchanged, Ctrl/Cmd+Enter
// applies it (the overlay then shows the new version), Tab inside the editor accepts nothing, plain Tab accepts once after the editor closed, and dragging the
// strip moves it without a request.
// Written, never run by its author (browser automation is CI or owner only). Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/roadmap-edit-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fakeRoadmapServer } from './roadmap-fake-server.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('roadmap-edit-check runs against the local stack only');
const SHOTS = process.argv[2] || 'roadmap-edit-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 3; // bump with the steps below; the printed line is what CI reads
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `roadmapedit-${run}@example.com`, secret, handle: `roadmapedit_${run}` }) })).json();
const canvas = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Roadmap edit ${run}` }) })).json();

const MODEL = /^\/api\/(ask$|learn\/(selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
const stray = [], errors = [], results = [];
let current = null;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); await current?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {}); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const browser = await chromium.launch();
const open = async () => {
  const server = fakeRoadmapServer({ stage: 'pending' });
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
  await page.locator('[data-roadmap-overlay]').waitFor();
  return { server, page };
};
const title = page => page.locator('[data-roadmap-overlay] h3').innerText();
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

try {
  await step('Ctrl/Cmd+K on the proposal opens the editor; Enter previews beside the unchanged original; Esc discards with no version change and no accept', async () => {
    const { server, page } = await open();
    const original = await title(page);
    await page.locator('[data-roadmap-overlay]').focus();
    await page.keyboard.press(`${modifier}+k`);
    const editor = page.locator('[data-roadmap-editor] textarea');
    await editor.waitFor();
    await editor.fill('make it a table');
    await page.keyboard.press('Enter');
    await page.locator('[data-roadmap-draft]').waitFor();
    assert.equal(await title(page), original, 'the pending original is unchanged beside the preview');
    assert.match(await page.locator('[data-roadmap-draft]').innerText(), /Edited title/);
    await page.screenshot({ path: `${SHOTS}/1-preview.png` });
    await page.keyboard.press('Escape');
    await until(async () => (await page.locator('[data-roadmap-editor]').count()) === 0, 'editor closed');
    assert.equal(await title(page), original);
    assert.equal(server.count('/apply'), 0);
    assert.equal(server.count('/accept'), 0);
    await until(async () => server.count('/discard') === 1, 'discard housekeeping sent');
  });
  await step('Ctrl/Cmd+Enter applies the preview (the overlay shows the new version); Tab in the editor accepts nothing; plain Tab accepts once after it closed', async () => {
    const { server, page } = await open();
    await page.locator('[data-roadmap-overlay]').focus();
    await page.keyboard.press(`${modifier}+k`);
    const editor = page.locator('[data-roadmap-editor] textarea');
    await editor.fill('make it a table');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    assert.equal(server.count('/accept'), 0, 'Tab inside the editor does not accept');
    await editor.focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-roadmap-draft]').waitFor();
    await page.keyboard.press(`${modifier}+Enter`);
    await until(async () => (await title(page)) === 'Edited title', 'new version shown');
    assert.equal(await page.locator('[data-roadmap-editor]').count(), 0, 'closed after the server confirmed');
    assert.equal(server.count('/apply'), 1);
    await page.locator('[data-canvas-surface]').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('Tab');
    await until(async () => server.count('/accept') === 1, 'one accept');
    assert.equal(server.calls.find(c => c.path.endsWith('/accept')).body.proposalVersion, 2, 'the edited version is the one accepted');
    await page.screenshot({ path: `${SHOTS}/2-applied.png` });
  });
  await step('dragging the strip moves it without any request, and no stray model request or page error', async () => {
    const { server, page } = await open();
    const handle = page.locator('[data-roadmap-drag]');
    const before = await page.locator('[data-roadmap-overlay]').boundingBox();
    const at = await handle.boundingBox();
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 - 120, at.y + at.height / 2 - 60, { steps: 6 });
    await page.mouse.up();
    const after = await page.locator('[data-roadmap-overlay]').boundingBox();
    assert.ok(Math.abs(after.x - before.x) > 40 || Math.abs(after.y - before.y) > 20, 'the strip moved');
    const mutations = server.calls.filter(c => c.method === 'POST').length;
    assert.equal(mutations, 0, 'moving changes no content and sends nothing');
    assert.deepEqual(stray, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL ? 0 : 1);
