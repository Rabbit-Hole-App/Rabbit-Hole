// Pending-context pills inside the Chat composer (owner brief UI-09, 2026-10-21, C:/s/spec/day-1021/ui09-composer-pills-brief.md),
// against the LOCAL stack only: local D1 and a fresh browser profile. Every pending selection and attachment pill (a card, a group,
// several objects, a code range) sits inside [data-chat-composer], below the text field and above the toolbar, in the same list as
// "This canvas", in Auto, Ask and Tutor, with the Tutor entry (welcome) and activity cards above the composer, never under a pill.
// Labels come from the source object: a title, a filename with its line range, a group's name and count, several titles, an
// untitled card's first line or a shape's type, never "1 item". One pill per source; x drops it from the next request without
// deleting the card or touching the draft. The send that proves "outgoing refs match the visible pills" is answered here with
// canned text (no model). Every other model-capable route is aborted and counted: selection and removal make none.
// Prints `ok <label>` per check and `PASS <n> checks`, counts and ids only (no cookies, no secrets); exits 1 on any failure.
// Usage: BASE=http://127.0.0.1:9601 SMALL_CP=http://127.0.0.1:9603 VARS=<cp .dev.vars> OUT=<dir> node e2e/composer-pills-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9601';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9603';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('composer-pills-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/composer-pills', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `pills-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

const LONG = 'How the attention mask stops a token from reading any later position in the sequence, step by step, with the shapes';
const COMMIT = '37baab7c1f0e2d3a4b5c6d7e8f9a0b1c2d3e4f50';
const repoCode = (id, path, start, end) => ({ id, type: 'repo-code', dx: 0, dy: 0, title: path.split('/').pop(), language: 'python', source: { kind: 'repository', app: 'repo-mingpt', repo: 'karpathy/minGPT', commit: COMMIT, path, start, end } });
const shape = (id, x, y, extra = {}) => ({ id, kind: 'rect', x1: x, y1: y, x2: x + 150, y2: y + 70, color: '#2383e2', width: 2, dash: 'solid', fill: '#e8f0fe', opacity: 1, round: true, ...extra });
const BLOCKS = [
  // The owner's case: an imported code file is a code-sample card named after the file.
  { id: 's-model', type: 'snippet', dx: 0, dy: 0, title: 'model.py', brief: '', code: 'class GPT:\n    pass\n', output: '' },
  { id: 'c-long', type: 'explanation', dx: 0, dy: 0, title: LONG, body: 'Causal masking.' },
  { id: 'c-untitled', type: 'explanation', dx: 0, dy: 0, title: '', body: 'Softmax turns scores into weights\nand the rest.' },
  { id: 'c-a', type: 'explanation', dx: 0, dy: 0, title: 'Card A: tides', body: 'The moon pulls.', groupId: 'g1' },
  { id: 'c-b', type: 'explanation', dx: 0, dy: 0, title: 'Card B: bulges', body: 'Two bulges.', groupId: 'g1' },
  // Two code cards of the same file name in different folders: two sources, two pills, never merged by name.
  repoCode('code-a', 'mingpt/model.py', 27, 56),
  repoCode('code-b', 'projects/chargpt/model.py', 1, 30),
];
const STATE = { strokes: [], shapes: [shape('s-1', 1400, 0, { text: 'Gate' }), shape('s-2', 1400, 140, { text: 'Latch' }), shape('s-3', 1400, 280)], items: [], links: [], groups: [{ id: 'g1', label: 'Pair' }], areas: [], exchanges: [], blocks: BLOCKS };
const catalog = await api('/api/apps');
const made = async title => { const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) }); if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error('the canvas was not created'); return canvas.name; };
const WORK = await made(`Composer pills ${run}`), ACTIVITY = await made(`Composer pills activity ${run}`);
const key = name => `small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}:ink`;
const SEEDS = { [key(WORK)]: STATE, [key(ACTIVITY)]: STATE };
// The activity canvas: a saved Tutor activity through the real coaching route (no model), in Tutor mode.
{
  const post = (state, action, payload) => api('/api/learn/coaching', { method: 'POST', body: JSON.stringify({ app: ACTIVITY, board: 'main', actionId: `${action}-${run}`, expectedRevision: state.revision, action, payload }) });
  let state = (await api(`/api/learn/coaching?app=${ACTIVITY}&board=main`)).state;
  state = (await post(state, 'create_goal', { label: 'Causal attention', criteria: [{ criterionId: 'c1', label: 'Explain the mask', requirement: 'Say what the mask blocks', requiresReasoning: true }] })).state;
  state = (await post(state, 'activate_activity', { activity: { goalId: state.goals[0].goalId, objective: 'Mask', prompt: 'What does the causal mask stop a token from reading?', responseKind: 'text', criterionRefs: [{ criterionId: 'c1', version: 1 }] } })).state;
  state = (await post(state, 'save_controls', { event: { type: 'select_mode', mode: 'tutor' } })).state;
  if (!state?.activeActivityId) throw Error('the activity canvas has no saved activity');
}

// ---------------------------------------------------------------- routes: model routes counted; the one deliberate send is canned
const model = [], sends = [], errors = [];
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask$|artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore))/;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(seeds => { try { for (const [k, v] of Object.entries(seeds)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); } catch { /* a sandboxed frame */ } }, SEEDS);
let answer = false; // only the deliberate send step answers /api/learn/ask
await context.route('**/api/**', route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  if (path === '/api/learn/ask' && request.method() === 'POST' && answer) {
    let body = {}; try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
    sends.push(body);
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: 'Canned reply.' })
      + frame('answer_meta', { messageId: 'm-1', actions: [], followUps: [], alternatives: ['m-1'], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `pills-${run}`, userMessageId: 'u-1', messageId: 'm-1' }) });
  }
  if (/^\/api\/learn\/chat\/(threads|messages)\/pills-/.test(path)) return route.fulfill({ json: { ok: true } });
  if (MODEL.test(path) && !(path === '/api/learn/journey' && request.method() === 'GET')) { model.push(`${request.method()} ${path}`); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));

const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 400);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}`);
    await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const settle = (ms = 350) => page.waitForTimeout(ms);
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const pane = () => page.locator('[data-chat-pane]');
const field = () => pane().locator('[data-chat-composer] textarea').first();
const modeButton = () => pane().getByRole('button', { name: 'Mode', exact: true });
const pickMode = async label => { await modeButton().click(); await page.getByRole('menuitemradio', { name: new RegExp(`^${label}`) }).click(); await waitFor(async () => new RegExp(label).test(await modeButton().innerText()), 5000, `mode ${label}`); };
const open = async name => {
  await page.goto(`${BASE}/apps/${name}`);
  await page.locator('[aria-label="Lesson canvas"] [data-block-id="code-b"]').first().waitFor({ timeout: 60000 });
  await pane().waitFor({ state: 'visible', timeout: 30000 });
  await field().waitFor({ timeout: 30000 });
  await settle(1200);
};
const barePoint = () => page.locator('[aria-label="Lesson canvas"]').evaluate(canvas => {
  const b = canvas.getBoundingClientRect();
  for (let y = b.top + 150; y < b.bottom - 100; y += 50) for (let x = b.left + 150; x < b.right - 100; x += 50) {
    const node = document.elementFromPoint(x, y);
    if (canvas.contains(node) && !node.closest('[data-block-id], [data-shape-id], [data-item-id], [data-group-id], [data-chat-pane], button, textarea, input')) return { x, y };
  }
  throw Error('No unobstructed canvas point found');
});
const reveal = async locator => {
  const view = await page.locator('[aria-label="Lesson canvas"]').boundingBox();
  for (let i = 0; i < 8; i += 1) {
    const b = await locator.boundingBox();
    if (b && b.y > 120 && b.y + Math.min(b.height, 200) < view.y + view.height - 220 && b.x > view.x + 120 && b.x + Math.min(b.width, 300) < view.x + view.width - 120) return b;
    const dy = b ? b.y + Math.min(b.height, 200) / 2 - view.height * 0.4 : 0, dx = b ? b.x + Math.min(b.width, 300) / 2 - view.x - view.width * 0.5 : 0;
    const p = await barePoint(); await page.mouse.move(p.x, p.y); await page.mouse.wheel(Math.round(dx), Math.round(dy));
    await page.waitForTimeout(150);
  }
  return locator.boundingBox();
};
const clickCard = async (id, modifiers = []) => { await reveal(page.locator(`[data-block-id="${id}"]`)); await page.locator(`[data-block-id="${id}"] [data-drag-zone]`).last().click({ position: { x: 12, y: 8 }, modifiers, force: true }); await settle(); };
const clickShape = async (id, modifiers = []) => { const b = await reveal(page.locator(`[data-shape-id="${id}"]`).first()); for (const k of modifiers) await page.keyboard.down(k); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); for (const k of modifiers) await page.keyboard.up(k); await settle(); };
const clearAll = async () => { await page.keyboard.press('Escape'); const p = await barePoint(); await page.mouse.click(p.x, p.y); await settle(); };
const addToChat = async () => { await page.locator('[data-selection-bar]:visible').getByRole('button', { name: 'Add to chat', exact: true }).click(); await settle(); };
const removeAttached = async () => { for (let i = 0; i < 20; i++) { const x = pane().locator('[data-context-chip] button[aria-label$="from this chat"]').first(); if (!(await x.count())) return; await x.click(); await settle(200); } };

// Every pending pill in the Chat pane (outermost element only) and where it sits against the composer's field and toolbar.
const pills = () => pane().evaluate(() => {
  const root = document.querySelector('[data-chat-pane]'), composer = root.querySelector('[data-chat-composer]');
  const field = composer?.querySelector('textarea')?.getBoundingClientRect(), bar = composer?.querySelector('[data-composer-toolbar]')?.getBoundingClientRect();
  const canvas = composer?.querySelector('[data-canvas-context]'), box = composer?.getBoundingClientRect();
  const all = [...root.querySelectorAll('[data-canvas-target], [data-context-chip], [data-code-selection], [data-context-selection], [data-canvas-attachment]')];
  return all.filter(el => !all.some(other => other !== el && other.contains(el))).map(el => {
    const r = el.getBoundingClientRect();
    return { text: el.innerText.replace(/\s+/g, ' ').trim(), title: el.getAttribute('title') || el.querySelector('[title]')?.getAttribute('title') || '', key: el.getAttribute('data-ref-key'), card: el.getAttribute('data-selected-card'),
      temporary: el.hasAttribute('data-context-selection') || el.hasAttribute('data-code-selection'), inside: !!composer?.contains(el),
      placed: !!(field && bar && r.top >= field.bottom - 1 && r.bottom <= bar.top + 1), withCanvas: !!canvas && el.parentElement === canvas.parentElement,
      clipped: !!box && (r.left < box.left - 1 || r.right > box.right + 1) };
  });
});
const assertPlaced = (list, what) => {
  assert.ok(list.length > 0, `${what}: no pill`);
  for (const pill of list) {
    assert.ok(pill.inside, `${what}: "${pill.text}" is outside the composer`);
    assert.ok(pill.placed, `${what}: "${pill.text}" is not between the field and the toolbar`);
    assert.ok(pill.withCanvas, `${what}: "${pill.text}" is not beside This canvas`);
    assert.ok(!pill.clipped, `${what}: "${pill.text}" is clipped sideways`);
  }
  const keys = list.map(p => p.key || `card:${p.card}`);
  assert.equal(new Set(keys).size, keys.length, `${what}: a duplicate pill: ${keys.join(', ')}`);
};
// The Tutor's own cards stay above the composer: no pill between them and the field, none above them.
const tutorAbove = () => pane().evaluate(() => {
  const composer = document.querySelector('[data-chat-pane] [data-chat-composer]').getBoundingClientRect();
  return [...document.querySelectorAll('[data-chat-pane] [data-tutor-entry], [data-chat-pane] [data-tutor-activity-card]')].map(el => el.getBoundingClientRect().bottom <= composer.top + 1);
});
const quiet = (label, before) => assert.deepEqual(model.slice(before), [], `${label}: model request`);
const DRAFT = 'my own words, unsent';
const shot = name => pane().screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});

await open(WORK);
await field().fill(DRAFT);

for (const mode of ['Auto', 'Ask', 'Tutor']) {
  await check(`${mode}: selecting the model.py card shows ONE pill named model.py inside the composer, beside This canvas, no model call`, async () => {
    const before = model.length;
    await clearAll();
    await pickMode(mode);
    await clickCard('s-model');
    const list = await waitFor(async () => { const l = await pills(); return l.some(p => p.card === 's-model') && l; }, 5000, 'no pill for model.py');
    assertPlaced(list, mode);
    assert.equal(list.length, 1, `one pill: ${JSON.stringify(list.map(p => p.text))}`);
    assert.match(list[0].text, /model\.py/);
    assert.doesNotMatch(list[0].text, /\b1 item\b/);
    assert.equal(await field().inputValue(), DRAFT, 'the draft stays');
    if (mode === 'Tutor') {
      await field().fill('');
      await page.locator('[data-chat-pane] [data-tutor-entry]').first().waitFor({ timeout: 10000 });
      const above = await tutorAbove();
      assert.ok(above.length > 0 && above.every(Boolean), `the Tutor entry card is above the composer: ${above}`);
      assertPlaced(await pills(), 'Tutor entry');
      await shot('01-tutor-entry-selected-light');
      await field().fill(DRAFT);
    }
    quiet(`${mode} selection`, before);
  });
}

await check('labels: a long title is one truncated pill with its full title; an untitled card is its first line, never "1 item"', async () => {
  const before = model.length;
  await pickMode('Ask');
  await clickCard('c-long');
  let list = await waitFor(async () => { const l = await pills(); return l.some(p => p.card === 'c-long') && l; }, 5000, 'no pill for the long card');
  assertPlaced(list, 'long title');
  assert.ok(list[0].title.includes(LONG), `the full title is on the pill: ${list[0].title.slice(0, 80)}`);
  await clickCard('c-untitled');
  list = await waitFor(async () => { const l = await pills(); return l.some(p => p.card === 'c-untitled') && l; }, 5000, 'no pill for the untitled card');
  assertPlaced(list, 'untitled');
  assert.match(list[0].text, /Softmax turns scores into weights/);
  assert.doesNotMatch(list[0].text, /\b1 item\b/);
  quiet('labels', before);
});

await check('deselect drops the temporary pill; reselect brings back exactly one; x clears it without deleting the card or the draft', async () => {
  const before = model.length;
  await clearAll();
  assert.equal((await pills()).length, 0, 'nothing pending after a deselect');
  await clickCard('s-model');
  assert.equal((await pills()).length, 1, 'one pill after reselecting');
  await pane().locator('[data-canvas-target] button[aria-label="Remove selected card context"]').click();
  await settle();
  assert.equal((await pills()).length, 0, 'x removed it');
  assert.equal(await page.locator('[data-block-id="s-model"]').count(), 1, 'the card is still on the canvas');
  assert.equal(await field().inputValue(), DRAFT, 'the draft stays');
  quiet('deselect, reselect, remove', before);
});

await check('Add to chat: a shape is its text, a blank shape its type, a group its name and count, several objects their titles; never "1 item"', async () => {
  const before = model.length;
  await removeAttached();
  await clearAll();
  await clickShape('s-1'); await addToChat();
  await clickShape('s-3'); await addToChat();
  await clearAll();
  await clickCard('c-a'); await addToChat();
  await clearAll();
  await clickShape('s-1'); await clickShape('s-2', ['Shift']); await addToChat();
  await clearAll();
  const list = await pills();
  assertPlaced(list, 'Add to chat');
  const texts = list.map(p => p.text);
  assert.ok(texts.some(t => /^Gate\b/.test(t)), `a shape by its text: ${JSON.stringify(texts)}`);
  assert.ok(texts.some(t => /^Shape\b/.test(t)), `a blank shape by its type: ${JSON.stringify(texts)}`);
  assert.ok(texts.some(t => /^Pair\b.*2 cards/.test(t)), `the group by its name and count: ${JSON.stringify(texts)}`);
  assert.ok(texts.some(t => /^Gate, Latch\b.*2 cards/.test(t)), `several objects by their titles: ${JSON.stringify(texts)}`);
  assert.ok(texts.every(t => !/\b1 item\b|\bitems?\b/.test(t)), `no item count label: ${JSON.stringify(texts)}`);
  assert.equal(await field().inputValue(), DRAFT, 'the draft stays');
  quiet('Add to chat', before);
});

await check('code ranges: two model.py cards are two pills, filename plus compact line range, their repository ref at its commit', async () => {
  const before = model.length;
  await removeAttached();
  await clickCard('code-a'); await addToChat();
  await clickCard('code-b'); await addToChat();
  await clearAll();
  const list = await pills();
  assertPlaced(list, 'code');
  assert.equal(list.length, 2, `two pills: ${JSON.stringify(list.map(p => p.text))}`);
  assert.deepEqual(list.map(p => p.text).sort(), ['model.py L1-30', 'model.py L27-56'], JSON.stringify(list.map(p => p.text)));
  assert.deepEqual(list.map(p => p.key.split('|')[0]).sort(), [`code:karpathy/minGPT@${COMMIT}:mingpt/model.py`, `code:karpathy/minGPT@${COMMIT}:projects/chargpt/model.py`], JSON.stringify(list.map(p => p.key)));
  // Selecting a card that is already attached marks its chip: still one pill per source.
  await clickCard('s-model'); await addToChat();
  await clickCard('s-model');
  const again = await pills();
  assertPlaced(again, 'pinned and selected');
  assert.equal(again.filter(p => /model\.py$/.test(p.text.replace(/ · selected/, '')) || p.card === 's-model').length, 1, `one pill for the pinned and selected card: ${JSON.stringify(again.map(p => p.text))}`);
  quiet('code', before);
});

await check('the next request carries exactly the visible pills: x on one drops it from context_refs; the draft is what was typed', async () => {
  await clearAll();
  await pane().locator('[data-context-chip]').filter({ hasText: 'L1-30' }).locator('button[aria-label$="from this chat"]').click();
  await settle();
  await clickCard('c-long');
  const visible = await pills();
  assertPlaced(visible, 'before send');
  const before = model.length;
  answer = true;
  await field().press('Enter');
  await waitFor(() => sends.length === 1, 10000, 'the send did not reach /api/learn/ask');
  answer = false;
  quiet('send', before);
  const body = sends[0];
  assert.equal(body.question ?? body.message ?? body.prompt ?? DRAFT, DRAFT);
  const sent = (body.context_refs || []).map(ref => ref.sourceId).sort();
  const shown = visible.filter(p => !p.temporary && p.key).map(p => p.key.split('|')[0]).sort();
  assert.deepEqual(sent, shown, 'context_refs are the attached pills');
  assert.ok(!sent.some(id => id.endsWith(':projects/chargpt/model.py')), 'the removed pill is not sent');
  assert.equal(body.canvas_target?.id, 'c-long', 'the temporary selection rides as canvas_target');
});

await check('Tutor activity: the activity card stays above the composer and the selected card pill is inside it', async () => {
  const before = model.length;
  await open(ACTIVITY);
  await page.locator('[data-chat-pane] [data-tutor-activity-card]').first().waitFor({ timeout: 15000 });
  await clickCard('s-model');
  const list = await waitFor(async () => { const l = await pills(); return l.some(p => p.card === 's-model') && l; }, 5000, 'no pill on the activity canvas');
  assertPlaced(list, 'activity');
  const above = await tutorAbove();
  assert.ok(above.length > 0 && above.every(Boolean), `the activity card is above the composer: ${above}`);
  await shot('02-tutor-activity-selected-light');
  quiet('activity selection', before);
});

await check('dark mode and the 320 px Chat panel: every pill inside the composer, nothing clipped sideways', async () => {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(t => { localStorage.setItem('small.theme', t); localStorage.setItem('rh.chat.width', '320'); }, theme);
    await open(WORK);
    await clickCard('c-long');
    await clickCard('code-a'); await addToChat();
    await clickCard('c-long');
    const width = Math.round((await pane().boundingBox()).width);
    assert.ok(width <= 340, `the Chat panel is ${width} px wide`);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark', `${theme} theme`);
    const list = await pills();
    assertPlaced(list, `${theme} 320`);
    await shot(`03-${theme}-320`);
    await removeAttached();
  }
  await page.evaluate(() => { localStorage.removeItem('small.theme'); localStorage.removeItem('rh.chat.width'); });
});

await check('no model route was called outside the one canned send, and no page error', async () => {
  assert.deepEqual(model, [], `model-capable routes: ${model.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify({ canvases: { work: WORK, activity: ACTIVITY }, results, sends: sends.map(b => ({ context_refs: (b.context_refs || []).map(r => ({ sourceId: r.sourceId, name: r.name, range: r.range })), canvas_target: b.canvas_target?.id || null })) }, null, 2));
const failed = results.filter(r => !r.ok);
console.log(failed.length ? `FAIL ${failed.length} of ${results.length}` : `PASS ${results.length} checks`);
process.exit(failed.length ? 1 : 0);
