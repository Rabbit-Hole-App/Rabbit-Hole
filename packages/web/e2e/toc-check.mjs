// The Table of contents tab, R4 redesign (C:/s/spec/toc-r4.md section A1 and owner decisions 1A, 2A, 3A, 6A, 7A;
// TableOfContents.jsx): the numbered hierarchy, descriptions, the guide line through the topic markers, round
// completion controls that only complete, titles that only navigate, editing a title and description, drag to reorder
// (never from a circle), narrow and wide panels, light and dark, and persistence across a reload. Against the LOCAL
// stack only: local D1 and fresh browser profiles. No model is called: /api/learn/ask is answered here for every request
// and any other model route fails the run. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8888 SMALL_CP=http://127.0.0.1:8889 node e2e/toc-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8888';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8889';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('toc-check runs against the local stack only');
const SHOTS = process.argv[2] || 'toc-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const session = await sessionFor(`toc-owner-${run}@example.com`, `toc_${run}`);
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };

// Three topics: the first with a long description that wraps and three levels under it, the second a long title with no
// description, the third with ten sub-sections so a two-digit number shows. Cards sit under each, so a section frames
// somewhere real.
const h = (id, level, text, extra = {}) => ({ id, type: 'heading', dx: 0, dy: 0, level, text, done: false, ...extra });
const card = (id, title) => ({ id, type: 'explanation', dx: 0, dy: 0, title, body: 'Heat speeds every reaction in the pan; acids loosen proteins before the heat sets them. '.repeat(3) });
const BLOCKS = [
  h('t1', 1, 'Kitchen chemistry', { description: 'Why heat, salt and acid change the food you cook, and how to read those changes in the pan before they go too far.' }),
  card('c1', 'What cooking does'),
  h('s11', 2, 'Maillard browning', { description: 'Sugars and amino acids react above about 140 C and make new flavours.', done: true }),
  card('c11', 'The browning reaction'),
  h('s111', 3, 'Temperature windows', { description: 'Too cool steams; too hot burns.' }),
  card('c111', 'Pan temperature'),
  h('s12', 2, 'Acids and proteins'),
  card('c12', 'Ceviche'),
  h('t2', 1, 'A deliberately long topic title that has to wrap onto a second line in a narrow panel without overlapping anything'),
  card('c2', 'Long title card'),
  h('t3', 1, 'Baking', { description: 'Flour, water, heat.' }),
  ...Array.from({ length: 10 }, (_, i) => [h(`s3${i}`, 2, `Bread step ${i + 1}`), card(`c3${i}`, `Bread card ${i + 1}`)]).flat(),
];
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `TOC ${run}` }) })).body;
// The board lives on the server, so every new browser context (a reload, another width, dark) reads what the last one saved.
const seededBoard = await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE }) });
if (seededBoard.status !== 200) throw Error(`seeding the board failed: ${seededBoard.status}`);
// The local D1 now and then answers a read with a 500; retry those, never a 4xx.
const serverBlocks = async () => { for (let i = 0; i < 4; i += 1) { const r = await api(`/api/learn/boards/${canvas.name}/main`); if (r.status < 500) return r.body?.state?.blocks || []; } return []; };
// Wait for the canvas's debounced save to reach the server: the asserted state, polled, never a fixed sleep.
const saved = async (label, test) => {
  for (const until = Date.now() + 20000; Date.now() < until;) { if (test((await serverBlocks()).filter(block => block.type === 'heading'))) return; await new Promise(go => setTimeout(go, 250)); }
  throw Error(`the server never saved: ${label}`);
};

const browser = await chromium.launch();
const asks = [], stray = [], errors = [];
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
let context, page;
const open = async ({ width = 1440, height = 900, chat = 420, theme = 'light' } = {}) => {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(([chatWidth, look]) => {
    localStorage.setItem('rh.chat.width', String(chatWidth));
    localStorage.setItem('small.theme', look);
  }, [chat, theme]);
  await context.route('**/api/learn/ask', route => { asks.push(route.request().url()); return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'event: done\ndata: {}\n\n' }); });
  await context.route(/\/api\/learn\/(tutor(?!\/next-steps)|artifact|home-ask|journeys?)\b/, route => { if (route.request().method() === 'GET') return route.continue(); stray.push(route.request().url()); return route.abort(); });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-block-id="c1"]').waitFor({ timeout: 60000 });
  if (!(await page.getByRole('button', { name: 'Hide the right panel' }).count())) await page.getByRole('button', { name: 'Show the right panel' }).click();
  await page.getByRole('tab', { name: 'Table of contents', exact: true }).click();
  await toc().locator('[data-toc-entry="t1"]').waitFor();
};
const toc = () => page.locator('aside[aria-label="Learn agent chat"] [data-toc]');
const entry = id => toc().locator(`[data-toc-entry="${id}"]`);
const circle = id => entry(id).getByRole('checkbox');
const title = id => entry(id).locator('button').first();
const camera = () => page.evaluate(() => document.querySelector('[data-canvas-surface] div[style*="scale("]')?.style.transform || '');
const order = () => toc().locator('[data-toc-entry]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-toc-entry')));
const shot = async (name, target = toc()) => {
  await page.waitForTimeout(300); // the hover chrome and fonts settle for the picture only; no assertion waits on it
  await target.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log('shot', name);
};
// Each row's marker (the visible circle), number and title boxes.
const geometry = () => toc().evaluate(root => [...root.querySelectorAll('[data-toc-entry]')].map(row => {
  const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const mark = row.querySelector('label > span');
  const li = row.parentElement, line = getComputedStyle(li, '::before');
  const liBox = li.getBoundingClientRect();
  return {
    id: row.getAttribute('data-toc-entry'), level: Number(row.getAttribute('data-level')), mark: box(mark), row: box(row),
    title: box(row.querySelector('button')), number: row.querySelector('span.tabular-nums') ? box(row.querySelector('span.tabular-nums')) : null,
    line: line.content === 'none' || line.width === 'auto' ? null : { x: liBox.x + parseFloat(line.left) + parseFloat(line.width) / 2, top: liBox.y + parseFloat(line.top), bottom: liBox.bottom - parseFloat(line.bottom) },
  };
}));
const center = box => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

await open();

await check('1 the hierarchy reads Topic 1 / 1.1 / 1.1.1 with descriptions under titles; no empty description line', async () => {
  const rows = await toc().locator('[data-toc-entry]').evaluateAll(nodes => nodes.map(node => node.innerText.replace(/\s+/g, ' ').trim()));
  assert.equal(rows[0].startsWith('Topic 1: Kitchen chemistry Why heat, salt and acid'), true, rows[0]);
  assert.equal(rows[1], '1.1 Maillard browning Sugars and amino acids react above about 140 C and make new flavours.');
  assert.equal(rows[2], '1.1.1 Temperature windows Too cool steams; too hot burns.');
  assert.equal(rows[3], '1.2 Acids and proteins');
  assert.equal(rows[4].startsWith('Topic 2: A deliberately long topic title'), true);
  assert.equal(rows[5], 'Topic 3: Baking Flour, water, heat.');
  assert.equal(rows[15], '3.10 Bread step 10');
  assert.equal(await entry('s12').locator('p').count(), 0, 'no description, no line for one');
  assert.equal(await entry('t2').locator('p').count(), 0);
  const titles = await toc().evaluate(root => ['t1', 's11', 's111'].map(id => { const b = root.querySelector(`[data-toc-entry="${id}"] button`); const s = getComputedStyle(b); return [parseFloat(s.fontSize), Number(s.fontWeight)]; }));
  assert.deepEqual(titles[0], [16, 600], 'topic heading 16px / 600');
  assert.ok(titles[1][0] === 14 && titles[1][1] >= 500 && titles[1][1] <= 600, `sub-section title 14px / 500-600, got ${titles[1]}`);
  assert.ok(titles[0][0] > titles[1][0], 'topics are visibly stronger');
});

await check('2 the guide line runs through the centres of the topic markers, behind them, first to last, whatever the rows wrap to', async () => {
  const rows = await geometry();
  const topics = rows.filter(row => row.level === 1);
  for (let i = 0; i < topics.length; i += 1) {
    const here = center(topics[i].mark);
    if (i === topics.length - 1) { assert.equal(topics[i].line, null, 'no line past the last topic'); continue; }
    const next = center(topics[i + 1].mark);
    assert.ok(topics[i].line, `a line from ${topics[i].id}`);
    assert.ok(Math.abs(topics[i].line.x - here.x) <= 1, `line x ${topics[i].line.x} vs marker ${here.x}`);
    assert.ok(Math.abs(topics[i].line.top - here.y) <= 1.5, `line starts at ${topics[i].id}'s centre`);
    assert.ok(Math.abs(topics[i].line.bottom - next.y) <= 1.5, `line ends at ${topics[i + 1].id}'s centre (${topics[i].line.bottom} vs ${next.y})`);
  }
  const sub = rows.find(row => row.id === 's11');
  const deeper = center(sub.mark).x - center(topics[0].mark).x;
  assert.ok(deeper >= 24 && deeper <= 28, `sub-section markers ${deeper}px deeper than topic markers`);
  const gap = topics[0].title.x - topics[0].mark.right;
  assert.ok(gap >= 10 && gap <= 16, `marker to text ${gap}px`);
  assert.equal(new Set(topics.map(row => Math.round(center(row.mark).x))).size, 1, 'topic markers share one column');
  const tens = rows.filter(row => row.id.startsWith('s3'));
  assert.equal(new Set(tens.map(row => Math.round(row.title.x))).size, 1, 'titles stay aligned from 3.1 to 3.10');
});
await shot('01-light-wide');

await check('3 a circle only completes: it ticks, the canvas stays put, and it unticks; keyboard Space works the same', async () => {
  const before = await camera();
  await circle('s12').click();
  await page.waitForFunction(() => document.querySelector('[data-toc-entry="s12"]')?.hasAttribute('data-done'));
  assert.equal(await circle('s12').isChecked(), true);
  assert.equal(await camera(), before, 'completion never moves the canvas');
  await circle('s12').focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !document.querySelector('[data-toc-entry="s12"]')?.hasAttribute('data-done'));
  assert.equal(await circle('s12').isChecked(), false);
  const ring = await entry('s12').locator('label > span').evaluate(node => getComputedStyle(node).outlineStyle);
  assert.notEqual(ring, 'none', 'a visible focus ring on the circle');
});

await check('4 a title only navigates: the canvas frames the section and no completion changes', async () => {
  const done = async () => toc().locator('[data-toc-entry][data-done]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-toc-entry')));
  const before = [await camera(), await done()];
  await title('t3').click();
  await page.waitForFunction(previous => (document.querySelector('[data-canvas-surface] div[style*="scale("]')?.style.transform || '') !== previous, before[0]);
  assert.deepEqual(await done(), before[1], 'navigation never completes');
});

await check('5 a title and description edit in place, together, and the canvas heading follows; Escape keeps both', async () => {
  await entry('s12').hover();
  await entry('s12').getByRole('button', { name: 'Edit Acids and proteins' }).click();
  const editor = toc().locator('[data-toc-editor]');
  await editor.getByRole('textbox', { name: 'Title of Acids and proteins' }).fill('Acids and egg proteins');
  await editor.getByRole('textbox', { name: 'Description of Acids and proteins' }).fill('Why lemon juice firms an egg white without heat.');
  await shot('02-editing', entry('s12'));
  await editor.getByRole('textbox', { name: 'Description of Acids and proteins' }).press('Enter');
  await editor.waitFor({ state: 'detached' });
  assert.equal((await entry('s12').innerText()).replace(/\s+/g, ' ').trim(), '1.2 Acids and egg proteins Why lemon juice firms an egg white without heat.');
  assert.equal(await page.locator('[data-block-id="s12"]').innerText().then(text => text.includes('Acids and egg proteins')), true, 'the canvas heading follows');
  // Escape leaves everything as it was.
  await entry('t3').hover();
  await entry('t3').getByRole('button', { name: 'Edit Baking' }).click();
  await toc().getByRole('textbox', { name: 'Title of Baking' }).fill('Not this');
  await toc().getByRole('textbox', { name: 'Title of Baking' }).press('Escape');
  await toc().locator('[data-toc-editor]').waitFor({ state: 'detached' });
  assert.equal(await title('t3').innerText(), 'Topic 3: Baking');
});

await check('6 a drag moves a section with its sub-sections and renumbers; completion stays with its section; a drag from a circle moves nothing', async () => {
  // A panel tall enough to hold the whole outline: a native drag cannot scroll its own list.
  await saved('the step 5 edit', headings => headings.some(block => block.id === 's12' && block.description === 'Why lemon juice firms an egg white without heat.'));
  await open({ height: 2000 });
  await entry('t3').dragTo(entry('t1'), { targetPosition: { x: 40, y: 4 } });
  await page.waitForFunction(() => document.querySelector('[data-toc-entry]')?.getAttribute('data-toc-entry') === 't3');
  const now = await order();
  assert.deepEqual(now.slice(0, 11), ['t3', ...Array.from({ length: 10 }, (_, i) => `s3${i}`)], 'Baking leads, with its ten steps');
  assert.equal(await title('t3').innerText(), 'Topic 1: Baking');
  assert.equal(await title('t1').innerText(), 'Topic 2: Kitchen chemistry');
  assert.equal(await entry('s11').getAttribute('data-done'), 'true', 'Maillard browning is still done after its number changed');
  assert.equal((await entry('s11').innerText()).startsWith('2.1'), true);
  const before = await order();
  await circle('t2').dragTo(entry('t3'), { targetPosition: { x: 40, y: 4 } });
  assert.deepEqual(await order(), before, 'the circle never starts a drag');
});

await check('7 reload: completion, the edit and the order are what the learner left', async () => {
  await saved('the step 6 order', headings => headings[0]?.id === 't3');
  await open();
  assert.equal((await order())[0], 't3');
  assert.equal(await entry('s11').getAttribute('data-done'), 'true');
  assert.equal((await entry('s12').innerText()).includes('Why lemon juice firms an egg white without heat.'), true);
});

await check('8 narrow (300px) and wide (640px) panels: text wraps, no horizontal scrollbar, markers and numbers stay aligned, nothing overlaps the controls', async () => {
  for (const chat of [300, 640]) {
    await open({ chat });
    const box = await toc().evaluate(root => ({ scroll: root.scrollWidth, client: root.clientWidth, right: root.getBoundingClientRect().right }));
    assert.ok(box.scroll <= box.client, `no horizontal scroll at ${chat}px (${box.scroll} > ${box.client})`);
    const rows = await geometry();
    for (const row of rows) assert.ok(row.title.right <= box.right + 0.5 && row.row.right <= box.right + 0.5, `${row.id} fits at ${chat}px`);
    assert.equal(new Set(rows.filter(row => row.level === 1).map(row => Math.round(center(row.mark).x))).size, 1);
    const long = rows.find(row => row.id === 't2');
    assert.ok(chat > 300 || long.title.h > 30, 'the long title wraps in the narrow panel');
    await shot(chat === 300 ? '03-light-narrow' : '04-light-wide-640');
  }
});

await check('9 dark: the same hierarchy on the dark surface, the line a low-emphasis border', async () => {
  await open({ theme: 'dark' });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
  const [line, ink] = await toc().evaluate(root => [getComputedStyle(root.querySelector('li'), '::before').backgroundColor, getComputedStyle(root.querySelector('[data-toc-entry] button')).color]);
  assert.notEqual(line, ink, 'the line is not text-coloured');
  await shot('05-dark-wide');
  await open({ theme: 'dark', chat: 300 });
  await shot('06-dark-narrow');
});

await context.close();
await browser.close();
assert.deepEqual(stray, [], 'no model route was called');
assert.deepEqual(asks, [], 'nothing was sent');
assert.deepEqual(errors, [], 'no page errors');
console.log(`\n${results.length} checks passed -> ${SHOTS}`);
