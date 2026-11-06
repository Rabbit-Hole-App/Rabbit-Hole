// The table of contents' 120-heading limit (owner decision, Release A3 item 1; C:/s/spec/rel-a.md B1). Against the LOCAL stack
// only. No model is ever called: /api/learn/ask is answered here with canned SSE and its request bodies are captured; every
// other model-capable route is aborted and counted. What the server does with a body is the control plane's unit tests
// (chat-modes, learn-chat); this check proves what the page sends and what it applies.
// 1 the largest syllabus (12 topics x 6 subtopics: 84 headings) adopts into empty contents in one Apply, and the next chat
// turn sends all 84 with outlineRevision; 2 adopting another 84 is refused whole on the syllabus card with how many more fit
// (36), nothing proposed or applied; 3 a syllabus that fits the room left (36 headings) adopts into the existing contents,
// existing headings kept, and a chat turn sends all 120; 4 a 121st heading added by hand in the panel lands (manual editing is
// never capped), and the next chat turn sends outlineOmitted { count: 121 } with no outline and no outlineRevision, and still
// answers; 5 at 121 entries the panel lists every entry, and pressing one with no canvas heading moves and marks nothing
// (owner brief 2026-10-23); 6 no model route was reached and the page raised no error.
// The contents are read from the canvas's saved board (localStorage), so the check does not depend on the panel's markup:
// owner brief 2026-10-23, the board's own `toc` list once edited, else its headings; no step adds a canvas heading.
// Prints `ok <label>` per check, counts and ids only (no cookies, no secrets); exits 1 on any failure.
// Usage: BASE=http://127.0.0.1:8931 SMALL_CP=http://127.0.0.1:8933 VARS=<cp .dev.vars> OUT=<dir> node e2e/toc-cap-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { outlineRevision } from '../src/learn-outline-model.js';
import { mockChatRoute } from './dev-cp.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8933';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('toc-cap-check runs against the local stack only');
const OUT = process.env.OUT || 'C:/s/toc-tcap/ev';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || 'C:/s/toc-tcap/.dev.vars', 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `tcap-${Date.now().toString(36)}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'A long course' }) });
const inkKey = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
// One card and no headings: the contents start empty.
const seed = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'k1', type: 'explanation', dx: 0, dy: 0, title: 'Course notes', body: 'Where the course starts.' }] };

// A validated syllabus: `topics` topics of 1 + `subtopics` headings, titled under `name` so two syllabi never match.
const syllabus = (name, topics, subtopics) => ({ journeyId: null, goal: `${name} course`, topics: Array.from({ length: topics }, (_, i) => ({
  id: `${name}${i + 1}`, title: `${name} ${i + 1}`, objectives: ['o'], refs: [],
  subtopics: Array.from({ length: subtopics }, (_, j) => ({ id: `${name}${i + 1}.${j + 1}`, title: `${name} ${i + 1}.${j + 1}` })),
})) });

// ---------------------------------------------------------------- routes: capture and canned answers
const captured = [], refused = [], outside = [], errors = [];
const next = [];   // what the next /api/learn/ask answers: { syllabus } or {}
let replies = 0;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.fallback();
  const path = url.pathname;
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = String(100 + reply), plan = next.shift() || {};
    captured.push({ body, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Canned reply ${reply}.` })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: plan.syllabus ? 'syllabus' : 'clarify', syllabus: plan.syllabus || null })
      + frame('done', { ok: true, threadId: body.thread_id || 'tcap-thread-1', userMessageId: `u-${reply}`, messageId }) });
  }
  if (/^\/api\/learn\/chat\/(threads|messages)\//.test(path)) return route.fulfill({ json: { ok: true } });
  // The Curious hook: the stack answers it from fixtures (JOURNEY_MODEL_STUB), never a model.
  if (path === '/api/learn/tutor/next-steps') return route.fallback();
  if (MODEL.test(path)) { refused.push(`${request.method()} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, value]) => { if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, [inkKey, seed]);
await context.route('**/*', router);
// CR-1: a Chat line (any mode) asks POST /api/learn/chat/route first; a contract-valid answer decision (dev-cp.mjs), registered last so it wins. CI has no JEV key.
await mockChatRoute(context);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 300);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}`);
    await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const waitFor = async (test, ms = 10000) => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error('timed out'); await page.waitForTimeout(100); } };

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator('[data-block-id="k1"]').waitFor({ timeout: 60000 });
await page.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });

const pane = () => page.locator('[data-chat-pane]');
// The Table of contents tab's name also says how many proposals wait for review (PanelHeader tocPending, R4).
const tab = name => page.getByRole('tab', { name: name === 'Table of contents' ? /^Table of contents(, \d+ proposals? to review)?$/ : name, exact: name !== 'Table of contents' });
const contents = () => page.getByRole('tabpanel', { name: 'Table of contents' });
const apply = () => contents().getByRole('button', { name: 'Apply', exact: true });
const headings = () => page.evaluate(key => { const s = JSON.parse(localStorage.getItem(key) || '{}'); return (Array.isArray(s.toc) ? s.toc : (s.blocks || []).filter(b => b.type === 'heading')); }, inkKey)
  .then(list => list.map(b => ({ id: b.id, level: b.level, text: b.text })));
// Owner brief 2026-10-23: the canvas objects as saved, which no Table of contents action creates or changes.
const canvasBlocks = () => page.evaluate(key => (JSON.parse(localStorage.getItem(key) || '{}').blocks || []).map(b => [b.id, b.type, b.title, b.body]), inkKey);
const seeded = seed.blocks.map(b => [b.id, b.type, b.title, b.body]);
const setMode = async mode => {
  if (await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode') === mode) return;
  await pane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.locator(`[data-chat-mode-option="${mode}"]`).click();
  await waitFor(async () => await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode') === mode);
};
// Owner decision 1a (2026-10-20, Tutor workflow): syllabus building moved from Chat's Tutor mode (now the teaching Tutor) to the
// Table of contents conversation, so a 'tutor' turn here is the TOC conversation's (its held Tutor, /api/learn/ask mode tutor)
// and an 'ask' turn is Chat's. A syllabus there that fits applies at once (no Apply card); one that cannot is refused on its card.
const tocBox = () => contents().locator('[data-toc-conversation], [data-toc-ask]');
async function turn(text, plan = {}, mode = 'tutor') {
  const where = mode === 'tutor' ? tocBox : pane;
  if (mode === 'tutor') {
    await tab('Table of contents').click();
    await contents().locator('[data-toc-start] button, [data-toc-composer]').first().waitFor({ timeout: 10000 });
    if (await contents().locator('[data-toc-start] button').count()) await contents().locator('[data-toc-start] button').click();
  } else {
    await tab('Chat').click();
    await setMode(mode);
  }
  next.push(plan);
  const n = captured.length;
  const composer = mode === 'tutor' ? '[data-toc-composer]' : '[data-chat-composer]';
  await where().locator(`${composer} textarea`).first().fill(text);
  await where().locator(`${composer} button[aria-label="Send"]`).click();
  await waitFor(() => captured.length > n, 20000);
  await where().getByText(`Canned reply ${captured[n].reply}.`, { exact: true }).first().waitFor({ timeout: 15000 });
  await where().locator(`${composer} button[aria-label="Send"]`).waitFor({ timeout: 10000 });
  return captured[n].body;
}
// Plans `plan` as a Tutor syllabus in the TOC conversation and presses its Use as table of contents; answers the card's status line.
async function useAsContents(text, plan) {
  await turn(text, { syllabus: plan });
  const card = tocBox().locator('[data-syllabus]').last();
  await card.locator('[data-syllabus-contents]').click();
  return card.locator('[data-syllabus-contents-status]').innerText();
}
const sentWhole = (body, list) => {
  assert.equal(body.outlineOmitted, undefined);
  assert.deepEqual(body.outline.map(e => e.id), list.map(h => h.id));
  assert.equal(body.outlineRevision, outlineRevision(body.outline), 'the revision of exactly the headings sent');
};

let after84 = [];
await check('1 the largest syllabus (84 headings) adopts into empty contents at once from the TOC conversation; the next chat turn sends all 84', async () => {
  assert.match(await useAsContents('plan a long course', syllabus('Unit', 12, 6)), /Proposed in Table of contents/);
  after84 = await waitFor(async () => { const h = await headings(); return h.length === 84 && h; }, 15000);
  sentWhole(await turn('how do the last two units connect?', {}, 'ask'), after84);
});

await check('2 adopting another 84 is refused whole on the card with how many more fit (36); nothing proposed or applied', async () => {
  const status = await useAsContents('plan a second long course', syllabus('Extra', 12, 6));
  assert.equal(status, 'This proposal cannot be applied: it adds 84 headings to 84, and the contents hold at most 120: 36 more fit. Nothing was changed.');
  await tocBox().locator('[data-syllabus]').last().screenshot({ path: `${OUT}/2-refused.png` });
  await tab('Table of contents').click();
  assert.equal(await apply().count(), 0, 'no proposal waits in the panel');
  assert.deepEqual(await headings(), after84, 'the existing contents are untouched');
});

let after120 = [];
await check('3 a syllabus that fits the room left (36 headings) adopts into the existing contents; a chat turn sends all 120', async () => {
  assert.match(await useAsContents('plan the last six units', syllabus('Last', 6, 5)), /Proposed in Table of contents/);
  after120 = await waitFor(async () => { const h = await headings(); return h.length === 120 && h; }, 15000);
  assert.deepEqual(after120.slice(0, 84), after84, 'existing headings kept, in order, with their ids');
  sentWhole(await turn('what is left to study?', {}, 'ask'), after120);
});

let after121 = [];
await check('4 a 121st heading added by hand lands; the next chat turn sends outlineOmitted { count: 121 } instead of the headings, and answers', async () => {
  await tab('Table of contents').click();
  await contents().getByRole('button', { name: 'Add a section', exact: true }).click();
  await contents().getByRole('textbox', { name: 'New section title', exact: true }).fill('My own notes');
  await page.keyboard.press('Enter');
  after121 = await waitFor(async () => { const h = await headings(); return h.length === 121 && h; });
  assert.equal(after121.at(-1).text, 'My own notes');
  assert.deepEqual(await canvasBlocks(), seeded, 'owner brief 2026-10-23: 121 contents entries and the canvas still holds only its card');
  for (const mode of ['ask', 'tutor']) {
    const body = await turn(mode === 'tutor' ? 'add a section on revision' : 'what is attention?', {}, mode);
    assert.deepEqual(body.outlineOmitted, { count: 121 }, mode);
    assert.equal('outline' in body, false, `${mode}: no outline`);
    assert.equal('outlineRevision' in body, false, `${mode}: no outlineRevision`);
  }
  await tab('Chat').click();
  await pane().screenshot({ path: `${OUT}/4-chat-at-121.png` });
});

// Owner brief 2026-10-23 replaces "a section pressed is framed and marked active": these entries live in the contents only,
// so there is no canvas heading to frame; pressing one leaves the camera where it is and marks nothing.
await check('5 at 121 entries the panel still lists every entry; pressing one with no canvas heading moves nothing and marks nothing', async () => {
  await tab('Table of contents').click();
  assert.equal(await contents().locator('[data-toc-entry]').count(), 121);
  const target = after121[90];
  const camera = () => page.evaluate(() => document.querySelector('[data-canvas-surface] div[style*="scale("]')?.style.transform || '');
  const before = await camera();
  await contents().locator(`[data-toc-entry="${target.id}"] button[title="Double-click to edit"]`).first().click();
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))); // a frame would have started its move
  assert.equal(await camera(), before, 'no canvas heading, so nothing to frame');
  assert.equal(await contents().locator('[data-toc-entry][data-active]').count(), 0, 'no entry is marked active');
  assert.deepEqual(await canvasBlocks(), seeded, 'the canvas still holds only its card');
  await contents().screenshot({ path: `${OUT}/5-panel-at-121.png` });
});

await check('6 no model route was reached and the page raised no error', async () => {
  assert.deepEqual(refused, [], refused.join(', '));
  assert.deepEqual(outside, [], outside.join(', '));
  assert.deepEqual(errors, [], errors.join(' | '));
});

writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, asks: captured.length }, null, 2));
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
