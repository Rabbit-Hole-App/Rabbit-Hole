// The selected card's pill above the composer, for every kind of card (owner, 2026-10-08: "when we click on a card meaning
// it is selected we should have a pill above the chat composer to know it is selected and we can use chat to ask questions
// above it"), on the owner's canvas and on a shared canvas. Against the LOCAL stack only: local D1 and fresh browser
// profiles. No model is called: the Learn ask, the Tutor planner and the shared ask are answered here, every other write
// and every outside host is refused, and the stack's provider tripwire must count 0. Prints no secrets.
// And the workspace dock (owner, 2026-10-09: "when i click on a card in Home/Explore, I do not see the pill in the
// chatcomposer of the selected Projects/Canvas"): on Home, Library and Explore a click on a card's body picks it - the
// dock shows its pill, another card replaces it, Esc and x clear it, the pick sends nothing - and a question then goes to
// that canvas (answered here as above).
// Usage: BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/selected-pill-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('selected-pill-check runs against the local stack only');
const SHOTS = process.argv[2] || 'selected-pill-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const run = Date.now().toString(36);
const owner = { session: await sessionFor(`pill-owner-${run}@example.com`, `pill_${run}`) };
const viewer = { session: await sessionFor(`pill-viewer-${run}@example.org`, `pillv_${run}`) };
const api = async (who, path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  return { status: response.status, body: await response.json().catch(() => null) };
};

// ---- one canvas with a card of every kind, a sticky note and a chat card ----
const SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><path d="M0 18 C 15 18, 25 2, 40 2" stroke="#2383e2" fill="none"/></svg>')}`;
const KINDS = [
  { id: 'k-exp', label: 'lesson card', block: { type: 'explanation', title: 'Why salt melts ice', body: 'Salt lowers the freezing point of the water film.' } },
  { id: 'k-nb', label: 'notebook', block: { type: 'notebook', notebook_id: `nb-${run}`, language: 'python', active_path: 'notebook.ipynb', files: ['notebook.ipynb'], ipynb_path: 'notebook.ipynb' } },
  { id: 'k-img', label: 'image', block: { type: 'image', mode: 'url', title: 'The sigmoid curve', src: SVG, alt: 'An S-curve', caption: 'Flat at both ends.' } },
  { id: 'k-pdf', label: 'PDF', block: { type: 'pdf', assetKey: `pdf:${run}`, label: 'lecture notes.pdf' } },
  { id: 'k-slide', label: 'slide', block: { type: 'slide', pdf: `pdf:${run}`, number: 2, label: 'lecture notes.pdf', assetKey: `slide:${run}:2` } },
  { id: 'k-vid', label: 'video', block: { type: 'video', videoId: 'kCc8FmEb1nY', title: "Let's build GPT", channel: 'Andrej Karpathy', start: 10, end: 60 } },
  { id: 'k-wiki', label: 'wiki', block: { type: 'wiki', title: 'Freezing-point_depression', section: 0 } },
  { id: 'k-paper', label: 'paper', block: { type: 'paper', title: 'Attention Is All You Need', paper: { id: '1706.03762', page: 1 } } },
  { id: 'k-note', label: 'sticky note', item: { kind: 'sticky', x: -520, y: 40, w: 160, h: 160, text: 'remember the mask', color: '#fde68a', opacity: 1 } },
  { id: 'k-chat', label: 'chat card', chat: { question: 'Why exponentiate the scores?', answer: 'Scores become positive weights that add to 1.' } },
];
const ink = {
  strokes: [], shapes: [], links: [], groups: [], areas: [], exchanges: [],
  blocks: KINDS.filter(kind => kind.block).map(kind => ({ id: kind.id, dx: 0, dy: 0, ...kind.block })),
  items: KINDS.filter(kind => kind.item).map(kind => ({ id: kind.id, ...kind.item })),
};
const chat = KINDS.filter(kind => kind.chat).map(kind => ({ id: kind.id, ...kind.chat, status: 'done', dx: 0, dy: 0 }));
const canvas = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Every card ${run}` }) })).body;
const catalog = (await api(owner, '/api/apps')).body;
const base = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}`;
const SEEDS = { [`${base}:ink`]: ink, [`${base}:chat`]: chat };
// The shared board: the same cards, shared view-only (shared-canvas-ask.md).
const shared = await api(owner, `/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: { ...ink, exchanges: chat } }) });
const token = shared.body?.sharing?.view;
assert.ok(token, `share: HTTP ${shared.status}`);

const browser = await chromium.launch();
const errors = [], asks = [], plans = [], sharedAsks = [], refused = [];
const OUTSIDE = /youtube|ytimg|googlevideo|arxiv|wikipedia|tryrabbithole|workers\.dev|notebook/;
const contextFor = async who => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, SEEDS);
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== BASE) return OUTSIDE.test(url.hostname) || url.protocol !== 'http:' ? route.abort() : route.continue();
    if (['GET', 'HEAD'].includes(request.method())) return route.continue();
    const path = url.pathname;
    // The question, answered here: the Learn ask, the Tutor planner (a canvas turn, #46) and the shared ask. No model.
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    if (path === '/api/learn/ask') { asks.push(JSON.parse(request.postData() || '{}')); return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: 'Answered here.' }) + frame('done', {}) }); }
    if (path === '/api/learn/tutor/plan') { plans.push(JSON.parse(request.postData() || '{}')); return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: 'Answered here.' }] } }); }
    if (/^\/api\/learn\/boards\/shared\/[^/]+\/ask$/.test(path)) { sharedAsks.push(JSON.parse(request.postData() || '{}')); return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: 'Answered here.' }) + frame('done', { ok: true }) }); }
    // Next Steps' hook on canvas open is expected; the stack's tripwire answers its planner with fixtures.
    if (/\/next-steps$/.test(path) || /^\/api\/learn\/(board|boards|evaluate|tutor\/state|moments|perf|events)\b/.test(path)) return route.continue();
    refused.push(`${request.method()} ${path}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
  return { context, page };
};
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const pill = page => page.locator('[data-selected-card]');
const node = (page, kind) => (kind.item ? page.locator(`[data-item-id="${kind.id}"]`) : page.locator(`[data-block-id="${kind.id}"]`));
// A press on the card's drag strip (its top edge), or on a note's middle: a plain selection, nothing opened.
const press = async (page, kind) => {
  const target = node(page, kind);
  // Bring it on screen by panning the canvas (the wheel), never by scrolling its overflow-hidden surface: a view-only
  // board hit-tests a press against the canvas's own view.
  let box = await target.boundingBox();
  const off = b => b.y + 8 < 90 || b.y + 8 > 720 || b.x < 340 || b.x + Math.min(b.width, 200) > 1200;
  for (let i = 0; i < 12 && box && off(box); i++) {
    await page.mouse.move(1250, 400);
    await page.mouse.wheel(off({ ...box, y: 300 }) ? box.x - 600 : 0, box.y + 8 < 90 || box.y + 8 > 720 ? box.y - 300 : 0);
    await page.waitForTimeout(250);
    box = await target.boundingBox();
  }
  assert.ok(box, `${kind.label} is on the canvas`);
  await page.mouse.click(box.x + box.width / 2, kind.item ? box.y + box.height / 2 : box.y + 8);
  await page.waitForTimeout(300);
};
// A point of bare canvas: on the canvas surface, on no card, note, panel or control.
const blank = async page => {
  const point = await page.evaluate(() => {
    for (let y = 120; y < 700; y += 40) for (let x = 360; x < 1400; x += 40) {
      const element = document.elementFromPoint(x, y);
      if (element?.closest('[data-canvas-surface]') && !element.closest('[data-block-id],[data-item-id],[data-block],[data-view-selection],[role="dialog"],[data-shared-ask],[data-learn-dock],button,a,iframe')) return { x, y };
    }
    return null;
  });
  assert.ok(point, 'a bare point of canvas');
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(250);
};
const fit = async page => { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Shift+Digit1'); await page.waitForTimeout(700); };
const words = kind => kind.block?.title || kind.block?.label || kind.block?.active_path || kind.item?.text || kind.chat?.question;

// ---- the owner's canvas ----
let { page } = await contextFor(owner);
await page.goto(`${BASE}/apps/${canvas.name}`);
await node(page, KINDS[0]).waitFor({ timeout: 60000 });
await page.waitForTimeout(1000);
await fit(page);
await page.screenshot({ path: `${SHOTS}/owner-canvas.png` });
const composer = page.locator('[data-learn-dock] textarea, [data-learn-dock] input:not([type="file"])').first();
for (const kind of KINDS) {
  await check(`owner, ${kind.label}: selecting it shows one pill naming it; Esc, a blank click and x each clear it; Send carries it`, async () => {
    await fit(page);
    await press(page, kind);
    await pill(page).waitFor({ timeout: 5000 });
    assert.equal(await pill(page).getAttribute('data-selected-card'), kind.id);
    assert.equal(await page.locator('[data-canvas-target]').count(), 1, 'one pill');
    await page.screenshot({ path: `${SHOTS}/owner-${kind.id}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    assert.equal(await pill(page).count(), 0, 'Esc clears it');
    await press(page, kind);
    await blank(page);
    if (await pill(page).count()) await page.screenshot({ path: `${SHOTS}/blank-failed-${kind.id}.png` });
    assert.equal(await pill(page).count(), 0, 'a blank click clears it');
    await press(page, kind);
    await pill(page).locator('button[aria-label="Remove selected card context"]').click();
    await page.waitForTimeout(250);
    assert.equal(await pill(page).count(), 0, 'x clears it');
    // Send: the question goes with the card, on whichever path this canvas asks (the Learn ask, or the Tutor planner).
    await press(page, kind);
    const a0 = asks.length, p0 = plans.length;
    await composer.fill(`What is this ${kind.label}?`);
    await composer.press('Enter');
    for (let i = 0; i < 40 && asks.length + plans.length === a0 + p0; i++) await page.waitForTimeout(150);
    assert.equal(asks.length + plans.length, a0 + p0 + 1, 'one question');
    if (asks.length > a0) assert.equal(asks.at(-1).canvas_target?.id, kind.id, `canvas_target: ${JSON.stringify(asks.at(-1).canvas_target)?.slice(0, 120)}`);
    else {
      const plan = JSON.stringify(plans.at(-1)?.context?.target || null);
      assert.ok(words(kind) && (plan.includes(words(kind).replace(/_/g, ' ')) || plan.includes(words(kind))), `the Tutor's target names the ${kind.label}: ${plan.slice(0, 160)}`);
    }
    assert.equal(await pill(page).getAttribute('data-selected-card'), kind.id, 'the pill stays after the send');
    // The answer window opens over the canvas; collapse it so the next card is in reach.
    await page.waitForTimeout(400);
    const collapse = page.getByRole('button', { name: 'Collapse chat' });
    if (await collapse.count()) await collapse.first().click();
    await blank(page);
  });
}
await check('owner: selecting another card moves the one pill to it', async () => {
  await press(page, KINDS[0]);
  await press(page, KINDS.at(-1));
  assert.equal(await pill(page).getAttribute('data-selected-card'), KINDS.at(-1).id);
  assert.equal(await page.locator('[data-canvas-target]').count(), 1);
  await blank(page);
});
await page.context().close();

// ---- the shared canvas: the viewer's composer takes the pill; Send carries only the card's id ----
({ page } = await contextFor(viewer));
await page.goto(`${BASE}/b/${token}`);
const sharedComposer = page.locator('[data-shared-ask] textarea, [data-shared-ask] input:not([type="file"])').first();
await sharedComposer.waitFor({ timeout: 60000 }).catch(async error => { await page.screenshot({ path: `${SHOTS}/shared-failed.png` }); throw error; });
await node(page, KINDS[0]).waitFor({ timeout: 60000 });
await page.waitForTimeout(1000);
await fit(page);
for (const kind of KINDS) {
  await check(`shared, ${kind.label}: one pill above the shared composer; Esc, a blank click and x clear it; Send carries its id only`, async () => {
    await fit(page);
    await press(page, kind);
    const sharedPill = page.locator('[data-shared-ask] [data-selected-card]');
    await sharedPill.waitFor({ timeout: 5000 }).catch(async error => { await page.screenshot({ path: `${SHOTS}/shared-failed-${kind.id}.png` }); console.log('debug', await page.evaluate(() => [document.querySelector('[data-view-selection]')?.dataset.viewSelection, document.activeElement?.outerHTML.slice(0, 120), document.querySelector('[data-canvas-surface]')?.className])); throw error; });
    assert.equal(await sharedPill.getAttribute('data-selected-card'), kind.id);
    assert.equal(await page.locator('[data-shared-ask] [data-canvas-target]').count(), 1);
    if (kind === KINDS[0]) await page.screenshot({ path: `${SHOTS}/shared-${kind.id}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    assert.equal(await sharedPill.count(), 0, 'Esc clears it');
    await press(page, kind);
    await blank(page);
    assert.equal(await sharedPill.count(), 0, 'a blank click clears it');
    await press(page, kind);
    await sharedPill.locator('button[aria-label="Remove selected card context"]').click();
    await page.waitForTimeout(250);
    assert.equal(await sharedPill.count(), 0, 'x clears it');
    await press(page, kind);
    const before = sharedAsks.length;
    await sharedComposer.fill(`What is this ${kind.label}?`);
    await sharedComposer.press('Enter');
    for (let i = 0; i < 40 && sharedAsks.length === before; i++) await page.waitForTimeout(150);
    assert.equal(sharedAsks.length, before + 1, 'one question');
    assert.equal(sharedAsks.at(-1).selected, kind.id);
    assert.deepEqual(Object.keys(sharedAsks.at(-1)).sort(), ['history', 'message', 'selected'], 'only the id, never the card text');
    await page.waitForTimeout(400);
    const collapse = page.getByRole('button', { name: 'Collapse chat' });
    if (await collapse.count()) await collapse.first().click();
    await blank(page);
  });
}
await check('shared: with nothing selected, Send carries no card', async () => {
  await blank(page);
  const before = sharedAsks.length;
  await sharedComposer.fill('And in general?');
  await sharedComposer.press('Enter');
  for (let i = 0; i < 40 && sharedAsks.length === before; i++) await page.waitForTimeout(150);
  assert.equal(sharedAsks.at(-1).selected, undefined);
});
await page.screenshot({ path: `${SHOTS}/shared-after.png` });
await page.context().close();

// ---- the workspace dock on Home, Library and Explore ----
// A second canvas of the owner's (Library: another card replaces the pill) and a published canvas of the viewer's (Explore).
const second = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Second canvas ${run}` }) })).body;
const theirs = (await api(viewer, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Published canvas ${run}` }) })).body;
await api(viewer, `/api/learn/boards/${theirs.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { ...ink, exchanges: [] } }) });
const publication = (await api(viewer, `/api/apps/${theirs.name}/publish`, { method: 'POST', body: '{}' })).body?.publication_token;
assert.ok(publication, 'the viewer canvas is published');
({ page } = await contextFor(owner));
const dock = page.locator('[data-agent-bar]');
const homePill = page.locator('[data-home-pill]');
const dockField = dock.locator('textarea, input:not([type="file"])').first();
const sent = () => asks.length + sharedAsks.length + plans.length;
const waitSent = async n => { for (let i = 0; i < 40 && sent() < n; i++) await page.waitForTimeout(150); };
// A press on the card's picture: its body, never the title, Open, the menu or a link.
const pickAt = async card => { const box = await card.locator('[data-card-thumbnail]').boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(300); };
await page.goto(`${BASE}/apps/${canvas.name}`); // this browser opened it: Home's Recent lists it
await node(page, KINDS[0]).waitFor({ timeout: 60000 });
await page.waitForTimeout(800);
await check('Home: a click on a card picks it - one pill with its type icon and title, the card stays selected, nothing opens, nothing is sent; Esc and x clear it', async () => {
  await page.goto(`${BASE}/apps`);
  const card = page.locator('[data-recent-card]').filter({ hasText: `Every card ${run}` }).first();
  await card.waitFor({ timeout: 30000 });
  const before = sent(), url = page.url();
  await pickAt(card);
  await homePill.waitFor({ timeout: 5000 });
  assert.equal(await homePill.count(), 1, 'one pill');
  assert.equal(await homePill.getAttribute('data-selected-card'), canvas.name);
  assert.ok((await homePill.innerText()).includes(`Every card ${run}`));
  assert.equal(await homePill.locator('svg').count(), 2, 'the type icon and the x');
  assert.equal(await card.getAttribute('data-card-selected'), '');
  assert.equal(page.url(), url, 'the click did not open it');
  assert.equal(await dockField.getAttribute('placeholder'), `Ask about ${`Every card ${run}`}…`);
  await page.screenshot({ path: `${SHOTS}/home-pill-home.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.equal(await homePill.count(), 0, 'Esc clears it');
  assert.equal(await card.getAttribute('data-card-selected'), null);
  await pickAt(card);
  await homePill.locator('button[aria-label="Remove selected card context"]').click();
  assert.equal(await homePill.count(), 0, 'x clears it');
  assert.equal(sent(), before, 'the pick sent nothing');
});
await check('Home: with the pill, a question goes to that canvas (its Learn ask), never the library answer', async () => {
  const card = page.locator('[data-recent-card]').filter({ hasText: `Every card ${run}` }).first();
  await pickAt(card);
  const before = sent();
  await dockField.fill('What is on this canvas?');
  await dockField.press('Enter');
  await waitSent(before + 1);
  assert.equal(sent(), before + 1, 'one question');
  assert.equal(asks.at(-1).scope?.app, canvas.name);
  assert.ok(!refused.some(r => r.endsWith('/api/learn/home-ask')), 'not the library answer');
  await page.keyboard.press('Escape'); // the answer window, then the pill
  await page.keyboard.press('Escape');
});
await check('Library: one pill; picking another card replaces it; nothing is sent', async () => {
  await page.goto(`${BASE}/library`);
  const first = page.locator('[data-library-card]').filter({ hasText: `Every card ${run}` }).first();
  const next = page.locator('[data-library-card]').filter({ hasText: `Second canvas ${run}` }).first();
  await first.waitFor({ timeout: 30000 });
  const before = sent();
  await pickAt(first);
  assert.equal(await homePill.getAttribute('data-selected-card'), canvas.name);
  await pickAt(next);
  assert.equal(await homePill.count(), 1, 'one pill');
  assert.equal(await homePill.getAttribute('data-selected-card'), second.name, 'the other card replaces it');
  assert.equal(await first.getAttribute('data-card-selected'), null, 'only the picked card is selected');
  await page.screenshot({ path: `${SHOTS}/home-pill-library.png` });
  await page.keyboard.press('Escape');
  assert.equal(await homePill.count(), 0);
  assert.equal(sent(), before);
});
await check('Explore: a published canvas picks by its link; a question goes to its shared ask with only the message and history', async () => {
  await page.goto(`${BASE}/explore`);
  const card = page.locator('[data-explore-card]').filter({ hasText: `Published canvas ${run}` }).first();
  await card.waitFor({ timeout: 30000 });
  const before = sent(), url = page.url();
  await pickAt(card);
  assert.equal(await homePill.getAttribute('data-selected-card'), publication);
  assert.equal(page.url(), url, 'the click did not open it');
  await page.screenshot({ path: `${SHOTS}/home-pill-explore.png` });
  assert.equal(sent(), before, 'the pick sent nothing');
  const shared = sharedAsks.length;
  await dockField.fill('What does it teach?');
  await dockField.press('Enter');
  await waitSent(before + 1);
  assert.equal(sharedAsks.length, shared + 1, 'one question, to the shared ask');
  assert.deepEqual(Object.keys(sharedAsks.at(-1)).sort(), ['history', 'message']);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
});
await page.setViewportSize({ width: 390, height: 844 });
await check('Explore on a phone: the pill above the composer', async () => {
  const card = page.locator('[data-explore-card]').filter({ hasText: `Published canvas ${run}` }).first();
  await card.scrollIntoViewIfNeeded();
  await pickAt(card);
  await homePill.waitFor({ timeout: 5000 });
  await page.screenshot({ path: `${SHOTS}/home-pill-explore-phone.png` });
  await page.keyboard.press('Escape');
});
await page.context().close();
await browser.close();

const tripwire = await Promise.all([BASE, CP].map(async origin => (await (await fetch(`${origin}/__provider-tripwire`)).json()).hits.length));
console.log('provider tripwire hits', tripwire.join(' / '), 'refused', refused.length ? refused.join(', ') : 'none', 'page errors', errors.length ? errors.join(' | ') : 'none');
assert.deepEqual(tripwire, [0, 0], 'no model call');
const total = KINDS.length * 2 + 2 + 5;
console.log(`${results.length}/${total} checks passed`);
process.exit(results.length === total ? 0 : 1);
