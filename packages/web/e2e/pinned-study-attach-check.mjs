// Pinned Study (UI-27 Release 1) lane 2: Add pinned reference, against the LOCAL stack only (fresh browser profile, local D1).
// Written against the lane 1 shell by its contract (C:/s/spec/pinned-study/contract.md copy list and "Add pinned reference");
// the selectors it assumes beyond accessible names are all in SEL below, so a lane 1 rename is one line. Owner rule 2026-10-21:
// Claude does not run browser checks; this check is run by the CI gate and the owner.
// No model is ever called: /api/learn/ask and the Tutor planner are answered here with canned text and CAPTURED (none may be
// sent), and every other model-capable non-GET route is aborted and counted (none may happen).
// Setup: a canvas with one 4-page PDF context document and its PDF card (seeded ink). The PDF card is pinned from its own menu
// (Pin for study), which opens the reader; the reader turns pages with its own Next paper page button.
//   1 Add pinned reference adds ONE removable chip for the pinned document at the reader's page (p. 1), opens Chat in Ask, and
//     keeps the draft the learner had typed;
//   2 nothing is sent and no model route is called by an Add (no ask captured, none refused);
//   3 turning the page and scrolling the reader leaves that chip exactly as it was (still one chip, still p. 1);
//   4 a second Add at page 2 adds a second chip, a repeat Add at page 2 adds none;
//   5 removing one chip removes only that chip;
//   6 when the pinned source is no longer readable (its bytes route answers 404), Add pinned reference is refused with a visible
//     Reference unavailable and no chip is added; readable again, it adds the chip;
//   7 the delayed-authorization race: the source check is held (route-delayed HEAD) while the reader turns the page; the chip is the
//     page pressed, never the page shown when the check returns, and a double press during the hold adds one chip;
//   8 the Chat draft, mode and chips survive Canvas -> Study -> Canvas;
//   9 no model-capable request was made, none was sent, no page error.
// Prints `ok <label>` per step, counts and ids only (no cookies, no secrets); `N/total passed`; exits 1 on any failure.
// Usage: BASE=http://127.0.0.1:8901 SMALL_CP=http://127.0.0.1:8903 VARS=<cp .dev.vars> OUT=<dir> node e2e/pinned-study-attach-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chatRouteAnswer } from './dev-cp.mjs';
import { closeMenus, openMenu } from './canvas-menu-helpers.mjs';

const total = 9; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8901';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8903';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('pinned-study-attach-check runs against the local stack only');
const OUT = process.env.OUT || process.argv[2] || new URL('./shots/pinned-study-attach', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `psa-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();

// The names this check relies on: accessible names from the contract copy list, plus the data attributes that already exist in
// the app. Anything lane 1 names differently is changed here only.
const SEL = {
  canvas: '[aria-label="Lesson canvas"]',
  card: '[data-block-id="study-pdf"]',
  menu: '[data-canvas-menu]',
  pinRow: '[data-menu-pin-study]',
  add: { role: 'button', name: 'Add pinned reference' },
  nextPage: { role: 'button', name: 'Next paper page' },
  reader: '[data-source-reader]',
  chat: '[data-chat-pane]',
  chip: '[data-chat-pane] [data-context-chip]',
  draft: '[data-chat-pane] [data-chat-composer] textarea',
  mode: '[data-chat-pane] [data-chat-mode]',
};

// ---------------------------------------------------------------- one 4-page PDF context document, "Study <n>" on page n
function makePdf(pages = 4) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let n = 1; n <= pages; n++) {
    const stream = `BT /F1 72 Tf 60 400 Td (Study ${n}) Tj ET`;
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + `${5 + (n - 1) * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const NAME = 'reading.pdf';
const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Pinned attach ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(canvas).slice(0, 200)}`);
const form = new FormData();
form.append('app', canvas.name);
form.append('file', new Blob([makePdf()], { type: 'application/pdf' }), NAME);
const doc = (await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie } })).json()).document;
if (!/^ctx:[0-9a-f]{12}$/.test(doc?.id || '')) throw Error('the context document was not stored');
const KEY = `doc:${doc.id}`;
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const SEED = { strokes: [], shapes: [], links: [], groups: [], areas: [], exchanges: [], items: [], blocks: [{ id: 'study-pdf', type: 'pdf', assetKey: KEY, label: NAME, dx: 0, dy: 0 }] };

// ---------------------------------------------------------------- routes: capture and canned answers
const captured = [], refused = [], outside = [], errors = [];
let sourceGone = false; // step 6: the pinned document's bytes route answers 404, as after a revoked or deleted source
let hold = null; // step 7: { seen, release, promise }; the authorizer's status-only HEAD of the bytes route waits for release()
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  if (sourceGone && ['GET', 'HEAD'].includes(request.method()) && url.pathname === `/api/learn/context/${encodeURIComponent(doc.id)}`) return route.fulfill({ status: 404, json: { error: 'not found' } });
  if (hold && request.method() === 'HEAD' && url.pathname === `/api/learn/context/${encodeURIComponent(doc.id)}`) { hold.seen++; await hold.promise; return route.fallback(); }
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.fallback();
  const path = url.pathname;
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/learn/ask') {
    const reply = captured.push({ route: 'ask', body });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: `Canned reply ${reply}.` })
      + frame('answer_meta', { messageId: `m-${reply}`, actions: [], followUps: [], alternatives: [`m-${reply}`], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `psa-thread-${reply}`, userMessageId: `u-${reply}`, messageId: `m-${reply}` }) });
  }
  if (path === '/api/learn/chat/route') return route.fulfill({ json: chatRouteAnswer(body) });
  if (MODEL.test(path)) { refused.push(`${request.method()} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 400);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}`);
    await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
// A sandboxed frame has no localStorage, so the seed is written where there is one.
await context.addInitScript(([key, seed]) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); } catch { /* a sandboxed frame */ } }, [INK, SEED]);
await context.route('**/*', router);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
// what: a message, or a function that builds it when the wait fails (so it reports the state then, not before the wait).
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(typeof what === 'function' ? await what() : what); await page.waitForTimeout(150); } };
const addButton = () => page.getByRole(SEL.add.role, { name: SEL.add.name, exact: true });
// Every chip in Chat, and the page chips of this document. A new upload is switched on as canvas context (control-plane
// learn-context-docs.js: attached while under the limit), so Chat already shows the whole document's own chip (range null)
// before anything is pinned; this check is about the page chips Add pinned reference makes, and that the rest never change.
const allChips = () => page.locator(SEL.chip).evaluateAll(items => items.map(item => ({
  text: item.innerText.replace(/\s+/g, ' ').trim(), key: item.getAttribute('data-ref-key'), remove: item.querySelector('button[aria-label^="Remove "]')?.getAttribute('aria-label') || null })));
const pageKey = n => `${KEY}|${JSON.stringify({ page: n })}`;
const chips = async () => (await allChips()).filter(chip => /^\{"page":\d+\}$/.test(String(chip.key).slice(KEY.length + 1)) && String(chip.key).startsWith(`${KEY}|`));
// A chip's own remove button, found by its ref key (two chips of one document share a name; the key holds quotes and braces,
// so it is matched in the page, not put in a selector); exactly one such chip.
const removeChip = async key => {
  const at = (await allChips()).map((chip, index) => (chip.key === key ? index : -1)).filter(index => index >= 0);
  assert.equal(at.length, 1, `one chip for ${key}: ${JSON.stringify(await allChips())}`);
  await page.locator(SEL.chip).nth(at[0]).locator('button[aria-label^="Remove "]').click();
};
const keysOf = list => list.map(chip => chip.key).sort();
// When an Add shows no chip: the chips there are, and whether the pane refused it (Reference unavailable, its reason).
const why = async label => `${label}: chips ${JSON.stringify(keysOf(await allChips()))}; refused ${await page.locator('[data-study-attach-refused]').getAttribute('data-reason').catch(() => 'no')}; Add ${await addButton().isDisabled().catch(() => null) ? 'disabled' : 'enabled'}`;

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator(SEL.canvas).waitFor({ timeout: 60000 });
await page.locator(SEL.chat).waitFor({ state: 'visible', timeout: 30000 });
await page.locator(`${SEL.canvas} ${SEL.card}`).first().waitFor({ timeout: 30000 });
// The canvas context chip of the new upload arrives with the context list: wait for it (it may not come when the canvas holds
// more than the attach limit), then the chips are the baseline Pin for study must leave as they are.
await waitFor(async () => (await allChips()).some(chip => chip.key === `${KEY}|null`), 15000).catch(() => {});
await page.waitForTimeout(1000);
const baseline = keysOf(await allChips()); // the canvas context chips, before anything is pinned

// Pin the PDF card from its own menu: the shared Pin for study row (right-click and Card options come from one registry).
await page.locator(`${SEL.card} [data-drag-zone]`).last().click({ button: 'right', position: { x: 30, y: 10 } });
await page.locator(SEL.menu).waitFor();
await page.locator(SEL.menu).locator(SEL.pinRow).click();
await addButton().waitFor({ timeout: 30000 });
await page.locator(SEL.reader).first().waitFor({ timeout: 30000 });

await check('1. Add pinned reference adds one removable chip for the pinned PDF at page 1, in Ask, and keeps the typed draft', async () => {
  // Keys only: a chip of the selected card's own source is marked selected while that card is selected (ContextChips).
  assert.deepEqual(keysOf(await allChips()), baseline, 'Pin for study attaches nothing');
  assert.deepEqual(await chips(), [], 'no page chip yet');
  await page.locator(SEL.draft).fill('my unsent question');
  await addButton().click();
  await waitFor(async () => (await chips()).length === 1, 8000, () => why('after one Add'));
  const [chip] = await chips();
  assert.equal(chip.key, pageKey(1));
  assert.ok(chip.text.includes(NAME) && chip.text.includes('p. 1'), `chip text: ${chip.text}`);
  assert.ok(chip.remove, 'the chip has its own remove button');
  assert.equal(await page.locator(SEL.mode).first().getAttribute('data-chat-mode'), 'ask');
  assert.equal(await page.locator(SEL.draft).inputValue(), 'my unsent question');
  await page.screenshot({ path: `${OUT}/1-attached.png` });
});

await check('2. an Add sends nothing and calls no model route', async () => {
  await page.waitForTimeout(1500);
  assert.deepEqual(captured, [], 'no turn was sent');
  assert.deepEqual(refused, [], `model-capable routes: ${refused.join(', ')}`);
});

await check('3. turning the page and scrolling the reader leaves the attached chip unchanged', async () => {
  const before = await chips();
  await page.getByRole(SEL.nextPage.role, { name: SEL.nextPage.name }).first().click();
  await page.locator(SEL.reader).first().hover();
  await page.mouse.wheel(0, 400);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(1200);
  assert.deepEqual(await chips(), before);
  assert.equal(before.length, 1);
});

await check('4. a second Add at page 2 adds a second chip, a repeat Add at page 2 adds none', async () => {
  await addButton().click();
  await waitFor(async () => (await chips()).some(chip => chip.key === pageKey(2)), 8000, () => why('after the Add at page 2'));
  assert.deepEqual(keysOf(await chips()), [pageKey(1), pageKey(2)].sort());
  await addButton().click();
  await page.waitForTimeout(1200);
  assert.equal((await chips()).length, 2, 'the same page is one chip');
});

await check('5. removing one chip removes only that chip', async () => {
  await removeChip(pageKey(2));
  await waitFor(async () => (await chips()).length === 1, 8000, () => why('the chip was not removed'));
  assert.deepEqual(keysOf(await chips()), [pageKey(1)]);
});

await check('6. an unreadable source refuses Add pinned reference with Reference unavailable and no chip; readable again, it adds the chip', async () => {
  const before = await chips();
  sourceGone = true;
  await addButton().click();
  await page.getByText('Reference unavailable').first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(800);
  assert.deepEqual(await chips(), before, 'no chip was added');
  sourceGone = false;
  await addButton().click();
  await waitFor(async () => (await chips()).length === before.length + 1, 8000, () => why('the readable source did not add its chip'));
  assert.ok((await chips()).some(chip => chip.key === pageKey(2)), 'the page 2 chip is back');
  await removeChip(pageKey(2));
  await waitFor(async () => (await chips()).length === before.length, 8000, () => why('the chip was not removed'));
});

await check('7. a page turn while the source check is held does not change the chip: the pressed page lands, and a double press adds one chip', async () => {
  const before = await chips();
  let release;
  hold = { seen: 0, promise: new Promise(resolve => { release = resolve; }), release: () => release() };
  await addButton().click(); // at page 2 (step 3 turned to it)
  await waitFor(async () => hold.seen === 1, 8000, () => `the source check was not held (${hold.seen} HEADs)`);
  await page.getByRole(SEL.nextPage.role, { name: SEL.nextPage.name }).first().click(); // the reader moves to page 3 during the check
  await page.waitForTimeout(600);
  assert.deepEqual(await chips(), before, 'nothing is attached while the check is pending');
  hold.release();
  await waitFor(async () => (await chips()).length === before.length + 1, 8000, () => why('the pressed page did not land'));
  assert.deepEqual(keysOf(await chips()), [...keysOf(before), pageKey(2)].sort(), 'page 2 (pressed), not page 3 (shown after the check)');
  hold = null;
  hold = { seen: 0, promise: new Promise(resolve => { release = resolve; }), release: () => release() };
  await addButton().dblclick(); // at page 3: two presses; the older is superseded
  await waitFor(async () => hold.seen >= 1, 8000, () => 'the second source check was not held');
  hold.release();
  await waitFor(async () => (await chips()).some(chip => chip.key === pageKey(3)), 8000, () => why('the double press did not land'));
  await page.waitForTimeout(800);
  assert.equal((await chips()).filter(chip => chip.key === pageKey(3)).length, 1, 'one chip for page 3');
  assert.equal((await chips()).length, before.length + 2);
  hold = null;
  await removeChip(pageKey(3));
  await removeChip(pageKey(2));
  await waitFor(async () => (await chips()).length === before.length, 8000, () => why('the race chips were not removed'));
});

await check('8. the Chat draft, mode and chips survive Canvas -> Study -> Canvas', async () => {
  const state = async () => ({ chips: keysOf(await allChips()), draft: await page.locator(SEL.draft).inputValue(), mode: await page.locator(SEL.mode).first().getAttribute('data-chat-mode') });
  const before = await state();
  assert.equal(before.draft, 'my unsent question');
  for (const view of ['Canvas', 'Study']) {
    const menu = await openMenu(page, 'View');
    await menu.getByRole('menuitemradio', { name: view, exact: true }).click();
    await closeMenus(page);
    await page.waitForTimeout(800);
    assert.deepEqual(await state(), before, `after View > ${view}`);
  }
  await page.screenshot({ path: `${OUT}/6-after-switch.png` });
});

await check('9. no model-capable request, no turn sent, no page error', async () => {
  assert.deepEqual(captured, []);
  assert.deepEqual(refused, [], `model-capable routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await context.close();
await browser.close();
const passed = results.filter(r => r.ok).length;
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvas: canvas.name, document: doc.id, total, passed, failed: results.length - passed, results, outside_hosts: [...new Set(outside)], refused, page_errors: errors }, null, 2));
if (results.length !== total) console.log(`FAIL ran ${results.length} checks, but total says ${total}`);
console.log(`${passed}/${total} passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
