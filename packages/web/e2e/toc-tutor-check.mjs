// Tutor and the table of contents (R4, Tutor lane: owner decisions 4A and 5B, contract C4, C6, C8, C9). Against the LOCAL stack
// only. No model is ever called: /api/learn/ask is answered here with canned SSE and its request bodies are captured; every
// other model-capable route is aborted and counted.
// 1 a Tutor syllabus with descriptions and subtopics renders in Chat; 2 Use as table of contents proposes it to the page's
// Apply/Discard flow, and Apply makes the headings (descriptions kept, nothing completed); 3 pressing it again proposes nothing;
// 4 a Tutor turn sends the current headings with ids, descriptions and outlineRevision, and its outline event { ops, base }
// becomes a proposal whose Apply adds the subtopic at the end of its topic, completion untouched; 5 an ordinary Tutor question
// proposes nothing; 9 the TOC conversation (owner brief 2026-10-16 item 7): a request sent from the Table of contents, Tutor its
// only mode, applies its outline change at once in place, numbered; the reply stays in TOC, never Chat; Chat's draft and New
// chat leave it alone; a reload restores the TOC's own thread.
// The headings are read from the canvas's saved blocks (localStorage), so the check does not depend on the panel's markup.
// Prints `ok <label>` per check, counts and ids only (no cookies, no secrets); exits 1 on any failure.
// Usage: BASE=http://127.0.0.1:8911 SMALL_CP=http://127.0.0.1:8913 VARS=<cp .dev.vars> OUT=<dir> node e2e/toc-tutor-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { outlineRevision } from '../src/learn-outline-model.js';
import { COMMIT, REPO, routeRepository } from './nanogpt-repository-fixture.mjs';

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

// A real canvas context document is offered automatically to new Chat threads. TOC must not inherit it.
const chatFile = new FormData();
chatFile.append('app', canvas.name);
chatFile.append('file', new Blob(['CHAT_ONLY_ATTACHMENT: notes about waves, not the TOC goal.'], { type: 'text/plain' }), 'toc-chat-only.txt');
const chatUpload = await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', headers: { cookie: `small_session=${session}` }, body: chatFile })).json();
assert.ok(chatUpload.document?.id, 'the isolation test has a real uploaded context document');
const chatOnlySource = `doc:${chatUpload.document.id}`;
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
      + frame('done', { ok: true, threadId: plan.threadId || body.thread_id || 'toc-thread-1', userMessageId: `u-${reply}`, messageId }) });
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
await routeRepository(context);
await context.route('**/*', router);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 300);
    const at = String(error?.stack || '').split('\n').find(line => line.includes('toc-tutor-check.mjs'));
    if (at) console.log(`  at ${at.trim()}`);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}`);
    await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const waitFor = async (test, ms = 10000) => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error('timed out'); await page.waitForTimeout(100); } };

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator('[data-block-id="k1"]').waitFor({ timeout: 60000 });
await page.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
await page.locator('[data-chat-pane] [data-context-chip]').filter({ hasText: 'toc-chat-only.txt' }).waitFor();

const pane = () => page.locator('[data-chat-pane]');
// The Table of contents tab's name also says how many proposals wait for review (PanelHeader tocPending, R4), so it is
// matched by its start; every other tab by its exact name.
const tab = name => page.getByRole('tab', { name: name === 'Table of contents' ? /^Table of contents(, \d+ proposals? to review)?$/ : name, exact: name !== 'Table of contents' });
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
// Owner decision 1a (2026-10-20, Tutor workflow): Chat's Tutor is the teaching Tutor; syllabus and outline building happen in
// the Table of contents conversation, whose held Tutor posts to /api/learn/ask with mode tutor. A Tutor turn here is that
// conversation's; its proposals that fit apply at once (only a refused one waits as the Apply/Discard card).
const tocBox = () => contents().locator('[data-toc-conversation], [data-toc-ask]');
const tocField = () => tocBox().locator('[data-toc-composer] textarea').first();
async function openToc() {
  await tab('Table of contents').click();
  await contents().locator('[data-toc-start] button, [data-toc-composer]').first().waitFor({ timeout: 10000 });
  if (await contents().locator('[data-toc-start] button').count()) await contents().locator('[data-toc-start] button').click();
  await tocField().waitFor();
}
async function turn(text, plan) {
  await openToc();
  next.push(plan);
  const n = captured.length;
  await tocField().fill(text);
  await tocBox().locator('[data-toc-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > n, 20000);
  await tocBox().getByText(`Canned reply ${captured[n].reply}.`, { exact: true }).first().waitFor({ timeout: 15000 });
  await tocBox().locator('[data-toc-composer] button[aria-label="Send"]').waitFor({ timeout: 10000 });
  return captured[n].body;
}

let adopted = [];
await check('1 a Tutor syllabus in the TOC conversation renders its topic descriptions and numbered subtopics, with Use as table of contents', async () => {
  // First use (owner UI brief 2026-10-20 section 6): with no TOC messages there is only the compact entry; pressed, its composer.
  await tab('Chat').click();
  await pane().locator('[data-chat-composer] textarea').first().fill('A Chat draft');
  await tab('Table of contents').click();
  assert.equal(await contents().locator('[data-toc-conversation], [data-toc-composer]').count(), 0, 'no TOC messages: no empty conversation or composer');
  await contents().locator('[data-toc-start] button').click();
  await tocField().waitFor();
  assert.equal(await tocBox().locator('[data-chat-mode]').getAttribute('data-chat-mode'), 'tutor');
  assert.equal(await tocBox().getByRole('button', { name: 'Mode', exact: true }).count(), 0, 'no Auto / Ask / Tutor menu');
  assert.equal(await tocField().getAttribute('placeholder'), 'Describe your goal or refine the outline…');
  assert.equal(await tocField().inputValue(), '', 'Chat\'s draft stays in Chat');
  assert.equal(await contents().locator('[data-toc-goal]').count(), 0, 'no TOC request yet, no goal line - never sample text');
  const body = await turn('make me a syllabus on tides', { syllabus: SYLLABUS });
  assert.equal(body.mode, 'tutor');
  assert.ok(!(body.context_refs || []).some(ref => ref.sourceId === chatOnlySource), 'the TOC never carries Chat\'s uploaded document');
  assert.equal(body.outline, undefined, 'no headings yet, so no outline rides');
  assert.equal(body.outlineRevision, undefined);
  const card = tocBox().locator('[data-syllabus]').last();
  await card.waitFor({ timeout: 10000 });
  assert.equal(await card.locator('[data-syllabus-topic]').count(), 2);
  assert.deepEqual(await card.locator('[data-syllabus-subtopic]').allInnerTexts().then(t => t.map(s => s.replace(/\s+/g, ' ').trim())), ['1.1 The moon Its pull makes the bulges.', '1.2 The sun']);
  assert.equal(await card.locator('[data-syllabus-description]').first().innerText(), 'Why the sea rises and falls twice a day.');
  assert.ok(await card.locator('[data-syllabus-contents]').isEnabled());
  await card.screenshot({ path: `${OUT}/1-syllabus.png` });
});

await check('2 Use as table of contents in the TOC conversation makes the headings with their descriptions at once, none completed', async () => {
  const card = tocBox().locator('[data-syllabus]').last();
  assert.deepEqual(await headings(), [], 'nothing changes before the press');
  await card.locator('[data-syllabus-contents]').click();
  assert.match(await card.locator('[data-syllabus-contents-status]').innerText(), /Proposed in Table of contents/);
  adopted = await waitFor(async () => { const h = await headings(); return h.length === 4 && h; });
  assert.deepEqual(adopted.map(h => [h.level, h.text, h.description, h.done]), [
    [1, 'Tides', 'Why the sea rises and falls twice a day.', false], [2, 'The moon', 'Its pull makes the bulges.', false], [2, 'The sun', '', false], [1, 'Tide tables', '', false],
  ]);
  assert.equal(await apply().count(), 0, 'nothing waits for Apply');
  await contents().screenshot({ path: `${OUT}/2-adopted.png` });
});

await check('3 pressing it again proposes nothing: the syllabus is already the contents', async () => {
  await openToc();
  const card = tocBox().locator('[data-syllabus]').last();
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
  // A manual edit between the proposal and Apply, through the panel's own (unconditional) path: its Edit control opens the
  // title and description editor (TableOfContents.jsx; the title button's name now carries its number, decision 1A).
  await tab('Table of contents').click();
  await apply().waitFor({ timeout: 5000 });
  await contents().getByRole('button', { name: `Edit ${before.at(-1).text}`, exact: true }).click();
  await contents().getByRole('textbox', { name: `Title of ${before.at(-1).text}`, exact: true }).fill('Tide tables, edited');
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

// Owner brief 2026-10-16 item 7. The TOC's thread is a real one on the server, as /api/learn/ask (canned here) would leave it,
// so a reload restores it through the TOC's own open-thread pointer (slot 'toc').
// Owner UI brief 2026-10-20 section 6: with no TOC messages there is only the compact entry (data-toc-start); pressed, its
// composer (data-toc-ask) opens, and becomes the TOC conversation once a turn is sent.
await check('9 the TOC conversation: Tutor only; a request there applies its outline change at once, numbered in place; the reply stays in TOC; Chat\'s draft and New chat leave it; a reload restores it', async () => {
  const TOC_THREAD = `canvaschat-${crypto.randomUUID()}`, ask = 'Add a section on tidal bores after Tides';
  for (const [role, content, client_id] of [['user', ask, 'toc-u'], ['assistant', 'The saved TOC reply.', 'toc-a']])
    await api(`/api/learn/chat/threads/${TOC_THREAD}/messages`, { method: 'POST', body: JSON.stringify({ app: canvas.name, client_id, role, content, mode: 'tutor' }) });
  await tab('Chat').click();
  await setMode('ask'); // TOC must not inherit Chat's mode.
  await pane().locator('[data-chat-composer] textarea').first().fill('A Chat draft');
  // The TOC conversation exists already (steps 1-5, owner 1a); its first-use entry is checked in step 1.
  await openToc();
  assert.equal(await tocBox().locator('[data-chat-mode]').getAttribute('data-chat-mode'), 'tutor');
  assert.equal(await tocField().inputValue(), '', 'Chat\'s draft stays in Chat');
  const before = await headings(), tops = before.filter(h => h.level === 1), tides = tops.find(h => h.text === 'Tides');
  const n = captured.length;
  next.push({ threadId: TOC_THREAD, outline: () => [{ op: 'add', text: 'Tidal bores', level: 1, after: tides.id, description: 'A wave that runs up a river.' }] });
  await tocField().fill(ask);
  await tocBox().locator('[data-toc-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > n, 20000);
  const { body, reply } = captured[n];
  assert.equal(body.mode, 'tutor');
  assert.equal(body.thread_id, 'toc-thread-1', 'the TOC\'s own thread (steps 1-5), never Chat\'s');
  assert.equal(body.message, ask, 'the TOC goal/request is its own');
  assert.deepEqual(body.outline.map(h => [h.id, h.level, h.label, h.description, h.done]), before.map(h => [h.id, h.level, h.text, h.description, h.done]), 'the current complete outline rides');
  assert.equal(body.outlineRevision, outlineRevision(body.outline));
  assert.deepEqual(body.context_refs, [], 'no Chat attachments or canvas references');
  for (const key of ['canvas_context', 'canvas_target', 'paper_context', 'wiki_context', 'video_context', 'image_context', 'canvas_seed']) assert.equal(body[key], undefined, `TOC excludes ${key}`);
  await tocBox().getByText(`Canned reply ${reply}.`, { exact: true }).waitFor({ timeout: 15000 });
  const after = await waitFor(async () => { const h = await headings(); return h.some(x => x.text === 'Tidal bores') && h; });
  const at = after.findIndex(h => h.text === 'Tidal bores');
  assert.equal(after[at + 1]?.id, tops[tops.indexOf(tides) + 1].id, 'in place: after Tides, before the next topic');
  assert.equal(await apply().count(), 0, 'applied at once, no Apply card');
  const numberOf = id => contents().locator(`[data-toc-entry="${id}"] [data-toc-number]`).innerText();
  assert.equal(await numberOf(after[at].id), '2', 'Tidal bores is section 2');
  assert.equal(await numberOf(after[at + 1].id), '3', 'the next section renumbered');
  // A planning request is not the accepted goal: the goal line reads the learner's structured goal record and none is
  // accepted here (Tutor Task 11, draft acceptance 52, superseding the lead ruling of 2026-10-16 under owner decision 2a).
  assert.equal(await contents().locator('[data-toc-goal]').count(), 0, 'no goal line from a planning message');
  assert.ok(await contents().isVisible(), 'the Table of contents stays open');
  await contents().screenshot({ path: `${OUT}/9-toc-conversation.png` });
  await tab('Chat').click();
  assert.equal(await pane().getByText(`Canned reply ${reply}.`, { exact: true }).count(), 0, 'the TOC reply is not in Chat');
  assert.equal(await pane().locator('[data-chat-composer] textarea').first().inputValue(), 'A Chat draft', 'Chat\'s draft kept');
  assert.equal(await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode'), 'ask', 'TOC never changes Chat mode');
  await pane().getByRole('button', { name: 'New chat', exact: true }).click();
  await tab('Table of contents').click();
  assert.ok(await tocBox().getByText(`Canned reply ${reply}.`, { exact: true }).isVisible(), 'New chat leaves the TOC conversation');
  await tocField().fill('A TOC draft');
  await page.waitForTimeout(1000); // past the 800 ms thread-state save of the draft (chat-threads.js SAVE_DELAY)
  await page.reload();
  await page.locator('[data-block-id="k1"]').waitFor({ timeout: 60000 });
  await tab('Table of contents').click();
  await tocBox().getByText('The saved TOC reply.', { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await tocField().inputValue(), 'A TOC draft', 'the TOC draft survives the reload');
  assert.equal(await contents().locator('[data-toc-goal]').count(), 0, 'a restored TOC thread is not a goal either (draft acceptance 52)');
  assert.ok((await headings()).some(h => h.text === 'Tidal bores'), 'the outline change survives the reload');
  await tab('Chat').click();
  await page.waitForFunction(() => document.querySelector('[data-chat-pane]')?.dataset.chatRestore === 'ready');
  assert.equal(await pane().getByText('The saved TOC reply.', { exact: true }).count(), 0, 'Chat never restores the TOC\'s thread');
  await tab('Table of contents').click();
  const followUp = 'Teach me tides by refining these headings';
  const followIndex = captured.length;
  await tocField().fill(followUp);
  await tocBox().locator('[data-toc-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > followIndex, 20000);
  const followBody = captured[followIndex].body;
  assert.equal(followBody.thread_id, TOC_THREAD, 'the restored TOC conversation, never Chat history');
  assert.equal(followBody.mode, 'tutor');
  assert.equal(followBody.message, followUp);
  assert.deepEqual(followBody.context_refs, []);
  for (const key of ['canvas_context', 'canvas_target', 'paper_context', 'wiki_context', 'video_context', 'image_context', 'canvas_seed']) assert.equal(followBody[key], undefined, `restored TOC excludes ${key}`);
  assert.ok(followBody.outline.some(h => h.label === 'Tidal bores'), 'the refined outline rides on the next TOC turn');
  await tocBox().getByText(`Canned reply ${captured[followIndex].reply}.`, { exact: true }).waitFor();
});

await check('10 repository TOC keeps its intentional repository commit and outline, never the file selected in Chat', async () => {
  const repoInk = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${REPO}:ink`;
  await page.evaluate(([key, seed]) => localStorage.setItem(key, JSON.stringify(seed)), [repoInk, {
    strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [],
    blocks: [{ id: 'repo-heading', type: 'heading', level: 1, text: 'Repository outline', description: 'Read the model first.' }],
  }]);
  await page.goto(`${BASE}/apps/${REPO}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await pane().waitFor();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:open-files')));
  const files = page.locator('[data-companion] [data-learn-files]');
  await files.locator('[data-file-row="model.py"]').click();
  await pane().locator('[data-code-selection]').first().waitFor();
  await tab('Table of contents').click();
  await contents().locator('[data-toc-subtitle]').filter({ hasText: 'karpathy/nanoGPT' }).waitFor();
  const n = captured.length, request = 'Refine my repository outline to explain attention';
  await contents().locator('[data-toc-start] button').click(); // no TOC messages on this canvas yet: the entry opens the composer
  await tocField().fill(request);
  await tocBox().locator('[data-toc-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > n, 20000);
  const body = captured[n].body;
  assert.equal(body.message, request);
  assert.equal(body.mode, 'tutor');
  assert.equal(body.scope.app, REPO);
  assert.deepEqual(body.repository_context, { commit: COMMIT }, 'intentional repository identity without Chat file/range');
  assert.deepEqual(body.context_refs, [], 'selected repository file stays in Chat');
  assert.equal(body.canvas_context, undefined);
  assert.equal(body.canvas_target, undefined);
  assert.equal(body.thread_id ?? null, null, 'new repository TOC, not the other canvas conversation');
  assert.deepEqual(body.outline.map(h => [h.id, h.label, h.level]), [['repo-heading', 'Repository outline', 1]]);
  await tocBox().getByText(`Canned reply ${captured[n].reply}.`, { exact: true }).waitFor();
  await contents().screenshot({ path: `${OUT}/10-repository-toc.png` });
});
await check('6 no model route was reached and the page raised no error', async () => {
  assert.deepEqual(refused, [], refused.join(', '));
  assert.deepEqual(outside, [], outside.join(', '));
  assert.deepEqual(errors, [], errors.join(' | '));
});

writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, asks: captured.length, requests: captured.map(({ body }) => body) }, null, 2));
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
