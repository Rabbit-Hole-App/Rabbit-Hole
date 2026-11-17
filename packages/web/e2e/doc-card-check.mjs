// Document card: the one browser path for it (src/DocCard.jsx, canvas-menus.js Insert > Document, AdaptiveCanvas insertDocument). Insert > Document adds a card, the learner types a
// heading and a paragraph into its BlockNote editor, the board is saved (the server holds the text), a RELOAD shows the same text in the card, and a second Document card can be
// inserted while the first keeps its text. Against the LOCAL keyless stack only; no model is called. Prints `ok <label>` per check and exits 1 on any failure; deletes its canvas.
// Usage: BASE=http://127.0.0.1:9631 SMALL_CP=http://127.0.0.1:9633 VARS=<cp .dev.vars> node e2e/doc-card-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openMenu } from './canvas-menu-helpers.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:9631';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9633';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('doc-card-check runs against the local stack only');
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `doccard-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Doc card ${run}` }) });
assert.match(canvas?.name || '', /^canvas-/, 'the canvas was not created');

const HEADING = `Rehearsal heading ${run}`, PARAGRAPH = `First paragraph ${run}.`;
const docsOnServer = async () => (await api(`/api/learn/boards/${canvas.name}/main`))?.state?.blocks?.filter(b => b.type === 'doc') || [];
const until = async (read, message, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await read()) return; await new Promise(done => setTimeout(done, 200)); } throw Error(message); };

const browser = await chromium.launch();
const errors = [], results = [], failures = [];
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); } catch (error) { failures.push(label); console.log(`FAIL ${label}: ${error.message.split('\n').slice(0, 6).join(' / ')}`); }
};
const open = async () => { await page.goto(`${BASE}/apps/${canvas.name}`); await page.locator('[data-canvas-surface]').waitFor({ timeout: 60000 }); };
const insertDocument = async () => { const insert = await openMenu(page, 'Insert'); await insert.getByRole('menuitem', { name: 'Document', exact: true }).click(); };
const editorOf = card => card.locator('[contenteditable="true"]').first();

await open();
await check('1 Insert > Document adds one Document card', async () => {
  await insertDocument();
  await page.locator('[data-doc-card]').first().waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-doc-card]').count(), 1);
});
await check('2 a heading and a paragraph typed into the editor are saved on the server', async () => {
  const editor = editorOf(page.locator('[data-doc-card]').first());
  await editor.click();
  await page.keyboard.type(`# ${HEADING}`); // BlockNote turns "# " into a Heading
  await page.keyboard.press('Enter');
  await page.keyboard.type(PARAGRAPH);
  // The 500 ms quiet patch, then the board save: the Saved marker shows while the card is focused, and the server holds the words.
  await page.locator('[data-doc-save-status][data-state="saved"]').waitFor({ timeout: 20000 });
  await until(async () => { const [doc] = await docsOnServer(); const text = JSON.stringify(doc?.blocks || []); return text.includes(HEADING) && text.includes(PARAGRAPH); }, 'the server board does not hold the typed text');
  assert.ok((await docsOnServer())[0].blocks.some(b => b.type === 'heading'), 'the first block is a heading');
});
await check('3 after a reload the same text is in the Document card', async () => {
  await open();
  const card = page.locator('[data-doc-card]').first();
  await card.waitFor({ timeout: 60000 });
  await until(async () => (await card.innerText()).includes(PARAGRAPH), 'the reloaded card does not show the paragraph');
  assert.match(await card.innerText(), new RegExp(HEADING));
  assert.equal(await page.locator('[data-doc-card]').count(), 1);
});
await check('4 a second Document card can be inserted and the first keeps its text', async () => {
  await insertDocument();
  await until(async () => await page.locator('[data-doc-card]').count() === 2, 'the second Document card did not appear');
  await until(async () => (await docsOnServer()).length === 2, 'the server board does not hold two Document cards');
  const first = page.locator('[data-doc-card]').filter({ hasText: PARAGRAPH });
  assert.equal(await first.count(), 1, 'exactly one card holds the first text');
  assert.match(await first.innerText(), new RegExp(HEADING));
});
await check('5 no page errors', async () => { const fatal = errors.filter(e => !/ResizeObserver/.test(e)); assert.deepEqual(fatal, []); });

await browser.close();
await api(`/api/apps/${canvas.name}`, { method: 'DELETE' }).catch(() => {});
const total = 5;
console.log(`${results.length}/${total} doc card checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
if (results.length !== total) process.exitCode = 1;
