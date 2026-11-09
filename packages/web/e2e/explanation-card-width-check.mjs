// Release 117 card width (owner 2026-11-08 "quality over size"), against the LOCAL keyless stack only: an Explanation card is 440 px wide unless a visual asks for more: a prose-only card 440; a picture card
// 546 with the picture at 512 x 512; a card whose widest diagram is 707 px natural is 741 px with no horizontal scroll; a picture plus that diagram is 741 with the picture at 512 centred; a 1121 px diagram is
// capped at 960 (card 994) and scrolls inside; minimized, each card is a tile of the same rule (prose-only 408, picture 546, matrix 741 with the diagram unscaled), Expand restores each card at its own width, and
// no two cards overlap at any stage. Widths are layout widths (offsetWidth), unaffected by the canvas zoom. No model is called (the summary route is stubbed and counted); Claude does not run browser checks:
// CI runs this one. Prints `ok <label>` per step, then `N/total checks passed`; exits 1 on a failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/explanation-card-width-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { references as dataRefs } from '../src/tutor-diagrams/ml-data-references.js';

const total = 7; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('explanation-card-width runs against the local stack only');
const SHOTS = process.argv[2] || (process.env.PERSIST ? `${process.env.PERSIST}/../../explanation-card-width-shots` : 'explanation-card-width-shots');
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `explanation-card-width-${run}@example.com`, secret }) })).json();
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
  { id: 'pr', type: 'explanation', dx: 0, dy: 0, title: 'Prose only', body: PROSE },
  { id: 'pi', type: 'explanation', dx: 0, dy: 0, title: 'A picture card', body: 'A short paragraph about the picture.', illustration: { src: PICTURE, alt: 'A white circle on blue', caption: 'A test picture.' } },
  { id: 'mx', type: 'explanation', dx: 0, dy: 0, title: 'A dense matrix', body: `A paragraph before the matrix.\n\n${fence(WIDE)}\n\nA paragraph after the matrix.` },
  { id: 'pm', type: 'explanation', dx: 0, dy: 0, title: 'Picture and matrix', body: 'A paragraph about both.', illustration: { src: PICTURE, alt: 'A white circle on blue', caption: 'A test picture.' }, more: [] },
  { id: 'wd', type: 'explanation', dx: 0, dy: 0, title: 'Wider than the cap', body: `A paragraph before the wide matrix.\n\n${fence(WIDER)}\n\nA paragraph after it.` },
];
BLOCKS[3].body = `A paragraph about both.\n\n${fence(WIDE)}\n\nAnd after.`;
const FIRST = 'pr';
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `explanation-card-width ${run}` }) });
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


await check('1 Card widths: prose-only 440, picture card 546, 707 px matrix 741, picture + matrix 741, a 1121 px matrix capped at 994 (960 of room)', async () => {
  for (const [id, expected] of [['pr', 440], ['pi', 546], ['mx', 741], ['pm', 741], ['wd', 994]]) near(await width(id), expected, 2, `${id}`);
  await shot('widths');
});
await check('2 A picture is 512 x 512 and centred in its card (alone, and beside the matrix)', async () => {
  for (const id of ['pi', 'pm']) {
    const p = await page.evaluate(sel => { const c = document.querySelector(sel), img = c.querySelector('img'); if (!img) return null; const a = c.getBoundingClientRect(), b = img.getBoundingClientRect(); return { w: img.offsetWidth, h: img.offsetHeight, off: Math.abs((b.left + b.right) / 2 - (a.left + a.right) / 2) / (a.width / c.offsetWidth) }; }, card(id));
    assert.ok(p, `${id} shows its picture`);
    near(p.w, 512, 2, `${id} picture width`);
    near(p.h, 512, 2, `${id} picture height`);
    assert.ok(p.off <= 3, `${id} picture centred (off by ${p.off})`);
  }
});
await check('3 No horizontal scroll inside the prose, picture or 707 px matrix cards; the 1121 px diagram scrolls inside its capped card', async () => {
  for (const id of ['pr', 'pi', 'mx', 'pm']) assert.equal(await hScroll(id), 0, `${id} has no horizontal scroll`);
  assert.ok((await hScroll('wd')) >= 1, 'the wider-than-cap diagram scrolls inside the card');
});
await check('4 No two cards overlap with the widened cards on the canvas', async () => {
  assert.deepEqual(await overlaps(), []);
});
await check('5 Minimized, each card is a tile of the same rule: prose-only 408, picture 546, matrix 741 with the diagram unscaled', async () => {
  const widths = {};
  for (const id of ['pr', 'pi', 'mx']) { await minimize(id); widths[id] = await width(id); }
  near(widths.pr, 408, 2, 'prose-only tile');
  near(widths.pi, 546, 2, 'picture tile');
  near(widths.mx, 741, 2, 'matrix tile');
  const drawn = await page.evaluate(sel => { const s = document.querySelector(`${sel} [data-tile-visual="diagram"] svg`); return s ? parseFloat(getComputedStyle(s).width) : null; }, card('mx'));
  near(drawn, 707, 2, 'the matrix is drawn at its natural width in the tile (not scaled down)');
  assert.equal(await hScroll('mx'), 0, 'no horizontal scroll in the matrix tile');
  await shot('tiles');
});
await check('6 Neighbours do not overlap while tiles are minimized', async () => {
  assert.deepEqual(await overlaps(), []);
});
await check('7 Expand restores each card at its own width, and nothing overlaps afterwards', async () => {
  for (const [id, expected] of [['pr', 440], ['pi', 546], ['mx', 741]]) { await expand(id); near(await width(id), expected, 2, `${id} after Expand`); }
  assert.deepEqual(await overlaps(), []);
  assert.equal(model.length, 0, `model routes: ${model.join()}`);
});

assert.equal(model.length, 0, `no model route was called: ${model.join()}`);
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
await browser.close();
console.log(`${results.length}/${total} checks passed`);
if (failures.length || results.length !== total) { console.log(`FAIL ${failures.join('; ')}`); process.exit(1); }
