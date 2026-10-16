// A board's restore on open never empties it (C:/s/spec/board-empty-report.md). On a cold page the canvas can mount on this
// browser's empty copy before the board GET answers; the page then puts the server's copy in this browser's storage and
// remounts the canvas. A save the old canvas still had pending (its as-loaded save 400 ms after mount, or an edit's) fired
// in between, wrote its board over that copy, the remounted canvas read it back, and the page's next push (the 1500 ms
// exchanges push) sent it over the server's: a persisted overwrite. Here the interleaving is forced, not waited for: the
// canvas's pending 400 ms saves are held and run right after the restore's write.
// Against the LOCAL stack only; no model calls; prints no secrets.
// 1 the as-loaded save forced after the restore: the seeded card stays in this browser's copy, the server's board, a reopen
//   in the same browser and a fresh one, and no PUT drops it;
// 2 an edit made before the server copy arrives, its save forced after the restore: the card survives as in 1, and the edit
//   (a pen stroke) is kept too - added to the server's copy - in this browser, on the server and after reopening;
// 3 an ordinary edit saves to the server and survives a reopen in a fresh browser;
// 4 deleting on purpose: the last remaining card through ordinary editing (click, Delete), and every card at once (select
//   all, Delete - the product has no other clear action; select all takes cards, notes and shapes, ink is erased with the
//   eraser) - each saves the empty board and it survives a reopen in a fresh browser.
// 5 a conflict: this browser holds an older copy, the card is changed on the server meanwhile, and here it is moved before
//   the server copy arrives (its save forced after the restore): both versions are kept - the server's in place and this
//   page's as a copy - with a note on screen, in this browser, on the server and after reopening;
// 6 leaving the canvas less than 400 ms after an edit (Back): the edit is written and pushed on the way out - in this
//   browser, on the server and in a fresh browser;
// 7 words typed in the document while a server copy loads (after Reload and keep my document, the reachable case: the
//   editor waits for the first load only when this browser has no document): they are kept and saved, and the server's
//   document is kept aside and offered back;
// 8 words typed while the FIRST server load is still pending, in a browser holding an older copy with a document (the
//   editor shows it at once): the server's document stays in place, the typed words are kept aside and offered back, and
//   Restore brings them back - then in this browser, on the server and in a fresh browser.
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
const catalog = (await api('/api/apps')).body;
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'c1', type: 'explanation', dx: 0, dy: 0, title: 'Attention', body: 'Queries meet keys.' }] };
const seeded = async label => {
  const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Restore ${label} ${run}` }) })).body;
  assert.equal((await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE }) })).status, 200, 'seeding the board');
  return canvas.name;
};
const inkKey = name => `small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}:ink`;
const server = async name => (await api(`/api/learn/boards/${name}/main`)).body.state;

const results = [], errors = [];
// Each step runs whether or not the one before passed, so a run shows every scenario's result; any failure exits 1.
const failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label} - ${String(error?.message || error).split('\n')[0].slice(0, 300)}`); }
};
const browser = await chromium.launch();

// The page instrumentation. hold: the canvas's 400 ms saves are held, and right after the first write of a board copy with
// the seeded card (the restore), each still pending runs at once - before React can remount the canvas. Always: the
// page's 1500 ms pushes and board PUTs in flight are counted, so a check waits until none is left to send or answer.
const instrument = hold => {
  window.restoreLog = [];
  const pending = new Map(), pushes = new Set(), realSet = window.setTimeout, realClear = window.clearTimeout, set = Storage.prototype.setItem;
  let inFlight = 0, pushed = 0, forced = false;
  window.setTimeout = (fn, ms, ...rest) => {
    const id = realSet(() => { pending.delete(id); if (pushes.delete(id)) pushed += 1; fn(...rest); }, ms);
    if (hold && ms === 400) pending.set(id, () => fn(...rest));
    if (ms === 1500) pushes.add(id);
    return id;
  };
  window.clearTimeout = id => { pending.delete(id); pushes.delete(id); return realClear(id); };
  window.settled = () => pushes.size === 0 && inFlight === 0;
  window.pushesSent = () => pushed;
  const realFetch = window.fetch;
  window.fetch = (input, init) => {
    if ((init?.method || 'GET') !== 'PUT' || !/\/api\/learn\/boards\/[^/]+\/main$/.test(String(input?.url || input))) return realFetch(input, init);
    inFlight += 1;
    return realFetch(input, init).finally(() => { inFlight -= 1; });
  };
  Storage.prototype.setItem = function (key, value) {
    const result = set.call(this, key, value);
    if (!/adaptive-canvas.*:ink$/.test(key)) return result;
    let restored = false;
    try { restored = (JSON.parse(value).blocks || []).some(block => block.id === 'c1'); } catch { /* not a board */ }
    window.restoreLog.push(restored ? 'write with card' : 'write without card');
    if (hold && !forced && restored && pending.size) { forced = true; window.restoreLog.push(`forced ${pending.size}`); for (const [id, fn] of [...pending]) { pending.delete(id); realClear(id); fn(); } }
    return result;
  };
  new MutationObserver(() => { if (!window.restoreMounted && document.querySelector('[aria-label="Lesson canvas"] svg, [aria-label="Lesson canvas"] canvas')) window.restoreMounted = Date.now(); })
    .observe(document, { childList: true, subtree: true });
};
// A browser for one canvas. held: the board GET's real answer waits until the canvas has mounted and window.releaseGet is
// set. Every board PUT's card ids are recorded.
const profile = async (name, { hold = false, held = false, editor = false } = {}) => {
  const gate = { held };
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(instrument, hold);
  if (editor) await context.addInitScript(key => { if (localStorage.getItem(key) == null) localStorage.setItem(key, 'editor'); }, inkKey(name).replace(/:ink$/, ':view'));
  const puts = [];
  let page;
  await context.route(`**/api/learn/boards/${name}/main`, async route => {
    const request = route.request();
    if (request.method() === 'PUT') { try { puts.push((JSON.parse(request.postData()).state.blocks || []).map(block => block.id)); } catch { puts.push(null); } return route.fallback(); }
    if (request.method() !== 'GET' || !gate.held) return route.fallback();
    // A held GET can outlive its page or browser (a scenario closes them once it has asserted): then it is dropped, never an
    // unhandled rejection that ends the whole run.
    try {
      const response = await route.fetch();
      gate.pending = true; gate.answered = false;
      for (let i = 0; i < 600; i += 1) if (await page.evaluate(() => !!(window.restoreMounted && window.releaseGet)).catch(() => false)) break; else await new Promise(done => setTimeout(done, 25));
      gate.pending = false; gate.answered = true;
      return await route.fulfill({ response });
    } catch { return route.abort().catch(() => {}); }
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, gate, page: () => page, puts, open: async (next = null) => { if (next) { page = next; page.on('pageerror', error => errors.push(error.message)); } await page.goto(`${BASE}/apps/${name}`); } };
};
const settle = page => page.waitForFunction(() => window.settled(), null, { timeout: 15000, polling: 100 });
const copyOf = (page, name) => page.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return 'unreadable'; } }, inkKey(name));
const ids = state => (state?.blocks || []).map(block => block.id);
// A pen stroke on bare canvas, through the toolbar.
const draw = async page => {
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  const frame = await page.locator('[aria-label="Lesson canvas"]').boundingBox();
  const x = frame.x + frame.width * 0.55, y = frame.y + frame.height * 0.7;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 120, y + 20, { steps: 8 }); await page.mouse.up();
  await page.keyboard.press('Escape');
};
// The card in this browser's copy, the server's board, a reopen in the same browser and one in a fresh browser.
const survives = async (where, name, profileOf) => {
  const page = profileOf.page();
  await settle(page);
  const copy = ids(await copyOf(page, name)), saved = ids(await server(name));
  assert.ok(copy.includes('c1'), `${where}: this browser's copy keeps the card (${JSON.stringify(copy)})`);
  assert.ok(saved.includes('c1'), `${where}: the server's board keeps the card (${JSON.stringify(saved)})`);
  assert.ok(profileOf.puts.every(put => put && put.includes('c1')), `${where}: no board PUT drops the card (${JSON.stringify(profileOf.puts)})`);
  await page.close();
  const again = await profileOf.context.newPage();
  await profileOf.open(again);
  await again.locator('[data-block-id="c1"]').waitFor({ timeout: 30000 });
  await profileOf.context.close();
  const fresh = await profile(name);
  await fresh.open();
  await fresh.page().locator('[data-block-id="c1"]').waitFor({ timeout: 30000 });
  await fresh.context.close();
};

await check('1 the as-loaded save forced after the restore: the card stays in this browser, on the server, after a reopen and in a fresh browser; no PUT drops it', async () => {
  const name = await seeded('loaded');
  const one = await profile(name, { hold: true, held: true });
  await one.page().addInitScript(() => { window.releaseGet = true; });
  await one.open();
  await one.page().locator('[data-block-id="c1"]').waitFor({ timeout: 30000 }).catch(() => {});
  const log = await one.page().evaluate(() => window.restoreLog);
  assert.ok(log.some(entry => entry.startsWith('forced')), `the interleaving was forced (${log.join(', ')})`);
  assert.equal(await one.page().locator('[data-block-id="c1"]').count(), 1, `the card is on the canvas (${log.join(', ')})`);
  one.gate.held = false;
  await settle(one.page());
  console.log(`   log: ${log.join(', ')}; 1500 ms pushes sent: ${await one.page().evaluate(() => window.pushesSent())}; PUTs: ${JSON.stringify(one.puts)}`);
  await survives('as-loaded save', name, one);
});

await check('2 an edit made before the server copy arrives, its save forced after the restore: the card stays everywhere; no PUT drops it', async () => {
  const name = await seeded('edit');
  const two = await profile(name, { hold: true, held: true });
  await two.open();
  await two.page().waitForFunction(() => !!window.restoreMounted, null, { timeout: 30000 });
  await draw(two.page());
  await two.page().evaluate(() => { window.releaseGet = true; });
  await two.page().locator('[data-block-id="c1"]').waitFor({ timeout: 30000 }).catch(() => {});
  const log = await two.page().evaluate(() => window.restoreLog);
  assert.ok(log.some(entry => entry.startsWith('forced')), `the edit's save was forced (${log.join(', ')})`);
  assert.equal(await two.page().locator('[data-block-id="c1"]').count(), 1, `the card is on the canvas (${log.join(', ')})`);
  two.gate.held = false;
  await settle(two.page());
  console.log(`   log: ${log.join(', ')}; 1500 ms pushes sent: ${await two.page().evaluate(() => window.pushesSent())}; PUTs: ${JSON.stringify(two.puts)}`);
  // The edit made while the board loaded is pushed with the card: wait for the server to hold both.
  await two.page().waitForFunction(() => window.pushesSent() > 0, null, { timeout: 15000, polling: 100 });
  await settle(two.page());
  assert.equal((await copyOf(two.page(), name))?.strokes?.length, 1, 'the edit is in this browser\'s copy');
  assert.equal((await server(name)).strokes.length, 1, 'the edit reached the server');
  await survives('edit before the server copy', name, two);
  const fresh = await profile(name);
  await fresh.open();
  await fresh.page().locator('[data-block-id="c1"]').waitFor({ timeout: 30000 });
  await fresh.page().waitForFunction(key => (JSON.parse(localStorage.getItem(key) || '{}').strokes || []).length === 1, inkKey(name), { timeout: 15000 });
  await fresh.context.close();
});

await check('3 an ordinary edit saves to the server and survives a reopen in a fresh browser', async () => {
  const name = await seeded('ordinary');
  const three = await profile(name);
  await three.open();
  await three.page().locator('[data-block-id="c1"]').waitFor({ timeout: 30000 });
  await draw(three.page());
  await three.page().waitForFunction(() => window.pushesSent() > 0, null, { timeout: 15000, polling: 100 });
  await settle(three.page());
  const saved = await server(name);
  assert.deepEqual([ids(saved), saved.strokes.length], [['c1'], 1], 'the server has the card and the new stroke');
  await three.context.close();
  const fresh = await profile(name);
  await fresh.open();
  await fresh.page().locator('[data-block-id="c1"]').waitFor({ timeout: 30000 });
  await fresh.page().waitForFunction(key => (JSON.parse(localStorage.getItem(key) || '{}').strokes || []).length === 1, inkKey(name), { timeout: 15000 });
  await fresh.context.close();
});

// Deletes through `remove` (a keypress on the open canvas), then the empty board is on the server and in a fresh browser.
const deletesToEmpty = async (where, name, extra, remove) => {
  if (extra) {
    const board = await server(name);
    assert.equal((await api(`/api/learn/boards/${name}/main`, { method: 'PUT', body: JSON.stringify({ state: { ...board, blocks: [...board.blocks, extra] }, version: (await api(`/api/learn/boards/${name}/main`)).body.version }) })).status, 200, 'adding the second card');
  }
  const four = await profile(name);
  await four.open();
  const page = four.page();
  await page.locator('[data-block-id="c1"]').waitFor({ timeout: 30000 });
  await remove(page);
  await page.locator('[data-block-id]').first().waitFor({ state: 'detached', timeout: 10000 });
  await page.waitForFunction(() => window.pushesSent() > 0, null, { timeout: 15000, polling: 100 });
  await settle(page);
  assert.deepEqual(ids(await server(name)), [], `${where}: the server has the empty board`);
  assert.deepEqual(four.puts.at(-1), [], `${where}: the last PUT carried the empty board`);
  await four.context.close();
  const fresh = await profile(name);
  await fresh.open();
  await fresh.page().waitForFunction(key => !!window.restoreMounted && (JSON.parse(localStorage.getItem(key) || '{"blocks":[0]}').blocks || []).length === 0, inkKey(name), { timeout: 30000 });
  assert.equal(await fresh.page().locator('[data-block-id]').count(), 0, `${where}: the deleted cards stay deleted after a reopen`);
  await fresh.context.close();
};
await check('4 deleting on purpose saves the empty board, which survives a reopen: the last remaining card (click, Delete) and every card (select all, Delete)', async () => {
  await deletesToEmpty('the last card', await seeded('last'), null, async page => {
    await page.locator('[data-block-id="c1"]').first().click({ position: { x: 40, y: 14 } });
    await page.keyboard.press('Delete');
  });
  await deletesToEmpty('select all', await seeded('all'), { id: 'c2', type: 'explanation', dx: 0, dy: 260, title: 'Keys', body: 'Keys meet queries.' }, async page => {
    await page.locator('[data-block-id="c2"]').waitFor({ timeout: 30000 });
    await page.locator('[data-block-id="c2"]').first().click({ position: { x: 40, y: 14 } });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
  });
});

await check('5 a conflict (the card changed on the server and moved here before the server copy arrived): both versions are kept, with a note, in this browser, on the server and after reopening', async () => {
  const name = await seeded('conflict');
  const five = await profile(name, { hold: true, held: true });
  // This browser's copy at version 1: an ordinary open, the GET released at once.
  await five.page().addInitScript(() => { window.releaseGet = true; });
  await five.open();
  await five.page().locator('[data-block-id="c1"]').waitFor({ timeout: 30000 });
  await settle(five.page());
  await five.page().close();
  // The card changes on the server (version 2), from elsewhere.
  const board = (await api(`/api/learn/boards/${name}/main`)).body;
  const theirs = { ...board.state, blocks: board.state.blocks.map(block => ({ ...block, title: 'Attention, edited elsewhere' })) };
  assert.equal((await api(`/api/learn/boards/${name}/main`, { method: 'PUT', body: JSON.stringify({ state: theirs, version: board.version }) })).status, 200, 'the edit elsewhere');
  // Reopened here on the older copy, the card moved before the server copy arrives.
  const page = await five.context.newPage();
  await five.open(page);
  await page.waitForFunction(() => !!window.restoreMounted, null, { timeout: 30000 });
  await page.locator('[data-block-id="c1"]').first().click({ position: { x: 40, y: 14 } });
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowRight');
  const moved = await page.evaluate(() => window.restoreLog.length);
  await page.evaluate(() => { window.releaseGet = true; });
  await page.getByText('Both versions are on the canvas.').first().waitFor({ timeout: 15000 });
  await page.waitForFunction(() => window.pushesSent() > 0, null, { timeout: 15000, polling: 100 });
  await settle(page);
  const log = await page.evaluate(() => window.restoreLog);
  assert.ok(log.some(entry => entry.startsWith('forced')), `the move's save was forced after the restore (${log.join(', ')}; ${moved} writes before release)`);
  const both = state => {
    const cards = state?.blocks || [];
    const server = cards.find(block => block.id === 'c1'), mine = cards.find(block => block.id.startsWith('c1-mine-'));
    return { server: server?.title, mine: mine?.title, moved: !!mine && mine.dx !== server?.dx };
  };
  const want = { server: 'Attention, edited elsewhere', mine: 'Attention', moved: true };
  assert.deepEqual(both(await copyOf(page, name)), want, 'this browser\'s copy keeps both versions');
  assert.deepEqual(both(await server(name)), want, 'the server keeps both versions');
  await five.context.close();
  const fresh = await profile(name);
  await fresh.open();
  await fresh.page().locator('[data-block-id="c1"]').waitFor({ timeout: 30000 });
  await fresh.page().waitForFunction(key => (JSON.parse(localStorage.getItem(key) || '{}').blocks || []).length === 2, inkKey(name), { timeout: 15000 });
  assert.deepEqual(both(await copyOf(fresh.page(), name)), want, 'a fresh browser opens both versions');
  await fresh.context.close();
});

await check('6 leaving the canvas less than 400 ms after an edit (Back): the edit is in this browser, on the server and in a fresh browser', async () => {
  const name = await seeded('leave');
  const six = await profile(name);
  await six.open();
  const page = six.page();
  await page.locator('[data-block-id="c1"]').waitFor({ timeout: 30000 });
  await settle(page);
  await draw(page);
  const drawnAt = Date.now();
  await page.locator('[data-learn-home]').click();
  const left = Date.now() - drawnAt;
  await page.waitForFunction(name => !location.pathname.endsWith(name), name, { timeout: 15000 });
  await settle(page);
  console.log(`   left ${left} ms after the stroke; PUTs: ${JSON.stringify(six.puts)}`);
  assert.ok(left < 400, `left before the 400 ms save (${left} ms)`);
  assert.equal((await copyOf(page, name))?.strokes?.length, 1, 'the edit is in this browser\'s copy');
  assert.equal((await server(name)).strokes.length, 1, 'the edit reached the server');
  await six.context.close();
  const fresh = await profile(name);
  await fresh.open();
  await fresh.page().locator('[data-block-id="c1"]').waitFor({ timeout: 30000 });
  await fresh.page().waitForFunction(key => (JSON.parse(localStorage.getItem(key) || '{}').strokes || []).length === 1, inkKey(name), { timeout: 15000 });
  await fresh.context.close();
});

await check('7 words typed while a server copy loads (Reload and keep my document): kept and saved; the server\'s document kept aside and offered back', async () => {
  const para = (id, text) => ({ id, type: 'paragraph', props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' }, content: [{ type: 'text', text, styles: {} }], children: [] });
  const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Restore doc ${run}` }) })).body, name = canvas.name;
  assert.equal((await api(`/api/learn/boards/${name}/main`, { method: 'PUT', body: JSON.stringify({ state: { ...STATE, doc: { v: 1, x: 0, y: 0, w: 760, blocks: [para('base', `Base words ${run}`)] } } }) })).status, 200, 'seeding the board with a document');
  const seven = await profile(name, { editor: true });
  await seven.open();
  const page = seven.page(), editor = page.locator('[data-canvas-doc-editor] .bn-editor');
  await page.locator('[data-canvas-doc][data-doc-state="ready"]').waitFor({ timeout: 30000 });
  await settle(page);
  // The document changes on the server meanwhile; typing here then meets a 409.
  const board = (await api(`/api/learn/boards/${name}/main`)).body;
  const theirs = { ...board.state, doc: { ...board.state.doc, blocks: [...board.state.doc.blocks, para('theirs', `Server words ${run}`)] } };
  assert.equal((await api(`/api/learn/boards/${name}/main`, { method: 'PUT', body: JSON.stringify({ state: theirs, version: board.version }) })).status, 200, 'the edit elsewhere');
  const type = async text => { await editor.focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(text); };
  await type(` First words ${run}`);
  const keep = page.getByRole('button', { name: 'Reload and keep my document' });
  await keep.waitFor({ timeout: 20000 });
  // Reload and keep my document, its GET held while more words are typed (inside the editor's 500 ms pause), then released.
  seven.gate.held = true;
  await page.evaluate(() => { window.releaseGet = false; });
  await keep.click();
  await type(` typed during restore ${run}`);
  await page.evaluate(() => { window.releaseGet = true; });
  await page.locator('[data-doc-restore]').waitFor({ timeout: 20000 });
  seven.gate.held = false;
  await page.waitForFunction(() => window.pushesSent() > 0, null, { timeout: 15000, polling: 100 });
  await settle(page);
  const has = (value, text) => JSON.stringify(value ?? null).includes(text);
  const copy = await copyOf(page, name), aside = await page.evaluate(key => JSON.parse(localStorage.getItem(`${key}:replaced`) || 'null'), inkKey(name));
  const saved = await server(name);
  assert.ok(has(copy?.doc, `First words ${run}`) && has(copy?.doc, `typed during restore ${run}`), 'this browser\'s document keeps every word typed');
  assert.ok(has(saved.doc, `typed during restore ${run}`), 'the words typed during the reload reached the server');
  assert.ok(has(aside?.doc, `Server words ${run}`), 'the server\'s document is kept aside in this browser');
  assert.ok(await page.getByRole('button', { name: 'Restore my unsaved document' }).count(), 'and offered back');
  assert.ok(saved.blocks.some(block => block.id === 'c1'), 'the card is still on the server');
  await seven.context.close();
  // A fresh browser opens the saved document with every word typed (the server's version stays aside in the first browser).
  const fresh = await profile(name, { editor: true });
  await fresh.open();
  await fresh.page().locator('[data-canvas-doc][data-doc-state="ready"]').waitFor({ timeout: 30000 });
  await fresh.page().waitForFunction(([key, words]) => words.every(word => JSON.stringify(JSON.parse(localStorage.getItem(key) || '{}').doc || null).includes(word)), [inkKey(name), [`First words ${run}`, `typed during restore ${run}`]], { timeout: 15000 });
  assert.ok((await fresh.page().locator('[data-canvas-doc-editor] .bn-editor').innerText()).includes(`typed during restore ${run}`), 'a fresh browser shows the words typed during the reload');
  await fresh.context.close();
});

await check('8 words typed while the first server load is pending, on an older copy with a document: the server\'s document stays, the words are offered back, and Restore keeps them in this browser, on the server and in a fresh browser', async () => {
  const para = (id, text) => ({ id, type: 'paragraph', props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' }, content: [{ type: 'text', text, styles: {} }], children: [] });
  const has = (value, text) => JSON.stringify(value ?? null).includes(text);
  const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Restore first load ${run}` }) })).body, name = canvas.name;
  assert.equal((await api(`/api/learn/boards/${name}/main`, { method: 'PUT', body: JSON.stringify({ state: { ...STATE, doc: { v: 1, x: 0, y: 0, w: 760, blocks: [para('base', `Base words ${run}`)] } } }) })).status, 200, 'seeding the board with a document');
  // This browser's older copy, with the document: an ordinary open.
  const eight = await profile(name, { editor: true });
  await eight.open();
  await eight.page().locator('[data-canvas-doc][data-doc-state="ready"]').waitFor({ timeout: 30000 });
  await settle(eight.page());
  await eight.page().close();
  // The document changes on the server meanwhile.
  const board = (await api(`/api/learn/boards/${name}/main`)).body;
  const theirs = { ...board.state, doc: { ...board.state.doc, blocks: [...board.state.doc.blocks, para('theirs', `Server words ${run}`)] } };
  assert.equal((await api(`/api/learn/boards/${name}/main`, { method: 'PUT', body: JSON.stringify({ state: theirs, version: board.version }) })).status, 200, 'the edit elsewhere');
  // Reopened on the older copy with its board GET held: the editor shows this browser's document at once; type into it.
  eight.gate.held = true;
  const page = await eight.context.newPage();
  await eight.open(page);
  const editor = page.locator('[data-canvas-doc-editor] .bn-editor');
  await editor.waitFor({ timeout: 30000 });
  await editor.focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(` typed on open ${run}`);
  assert.deepEqual([eight.gate.pending, eight.gate.answered], [true, false], 'the words were typed while the first server load was still unanswered');
  await page.evaluate(() => { window.releaseGet = true; });
  const restore = page.getByRole('button', { name: 'Restore my unsaved document' });
  await restore.waitFor({ timeout: 20000 });
  eight.gate.held = false;
  await settle(page);
  const aside = () => page.evaluate(key => JSON.parse(localStorage.getItem(`${key}:replaced`) || 'null'), inkKey(name));
  let copy = await copyOf(page, name), saved = await server(name);
  assert.ok(has(copy?.doc, `Server words ${run}`) && !has(copy?.doc, `typed on open ${run}`), 'the server\'s document is in place in this browser');
  assert.ok(has(saved.doc, `Server words ${run}`), 'and on the server');
  assert.ok(has((await aside())?.doc, `typed on open ${run}`), 'the typed words are kept aside (:replaced) and offered back');
  // Restore brings them back, and they are saved.
  const sentBefore = await page.evaluate(() => window.pushesSent());
  await restore.click();
  await page.waitForFunction(([key, word]) => JSON.stringify(JSON.parse(localStorage.getItem(key) || '{}').doc || null).includes(word), [inkKey(name), `typed on open ${run}`], { timeout: 15000 });
  await page.waitForFunction(before => window.pushesSent() > before, sentBefore, { timeout: 15000, polling: 100 });
  await settle(page);
  copy = await copyOf(page, name); saved = await server(name);
  assert.ok(has(copy?.doc, `typed on open ${run}`), 'after Restore the words are in this browser\'s copy');
  assert.ok(has(saved.doc, `typed on open ${run}`), 'and on the server');
  assert.ok(has((await aside())?.doc, `Server words ${run}`), 'and the server\'s document it replaced is kept aside in turn');
  await eight.context.close();
  const fresh = await profile(name, { editor: true });
  await fresh.open();
  await fresh.page().locator('[data-canvas-doc][data-doc-state="ready"]').waitFor({ timeout: 30000 });
  await fresh.page().waitForFunction(([key, word]) => JSON.stringify(JSON.parse(localStorage.getItem(key) || '{}').doc || null).includes(word), [inkKey(name), `typed on open ${run}`], { timeout: 15000 });
  assert.ok((await fresh.page().locator('[data-canvas-doc-editor] .bn-editor').innerText()).includes(`typed on open ${run}`), 'a fresh browser shows the restored words');
  await fresh.context.close();
});

await browser.close();
console.log(`board-restore-check: ${results.length}/8 steps passed${errors.length ? `; page errors: ${errors.join(' | ').slice(0, 300)}` : ''}`);
process.exit(failures.length || errors.length ? 1 : 0);
