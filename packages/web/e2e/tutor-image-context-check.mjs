// Image context through the Tutor, in the browser (beta hardening item 1, owner 2026-10-09; written test-first by the
// evaluation lane on main 431f0124, where the checks marked [fix] fail). Against the KEYLESS journey stack only
// (e2e/journey-local-stack.md): the Tutor's planner, Learn's ask and the shared ask are answered in the page, so nothing
// reaches a model, and the provider tripwire must count 0. What the server does with the reference - authorizes it
// against the caller's board, reads the bytes, puts them in the provider request, says when an image is unavailable - is
// test/learn-tutor-image-context.test.js; this check covers the page: which reference each kind of image puts on the
// Tutor turn, that a detached image sends none, and that the reply's notice is shown.
//   S  a selected image card rides the turn ({block_id}, or its own media id)            [fix]
//   A  an image attached through the card menu (Show the tutor this image) rides it       [fix]
//   R  an area captured with Ask about selection rides it by the capture's upload id      [fix]
//   G  a group's Ask in chat rides it by the group snapshot's upload id                   [fix]
//   D  detached - the selected card's pill removed, the attached image detached - sends no image_context
//   N  the plan reply's notice (an image the server could not read) is shown on the page  [fix]
//   V  a shared viewer's question carries the selected image card's id, and the done event's notice shows
//   F  a fork of the shared canvas shows the copied image, and its selected card rides by its block id [fix]
// Usage: TUTOR_BASE=http://127.0.0.1:8898 SMALL_CP=http://127.0.0.1:8899 TEST_BYPASS_SECRET=... node e2e/tutor-image-context-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.TUTOR_BASE || 'http://127.0.0.1:8898';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8899';
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('tutor-image-context-check runs against a local stack only');
const secret = process.env.TEST_BYPASS_SECRET;
if (!secret) throw Error('TEST_BYPASS_SECRET is required (the stack\'s own, from its vars file)');
const SHOTS = process.argv[2] || 'e2e/shots/tutor-image-context';
mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const tripwire = async origin => { const body = await (await fetch(`${origin}/__provider-tripwire`).catch(() => null))?.json().catch(() => null); return body ? body.hits.length : null; };
const trippedBefore = [await tripwire(BASE), await tripwire(CP)];

// A 2x2 PNG (four colours), so a capture of it is a real picture.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const KEY = 'drop:e2e-image-context';
const run = Date.now().toString(36);
const sessionFor = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const owner = { email: `image-owner-${run}@example.com` }, viewer = { email: `image-viewer-${run}@example.org` };
owner.session = await sessionFor(owner.email); viewer.session = await sessionFor(viewer.email);
const api = (who, path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, ...(init.headers || {}) } });
const json = async (who, path, method = 'GET', body) => (await api(who, path, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) })).json();

// ---------- The owner's canvas: an image card (with its server media copy and its board file), and a group of two cards ----------
const canvas = (await json(owner, '/api/canvases', 'POST', { title: 'Image context check' })).name;
const form = new FormData();
form.append('file', new Blob([PNG], { type: 'image/png' }), 'diagram.png');
const media = await (await api(owner, `/api/learn/media?app=${canvas}`, { method: 'POST', body: form })).json();
if (!/^media:[0-9a-f]{12}$/.test(media.id ?? '')) throw Error(`the image upload failed: ${JSON.stringify(media)}`);
const STATE = {
  strokes: [], shapes: [], items: [], links: [], areas: [], exchanges: [],
  groups: [{ id: 'g1', label: 'Two ideas' }],
  blocks: [
    { id: 'img1', type: 'file', kind: 'image', dx: 0, dy: 0, assetKey: KEY, label: 'diagram.png', mediaId: media.id },
    { id: 'b1', type: 'explanation', dx: 0, dy: 0, title: 'Weighted sum', body: 'Each input times its weight, added up.', groupId: 'g1' },
    { id: 'b2', type: 'explanation', dx: 0, dy: 0, title: 'Squashing', body: 'The sigmoid turns the sum into a probability.', groupId: 'g1' },
  ],
};
const saved = await json(owner, `/api/learn/boards/${canvas}/main`, 'PUT', { state: STATE });
if (saved.version !== 1) throw Error(`the board did not save: ${JSON.stringify(saved)}`);
const file = await api(owner, `/api/learn/boards/${canvas}/main/assets/${encodeURIComponent(KEY)}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: PNG });
if (!file.ok) throw Error(`the board file did not upload: ${file.status}`);

// ---------- The browser: every model route answered or refused in the page ----------
const CANNED = 'A canned answer: no model was called.';
const NOTICE = 'diagram.png could not be read, so this answer uses the text only.';
const browser = await chromium.launch();
async function open(who) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  const seen = { plans: [], asks: [], shared: [], uploads: [], notice: false };
  await context.route('**/api/learn/ask', route => { seen.asks.push(route.request().postDataJSON?.() ?? null); return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `data: ${JSON.stringify({ text: CANNED })}\n\ndata: [DONE]\n\n` }); });
  await context.route('**/api/learn/home-ask', route => route.fulfill({ json: { answer: CANNED, references: [], offer_rabbit_hole: false } }));
  await context.route(/\/api\/(learn\/(artifact|voice\/|assess|transcribe|image)|chat)/, route => route.abort());
  await context.route('**/api/learn/tutor/plan', route => {
    let body = null; try { body = route.request().postDataJSON(); } catch { /* not JSON */ }
    seen.plans.push(body);
    const notice = seen.notice; seen.notice = false;
    return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: CANNED }], ...(notice ? { notice: NOTICE } : {}) } });
  });
  await context.route(/\/api\/learn\/boards\/shared\/[^/]+\/ask$/, route => {
    let body = null; try { body = route.request().postDataJSON(); } catch { /* not JSON */ }
    seen.shared.push(body);
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `event: chunk\ndata: ${JSON.stringify({ text: CANNED })}\n\nevent: done\ndata: ${JSON.stringify({ ok: true, notice: NOTICE })}\n\n` });
  });
  const page = await context.newPage();
  page.on('pageerror', error => console.log(`PAGEERROR ${error.message}`));
  page.on('response', async response => {
    if (response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/learn/media') seen.uploads.push((await response.json().catch(() => null))?.id ?? null);
  });
  return { context, page, seen };
}
const { page, seen } = await open(owner);
const until = async (ok, timeout = 15000) => { for (const end = Date.now() + timeout; !(await ok()) && Date.now() < end;) await page.waitForTimeout(250); return ok(); };
const composer = p => p.locator('[data-learn-dock] [data-chat-composer] :is(textarea, input:not([type="file"]))').first();
const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png` });
const card = (p, id) => p.locator(`[data-block-id="${id}"]`).first();
// A typed Tutor turn: the plan request it sent (null when no plan request came).
async function turn(p, s, words) {
  const before = s.plans.length, asked = s.asks.length;
  await composer(p).fill(words);
  await composer(p).press('Enter');
  await until(async () => s.plans.length > before || s.asks.length > asked);
  await p.waitForTimeout(600);
  return s.plans.length > before ? s.plans.at(-1) : null;
}
const imageOf = plan => plan?.image_context ?? null;
const show = plan => (plan ? JSON.stringify(imageOf(plan)) : 'no Tutor plan request');
const namesTheCard = (plan, { id = 'img1', mediaId = media.id } = {}) => {
  const image = imageOf(plan);
  return !!image && Object.keys(image).length === 1 && (image.block_id === id || (mediaId != null && image.id === mediaId));
};
// Selects a card as a press on it does (its pointerdown), dispatched: after a pan the card can sit under the tool gutter.
async function select(p, id) {
  await p.keyboard.press('Escape');
  await card(p, id).dispatchEvent('pointerdown', { button: 0 });
  await p.waitForTimeout(400);
  return p.locator(`[data-canvas-target][data-selected-card="${id}"]`).count().then(n => n > 0);
}

await page.goto(`${BASE}/apps/${canvas}?tab=learn`);
await page.locator('[data-tool-gutter]').waitFor({ timeout: 60000 });
await composer(page).waitFor({ timeout: 30000 });
await card(page, 'img1').locator('img').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);

// S: the selected image card.
check('setup: the image card is selected and its pill shows', await select(page, 'img1'));
const selected = await turn(page, seen, 'What is in this diagram?');
check('the turn is the Tutor\'s (a plan request, not Learn chat)', !!selected, `${seen.plans.length} plans, ${seen.asks.length} asks`);
check('[fix] S a selected image card rides the Tutor turn as one image reference to it', namesTheCard(selected), show(selected));
await shot(page, 'S-selected');

// D: the pill removed - the same card is no longer the turn's.
await page.locator('[data-canvas-target] button[aria-label="Remove selected card context"]').first().click();
const unpinned = await turn(page, seen, 'And in general?');
check('D a removed card pill sends no image_context', !!unpinned && imageOf(unpinned) === null, show(unpinned));

// A: Show the tutor this image (the card menu), with nothing selected; then detached from the same menu.
await page.keyboard.press('Escape');
await card(page, 'img1').click({ button: 'right', position: { x: 24, y: 12 } });
await page.getByRole('menuitem', { name: 'Show the tutor this image' }).click({ timeout: 5000 });
await page.keyboard.press('Escape');
const attached = await turn(page, seen, 'What does this picture show?');
check('[fix] A an image attached through the card menu rides the Tutor turn', namesTheCard(attached), show(attached));
await card(page, 'img1').click({ button: 'right', position: { x: 24, y: 12 } });
await page.getByRole('menuitem', { name: 'Detach image from tutor' }).click({ timeout: 5000 });
await page.keyboard.press('Escape');
const detached = await turn(page, seen, 'Explain it without the picture.');
check('D a detached image sends no image_context', !!detached && imageOf(detached) === null, show(detached));

// R: Ask about selection - a rectangle over the image card; its capture is uploaded, then asked about.
{
  const uploads = seen.uploads.length;
  await page.getByRole('button', { name: 'Ask about selection — drag over any part of the canvas' }).click();
  const box = await card(page, 'img1').boundingBox();
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4, { steps: 8 });
  await page.mouse.up();
  const captured = await until(async () => seen.uploads.length > uploads, 20000);
  await page.waitForTimeout(800);
  const area = seen.uploads.at(-1);
  const plan = await turn(page, seen, 'What is in this area?');
  check('setup: the area was captured and uploaded', captured && /^media:/.test(area ?? ''), String(area));
  check('[fix] R a captured area rides the Tutor turn by its upload id', !!area && imageOf(plan)?.id === area && Object.keys(imageOf(plan)).length === 1, show(plan));
  await shot(page, 'R-area');
}

// G: a group's Ask in chat - its snapshot is uploaded, the drafted question sent.
{
  const uploads = seen.uploads.length;
  await page.keyboard.press('Escape');
  // The group's chip selects its members; the selected group shows its Ask in chat. Both are pressed as DOM events: the
  // chip sits at the board's left edge, under the tool gutter, which would take a pointer click.
  await page.locator('[data-group-chip="g1"]').dispatchEvent('pointerdown', { button: 0 });
  const asked = await page.locator('[data-group-ask]').first().waitFor({ timeout: 5000 })
    .then(() => page.locator('[data-group-ask]').first().dispatchEvent('click')).then(() => true, () => false);
  if (!asked) await shot(page, 'G-no-ask-pill');
  const captured = asked && await until(async () => seen.uploads.length > uploads, 20000);
  await page.waitForTimeout(800);
  const shotId = seen.uploads.at(-1), before = seen.plans.length;
  await composer(page).press('Enter');
  await until(async () => seen.plans.length > before);
  await page.waitForTimeout(600);
  const plan = seen.plans.length > before ? seen.plans.at(-1) : null;
  check('setup: the group snapshot was uploaded', captured && /^media:/.test(shotId ?? ''), String(shotId));
  check('[fix] G a group Ask rides the Tutor turn by its snapshot\'s upload id', !!shotId && imageOf(plan)?.id === shotId && Object.keys(imageOf(plan)).length === 1, show(plan));
  await shot(page, 'G-group');
}

// N: the reply says the image could not be read; the page shows it.
await select(page, 'img1');
seen.notice = true;
const noticed = await turn(page, seen, 'Describe the diagram.');
const shown = await until(async () => (await page.getByText(NOTICE).count()) > 0, 5000);
check('[fix] N the plan reply\'s notice about an unreadable image is shown', !!noticed && shown && await page.getByText(NOTICE).first().isVisible(), noticed ? 'answered with the notice' : 'no Tutor plan request');
await shot(page, 'N-notice');

// ---------- V and F: the canvas shared; a viewer asks on the shared page, then forks it ----------
const sharing = await json(owner, `/api/learn/boards/${canvas}/main/share`, 'POST', { shared: true, view: true, public_view: true, state: STATE });
const token = sharing?.sharing?.view;
if (!token) throw Error(`sharing failed: ${JSON.stringify(sharing)}`);
await page.context().close(); // the owner is done; one browser on the local stack at a time
const guest = await open(viewer);
await guest.page.goto(`${BASE}/b/${token}`);
await guest.page.locator('[data-block-id="img1"] img').first().waitFor({ timeout: 60000 });
await guest.page.waitForTimeout(1200);
// A view-only board presses through its hand surface and finds the card by its bounds: a press at the card's place.
{ const box = await guest.page.locator('[data-block-id="img1"]').first().boundingBox(); await guest.page.mouse.click(box.x + box.width / 2, box.y + 16); }
await guest.page.waitForTimeout(400);
const pill = await guest.page.locator('[data-canvas-target][data-selected-card="img1"]').count() > 0;
await guest.page.getByPlaceholder('Ask about this canvas…').fill('What is in this diagram?');
await guest.page.getByPlaceholder('Ask about this canvas…').press('Enter');
await until(async () => guest.seen.shared.length > 0, 15000);
check('V a shared viewer\'s question carries the selected image card by its id', pill && guest.seen.shared.at(-1)?.selected === 'img1', JSON.stringify(guest.seen.shared.at(-1) ?? null));
const sharedNotice = await until(async () => (await guest.page.locator('[data-shared-notice]').filter({ hasText: NOTICE }).count()) > 0, 5000);
check('V the shared answer\'s notice is shown under it', sharedNotice);
await shot(guest.page, 'V-shared');

const fork = await json(viewer, '/api/learn/boards/fork', 'POST', { source: { token }, key: crypto.randomUUID(), title: 'Image context fork' });
if (!fork?.name) throw Error(`the fork failed: ${JSON.stringify(fork)}`);
await guest.page.goto(`${BASE}/apps/${fork.name}?tab=learn`);
await guest.page.locator('[data-tool-gutter]').waitFor({ timeout: 60000 });
await composer(guest.page).waitFor({ timeout: 30000 });
const rendered = await guest.page.locator('[data-block-id="img1"] img').first().waitFor({ timeout: 30000 }).then(() => true, () => false);
check('F the fork shows the copied image card', rendered && fork.files >= 1, `files ${fork.files}`);
await guest.page.waitForTimeout(1200);
const forkSelected = await select(guest.page, 'img1');
const forked = await turn(guest.page, guest.seen, 'What is in this diagram?');
// The fork's card still carries the source owner's media id, which the forker cannot read: only the block id resolves.
check('[fix] F the fork\'s selected image card rides the Tutor turn by its block id', forkSelected && imageOf(forked)?.block_id === 'img1' && Object.keys(imageOf(forked)).length === 1, `${forkSelected ? 'selected' : 'NOT selected'}, ${show(forked)}`);
await shot(guest.page, 'F-fork');

const trippedAfter = [await tripwire(BASE), await tripwire(CP)];
check('no request reached a model provider (tripwire)', trippedAfter.every((n, i) => n != null && n === trippedBefore[i] && n === 0), `before ${trippedBefore}, after ${trippedAfter}`);
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
