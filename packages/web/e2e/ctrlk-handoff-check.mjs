// Ctrl+K's explicit command handed to Chat (owner spec 2026-10-29 4.2; slash follow-up bugs 3 and 4, 2026-10-29), against the LOCAL stack
// only. No model call and no paid call: every model route is aborted and counted; the route decision, the Chat answer (held open as the
// streaming stand-in) and the brief route (/api/learn/chat/material-proposals: the local stack holds no signing key) are MOCKED in the
// browser, so this proves the hand-off wiring, not real generation.
//   1. Chat busy (an answer still streaming): a Ctrl+K /quiz on a card is refused; Ctrl+K stays open with its command, says the busy
//      text (HANDOFF_REFUSED), sends nothing, and the Chat draft is unchanged
//   2. once the answer ends, the same Ctrl+K line sends: Ctrl+K closes, and the brief request is that command about Ctrl+K's own card
//   3. with a Chat draft, a context chip and an armed Edit target (the quiz brief), a Ctrl+K /diagram on another card is its own new
//      brief (never a revision of the Chat's Edit) and leaves the draft, the chips and the Edit target as they were
//   4. the same when the brief request fails: Chat says why, and the draft, the chips and the Edit target stay
//   5. slash pills (owner brief 2026-10-29, BRIEF-PILLS): on a second canvas told image generation is offered (MOCKED), typed, uppercase,
//      aliased, picked (mouse and keyboard) and pasted Chat commands show the resolved pill (/image: generate-image, /photos and /photo:
//      image), replace a stale pill, keep the words, and send their own line (the /image plan route MOCKED to refuse, the photo search
//      aborted, each recorded); a legacy /image message restores as photos; Ctrl+K shows the explain pill, and selected /quiz plus a typed
//      "/image cat" sends /image cat, leaving the Chat draft as it was
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<stack .dev.vars>] node e2e/ctrlk-handoff-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { HANDOFF_REFUSED } from '../src/inline-ai-command.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('ctrlk-handoff-check runs against a local stack only');
const OUT = process.argv[2] || 'ctrlk-handoff-shots';
mkdirSync(OUT, { recursive: true });
const vars = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8');
const secret = vars.match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `ctrlk-handoff-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, origin: BASE, 'content-type': 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};

const PHOTO = { id: 'k-photo', type: 'explanation', dx: 0, dy: 0, title: 'Photosynthesis', body: 'Plants use light energy to turn carbon dioxide and water into glucose and oxygen.' };
const FORCE = { id: 'k-force', type: 'explanation', dx: 560, dy: 0, title: 'Forces', body: 'A force is a push or a pull that changes how an object moves.' };
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Ctrl+K handoff ${run}` }) });
await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [PHOTO, FORCE] } }) });
// A saved conversation with a context chip (a pinned card ref), which the Chat restores with the thread.
const thread = `canvaschat-${crypto.randomUUID()}`;
const say = (client, role, content) => api(`/api/learn/chat/threads/${thread}/messages`, { method: 'POST', body: JSON.stringify({ app: canvas.name, client_id: client, role, content, ...(role === 'user' ? { title: 'Handoff' } : {}) }) });
await say('t1-u', 'user', 'What is a force?');
await say('t1-a', 'assistant', 'A push or a pull.');
const CHIP = { sourceId: `card:${FORCE.id}`, kind: 'card', name: 'Forces', version: 'v1' };
await api(`/api/learn/chat/threads/${thread}/state`, { method: 'PUT', body: JSON.stringify({ contextRefs: [CHIP] }) });

const total = 28;
let passed = 0, failed = 0;
const ok = (name, condition, extra = '') => { if (condition) passed += 1; else failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise(r => setTimeout(r, 150)); } };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const model = [];
await context.route(/\/api\/learn\/(artifact|tutor\/plan|selection|inline\/[\w-]+|image|video|scene|search|voice\/[\w-]+)(\?|$)/, route => { model.push(new URL(route.request().url()).pathname); return route.abort(); });
await context.route('**/main/thumbnail', route => (route.request().method() === 'PUT' ? route.fulfill({ status: 204 }) : route.continue()));
// MOCKED route decision: plain words are an answer.
await context.route(/\/api\/learn\/chat\/route$/, route => {
  const body = JSON.parse(route.request().postData() || '{}');
  return route.fulfill({ json: { route: 'answer', via: 'jev', capability: null, confidence: 0.9, probability: 0.9, args: body.text, clarification: null, message: null, settings: null, paid: false, retryable: false, code: null, token: null } });
});
// MOCKED Chat answer, held open until release(): the Chat stays busy (streaming) meanwhile.
const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
let release = () => {};
const asks = [];
await context.route(/\/api\/learn\/ask(\?|$)/, async route => {
  const body = JSON.parse(route.request().postData() || '{}');
  asks.push(body);
  await new Promise(done => { release = done; });
  const id = String(700000 + asks.length), threadId = body.thread_id ?? thread;
  return route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: sse('chunk', { text: 'The sky scatters blue light most.' })
    + sse('answer_meta', { messageId: id, actions: [], followUps: [], kind: 'answer', syllabus: null })
    + sse('done', { ok: true, threadId, userMessageId: String(600000 + asks.length), messageId: id }) });
});
// MOCKED brief route: each new brief a fresh proposal id; failNext answers the server's refusal once.
const briefs = [];
let failNext = false;
await context.route('**/api/learn/chat/material-proposals', async route => {
  const body = route.request().postDataJSON();
  briefs.push(body);
  if (failNext) { failNext = false; return route.fulfill({ status: 400, json: { error: 'Say what it should be about, or select a card first.', code: 'brief_subject' } }); }
  const n = briefs.length, words = String(body.request || '');
  const text = `A brief for ${words || 'the selected card'}.`;
  const proposal = { proposal_id: `gp-${String(n).padStart(16, '0')}`, version: 1, command: body.command, title: words.slice(0, 80) || 'Brief', description: text, settings: {}, source_refs: [],
    input: { request: `/${body.command} ${words}`.trim(), args: words, selection: body.selection ?? null, context: body.context ?? null, changes: [], org: 'o', app: 'a' },
    expires_at: Math.floor(Date.now() / 1000) + 3600, sig: `v3.${'0'.repeat(64)}`, schema_version: 1, mode: 'generate', original_request: `/${body.command} ${words}`.trim(), prompt: text,
    visual_constraints: [], references: [], requirements: [], assumptions: [], missing_information: [], limitations: [], destination: { org: 'o', app: 'a' }, quote: null, review_hash: 'fixture' };
  return route.fulfill({ status: 201, json: { thread_id: body.thread_id, message_id: String(9000 + n), proposal } });
});

const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
try {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
  await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 30000 });
  const dock = page.locator('[data-chat-pane]');
  const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
  const stop = dock.getByRole('button', { name: 'Stop', exact: true });
  const editor = page.locator('[data-inline-ai]');
  const field = page.locator('[data-inline-prompt]');
  const refused = page.locator('[data-inline-handoff-refused]');
  const editChip = dock.locator('[data-proposal-edit-target]');
  // The Chat's own context: its draft, every context chip but the canvas selection (it follows the card clicked for Ctrl+K), the Edit target.
  const chatContext = async () => JSON.stringify({ draft: await composer().inputValue(),
    chips: await dock.locator('[data-context-chip][data-ref-key]').evaluateAll(nodes => nodes.map(node => node.dataset.refKey).sort()),
    edit: await editChip.evaluateAll(nodes => nodes.map(node => `${node.dataset.proposalEditTarget}@${node.dataset.proposalEditVersion}`)) });
  const pick = async id => {
    if (await editor.count()) { await page.keyboard.press('Escape'); await editor.waitFor({ state: 'detached' }).catch(() => {}); }
    await page.locator(`[data-block-id="${id}"] [data-drag-zone]`).first().click();
  };
  const ctrlk = async line => { await page.keyboard.press('Control+k'); await editor.waitFor({ timeout: 10000 }); await field.fill(line); await field.press('Enter'); };
  await dock.getByText('A push or a pull.').first().waitFor({ timeout: 10000 }).catch(() => {});
  ok('the saved conversation restores with its context chip', await until(async () => (await dock.locator(`[data-context-chip][data-ref-key]`).count()) > 0), await chatContext());

  // 1. Chat busy: the answer streams (held), a draft is typed, and a Ctrl+K /quiz on the Photosynthesis card is refused.
  // Ask mode: the turn goes to /api/learn/ask (held here), not the Tutor (aborted), as chat-generation-check does.
  const modeButton = dock.getByRole('button', { name: 'Mode', exact: true });
  if ((await modeButton.getAttribute('data-chat-mode')) !== 'ask') { await modeButton.click(); await page.locator('[data-chat-mode-option="ask"]').click(); }
  await until(async () => (await modeButton.getAttribute('data-chat-mode')) === 'ask');
  await composer().fill('Why is the sky blue?');
  await composer().press('Enter');
  ok('the Chat is answering (busy)', await until(async () => asks.length === 1 && await stop.isVisible()));
  await composer().fill('my own draft');
  await pick(PHOTO.id);
  await ctrlk('/quiz photosynthesis');
  const shown = await refused.waitFor({ timeout: 10000 }).then(() => refused.innerText()).catch(() => '');
  await shot('01-refused-busy');
  ok('busy: Ctrl+K stays open and says the busy text', (await editor.count()) === 1 && shown.trim() === HANDOFF_REFUSED, shown);
  const kept = `${await editor.locator('[data-command-pill]').allInnerTexts().then(t => t.join(' '))} ${await field.inputValue()}`;
  ok('busy: Ctrl+K keeps its command', /quiz/.test(kept) && /photosynthesis/.test(kept), kept);
  ok('busy: nothing is sent and the Chat draft is unchanged', briefs.length === 0 && await composer().inputValue() === 'my own draft', `${briefs.length} briefs, draft "${await composer().inputValue()}"`);

  // 2. The answer ends; the same line, sent again from Ctrl+K, is taken: about Ctrl+K's own card, and the draft stays.
  release();
  ok('the answer ends', await until(async () => !(await stop.isVisible())));
  await field.press('Enter');
  ok('taken: Ctrl+K closes once Chat takes the command', await until(async () => (await editor.count()) === 0));
  const first = briefs[0];
  ok('taken: the brief request is /quiz about the Photosynthesis card, never a revision', briefs.length === 1 && first.command === 'quiz' && /photosynthesis/.test(first.request) && first.selection?.id === PHOTO.id && first.revise === undefined, JSON.stringify(first || null).slice(0, 200));
  ok('taken: the Chat draft is unchanged', await composer().inputValue() === 'my own draft');
  // The brief names the card by its plain title, never its structured content as JSON; the card's words still ride as context.
  ok('taken: the brief\'s selection title is the card\'s plain title', first?.selection?.title === PHOTO.title && /Plants use light energy/.test(first?.context || ''), `${first?.selection?.title} | ${String(first?.context).slice(0, 80)}`);

  // 3. An Edit target armed on that brief; a Ctrl+K /diagram on the Forces card is its own brief and leaves the Chat's context alone.
  const brief = dock.locator('[data-generation-proposal="quiz"][data-proposal-active="true"]').last();
  await brief.waitFor({ timeout: 10000 });
  await brief.locator('[data-proposal-edit]').click();
  await editChip.waitFor({ timeout: 10000 });
  await pick(FORCE.id);
  const before = await chatContext();
  await ctrlk('/diagram the forces on a falling apple');
  await until(async () => briefs.length === 2 && (await editor.count()) === 0);
  await dock.locator('[data-generation-proposal="diagram"]').last().waitFor({ timeout: 10000 }).catch(() => {});
  await shot('02-isolated-success');
  const second = briefs[1];
  ok('success: a new /diagram brief about the Forces card, never the Chat\'s Edit', !!second && second.command === 'diagram' && second.selection?.id === FORCE.id && second.revise === undefined, JSON.stringify(second || null).slice(0, 200));
  const afterSuccess = await chatContext();
  ok('success: the Chat draft, context chips and Edit target are unchanged', afterSuccess === before && JSON.parse(before).edit.length === 1, `${before} -> ${afterSuccess}`);

  // 4. The brief request fails: Chat says why; the Chat's context is still unchanged.
  await pick(PHOTO.id);
  const beforeFail = await chatContext();
  failNext = true;
  await ctrlk('/flashcards photosynthesis');
  const said = await dock.getByText('Say what it should be about, or select a card first.').first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  await shot('03-isolated-failure');
  const afterFail = await chatContext();
  ok('failure: Chat says why, and the Chat draft, context chips and Edit target are unchanged', said && briefs.length === 3 && briefs[2].revise === undefined && afterFail === beforeFail && JSON.parse(beforeFail).edit.length === 1, `said ${said}; ${beforeFail} -> ${afterFail}`);

  // 5. Slash pills (owner brief 2026-10-29, BRIEF-PILLS): a second canvas whose page is told image generation is offered (MOCKED
  // GET /api/learn/image-jobs). The /image plan route is MOCKED to refuse and records what was sent; the photo search is aborted and
  // recorded. Nothing is generated or searched.
  await page.close();
  const pills = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Slash pills ${run}` }) });
  await api(`/api/learn/boards/${pills.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [PHOTO] } }) });
  // A legacy message saved by the old /image (the photo search) with no command metadata: it restores as the photos pill.
  const legacy = `canvaschat-${crypto.randomUUID()}`;
  await api(`/api/learn/chat/threads/${legacy}/messages`, { method: 'POST', body: JSON.stringify({ app: pills.name, client_id: 'l1-u', role: 'user', content: '/image Mount Fuji', title: 'Legacy' }) });
  await api(`/api/learn/chat/threads/${legacy}/messages`, { method: 'POST', body: JSON.stringify({ app: pills.name, client_id: 'l1-a', role: 'assistant', content: 'Added an image card.' }) });
  await context.route(/\/api\/learn\/image-jobs(\?|$)/, route => route.fulfill({ json: { available: true } }));
  const plans = [], photos = [];
  await context.route('**/api/learn/chat/image-proposals', route => { plans.push(route.request().postDataJSON()); return route.fulfill({ status: 400, json: { error: 'Image plans are not made in this check.' } }); });
  await context.route('**/api/learn/photos**', route => { photos.push(new URL(route.request().url()).searchParams.toString()); return route.abort(); });
  const p2 = await context.newPage();
  p2.setDefaultTimeout(15000);
  p2.on('pageerror', error => errors.push(error.message.slice(0, 160)));
  await p2.goto(`${BASE}/apps/${pills.name}`);
  await p2.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
  await p2.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 30000 });
  const dock2 = p2.locator('[data-chat-pane]');
  const box = () => p2.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
  const chatPill = dock2.locator('[data-chat-composer] [data-command-pill]');
  const pillIs = async (id, typed, text) => (await chatPill.count()) === 1 && await chatPill.getAttribute('data-command-pill') === id && (await chatPill.innerText()).trim() === typed && await box().inputValue() === text;
  const seen = async () => `${await chatPill.getAttribute('data-command-pill').catch(() => 'none')}/${await chatPill.innerText().catch(() => '')}/"${await box().inputValue()}"`;
  await dock2.getByText('Added an image card.').first().waitFor({ timeout: 10000 }).catch(() => {});
  const restored = dock2.locator('div.rounded-lg.bg-hover', { hasText: 'Mount Fuji' }).locator('[data-command-pill]');
  ok('Chat: a legacy saved /image message restores as the photos pill (id image)', await restored.getAttribute('data-command-pill').catch(() => null) === 'image' && (await restored.innerText().catch(() => '')).trim() === 'photos');
  const mode2 = dock2.getByRole('button', { name: 'Mode', exact: true });
  if ((await mode2.getAttribute('data-chat-mode')) !== 'ask') { await mode2.click(); await p2.locator('[data-chat-mode-option="ask"]').click(); }
  await until(async () => (await mode2.getAttribute('data-chat-mode')) === 'ask');
  // Typed with a separator: /image is the generation pill, and /photos then replaces it with the photo search pill (never left beside it).
  await box().fill('/quiz ');
  await box().fill('/image ');
  ok('Chat: typed "/image " replaces the quiz pill with the image pill (id generate-image)', await pillIs('generate-image', 'image', ''), await seen());
  await box().fill('/photos ');
  ok('Chat: typed "/photos " replaces it with the photos pill (id image), no stale pill', await pillIs('image', 'photos', ''), await seen());
  await box().fill('/photo ');
  ok('Chat: the /photo alias is the photos pill', await pillIs('image', 'photos', ''), await seen());
  // Uppercase, then words; the x keeps the words; a picked command (mouse) keeps them too.
  await box().fill('/IMAGE ');
  await box().fill('a red fox');
  ok('Chat: uppercase "/IMAGE " is the image pill', await pillIs('generate-image', 'image', 'a red fox'), await seen());
  await dock2.getByRole('button', { name: 'Remove Image generation', exact: true }).click();
  ok('Chat: removing the pill keeps the words', (await chatPill.count()) === 0 && await box().inputValue() === 'a red fox', await seen());
  await dock2.locator('[data-command-slot]').click();
  await dock2.locator('[data-slash-command="image"]').click();
  ok('Chat: picking /photos (mouse) shows the photos pill and keeps the words', await pillIs('image', 'photos', 'a red fox'), await seen());
  await dock2.locator('[data-chat-composer] [data-command-pill] button[title="Change the command"]').click();
  await p2.keyboard.type('image gen');
  await p2.keyboard.press('Enter');
  ok('Chat: choosing /image by keyboard replaces it and keeps the words', await pillIs('generate-image', 'image', 'a red fox'), await seen());
  await box().press('Enter');
  ok('Chat: the image pill sends /image (the image plan request), never a photo search', await until(() => plans.length === 1) && /a red fox/.test(plans[0]?.prompt || '') && photos.length === 0, `${JSON.stringify(plans)} photos ${photos.length}`);
  // Pasted with its words: the photos pill and the words; Send is the photo search line, saved and restored as photos.
  await box().fill('/photos Mount Fuji at dawn');
  ok('Chat: pasted "/photos <words>" becomes the photos pill and keeps the words', await pillIs('image', 'photos', 'Mount Fuji at dawn'), await seen());
  await box().press('Enter');
  const sentPhotos = dock2.locator('div.rounded-lg.bg-hover', { hasText: 'Mount Fuji at dawn' }).filter({ has: p2.locator('[data-command-pill="image"]') });
  ok('Chat: the photos pill sends /photos (a photo search card, no image plan)', await until(async () => (await sentPhotos.count()) === 1 && photos.some(query => /Mount\+Fuji\+at\+dawn/.test(query))) && plans.length === 1, `${photos.join(' ')} plans ${plans.length}`);
  await shot('04-chat-pills');
  // Ctrl+K: picked /explain shows its pill; a typed leading /image replaces a selected /quiz (never "/quiz /image cat").
  await box().fill('chat draft stays');
  await p2.locator(`[data-block-id="${PHOTO.id}"] [data-drag-zone]`).first().click();
  await p2.keyboard.press('Control+k');
  const editor2 = p2.locator('[data-inline-ai]'), field2 = p2.locator('[data-inline-prompt]');
  await editor2.waitFor({ timeout: 10000 });
  await field2.fill('/');
  await p2.locator('[data-inline-command-option="explain"]').click();
  ok('Ctrl+K: picked /explain shows the explain pill', (await editor2.locator('[data-command-pill="explain"]').count()) === 1 && (await editor2.locator('[data-command-pill]').innerText()).trim() === 'explain');
  await editor2.getByRole('button', { name: 'Remove Explanation', exact: true }).click();
  await field2.fill('/');
  await p2.locator('[data-inline-command-option="quiz"]').click();
  await field2.fill('/image cat');
  await field2.press('Enter');
  ok('Ctrl+K: selected quiz + "/image cat" sends /image cat (the image plan), not "/quiz /image cat"', await until(() => plans.length === 2) && plans[1]?.prompt === 'cat' && briefs.length === 3, `${JSON.stringify(plans[1] || null)} briefs ${briefs.length}`);
  ok('Ctrl+K: the Chat draft is unchanged', await box().inputValue() === 'chat draft stays', await box().inputValue());
  await shot('05-ctrlk-pills');
  ok('no model route was called and the page raised no error', model.length === 0 && errors.length === 0, [...model, ...errors].join(' | '));
} catch (error) {
  failed += 1;
  console.log(`FAIL  ${error.message.split('\n')[0]}`);
  await shot('FAIL');
} finally {
  release();
  await browser.close();
}
console.log(`${passed}/${total} checks passed`);
process.exit(failed || passed !== total ? 1 : 0);
