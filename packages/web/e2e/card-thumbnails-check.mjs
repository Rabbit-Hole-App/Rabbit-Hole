// Card thumbnails (docs/features/card-thumbnails.md), against the LOCAL stack only: local D1, fresh browser profiles, the
// keyless workers (start them through the provider tripwire; it must count 0). Nothing here calls a model: the snapshot is
// drawn in the browser. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8888 SMALL_CP=http://127.0.0.1:8889 node e2e/card-thumbnails-check.mjs [shotsDir] [reviewShotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8888';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8889';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('card-thumbnails-check runs against the local stack only');
const SHOTS = process.argv[2] || 'card-thumbnails-shots';
const REVIEW = process.argv[3] || SHOTS; // the Home / Library / Explore set at 1440, 1024 and a phone
for (const dir of [SHOTS, REVIEW]) mkdirSync(dir, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(`thumbs-owner-${run}@example.com`, `thumbs_${run}`) };
const viewer = { session: await sessionFor(`thumbs-viewer-${run}@example.org`, `thumbsv_${run}`) };
const call = async (who, path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...(who ? { cookie: `small_session=${who.session}` } : {}), 'content-type': 'application/json', ...(init.headers || {}) } });
  const type = r.headers.get('content-type') || '';
  return { status: r.status, source: r.headers.get('x-thumbnail-source'), type, body: type.includes('json') ? await r.json() : null };
};

// Four canvases: two drawn from what the browser saves (one seeded in this browser, one on the server), one that gets a
// custom picture, and an empty one that keeps its placeholder.
const blocks = (...cards) => cards.map(([title, body], i) => ({ id: `b${i}`, type: 'explanation', dx: 0, dy: 0, title, body }));
const state = extra => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [], ...extra });
const CANVASES = [
  { title: 'How bread rises', where: 'browser', description: 'Yeast, gluten and heat: the three steps that turn dough into a loaf.',
    state: state({ blocks: blocks(['Why bread rises', 'Yeast ferments sugar into carbon dioxide, which the gluten traps as bubbles.'], ['What kneading does', 'Kneading aligns gluten strands into a stretchy network that holds the gas.'], ['Oven spring', 'Heat expands the trapped gas fast before the crust sets.']) }) },
  { title: 'Refraction at a boundary', where: 'server', description: 'Why a straw looks bent in a glass of water.',
    state: state({ blocks: blocks(['Snell\'s law', 'n1 sin θ1 = n2 sin θ2: light bends toward the normal entering a denser medium.']),
      shapes: [{ id: 's1', kind: 'rect', x1: 700, y1: 40, x2: 980, y2: 200, color: '#2f6fd1', width: 2, opacity: 1, text: 'Water n = 1.33' }, { id: 's2', kind: 'ellipse', x1: 720, y1: 260, x2: 960, y2: 380, color: '#d1662f', width: 2, opacity: 1, text: 'Air n = 1.00' }],
      items: [{ id: 'n1', kind: 'sticky', x: 700, y: 420, text: 'The straw is not bent: the light is.', color: '#37352f', opacity: 1 }] }) },
  { title: 'Gradient descent, step by step', where: 'server', description: 'Follow the slope downhill: the learning rate sets the stride.',
    state: state({ blocks: blocks(['The idea', 'Move the weights a small step against the gradient of the loss.'], ['Learning rate', 'Too large overshoots the minimum; too small crawls.']) }) },
  { title: 'Untitled notes', where: 'none', state: null },
];
const made = [];
for (const c of CANVASES) {
  const row = (await call(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `${c.title}` }) })).body;
  if (c.description) await call(owner, `/api/apps/${row.name}`, { method: 'PATCH', body: JSON.stringify({ description: c.description }) });
  if (c.where === 'server') await call(owner, `/api/learn/boards/${row.name}/main`, { method: 'PUT', body: JSON.stringify({ state: c.state, version: 0 }) });
  made.push({ ...c, name: row.name });
}
const [bread, refraction, gradient, empty] = made;
const catalog = (await call(owner, '/api/apps')).body;
const SEEDS = { [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${bread.name}:ink`]: bread.state };
const own = name => `/api/learn/boards/${name}/main/thumbnail`;

const browser = await chromium.launch();
const errors = [], failedLoads = [], requests = [];
// Never a model: whatever a page asks of one is refused here (the snapshot needs none); the tripwire counts the rest.
const NO_MODEL = /\/api\/(learn\/(ask|home-ask|tutor\/|assess|artifact|board$|voice\/)|ask($|\/))/;
const contextFor = async (who, viewport) => {
  const context = await browser.newContext({ viewport });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.addInitScript(seeds => { for (const [k, v] of Object.entries(seeds)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); }, who === owner ? SEEDS : {});
  await context.route(url => NO_MODEL.test(new URL(url).pathname), route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  // A picture the server has not got answers 204, which a browser does not log; the page's other routes are not this check's.
  page.on('console', message => { const at = message.location()?.url || ''; if (message.type() === 'error' && /Failed to load resource/.test(message.text()) && at.includes('/thumbnail')) failedLoads.push(at); });
  page.on('request', request => requests.push(request.url()));
  return { context, page };
};
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (page, dir, name, full = false) => { await page.waitForTimeout(400); await page.screenshot({ path: `${dir}/${name}.png`, fullPage: full }); console.log('shot', name); };
const box = locator => locator.boundingBox();
// What a picture holds: its size, type, how much of it is not background, and a pixel near its top left corner.
const pixels = (page, url) => page.evaluate(async url => {
  const blob = await (await fetch(url, { cache: 'no-store' })).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), g = canvas.getContext('2d');
  g.drawImage(bitmap, 0, 0);
  const data = g.getImageData(0, 0, bitmap.width, bitmap.height).data;
  let ink = 0, n = 0;
  for (let i = 0; i < data.length; i += 4 * 7, n += 1) if (data[i] < 215 || data[i + 1] < 215 || data[i + 2] < 215) ink += 1;
  return { width: bitmap.width, height: bitmap.height, type: blob.type, size: blob.size, ink: ink / n, corner: [...g.getImageData(12, 12, 1, 1).data].slice(0, 3) };
}, url);

// The picture itself, as a PNG beside the screenshots (WebP does not open everywhere).
const keep = async (page, url, name) => {
  const png = await page.evaluate(async url => {
    const bitmap = await createImageBitmap(await (await fetch(url, { cache: 'no-store' })).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height); canvas.getContext('2d').drawImage(bitmap, 0, 0);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let text = ''; for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  }, url);
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(png, 'base64'));
};

// 1-2: an owned canvas's save draws its picture; a board already on the server with none gets one when it opens.
const desk = await contextFor(owner, { width: 1440, height: 900 });
let page = desk.page;
const openCanvas = async (c) => {
  const put = page.waitForResponse(r => r.url().endsWith(own(c.name)) && r.request().method() === 'PUT', { timeout: 45000 });
  await page.goto(`${BASE}/apps/${c.name}?tab=learn`);
  await page.locator('[data-canvas-surface]').waitFor({ timeout: 60000 });
  const started = Date.now();
  const response = await put;
  return { status: response.status(), after: Date.now() - started };
};
await check('1 a save draws the canvas into its card picture: 800 x 400 WebP, under 1 MB, with the content in it', async () => {
  const saved = page.waitForResponse(r => r.url().endsWith(`/api/learn/boards/${bread.name}/main`) && r.request().method() === 'PUT', { timeout: 45000 });
  const thumb = openCanvas(bread);
  assert.equal((await saved).status(), 200, 'this browser\'s copy went up: a save');
  const { status, after } = await thumb;
  assert.equal(status, 200);
  console.log(`   snapshot PUT ${after} ms after the canvas appeared`);
  const got = await call(owner, own(bread.name));
  assert.deepEqual([got.status, got.source, got.type], [200, 'snapshot', 'image/webp']);
  await keep(page, own(bread.name), 'snapshot-bread');
  const p = await pixels(page, own(bread.name));
  assert.deepEqual([p.width, p.height], [800, 400]);
  assert.ok(p.size < 1024 * 1024 && p.size > 1000, `size ${p.size}`);
  console.log(`   snapshot ${p.size} bytes`);
  assert.ok(p.ink > 0.01, `the cards are in it (ink ${p.ink.toFixed(3)})`);
});
await shot(page, SHOTS, '01-canvas-saved');
await check('2 a board on the server with no picture yet gets one when its owner opens it; an empty canvas gets none', async () => {
  for (const c of [refraction, gradient]) assert.equal((await openCanvas(c)).status, 200, c.title);
  assert.equal((await call(owner, own(refraction.name))).source, 'snapshot');
  await page.goto(`${BASE}/apps/${empty.name}?tab=learn`);
  await page.locator('[data-canvas-surface]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(6000);
  assert.equal((await call(owner, own(empty.name))).status, 204, 'nothing to draw: no picture, no error');
});
await check('3 not on every keystroke: a canvas left open sends no second snapshot without a change', async () => {
  const before = requests.filter(u => u.endsWith(own(gradient.name))).length;
  await page.goto(`${BASE}/apps/${gradient.name}?tab=learn`);
  await page.locator('[data-canvas-surface]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(7000);
  const puts = requests.filter(u => u.endsWith(own(gradient.name))).length - before;
  assert.equal(puts, 1, 'one HEAD (it has one already), no PUT');
});

// 4-6: the Library card: the picture on the right, 2:1, every card the same height; the ⋮ replaces and reverts it.
const libraryCard = title => page.locator('[data-library-card="canvas"]').filter({ has: page.locator('[data-card-title]', { hasText: new RegExp(`^${title}$`) }) });
const library = async () => { await page.goto(`${BASE}/library?type=canvases`); await page.locator('[data-library-card]').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(1200); };
const layout = async (card) => {
  const [c, t, title] = await Promise.all([box(card), box(card.locator('[data-card-thumbnail]')), box(card.locator('[data-card-title]'))]);
  return { c, t, title };
};
await library();
await check('4 the Library card shows its picture on the right, 2:1, about 38% of the card; text on the left', async () => {
  const card = libraryCard(bread.title);
  await card.locator('[data-card-thumbnail="image"]').waitFor({ timeout: 15000 });
  const { c, t, title } = await layout(card);
  assert.ok(Math.abs(t.x + t.width - (c.x + c.width - 17)) <= 2, `flush with the card's right padding (${t.x + t.width} vs ${c.x + c.width})`);
  assert.ok(Math.abs(t.width / t.height - 2) < 0.03, `2:1 (${t.width} x ${t.height})`);
  assert.ok(t.width / c.width > 0.33 && t.width / c.width < 0.4, `${(100 * t.width / c.width).toFixed(1)}% of the card`);
  assert.ok(title.x + title.width <= t.x, 'the title is left of the picture');
  assert.ok(t.width >= 340, `big enough to make out (${t.width}px)`);
  assert.equal(await card.locator('[data-card-thumbnail] img').evaluate(img => img.naturalWidth), 800);
});
await check('5 one card per row and every card the same size; an empty canvas shows the quiet placeholder, no grey box, no error', async () => {
  const cards = page.locator('[data-library-card="canvas"]');
  const boxes = await cards.evaluateAll(els => els.map(el => el.getBoundingClientRect()).map(r => ({ x: r.x, w: r.width, h: r.height })));
  assert.equal(boxes.length, 4);
  assert.ok(boxes.every(b => Math.abs(b.h - boxes[0].h) < 1 && Math.abs(b.x - boxes[0].x) < 1 && Math.abs(b.w - boxes[0].w) < 1), JSON.stringify(boxes));
  const placeholder = libraryCard(empty.title).locator('[data-card-thumbnail]');
  assert.equal(await placeholder.getAttribute('data-card-thumbnail'), 'placeholder');
  assert.equal(await placeholder.locator('svg').count(), 1, 'its type icon on the canvas dot grid');
  assert.deepEqual(failedLoads, [], 'a canvas with no picture answers 204: nothing in the console');
});
await shot(page, SHOTS, '02-library');
const cover = await page.evaluate(() => {
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 900;
  const g = canvas.getContext('2d'), fill = g.createLinearGradient(0, 0, 1200, 900);
  fill.addColorStop(0, '#c62f3a'); fill.addColorStop(1, '#f2a541'); g.fillStyle = fill; g.fillRect(0, 0, 1200, 900);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 6;
  for (let r = 80; r < 700; r += 80) { g.beginPath(); g.ellipse(760, 560, r * 1.4, r, -0.3, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#ffffff'; g.font = 'bold 110px sans-serif'; g.textAlign = 'center'; g.fillText('Downhill', 600, 470);
  return canvas.toDataURL('image/png').split(',')[1];
});
// A portaled menu closes on any scroll (ui.jsx Menu), and a click on a card near the fold can land while the list still
// settles after a scroll: the card is centred first, and the ⋮ pressed again if its menu closed under it.
const menu = async (title) => {
  const card = libraryCard(title);
  await card.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(500);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await card.getByTitle('More').click();
    if (await page.locator('[data-menu-thumbnail]').waitFor({ timeout: 2500 }).then(() => true, () => false)) break;
  }
  await page.locator('[data-menu-thumbnail]').waitFor({ timeout: 1000 }).catch(async error => { await shot(page, SHOTS, 'menu-failed'); throw error; });
  await page.waitForTimeout(400);
};
await check('6 Change thumbnail: a GIF is refused in one line; a PNG is cropped to 2:1 and replaces the snapshot on the card', async () => {
  await menu(gradient.title);
  assert.equal(await page.locator('[data-menu-thumbnail-revert]').count(), 0, 'no picture of yours yet: no Use canvas snapshot');
  await shot(page, SHOTS, '03-menu-change-thumbnail');
  let chooser = page.waitForEvent('filechooser');
  await page.locator('[data-menu-thumbnail]').click();
  await (await chooser).setFiles({ name: 'cover.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await page.getByText('Choose a PNG, JPEG or WebP image.').waitFor({ timeout: 5000 });
  await menu(gradient.title);
  chooser = page.waitForEvent('filechooser');
  const put = page.waitForResponse(r => r.url().endsWith(`${own(gradient.name)}/custom`) && r.request().method() === 'PUT');
  await page.locator('[data-menu-thumbnail]').click();
  await (await chooser).setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(cover, 'base64') });
  assert.equal((await put).status(), 200);
  assert.equal((await call(owner, own(gradient.name))).source, 'custom');
  const img = libraryCard(gradient.title).locator('[data-card-thumbnail="image"] img');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-card-thumbnail] img')].some(i => /\?v=\d+$/.test(i.getAttribute('src')) && i.complete && i.naturalWidth === 800));
  assert.match(await img.getAttribute('src'), /\?v=\d+$/, 'a new address, so the card loads it at once');
  const p = await pixels(page, own(gradient.name));
  assert.deepEqual([p.width, p.height], [800, 400], 'cropped to the card\'s 2:1 from 1200 x 900');
  assert.ok(p.corner[0] > 180 && p.corner[1] < 90, `the picture, not the snapshot (corner ${p.corner})`);
});
await shot(page, SHOTS, '04-library-custom');
await check('7 Use canvas snapshot goes back to the automatic picture', async () => {
  await menu(gradient.title);
  const del = page.waitForResponse(r => r.url().endsWith(`${own(gradient.name)}/custom`) && r.request().method() === 'DELETE');
  await page.locator('[data-menu-thumbnail-revert]').click();
  assert.equal((await del).status(), 200);
  assert.equal((await call(owner, own(gradient.name))).source, 'snapshot');
  const p = await pixels(page, own(gradient.name));
  assert.ok(!(p.corner[0] > 180 && p.corner[1] < 90), `no longer the red cover (corner ${p.corner})`);
  // The custom picture again, for Explore below.
  await menu(gradient.title);
  const chooser = page.waitForEvent('filechooser');
  const put = page.waitForResponse(r => r.url().endsWith(`${own(gradient.name)}/custom`) && r.request().method() === 'PUT');
  await page.locator('[data-menu-thumbnail]').click();
  await (await chooser).setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(cover, 'base64') });
  assert.equal((await put).status(), 200);
});

// 8-9: privacy. Another signed-in person, and nobody signed in, never get a private or unlisted canvas's picture.
let tokens = {};
await check('8 a signed-in other person cannot fetch a private or unlisted canvas\'s picture (404), nor write one', async () => {
  for (const who of [viewer, null]) assert.ok([401, 403, 404].includes((await call(who, own(bread.name))).status), who ? 'viewer' : 'signed out');
  assert.equal((await call(viewer, own(bread.name))).status, 404);
  assert.equal((await call(viewer, own(bread.name), { method: 'PUT', body: 'x' })).status, 404);
  const view = (await call(owner, `/api/learn/boards/${refraction.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true }) })).body.sharing.view;
  assert.equal((await call(viewer, `/api/learn/boards/published/${view}/thumbnail`)).status, 404, 'an unlisted link is not Explore');
  assert.equal((await call(viewer, `/api/learn/boards/shared/${view}`)).status, 200, 'while the link itself opens');
});
await check('9 a published canvas\'s picture shows on Explore, to anyone; unpublished, it is gone', async () => {
  for (const c of [bread, gradient, refraction]) tokens[c.name] = (await call(owner, `/api/apps/${c.name}/publish`, { method: 'POST' })).body.publication_token;
  assert.ok(Object.values(tokens).every(Boolean));
  assert.equal((await call(null, `/api/learn/boards/published/${tokens[bread.name]}/thumbnail`)).status, 200, 'signed out too');
  assert.equal((await call(viewer, `/api/learn/boards/published/${tokens[gradient.name]}/thumbnail`)).source, 'custom', 'the owner\'s picture wins there too');
});
const other = await contextFor(viewer, { width: 1440, height: 900 });
await check('10 Explore: the other person sees the published pictures on the right of each card, by token, never a name or an email', async () => {
  await other.page.goto(`${BASE}/explore`);
  await other.page.locator('[data-explore-card]').first().waitFor({ timeout: 60000 });
  // This run's cards: an earlier run on the same local D1 published the same titles under its own @handle.
  const mine = other.page.locator('[data-explore-card]').filter({ hasText: `@thumbs_${run}` });
  const card = mine.filter({ has: other.page.locator('[data-card-title]', { hasText: bread.title }) });
  await card.locator('[data-card-thumbnail="image"]').waitFor({ timeout: 15000 });
  const { c, t } = await layout(card);
  assert.ok(Math.abs(t.x + t.width - (c.x + c.width - 17)) <= 2 && Math.abs(t.width / t.height - 2) < 0.03);
  const srcs = await mine.locator('[data-card-thumbnail] img').evaluateAll(imgs => imgs.map(i => i.getAttribute('src')));
  assert.equal(srcs.length, 3);
  assert.ok(srcs.every(s => /^\/api\/learn\/boards\/published\/[A-Za-z0-9_-]{20,64}\/thumbnail$/.test(s) && !s.includes('@') && !s.includes('canvas-')), srcs.join(' '));
  const heights = await other.page.locator('[data-explore-card]').evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().height)));
  assert.ok(heights.every(h => h === heights[0]), `one size with actions too: ${heights}`);
});
await shot(other.page, SHOTS, '05-explore-viewer');
await check('11 removed from Explore: the picture is gone for others at once; still the owner\'s', async () => {
  await call(owner, `/api/apps/${refraction.name}/unpublish`, { method: 'POST' });
  assert.equal((await call(viewer, `/api/learn/boards/published/${tokens[refraction.name]}/thumbnail`)).status, 404);
  assert.equal((await call(owner, own(refraction.name))).status, 200);
});

// 12: a phone: the picture above the text, full width, the same 2:1; every card one size.
await check('12 a phone: the picture above the text at full width, 2:1, every card one size', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await library();
  const { c, t, title } = await layout(libraryCard(bread.title));
  assert.ok(t.y + t.height <= title.y, 'above the title');
  assert.ok(Math.abs(t.width - (c.width - 34)) <= 2, `full width (${t.width} of ${c.width})`);
  assert.ok(Math.abs(t.width / t.height - 2) < 0.03);
  const heights = await page.locator('[data-library-card="canvas"]').evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().height)));
  assert.ok(heights.every(h => h === heights[0]), `${heights}`);
});

// The review set: Home, Library, Explore at 1440, 1024 and a phone.
for (const [label, viewport] of [['1440', { width: 1440, height: 900 }], ['1024', { width: 1024, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/apps`); await page.locator('[data-recent-card]').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(1500);
  await shot(page, REVIEW, `thumbs-home-${label}`);
  await library(); await page.waitForTimeout(800);
  await shot(page, REVIEW, `thumbs-library-${label}`);
  await other.page.setViewportSize(viewport);
  await other.page.goto(`${BASE}/explore`); await other.page.locator('[data-explore-card]').first().waitFor({ timeout: 60000 }); await other.page.waitForTimeout(1500);
  await shot(other.page, REVIEW, `thumbs-explore-${label}`);
}

const tripwire = await Promise.all([BASE, CP].map(async origin => { const r = await fetch(`${origin}/__provider-tripwire`).catch(() => null); return r?.ok ? (await r.json()).hits.length : 'off'; }));
await check('13 no page errors, no failed picture loads, the provider tripwire at 0 (the snapshot asks no model)', async () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(failedLoads, []);
  // The canvas page's own model routes (the Next Steps hook planner on open) were refused in the page, never sent.
  console.log(`   model routes refused in the page: ${requests.filter(u => NO_MODEL.test(new URL(u).pathname)).length}; provider tripwire: ${tripwire.join(', ')}`);
  assert.deepEqual(tripwire, [0, 0]);
});
await browser.close();
const total = 13;
console.log(results.length === total ? 'PASS' : 'FAIL', `${results.length}/${total} checks passed`);
process.exit(results.length === total ? 0 : 1);
