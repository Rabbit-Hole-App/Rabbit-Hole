// Tutor and the table of contents (R4, Tutor lane: owner decisions 4A and 5B, contract C4, C6, C8, C9). Against the LOCAL stack
// only. No model is ever called: /api/learn/ask is answered here with canned SSE and its request bodies are captured; every
// other model-capable route is aborted and counted.
// 1 a Tutor syllabus with descriptions and subtopics renders in Chat; 2 Use as table of contents proposes it to the page's
// Apply/Discard flow, and Apply makes the headings (descriptions kept, nothing completed); 3 pressing it again proposes nothing;
// 4 a Tutor turn sends the current headings with ids, descriptions and outlineRevision, and its outline event { ops, base }
// becomes a proposal whose Apply adds the subtopic at the end of its topic, completion untouched; 5 an ordinary Tutor question
// proposes nothing.
// The headings are read from the canvas's saved blocks (localStorage), so the check does not depend on the panel's markup.
// Prints `ok <label>` per check, counts and ids only (no cookies, no secrets); exits 1 on any failure.
// Usage: BASE=http://127.0.0.1:8911 SMALL_CP=http://127.0.0.1:8913 VARS=<cp .dev.vars> OUT=<dir> node e2e/toc-tutor-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { outlineRevision } from '../src/learn-outline-model.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8911';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8913';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('toc-tutor-check runs against the local stack only');
const OUT = process.env.OUT || 'C:/s/toc-tutor/ev';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || 'C:/s/toc-tutor/.dev.vars', 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `toc-${Date.now().toString(36)}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'Tides' }) });
const inkKey = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
// One card and no headings: the contents start empty.
const seeds = { [inkKey]: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'k1', type: 'explanation', dx: 0, dy: 0, title: 'Why the sea moves', body: 'Notes from the beach.' }] } };

const SYLLABUS = { journeyId: null, goal: 'Read a tide table', topics: [
  { id: 't1', title: 'Tides', description: 'Why the sea rises and falls twice a day.', objectives: ['Explain the bulges'], subtopics: [{ id: 't1.1', title: 'The moon', description: 'Its pull makes the bulges.' }, { id: 't1.2', title: 'The sun' }], refs: [] },
  { id: 't2', title: 'Tide tables', objectives: ['Read a height'], refs: [] },
] };

// ---------------------------------------------------------------- routes: capture and canned answers
const captured = [], refused = [], outside = [], errors = [];
const next = [];   // what the next /api/learn/ask answers: { syllabus } or { outline: ops => ops } or {}
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
    const outline = plan.outline ? frame('outline', { ops: plan.outline(body), base: body.outlineRevision ?? null }) : '';
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Canned reply ${reply}.` }) + outline
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: plan.syllabus ? 'syllabus' : 'clarify', syllabus: plan.syllabus || null })
      + frame('done', { ok: true, threadId: body.thread_id || 'toc-thread-1', userMessageId: `u-${reply}`, messageId }) });
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
await context.addInitScript(([key, value]) => { if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, [inkKey, seeds[inkKey]]);
await context.route('**/*', router);
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
const tab = name => page.getByRole('tab', { name, exact: true });
const contents = () => page.getByRole('tabpanel', { name: 'Table of contents' });
const apply = () => contents().getByRole('button', { name: 'Apply', exact: true });
const headings = () => page.evaluate(key => (JSON.parse(localStorage.getItem(key) || '{}').blocks || []).filter(b => b.type === 'heading')
  .map(b => ({ id: b.id, level: b.level, text: b.text, description: b.description || '', done: !!b.done })), inkKey);
const setMode = async mode => {
  if (await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode') === mode) return;
  await pane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.locator(`[data-chat-mode-option="${mode}"]`).click();
  await waitFor(async () => await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode') === mode);
};
async function turn(text, plan) {
  await tab('Chat').click();
  await setMode('tutor');
  next.push(plan);
  const n = captured.length;
  await pane().locator('[data-chat-composer] textarea').first().fill(text);
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > n, 20000);
  await pane().getByText(`Canned reply ${captured[n].reply}.`, { exact: true }).first().waitFor({ timeout: 15000 });
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').waitFor({ timeout: 10000 });
  return captured[n].body;
}

let adopted = [];
await check('1 a Tutor syllabus renders its topic descriptions and numbered subtopics, with Use as table of contents', async () => {
  const body = await turn('make me a syllabus on tides', { syllabus: SYLLABUS });
  assert.equal(body.mode, 'tutor');
  assert.equal(body.outline, undefined, 'no headings yet, so no outline rides');
  assert.equal(body.outlineRevision, undefined);
  const card = pane().locator('[data-syllabus]').last();
  await card.waitFor({ timeout: 10000 });
  assert.equal(await card.locator('[data-syllabus-topic]').count(), 2);
  assert.deepEqual(await card.locator('[data-syllabus-subtopic]').allInnerTexts().then(t => t.map(s => s.replace(/\s+/g, ' ').trim())), ['1.1 The moon Its pull makes the bulges.', '1.2 The sun']);
  assert.equal(await card.locator('[data-syllabus-description]').first().innerText(), 'Why the sea rises and falls twice a day.');
  assert.ok(await card.locator('[data-syllabus-contents]').isEnabled());
  await card.screenshot({ path: `${OUT}/1-syllabus.png` });
});

await check('2 Use as table of contents proposes, Apply makes the headings with their descriptions, none completed', async () => {
  const card = pane().locator('[data-syllabus]').last();
  assert.deepEqual(await headings(), [], 'nothing changes before Apply');
  await card.locator('[data-syllabus-contents]').click();
  assert.match(await card.locator('[data-syllabus-contents-status]').innerText(), /Proposed in Table of contents/);
  assert.deepEqual(await headings(), [], 'the button itself applies nothing');
  await tab('Table of contents').click();
  await apply().waitFor({ timeout: 5000 });
  await contents().screenshot({ path: `${OUT}/2-proposal.png` });
  await apply().click();
  adopted = await waitFor(async () => { const h = await headings(); return h.length === 4 && h; });
  assert.deepEqual(adopted.map(h => [h.level, h.text, h.description, h.done]), [
    [1, 'Tides', 'Why the sea rises and falls twice a day.', false], [2, 'The moon', 'Its pull makes the bulges.', false], [2, 'The sun', '', false], [1, 'Tide tables', '', false],
  ]);
  assert.equal(await apply().count(), 0, 'the proposal is gone once applied');
});

await check('3 pressing it again proposes nothing: the syllabus is already the contents', async () => {
  await tab('Chat').click();
  const card = pane().locator('[data-syllabus]').last();
  await card.locator('[data-syllabus-contents]').click();
  assert.equal(await card.locator('[data-syllabus-contents-status]').innerText(), 'Already in the table of contents.');
  await tab('Table of contents').click();
  assert.equal(await apply().count(), 0);
  assert.equal((await headings()).length, 4);
});

await check('4 a Tutor turn sends the headings with ids, descriptions and outlineRevision; its proposal adds a subtopic at the end of its topic', async () => {
  const tides = adopted[0].id;
  const body = await turn('why are some tides higher than others?', { outline: () => [{ op: 'add', text: 'Spring tides', level: 2, parent: tides, description: 'When the sun and moon line up.' }] });
  assert.deepEqual(body.outline.map(e => [e.id, e.level, e.label, e.description, e.done]), adopted.map(h => [h.id, h.level, h.text, h.description, false]));
  assert.match(body.outlineRevision, /^[0-9a-f]{8}$/);
  assert.equal(body.outlineRevision, outlineRevision(body.outline), 'the revision of exactly the headings sent');
  await tab('Table of contents').click();
  await apply().waitFor({ timeout: 5000 });
  assert.match(await contents().innerText(), /Spring tides/);
  await apply().click();
  const after = await waitFor(async () => { const h = await headings(); return h.length === 5 && h; });
  assert.deepEqual(after.map(h => [h.level, h.text, h.done]), [[1, 'Tides', false], [2, 'The moon', false], [2, 'The sun', false], [2, 'Spring tides', false], [1, 'Tide tables', false]]);
  assert.equal(after[3].description, 'When the sun and moon line up.');
  assert.deepEqual(after.filter(h => h.text !== 'Spring tides').map(h => h.id), adopted.map(h => h.id), 'existing headings keep their ids');
  await contents().screenshot({ path: `${OUT}/4-applied.png` });
});

await check('5 an ordinary Tutor question proposes nothing', async () => {
  const body = await turn('what is a spring tide?', {});
  assert.equal(body.outline.length, 5);
  await tab('Table of contents').click();
  await page.waitForTimeout(300);
  assert.equal(await apply().count(), 0);
  assert.equal((await headings()).length, 5);
});

// The PANEL lane's proposal card (stale refusal, contract C7) and its 96-op cap for syllabus proposals (lead ruling C8 size A):
// run on the integrated release with TOC_PANEL=1. A lane branch without that card skips them, and says so.
const panel = process.env.TOC_PANEL === '1';
if (!panel) console.log('skip 7 and 8: TOC_PANEL=1 runs them on the integrated release');
if (panel) await check('7 a proposal made against an older revision is refused as stale and changes nothing', async () => {
  const before = await headings();
  const body = await turn('add a part on neap tides', { outline: () => [{ op: 'add', text: 'Neap tides', level: 2, parent: before[0].id }] });
  assert.equal(body.outline.length, before.length);
  // A manual edit between the proposal and Apply, through the panel's own (unconditional) path: double-click a title to rename.
  await tab('Table of contents').click();
  await apply().waitFor({ timeout: 5000 });
  const renamed = contents().getByRole('button', { name: before.at(-1).text, exact: true }).first();
  await renamed.dblclick();
  await page.keyboard.type('Tide tables, edited');
  await page.keyboard.press('Enter');
  await waitFor(async () => (await headings()).some(h => h.text === 'Tide tables, edited'));
  await apply().click();
  await contents().getByText('The contents changed since this proposal. Ask the Tutor again.').first().waitFor({ timeout: 5000 });
  assert.equal((await headings()).some(h => h.text === 'Neap tides'), false, 'nothing applied');
});
if (panel) await check('8 a full syllabus (12 topics, 6 subtopics each: 84 adds) adopts in one Apply', async () => {
  const big = { journeyId: null, goal: 'A long course', topics: Array.from({ length: 12 }, (_, i) => ({ id: `b${i + 1}`, title: `Unit ${i + 1}`, objectives: ['o'], refs: [], subtopics: Array.from({ length: 6 }, (_, j) => ({ id: `b${i + 1}.${j + 1}`, title: `Part ${i + 1}.${j + 1}` })) })) };
  const before = (await headings()).length;
  await turn('plan a long course', { syllabus: big });
  await tab('Chat').click();
  const card = pane().locator('[data-syllabus]').last();
  await card.locator('[data-syllabus-contents]').click();
  assert.doesNotMatch(await card.locator('[data-syllabus-contents-status]').innerText(), /Too many/);
  await tab('Table of contents').click();
  await apply().click();
  await waitFor(async () => (await headings()).length === before + 84, 15000);
});

await check('6 no model route was reached and the page raised no error', async () => {
  assert.deepEqual(refused, []);
  assert.deepEqual(outside, []);
  assert.deepEqual(errors, []);
});

writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, asks: captured.length }, null, 2));
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
