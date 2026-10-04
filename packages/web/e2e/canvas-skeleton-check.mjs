// Reserved-position skeleton cards (docs/features/canvas-skeleton-cards.md) in the browser, against the LOCAL stack
// only. No model is called: /api/learn/artifact and the Tutor routes are fulfilled here after a delay, and the Learn
// chat stream is served by a scripted SSE server in this process (run the app worker without model keys too).
//   build:         VITE_COACHING_DEV=true VITE_BYOC_DEV=true VITE_TLDRAW_LICENSE_KEY=… npx vite build --outDir dist-dev
//   app:           npx wrangler dev -c <app config> -c <control-plane config> --local --persist-to <dir> --port 8848
//   control plane: npx wrangler dev -c <control-plane config> --local --persist-to <dir> --port 8849
// Usage: BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/canvas-skeleton-check.mjs [shotsDir]
// It proves, with screenshots mid-wait and after:
//   A. /explain: the skeleton is there at once at the explanation's typical height, the camera glides it to the centre
//      of the visible canvas without touching the zoom, and the card replaces it in place.
//   B. Layout: the cards below make room for the skeleton, and close up (or not) to the card's measured height.
//   C. A clarification and a failure leave no skeleton.
//   P. A paid command (/animate) shows its proposal and no skeleton; Cancel shows none; Generate shows one, and the
//      confirmed card takes its slot.
//   D. Sharing and forks: a push made while a skeleton waits, and a fork of that board, carry no skeleton.
//   E. Research: no skeleton while searching; one at the committed "Opening…", filled by the paper; a suppressed
//      article's goes when the answer ends; a paper already on the canvas takes the slot's place.
//   F. The Tutor: "show me this visually" holds the place before the plan and the card fills it, selected, at the
//      learner's zoom, inside the part of the canvas the open chat leaves visible;
//      a question gets none; text only, Stop, a failure and a timeout leave none; a card already there is focused.
//   G. A pending Rabbit Hole is not kept by a skeleton - only by the card - and the card opens at the asked part.
//   The chat status reads "Preparing answer…": one ellipsis character, never "......".
import { chromium } from '@playwright/test';
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { BOARDS } from '../src/demo-scenes.js';
import { cardModule, TUTOR_BOARD } from '../src/learn-tutor-claims.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('canvas-skeleton-check runs against the local stack only');
const OUT = process.argv[2] || 'canvas-skeleton-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const owner = await sessionFor(`skeleton-${run}@example.com`), forker = await sessionFor(`skeleton-fork-${run}@example.org`);
const call = (session, path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } }).then(r => r.json());
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push([name, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };

// ---- the scripted Learn chat stream: [delay ms, event, data] per answer ----
let askScript = [];
const sse = http.createServer(async (req, res) => {
  req.resume();
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
  for (const [ms, event, data] of askScript) { await sleep(ms); res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
  res.end();
});
await new Promise(resolve => sse.listen(0, '127.0.0.1', resolve));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: owner, url: BASE }]);
const page = await context.newPage();
const errors = [], refused = [], dives = [], pushes = [];
page.on('pageerror', error => errors.push(error.message));
// Every model route is scripted; anything else that would reach a model is refused and counted.
let artifactNext = null, planNext = null;
const plans = [];
await page.route('**/api/learn/artifact', async route => { const reply = await artifactNext(route.request().postDataJSON()); await route.fulfill(reply).catch(() => {}); });
await page.route('**/api/learn/tutor/evaluate', route => route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } }));
await page.route('**/api/learn/tutor/plan', async route => { const { context: sent } = route.request().postDataJSON(); plans.push(sent); const reply = await planNext(sent); await route.fulfill(reply).catch(() => {}); });
await page.route('**/api/learn/ask', route => route.continue({ url: `http://127.0.0.1:${sse.address().port}/ask` }));
await page.route(/\/api\/learn\/(assess|voice|selection|board|home-ask)/, route => { if (route.request().method() === 'GET') return route.continue(); refused.push(route.request().url()); return route.abort(); });
await page.route('**/api/learn/paper**', route => route.fulfill({ status: 404, json: { error: 'not in this check' } }));
// A confirmed paid card starts its own job: refused here and counted, so nothing paid ever runs.
const paidStarts = [];
await page.route(/\/api\/learn\/(video|scene)\?/, route => { if (route.request().method() === 'GET') return route.continue(); paidStarts.push(route.request().url()); return route.fulfill({ status: 503, json: { error: 'not in this check' } }); });
await page.route('**/api/canvases/dives', route => { if (route.request().method() === 'POST') dives.push(route.request().postDataJSON()); return route.continue(); });
await page.route(/\/api\/learn\/boards\/[^/]+\/[^/]+$/, route => { if (route.request().method() === 'PUT') pushes.push(route.request().postData()); return route.continue(); });

const shot = async name => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const composer = () => page.locator('[data-learn-dock] textarea, [data-learn-dock] input:not([type="file"])').first();
const send = async text => { await composer().click(); await composer().fill(text); await page.waitForTimeout(120); await composer().press('Enter'); };
const open = async path => { await page.goto(`${BASE}${path}`); await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 }); await page.waitForTimeout(2000); };
const slots = () => page.locator('[data-slot-id]');
const waitFor = async (test, what, ms = 15000) => { for (let at = Date.now(); Date.now() - at < ms; await page.waitForTimeout(50)) if (await test()) return; assert.fail(`timed out: ${what}`); };
const noSlot = () => waitFor(async () => (await slots().count()) === 0, 'the skeleton goes');
// The column, laid out (offsetTop/offsetHeight, unaffected by the camera): ids, kinds and positions in render order.
const column = () => page.evaluate(() => {
  const any = document.querySelector('[data-slot-id]') || document.querySelector('[data-block-id]:not([data-chat-block])');
  return [...any.parentElement.children].map(node => ({ id: node.dataset.slotId || node.dataset.blockId, slot: !!node.dataset.slotId, top: node.offsetTop, h: node.offsetHeight, w: node.offsetWidth }));
});
const camera = () => page.evaluate(() => [...document.querySelector('[data-canvas-surface]').children].find(node => node.style.transform)?.style.transform);
const surface = () => page.locator('[data-canvas-surface]').boundingBox();
const visible = async locator => { const [box, frame] = [await locator.boundingBox(), await surface()]; return !!box && box.y >= frame.y - 1 && box.y < frame.y + frame.height - 120 && box.x >= frame.x - 1 && box.x + box.width <= frame.x + frame.width + 1; };
const zoom = async () => Number((await camera()).match(/scale\(([\d.]+)\)/)[1]);
// What the learner can see of the canvas: the surface less the open chat sheet above the composer, 24 px in.
const freeArea = () => page.evaluate(() => {
  const frame = document.querySelector('[data-canvas-surface]').getBoundingClientRect(), sheet = document.querySelector('[data-chat-sheet]')?.getBoundingClientRect();
  const bottom = sheet && sheet.height && sheet.top < frame.bottom ? Math.min(frame.bottom, sheet.top) : frame.bottom;
  return { left: frame.left + 24, top: frame.top + 24, right: frame.right - 24, bottom: bottom - 24, sheet: sheet && sheet.height ? { top: sheet.top, left: sheet.left, right: sheet.right, bottom: sheet.bottom } : null };
});
const inFree = async locator => { const [box, area] = [await locator.boundingBox(), await freeArea()]; return box.x >= area.left - 2 && box.y >= area.top - 2 && box.x + box.width <= area.right + 2 && box.y + box.height <= area.bottom + 2; };
// Centred where the camera had to move (here, up or down); an axis already in view is left alone.
const centred = async locator => { const [box, area] = [await locator.boundingBox(), await freeArea()]; return Math.abs(box.y + box.height / 2 - (area.top + area.bottom) / 2) < 3 && box.x >= area.left - 2 && box.x + box.width <= area.right + 2; };
const selected = id => page.locator(`[data-block-id="${id}"]`).evaluate(node => node.className.includes('ring-2'));
const stored = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('small.adaptive-canvas')).map(([, value]) => value).join('\n'));
const later = (ms, reply) => sleep(ms).then(() => reply);
// A slot id as the canvas mints it (a card's own text may say "slot:", e.g. a source note on position rows).
const SLOT_ID = /slot:[0-9a-f]{8}-[0-9a-f]{4}-/;
const say = text => ({ type: 'respond_text', text });

// =====================  A-E: a Learn canvas (the NanoGPT deep-dive board), shared  =====================
const BOARD = 'nanogpt-deep-dive';
const canvas = await call(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'Skeleton check' }) });
const empty = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [] };
const shared = await call(owner, `/api/learn/boards/${canvas.name}/${BOARD}/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, state: { ...empty, blocks: BOARDS[BOARD]() } }) });
check('the board is shared before the skeletons appear', !!shared.sharing?.view, JSON.stringify(shared).slice(0, 120));
await open(`/apps/${canvas.name}?board=${BOARD}`);

// ---- A. /explain at the end of the column, with the view parked below everything: the camera has to move ----
const box = await surface();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 1200);
await page.locator('[data-zoom] [title="Zoom out"]').click(); // the learner's own zoom, 80%: nothing below may change it
await page.waitForTimeout(600);
const parked = await camera(), parkedZoom = await zoom();
const EXPLAIN = { type: 'explanation', title: 'A token id is only an index', body: 'The embedding table turns the index into a learned vector; everything after works with vectors.' };
let releaseArtifact;
artifactNext = () => new Promise(resolve => { releaseArtifact = () => resolve({ json: { result: 'artifact', primitive: 'explanation', block: EXPLAIN } }); });
const sentAt = Date.now();
await send('/explain why a token id is only an index');
await slots().first().waitFor({ timeout: 2000 });
const shownIn = Date.now() - sentAt;
check('A1 the skeleton appears on send, before any answer', shownIn < 1500, `${shownIn} ms`);
await page.waitForTimeout(400); // the 200 ms glide
const slotA = slots().first();
check('A2 it says what is being made, with the time waited', /Creating \/explain…/.test(await slotA.getAttribute('aria-label')) && /^\d+\.\ds$/.test(await slotA.locator('[data-slot-elapsed]').innerText()));
const atReserve = await column(), reservedA = atReserve.find(entry => entry.slot);
check('A3 sized as a typical explanation card (440 x 330), not its 520 cap', reservedA.w === 440 && reservedA.h === 330, `${reservedA.w}x${reservedA.h}`);
check('A4 it holds the slot the card would take: the end of the column', atReserve.at(-1).slot);
check('A5 the camera panned it to the centre of the visible canvas, zoom kept', (await camera()) !== parked && await centred(slotA) && await zoom() === parkedZoom, `${parked} -> ${await camera()}`);
check('A6 nothing about it is saved', !SLOT_ID.test(await stored()));
await page.waitForTimeout(1200);
await shot('01-explain-skeleton-mid-wait');
const cameraBefore = await camera();
releaseArtifact();
await noSlot();
const afterA = await column();
const cardA = afterA.at(-1);
check('A7 the card replaced it in place: same index, same top', !cardA.slot && cardA.top === reservedA.top && afterA.length === atReserve.length, `${cardA.top} vs ${reservedA.top}`);
check('A8 the card is the explanation', (await page.locator(`[data-block-id="${cardA.id}"]`).innerText()).includes(EXPLAIN.title));
await page.waitForTimeout(500);
check('A9 no second fit: same zoom, the card in the visible canvas', await zoom() === parkedZoom && await inFree(page.locator(`[data-block-id="${cardA.id}"]`)), `${cameraBefore} -> ${await camera()}`);
await shot('02-explain-replaced');

// ---- B. Layout in the middle of the column: the cards below make room, then close up to the measured card ----
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('Shift+Digit0'); await page.waitForTimeout(800);
// Wheel over empty canvas beside the column (a card's own scrolling body keeps the wheel).
await page.mouse.move(box.x + 250, box.y + box.height / 2);
for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 700);
await page.waitForTimeout(600);
for (const [command, block, fixed] of [
  ['/explain the embedding table', EXPLAIN, false],
  ['/diagram where a token goes', { type: 'flow', title: 'Where a token goes', spec: { direction: 'DOWN', nodes: [{ id: 'ids', label: 'token ids', tone: 'input' }, { id: 'wte', label: 'token embeddings', tone: 'step' }, { id: 'logits', label: 'logits', tone: 'output' }], edges: [{ source: 'ids', target: 'wte' }, { source: 'wte', target: 'logits' }] } }, true],
]) {
  const before = await column();
  let release;
  artifactNext = () => new Promise(resolve => { release = () => resolve({ json: { result: 'artifact', primitive: block.type === 'flow' ? 'flow_diagram' : block.type, block } }); });
  await send(command);
  await slots().first().waitFor({ timeout: 2000 });
  await page.waitForTimeout(400);
  const reserved = await column(), at = reserved.findIndex(entry => entry.slot), slot = reserved[at], below = reserved[at + 1];
  const was = before.find(entry => entry.id === below?.id);
  check(`B1 ${command}: the skeleton sits between cards`, at > 0 && !!below, `index ${at} of ${reserved.length}`);
  check(`B2 ${command}: the card below moved down by exactly the skeleton and one gap`, below.top - was.top === slot.h + 20 && below.top === slot.top + slot.h + 20, `${was.top} -> ${below.top}, skeleton ${slot.h}`);
  if (fixed) await shot('03-diagram-skeleton-between-cards');
  release();
  await noSlot();
  await page.waitForTimeout(800);
  const placed = await column(), card = placed[at], next = placed[at + 1];
  check(`B3 ${command}: the card took the skeleton's index and top`, !card.slot && card.top === slot.top && next.id === below.id, `${card.top} vs ${slot.top}`);
  check(`B4 ${command}: the card below follows the card's measured height`, next.top === card.top + card.h + 20 && (fixed ? card.h === slot.h : card.h < slot.h), `card ${card.h} vs skeleton ${slot.h}, below ${next.top}`);
  if (fixed) await shot('04-diagram-replaced');
}

// ---- C. A clarification and a failure end the wait with no skeleton left ----
artifactNext = () => later(900, { json: { result: 'clarification', question: 'Compare which two functions?' } });
await send('/compare them');
await slots().first().waitFor({ timeout: 2000 });
await noSlot();
check('C1 a clarification removes the skeleton and asks', await page.locator('[data-slash-result]').innerText().then(text => text.includes('Compare which two functions?')));
const blocksBefore = (await column()).length;
artifactNext = () => later(900, { status: 502, json: { error: 'Artifact generation unavailable (model HTTP 529). Try again.' } });
await send('/quiz embeddings');
await slots().first().waitFor({ timeout: 2000 });
await noSlot();
check('C2 a failure removes the skeleton; the error stays in the composer', (await page.locator('[data-slash-result]').innerText()).includes('unavailable') && (await column()).length === blocksBefore);
await shot('05-failure-no-ghost');

// ---- P. A paid command: the proposal only; Cancel never shows a skeleton; Generate does, and the card takes it ----
// Every skeleton that ever enters the DOM is recorded: one painted for a single frame still counts.
await page.evaluate(() => {
  window.__slotsSeen = [];
  new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node.dataset?.slotId) window.__slotsSeen.push({ label: node.getAttribute('aria-label'), top: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight }); })
    .observe(document.querySelector('[data-canvas-surface]'), { childList: true, subtree: true });
});
const slotsSeen = () => page.evaluate(() => window.__slotsSeen.length);
const PAID = { type: 'video', mode: 'generate', title: 'Why the sigmoid saturates', src: '', caption: 'An illustration, not measured footage.', operation: { steps: [] }, status: 'idle' };
artifactNext = () => later(900, { json: { result: 'paid_proposal', primitive: 'maths_animation', block: PAID, message: 'This uses paid generation.' } });
const paidBlocks = (await column()).length;
await send('/animate why the sigmoid saturates');
await page.locator('[data-paid-generate]').waitFor({ timeout: 5000 });
check('P1 a paid command shows its proposal and no skeleton', (await slotsSeen()) === 0 && (await slots().count()) === 0);
await shot('05b-paid-proposal-no-skeleton');
await page.locator('[data-paid-cancel]').click();
await page.waitForTimeout(800);
check('P2 Cancel never shows a skeleton or a card', (await slotsSeen()) === 0 && (await column()).length === paidBlocks && paidStarts.length === 0);
await send('/animate why the sigmoid saturates');
await page.locator('[data-paid-generate]').waitFor({ timeout: 5000 });
check('P3 the proposal again: still no skeleton', (await slotsSeen()) === 0);
await page.locator('[data-paid-generate]').click();
await waitFor(async () => (await column()).length === paidBlocks + 1, 'the confirmed card');
await page.waitForTimeout(600);
const [paidSlot] = await page.evaluate(() => window.__slotsSeen);
const paidCard = (await column()).find(entry => entry.top === paidSlot?.top);
check('P4 Generate shows a skeleton, and the confirmed card takes its slot', (await slotsSeen()) === 1 && /Creating \/animate…/.test(paidSlot.label) && !!paidCard && !paidCard.slot && (await page.locator(`[data-block-id="${paidCard.id}"]`).innerText()).includes(PAID.title), JSON.stringify(paidSlot));
await shot('05c-paid-confirmed-card-in-slot');

// ---- D. Sharing: a push made while a skeleton waits carries none, and neither does a fork of the board ----
await page.waitForTimeout(2500);
pushes.length = 0;
let releaseD;
artifactNext = () => new Promise(resolve => { releaseD = () => resolve({ json: { result: 'artifact', primitive: 'explanation', block: { ...EXPLAIN, title: 'Shared while waiting' } } }); });
await send('/explain shared boards');
await slots().first().waitFor({ timeout: 2000 });
await page.locator('[role="menubar"] button', { hasText: 'Insert' }).click();
await page.getByText('Divider line', { exact: true }).click();
await waitFor(async () => pushes.length > 0, 'a push while the skeleton waits', 8000);
check('D1 the board pushed while the skeleton waited, without it', pushes.length > 0 && pushes.every(body => !SLOT_ID.test(body)) && (await slots().count()) === 1);
releaseD();
await noSlot();
await waitFor(async () => pushes.some(body => body.includes('Shared while waiting')), 'the push with the card', 8000);
check('D2 the push after it has the card and no skeleton', pushes.every(body => !SLOT_ID.test(body)));
// The fork copies what the server holds: wait until the push with the card has landed.
await waitFor(async () => JSON.stringify(await call(owner, `/api/learn/boards/${canvas.name}/${BOARD}`)).includes('Shared while waiting'), 'the pushed card on the server', 10000);
const fork = await call(forker, `/api/learn/boards/shared/${shared.sharing.view}/fork`, { method: 'POST', body: '{}' });
const forked = fork.name ? await call(forker, `/api/learn/boards/${fork.name}/main`) : null;
check('D3 a fork of the board copies the card and never a skeleton', !!forked && JSON.stringify(forked.state).includes('Shared while waiting') && !SLOT_ID.test(JSON.stringify(forked)), fork.name || JSON.stringify(fork).slice(0, 160));

// ---- E. Research: speculative steps reserve nothing; the committed "Opening…" does ----
const PAPER = { id: '1706.03762', page: 1, title: 'Attention Is All You Need', pdfUrl: 'https://arxiv.org/pdf/1706.03762' };
const ask = async (text, script) => { askScript = script; await send(text); };
await ask('Which paper introduced attention?', [[0, 'progress', { stage: 'Finding papers...' }], [1200, 'progress', { stage: `Opening ${PAPER.title}...`, card: 'paper' }], [2200, 'chunk', { text: 'The Transformer paper.' }], [0, 'paper', PAPER], [0, 'done', { ok: true }]]);
await page.waitForTimeout(700);
check('E1 no skeleton while it is only searching', (await slots().count()) === 0);
const status = await page.locator('[data-chat-sheet] .shimmer').last().innerText();
check('E1b the chat status ends in one ellipsis character', status === 'Finding papers…', JSON.stringify(status));
await slots().first().waitFor({ timeout: 3000 });
await page.waitForTimeout(400);
const researchSlot = (await column()).find(entry => entry.slot);
check('E2 "Opening…" reserves the paper card\'s place, at its size', /Opening the paper…/.test(await slots().first().getAttribute('aria-label')) && researchSlot.w === 620 && researchSlot.h === 560, `${researchSlot.w}x${researchSlot.h}`);
await shot('06-research-skeleton-mid-wait');
await noSlot();
await page.waitForTimeout(500);
const paperCard = (await column()).find(entry => entry.top === researchSlot.top);
check('E3 the paper card replaced it in place', !!paperCard && !paperCard.slot && (await page.locator(`[data-block-id="${paperCard.id}"]`).innerText()).includes(PAPER.id));
await shot('07-research-replaced');
await ask('And the Wikipedia article?', [[0, 'progress', { stage: 'show wikipedia...', card: 'wiki' }], [1200, 'chunk', { text: 'See the paper instead.' }], [0, 'done', { ok: true }]]);
await slots().first().waitFor({ timeout: 3000 });
await noSlot();
check('E4 an article the answer never opens leaves no skeleton', (await column()).every(entry => !entry.slot));
const count = (await column()).length;
await ask('Show me that paper again', [[0, 'progress', { stage: `Opening ${PAPER.title}...`, card: 'paper' }], [1200, 'chunk', { text: 'Here it is.' }], [0, 'paper', PAPER], [0, 'done', { ok: true }]]);
await slots().first().waitFor({ timeout: 3000 });
await noSlot();
await page.waitForTimeout(500);
check('E5 a paper already on the canvas takes over: the slot goes, no second card, the paper in view', (await column()).length === count && await visible(page.locator(`[data-block-id="${paperCard.id}"]`)));

// =====================  F-G: the Tutor (the NanoGPT Attention slice board) and a Rabbit Hole under it  =====================
const tutorCanvas = await call(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'Skeleton Tutor check' }) });
await open(`/apps/${tutorCanvas.name}?board=${TUTOR_BOARD}`);
const hold = () => { let release; const held = new Promise(resolve => { release = resolve; }); return { held, release }; };

// F1. A normal question: never a skeleton.
let gate = hold();
planNext = () => gate.held.then(() => ({ json: { strategy: 'none', move: 'explain', reason: '', actions: [say('Softmax divides each exponential by their sum, so the weights add to one.')] } }));
await send('Why does softmax sum to one?');
let seen = 0;
for (let i = 0; i < 30; i++) { seen += await slots().count(); await page.waitForTimeout(50); }
gate.release();
await page.getByText('so the weights add to one').first().waitFor({ timeout: 15000 });
check('F1 a normal question gets no skeleton', seen === 0 && (await slots().count()) === 0);

// F2. "Show me this visually": the place is held before the plan answers; the new card fills it, selected, at the
// learner's zoom, inside what the open chat leaves visible. The learner zooms out to 26% (six steps), where a slice
// card fits above the open chat.
for (let i = 0; i < 6; i++) await page.locator('[data-zoom] [title="Zoom out"]').click();
// Parked below the slice, so the skeleton (at the column's end) starts out of view and the camera has to bring it.
const tutorBox = await surface();
await page.mouse.move(tutorBox.x + 150, tutorBox.y + 200);
for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 1200);
await page.waitForTimeout(500);
const tutorZoom = await zoom();
gate = hold();
const C21 = cardModule('c21-temperature').scene.title;
planNext = () => gate.held.then(() => ({ json: { strategy: 'none', move: 'show', reason: '', explicit_request: 'Show me this visually', actions: [{ type: 'show_authored_card', card: 'c21-temperature', mode: 'navigate' }, say('Here is temperature, drawn.')] } }));
await send('Show me this visually');
await slots().first().waitFor({ timeout: 2000 });
const plansAtSlot = plans.length;
await page.waitForTimeout(400);
const tutorSlot = (await column()).find(entry => entry.slot);
check('F2 the skeleton is up before the plan has answered, sized as a typical slice card, centred in the visible canvas, zoom kept', /Creating a card…/.test(await slots().first().getAttribute('aria-label')) && await centred(slots().first()) && await zoom() === tutorZoom && tutorSlot.w === 981 && tutorSlot.h === 1014, `${plansAtSlot} plan request(s) in flight, ${tutorSlot.w}x${tutorSlot.h}`);
await page.waitForTimeout(1500);
await shot('08-tutor-skeleton-mid-wait');
gate.release();
await noSlot();
await page.waitForTimeout(800);
const c21 = (await column()).find(entry => entry.top === tutorSlot.top);
const c21Node = c21 && page.locator(`[data-block-id="${c21.id}"]`);
check('F3 the card took the skeleton\'s place', !!c21 && !c21.slot && (await c21Node.innerText()).includes(C21));
const area = await freeArea(), cardBox = await c21Node.boundingBox();
check('F4 the new card is selected at the same zoom, no fit, inside the canvas the open chat leaves visible', await selected(c21.id) && await zoom() === tutorZoom && !!area.sheet && await inFree(c21Node), `card ${JSON.stringify(cardBox)} area ${JSON.stringify(area)}`);
await shot('09-tutor-card-above-open-chat-same-zoom');

// F5. A visual request the Tutor answers in words only: the skeleton goes, no ghost.
planNext = () => later(1500, { json: { strategy: 'none', move: 'explain', reason: '', actions: [say('Temperature divides the logits before softmax.')] } });
await send('Show me the mechanism');
await slots().first().waitFor({ timeout: 2000 });
await noSlot();
await page.getByText('Temperature divides the logits').first().waitFor({ timeout: 15000 });
check('F5 a text-only answer leaves no skeleton', (await slots().count()) === 0);

// F6. Stop: the skeleton goes at once.
gate = hold();
planNext = () => gate.held.then(() => ({ json: { strategy: 'none', move: 'explain', reason: '', actions: [say('Too late.')] } }));
await send('Make a card for this');
await slots().first().waitFor({ timeout: 2000 });
const stopped = Date.now();
await page.getByRole('button', { name: 'Stop', exact: true }).click();
await noSlot();
check('F6 Stop removes the skeleton immediately', Date.now() - stopped < 1000, `${Date.now() - stopped} ms`);
gate.release();

// F7. A failure: the safe error reply stays, the skeleton goes.
planNext = () => later(800, { status: 500, json: { error: 'The tutor is unavailable (500)' } });
await send('Show me the attention pattern visually');
await slots().first().waitFor({ timeout: 2000 });
await noSlot();
check('F7 a failed plan removes the skeleton', (await slots().count()) === 0);

// F8. A card already on the canvas: the slot goes and that card is focused.
const C11 = cardModule('c11-causal-mask').scene.title;
planNext = () => later(1200, { json: { strategy: 'none', move: 'show', reason: '', explicit_request: 'Show me the causal mask', actions: [{ type: 'show_authored_card', card: 'c11-causal-mask', mode: 'navigate' }] } });
const tutorCount = (await column()).length;
await send('Show me the causal mask');
await slots().first().waitFor({ timeout: 2000 });
await noSlot();
await page.waitForTimeout(800);
const c11Node = page.locator('[data-block-id]:not([data-chat-block])', { hasText: C11 }).first();
check('F8 a card already there is selected and brought into the visible canvas at the same zoom; nothing is added', (await column()).length === tutorCount && await selected(await c11Node.getAttribute('data-block-id')) && await zoom() === tutorZoom && await inFree(c11Node));
await shot('10-tutor-existing-card-focused');

// F9. A timeout (the Tutor's 60 s): the skeleton goes with the error.
gate = hold();
planNext = () => gate.held.then(() => ({ json: { strategy: 'none', move: 'explain', reason: '', actions: [say('Too late.')] } }));
await send('Show me the scaling visually');
await slots().first().waitFor({ timeout: 2000 });
await waitFor(async () => (await slots().count()) === 0, 'the timeout', 75000);
check('F9 a timed-out turn removes the skeleton', (await page.getByText('took too long').count()) > 0);
gate.release();

// G. A Rabbit Hole under the slice: the skeleton never keeps the pending hole; the card does, at the asked part.
planNext = sent => later(300, { json: { strategy: 'none', move: 'explain', reason: '', actions: [say(sent.learner_intent.kind === 'opening' ? 'Softmax first.' : 'Here is the memory part.')] } });
await send('/dive softmax');
await page.waitForFunction(() => location.search.includes('hole='), null, { timeout: 20000 });
await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(3000);
const hole = new URL(page.url()).searchParams.get('hole'), holeZoom = await zoom();
dives.length = 0;
gate = hold();
planNext = () => gate.held.then(() => ({ json: { strategy: 'none', move: 'show', reason: '', explicit_request: 'Show me the memory part', actions: [{ type: 'focus_part', card: 'depth-attention-deep', part_id: 'memory', mode: 'navigate' }, say('Here is the memory part.')] } }));
await send('Show me the memory part visually');
await slots().first().waitFor({ timeout: 2000 });
await page.waitForTimeout(2500);
check('G1 a skeleton does not keep the pending hole', dives.length === 0 && (await call(owner, `/api/canvases/dives?app=${tutorCanvas.name}&board=${TUTOR_BOARD}`)).children.length === 0, hole);
await shot('11-hole-skeleton-pending');
gate.release();
await noSlot();
await waitFor(async () => dives.length > 0, 'the card keeps the hole', 10000);
const deep = page.locator('[data-block-id]:not([data-chat-block])', { hasText: cardModule('depth-attention-deep').scene.title }).first();
check('G2 the card keeps the hole, and opens at the asked part', dives.length === 1 && /3 \/ 4/.test(await deep.locator('[data-pager-readout]').innerText()));
const [deepBox, holeArea] = [await deep.boundingBox(), await freeArea()];
check('G3 taller than the visible canvas at the learner\'s zoom: its top just inside the frame, zoom kept', await zoom() === holeZoom && Math.abs(deepBox.y - holeArea.top) <= 2 && deepBox.x >= holeArea.left - 2 && deepBox.x + deepBox.width <= holeArea.right + 2, `${JSON.stringify(deepBox)} ${JSON.stringify(holeArea)}`);
await shot('12-hole-card-at-part');

check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
check('nothing reached a model route outside the scripts', refused.length === 0, refused.join(', '));
await browser.close();
sse.close();
const failed = results.filter(([, ok]) => !ok);
console.log(JSON.stringify({ ok: !failed.length, checks: results.length, failed: failed.map(([name]) => name) }));
process.exit(failed.length ? 1 : 0);
