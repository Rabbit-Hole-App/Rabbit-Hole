// Canvas equations (docs/features/canvas-equations.md), end to end on the owner's canvas: the Equation tool, the palette
// (a fraction, a subscript, a 2x2 matrix), pasted LaTeX, click-out rendering, double-click to reopen, move, resize,
// delete, undo/redo, duplicate, save and reload (this browser and a fresh profile from the server copy), typing that never
// reaches the canvas's keys, the S M L XL size ladder (r35), the selection pill with the LaTeX, Ask in chat's prefill, and
// Send carrying the LaTeX.
// Against the LOCAL stack only: local D1 and fresh browser profiles. No model is called: the Learn ask and the Tutor
// planner are answered here, every other write except the board's own save is refused, and the stack's provider tripwire
// must count 0. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/equation-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('equation-check runs against the local stack only');
const SHOTS = process.argv[2] || 'equation-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `eq-owner-${run}@example.com`, secret, handle: `eq_${run}` }) })).json()).session;
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const until = async (what, fn, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { const value = await fn(); if (value) return value; await new Promise(r => setTimeout(r, 300)); } throw Error(`timed out: ${what}`); };
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Equations ${run}` }) })).body;
const catalog = (await api('/api/apps')).body;
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const PASTED = '\\sqrt{x^2+y^2}';

const browser = await chromium.launch();
const errors = [], asks = [], plans = [], refused = [];
const OUTSIDE = /youtube|ytimg|googlevideo|arxiv|wikipedia|tryrabbithole|workers\.dev|notebook/;
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== BASE) return OUTSIDE.test(url.hostname) || url.protocol !== 'http:' ? route.abort() : route.continue();
    if (['GET', 'HEAD'].includes(request.method())) return route.continue();
    const path = url.pathname;
    // The question, answered here: the Learn ask and the Tutor planner. No model.
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    if (path === '/api/learn/ask') { asks.push(JSON.parse(request.postData() || '{}')); return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: 'Answered here.' }) + frame('done', {}) }); }
    if (path === '/api/learn/tutor/plan') { plans.push(JSON.parse(request.postData() || '{}')); return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: 'Answered here.' }] } }); }
    // The board's own save (the equation's round trip) and the reads the canvas makes on open.
    if (/\/next-steps$/.test(path) || /^\/api\/learn\/(board|boards|evaluate|tutor\/state|moments|perf|events)\b/.test(path)) return route.continue();
    refused.push(`${request.method()} ${path}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.getByRole('toolbar', { name: 'Canvas tools' }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
  return { context, page };
};

let { context, page } = await open();
const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push(true); console.log(`PASS ${label}`); }
  catch (error) { results.push(false); console.log(`FAIL ${label}: ${String(error.message).split('\n')[0].slice(0, 300)}`); await page.screenshot({ path: `${SHOTS}/failed-${results.length}.png` }).catch(() => {}); }
};
const equations = () => page.evaluate(key => (JSON.parse(localStorage.getItem(key) || '{}').items || []).filter(item => item.kind === 'equation'), INK);
const field = () => page.locator('math-field');
const fieldLatex = () => field().evaluate(element => element.getValue('latex-expanded'));
const shown = () => page.locator('[data-equation]');
const composer = () => page.locator('[data-learn-dock] textarea, [data-learn-dock] input:not([type="file"])').first();
const pill = () => page.locator('[data-selected-card]');
const settle = (ms = 500) => page.waitForTimeout(ms); // the board's debounced local save is 400 ms
const has = (text, part) => text.replace(/\s+/g, '').includes(part.replace(/\s+/g, ''));
// A point of bare canvas: on the surface, on no card, note, equation, panel or control.
const blank = async (from = 0) => {
  const point = await page.evaluate(start => {
    const found = [];
    for (let y = 160; y < 660; y += 40) for (let x = 420; x < 1300; x += 40) {
      const element = document.elementFromPoint(x, y);
      if (element?.closest('[data-canvas-surface]') && !element.closest('[data-block-id],[data-item-id],[data-block],[data-equation-palette],[role="dialog"],[data-learn-dock],[data-chat-sheet],button,a,iframe,input,textarea')) found.push({ x, y });
    }
    return found[start] || found[0] || null;
  }, from);
  assert.ok(point, 'a bare point of canvas');
  return point;
};
const clickBlank = async () => { const point = await blank(); await page.mouse.click(point.x, point.y); await settle(); };
const place = async () => {
  await page.getByRole('button', { name: 'Equation', exact: true }).click();
  const point = await blank(5);
  await page.mouse.click(point.x, point.y);
  await field().waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD', null, { timeout: 5000 });
};
// The equation and its palette with some canvas around them, for the review set.
const region = async name => {
  const boxes = (await Promise.all(['[data-equation]', '[data-equation-palette]'].map(async selector => Promise.all((await page.locator(selector).all()).map(node => node.boundingBox()))))).flat().filter(Boolean);
  const left = Math.max(0, Math.min(...boxes.map(box => box.x)) - 60), top = Math.max(0, Math.min(...boxes.map(box => box.y)) - 40);
  const right = Math.max(...boxes.map(box => box.x + box.width)) + 60, bottom = Math.max(...boxes.map(box => box.y + box.height)) + 40;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, clip: { x: left, y: top, width: Math.max(480, right - left), height: bottom - top } });
};
const palette = name => page.locator('[data-equation-palette]').getByRole('button', { name, exact: true });
const tab = name => page.locator('[data-equation-palette]').getByRole('tab', { name, exact: true });

let latex = '';
await check('the toolbar has an Equation tool beside Text', async () => {
  const tools = await page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
  assert.equal(tools[tools.indexOf('Text') + 1], 'Equation');
  await page.getByRole('button', { name: 'Equation', exact: true }).hover();
  await page.getByRole('toolbar', { name: 'Canvas tools' }).screenshot({ path: `${SHOTS}/1-toolbar-equation-tool.png` });
  assert.equal(await page.locator('[data-equation-palette]').count(), 0, 'no palette while nothing is edited');
});

await check('a click places an editable equation, with the palette open and the field focused', async () => {
  await place();
  assert.equal(await page.locator('[data-equation-palette]').count(), 1);
  for (const name of ['Fraction', 'Root', 'Greek', 'Sum', 'Matrix', 'LaTeX']) assert.equal(await tab(name).count(), 1, name);
  assert.equal((await equations()).length, 1);
  await region('2-palette-editing');
});

await check('typing in the equation never fires the canvas or page shortcuts (Delete, Backspace, Ctrl+A/D/Z, C, /)', async () => {
  const comment = page.getByRole('button', { name: 'Comment  C' });
  const commentOff = async () => !(await comment.count()) || (await comment.getAttribute('aria-pressed')) === 'false';
  await page.keyboard.type('c');
  assert.ok(await commentOff(), 'C did not arm Comment');
  await page.keyboard.type('/');
  assert.equal(await page.getByRole('dialog', { name: 'Search' }).count(), 0, '/ did not open Search');
  await page.keyboard.press('Control+d');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+z'); // the field's own undo, never the canvas's
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await settle();
  assert.equal((await equations()).length, 1, 'still one equation: no duplicate, no delete, no canvas undo');
  assert.equal(await page.locator('[data-equation="editing"]').count(), 1, 'still editing');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'MATH-FIELD');
  assert.equal(await fieldLatex(), '', 'the keys edited the field');
  assert.ok(await commentOff());
});

await check('the palette builds a fraction', async () => {
  await palette('Fraction').click();
  await page.keyboard.type('1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('2');
  assert.match(await fieldLatex(), /\\frac/);
  await region('3-fraction');
});

await check('the palette builds a subscripted expression', async () => {
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('+');
  await palette('Subscript').click();
  await page.keyboard.type('x');
  await page.keyboard.press('Tab');
  await page.keyboard.type('i');
  assert.ok(has(await fieldLatex(), 'x_{i}') || has(await fieldLatex(), 'x_i'), await fieldLatex());
  await region('4-subscript');
});

await check('a click away finishes: the equation renders, and its LaTeX is saved', async () => {
  latex = await fieldLatex();
  await clickBlank();
  assert.equal(await field().count(), 0, 'the editor closed');
  assert.equal(await page.locator('[data-equation-palette]').count(), 0, 'the palette hides');
  assert.ok(await shown().locator('.katex').count());
  assert.equal(await shown().locator('.katex-error').count(), 0);
  assert.equal((await equations())[0].latex, latex);
  await region('5-rendered-after-click-out');
});

await check('a double-click reopens it with its source, and the palette builds a 2x2 matrix', async () => {
  await shown().first().dblclick();
  await field().waitFor();
  assert.equal(await fieldLatex(), latex);
  await field().evaluate(element => element.executeCommand('moveToMathfieldEnd'));
  await tab('Matrix').click();
  const [surface, tall] = await Promise.all([page.locator('[data-canvas-surface]').boundingBox(), page.locator('[data-equation-palette]').boundingBox()]);
  assert.ok(tall.y >= surface.y, `the taller Matrix tab stays on the canvas (palette top ${Math.round(tall.y)}, canvas top ${Math.round(surface.y)})`);
  await palette('2 by 2 matrix').click();
  for (const [index, cell] of ['1', '0', '0', '1'].entries()) { if (index) await page.keyboard.press('Tab'); await page.keyboard.type(cell); }
  assert.ok(has(await fieldLatex(), '\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}'), await fieldLatex());
  await region('6-matrix');
  latex = await fieldLatex();
  await page.keyboard.press('Escape');
  await settle();
  assert.equal(await field().count(), 0, 'Esc finishes too');
  assert.equal((await equations())[0].latex, latex);
  assert.equal(await shown().locator('.katex-error').count(), 0);
});

await check('pasted LaTeX becomes an equation, and the canvas makes no text card of it', async () => {
  await place();
  await page.evaluate(text => navigator.clipboard.writeText(text), PASTED);
  await page.keyboard.press('Control+v');
  await settle(300);
  assert.ok(has(await fieldLatex(), '\\sqrt{x^2+y^2}'), await fieldLatex());
  await clickBlank();
  const all = await equations();
  assert.equal(all.length, 2);
  assert.ok(has(all[1].latex, '\\sqrt{x^2+y^2}'));
  assert.equal(await page.evaluate(key => (JSON.parse(localStorage.getItem(key) || '{}').items || []).filter(item => item.kind === 'text').length, INK), 0);
  // The second one goes again; the first stays for the rest.
  await shown().nth(1).click();
  await page.keyboard.press('Delete');
  await settle();
  assert.equal((await equations()).length, 1);
});

await check('an equation moves, resizes, deletes, and undo and redo cover each', async () => {
  const before = (await equations())[0];
  const box = await shown().first().boundingBox();
  await page.mouse.move(box.x + 6, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 106, box.y + box.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await settle();
  const moved = (await equations())[0];
  assert.ok(moved.x > before.x + 40 && moved.y > before.y + 10, `moved ${JSON.stringify([before.x, before.y, moved.x, moved.y])}`);
  await shown().first().click();
  const handle = await page.getByRole('button', { name: 'Resize equation' }).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 120, handle.y + 60, { steps: 6 });
  await page.mouse.up();
  await settle();
  const resized = (await equations())[0];
  assert.ok(resized.size > moved.size, `size ${moved.size} -> ${resized.size}`);
  assert.equal(resized.latex, latex, 'resizing keeps the source');
  await page.keyboard.press('Control+z');
  await settle();
  assert.equal((await equations())[0].size, moved.size, 'undo the resize');
  await page.keyboard.press('Control+y');
  await settle();
  assert.equal((await equations())[0].size, resized.size, 'redo the resize');
  await shown().first().click();
  await page.keyboard.press('Delete');
  await settle();
  assert.equal((await equations()).length, 0, 'Delete removes the selected equation');
  await page.keyboard.press('Control+z');
  await settle();
  assert.equal((await equations())[0]?.latex, latex, 'undo brings it back with its source');
  await page.keyboard.press('Control+y');
  await settle();
  assert.equal((await equations()).length, 0, 'redo deletes it again');
  await page.keyboard.press('Control+z');
  await settle();
  assert.equal((await equations()).length, 1);
});

await check('duplicate keeps the source', async () => {
  await shown().first().click();
  await page.keyboard.press('Control+d');
  await settle();
  const all = await equations();
  assert.equal(all.length, 2);
  assert.equal(all[1].latex, latex);
  assert.notEqual(all[1].id, all[0].id);
  await page.keyboard.press('Delete'); // the copy is the selection
  await settle();
  assert.equal((await equations()).length, 1);
});

// r35 (owner: "For the equation do you think we need like the shapes has above them: H1, H2, H3, Text?"): a size ladder,
// S M L XL, where a text box shows its H1-to-text one. Sizes: S 19, M 24, L 32, XL 48 (canvas-equation.js).
const ladder = () => page.getByRole('group', { name: 'Equation size' });
const step = name => ladder().getByRole('button', { name, exact: true });
const pressed = () => ladder().locator('button[aria-pressed="true"]').allInnerTexts();
const tall = async () => (await shown().first().locator('.katex').first().boundingBox()).height;
const sizeShot = async name => {
  const boxes = (await Promise.all(['[data-equation]', '[role="group"][aria-label="Equation size"]', '[role="group"][aria-label="Text level"]'].map(async selector => Promise.all((await page.locator(selector).all()).map(node => node.boundingBox()))))).flat().filter(Boolean);
  const left = Math.max(0, Math.min(...boxes.map(box => box.x)) - 60), top = Math.max(0, Math.min(...boxes.map(box => box.y)) - 40);
  const right = Math.max(...boxes.map(box => box.x + box.width)) + 60, bottom = Math.max(...boxes.map(box => box.y + box.height)) + 40;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, clip: { x: left, y: top, width: Math.max(480, right - left), height: bottom - top } });
};
await check('a selected equation has the S M L XL size ladder: a level sets its size, undo restores it, duplicate keeps it, none while editing', async () => {
  await clickBlank();
  assert.equal(await ladder().count(), 0, 'no ladder on an unselected equation');
  await shown().first().click();
  await ladder().waitFor({ timeout: 5000 });
  assert.deepEqual(await ladder().getByRole('button').allInnerTexts(), ['S', 'M', 'L', 'XL']);
  const [mark, box] = await Promise.all([ladder().boundingBox(), shown().first().boundingBox()]);
  assert.ok(mark.y + mark.height <= box.y + 1 && Math.abs(mark.x - box.x) <= 2, `above the equation at its left edge, as a text box's ladder: ${JSON.stringify({ mark, box })}`);
  const custom = (await equations())[0].size; // the corner handle's size from the resize check above
  assert.deepEqual(await pressed(), { 19: ['S'], 24: ['M'], 32: ['L'], 48: ['XL'] }[custom] || [], `size ${custom}: its level, or none when custom`);
  await step('M').click(); await settle();
  assert.equal((await equations())[0].size, 24);
  assert.deepEqual(await pressed(), ['M']);
  const medium = await tall();
  await sizeShot('equation-size-1-ladder-m');
  await step('S').click(); await settle();
  assert.equal((await equations())[0].size, 19);
  const small = await tall();
  assert.ok(small < medium * 0.9, `S renders smaller: ${small} < ${medium}`);
  await step('XL').click(); await settle();
  assert.equal((await equations())[0].size, 48);
  assert.deepEqual(await pressed(), ['XL']);
  assert.ok(await tall() > medium * 1.7, `XL renders about twice M: ${await tall()} vs ${medium}`);
  assert.equal((await equations())[0].latex, latex, 'a level keeps the source');
  await sizeShot('equation-size-2-xl');
  await page.keyboard.press('Control+z'); await settle();
  assert.equal((await equations())[0].size, 19, 'undo restores the level before');
  await page.keyboard.press('Control+z'); await settle();
  assert.equal((await equations())[0].size, 24, 'and the one before that');
  await page.keyboard.press('Control+y'); await settle();
  assert.equal((await equations())[0].size, 19, 'redo');
  await shown().first().click(); // undo clears the selection, as it does for any canvas edit
  await ladder().waitFor({ timeout: 5000 });
  assert.deepEqual(await pressed(), ['S'], 'the ladder shows the restored level');
  await step('L').click(); await settle();
  assert.equal((await equations())[0].size, 32);
  // Beside H1 text: L is H1's size.
  await sizeShot('equation-size-3-l');
  await page.keyboard.press('Control+d'); await settle();
  const copies = await equations();
  assert.deepEqual(copies.map(item => item.size), [32, 32], 'duplicate keeps the level');
  await page.keyboard.press('Delete'); await settle();
  assert.equal((await equations()).length, 1);
  // Editing the LaTeX: the palette, never the ladder.
  await shown().first().dblclick();
  await field().waitFor();
  assert.equal(await ladder().count(), 0, 'no ladder while the LaTeX is edited');
  assert.equal(await page.locator('[data-equation-palette]').count(), 1);
  await region('equation-size-4-editing-no-ladder');
  await page.keyboard.press('Escape'); await settle();
  assert.equal((await equations())[0].size, 32, 'editing keeps the level');
});

await check('selecting the equation shows the composer pill with its LaTeX', async () => {
  await clickBlank();
  await shown().first().click();
  await pill().waitFor({ timeout: 5000 });
  assert.equal(await pill().getAttribute('title'), `Equation: ${latex}`);
  assert.equal(await page.locator('[data-canvas-target]').count(), 1);
});

await check('Ask in chat prefills a question and sends nothing; Send carries the LaTeX as the context', async () => {
  const a0 = asks.length, p0 = plans.length;
  await shown().first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Ask in chat' }).click();
  await settle();
  assert.equal(await composer().inputValue(), 'Can you explain this equation?');
  assert.equal(asks.length + plans.length, a0 + p0, 'nothing sent');
  assert.equal(await pill().getAttribute('title'), `Equation: ${latex}`);
  await page.screenshot({ path: `${SHOTS}/7-pill-and-prefilled-question.png` });
  await composer().press('Enter');
  await until('the question', async () => asks.length + plans.length > a0 + p0, 8000);
  const body = JSON.stringify(asks.length > a0 ? asks.at(-1) : plans.at(-1));
  assert.ok(body.includes(JSON.stringify(latex).slice(1, -1)), `the request carries the LaTeX: ${body.slice(0, 300)}`);
  if (asks.length > a0) assert.equal(asks.at(-1).canvas_target?.kind, 'Equation');
  await settle(400);
  const collapse = page.getByRole('button', { name: 'Collapse chat' });
  if (await collapse.count()) await collapse.first().click();
});

await check('save and reload keep the LaTeX and the size level (L): this browser, the server copy, and a fresh browser from it', async () => {
  const saved = await until('the equation on the server', async () => {
    const board = (await api(`/api/learn/boards/${canvas.name}/main`)).body;
    return board?.state?.items?.find(item => item.kind === 'equation' && item.latex === latex && item.size === 32);
  });
  assert.equal(saved.size, 32);
  await page.reload();
  await shown().first().waitFor({ timeout: 60000 });
  assert.equal((await equations())[0].latex, latex);
  assert.equal((await equations())[0].size, 32);
  assert.equal(await shown().locator('.katex-error').count(), 0);
  await shown().first().click();
  await ladder().waitFor({ timeout: 5000 });
  assert.deepEqual(await pressed(), ['L'], 'the ladder shows L after a reload');
  await sizeShot('equation-size-5-after-reload');
  await context.close();
  ({ context, page } = await open()); // a fresh profile: no local copy, the server's only
  await shown().first().waitFor({ timeout: 60000 });
  assert.equal((await equations())[0].latex, latex);
  assert.equal((await equations())[0].size, 32);
  assert.ok(await shown().first().locator('.katex').count());
  await shown().first().click();
  await ladder().waitFor({ timeout: 5000 });
  assert.deepEqual(await pressed(), ['L'], 'and in a fresh browser');
});

await context.close();
await browser.close();
const tripwire = await Promise.all([BASE, CP].map(async origin => (await (await fetch(`${origin}/__provider-tripwire`)).json()).hits.length));
console.log('provider tripwire hits', tripwire.join(' / '), 'refused', refused.length ? [...new Set(refused)].join(', ') : 'none', 'page errors', errors.length ? errors.join(' | ') : 'none');
results.push(tripwire.every(hits => hits === 0));
console.log(`${results.at(-1) ? 'PASS' : 'FAIL'} no model call`);
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
