// Curious where this goes? - owner task 2 (docs/features/professor-next-steps.md 2.8), owner verification point 6, in a real
// browser against the LOCAL keyless stack only: the hook planner answers from its fixtures (JOURNEY_MODEL_STUB=fixtures), every
// other model route the page could reach is refused here, and the stack's provider tripwire must count no provider request.
// It records every hook request (payload size, latency, status) and what reached the planner. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8891 SMALL_CP=http://127.0.0.1:8892 VARS=<stack cp .dev.vars> node e2e/curious-context-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8891';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8892';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('curious-context-check runs against the local stack only');
const OUT = process.argv[2] || 'curious-context-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const owner = { session: (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `curious-${run}@example.com`, secret }) })).json()).session };
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${owner.session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const canvasWith = async (title, { shapes = [], items = [], links = [] } = {}) => {
  const made = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).body;
  const state = { strokes: [], shapes, items, links, groups: [], areas: [], blocks: [], exchanges: [] };
  assert.equal((await api(`/api/learn/boards/${made.name}/main`, { method: 'PUT', body: JSON.stringify({ state, version: 0 }) })).status, 200);
  return made.name;
};
const tripwire = async origin => { const r = await fetch(`${origin}/__provider-tripwire`); if (!(r.headers.get('content-type') || '').includes('json')) throw Error(`${origin} runs without the provider tripwire`); return (await r.json()).hits.length; };
const providerBefore = await tripwire(BASE) + await tripwire(CP);

// The reported case: titled Linked List, a binary search tree drawn and written, no lesson card.
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1 };
const node = (id, x, y, text) => ({ id, kind: 'ellipse', x1: x, y1: y, x2: x + 64, y2: y + 64, ...style, text });
const link = (id, from, to, label) => ({ id, from, fromSide: 'bottom', to, toSide: 'top', route: 'straight', head: true, label, color: '#37352f', width: 2, dash: 'solid' });
const TREE = await canvasWith('Linked List', {
  shapes: [node('n8', 320, 120, '8'), node('n3', 180, 280, '3'), node('n10', 460, 280, '10'), node('n1', 80, 400, '1')],
  items: [{ id: 't1', kind: 'text', x: 640, y: 140, w: 320, text: 'Binary search tree: smaller keys go left, larger keys go right', color: '#37352f', opacity: 1, level: 'body' }],
  links: [link('l1', 'n8', 'n3', 'left'), link('l2', 'n8', 'n10', 'right')],
});

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
const refused = [];
await context.route(/\/api\/(learn\/(ask|home-ask|artifact|tts|voice\/|assess|transcribe|image|video|scene|grade|tutor\/(evaluate|plan|handoff))|chat)/, route => { const body = route.request().postDataJSON?.() ?? null; refused.push(`${new URL(route.request().url()).pathname} ${body?.context?.learner_intent?.kind ?? ''}`.trim()); return route.abort(); });
// Hook requests: every one recorded; while `hold` is set, a request is held until released (a reply arriving late).
const calls = [], held = [];
let hold = false;
await context.route('**/api/learn/tutor/next-steps', async route => {
  const call = { at: Date.now(), size: route.request().postData().length, body: route.request().postDataJSON() };
  calls.push(call);
  if (hold) { held.push({ route, call }); return; }
  const response = await route.fetch();
  call.status = response.status(); call.ms = Date.now() - call.at; call.reply = await response.json().catch(() => null);
  return route.fulfill({ response, json: call.reply });
});
const release = async () => {
  for (const { route, call } of held.splice(0)) {
    const response = await route.fetch();
    call.status = response.status(); call.ms = Date.now() - call.at; call.reply = await response.json().catch(() => null); call.held = true;
    await route.fulfill({ response, json: call.reply });
  }
};
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const results = [];
const check = async (label, fn) => {
  try { const detail = await fn(); results.push({ label, ok: true }); console.log(`✓ ${label}${detail ? ` - ${detail}` : ''}`); }
  catch (error) { results.push({ label, ok: false, error: error.message }); console.log(`✗ ${label} - ${error.message.split('\n')[0]}`); }
};
const shot = async name => { await page.screenshot({ path: `${OUT}/${name}.png` }); };
const hooks = () => page.locator('[data-next-steps="ready"] [data-next-step]').allInnerTexts();
const ready = () => page.locator('[data-next-steps="ready"]').waitFor({ timeout: 60000 });
const quiet = ms => page.waitForTimeout(ms);
const until = async (test, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await test()) return true; await quiet(100); } throw Error('timed out'); };
const centre = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
const texts = body => (body?.input?.canvas?.objects || []).map(o => o.text);
const typeInto = async (locator, text) => {
  await locator.dblclick();
  await page.locator('[data-rich-editor]').first().waitFor({ timeout: 5000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text, { delay: 40 });
};

await page.goto(`${BASE}/apps/${TREE}`);
await page.locator('[data-shape-id="n8"]').waitFor({ timeout: 60000 });
await ready();

await check('1 the title stays background; the drawn tree reaches the planner', async () => {
  const { body } = calls.at(-1);
  assert.equal(body.input.mode, 'canvas');
  assert.equal(body.input.goal, '');
  assert.equal(body.input.canvas.title, 'Linked List');
  assert.deepEqual(body.input.canvas.blocks, []);
  assert.ok(texts(body).includes('Binary search tree: smaller keys go left, larger keys go right'));
  for (const label of ['8', '3', '10', '1']) assert.ok(texts(body).includes(label), `label ${label}`);
  const rel = body.input.canvas.relations.map(r => `${r.from}>${r.to}:${r.label}:${r.source}`).sort();
  assert.deepEqual(rel, ['n8>n10:right:connector', 'n8>n3:left:connector']);
  assert.match(body.input.canvas.fingerprint, /\S/);
  const shown = await hooks();
  assert.equal(shown.length, 3);
  assert.ok(shown.every(h => !/linked list/i.test(h)), `hooks never come from the title: ${shown.join(' | ')}`);
  assert.equal((await api(`/api/apps/${TREE}`)).body?.title ?? 'Linked List', 'Linked List', 'the canvas is never renamed');
  return `${calls.length} request(s), payload ${calls.at(-1).size} chars, hooks: ${shown.join(' | ')}`;
});
await shot('01-linked-list-tree');

await check('2 pan, zoom, hover, select and moving an unchanged object ask nothing', async () => {
  await quiet(1500);
  const before = calls.length;
  const surface = await page.locator('[data-canvas-surface]').boundingBox();
  await page.locator('[data-shape-id="n10"]').hover();
  const n1 = await centre(page.locator('[data-shape-id="n1"]'));
  await page.mouse.click(n1.x, n1.y);
  await page.mouse.move(n1.x, n1.y); await page.mouse.down(); await page.mouse.move(n1.x + 50, n1.y + 10, { steps: 8 }); await page.mouse.up();
  // Empty canvas at the top right: the hook card sits at the bottom right, and a click there would pick a hook.
  await page.mouse.move(surface.x + surface.width - 120, surface.y + 80);
  await page.mouse.wheel(0, 200);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control');
  await page.mouse.click(surface.x + surface.width - 100, surface.y + 60);
  await quiet(3000);
  assert.equal(calls.length, before, `${calls.length - before} new request(s)`);
  assert.equal(await page.locator('[data-next-steps="ready"]').count(), 1, 'the set stays ready');
  return 'no request in 3 s after hover, select, a move, pan and zoom';
});
await page.getByTitle('Reset zoom').click().catch(() => {});

let editStart;
await check('3 a same-id text edit: stale at once while typing, then one request with the new words', async () => {
  const before = calls.length, ids = calls.at(-1).body.input.canvas.objects.map(o => o.id).sort();
  await typeInto(page.locator('[data-item-id="t1"]'), 'AVL tree: rotations keep both sides balanced');
  await page.locator('[data-next-steps="stale"]').waitFor({ timeout: 3000 });
  const staleWhileTyping = await page.locator('[data-next-steps="stale"] [data-next-step]').count();
  await page.keyboard.press('Escape');
  editStart = Date.now();
  await until(() => calls.length > before && calls.at(-1).status);
  await ready();
  const settled = Date.now() - editStart;
  await quiet(2500);
  assert.equal(calls.length, before + 1, 'one request for the whole burst of typing');
  const { body } = calls.at(-1);
  assert.ok(texts(body).includes('AVL tree: rotations keep both sides balanced'));
  assert.deepEqual(body.input.canvas.objects.map(o => o.id).sort(), ids, 'the same ids and count');
  assert.equal(staleWhileTyping, 0, 'no stale hook is clickable while typing');
  return `stale while typing; new set ${settled} ms after the edit closed; hooks: ${(await hooks()).join(' | ')}`;
});
await shot('03-after-text-edit');

await check('4 a new connector relation reaches the request', async () => {
  const before = calls.length;
  await page.locator('[data-shape-id="n3"]').hover();
  const from = await centre(page.locator('[data-port="bottom"][data-owner="n3"]'));
  await page.locator('[data-shape-id="n1"]').hover();
  const to = await centre(page.locator('[data-port="top"][data-owner="n1"]'));
  await page.locator('[data-shape-id="n3"]').hover();
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x - 20, to.y - 20, { steps: 10 }); await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up();
  await until(() => calls.length > before && calls.at(-1).status);
  await ready();
  const rel = calls.at(-1).body.input.canvas.relations.map(r => `${r.from}>${r.to}:${r.source}`);
  assert.ok(rel.includes('n3>n1:connector'), rel.join(', '));
  return rel.join(', ');
});

await check('5 a topic change while a request runs: the old reply never shows as current', async () => {
  await quiet(1500);
  hold = true;
  const before = calls.length;
  await typeInto(page.locator('[data-shape-id="n1"]'), 'one');
  await page.keyboard.press('Escape');
  await until(() => held.length === 1);
  const old = held[0].call;
  hold = false;
  await typeInto(page.locator('[data-item-id="t1"]'), 'Heap: every parent is at least as large as its children');
  await page.keyboard.press('Escape');
  await quiet(2500);
  assert.equal(calls.length, before + 1, 'one request in flight: the new one waits');
  await release();
  const oldHooks = (old.reply?.options || []).map(o => o.hook);
  let shownOld = false;
  const end = Date.now() + 4000;
  while (Date.now() < end) { const now = await hooks(); if (now.length && now.join('|') === oldHooks.join('|')) shownOld = true; await quiet(50); }
  await until(() => calls.length === before + 2 && calls.at(-1).status);
  await ready();
  const final = await hooks();
  assert.equal(shownOld, false, 'the late reply was never on screen as ready');
  assert.deepEqual(final, calls.at(-1).reply.options.map(o => o.hook));
  assert.notDeepEqual(final, oldHooks);
  assert.ok(texts(calls.at(-1).body).includes('Heap: every parent is at least as large as its children'));
  return `late reply hooks ${oldHooks[0]} ...; shown ${final[0]} ...`;
});
await shot('05-after-topic-change');

await check('6 Refresh: a fresh set, one request for repeated activation, its own refresh id', async () => {
  await quiet(1500);
  const before = calls.length, was = await hooks();
  const button = page.locator('[data-next-steps-refresh]');
  await button.click(); await button.click({ force: true }).catch(() => {}); await button.dblclick({ force: true }).catch(() => {});
  await until(() => calls.length > before && calls.at(-1).status);
  await page.waitForFunction(() => !document.querySelector('[data-next-steps-refresh-state="loading"]'));
  await quiet(2000);
  assert.equal(calls.length, before + 1, `${calls.length - before} requests`);
  assert.equal(calls.at(-1).body.refresh, 'r1');
  const now = await hooks();
  assert.notDeepEqual(now, was, 'a fresh set');
  const latency = calls.at(-1).ms;
  await button.click();
  await until(() => calls.length === before + 2 && calls.at(-1).status);
  assert.equal(calls.at(-1).body.refresh, 'r2');
  return `refresh latency ${latency} ms; ${was[0]} -> ${now[0]}`;
});
await shot('06-after-refresh');

await check('7 a blank canvas: no content, no title, no goal; a titled blank canvas grounds on its title', async () => {
  const blank = await canvasWith('Untitled canvas');
  let before = calls.length;
  await page.goto(`${BASE}/apps/${blank}`);
  await until(() => calls.length > before && calls.at(-1).status);
  await ready();
  const empty = calls.at(-1).body.input;
  assert.deepEqual([empty.goal, empty.canvas.title, empty.canvas.objects, empty.canvas.blocks], ['', undefined, [], []]);
  await shot('07a-blank');
  const tides = await canvasWith('Tide pools');
  before = calls.length;
  await page.goto(`${BASE}/apps/${tides}`);
  await until(() => calls.length > before && calls.at(-1).status);
  await ready();
  assert.equal(calls.at(-1).body.input.canvas.title, 'Tide pools');
  const shown = await hooks();
  assert.ok(shown.every(h => /Tide pools/.test(h)), shown.join(' | '));
  await shot('07b-titled-blank');
  return shown.join(' | ');
});

await check('8 a second, non-computing subject under an unrelated title', async () => {
  const water = await canvasWith('Weekend plans', {
    shapes: [{ id: 'w1', kind: 'rect', x1: 120, y1: 140, x2: 260, y2: 200, ...style, text: 'Ocean' }, { id: 'w2', kind: 'ellipse', x1: 420, y1: 120, x2: 560, y2: 200, ...style, text: 'Clouds' }, { id: 'w3', kind: 'rect', x1: 420, y1: 360, x2: 560, y2: 420, ...style, text: 'Rain' }],
    items: [{ id: 'w4', kind: 'text', x: 120, y: 420, w: 260, text: 'The water cycle: the sun lifts water, the air carries it back', color: '#37352f', opacity: 1, level: 'body' }],
    links: [link('e1', 'w1', 'w2', 'evaporation'), link('e2', 'w2', 'w3', 'condensation'), link('e3', 'w3', 'w1', 'runoff')],
  });
  const before = calls.length;
  await page.goto(`${BASE}/apps/${water}`);
  await until(() => calls.length > before && calls.at(-1).status);
  await ready();
  const { input } = calls.at(-1).body;
  assert.deepEqual([input.goal, input.canvas.title], ['', 'Weekend plans']);
  assert.ok(['Ocean', 'Clouds', 'Rain'].every(t => texts({ input }).includes(t)));
  assert.deepEqual(input.canvas.relations.map(r => r.label).sort(), ['condensation', 'evaporation', 'runoff']);
  const shown = await hooks();
  assert.ok(shown.every(h => !/weekend/i.test(h)), shown.join(' | '));
  await shot('08-water-cycle');
  return shown.join(' | ');
});

await check('9 no provider request, no other model route, no page error', async () => {
  assert.equal(await tripwire(BASE) + await tripwire(CP), providerBefore);
  assert.deepEqual(refused, []);
  assert.deepEqual(errors, []);
});

const sizes = calls.map(c => c.size), ms = calls.filter(c => c.ms).map(c => c.ms);
const summary = { requests: calls.length, payload_chars: { min: Math.min(...sizes), max: Math.max(...sizes) }, latency_ms: { min: Math.min(...ms), max: Math.max(...ms) } };
writeFileSync(`${OUT}/curious-context-results.json`, JSON.stringify({ results, summary, calls: calls.map(({ body, reply, ...c }) => ({ ...c, refresh: body.refresh ?? null, fingerprint: body.input.canvas.fingerprint ?? null, objects: (body.input.canvas.objects || []).length, relations: (body.input.canvas.relations || []).length, hooks: (reply?.options || []).map(o => o.hook), error: reply?.error ?? null, ...(reply?.error ? { input: body.input } : {}) })) }, null, 2));
console.log(JSON.stringify(summary));
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
