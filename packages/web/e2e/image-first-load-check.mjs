// A generated image shows in its card on first load (task b4b89fb0), against the LOCAL stack only. Owner report: after an image
// job finished, Chat said Ready and the charge, but the canvas card said "This stored file could not be read here." until a reload.
// Cause: the card reads its stored file before the board save that registers this canvas's reference to it (file_source_refs) lands,
// and the first read is the server's 404. No model call and no paid call: every model route is aborted and counted; the image
// capability, the plan (POST /api/learn/chat/image-proposals), the image job API and the thread restore are MOCKED in the browser.
// The image files are REAL stored sources on the local Worker (uploaded here as PNGs), read through the real authorization.
//   0. throughout: Auto mode on a canvas with an active Tutor; a typed /image gets its plan card and the Tutor plan route is never asked
//   1. first load: the card is placed, shows a spinner and Loading image while Chat already says Ready and the charge; the board save is
//      held until the read has been refused (404), then lands; the same card shows the decoded image, no reload, no second card
//   2. a stored file that stays missing: Loading image, then "could not be read here" with Retry loading image after the bounded
//      retries; Retry reads only that file again (MOCKED readable now) and shows it: no job, no plan, no model route, no charge
//   3. another person's stored file named by a card: the board save indexes nothing, every read is the same 404, no image, no bytes
//   4. a reload: the image shows again, no card is placed again and no job is started or resubmitted
//   5. a fresh browser (no local copy): two reads fail in transit, the card keeps loading, then shows the image
// Prints `ok N. <step>` per step and `N/total passed`; exits 1 on any failure. Screenshots go to OUT.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] [OUT=<dir>] node e2e/image-first-load-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import assert from 'node:assert/strict';

const total = 5; // the number of step() calls below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('image-first-load-check runs against the local stack only');
const OUT = process.env.OUT || process.argv[2] || 'image-first-load-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const mint = async who => {
  const response = await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${who}-${run}@example.com`, secret }) });
  const body = await response.json();
  if (!response.ok || typeof body.session !== 'string') throw Error(`test-session setup failed: HTTP ${response.status}`);
  return body.session;
};
// Both people are minted before any page is open (a /test/session write while a page polls its session can read SQLITE_BUSY as 401).
const session = await mint('imgload'), strangerSession = await mint('imgload-other');
const call = (who, path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who}`, origin: BASE, 'content-type': 'application/json', ...init.headers } });
const json = async (who, path, init) => { const r = await call(who, path, init); const body = await r.json().catch(() => null); if (!r.ok) throw Error(`${init?.method || 'GET'} ${path}: HTTP ${r.status} ${body?.error || ''}`); return body; };

// ---- real PNGs (decodable, distinct bytes per person)
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = bytes => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const head = Buffer.alloc(4), tail = Buffer.alloc(4), t = Buffer.from(type); head.writeUInt32BE(data.length); tail.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([head, t, data, tail]); };
function png(width, height, rgb) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width * 3 }, (_, i) => rgb[i % 3]))]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(height).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const EMPTY = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [] };
// A canvas with a saved board, and one stored image source on it (POST /api/learn/files, then the bytes).
async function storedImage(who, title, bytes) {
  const canvas = await json(who, '/api/canvases', { method: 'POST', body: JSON.stringify({ title }) });
  await json(who, `/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: EMPTY }) });
  const made = await json(who, '/api/learn/files', { method: 'POST', body: JSON.stringify({ app: canvas.name, board: 'main', name: 'generated-image.png', type: 'image/png', size: bytes.length, sha256: sha(bytes), family: 'image' }) });
  if (made.upload) await json(who, made.upload.url, { method: 'PUT', body: bytes, headers: { 'content-type': 'image/png' } });
  return { canvas, source: { id: made.source.id, sha256: sha(bytes), bytes: bytes.length } };
}
const W = 64, H = 48;
const mine = await storedImage(session, `Image first load ${run}`, png(W, H, [220, 40, 40]));
const theirs = await storedImage(strangerSession, `Someone else ${run}`, png(W, H, [40, 40, 220]));
const canvas = mine.canvas, A = mine.source, S = theirs.source;
const GONE = { id: `fs_${sha(run).slice(0, 24)}`, sha256: sha(`gone-${run}`), bytes: 1234 }; // never stored
const fileUrl = id => new RegExp(`/api/learn/files/${id}(\\?|$)`);

const results = [];
let failShot = null;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message.split('\n')[0]}`); console.log(error.message.split('\n').slice(1, 6).map(line => `      ${line.slice(0, 240)}`).join('\n')); await failShot?.(results.length); }
};
const until = async (fn, what, ms = 30000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw Error(`timed out: ${what}`); await new Promise(r => setTimeout(r, 200)); } };

// ---- the browser: model routes aborted; capability, plan, job API and restore MOCKED; file reads observed (and shaped where a step says)
const MODEL = /\/api\/(ask$|learn\/(artifact|tutor\/plan|selection|inline\/[\w-]+|image|scene|search|voice\/[\w-]+|transcribe|tts|journey|dive|explore|home-ask))(\?|$)/;
const ARTIFACT = { [A.id]: A, [GONE.id]: GONE, [S.id]: S };
const plans = new Map(), turns = [], posts = [], model = [], reads = [], failedReads = [];
let restoring = null, offered = 0;
const job = (generationId, artifact) => ({ id: generationId, stage: 'ready', reason: null, cost: 'measured', saveRetryable: false, charged_credits: 1, createdAt: Date.now(),
  artifact: { sourceId: artifact.id, sha256: artifact.sha256, mimeType: 'image/png', bytes: artifact.bytes } });
async function prepare(context) {
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  context.on('response', r => { const u = new URL(r.url()); const m = /^\/api\/learn\/files\/(fs_[0-9a-f]{24})$/.exec(u.pathname); if (m && r.request().method() === 'GET') reads.push({ id: m[1], status: r.status(), query: u.search }); });
  context.on('requestfailed', r => { const m = /\/api\/learn\/files\/(fs_[0-9a-f]{24})/.exec(r.url()); if (m) failedReads.push(m[1]); });
  await context.route(MODEL, route => { model.push(new URL(route.request().url()).pathname); return route.abort(); });
  await context.route('**/main/thumbnail', route => (route.request().method() === 'PUT' ? route.fulfill({ status: 204 }) : route.continue()));
  // MOCKED: the server offers image generation to this person (GET), and the job API (POST create, GET status).
  await context.route(/\/api\/learn\/image-jobs(\/[^/?]+)?(\?|$)/, route => {
    const request = route.request(), id = /image-jobs\/([^/?]+)/.exec(request.url())?.[1];
    if (!id && request.method() === 'GET') { offered += 1; return route.fulfill({ json: { available: true, models: [] } }); }
    if (!id && request.method() === 'POST') {
      const body = JSON.parse(request.postData() || '{}'); posts.push(body.generationId);
      const plan = [...plans.values()].find(p => `img-${p.proposal.proposal_id}` === body.generationId);
      return route.fulfill({ status: posts.filter(g => g === body.generationId).length > 1 ? 200 : 201, json: { job: { ...job(body.generationId, plan.artifact), stage: 'queued', artifact: null } } });
    }
    const plan = [...plans.values()].find(p => `img-${p.proposal.proposal_id}` === id);
    return plan && posts.includes(id) ? route.fulfill({ json: { job: job(id, plan.artifact) } }) : route.fulfill({ status: 404, json: { error: 'Not found' } });
  });
  // MOCKED: the plan the server would sign (no model call); the words name which stored image its job makes.
  await context.route(/\/api\/learn\/chat\/image-proposals$/, route => {
    const body = JSON.parse(route.request().postData() || '{}'), n = plans.size + 1, words = String(body.prompt || '');
    const artifact = /missing/.test(words) ? GONE : /someone/.test(words) ? S : A;
    const proposal = { proposal_id: `gp-${sha(`${run}-${n}`).slice(0, 16)}`, version: 1, schema_version: 1, command: 'generate-image', title: `Image: ${words}`.slice(0, 120), description: words, prompt: words,
      settings: { model: 'gpt-image-2.5-sunburst', quality: 'low', aspect_ratio: '1:1', resolution: '1K' }, input: { request: `/image ${words}`, org: 'local', app: canvas.name },
      original_request: `/image ${words}`, references: [], sig: `v3.${'0'.repeat(64)}`, usage: { estimate_credits: 1, max_credits: 4, reserve_credits: 5 }, expires_at: Math.floor(Date.now() / 1000) + 3600 };
    const threadId = body.thread_id || `canvaschat-img-${run}`, messageId = 900000 + n;
    plans.set(words, { proposal, artifact });
    turns.push({ threadId, user: { role: 'user', content: `/image ${words}`, messageId: String(800000 + n) }, answer: { role: 'assistant', content: 'Here is the plan for your image. Generate makes it.', messageId: String(messageId), kind: 'answer', status: 'done', meta: { proposal, alternatives: [String(messageId)] } } });
    return route.fulfill({ json: { thread_id: threadId, message_id: messageId, proposal, references: [] } });
  });
  // MOCKED restore of that thread after a reload (step 4).
  await context.route(/\/api\/learn\/chat\/active(\?|$)/, route => (restoring && route.request().method() === 'GET' ? route.fulfill({ json: { threadId: restoring } }) : route.fallback()));
  await context.route(/\/api\/ask\/threads\/[^/?]+$/, route => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
    if (!restoring || id !== restoring || route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: { id, title: 'Image first load', mode: 'auto', contextRefs: [], draft: null, messages: turns.filter(t => t.threadId === id).flatMap(t => [t.user, t.answer]) } });
  });
}
async function open(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message.slice(0, 160)));
  page.navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) page.navigations += 1; });
  // Any "could not be read" state shown at any moment is recorded (a MutationObserver from the first paint).
  await page.addInitScript(() => {
    window.__missing = [];
    new MutationObserver(() => { for (const node of document.querySelectorAll('[data-block-id]')) if (node.querySelector('[data-media-state="missing"]') && !window.__missing.includes(node.getAttribute('data-block-id'))) window.__missing.push(node.getAttribute('data-block-id')); })
      .observe(document, { childList: true, subtree: true });
  });
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
  await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 30000 });
  return page;
}
const blockIds = page => page.locator('[data-block-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-block-id')));
const cardOf = (page, id) => page.locator(`[data-block-id="${id}"]`);
const decoded = (page, id) => cardOf(page, id).locator('img[data-image-preview]').evaluate(img => img.complete && img.naturalWidth > 0 ? [img.naturalWidth, img.naturalHeight] : null).catch(() => null);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await prepare(context);
let page = await open(context);
failShot = n => page.screenshot({ path: `${OUT}/FAIL-${String(n).padStart(2, '0')}.png` }).catch(() => {});
const dock = page.locator('[data-chat-pane]');
const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
const modeButton = dock.getByRole('button', { name: 'Mode', exact: true });
// Auto, on a canvas with an active Tutor (every plain canvas has one, LearnTutor.jsx): a typed /image is not the Tutor's turn (ledger
// c030d623; chat-route.js tutorTurn, ask.jsx promptsChat), so the Tutor plan route /api/learn/tutor/plan, aborted and counted here, is
// never asked and the plan card comes from /api/learn/chat/image-proposals. Run 40541917172 part 3 saw the Tutor take it.
if ((await modeButton.getAttribute('data-chat-mode')) !== 'auto') {
  await modeButton.click(); await page.locator('[data-chat-mode-option="auto"]').click();
}
await until(async () => (await modeButton.getAttribute('data-chat-mode')) === 'auto', 'mode auto');
await until(() => offered > 0, 'the page asked whether image generation is offered (MOCKED yes)');
// /image <words>, then Generate on its plan card: -> the new canvas card's block id.
async function generate(words) {
  const before = new Set(await blockIds(page));
  await composer().fill(`/image ${words}`);
  await composer().press('Enter');
  const plan = dock.locator('[data-generation-proposal="generate-image"]', { hasText: words });
  await plan.locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 30000 });
  await plan.locator('[data-proposal-generate]').click();
  let id = null;
  await until(async () => { id = (await blockIds(page)).find(b => !before.has(b)) || null; return !!id; }, `the card for "${words}"`);
  return { id, plan };
}
const boardHolds = [];
await context.route(new RegExp(`/api/learn/boards/${canvas.name}/main$`), async route => {
  if (route.request().method() === 'PUT' && boardHolds.length) await boardHolds[0].released;
  return route.fallback();
});

// 1 ----------------------------------------------------------------------------------------------------------------
let first = null;
await step('first load, in Auto with an active Tutor: /image gets its plan card; a spinner and Loading image while Chat says Ready; the read is refused until the board save lands, then the same card shows the image, no reload', async () => {
  let release; boardHolds.push({ released: new Promise(resolve => { release = resolve; }) });
  const navigations = page.navigations;
  try {
    first = await generate('a red square');
    assert.equal(model.includes('/api/learn/tutor/plan'), false, 'the Tutor plan route was never asked: /image is not a Tutor turn in Auto');
    assert.equal(plans.size, 1, 'the plan came from the image plan route (the plan card, not Tutor prose)');
    // The board save waits (held here) until this card's read has been refused: the order the owner hit, made deterministic.
    await until(() => reads.some(r => r.id === A.id && r.status === 404), 'the first read refused before the board save');
    const card = cardOf(page, first.id);
    await card.locator('[data-media-state="loading"]').waitFor();
    assert.match(await card.locator('[data-media-state="loading"]').innerText(), /^Loading image$/);
    assert.equal(await card.locator('[data-media-state="loading"] .animate-spin').count(), 1, 'a spinner');
    assert.equal(await card.locator('[data-media-state="missing"]').count(), 0);
    // Generation complete and preview displayed are separate: Chat says Ready and the charge while the card still loads.
    assert.equal(await first.plan.locator('[data-proposal-generate]').getAttribute('data-proposal-phase'), 'done');
    assert.match(await first.plan.locator('[data-proposal-job-detail]').innerText(), /The image is ready on the canvas\. Charged 1 AI credit\./);
    await card.screenshot({ path: `${OUT}/01-loading.png` });
  } finally { release(); boardHolds.shift(); }
  await until(async () => !!(await decoded(page, first.id)), 'the image decoded in its card', 30000);
  assert.deepEqual(await decoded(page, first.id), [W, H]);
  const ours = reads.filter(r => r.id === A.id);
  assert.equal(ours[0].status, 404); assert.equal(ours.at(-1).status, 200);
  assert.ok(ours.every(r => r.query === `?app=${canvas.name}&board=main`), 'read through this canvas only');
  assert.deepEqual(await page.evaluate(() => window.__missing), [], 'never "could not be read here" on the way');
  assert.equal(page.navigations, navigations, 'no reload or navigation');
  assert.equal((await blockIds(page)).filter(id => id === first.id).length, 1);
  assert.equal(await page.locator('img[data-image-preview]').count(), 1, 'one image card');
  assert.equal(posts.length, 1, 'one job');
  await page.screenshot({ path: `${OUT}/01-shown.png` });
});

// 2 + 3 ------------------------------------------------------------------------------------------------------------
let gone = null, other = null;
await step('a stored file that stays missing: Retry loading image after the bounded retries; Retry reads only that file again and shows it, with no job, plan, model call or charge', async () => {
  gone = await generate('missing picture');
  other = await generate('someone else picture'); // read in step 3, while this step waits out the retries
  const card = cardOf(page, gone.id);
  await card.locator('[data-media-state="loading"]').waitFor();
  const retry = card.locator('[data-media-retry-load]');
  await retry.waitFor({ timeout: 60000 });
  assert.match(await card.locator('[data-media-state="missing"]').innerText(), /This stored file could not be read here\.\s*Retry loading image/);
  const tries = reads.filter(r => r.id === GONE.id);
  assert.ok(tries.length >= 4 && tries.length <= 10 && tries.every(r => r.status === 404), `bounded retries, every one refused: ${tries.map(r => r.status).join(' ')}`);
  await card.screenshot({ path: `${OUT}/02-missing.png` });
  // MOCKED: the stored file is readable now; Retry must reach it with a file read and nothing else.
  await context.route(fileUrl(GONE.id), route => route.fulfill({ status: 200, body: png(W, H, [40, 200, 40]), headers: { 'content-type': 'image/png' } }));
  const jobs = posts.length, asked = plans.size, refused = model.length, sent = [];
  const watch = request => { const u = new URL(request.url()); if (u.pathname.startsWith('/api/')) sent.push(`${request.method()} ${u.pathname}`); };
  page.on('request', watch);
  await retry.click();
  await until(async () => !!(await decoded(page, gone.id)), 'the image after Retry', 20000);
  page.off('request', watch);
  assert.deepEqual([posts.length, plans.size, model.length], [jobs, asked, refused], 'no job, no plan, no model route');
  assert.ok(sent.includes(`GET /api/learn/files/${GONE.id}`), `the stored file was read again: ${sent.join(', ')}`);
  assert.ok(!sent.some(s => /^(POST|PUT) \/api\/learn\/(image-jobs|chat\/image-proposals|files)/.test(s)), `nothing generated, saved or uploaded: ${sent.join(', ')}`);
  assert.equal((await blockIds(page)).filter(id => id === gone.id).length, 1, 'the existing card, not a second one');
});

await step('another person\'s stored file named by a card stays unavailable: the board save indexes nothing, every read is the same 404, no image', async () => {
  const card = cardOf(page, other.id);
  await card.locator('[data-media-retry-load]').waitFor({ timeout: 60000 });
  assert.equal(await card.locator('img').count(), 0, 'no image');
  const tries = reads.filter(r => r.id === S.id);
  assert.ok(tries.length >= 2 && tries.every(r => r.status === 404), `every read refused: ${tries.map(r => r.status).join(' ')}`);
  await until(async () => JSON.stringify((await json(session, `/api/learn/boards/${canvas.name}/main`)).state).includes(S.id), 'the saved board names the source');
  for (const query of [`?app=${canvas.name}&board=main`, '']) assert.equal((await call(session, `/api/learn/files/${S.id}${query}`)).status, 404, `still refused ${query || 'by id'}`);
  assert.equal((await call(strangerSession, `/api/learn/files/${S.id}`)).status, 200, 'its owner still reads it');
  await card.screenshot({ path: `${OUT}/03-unavailable.png` });
});

// 4 ----------------------------------------------------------------------------------------------------------------
await step('a reload shows the image again; no card is placed again and no job is started', async () => {
  const cards = (await blockIds(page)).length, jobs = posts.length;
  restoring = turns[0].threadId;
  try {
    await page.reload();
    await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
    await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 30000 });
    await until(async () => !!(await decoded(page, first.id)), 'the image after the reload');
    await dock.locator('[data-generation-proposal="generate-image"]', { hasText: 'a red square' }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(3000); // the restored plan reads its job (MOCKED ready) and must not place a card
    assert.equal((await blockIds(page)).length, cards, 'no card placed again');
    assert.equal(posts.length, jobs, 'no job started or resubmitted');
    assert.equal(posts.filter(id => id === `img-${plans.get('a red square').proposal.proposal_id}`).length, 1, 'one job POST for the first image, never a second');
    const restored = dock.locator('[data-generation-proposal="generate-image"]', { hasText: 'a red square' });
    assert.equal(await restored.count(), 1, 'one plan card for it');
    assert.match(await restored.locator('[data-proposal-job-detail]').innerText(), /Charged 1 AI credit\./, 'one charge, as before');
    assert.equal((await blockIds(page)).filter(id => id === first.id).length, 1, 'exactly one card for it');
    assert.equal(model.includes('/api/learn/tutor/plan'), false, 'the Tutor plan route was still never asked');
    await page.screenshot({ path: `${OUT}/04-reloaded.png` });
    assert.deepEqual(page.errors, [], 'no page errors');
  } finally { restoring = null; }
});
await context.close();

// 5 ----------------------------------------------------------------------------------------------------------------
await step('a fresh browser (no local copy): two reads fail in transit, the card keeps loading, then shows the image', async () => {
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await prepare(fresh);
  let dropped = 0;
  await fresh.route(fileUrl(A.id), route => (dropped++ < 2 ? route.abort('failed') : route.fallback()));
  const before = reads.filter(r => r.id === A.id).length, failedBefore = failedReads.filter(id => id === A.id).length;
  page = await open(fresh);
  await until(async () => !!(await decoded(page, first.id)), 'the image after two failed reads', 30000);
  assert.equal(dropped >= 3, true, `two reads dropped, then one answered (${dropped} reads)`);
  assert.equal(failedReads.filter(id => id === A.id).length - failedBefore, 2, 'two reads failed in transit');
  const answered = reads.filter(r => r.id === A.id).slice(before).map(r => r.status);
  assert.ok(answered.length >= 1 && answered.every(status => status === 200), `then answered: ${answered.join(' ')}`);
  assert.equal((await page.evaluate(() => window.__missing)).includes(first.id), false, 'never "could not be read here" for it');
  assert.deepEqual(page.errors, [], 'no page errors');
  await fresh.close();
});

console.log(`   model routes refused: ${model.length ? model.join(' ') : 'none'}`);
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} passed${results.length === total ? '' : ` (ran ${results.length})`}`);
process.exit(passed === total && results.length === total ? 0 : 1);
