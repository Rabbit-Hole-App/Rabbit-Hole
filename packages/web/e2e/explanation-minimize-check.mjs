// Release 117 minimize flow (owner 2026-11-08; docs/features/explain/benchmarks/test-ledger.md rows "minimize card" and "card width"), against the LOCAL keyless stack only: Minimize is its own pill beside
// the long Add to chat / Quick Edit group (same 34 px height, same pill radius), a non-Explanation card has no Minimize; an old Explanation with no summary minimizes to a tile that shows its first whole
// sentences, then the stubbed summary replaces them (one route call, never an ellipsis); the tile and its summary survive a reload without a second call; Expand (button, Enter, Space) restores the full card
// at its own width; a picture card is a 546 px tile with the picture at 512 and no summary call (it has one). No model is called: every model-capable non-GET route is aborted and counted (none may happen);
// the summary route is stubbed and counted. Owner rule 2026-10-21: Claude does not run browser checks; CI runs this one.
// Prints `ok <label>` per step, ids and counts only, then `N/total checks passed`; exits 1 on a failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/explanation-minimize-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { references as dataRefs } from '../src/tutor-diagrams/ml-data-references.js';

const total = 8; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('explanation-minimize runs against the local stack only');
const SHOTS = process.argv[2] || (process.env.PERSIST ? `${process.env.PERSIST}/../../explanation-minimize-shots` : 'explanation-minimize-shots');
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `explanation-minimize-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

// A 320 x 180 picture (16:9) as a data URL: no request. The card shows it at PICTURE_DISPLAY_WIDTH (512) whatever its source size.
const PICTURE = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#2383e2"/><circle cx="160" cy="90" r="60" fill="#ffffff"/></svg>').toString('base64')}`;
const fence = spec => '```rh-diagram\n' + JSON.stringify(spec) + '\n```';
const WIDE = dataRefs.find(r => r.id === 'bayes-class-token-counts').spec; // a teaching matrix: 707 px natural width
// the same matrix with three more columns: 1121 px natural, above the 960 px cap
const WIDER = (() => { const w = JSON.parse(JSON.stringify(WIDE)), extra = ['Extra one', 'Extra two', 'Extra three']; w.diagram.columns = [...w.diagram.columns, ...extra]; w.diagram.rows = w.diagram.rows.map(r => ({ ...r, cells: [...r.cells, ...extra.map(() => '0.10')] })); return w; })();
const PROSE = 'Tides rise because the Moon pulls the near ocean more than the Earth. The far side bulges too, since the Earth is pulled away from its water. Together they make two bulges.';
const STUB_SUMMARY = 'A stubbed summary that says the card in one whole sentence.';
const BLOCKS = [
  { id: 'ex', type: 'explanation', dx: 0, dy: 0, title: 'Why tides rise', body: PROSE }, // an OLD card: no summary
  { id: 'pc', type: 'explanation', dx: 0, dy: 0, title: 'A picture card', body: 'A short paragraph about the picture.', illustration: { src: PICTURE, alt: 'A white circle on blue', caption: 'A test picture.' }, summary: 'A stored, good summary of the picture card.' },
  { id: 'tb', type: 'table', dx: 0, dy: 0, title: 'Tides', columns: ['Place', 'High', 'Low'], rows: [['Dover', '6.1 m', '0.8 m'], ['Brest', '7.0 m', '1.2 m']] },
];
const FIRST = 'ex';
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `explanation-minimize ${run}` }) });
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const catalog = await api('/api/apps');
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;

const ITEMS = []; // the helper block below reads it (no free-standing notes on these boards)
const model = [], saves = [], errors = [], summaryCalls = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|next-steps|selection|plan|course|video|cad))/;
// The summary route is the one model-capable route the minimize flow calls: it is answered here (after a short delay, so the first-sentences state can be seen) and counted; no real model.
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) return route.abort();
  if (url.pathname === '/api/learn/explanation-summary') { summaryCalls.push(JSON.parse(request.postData() || '{}').id ?? '?'); await new Promise(resolve => setTimeout(resolve, 700)); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: STUB_SUMMARY }) }); }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && MODEL.test(url.pathname)) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && /^\/api\/learn\/boards\/[^/]+\/[^/]+$/.test(url.pathname)) saves.push(url.pathname);
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, seed]) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); } catch { /* a sandboxed frame */ } }, [INK, STATE]);
await context.route('**/*', router);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 200)));

const results = [], failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 4).join(' / ')}`); await page.screenshot({ path: `${SHOTS}/fail-${failures.length}.png` }).catch(() => {}); await back().catch(() => {}); }
};
const shot = name => page.screenshot({ path: `${SHOTS}/${name}.png` });
const NOTES = new Set(ITEMS.map(item => item.id));
const card = id => (NOTES.has(id) ? `[data-item-id="${id}"]` : `[data-block-id="${id}"]`);
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw Error(what); await page.waitForTimeout(100); } };
const rect = selector => page.evaluate(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null; }, selector);
const geometry = () => page.evaluate(key => { const board = JSON.parse(localStorage.getItem(key) || '{}'); return JSON.stringify([(board.blocks || []).map(b => [b.id, b.dx, b.dy, b.w, b.h, b.cardLayout || null]), (board.items || []).map(i => [i.id, i.x, i.y, i.w, i.h])]); }, INK);
// Board saves settle after the seeded board's first sync; then entering or leaving Focus may add none.
const settle = async () => { let last = -1, still = 0; while (still < 30) { if (saves.length === last) still++; else { last = saves.length; still = 0; } await page.waitForTimeout(100); } };
const quiet = async (label, before) => { await page.waitForTimeout(2000); assert.deepEqual([model.length, saves.length], before, `${label}: model ${model.join()} saves ${saves.slice(before[1]).join()}`); };
const counts = () => [model.length, saves.length];
const focused = id => page.evaluate(sel => document.querySelector(sel)?.hasAttribute('data-focus-host') ?? null, card(id));
// Canvas objects are pressed with the mouse at a point that hits them (never locator.click, whose scroll-into-view slides the
// clipped canvas surface). An object off screen is first brought into view by reveal() below.
const visiblePart = selector => page.evaluate(sel => {
  const r = document.querySelector(sel)?.getBoundingClientRect(), f = document.querySelector('[data-canvas-surface]')?.getBoundingClientRect();
  if (!r || !f) return null;
  const left = Math.max(r.left, f.left), right = Math.min(r.right, f.right), top = Math.max(r.top, f.top), bottom = Math.min(r.bottom, f.bottom);
  return right - left > 8 && bottom - top > 8 ? { left, right, top, bottom } : null;
}, selector);
// An object off screen is brought to the middle of the canvas by the wheel over an empty point of it (a plain wheel pans the
// board at the learner's zoom). Not View > Fit canvas: this board's long note fits only at about 27 %, where a 24 px strip is
// under the 8 px visiblePart needs (CI a000ac08 steps 3 to 7).
const reveal = async selector => {
  for (let i = 0; i < 5 && !(await visiblePart(selector)); i++) {
    const move = await page.evaluate(sel => {
      const r = document.querySelector(sel)?.getBoundingClientRect(), f = document.querySelector('[data-canvas-surface]')?.getBoundingClientRect();
      if (!r || !f) return null;
      for (let gy = 2; gy < 18; gy++) for (let gx = 2; gx < 18; gx++) {
        const x = f.left + f.width * gx / 20, y = f.top + f.height * gy / 20, hit = document.elementFromPoint(x, y);
        if (hit?.closest('[data-canvas-surface]') && !hit.closest('[data-block-id],[data-item-id],[data-scroll],[data-canvas-bottom] *,button,a,input,textarea,[role="toolbar"],[role="menu"],[data-zoom],[data-canvas-minimap]'))
          return { x, y, dx: Math.round(r.left + r.width / 2 - (f.left + f.width / 2)), dy: Math.round(r.top + Math.min(r.height, 24) / 2 - (f.top + f.height / 2)) };
      }
      return null;
    }, selector);
    assert.ok(move, `${selector}: no empty point of the canvas to pan from`);
    await page.mouse.move(move.x, move.y);
    await page.mouse.wheel(move.dx, move.dy);
    await page.waitForTimeout(200);
  }
};
// Selects a card by its drag strip (the 24 px grip at its top) and a note by its middle, the presses a learner makes.
const select = async id => {
  const target = NOTES.has(id) ? card(id) : `${card(id)} [data-drag-handle]`;
  let at = await visiblePart(target);
  if (!at) { await reveal(target); at = await visiblePart(target); }
  assert.ok(at, `${id} is on screen`);
  await page.mouse.click((at.left + at.right) / 2, (at.top + at.bottom) / 2);
  if (!NOTES.has(id)) await until(async () => (await page.getAttribute(card(id), 'aria-current')) === 'true', `${id} is selected`);
};
const focusButton = name => page.getByRole('button', { name, exact: true });
// A control on or over the canvas is pressed with the mouse at its centre, after checking that the centre hits it (never
// locator.click, whose scroll-into-view would slide the clipped surface under the camera).
const tap = async (locator, what) => {
  await locator.waitFor({ timeout: 5000 });
  const at = await locator.boundingBox();
  assert.ok(at, `${what} has a box`);
  const [x, y] = [at.x + at.width / 2, at.y + at.height / 2];
  const hit = await locator.evaluate((node, [px, py]) => { const top = document.elementFromPoint(px, py); return !!top && (node === top || node.contains(top)) ? null : (top ? `${top.tagName} ${[...top.attributes].map(a => a.name).filter(n => n.startsWith('data-')).join(' ')}` : 'nothing'); }, [x, y]);
  assert.equal(hit, null, `${what} is covered at (${Math.round(x)}, ${Math.round(y)}) by ${hit}`);
  await page.mouse.click(x, y);
};
const back = async () => {}; // these checks never enter Focus
const savedBlock = id => page.evaluate(([key, blockId]) => (JSON.parse(localStorage.getItem(key) || '{}').blocks || []).find(b => b.id === blockId) || null, [INK, id]);
const width = id => page.evaluate(sel => document.querySelector(sel)?.offsetWidth ?? null, card(id)); // layout width: unaffected by the canvas zoom
const minimize = async id => { await select(id); await tap(page.locator('[data-minimize-button]'), 'Minimize'); await until(async () => (await page.locator(`${card(id)} [data-explanation-tile]`).count()) === 1, `${id} is a tile`); };
const expand = async id => { await tap(page.locator(`${card(id)} [data-explanation-open]`), 'Expand'); await until(async () => (await page.locator(`${card(id)} [data-explanation-tile]`).count()) === 0 && (await page.locator(`${card(id)} [data-explanation]`).count()) === 1, `${id} is the full card`); };
const near = (actual, expected, tol, what) => assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `${what}: ${actual} is not within ${tol} of ${expected}`);
// Every scrolling box inside a card: does any hold more than it shows?
const hScroll = id => page.evaluate(sel => [...document.querySelectorAll(`${sel} *`)].filter(n => /(auto|scroll)/.test(getComputedStyle(n).overflowX) && n.scrollWidth > n.clientWidth + 1).length, card(id));
const overlaps = () => page.evaluate(() => { const r = [...document.querySelectorAll('[data-block-id]')].map(n => [n.getAttribute('data-block-id'), n.getBoundingClientRect()]); const out = []; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const [a, A] = r[i], [b, B] = r[j]; if (A.left < B.right - 1 && B.left < A.right - 1 && A.top < B.bottom - 1 && B.top < A.bottom - 1) out.push(`${a}/${b}`); } return out; });

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator(card(FIRST)).waitFor({ timeout: 60000 });
await settle();


await check('1 The Minimize pill is outside the long group, the same 34 px height and pill radius; ChevronsDownUp; no Focus icon on an Explanation', async () => {
  await select('ex');
  await page.locator('[data-selection-group] [data-minimize-button]').waitFor({ timeout: 5000 });
  const shape = await page.evaluate(() => { const g = document.querySelector('[data-selection-group]'), pill = g.querySelector('[data-minimize-button]'), bar = g.querySelector('[data-selection-bar]'), s = n => { const c = getComputedStyle(n); return { h: Math.round(n.getBoundingClientRect().height), r: parseFloat(c.borderTopLeftRadius) }; };
    return { pill: s(pill), bar: s(bar), inside: bar.contains(pill), icon: pill.querySelector('svg')?.getAttribute('class') || '', label: pill.getAttribute('aria-label') }; });
  assert.equal(shape.inside, false, 'the Minimize pill is not inside the long bar');
  assert.equal(shape.label, 'Minimize');
  assert.match(shape.icon, /chevrons-down-up/, `icon ${shape.icon}`);
  assert.ok(Math.abs(shape.pill.h - shape.bar.h) <= 1 && shape.pill.h >= 33, `heights ${JSON.stringify(shape)}`);
  assert.ok(shape.pill.r >= shape.pill.h / 2 - 1 && shape.bar.r >= shape.bar.h / 2 - 1, `both are pills ${JSON.stringify(shape)}`);
  assert.equal(await page.locator('[data-selection-bar]').getByRole('button', { name: /^Focus / }).count(), 0, 'no Focus icon on an Explanation');
  await shot('toolbar-explanation');
});
await check('2 A non-Explanation card (a table) has no Minimize, keeps Focus table, and its bar is the same pill; the Enter pill (when it shows) is a pill too', async () => {
  await select('tb');
  await focusButton('Focus table').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('[data-minimize-button]').count(), 0, 'a table is not minimized');
  const radius = await page.evaluate(() => { const bar = document.querySelector('[data-selection-bar]'), open = document.querySelector('[data-card-open]'), r = n => (n ? parseFloat(getComputedStyle(n).borderTopLeftRadius) : null); return { bar: r(bar), barH: bar.getBoundingClientRect().height, open: r(open) }; });
  assert.ok(radius.bar >= radius.barH / 2 - 1, `the bar is a pill ${JSON.stringify(radius)}`);
  if (radius.open !== null) assert.ok(radius.open >= 12, `the Enter pill is a pill ${JSON.stringify(radius)}`);
  await shot('toolbar-table');
});
await check('3 An old card with no summary: Minimize shows its first whole sentences, then the stubbed summary replaces them (one call, no ellipsis)', async () => {
  const before = await width('ex');
  near(before, 440, 2, 'a prose-only card is 440 px');
  await minimize('ex');
  const first = (await page.locator(`${card('ex')} [data-tile-summary]`).innerText()).trim();
  assert.ok(first.startsWith('Tides rise because the Moon pulls the near ocean'), `the first sentences: ${first}`);
  assert.ok(first.length <= 160 && /[.!?]$/.test(first) && !/(\.{2,}|\u2026)$/.test(first), `whole sentences, no ellipsis: ${first}`);
  await until(async () => (await page.locator(`${card('ex')} [data-tile-summary]`).innerText()).trim() === STUB_SUMMARY, 'the summary replaces the first sentences', 8000);
  assert.equal(summaryCalls.length, 1, `one summary call: ${summaryCalls.join()}`);
  near(await width('ex'), 408, 2, 'a card with no visual is a 408 px tile');
  await shot('tile-old-card');
});
await check('4 The tile and its summary survive a reload with no second summary call', async () => {
  await settle();
  await page.reload();
  await page.locator(`${card('ex')} [data-explanation-tile]`).waitFor({ timeout: 60000 });
  assert.equal((await page.locator(`${card('ex')} [data-tile-summary]`).innerText()).trim(), STUB_SUMMARY);
  assert.equal((await savedBlock('ex')).minimized, true, 'minimized is saved with the card');
  await page.waitForTimeout(1500);
  assert.equal(summaryCalls.length, 1, 'no second call after the reload');
});
await check('5 The Expand button (aria-label "Expand card") restores the full card at its own width, saved', async () => {
  const button = page.locator(`${card('ex')} [data-explanation-open]`);
  assert.equal(await button.getAttribute('aria-label'), 'Expand card');
  assert.match((await button.innerText()).trim(), /^Expand$/);
  await expand('ex');
  near(await width('ex'), 440, 2, 'the full card is back at 440 px');
  assert.notEqual((await savedBlock('ex')).minimized, true, 'minimized is cleared in the saved card');
  await shot('card-expanded');
});
await check('6 Enter and Space on the focused tile expand it', async () => {
  for (const key of ['Enter', ' ']) {
    await minimize('ex');
    await page.locator(card('ex')).focus();
    await page.keyboard.press(key);
    await until(async () => (await page.locator(`${card('ex')} [data-explanation-tile]`).count()) === 0, `${JSON.stringify(key)} expands the tile`);
  }
  assert.equal(summaryCalls.length, 1, 'the card already has its summary: no more calls');
});
await check('7 A picture card is a 546 px tile with the picture at 512 and no summary call (it has a good one); Expand restores 546', async () => {
  near(await width('pc'), 546, 2, 'a picture card is 546 px');
  await minimize('pc');
  near(await width('pc'), 546, 2, 'the picture tile is the picture card\'s width');
  const picture = await page.evaluate(sel => { const img = document.querySelector(`${sel} [data-tile-visual="picture"] img`); return img ? [img.offsetWidth, img.offsetHeight] : null; }, card('pc'));
  assert.ok(picture, 'the tile shows the picture');
  near(picture[0], 512, 2, 'the picture is 512 px wide');
  near(picture[1], 512, 2, 'the picture is square');
  assert.equal(summaryCalls.length, 1, `no summary call for a card that has one: ${summaryCalls.join()}`);
  await shot('tile-picture');
  await expand('pc');
  near(await width('pc'), 546, 2, 'Expand restores the picture card at 546');
});
await check('8 Neighbours do not overlap after minimize and Expand, and no model route was called', async () => {
  await minimize('ex');
  assert.deepEqual(await overlaps(), [], 'no two cards overlap while a tile is minimized');
  await expand('ex');
  assert.deepEqual(await overlaps(), [], 'no two cards overlap after Expand');
  assert.equal(model.length, 0, `model routes: ${model.join()}`);
});

assert.equal(model.length, 0, `no model route was called: ${model.join()}`);
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
await browser.close();
console.log(`${results.length}/${total} checks passed`);
if (failures.length || results.length !== total) { console.log(`FAIL ${failures.join('; ')}`); process.exit(1); }
