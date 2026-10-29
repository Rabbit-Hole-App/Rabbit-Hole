// The /explain brief on the shared confirmation card (UI-15.1: GenerationProposalCard, ChatMessages ProposalSlot, LearnPage
// approveExplain; docs/features/generation-review-contract.md sections 8 and 9) against the LOCAL stack only. Sign-in, the board
// save and the saved chat lines are REAL; the /explain job API is a fake job server in the browser (as explain-entry-check), whose
// jobs wait for approval, and the brief the real ExplainJobs would post on the line's thread is MOCKED into that thread's restore,
// with its save (PUT/GET /api/learn/chat/messages/:id/proposal) answered here. No model call: every other model-capable request
// is aborted and counted. Light theme.
//   1. a brief that waits for approval: its card shows the title, the request, Presentation, the assumptions and the credits line,
//      Edit details and an enabled Generate; no Duration, Audio or Cancel; the job's card says to review it in Chat; nothing approved;
//   2. a Presentation change saves version 2 (one PUT from version 1, the whole settings), nothing approved;
//   3. Edit details: a new title and assumptions; Generate waits while the form is open; Save sends one PUT from version 2 with only
//      those keys, and the card shows version 3;
//   4. Generate (a double-click) sends exactly one approve for that job with the saved version 3; the card is made, inactive, and the
//      job's card becomes the explanation;
//   5. a refused Generate (409 brief_stale): its reason is said under the card, one approve, nothing made, the job's card still waits;
//   6. a reference the server refuses (409 reference_blocked): the reason is on the card, not twice; removing the reference in Edit
//      details saves version 2 without it, and its Generate sends one approve with no reference;
//   7. nothing else asked a model, left the stack, or threw.
// Usage: BASE=http://127.0.0.1:9311 SMALL_CP=http://127.0.0.1:9313 VARS=<stack .dev.vars> node e2e/explain-proposal-card-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { SCENE_EXAMPLE } from '../../control-plane/src/agents/learn-scene-author.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9311';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9313';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('explain-proposal-card-check runs against the local stack only');
const OUT = process.argv[2] || 'explain-proposal-card-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim().replace(/^(['"])(.*)\1$/, '$2');
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `xpc-${run}@example.com`, secret }) })).json();
const api = async (path, method = 'GET', body) => {
  const response = await fetch(`${BASE}${path}`, { method, headers: { cookie: `small_session=${session}`, origin: BASE, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const out = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${method} ${path}: HTTP ${response.status} ${out?.error || ''}`);
  return out;
};
const EMPTY = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [] };
const NOTES = { id: 'notes', type: 'explanation', title: 'Heap notes', body: 'A binary heap keeps every parent at or above its children.', dx: 0, dy: 0 };
const canvas = await api('/api/canvases', 'POST', { title: `Explain brief card ${run}` });
await api(`/api/learn/boards/${canvas.name}/main`, 'PUT', { state: { ...EMPTY, blocks: [NOTES] } });

// The fake job server: every job waits for approval ('awaiting_approval' after its create answer) until the check releases it.
const jobs = new Map(), creates = [], approves = [];
const view = job => ({ id: job.id, version: 1, boardId: job.boardId, cardId: job.cardId, requestClass: job.requestClass, stage: job.stage, attempt: 1,
  terminal: ['ready', 'failed', 'cancelled'].includes(job.stage), round: 0, stopReason: null, failure: null, recovery: [],
  usage: { credits: 0, unknown: false }, result: job.stage === 'ready' ? job.identity : null, createdAt: 0, updatedAt: 0 });
const release = job => Object.assign(job, { stage: 'ready', identity: { jobId: job.id, resultId: `er_${job.id}`, cardId: job.cardId, canvas: { boardId: job.boardId }, promptRef: 'p',
  revision: `xr_${job.id}`, baseRevision: null, specHash: 's', compiledHash: 'c', componentVersions: {}, policyVersion: 'v' } });
// The brief the real job posts on the line's thread (explain-job.js postBrief): a signed v3 explain proposal on an assistant message.
const REF = { id: 'r1', label: 'Heap notes', kind: 'card', sourceId: 'card:notes', revision: 'rev-1', range: null };
const ASSUMPTIONS = ['The heap is a max-heap.', 'Keys are whole numbers.'];
const proposals = new Map(), briefs = [], puts = []; // proposals: message id -> its current revision; briefs: { messageId, threadId, jobId }
let nextBrief = null; // the next job's brief shape (refs, approve answers), set by a step before its /explain line
const briefFor = (job, n, { references = [] } = {}) => ({
  proposal_id: `gp-${(run + n.toString(16).padStart(6, '0')).replace(/[^0-9a-f]/g, '0').padStart(16, '0').slice(-16)}`, version: 1, command: 'explain',
  title: `Heaps ${n}: ${job.prompt}`.slice(0, 120),
  description: references.length ? 'Show how {{ref:r1}} keeps the parent above its children.' : 'A heap keeps each parent above its children. Inserting sifts up. Removing the root sifts down.',
  prompt: references.length ? 'Show how {{ref:r1}} keeps the parent above its children.' : 'A heap keeps each parent above its children. Inserting sifts up. Removing the root sifts down.',
  settings: { presentation: 'steps' }, source_refs: [], references, assumptions: ASSUMPTIONS,
  input: { org: 'w', app: canvas.name, job: job.id, brief_hash: `bh-${job.id}`, request: job.prompt }, original_request: `/explain ${job.prompt}`,
  expires_at: Math.floor(Date.now() / 1000) + 3600, sig: `v3.${'a'.repeat(64)}`, usage: { estimate_credits: 40, reserve_credits: 120 },
});
const briefMessage = id => ({ role: 'assistant', content: 'Here is the plan for your explanation. Generate makes it.', messageId: id, kind: 'answer', status: 'done',
  meta: { version: 1, mode: 'ask', kind: 'answer', contextRefs: [], actions: [], followUps: [], syllabus: null, proposal: proposals.get(id), alternatives: [id] } });
const refused = [], outside = [], errors = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|board$|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course|artifact))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) { outside.push(url.hostname); return route.abort(); }
  const path = url.pathname;
  if (path === '/api/learn/explain/jobs' && method === 'POST') {
    const body = request.postDataJSON();
    let job = [...jobs.values()].find(entry => entry.requestId === body.requestId);
    if (!job) {
      creates.push(body);
      job = { id: `ej_${run}${jobs.size + 1}`, requestId: body.requestId, boardId: body.boardId, cardId: body.cardId, requestClass: body.requestClass, prompt: body.prompt, stage: 'preparing',
        answers: nextBrief?.answers || [] };
      jobs.set(job.id, job);
      const messageId = String(700001 + briefs.length);
      proposals.set(messageId, briefFor(job, briefs.length + 1, nextBrief || {}));
      briefs.push({ messageId, threadId: body.threadId, jobId: job.id });
      nextBrief = null;
      const answer = view(job);
      job.stage = 'awaiting_approval'; // the card's first read sees the brief waiting, so its thread is shown again (ExplainPending)
      return route.fulfill({ status: 202, json: { job: answer } });
    }
    return route.fulfill({ status: 202, json: { job: view(job) } });
  }
  const one = path.match(/^\/api\/learn\/explain\/jobs\/([^/]+)(?:\/(\w+))?$/);
  if (one) {
    const job = jobs.get(decodeURIComponent(one[1]));
    if (!job) return route.fulfill({ status: 404, json: { error: 'Not available' } });
    if (one[2] === 'approve') {
      approves.push({ jobId: job.id, body: request.postDataJSON() });
      const answer = job.answers.shift();
      if (answer) return route.fulfill(answer);
      job.stage = 'authoring';
      return route.fulfill({ status: 202, json: { job: view(job) } });
    }
    if (one[2]) return route.fulfill({ json: { job: view(job) } });
    if (url.searchParams.get('board') !== job.boardId) return route.fulfill({ status: 404, json: { error: 'Not available' } });
    return route.fulfill({ json: { job: view(job), ...(job.stage === 'ready' ? { block: { type: 'animation', id: job.cardId, title: SCENE_EXAMPLE.title, scene: SCENE_EXAMPLE, explain: job.identity } } : {}) } });
  }
  // The thread's restore: the real saved lines, plus the briefs posted on it.
  const thread = path.match(/^\/api\/ask\/threads\/([^/]+)$/);
  if (thread && method === 'GET') {
    const id = decodeURIComponent(thread[1]), mine = briefs.filter(b => b.threadId === id);
    if (!mine.length) return route.fallback();
    const real = await route.fetch().catch(() => null);
    const base = real?.ok ? await real.json() : { id, title: 'Explain brief card', mode: 'auto', contextRefs: [], draft: null, messages: [] };
    return route.fulfill({ json: { ...base, messages: [...(base.messages || []), ...mine.map(b => briefMessage(b.messageId))] } });
  }
  const saved = path.match(/^\/api\/learn\/chat\/messages\/(\d+)\/proposal$/);
  if (saved && proposals.has(saved[1])) {
    const id = saved[1], current = proposals.get(id);
    const states = p => p.references.map(r => ({ id: r.id, state: 'ok', message: null }));
    if (method === 'GET') return route.fulfill({ json: { proposal: current, message_id: id, used: false, references: states(current) } });
    const sent = request.postDataJSON();
    puts.push({ id, body: sent });
    if (sent.expected_version !== current.version) return route.fulfill({ status: 409, json: { error: 'This proposal changed meanwhile.', code: 'proposal_stale', current, current_message_id: id } });
    const { expected_version, ...edit } = sent;
    const next = { ...current, ...edit, ...(edit.description !== undefined ? { prompt: edit.description } : {}), version: current.version + 1 };
    proposals.set(id, next);
    return route.fulfill({ json: { proposal: next, references: states(next) } });
  }
  if (path === '/api/learn/chat/route' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not found' } });
  // The app plans a Tutor reply after a chat turn: answered here as chat-outputs-check does, so no model route is touched.
  if (path === '/api/learn/tutor/plan') return route.fulfill({ json: { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Canned Tutor reply.' }] } });
  if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(path)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
  if (MODEL.test(path) && method !== 'GET') { refused.push(path); return route.abort(); }
  return route.fallback();
};

const results = [];
const total = 7;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) {
    results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message.split('\n').slice(0, 4).join(' | ')}`); // the locator a timeout waited for is on the following lines
    // Failure evidence: the page as it was, and the Chat's proposal cards (bounded), so a missing or changed card is diagnosed from the artifact.
    await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
    const cards = await page.locator('[data-chat-pane] [data-generation-proposal]').evaluateAll(nodes => nodes.map(n => n.outerHTML.replace(/\s+class="[^"]*"/g, '').slice(0, 1500))).catch(() => []);
    console.log(`   fail ${results.length} proposal cards (${cards.length}): ${cards.join(' || ').slice(0, 4000)}`);
  }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 150)); } throw Error(`timed out: ${label}`); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(() => { try { localStorage.setItem('small.theme', 'light'); } catch {} });
await context.route('**/*', router);
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator('[data-chat-pane] [data-chat-composer]').first().waitFor({ timeout: 60000 });
const dock = page.locator('[data-chat-pane]');
const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
const send = async text => { const box = composer(); await box.click(); await box.fill(text); await page.waitForTimeout(150); await box.press('Enter'); };
// A brief's card by its request, which the card shows unchanged in every state (the title's h3 becomes an input while Edit details is
// open). Each request is unique here, so the locator resolves to that one card; a second match is a strict-mode error, never a guess.
const cardOf = request => dock.locator('[data-generation-proposal="explain"]').filter({ has: page.locator('[data-proposal-request]', { hasText: request }) });
const slotAlert = card => card.locator('xpath=following-sibling::p[@role="alert"]');
const approvesOf = job => approves.filter(a => a.jobId === job.id);
// One /explain line -> its job and the brief card the thread shows once the job waits for approval.
const brief = async (line, shape = null) => {
  nextBrief = shape;
  const count = creates.length;
  await send(line);
  await until(async () => creates.length === count + 1, `one job for ${line}`);
  const job = [...jobs.values()].at(-1), b = briefs.at(-1), p = proposals.get(b.messageId);
  const card = cardOf(job.prompt);
  await card.waitFor({ timeout: 20000 });
  assert.equal((await card.locator('h3').innerText()).trim(), p.title, 'the brief\'s title');
  return { job, id: b.messageId, card, title: p.title };
};

let first = null;
await step('a brief that waits for approval: title, request, Presentation, assumptions, credits, Edit details and Generate; no Duration, Audio or Cancel', async () => {
  first = await brief('/explain how a heap keeps its order when items are added and removed');
  const { card, job } = first;
  assert.equal(await card.getAttribute('data-proposal-active'), 'true');
  assert.equal(await card.getAttribute('data-proposal-version'), '1');
  assert.match(await card.locator('[data-proposal-request]').innerText(), /how a heap keeps its order/);
  assert.equal(await card.locator('[data-proposal-select="presentation"]').inputValue(), 'steps');
  assert.deepEqual(await card.locator('[data-proposal-section="assumptions"] li').allInnerTexts(), ASSUMPTIONS);
  assert.match(await card.locator('[data-proposal-usage]').innerText(), /Estimated cost: 40 AI credits/);
  assert.doesNotMatch(await card.innerText(), /\$\d/);
  assert.equal(await card.locator('[data-proposal-duration], [data-proposal-audio="on"], [data-proposal-audio="off"], [data-proposal-cancel]').count(), 0, 'no Duration, Audio or Cancel');
  assert.equal(await card.locator('[data-proposal-edit]').count(), 1, 'Edit details');
  await card.locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 10000 });
  await page.locator(`[data-block-id="${job.cardId}"] [data-explain-pending]`).waitFor({ state: 'attached' });
  assert.match(await page.locator(`[data-block-id="${job.cardId}"] [data-explain-stage]`).innerText(), /Review the brief in Chat/);
  assert.equal(approves.length, 0, 'nothing approved');
  await card.screenshot({ path: `${OUT}/1-brief-card.png` });
});

await step('a Presentation change saves version 2: one PUT from version 1 with the whole settings; nothing approved', async () => {
  const { card, id } = first;
  await card.locator('[data-proposal-select="presentation"]').selectOption('time');
  await until(async () => (await card.getAttribute('data-proposal-version')) === '2', 'version 2 after the Presentation change');
  assert.deepEqual(puts.filter(p => p.id === id).map(p => p.body), [{ expected_version: 1, settings: { presentation: 'time' } }]);
  assert.equal(await card.locator('[data-proposal-select="presentation"]').inputValue(), 'time');
  assert.equal(approves.length, 0, 'a settings change approves nothing');
});

const RETITLED = 'Heaps: keeping the order';
const MORE = [...ASSUMPTIONS, 'No two keys are equal.'];
await step('Edit details: Generate waits while the form is open; Save sends one PUT from version 2 with only the title and assumptions; version 3', async () => {
  const { card, id } = first;
  await card.locator('[data-proposal-edit]').click();
  await card.locator('[data-proposal-title]').fill(RETITLED);
  await card.locator('[data-proposal-list="assumptions"]').fill(MORE.join('\n'));
  assert.equal(await card.locator('[data-proposal-generate]').isDisabled(), true, 'Generate waits for the saved revision');
  await card.locator('[data-proposal-save]').click();
  const card3 = card;
  await until(async () => (await card3.getAttribute('data-proposal-version')) === '3', 'version 3 after Save');
  assert.equal((await card3.locator('h3').innerText()).trim(), RETITLED, 'the saved title');
  const mine = puts.filter(p => p.id === id).map(p => p.body);
  assert.equal(mine.length, 2, 'one more save');
  assert.deepEqual(mine[1], { expected_version: 2, title: RETITLED, assumptions: MORE }, 'only the changed keys, from version 2');
  assert.deepEqual(await card3.locator('[data-proposal-section="assumptions"] li').allInnerTexts(), MORE);
  first.card = card3;
  assert.equal(approves.length, 0);
  await card3.screenshot({ path: `${OUT}/3-edited.png` });
});

await step('Generate (a double-click) sends exactly one approve with the saved version 3; the card is made and the job\'s card becomes the explanation', async () => {
  const { card, job, id } = first;
  await card.locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 10000 });
  await card.locator('[data-proposal-generate]').dblclick();
  await until(async () => approvesOf(job).length >= 1, 'an approve request');
  await page.waitForTimeout(800);
  assert.equal(approvesOf(job).length, 1, 'one press, one approve');
  const { body } = approvesOf(job)[0];
  assert.equal(body.boardId, job.boardId, 'for the job\'s own canvas');
  assert.deepEqual(body.proposal, proposals.get(id), 'the exact saved revision');
  assert.equal(body.proposal.version, 3);
  await card.locator('[data-proposal-made]').waitFor({ timeout: 10000 });
  assert.equal(await card.getAttribute('data-proposal-active'), 'false', 'a made proposal cannot Generate again');
  release(job);
  await page.locator(`[data-block-id="${job.cardId}"] svg [data-animation-object]`).first().waitFor({ state: 'attached', timeout: 20000 });
  assert.equal(approvesOf(job).length, 1, 'still one approve');
  // Owner, 2026-10-28: the finished explanation opens in Focus once; Back to canvas dismisses it and it never reopens.
  await page.locator(`[data-block-id="${job.cardId}"][data-focus-host]`).waitFor({ timeout: 20000 });
  await page.locator('[data-focus-back]').click();
  await page.locator('[data-focus-host]').waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForTimeout(2500);
  assert.equal(await page.locator('[data-focus-host]').count(), 0, 'dismissed, it never reopens');
});

await step('a refused Generate (409 brief_stale) says why under the card: one approve, nothing made, the job\'s card still waits', async () => {
  const STALE = 'This brief changed. Review it again before generating.';
  const { card, job } = await brief('/explain why a heap is stored in an array', { answers: [{ status: 409, json: { error: STALE, code: 'brief_stale' } }] });
  await card.locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 10000 });
  await card.locator('[data-proposal-generate]').click();
  await slotAlert(card).filter({ hasText: STALE }).waitFor({ timeout: 10000 });
  assert.equal(approvesOf(job).length, 1, 'one approve');
  assert.equal(await card.locator('[data-proposal-made]').count(), 0, 'nothing made');
  assert.equal(await card.getAttribute('data-proposal-active'), 'true', 'still the live proposal');
  await page.locator(`[data-block-id="${job.cardId}"] [data-explain-pending]`).waitFor({ state: 'attached' });
  await card.screenshot({ path: `${OUT}/5-refused.png` });
});

await step('a refused reference (409 reference_blocked): the reason is on the card once; removing it saves version 2 and its Generate sends one approve with no reference', async () => {
  const BLOCKED = 'Heap notes was deleted. Remove it or attach it again.';
  const { card, job, id } = await brief('/explain how the heap notes card orders its items', { references: [REF],
    answers: [{ status: 409, json: { error: BLOCKED, code: 'reference_blocked', references: [{ id: 'r1', state: 'deleted', message: 'This card was deleted.' }] } }] });
  await card.locator('[data-proposal-pill="r1"]').first().waitFor();
  await card.locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 10000 });
  await card.locator('[data-proposal-generate]').click();
  await card.locator('[data-proposal-problem]').filter({ hasText: BLOCKED }).waitFor({ timeout: 10000 });
  assert.equal(await slotAlert(card).count(), 0, 'said once, on the card');
  assert.equal(approvesOf(job).length, 1);
  await card.locator('[data-proposal-edit]').click();
  await card.locator('[data-proposal-remove-reference="r1"]').click();
  await card.locator('[data-proposal-save]').click();
  const saved = card;
  await until(async () => (await saved.getAttribute('data-proposal-version')) === '2', 'version 2 without the reference');
  const sent = puts.filter(p => p.id === id).map(p => p.body);
  assert.equal(sent.length, 1, 'one save');
  assert.deepEqual([sent[0].expected_version, sent[0].references], [1, []], 'from version 1, no reference');
  assert.doesNotMatch(sent[0].description, /\{\{ref:/, 'the reference left the text too');
  assert.equal(await saved.locator('[data-proposal-problem]').count(), 0, 'the reason is gone once saved');
  await saved.locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 10000 });
  await saved.locator('[data-proposal-generate]').click();
  await until(async () => approvesOf(job).length === 2, 'the second approve');
  const body = approvesOf(job)[1].body;
  assert.deepEqual([body.proposal.version, body.proposal.references], [2, []]);
  await saved.locator('[data-proposal-made]').waitFor({ timeout: 10000 });
  release(job);
  await saved.screenshot({ path: `${OUT}/6-reference-recovered.png` });
});

await step('nothing else asked a model, left the stack, or threw', async () => {
  assert.deepEqual(refused, [], `model-capable requests: ${refused.join(', ')}`);
  // The app asks for its notebook origin on load (aborted here, reaches no model), as in cad-controls-check; nothing else leaves the stack.
  assert.deepEqual(outside.filter(host => !/notebook/.test(host)), []);
  assert.deepEqual(errors, []);
});

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} explain proposal card checks passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
