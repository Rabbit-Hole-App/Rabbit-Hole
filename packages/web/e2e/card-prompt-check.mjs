// A generated card's Prompt control (docs/features/card-prompt.md; owner brief 2026-10-23 and owner correction 2026-10-23: the card's
// top-right "course" pill is gone; a card with a stored prompt shows a Prompt control there on hover, focus or selection, and clicking
// it opens a popover to the right of the card with the exact words and Copy that stays until an outside press or Escape), against
// the LOCAL stack only. The board save is REAL: what a fresh browser and a share link show is what the server stored. Only
// /api/learn/artifact and the CAD job routes are answered in the browser; every other model-capable request is aborted and
// counted, so no model is ever called.
//   1. /explain from the Chat box makes a card that shows no prompt and no "course" pill at rest; hovering it shows Prompt;
//   2. opened, the popover shows the typed line exactly, stays when the pointer leaves, and an outside press, Escape and the keyboard work;
//   3. Copy puts the line on the clipboard;
//   4. opening and Copy send nothing and leave the Chat box alone (the earlier chat icon is gone);
//   5. /cad (Generate) makes a CAD card whose prompt holds its typed line, kept while the job is polled;
//   6. a CAD edit that is rejected leaves the line; an accepted edit's words replace it;
//   7. the same through the CAD card's own Accept and Reject, and an Accept after a reload: the words come from the server's
//      Accept answer (as the real service: status and list never carry them), and the board never holds a pending edit's;
//   8. a corner resize keeps the height the card had at release;
//   9. the server's board holds both prompts; a card made before this (no prompt) has no control; a chat card's prompt is its question;
//  10. a fresh browser shows no prompt at rest and the same two prompts when asked;
//  11. a share-link viewer (no hover on a view-only board: the selected card shows the control) sees Copy and no chat action, and only the
//      accepted CAD prompt while an edit waits;
//  12. the popover sits right of the card with room and stays inside a narrow window (flipped left or clamped), a long prompt scrolls
//      inside it, and no card shows the word "course".
// Before this change step 1 fails: no card has a Prompt control.
// Usage: BASE=http://127.0.0.1:9121 SMALL_CP=http://127.0.0.1:9123 VARS=<cp .dev.vars> node e2e/card-prompt-check.mjs [shotsDir]
//   or CLONE=1 BASE=https://rabbit-hole-web-dev-card-prompt.tryrabbithole.workers.dev SMALL_CP=https://rabbit-hole-cp-dev.tryrabbithole.workers.dev VARS=<file with the dev TEST_BYPASS_SECRET>
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9121';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9123';
// CLONE=1: this branch's own dev clone with the dev control plane only (docs/features/parallel-dev-deploys.md), never the
// shared preview or production. Model routes stay stubbed or aborted in the browser either way.
const CLONE = process.env.CLONE === '1' && BASE === 'https://rabbit-hole-web-dev-card-prompt.tryrabbithole.workers.dev' && CP === 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
for (const url of [BASE, CP]) if (!CLONE && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('card-prompt-check runs against the local stack (or CLONE=1 on its own dev clone) only');
const OUT = process.argv[2] || 'card-prompt-shots';
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cpr-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, origin: BASE, 'content-type': 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};

// ---------------------------------------------------------------- setup: a canvas holding an older card and a chat card
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Card prompts ${run}` }) });
const OLD = { id: 'old-card', type: 'explanation', title: 'Made before prompts', body: 'No prompt was kept for this card.', dx: 900, dy: 0 };
const CHAT = { id: 'chat-card', question: 'What does softmax do to scores?', answer: 'It turns them into probabilities.', status: 'done', linkFrom: null, dx: 900, dy: 500 };
const board = () => api(`/api/learn/boards/${canvas.name}/main`).then(out => out.state);
await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [CHAT], blocks: [OLD] } }) });

// ---------------------------------------------------------------- routes: the board stays real; the model never runs
const EXPLAIN_LINE = '/explain why a token id is only an index';
const CAD_LINE = '/cad a 40 mm mounting bracket with two holes';
const EXPLAIN = { type: 'explanation', title: 'A token id is only an index', body: 'The embedding table turns the index into a learned vector.' };
const EDIT_WORDS = 'Make the holes 6 mm', REJECTED_WORDS = 'Make it out of glass';
const CARD_WORDS = 'Round the outer corners', RELOAD_WORDS = 'Add a 2 mm chamfer', CARD_REJECT = 'Make it twice as tall', PENDING_WORDS = 'Engrave a logo';
const manifest = revisionId => ({ schema: 'cad-model/1', revisionId, title: 'Mounting bracket', units: 'mm', parameters: { length: 40 }, assumptions: ['Fixture.'], validation: { baselinePassed: true, checks: [], unchecked: [] }, artifacts: [] });
let cadBlock = { type: 'cad', id: 'cad-prompt', jobId: 'cad-job', modelId: 'cad-model', revisionId: null, status: 'queued', title: 'Mounting bracket', units: 'mm', briefSummary: 'Fixture.' };
const cadJobs = { 'cad-job': { id: 'cad-job', cardId: 'cad-prompt', modelId: 'cad-model', state: 'queued', stage: 'queued', attempt: 1, createdAt: Date.now(), updatedAt: Date.now() } };
let edits = 0;
const jobWords = {}, accepts = [];
// The CAD service, scripted: a first job, then edit jobs that wait for Accept; Reject (cancel) and Accept settle them.
const cadReply = (request, url) => {
  const body = request.method() === 'POST' ? request.postDataJSON() || {} : null;
  if (body) cadStarts.push({ path: url.pathname, ...body });
  if (request.method() === 'POST' && url.pathname === '/api/learn/cad/jobs' && body.cardId) {
    const id = `cad-edit-${++edits}`, revisionId = `revision-${edits + 1}`;
    cadJobs[id] = { id, cardId: cadBlock.id, modelId: 'cad-model', state: 'ready', stage: 'ready', attempt: 1, baseRevisionId: cadBlock.revisionId, revisionId, awaitingAccept: true, manifest: manifest(revisionId), createdAt: Date.now(), updatedAt: Date.now() };
    jobWords[id] = body.prompt; // private to the job, as the service keeps it: never in a job or block answer
    cadBlock = { ...cadBlock, jobId: id, proposedRevisionId: revisionId };
    return { job: cadJobs[id], block: cadBlock };
  }
  const [, id, action] = url.pathname.match(/^\/api\/learn\/cad\/jobs\/([^/]+)(?:\/(\w+))?$/) || [];
  if (action === 'cancel') { cadJobs[id] = { ...cadJobs[id], state: 'cancelled', awaitingAccept: false }; const { proposedRevisionId, ...rest } = cadBlock; cadBlock = rest; }
  if (action === 'accept') {
    const job = cadJobs[id];
    if (job.awaitingAccept) { cadJobs[id] = { ...job, awaitingAccept: false }; const { proposedRevisionId, ...rest } = cadBlock; cadBlock = { ...rest, revisionId: job.revisionId, manifest: job.manifest, acceptedManifest: job.manifest }; }
    // As cad-jobs.js acceptedResponse: only Accept answers the accepted revision's words, and a repeat answers the same.
    accepts.push(id);
    return { job: cadJobs[id], block: { ...cadBlock, promptUsed: jobWords[id] } };
  }
  if (id) return { job: cadJobs[id], block: cadBlock };
  return request.method() === 'GET' ? { jobs: Object.values(cadJobs), blocks: [cadBlock] } : { job: cadJobs['cad-job'], block: cadBlock };
};
const cadReady = () => { cadJobs['cad-job'] = { ...cadJobs['cad-job'], state: 'ready', stage: 'ready', revisionId: 'revision-1', manifest: manifest('revision-1') }; cadBlock = { ...cadBlock, status: 'ready', revisionId: 'revision-1', manifest: manifest('revision-1'), acceptedManifest: manifest('revision-1') }; };
const posts = [], refused = [], outside = [], errors = [], cadStarts = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|board$|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) { outside.push(url.hostname); return route.abort(); }
  if (url.pathname === '/api/learn/artifact') { posts.push(request.postDataJSON()); return route.fulfill({ json: { result: 'artifact', primitive: 'explanation', block: EXPLAIN } }); }
  if (url.pathname.startsWith('/api/learn/cad/jobs')) return route.fulfill({ json: cadReply(request, url) });
  if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(url.pathname)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
  if (MODEL.test(url.pathname) && request.method() !== 'GET') { refused.push(url.pathname); return route.abort(); }
  return route.fallback();
};

const results = [];
const total = 12;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const browser = await chromium.launch();
const open = async ({ signedIn = true, path = `/apps/${canvas.name}` } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  if (signedIn) await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', router);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}${path}`);
  return { context, page };
};
// The popover is portalled to the body (outside the zoomed canvas), so it is found on the page, one open at a time.
const rowOf = page => page.locator('[data-card-prompt]');
const cardOf = (page, id) => page.locator(`[data-block-id="${id}"]`);
const showOf = (page, id) => cardOf(page, id).locator('[data-card-prompt-button]');
// Opens a card's prompt the way a person does: hover, then Prompt. A view-only board has no hover, so there the click selects
// the card and the selected card shows the button.
const reveal = async (page, id) => {
  await hide(page); // one popover at a time: close whichever card's is open
  await cardOf(page, id).hover();
  await showOf(page, id).waitFor({ timeout: 1500 }).catch(async () => { const box = await cardOf(page, id).boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); });
  await showOf(page, id).click();
  await rowOf(page).waitFor();
};
const hide = async page => { if (await rowOf(page).count()) { await page.keyboard.press('Escape'); await rowOf(page).waitFor({ state: 'detached' }); } };
const composerOf = page => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"])').first();
const send = async (page, text) => { const box = composerOf(page); await box.click(); await box.fill(text); await page.waitForTimeout(150); await box.press('Enter'); };
const newCardId = async page => {
  const ids = await page.locator('[data-block-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-block-id')));
  return ids.find(id => ![OLD.id, CHAT.id, cadBlock.id].includes(id) && !id.startsWith('slot'));
};

let first = await open(), page = first.page, explainId = null;
await page.locator(`[data-block-id="${OLD.id}"]`).waitFor({ timeout: 60000 });

await step('/explain makes a card that shows no prompt at rest; hovering it shows Prompt', async () => {
  await send(page, EXPLAIN_LINE);
  await until(async () => !!(explainId = await newCardId(page)), 'no new card');
  await page.mouse.move(2, 2);
  await until(async () => (await showOf(page, explainId).count()) === 0, 'a button shows at rest');
  assert.equal(await rowOf(page).count(), 0, 'at rest: no prompt, no Copy, no footer');
  assert.ok(!/course/i.test(await cardOf(page, explainId).innerText()), 'no course pill');
  await cardOf(page, explainId).hover();
  await showOf(page, explainId).waitFor();
  assert.equal(await showOf(page, explainId).innerText(), 'Prompt');
  assert.equal(await rowOf(page).count(), 0, 'the words wait for a click');
  assert.ok(!/course/i.test(await cardOf(page, explainId).innerText()), 'hovered, the slot holds Prompt, never the course pill');
  assert.equal(posts.length, 1);
  await page.screenshot({ path: `${OUT}/1-closed.png` });
});

await step('opened, it shows the typed line exactly, stays open when the pointer leaves, and an outside press, the keyboard and Escape work', async () => {
  await reveal(page, explainId);
  assert.equal(await rowOf(page).locator('[data-card-prompt-text]').innerText(), EXPLAIN_LINE);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(500);
  assert.equal(await rowOf(page).count(), 1, 'the opened prompt stays after the pointer leaves');
  const box = await rowOf(page).boundingBox(), cardBox = await cardOf(page, explainId).boundingBox();
  assert.ok(box.x >= cardBox.x + cardBox.width - 1 || box.x + box.width <= cardBox.x + 1, 'the popover sits beside the card, not over it');
  await cardOf(page, OLD.id).click({ position: { x: 24, y: 12 } }); // an outside press: selecting another card
  await until(async () => (await rowOf(page).count()) === 0, 'an outside press did not close it');
  await cardOf(page, explainId).focus(); // the card is reachable by Tab; focus in it draws Prompt
  await showOf(page, explainId).waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-card-prompt-button')), true, 'Tab from the focused card reaches Prompt');
  await page.keyboard.press('Enter');
  await rowOf(page).waitFor();
  await page.keyboard.press('Escape');
  await until(async () => (await rowOf(page).count()) === 0, 'Escape did not close it');
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-card-prompt-button')), true, 'focus returns to Prompt');
  await reveal(page, explainId);
  await page.screenshot({ path: `${OUT}/2-open.png` });
});

await step('Copy puts the line on the clipboard', async () => {
  await page.evaluate(() => navigator.clipboard.writeText('before'));
  await rowOf(page).locator('[data-card-prompt-copy]').click();
  await until(async () => (await page.evaluate(() => navigator.clipboard.readText())) === EXPLAIN_LINE, 'clipboard does not hold the prompt');
  assert.equal(await rowOf(page).getByRole('status').innerText(), 'Copied');
});

await step('opening and Copy send nothing and leave the Chat box alone; there is no chat icon', async () => {
  const before = posts.length + refused.length;
  await composerOf(page).fill('');
  await rowOf(page).locator('[data-card-prompt-copy]').click();
  assert.equal(await rowOf(page).locator('[data-card-prompt-chat], [aria-label="Put prompt in chat"]').count(), 0, 'the earlier chat icon is gone');
  await page.waitForTimeout(800);
  assert.equal(posts.length + refused.length, before, 'nothing was sent');
  assert.equal(await composerOf(page).inputValue(), '', 'the Chat box was not touched');
});

await step('/cad makes a CAD card whose prompt holds its typed line, kept while the job is polled', async () => {
  await send(page, CAD_LINE);
  await page.locator('[data-chat-pane] [data-paid-generate]').click();
  await cardOf(page, cadBlock.id).waitFor();
  assert.equal(cadStarts.find(c => c.path === '/api/learn/cad/jobs')?.prompt, 'a 40 mm mounting bracket with two holes', 'the job gets the words after the command');
  await reveal(page, cadBlock.id);
  assert.equal(await rowOf(page).locator('[data-card-prompt-text]').innerText(), CAD_LINE);
  await page.waitForTimeout(6000); // the card polls its job (2.5 s); a polled block carries no prompt
  assert.equal(await rowOf(page).locator('[data-card-prompt-text]').innerText(), CAD_LINE);
  await page.screenshot({ path: `${OUT}/5-cad.png` });
});

const cadText = async () => { await reveal(page, cadBlock.id); return rowOf(page).locator('[data-card-prompt-text]').innerText(); };
const editCad = async words => {
  const editor = page.locator('[data-inline-ai]');
  // No Edit button on the card any more (UI changes brief section 4): select it, Ctrl+K, Edit mode.
  await page.locator(`[data-block-id="${cadBlock.id}"] [data-drag-zone]`).first().click();
  await page.keyboard.press('Control+k');
  await editor.locator('[data-inline-mode-toggle]').click();
  await editor.locator('[data-inline-mode="edit"]').click();
  await editor.locator('[data-inline-prompt]').fill(words);
  await editor.locator('[data-inline-submit]').click();
  await editor.locator('[data-paid-generate]').click();
  return editor;
};
await step('a rejected CAD edit leaves the typed line; an accepted edit replaces it with the edit words', async () => {
  cadReady();
  await page.reload(); // as cad-check: the ready job reaches the card through the page's own job list
  await page.locator(`[data-block-id="${cadBlock.id}"] [data-cad-state="ready"]`).waitFor();
  await reveal(page, cadBlock.id);
  let editor = await editCad(REJECTED_WORDS);
  await editor.locator('[data-inline-reject]').click();
  await until(async () => !cadBlock.proposedRevisionId, 'the edit was not rejected');
  await page.waitForTimeout(3000);
  assert.equal(await cadText(), CAD_LINE, 'a rejected edit keeps the card prompt');
  editor = await editCad(EDIT_WORDS);
  await editor.locator('[data-inline-accept]').click();
  await until(async () => (await cadText()) === EDIT_WORDS, 'the accepted edit words are not the prompt');
  assert.deepEqual(cadStarts.filter(c => c.path === '/api/learn/cad/jobs').map(c => c.prompt), ['a 40 mm mounting bracket with two holes', REJECTED_WORDS, EDIT_WORDS]);
});

const cadAction = name => page.locator(`[data-block-id="${cadBlock.id}"] [data-cad-action="${name}"]`);
const closeEditor = async () => { await page.locator('[data-inline-ai] [data-inline-close]').click(); await until(async () => (await page.locator('[data-inline-ai]').count()) === 0, 'the editor stayed open'); };
const awaiting = async () => { await until(async () => !!cadBlock.proposedRevisionId && (await cadAction('accept').isVisible()), 'the card never offered Accept'); await hide(page); }; // the popover is open from the last read: close it first
await step('the card Accept, an Accept after a reload and the card Reject: the accepted revision words, from the server', async () => {
  await editCad(CARD_WORDS);
  await closeEditor();
  await awaiting();
  await cadAction('accept').click();
  await until(async () => (await cadText()) === CARD_WORDS, 'the card Accept did not take the accepted words');
  await editCad(RELOAD_WORDS);
  await closeEditor();
  await page.waitForTimeout(2500); // the board saves; it must not hold a pending edit's words
  assert.ok(!JSON.stringify(await board()).includes(RELOAD_WORDS), 'the board holds no pending edit words');
  await page.reload();
  assert.equal(await cadText(), CARD_WORDS, 'after a reload the card still shows the accepted prompt');
  await awaiting();
  await cadAction('accept').click();
  await until(async () => (await cadText()) === RELOAD_WORDS, 'an Accept after a reload did not take the accepted words');
  await editCad(CARD_REJECT);
  await closeEditor();
  await awaiting();
  await page.locator(`[data-block-id="${cadBlock.id}"]`).getByRole('button', { name: 'Reject', exact: true }).click();
  await until(async () => !cadBlock.proposedRevisionId, 'the card Reject did not reject');
  await page.waitForTimeout(3000);
  assert.equal(await cadText(), RELOAD_WORDS, 'a card Reject keeps the accepted prompt');
  assert.ok(accepts.length >= 3, `three accepts reached the service (${accepts.length})`);
});

await step('a corner resize keeps the height the card had at release', async () => {
  await hide(page); // the popover is open from the last read: close it first
  const card = page.locator(`[data-block-id="${explainId}"]`);
  await card.hover();
  const handle = card.getByRole('button', { name: 'Resize chat block' });
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 90, { steps: 8 });
  const held = (await card.boundingBox()).height;
  await page.mouse.up();
  await page.waitForTimeout(600);
  const after = (await card.boundingBox()).height;
  assert.ok(Math.abs(after - held) <= 2, `height at release ${held}, after ${after}`);
});

await step('the server board holds both prompts; the older card has no control; the chat card prompt is its question', async () => {
  await until(async () => { const state = await board(); return state.blocks.find(b => b.id === explainId)?.promptUsed === EXPLAIN_LINE && state.blocks.find(b => b.id === cadBlock.id)?.promptUsed === RELOAD_WORDS; }, 'the saved board lacks the prompts', 20000);
  assert.ok(!Object.hasOwn((await board()).blocks.find(b => b.id === OLD.id), 'promptUsed'));
  assert.equal(await rowOf(page).count(), 0);
  await cardOf(page, OLD.id).hover();
  await page.waitForTimeout(300);
  assert.equal(await showOf(page, OLD.id).count(), 0, 'a card with no stored prompt has no Prompt control');
  await reveal(page, CHAT.id);
  const chatRow = rowOf(page);
  assert.equal(await chatRow.locator('[data-card-prompt-text]').innerText(), CHAT.question);
});
await first.context.close();

const second = await open();
await step('a fresh browser shows no prompt at rest and the same two prompts when asked', async () => {
  await cardOf(second.page, explainId).waitFor({ timeout: 60000 });
  for (const id of [explainId, cadBlock.id]) assert.equal(await rowOf(second.page).count(), 0, `${id}: closed on every load`);
  await reveal(second.page, explainId);
  assert.equal(await rowOf(second.page).locator('[data-card-prompt-text]').innerText(), EXPLAIN_LINE);
  await reveal(second.page, cadBlock.id);
  assert.equal(await rowOf(second.page).locator('[data-card-prompt-text]').innerText(), RELOAD_WORDS);
  // An edit left waiting for Accept while the canvas is shared next.
  page = second.page;
  await editCad(PENDING_WORDS);
  await closeEditor();
  await awaiting();
  await page.waitForTimeout(2500);
});

const shared = await api(`/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: await board() }) });
const viewer = await open({ signedIn: false, path: `/b/${shared.sharing.view}` });
await step('a share-link viewer, by selecting the card, sees Copy and no chat action, and only the accepted CAD prompt', async () => {
  await cardOf(viewer.page, explainId).waitFor({ timeout: 60000 });
  assert.equal(await rowOf(viewer.page).count(), 0, 'closed at rest for a viewer too');
  await reveal(viewer.page, explainId);
  assert.equal(await rowOf(viewer.page).locator('[data-card-prompt-copy]').count(), 1);
  assert.equal(await rowOf(viewer.page).locator('[data-card-prompt-chat], [aria-label="Put prompt in chat"]').count(), 0, 'a viewer has no Chat action');
  assert.equal(await rowOf(viewer.page).locator('[data-card-prompt-text]').innerText(), EXPLAIN_LINE);
  await reveal(viewer.page, cadBlock.id);
  assert.equal(await rowOf(viewer.page).locator('[data-card-prompt-text]').innerText(), RELOAD_WORDS, 'the viewer sees the accepted CAD prompt');
  const seen = JSON.stringify(await board()) + await viewer.page.content();
  for (const words of [PENDING_WORDS, CARD_REJECT, REJECTED_WORDS]) assert.ok(!seen.includes(words), `"${words}" (never accepted) reaches neither the board nor the viewer`);
  await viewer.page.screenshot({ path: `${OUT}/8-shared.png` });
});
await step('the popover stays inside the window beside its card, and no card shows the word course', async () => {
  const p = second.page;
  for (const id of [OLD.id, CHAT.id, explainId, cadBlock.id]) {
    await hide(p);
    await cardOf(p, id).hover();
    assert.ok(!/course/i.test(await cardOf(p, id).innerText()), `${id}: no course pill`);
  }
  const view = p.viewportSize();
  for (const id of [CHAT.id, explainId]) {
    await reveal(p, id);
    const box = await rowOf(p).boundingBox(), side = await rowOf(p).getAttribute('data-card-prompt-side');
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height, `${id}: inside the window (${side})`);
    const card = await cardOf(p, id).boundingBox();
    assert.ok(side === 'over' || (side === 'right' ? box.x >= card.x + card.width - 1 : box.x + box.width <= card.x + 1), `${id}: beside the card (${side})`);
  }
  await p.screenshot({ path: `${OUT}/9-popover.png` });
});
await second.context.close();
await browser.close();

const passed = results.filter(Boolean).length;
// Outside hosts (the notebook origin's preload) are aborted and listed, as in pdf-excerpt-chat-state-check; they reach no model.
const clean = !refused.length && !errors.length;
console.log(`${clean ? 'ok' : 'FAIL'} no model call beyond the stubbed routes (${refused.join(', ') || 'none refused'}), no page error${errors.length ? `: ${errors.join(' | ')}` : ''}; outside hosts aborted: ${[...new Set(outside)].join(', ') || 'none'}`);
console.log(`${passed}/${total} passed`);
process.exit(passed === total && results.length === total && clean ? 0 : 1);
