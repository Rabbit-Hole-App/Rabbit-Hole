// A board's restore on open never empties it (C:/s/spec/board-empty-report.md). On a cold page the canvas can mount on this
// browser's empty copy before the board GET answers; the page then puts the server's copy in this browser's storage and
// remounts the canvas. The old canvas's pending first save (400 ms after mount) fired in between, wrote its empty board
// over that copy, the remounted canvas read it back empty, and the page's next push sent the empty board over the server's.
// Here that interleaving is forced, not waited for: the canvas's pending 400 ms saves are held and run right after the
// restore's write. Against the LOCAL stack only; no model calls; prints no secrets.
// 1 the canvas mounts before the GET answers, the pending first save runs after the restore's write, and the seeded card
// is on the canvas; 2 no board PUT carries an empty board, and the server copy still has the card.
// Usage: BASE=http://127.0.0.1:8931 SMALL_CP=http://127.0.0.1:8933 node e2e/board-restore-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8933';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('board-restore-check runs against the local stack only');
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `restore-${run}@example.com`, secret, handle: `restore_${run}` }) })).json()).session;
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'c1', type: 'explanation', dx: 0, dy: 0, title: 'Attention', body: 'Queries meet keys.' }] };
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Restore ${run}` }) })).body;
assert.equal((await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE }) })).status, 200, 'seeding the board');

const results = [], errors = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(() => {
  window.restoreLog = [];
  // The canvas's pending 400 ms saves are held; right after the first write of a board copy that has cards (the restore),
  // each still pending runs at once - before React can remount the canvas.
  const pending = new Map(), realSet = window.setTimeout, realClear = window.clearTimeout, set = Storage.prototype.setItem;
  // The page's debounced board pushes (1500 ms) are counted too, so step 2 can wait until none is left to send.
  const pushes = new Set();
  window.pushesPending = () => pushes.size;
  // Board PUTs in flight: a push's fetch starts within the microtasks of its timer, so none is missed between the two.
  let inFlight = 0;
  const realFetch = window.fetch;
  window.fetch = (input, init) => {
    const put = (init?.method || 'GET') === 'PUT' && /\/api\/learn\/boards\/[^/]+\/main$/.test(String(input?.url || input));
    if (!put) return realFetch(input, init);
    inFlight += 1;
    return realFetch(input, init).finally(() => { inFlight -= 1; });
  };
  window.boardPutsInFlight = () => inFlight;
  window.setTimeout = (fn, ms, ...rest) => { const id = realSet(() => { pending.delete(id); pushes.delete(id); fn(...rest); }, ms); if (ms === 400) pending.set(id, () => fn(...rest)); if (ms === 1500) pushes.add(id); return id; };
  window.clearTimeout = id => { pending.delete(id); pushes.delete(id); return realClear(id); };
  let forced = false;
  Storage.prototype.setItem = function (key, value) {
    const result = set.call(this, key, value);
    if (!/adaptive-canvas.*:ink$/.test(key)) return result;
    let cards = 0;
    try { cards = (JSON.parse(value).blocks || []).length; } catch { /* not a board */ }
    window.restoreLog.push(`write ${cards}`);
    if (!forced && cards > 0 && pending.size) { forced = true; window.restoreLog.push('forced'); for (const [id, fn] of [...pending]) { pending.delete(id); realClear(id); fn(); } }
    return result;
  };
  new MutationObserver(() => { if (!window.restoreMounted && document.querySelector('[aria-label="Lesson canvas"] svg, [aria-label="Lesson canvas"] canvas')) window.restoreMounted = Date.now(); })
    .observe(document, { childList: true, subtree: true });
});
const puts = [];
let page;
// The board GET's real answer, held until the canvas has mounted on this browser's empty copy.
await context.route(`**/api/learn/boards/${canvas.name}/main`, async route => {
  const request = route.request();
  if (request.method() === 'PUT') { try { puts.push((JSON.parse(request.postData()).state.blocks || []).length); } catch { puts.push(null); } return route.fallback(); }
  if (request.method() !== 'GET') return route.fallback();
  const response = await route.fetch();
  for (let i = 0; i < 400; i += 1) if (await page.evaluate(() => !!window.restoreMounted).catch(() => false)) break; else await new Promise(done => setTimeout(done, 25));
  return route.fulfill({ response });
});
page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
await page.goto(`${BASE}/apps/${canvas.name}`);

await check('1 the canvas mounts before the board GET answers, its pending first save runs after the restore\'s write, and the seeded card is on the canvas', async () => {
  await page.locator('[data-block-id="c1"]').waitFor({ timeout: 30000 }).catch(() => {});
  const log = await page.evaluate(() => window.restoreLog);
  assert.ok(log.includes('forced'), `the interleaving was forced (${log.join(', ')})`);
  assert.equal(await page.locator('[data-block-id="c1"]').count(), 1, `the seeded card is on the canvas (${log.join(', ')})`);
});

await check('2 no board PUT carries an empty board, and the server copy still has the card', async () => {
  // A push is sent 1500 ms after the change that asks for it: wait until no push is left to send and no board PUT is in
  // flight, so a PUT the restore provoked has been sent and answered.
  await page.waitForFunction(() => window.pushesPending() === 0 && window.boardPutsInFlight() === 0, null, { timeout: 10000, polling: 100 });
  assert.ok(puts.every(cards => cards > 0), `board PUTs: ${JSON.stringify(puts)}`);
  const server = (await api(`/api/learn/boards/${canvas.name}/main`)).body;
  assert.deepEqual((server.state.blocks || []).map(block => block.id), ['c1'], 'the server copy keeps the card');
});

await browser.close();
assert.deepEqual(errors, [], 'no page errors');
console.log(`board-restore-check: ${results.length}/2 steps passed`);
