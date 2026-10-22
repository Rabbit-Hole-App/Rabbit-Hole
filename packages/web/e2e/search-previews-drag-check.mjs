// UI-12 compact Search previews and UI-13 drag results onto the canvas (owner brief 2026-10-21 message 21 items 1 and 2),
// in the actual app on an authorized local stack. Keyless: every model route is refused and counted, so the run proves zero
// AI calls. Fixtures are created through the real API under a fresh test identity.
// BASE=<app origin> SMALL_CP=<local CP> VARS=<named dev-vars file> CANDIDATE_SHA=<served SHA> OUT=<dir> node e2e/search-previews-drag-check.mjs
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE || 'http://127.0.0.1:9641';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9643';
for (const origin of [BASE, CP]) assert.match(origin, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/, 'local stack only');
const OUT = resolve(process.env.OUT || 'e2e/shots/search-previews-drag'); mkdirSync(OUT, { recursive: true });
const secret = process.env.TEST_BYPASS_SECRET || (process.env.VARS && readFileSync(process.env.VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2'));
assert.ok(secret, 'Set TEST_BYPASS_SECRET or VARS; only the named variable is read');
const MODEL = /^\/api\/(?:ask$|repositories\/[^/]+\/(?:ask|learn-course)$|learn\/(?:ask|selection|tutor(?:\/|$)|plan|artifact|assess|grade|home-ask|course|image|media(?:\/|$)|inline\/(?:generate|route)|journey|scene|transcribe|tts|voice\/|dive|explore|search(?:\/|$))|learn\/boards\/shared\/[^/]+\/(?:ask|next-steps))/;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const run = Date.now().toString(36), results = [], errors = [], modelAttempts = [];
const facts = { candidate: process.env.CANDIDATE_SHA || 'not supplied; served candidate unverified', base: BASE, run,
  limitations: ['Mocked nothing: no model route is answered, so no real-model behaviour is involved.', 'PDF pages have no stored thumbnail (pdf.js is a live renderer); the PDF fallback is unit-tested, not drawn here.', 'Native drag image pixels are drawn by the browser and are not inspected; the drop outline is.'] };
let browser, context, page, session, canvas, saved, targets;
const request = async (path, method = 'GET', body, cookie = session, raw = false) => {
  const response = await fetch(BASE + path, { method, headers: { cookie: `small_session=${cookie}`, origin: BASE, ...(raw ? { 'content-type': 'image/png' } : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }) });
  const data = await response.json().catch(() => null);
  assert.ok(response.ok, `${method} ${path}: HTTP ${response.status}${data?.error ? ` (${data.error})` : ''}`);
  return data;
};
const makeSession = async email => {
  const response = await fetch(CP + '/test/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) });
  const data = await response.json().catch(() => null);
  assert.ok(response.ok && data?.session, `local test session: HTTP ${response.status}`);
  return data.session;
};
const empty = blocks => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks });
const card = (id, title, body, extra = {}) => ({ id, type: 'explanation', title, body, dx: 0, dy: 0, ...extra });
const until = async (read, message, timeout = 15000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await read()) return; await new Promise(done => setTimeout(done, 80)); } throw Error(message); };
const panel = () => page.locator('[data-canvas-search]:visible');
const input = () => panel().getByRole('textbox', { name: 'Find text on canvas', exact: true });
const row = id => panel().locator(`[data-search-result="${id}"]`);
const filter = id => panel().locator(`[data-search-filter="${id}"]`).click();
const search = async (query, category = 'all') => { await filter(category); await input().fill(query); await until(async () => await input().inputValue() === query, 'query input did not update'); };
const openFind = async () => { await page.getByRole('tab', { name: 'Find text on canvas', exact: true }).click(); await panel().waitFor(); };
const go = async () => { await page.goto(`${BASE}/apps/${canvas.name}`); await page.locator('[data-canvas-surface]').waitFor({ timeout: 60000 }); await page.locator('[data-block-id="mover"]').waitFor({ timeout: 60000 }); await openFind(); };
const shot = name => page.screenshot({ path: resolve(OUT, `${name}.png`) });
const board = () => request(`/api/learn/boards/${canvas.name}/main`);
const refCards = async target => (await board()).state.blocks.filter(block => block.type === 'canvas-ref' && block.refs?.[0]?.target === target);
// The camera ([data-canvas-world] translate + scale) and a block's world box from its drawn box, so a drop is checked in the
// canvas's own units at any zoom.
const camera = () => page.locator('[data-canvas-world]').first().evaluate(world => { const [, x, y, z] = world.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/).map(Number); const s = world.closest('[data-canvas-surface]').getBoundingClientRect(); return { x, y, z, left: s.left, top: s.top, width: s.width, height: s.height }; });
const worldBox = async id => { const view = await camera(); const r = await page.locator(`[data-block-id="${id}"]`).first().boundingBox(); return { x: (r.x - view.left - view.x) / view.z, y: (r.y - view.top - view.y) / view.z, w: r.width / view.z, h: r.height / view.z }; };
const toWorld = (view, point) => ({ x: (point.x - view.left - view.x) / view.z, y: (point.y - view.top - view.y) / view.z });
const near = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a.toFixed(1)} vs ${b.toFixed(1)}`);
const zoomTo = async target => { await page.getByTitle('Reset zoom').click(); const factor = target > 1 ? 'Zoom in' : 'Zoom out'; for (let i = 0; i < Math.round(Math.abs(Math.log(target) / Math.log(1.25))); i++) await page.getByTitle(factor, { exact: true }).click(); await until(async () => Math.abs((await camera()).z - target) < 0.02, `zoom never reached ${target}`); };
// A real HTML5 drag from a result's main button to a screen point, with the outline checked while the drag is held.
const drag = async (id, point, during) => {
  const source = row(id).locator('[data-search-index]'); await source.scrollIntoViewIfNeeded();
  const box = await source.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 12); await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 20, { steps: 4 }); await page.mouse.move(point.x, point.y, { steps: 16 });
  // Chromium's emulated dragover reports the previous pointer step; repeating the final point settles it there.
  await page.mouse.move(point.x + 1, point.y); await page.mouse.move(point.x, point.y); await page.mouse.move(point.x, point.y);
  // The outline follows dragover events, which trail the pointer: wait until it is shown and holds still at the final point.
  const outline = page.locator('[data-search-drop]'); let last = null;
  await until(async () => { if (!(await outline.isVisible())) return false; const now = JSON.stringify(await outline.boundingBox()); const still = now === last; last = now; return still; }, 'no settled drop outline while dragging');
  const seen = { state: await outline.getAttribute('data-search-drop'), text: await outline.innerText(), box: await outline.boundingBox() };
  await during?.(seen);
  await page.mouse.up();
  await until(async () => !(await outline.isVisible()), 'drop outline stayed after the drop');
  return seen;
};
const freePoint = async (fx, fy) => { const view = await camera(); return { x: view.left + view.width * fx, y: view.top + view.height * fy }; };
const status = () => panel().locator('[role="status"]').innerText().catch(() => '');
const tests = [];
const check = (name, action) => tests.push({ name, action });

check('compact previews: numbered code excerpt, text excerpt, picture, informative fallback, linked canvas card', async () => {
  await search('');
  const code = row('object:code');
  assert.equal(await code.getAttribute('data-search-layout'), 'code');
  assert.deepEqual(await code.locator('[data-search-code-line]').evaluateAll(lines => lines.map(line => line.getAttribute('data-search-code-line'))), ['1', '2', '3']);
  assert.match(await code.innerText(), /Lines 1–3/);
  assert.equal(await row('object:note').getAttribute('data-search-layout'), 'text');
  assert.match(await row('object:note').locator('[data-search-excerpt]').innerText(), /Backpropagation/);
  await until(async () => await row('object:pic').locator('[data-search-preview="picture"] img').count() === 1, 'the image card picture never showed');
  // The video still is YouTube's (an outside origin this check refuses), so the row keeps its compact fallback.
  await until(async () => await row('object:clip').locator('[data-search-preview="fallback"]').count() === 1, 'video fallback missing');
  assert.match(await row('object:clip').locator('[data-search-preview]').innerText(), /Video/);
  assert.match(await row('object:linkcard').innerText(), /Link card on this canvas/);
  for (const id of ['object:code', 'object:note', 'object:pic']) { const box = await row(id).boundingBox(); assert.ok(box.height <= 140, `${id} is compact (${box.height}px)`); }
  assert.equal(await panel().locator('iframe,video,canvas').count(), 0, 'no live renderer in results');
  await shot('previews-light');
});
check('code excerpt keeps syntax colours and marks the match on the relevant line', async () => {
  await search('backward', 'code');
  const code = row('object:code');
  assert.deepEqual(await code.locator('[data-search-code-line]').evaluateAll(lines => lines.map(line => line.getAttribute('data-search-code-line'))), ['3', '4', '5']);
  assert.equal(await code.locator('[data-search-code] mark').innerText(), 'backward');
  await until(async () => await code.locator('[data-search-code] span[style*="--shiki-dark"]').count() > 0, 'shiki colours never applied');
  facts.lightCode = await code.locator('[data-search-code] span[style*="--shiki-dark"]').first().evaluate(span => ({ inline: span.style.color, computed: getComputedStyle(span).color }));
});
check('a linked canvas shows its own card thumbnail, title and relationship', async () => {
  await search('', 'links');
  const link = row(`link:from:${targets.a.board}`);
  await until(async () => await link.locator('[data-search-preview="picture"] img').count() === 1, 'linked canvas thumbnail never showed');
  assert.match(await link.innerText(), /Search linked A/); assert.match(await link.innerText(), /Linked from this canvas/);
  await until(async () => await row(`link:from:${targets.c.board}`).locator('[data-search-preview="fallback"]').count() === 1, 'a canvas with no thumbnail keeps the fallback');
  await shot('links-thumbnails');
});
check('narrow panel keeps one compact column without horizontal overflow', async () => {
  const separator = page.getByRole('separator', { name: 'Resize Learn panel', exact: true }); const before = await separator.boundingBox();
  await page.mouse.move(before.x + 2, before.y + 100); await page.mouse.down(); await page.mouse.move(before.x + 300, before.y + 100, { steps: 12 }); await page.mouse.up();
  await until(async () => Number(await separator.getAttribute('aria-valuenow')) <= 330, 'panel did not narrow');
  await search('');
  const overflow = await panel().locator('[data-search-result]').evaluateAll(rows => rows.filter(row => row.scrollWidth > row.clientWidth + 1).map(row => row.dataset.searchResult));
  assert.deepEqual(overflow, []);
  const first = await row('object:code').boundingBox(), second = await row('object:note').boundingBox();
  assert.ok(first.x === second.x, 'one column');
  await shot('previews-narrow');
  await separator.focus(); for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft');
});
for (const zoom of [1, 0.64, 1.5625]) check(`drag repositions the same card at ${Math.round(zoom * 100)}% with an outline at the drop point`, async () => {
  await zoomTo(zoom); await search('mover card');
  const view = await camera(), size = await worldBox('mover');
  const point = await freePoint(0.35, 0.35), at = toWorld(view, point);
  const seen = await drag('object:mover', point, () => shot(`drag-outline-${Math.round(zoom * 100)}`));
  assert.equal(seen.state, 'move'); assert.match(seen.text, /Move here/);
  near(seen.box.x, point.x - size.w * view.z / 2, 3, `outline left ${JSON.stringify({ seen, point, size, view })}`); near(seen.box.y, point.y, 3, 'outline top');
  await until(async () => { const box = await worldBox('mover'); return Math.abs(box.x - (at.x - size.w / 2)) < 2 && Math.abs(box.y - at.y) < 2; }, 'card did not land at the drop point');
  assert.equal(await page.locator('[data-block-id="mover"]').count(), 1, 'moved, not copied');
  facts[`drop${Math.round(zoom * 100)}`] = { at, box: await worldBox('mover') };
  if (zoom === 1) await shot('drag-moved');
});
check('Undo and Redo step the drop back and forth', async () => {
  await zoomTo(1); const before = await worldBox('mover');
  const point = await freePoint(0.35, 0.6); await drag('object:mover', point);
  await until(async () => (await worldBox('mover')).y > before.y + 5 || (await worldBox('mover')).y < before.y - 5, 'drop did not move the card');
  const after = await worldBox('mover');
  { const spot = await freePoint(0.95, 0.5); await page.mouse.click(spot.x, spot.y); }
  await page.keyboard.press('Control+z');
  await until(async () => { const box = await worldBox('mover'); return Math.abs(box.x - before.x) < 2 && Math.abs(box.y - before.y) < 2; }, 'Undo did not restore the card');
  await page.keyboard.press('Control+Shift+z');
  await until(async () => { const box = await worldBox('mover'); return Math.abs(box.x - after.x) < 2 && Math.abs(box.y - after.y) < 2; }, 'Redo did not repeat the drop');
});
check('a linked canvas drops as one link card; dropping it again moves that card instead of duplicating it', async () => {
  await search('', 'links');
  const point = await freePoint(0.35, 0.25), view = await camera(), at = toWorld(view, point);
  const seen = await drag(`link:from:${targets.b.board}`, point, () => shot('link-outline'));
  assert.equal(seen.state, 'link'); assert.match(seen.text, /Add link card here/);
  await until(async () => (await refCards(targets.b.board)).length === 1, 'link card not saved');
  const [made] = await refCards(targets.b.board);
  await until(async () => { const box = await worldBox(made.id); return Math.abs(box.x - (at.x - box.w / 2)) < 2 && Math.abs(box.y - at.y) < 2; }, 'link card not at the drop point');
  const again = await drag(`link:from:${targets.b.board}`, await freePoint(0.35, 0.75));
  assert.equal(again.state, 'move'); assert.match(again.text, /existing link card/);
  await until(async () => /already on this canvas/.test(await status()), 'no note that the existing card moved');
  await new Promise(done => setTimeout(done, 2500)); // let any second save land before counting (nothing may be added)
  assert.equal((await refCards(targets.b.board)).length, 1, 'no duplicate link card');
  facts.linkCard = made.id;
});
check('keyboard Add to canvas adds a link card once and shows the existing one after', async () => {
  await search('', 'links');
  const add = row(`link:from:${targets.c.board}`).locator('[data-search-add]');
  assert.equal(await add.innerText(), 'Add to canvas');
  facts.addButton = await add.evaluate(button => ({ className: button.className, background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color }));
  assert.match(facts.addButton.className, /bg-ink text-surface/, 'the standard inverse Button');
  await add.focus(); await page.keyboard.press('Enter');
  await until(async () => (await refCards(targets.c.board)).length === 1, 'Add to canvas did not save one link card');
  await add.focus(); await page.keyboard.press('Enter');
  await until(async () => /already here/.test(await status()), 'no note for an existing link card');
  await new Promise(done => setTimeout(done, 2500));
  assert.equal((await refCards(targets.c.board)).length, 1, 'Add to canvas twice adds one card');
});
// Production defect 2026-10-21 (9f178ce5): a link card made from a backlink result - a canvas this one has no saved link to yet -
// read "Unavailable" until the save completed (links.resolve knew only saved links; Link to canvas... remembered its canvas first).
check('a link card dropped or added from Search shows its canvas title at once, never Unavailable', async () => {
  await search('', 'links');
  const targetsOf = [targets.d.board, targets.e.board];
  await page.evaluate(watched => {
    window.__sawUnavailable = [];
    const look = () => { for (const card of document.querySelectorAll('[data-canvas-ref-card]')) if (watched.includes(card.dataset.target) && /Unavailable/.test(card.textContent)) window.__sawUnavailable.push(card.dataset.target); };
    window.__unavailableWatch = new MutationObserver(look); window.__unavailableWatch.observe(document.body, { subtree: true, childList: true, characterData: true });
  }, targetsOf);
  const card = board => page.locator(`[data-canvas-ref-card][data-target="${board}"]`);
  const titled = (board, title, how) => until(async () => (await card(board).count()) === 1 && (await card(board).innerText()).includes(title), `${how}: the link card did not show "${title}" at once`, 1500);
  await drag(`link:to:${targets.d.board}`, await freePoint(0.35, 0.5));
  await titled(targets.d.board, 'Search backlink D', 'drop');
  const add = row(`link:to:${targets.e.board}`).locator('[data-search-add]');
  await add.focus(); await page.keyboard.press('Enter');
  await titled(targets.e.board, 'Search backlink E', 'Add to canvas');
  const saw = await page.evaluate(() => { window.__unavailableWatch.disconnect(); return window.__sawUnavailable; });
  assert.deepEqual([...new Set(saw)], [], 'a new link card showed Unavailable');
  await shot('backlink-cards-titled');
});
check('a locked card refuses the drop with its reason and stays put', async () => {
  await search('Locked card');
  const before = await worldBox('locked');
  const seen = await drag('object:locked', await freePoint(0.3, 0.3), () => shot('locked-outline'));
  assert.equal(seen.state, 'refuse'); assert.match(seen.text, /locked/);
  await until(async () => /locked/.test(await status()), 'no locked reason in the panel');
  const after = await worldBox('locked'); near(after.x, before.x, 1, 'locked x'); near(after.y, before.y, 1, 'locked y');
  await shot('locked-refused');
});
check('moves and link cards survive a reload', async () => {
  const before = await worldBox('mover');
  await until(async () => { const block = (await board()).state.blocks.find(entry => entry.id === 'mover'); return block.dx !== 0 || block.dy !== 0; }, 'move never saved');
  await go();
  const after = await worldBox('mover'); near(after.x, before.x, 2, 'reload x'); near(after.y, before.y, 2, 'reload y');
  assert.equal(await page.locator(`[data-block-id="${facts.linkCard}"]`).count(), 1, 'the dropped link card is back once');
  assert.equal((await refCards(targets.b.board)).length, 1); assert.equal((await refCards(targets.c.board)).length, 1);
});
check('dark mode keeps code colours through data-code-colors and a readable match', async () => {
  await page.evaluate(() => localStorage.setItem('small.theme', 'dark')); await go();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
  await search('backward', 'code');
  const code = row('object:code');
  await until(async () => await code.locator('[data-search-code] span[style*="--shiki-dark"]').count() > 0, 'shiki colours never applied in dark');
  const dark = await code.locator('[data-search-code] span[style*="--shiki-dark"]').evaluateAll(spans => spans.map(span => ({ want: span.style.getPropertyValue('--shiki-dark').trim(), got: getComputedStyle(span).color })));
  const hex = rgb => '#' + rgb.match(/\d+/g).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
  assert.ok(dark.every(({ want, got }) => hex(got) === want.toLowerCase()), `dark tokens use --shiki-dark: ${JSON.stringify(dark.slice(0, 3))}`);
  assert.equal(await code.locator('[data-search-code] mark').evaluate(mark => getComputedStyle(mark).color), 'rgb(55, 53, 47)');
  await search('');
  await shot('previews-dark');
  await search('', 'links'); await shot('links-dark');
  await page.evaluate(() => localStorage.setItem('small.theme', 'light'));
});
check('a view-only shared canvas refuses a drag with a visible reason', async () => {
  const published = await request(`/api/apps/${canvas.name}/publish`, 'POST', {});
  const viewer = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await guard(viewer);
  const view = await viewer.newPage(); view.on('pageerror', error => errors.push(`viewer: ${error.message}`));
  const previous = page; page = view;
  try {
    await view.goto(`${BASE}/e/${published.publication_token}`); await view.locator('[data-block-id="mover"]').waitFor({ timeout: 60000 });
    await view.locator('[data-search-button]').click(); await panel().waitFor();
    await search('mover card');
    assert.equal(await row('object:mover').locator('[data-search-add]').count(), 0);
    const before = await worldBox('mover');
    const seen = await drag('object:mover', await freePoint(0.3, 0.3), () => shot('view-only-outline'));
    assert.equal(seen.state, 'refuse'); assert.match(seen.text, /view-only/);
    await until(async () => /view-only/.test(await status()), 'no view-only reason in the panel');
    const after = await worldBox('mover'); near(after.x, before.x, 1, 'view-only x'); near(after.y, before.y, 1, 'view-only y');
    await shot('view-only-refused');
  } finally { page = previous; await viewer.close(); }
});
const total = 15;
assert.equal(tests.length, total, 'step count matches const total');

async function guard(target) {
  await target.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== BASE && url.origin !== CP && !['data:', 'blob:'].includes(url.protocol)) return route.abort();
    if (url.pathname === '/api/learn/tutor/next-steps' || url.pathname === '/api/learn/next-steps') return route.fulfill({ json: { set_id: `drag-${run}`, generated_at: new Date().toISOString(), options: [], suggestions: [], fingerprint: null } });
    if (MODEL.test(url.pathname) && route.request().method() !== 'GET') { modelAttempts.push(`${route.request().method()} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
}

try {
  session = await makeSession(`search-drag-${run}@example.com`);
  await request('/api/profile', 'PUT', { handle: `drag_${run}` });
  canvas = await request('/api/canvases', 'POST', { title: `Search drag ${run}` });
  targets = {};
  for (const key of ['a', 'b', 'c']) {
    const made = await request('/api/canvases', 'POST', { title: `Search linked ${key.toUpperCase()}` });
    const put = await request(`/api/learn/boards/${made.name}/main`, 'PUT', { state: empty([card(`t-${key}`, `Target ${key}`, 'target body')]) });
    targets[key] = { name: made.name, board: put.board_id };
  }
  await request(`/api/learn/boards/${targets.a.name}/main/thumbnail/custom`, 'PUT', Buffer.from(PNG, 'base64'), session, true);
  const state = empty([
    { id: 'code', type: 'snippet', title: 'Training step', language: 'python', code: 'model.train()\nloss = criterion(model(x), y)\nloss.backward()\noptimizer.step()\noptimizer.zero_grad()', dx: 0, dy: 0 },
    card('note', 'Gradient notes', 'Backpropagation computes every gradient in one backward pass.'),
    { id: 'pic', type: 'image', title: 'Tiny picture', src: `data:image/png;base64,${PNG}`, alt: 'one pixel', dx: 0, dy: 0 },
    { id: 'clip', type: 'video', title: 'Lecture clip', videoId: 'aaaaaaaaaaa', start: 0, dx: 0, dy: 0 },
    { id: 'linkcard', type: 'canvas-ref', refs: [{ id: randomUUID(), target: targets.a.board }], dx: 0, dy: 0 },
    card('refs', 'Further reading', 'See the linked canvases.', { refs: [{ id: randomUUID(), target: targets.b.board }, { id: randomUUID(), target: targets.c.board }] }),
    card('locked', 'Locked card', 'This card is locked in place.', { locked: true }),
    card('mover', 'mover card', 'Drag me around the canvas.'),
  ]);
  saved = await request(`/api/learn/boards/${canvas.name}/main`, 'PUT', { state });
  // Two canvases that link here (backlinks): this canvas has no saved link to them until a card is added.
  for (const key of ['d', 'e']) {
    const made = await request('/api/canvases', 'POST', { title: `Search backlink ${key.toUpperCase()}` });
    const put = await request(`/api/learn/boards/${made.name}/main`, 'PUT', { state: empty([card(`t-${key}`, `Backlink ${key}`, 'links back', { refs: [{ id: randomUUID(), target: saved.board_id }] })]) });
    targets[key] = { name: made.name, board: put.board_id };
  }
  facts.canvases = { main: canvas.name, ...Object.fromEntries(Object.entries(targets).map(([key, value]) => [key, value.name])) };
  browser = await chromium.launch(); context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await guard(context);
  page = await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(60000);
  page.on('pageerror', error => errors.push(error.message)); await go();
  for (const { name, action } of tests) {
    const began = performance.now();
    try { await action(); results.push({ name, status: 'passed', ms: Math.round(performance.now() - began) }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, status: 'failed', error: error.message, ms: Math.round(performance.now() - began) }); throw error; }
  }
  assert.equal(errors.length, 0, errors.join('\n')); assert.equal(modelAttempts.length, 0, modelAttempts.join('\n'));
} catch (error) {
  facts.error = error.stack; process.exitCode = 1; console.error(`FAIL ${error.message}`);
  if (page) await shot('failure').catch(() => {});
} finally {
  const passed = results.filter(result => result.status === 'passed').length;
  writeFileSync(resolve(OUT, 'results.json'), JSON.stringify({ ...facts, total, passed, results, errors, modelAttempts }, null, 2));
  console.log(`${passed}/${total} passed; model calls: ${modelAttempts.length}`); await browser?.close();
}
