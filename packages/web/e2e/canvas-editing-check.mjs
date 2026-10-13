import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Browser acceptance for canvas editing (docs/features/canvas-editing.md), run against the real AdaptiveCanvas mounted
// by e2e/canvas-editing-harness.html under Vite dev: no server, no model, nothing leaves the machine. Real mouse and
// keyboard input through Playwright (CDP-dispatched; trackpad wheel events are synthetic, not hardware).
// usage: start `npx vite --port 5391 --strictPort --host 127.0.0.1` in packages/web, then
//        node e2e/canvas-editing-check.mjs [screenshot dir] [--only=<name substring>]
const BASE = process.env.HARNESS || 'http://127.0.0.1:5391/e2e/canvas-editing-harness.html';
const SHOTS = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const ONLY = (process.argv.find(arg => arg.startsWith('--only=')) || '').slice(7);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };

const browser = await chromium.launch();
const errors = [];

// One fresh page per scenario, seeded with a board.
async function open(name, board, { readonly = false, viewport = { width: 1500, height: 950 } } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|favicon/.test(message.text())) errors.push(`${name}: ${message.text()}`); });
  const key = `harness:${name}`;
  await page.goto(`${BASE}?board=${name}`);
  await page.evaluate(([key, board]) => localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [], groups: [], areas: [], ...board })), [key, board]);
  await page.goto(`${BASE}?board=${name}${readonly ? '&readonly=1' : ''}`);
  await page.locator('[data-canvas-surface]').waitFor();
  await page.waitForTimeout(300);
  const saved = async () => { await page.waitForTimeout(550); return page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), key); };
  const reload = async () => { await page.waitForTimeout(550); await page.reload(); await page.locator('[data-canvas-surface]').waitFor(); await page.waitForTimeout(300); };
  // World point -> screen point, through the camera transform.
  const screen = async (x, y) => page.evaluate(([x, y]) => {
    const world = document.querySelector('[data-canvas-surface] > div[style*="scale"]');
    const m = new DOMMatrix(getComputedStyle(world).transform);
    const box = world.parentElement.getBoundingClientRect();
    return { x: box.left + m.e + x * m.a, y: box.top + m.f + y * m.d };
  }, [x, y]);
  const shot = async label => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${label}.png` }); };
  return { page, context, saved, reload, screen, shot };
}
const run = async (name, fn) => {
  if (ONLY && !name.includes(ONLY)) return;
  try { await fn(); } catch (error) { check(`${name} (threw)`, false, error.message.split('\n')[0]); }
};

await run('smoke', async () => {
  const { page, context, shot } = await open('smoke', { items: [{ id: 't1', kind: 'text', x: 80, y: 80, w: 300, text: 'hello', color: '#37352f', opacity: 1 }] });
  check('the harness mounts the canvas with a saved text box', await page.locator('[data-item-id="t1"]').isVisible());
  await shot('smoke');
  await context.close();
});


const textItem = (id, x, y, extra = {}) => ({ id, kind: 'text', x, y, w: 320, text: 'hello world', color: '#37352f', opacity: 1, ...extra });
const editorText = page => page.evaluate(() => document.activeElement?.closest('[data-rich-editor]') ? document.activeElement.innerText : null);
const selectionText = page => page.evaluate(() => getSelection().toString());
const itemOf = async (saved, id) => (await saved()).items.find(item => item.id === id);
const viewOf = page => page.evaluate(() => document.querySelector('[data-canvas-surface] > div[style*="scale"]').style.transform);

await run('text editing', async () => {
  const { page, context, saved, reload, shot } = await open('text-editing', { items: [textItem('t1', 100, 100, { text: 'alpha  beta' })] });
  const box = page.locator('[data-item-id="t1"]');
  const at = await box.boundingBox();
  // single click selects, does not edit
  await page.mouse.click(at.x + 10, at.y + at.height / 2);
  check('a single click selects a text box without editing it', (await page.locator('[data-item-id="t1"].ring-2').count()) === 1 && (await editorText(page)) === null);
  // double click edits, caret where pressed
  const glyphs = await page.locator('[data-item-id="t1"] [aria-label="Text"]').boundingBox();
  await page.mouse.dblclick(glyphs.x + 2, glyphs.y + glyphs.height / 2);
  await page.waitForTimeout(150);
  check('a double click opens the editor', (await editorText(page)) !== null);
  // a click inside places the caret; a drag selects characters; neither moves the box or the camera
  const before = { box: await box.boundingBox(), view: await viewOf(page) };
  await page.mouse.click(glyphs.x + 2, glyphs.y + glyphs.height / 2);
  await page.mouse.move(glyphs.x + 1, glyphs.y + glyphs.height / 2);
  await page.mouse.down();
  await page.mouse.move(glyphs.x + 30, glyphs.y + glyphs.height / 2, { steps: 6 });
  await page.mouse.up();
  const dragged = await selectionText(page);
  const after = { box: await box.boundingBox(), view: await viewOf(page) };
  check('dragging inside the editor selects characters', dragged.length > 0 && 'alpha  beta'.startsWith(dragged), JSON.stringify(dragged));
  check('neither the caret click nor the drag moved the box or panned', Math.abs(after.box.x - before.box.x) < 0.5 && Math.abs(after.box.y - before.box.y) < 0.5 && after.view === before.view);
  // Enter breaks the line; spaces survive; Esc commits and keeps it selected
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('gamma   delta');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('end');
  await page.keyboard.press('Escape');
  const item = await itemOf(saved, 't1');
  check('Enter adds lines and spaces are kept, saved as plain text', item.text === 'alpha  beta\ngamma   delta\n\nend', JSON.stringify(item.text));
  check('Esc finishes editing and leaves the text box selected', (await editorText(page)) === null && (await page.locator('[data-item-id="t1"].ring-2').count()) === 1);
  // Enter on the selected box edits again (not a card, so it does not open anything)
  await page.keyboard.press('Enter');
  check('Enter on a selected text box starts editing it', (await editorText(page)) !== null);
  await page.keyboard.press('Control+Enter');
  check('Ctrl+Enter finishes editing', (await editorText(page)) === null);
  await reload();
  const shown = await page.locator('[data-item-id="t1"] [aria-label="Text"]').evaluate(node => node.innerText);
  check('lines, blank lines and spaces survive a reload', shown.replace(/\n$/, '') === 'alpha  beta\ngamma   delta\n\nend', JSON.stringify(shown));
  await shot('text-multiline');
  await context.close();
});

await run('formatting', async () => {
  const { page, context, saved, reload, shot } = await open('formatting', { items: [textItem('t1', 100, 100)] });
  await page.locator('[data-item-id="t1"]').dblclick();
  await page.keyboard.press('End');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowLeft');
  check('a range is selected in the editor', (await selectionText(page)) === 'world');
  await page.getByRole('button', { name: 'Bold (Ctrl B)' }).click();
  check('the selection survives pressing Bold', (await selectionText(page)) === 'world');
  await page.getByRole('button', { name: 'Serif font' }).click();
  await page.locator('[aria-label="Text color hex"]').fill('#b42318');
  await page.locator('[aria-label="Text color hex"]').press('Enter');
  check('the selection survives typing a hex colour in the panel', (await selectionText(page)) === 'world' && (await editorText(page)) !== null);
  const size = page.locator('input[aria-label="Font size"]');
  await size.fill('28');
  await size.press('Enter');
  check('the selection survives a typed font size', (await selectionText(page)) === 'world');
  check('the panel shows the range values', (await page.getByRole('button', { name: 'Bold (Ctrl B)' }).getAttribute('aria-pressed')) === 'true' && (await size.inputValue()) === '28');
  // A caret with no range: Italic applies to what is typed next.
  await page.keyboard.press('End');
  await page.keyboard.press('Control+i');
  await page.keyboard.type('!!');
  await page.keyboard.press('Escape');
  const item = await itemOf(saved, 't1');
  const runs = item.runs || [];
  const world = runs.find(run => run.t.includes('world'));
  const bang = runs.find(run => run.t.includes('!!'));
  check('the range took bold, serif, colour and size; the plain text is unchanged', item.text === 'hello world!!' && world?.b === true && world?.f === 'serif' && world?.c === '#b42318' && world?.s === 28, JSON.stringify(runs));
  check('a caret format applies to the next typing', bang?.i === true, JSON.stringify(bang));
  check('the start keeps its own look', !runs[0].b && runs[0].t.startsWith('hello'), JSON.stringify(runs[0]));
  // Mixed: the whole text selected shows bold as mixed.
  await page.locator('[data-item-id="t1"]').click();
  check('a mixed selection shows Mixed, not one value', (await page.getByRole('button', { name: 'Bold (Ctrl B)' }).getAttribute('aria-pressed')) === 'mixed' && (await page.locator('[data-style-panel] [data-mixed]').count()) > 0);
  // Object-level: the whole box takes underline.
  await page.getByRole('button', { name: 'Underline (Ctrl U)' }).click();
  check('formatting a selected (not edited) text box applies to all of it', (await itemOf(saved, 't1')).underline === true);
  await page.keyboard.press('Control+z');
  check('undo takes back the object formatting', !(await itemOf(saved, 't1')).underline);
  await page.keyboard.press('Control+y');
  check('redo puts it back', (await itemOf(saved, 't1')).underline === true);
  await reload();
  const bold = await page.locator('[data-item-id="t1"] span[data-run]').evaluateAll(nodes => nodes.filter(node => JSON.parse(node.dataset.run).b).map(node => [node.textContent, getComputedStyle(node).fontWeight, getComputedStyle(node).fontFamily])[0] || null);
  check('formatting survives a reload', bold && bold[0] === 'world' && Number(bold[1]) >= 700 && /Georgia/.test(bold[2]), JSON.stringify(bold));
  await shot('text-formatting');
  await context.close();
});

await run('editor keys', async () => {
  const { page, context, saved } = await open('editor-keys', { items: [textItem('t1', 100, 100), textItem('t2', 100, 300, { text: 'other' })] });
  await page.locator('[data-item-id="t1"]').dblclick();
  await page.keyboard.press('End');
  await page.keyboard.type(' more');
  await page.keyboard.press('Control+z');
  check('Ctrl+Z inside the editor undoes typing, not the canvas', (await editorText(page)) === 'hello world' && (await saved()).items.length === 2, JSON.stringify(await editorText(page)));
  await page.keyboard.press('Control+y');
  check('Ctrl+Y redoes it in the editor', (await editorText(page)) === 'hello world more');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  check('Backspace and Delete edit the words, never delete the box', (await editorText(page)) === 'hello world mor' && (await page.locator('[data-item-id="t1"]').count()) === 1);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  check('arrow keys move the caret and never nudge the box', (await editorText(page)) === 'hello world mor');
  // Paste: HTML is dropped, the plain text lands at the caret.
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/html', '<b style="color:red">bold</b><script>alert(1)</script>');
    data.setData('text/plain', 'P1\nP2');
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.keyboard.press('Escape');
  const item = (await saved()).items.find(entry => entry.id === 't1');
  check('a paste keeps plain text and its line break, never HTML', item.text === 'hello world mP1\nP2or' && !JSON.stringify(item).includes('<'), JSON.stringify(item.text));
  // Ctrl+A selects the editor's words, not the canvas.
  await page.locator('[data-item-id="t2"]').dblclick();
  await page.keyboard.press('Control+a');
  check('Ctrl+A selects the words being edited', (await selectionText(page)) === 'other');
  await page.keyboard.press('Escape');
  await context.close();
});

await run('ime', async () => {
  const { page, context, saved } = await open('ime', { items: [textItem('t1', 100, 100, { text: 'ab' })] });
  await page.locator('[data-item-id="t1"]').dblclick();
  await page.keyboard.press('End');
  await page.keyboard.press('Control+b');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
  const during = await editorText(page);
  await cdp.send('Input.insertText', { text: '日本' });
  await page.keyboard.press('Escape');
  const item = (await saved()).items.find(entry => entry.id === 't1');
  check('composition is not committed or intercepted mid-way', during !== null && during.startsWith('ab'), JSON.stringify(during));
  check('the composed text lands, with the caret format', item.text === 'ab日本' && item.runs?.some(run => run.t === '日本' && run.b === true), JSON.stringify(item));
  await context.close();
});

await run('text code', async () => {
  const { page, context, saved, reload, shot } = await open('text-code', { items: [textItem('t1', 100, 100, { text: 'def f():\n    return 1', runs: [{ t: 'def', b: true }, { t: ' f():\n    return 1' }] })] });
  await page.locator('[data-item-id="t1"]').click();
  await page.locator('[data-item-id="t1"] [data-text-mode="code"]').click();
  const mode = await page.locator('[data-item-id="t1"]').getAttribute('data-text-mode');
  const font = await page.locator('[data-item-id="t1"] [aria-label="Code"]').evaluate(node => [getComputedStyle(node).fontFamily, getComputedStyle(node).whiteSpace, node.innerText]);
  check('Code mode shows the words in monospace, literally', mode === 'code' && /monospace|Menlo|Consolas/.test(font[0]) && font[1] === 'pre' && font[2].includes('    return 1'), JSON.stringify(font));
  // Edit in code mode: indentation typed survives; the bold "def" is kept aside.
  await page.locator('[data-item-id="t1"]').dblclick();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('# done');
  await page.keyboard.press('Escape');
  let item = (await saved()).items.find(entry => entry.id === 't1');
  check('code edits keep line breaks and indentation', item.text === 'def f():\n    return 1\n  # done', JSON.stringify(item.text));
  check('nothing ran and no notebook appeared', (await page.locator('[data-block-id]').count()) === 0);
  await page.locator('[data-item-id="t1"]').click();
  await page.locator('[data-item-id="t1"] [data-text-mode="text"]').click();
  item = (await saved()).items.find(entry => entry.id === 't1');
  const def = item.runs?.find(run => run.t.startsWith('def'));
  check('back to Text restores the formatting, with the new words', item.mode === undefined && def?.b === true && item.text.endsWith('# done'), JSON.stringify(item.runs));
  await page.keyboard.press('Control+z');
  check('switching is undoable', (await saved()).items.find(entry => entry.id === 't1').mode === 'code');
  await reload();
  check('the mode survives a reload', (await page.locator('[data-item-id="t1"]').getAttribute('data-text-mode')) === 'code');
  await shot('text-code');
  await context.close();
});


const shapeOf = async (saved, id) => (await saved()).shapes.find(shape => shape.id === id);
const near = (a, b, tolerance = 0.6) => Math.abs(a - b) <= tolerance;

await run('shape text', async () => {
  const rect = { id: 'r1', kind: 'rect', x1: 100, y1: 100, x2: 300, y2: 180, ...style, color: '#2383e2' };
  const { page, context, saved, reload, screen, shot } = await open('shape-text', { shapes: [rect] });
  const middle = await screen(200, 140);
  await page.mouse.dblclick(middle.x, middle.y);
  await page.waitForTimeout(150);
  check('double-click on a shape opens its words for typing', (await editorText(page)) !== null);
  await page.keyboard.type('Softmax turns scores into probabilities that sum to one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('and keeps their order');
  await page.keyboard.press('Escape');
  let shape = await shapeOf(saved, 'r1');
  check('the words are saved with their line break', shape.text === 'Softmax turns scores into probabilities that sum to one\nand keeps their order', JSON.stringify(shape.text));
  // Labelled Text color and Font size, independent of the outline and stroke width.
  check('a shape with words shows labelled Text color and Font size controls', await page.locator('[aria-label="Text color hex"]').isVisible() && await page.locator('input[aria-label="Font size"]').isVisible());
  await page.locator('input[aria-label="Font size"]').fill('32');
  await page.locator('input[aria-label="Font size"]').press('Enter');
  await page.waitForTimeout(200);
  shape = await shapeOf(saved, 'r1');
  const words = await page.locator('[data-shape-id="r1"] [data-shape-text]').boundingBox();
  const outline = await page.locator('[data-shape-id="r1"] rect').first().boundingBox();
  check('a bigger font size grows the shape so the words are never clipped', shape.fontSize === 32 && Math.abs(shape.y2 - shape.y1) > 80 && words.y + words.height <= outline.y + outline.height + 1, `h=${Math.abs(shape.y2 - shape.y1)}`);
  check('the font size never touched the stroke width', shape.width === 2);
  await page.getByRole('button', { name: 'Stroke #b42318' }).click();
  shape = await shapeOf(saved, 'r1');
  const ink = await page.locator('[data-shape-id="r1"] [data-shape-text]').evaluate(node => getComputedStyle(node).color);
  check('a new outline colour leaves the words their own colour', shape.color === '#b42318' && shape.textColor === '#2383e2' && ink === 'rgb(35, 131, 226)', `${shape.textColor} ${ink}`);
  await page.getByRole('button', { name: 'Text color #1a7f37' }).click();
  shape = await shapeOf(saved, 'r1');
  check('text colour changes only the words', shape.textColor === '#1a7f37' && shape.color === '#b42318');
  await page.getByRole('button', { name: 'Text to the top' }).click();
  await page.getByRole('button', { name: 'Align left' }).click();
  shape = await shapeOf(saved, 'r1');
  check('words align left/center/right and top/middle/bottom inside the shape', shape.valign === 'top' && shape.align === 'left');
  await page.getByRole('button', { name: 'Heading 2' }).click();
  shape = await shapeOf(saved, 'r1');
  check('H1-H4/Text presets sit beside the size control; a preset sets the level and drops the custom size', shape.level === 'h2' && shape.fontSize === undefined);
  // Resizing cannot squeeze the words out: the shape stops at the height they need.
  const handle = page.locator('[data-shape-id="r1"] [data-handle="11"]');
  const grip = await handle.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 60, grip.y - 400, { steps: 8 });
  await page.mouse.up();
  shape = await shapeOf(saved, 'r1');
  const after = await page.locator('[data-shape-id="r1"] [data-shape-text]').boundingBox();
  const box = await page.locator('[data-shape-id="r1"] rect').first().boundingBox();
  check('resizing a shape keeps a floor tall enough for its words and keeps the font size', after.y + after.height <= box.y + box.height + 1 && shape.level === 'h2' && shape.fontSize === undefined, JSON.stringify([after.y + after.height, box.y + box.height]));
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  shape = await shapeOf(saved, 'r1');
  check('undo walks back resize and preset', shape.fontSize === 32 && shape.level === undefined, JSON.stringify({ fontSize: shape.fontSize, level: shape.level }));
  await reload();
  const color = await page.locator('[data-shape-id="r1"] [data-shape-text]').evaluate(node => [getComputedStyle(node).color, getComputedStyle(node).fontSize]);
  check('shape text styling survives a reload', color[0] === 'rgb(26, 127, 55)' && color[1] === '32px', JSON.stringify(color));
  await shot('shape-text');
  await context.close();
});

await run('connector labels', async () => {
  const a = { id: 'a', kind: 'rect', x1: 100, y1: 100, x2: 200, y2: 160, ...style };
  const b = { id: 'b', kind: 'rect', x1: 400, y1: 100, x2: 500, y2: 160, ...style };
  const link = { id: 'k', from: 'a', fromSide: 'right', to: 'b', toSide: 'left', color: '#37352f', route: 'straight', head: true };
  const { page, context, saved, reload, screen, shot } = await open('connector-labels', { shapes: [a, b], links: [link] });
  const mid = await screen(300, 130);
  await page.mouse.click(mid.x, mid.y);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  check('Enter on a selected connector opens its label', (await editorText(page)) !== null);
  await page.keyboard.type('line one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('line two');
  await page.keyboard.press('Control+Enter');
  let saved1 = (await saved()).links.find(entry => entry.id === 'k');
  check('a connector label edits like all canvas text: Enter breaks the line, Ctrl+Enter finishes', saved1.label === 'line one\nline two', JSON.stringify(saved1.label));
  // Arrowheads: start dot, end triangle.
  await page.getByRole('button', { name: 'Start arrowhead: dot' }).click();
  await page.getByRole('button', { name: 'End arrowhead: triangle' }).click();
  saved1 = (await saved()).links.find(entry => entry.id === 'k');
  check('start and end arrowheads are set on a connector', saved1.startHead === 'dot' && saved1.endHead === 'triangle');
  check('the arrowheads draw', (await page.locator('[data-connection="k"] [data-head="dot"]').count()) === 1 && (await page.locator('[data-connection="k"] [data-head="triangle"]').count()) === 1);
  await page.getByRole('button', { name: 'Italic (Ctrl I)' }).click();
  saved1 = (await saved()).links.find(entry => entry.id === 'k');
  check('a selected connector label takes the text formatting', saved1.italic === true);
  await reload();
  check('the label keeps its lines after a reload', (await page.locator('[data-connection="k"] [data-line-label]').evaluate(node => node.innerText)).replace(/\n$/, '') === 'line one\nline two');
  await shot('connector-label');
  await context.close();
});

// Draws with the armed tool from (x1, y1) to (x2, y2) in world units, pressing keys as told; returns the new shape.
async function draw(page, screen, saved, tool, from, to, { hold = [], pressMid = null, releaseMid = null, escape = false } = {}) {
  await page.getByRole('button', { name: new RegExp(`^${tool}`) }).first().click();
  const start = await screen(from.x, from.y), end = await screen(to.x, to.y);
  const before = (await saved()).shapes?.length || 0;
  for (const key of hold) await page.keyboard.down(key);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 4 });
  if (pressMid) await page.keyboard.down(pressMid);
  if (releaseMid) await page.keyboard.up(releaseMid);
  await page.mouse.move(end.x, end.y, { steps: 4 });
  const preview = await page.evaluate(() => document.querySelectorAll('[data-ink] [data-shape-id]').length);
  if (escape) await page.keyboard.press('Escape');
  await page.mouse.up();
  for (const key of hold) await page.keyboard.up(key);
  if (pressMid) await page.keyboard.up(pressMid);
  const after = (await saved()).shapes || [];
  return { shape: after.length > before ? after[after.length - 1] : null, preview, count: after.length };
}

await run('drawing modifiers', async () => {
  const { page, context, saved, screen, shot } = await open('drawing-modifiers', {});
  let made = await draw(page, screen, saved, 'Rectangle', { x: 100, y: 100 }, { x: 260, y: 160 }, { hold: ['Shift'] });
  let s = made.shape;
  check('Shift draws a square', s && near(Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1)) && near(Math.abs(s.x2 - s.x1), 160, 1.5), JSON.stringify(s && [s.x1, s.y1, s.x2, s.y2]));
  made = await draw(page, screen, saved, 'Ellipse', { x: 400, y: 300 }, { x: 340, y: 200 }, { hold: ['Shift'] });
  s = made.shape;
  check('Shift draws a circle, dragging up and left', s && near(Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1)) && s.x2 < s.x1 && s.y2 < s.y1, JSON.stringify(s && [s.x1, s.y1, s.x2, s.y2]));
  made = await draw(page, screen, saved, 'Rectangle', { x: 600, y: 300 }, { x: 650, y: 330 }, { hold: ['Alt'] });
  s = made.shape;
  check('Alt draws from the centre', s && near((s.x1 + s.x2) / 2, 600, 1) && near((s.y1 + s.y2) / 2, 300, 1) && near(Math.abs(s.x2 - s.x1), 100, 1.5), JSON.stringify(s && [s.x1, s.y1, s.x2, s.y2]));
  made = await draw(page, screen, saved, 'Rectangle', { x: 600, y: 500 }, { x: 640, y: 520 }, { hold: ['Shift', 'Alt'] });
  s = made.shape;
  check('Shift+Alt draws a centred square', s && near((s.x1 + s.x2) / 2, 600, 1) && near(Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1)) && near(Math.abs(s.x2 - s.x1), 80, 1.5), JSON.stringify(s && [s.x1, s.y1, s.x2, s.y2]));
  made = await draw(page, screen, saved, 'Line', { x: 100, y: 500 }, { x: 300, y: 512 }, { pressMid: 'Shift' });
  s = made.shape;
  check('Shift pressed mid-drag snaps a line flat at once, and the saved line matches', s && near(s.y2, 500, 0.01), JSON.stringify(s && [s.x1, s.y1, s.x2, s.y2]));
  made = await draw(page, screen, saved, 'Arrow', { x: 100, y: 650 }, { x: 180, y: 735 }, { hold: ['Shift'], releaseMid: 'Shift' });
  s = made.shape;
  check('releasing Shift mid-drag frees the line again', s && near(s.x2, 180, 1) && near(s.y2, 735, 1), JSON.stringify(s && [s.x1, s.y1, s.x2, s.y2]));
  const count = made.count;
  made = await draw(page, screen, saved, 'Rectangle', { x: 900, y: 100 }, { x: 1000, y: 200 }, { escape: true });
  check('Esc cancels an unfinished shape: the preview showed, nothing was added', made.preview > count && made.count === count);
  // One gesture, one undo step.
  await page.keyboard.press('Control+z');
  check('one drawn shape is one undo step', ((await saved()).shapes || []).length === count - 1);
  await shot('drawing-modifiers');
  // Zoomed in: the same constraints in world units.
  await page.evaluate(() => window.canvasApi.current.setView({ x: 0, y: 0, z: 2 }));
  await page.waitForTimeout(150);
  made = await draw(page, screen, saved, 'Rectangle', { x: 150, y: 150 }, { x: 200, y: 170 }, { hold: ['Shift'] });
  s = made.shape;
  check('at 200% zoom Shift still draws a square of the right size', s && near(Math.abs(s.x2 - s.x1), 50, 1) && near(Math.abs(s.y2 - s.y1), 50, 1), JSON.stringify(s && [s.x1, s.y1, s.x2, s.y2]));
  await context.close();
});

await run('resize modifiers', async () => {
  const rect = { id: 'r1', kind: 'rect', x1: 100, y1: 100, x2: 300, y2: 200, ...style };
  const line = { id: 'l1', kind: 'line', x1: 100, y1: 400, x2: 300, y2: 400, ...style };
  const { page, context, saved, screen } = await open('resize-modifiers', { shapes: [rect, line] });
  const drag = async (selector, to, keys = []) => {
    const grip = await page.locator(selector).boundingBox();
    const target = await screen(to.x, to.y);
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    for (const key of keys) await page.keyboard.down(key);
    await page.mouse.move(target.x, target.y, { steps: 6 });
    await page.mouse.up();
    for (const key of keys) await page.keyboard.up(key);
  };
  const centre = await screen(200, 150);
  await page.mouse.click(centre.x, centre.y);
  await drag('[data-shape-id="r1"] [data-handle="11"]', { x: 500, y: 230 }, ['Shift']);
  let s = await shapeOf(saved, 'r1');
  check('Shift-resize keeps the original proportions', near((s.x2 - s.x1) / (s.y2 - s.y1), 2, 0.02) && near(s.x1, 100) && near(s.y1, 100), JSON.stringify(s));
  await page.keyboard.press('Control+z');
  await page.mouse.click(centre.x, centre.y); // undo lets go of the selection
  await drag('[data-shape-id="r1"] [data-handle="11"]', { x: 350, y: 220 }, ['Alt']);
  s = await shapeOf(saved, 'r1');
  check('Alt-resize keeps the centre', near((s.x1 + s.x2) / 2, 200) && near((s.y1 + s.y2) / 2, 150) && near(s.x2 - s.x1, 300), JSON.stringify(s));
  await page.keyboard.press('Control+z');
  await page.mouse.click(centre.x, centre.y);
  // Esc mid-resize puts it back.
  const grip = await page.locator('[data-shape-id="r1"] [data-handle="11"]').boundingBox();
  await page.mouse.move(grip.x + 5, grip.y + 5);
  await page.mouse.down();
  await page.mouse.move(grip.x + 120, grip.y + 90, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  s = await shapeOf(saved, 'r1');
  check('Esc cancels a resize and restores the shape', near(s.x2, 300) && near(s.y2, 200), JSON.stringify(s));
  const lineMid = await screen(200, 400);
  await page.mouse.click(lineMid.x, lineMid.y);
  await drag('[data-shape-id="l1"] [data-handle="end"]', { x: 300, y: 590 }, ['Shift']);
  s = await shapeOf(saved, 'l1');
  check('Shift on a line end snaps it to 45 degrees', near(Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1), 0.5), JSON.stringify(s));
  await context.close();
});


const selectedIds = page => page.evaluate(() => [
  ...[...document.querySelectorAll('[data-item-id].ring-2')].map(node => node.dataset.itemId),
  ...[...document.querySelectorAll('[data-shape-id]')].filter(node => node.querySelector('rect[stroke-dasharray="4 3"]')).map(node => node.dataset.shapeId),
].sort());

await run('object controls', async () => {
  const a = { id: 'a', kind: 'rect', x1: 100, y1: 100, x2: 200, y2: 160, ...style, groupId: 'g1' };
  const b = { id: 'b', kind: 'ellipse', x1: 260, y1: 100, x2: 360, y2: 160, ...style, groupId: 'g1' };
  const c = { id: 'c', kind: 'rect', x1: 100, y1: 300, x2: 200, y2: 360, ...style, color: '#b42318', fill: '#2383e2', fillOpacity: 0.6, width: 6 };
  const link = { id: 'k', from: 'a', fromSide: 'right', to: 'b', toSide: 'left', color: '#37352f', route: 'straight', head: true };
  const { page, context, saved, screen, shot } = await open('object-controls', { shapes: [a, b, c], links: [link], groups: [{ id: 'g1', label: 'pair' }] });
  const click = async (x, y, modifiers = []) => { const at = await screen(x, y); for (const key of modifiers) await page.keyboard.down(key); await page.mouse.click(at.x, at.y); for (const key of modifiers) await page.keyboard.up(key); };
  // Lock: c can be selected, not moved, resized or deleted.
  await click(150, 330);
  await page.keyboard.press('Control+Shift+L');
  let s = (await saved()).shapes.find(shape => shape.id === 'c');
  check('Ctrl+Shift+L locks the selection', s.locked === true && (await page.locator('[data-lock-badge="c"]').count()) === 1);
  const at = await screen(150, 330);
  await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + 80, at.y + 60, { steps: 5 }); await page.mouse.up();
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowRight');
  s = (await saved()).shapes.find(shape => shape.id === 'c');
  check('a locked shape does not move, nudge or delete, and offers no handles', s && s.x1 === 100 && s.y1 === 300 && (await page.locator('[data-shape-id="c"] [data-handle]').count()) === 0);
  check('the panel says Locked and offers Unlock', await page.locator('[data-locked-note]').isVisible());
  await page.locator('[data-locked-note] button').click();
  s = (await saved()).shapes.find(shape => shape.id === 'c');
  check('Unlock in the panel unlocks it', !s.locked);
  // Nudge: 1 and 10 world units.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  s = (await saved()).shapes.find(shape => shape.id === 'c');
  check('arrow keys nudge by 1, Shift+arrow by 10', s.x1 === 101 && s.y1 === 310, JSON.stringify([s.x1, s.y1]));
  await page.keyboard.press('Control+z');
  s = (await saved()).shapes.find(shape => shape.id === 'c');
  check('a run of nudges is one undo step', s.x1 === 100 && s.y1 === 300, JSON.stringify([s.x1, s.y1]));
  // Copy style from c, paste onto the group.
  await click(150, 330);
  await page.keyboard.press('Control+Alt+c');
  await click(150, 130);
  await page.keyboard.press('Control+Alt+v');
  let board = await saved();
  const pastedA = board.shapes.find(shape => shape.id === 'a'), pastedB = board.shapes.find(shape => shape.id === 'b');
  check('paste style moves stroke, fill and width only - never position or identity', pastedA.color === '#b42318' && pastedA.fill === '#2383e2' && pastedA.fillOpacity === 0.6 && pastedA.width === 6 && pastedA.x1 === 100 && pastedB.color === '#b42318');
  // Cut the group (with its connector) and paste it back: links and the group come along.
  await page.keyboard.press('Control+x');
  board = await saved();
  check('Ctrl+X removes the cut objects (and the link between them)', !board.shapes.some(shape => shape.id === 'a' || shape.id === 'b') && board.links.length === 0);
  await page.keyboard.press('Control+v');
  board = await saved();
  const copies = board.shapes.filter(shape => shape.id !== 'c');
  check('paste after a cut brings them back as copies', copies.length === 2);
  check('the link between them comes back between the copies', board.links.length === 1 && copies.some(shape => shape.id === board.links[0].from) && copies.some(shape => shape.id === board.links[0].to));
  check('the whole group comes back as a new group, with its label', copies[0].groupId && copies[0].groupId === copies[1].groupId && copies[0].groupId !== 'g1' && board.groups.some(group => group.id === copies[0].groupId && group.label === 'pair'));
  // Alt-drag duplicates c, the original stays.
  const from = await screen(150, 330), to = await screen(450, 330);
  await page.keyboard.down('Alt');
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
  await page.keyboard.up('Alt');
  board = await saved();
  const original = board.shapes.find(shape => shape.id === 'c'), dup = board.shapes.find(shape => shape.id !== 'c' && shape.y1 === 300);
  check('Alt-drag leaves the original and drags a copy', original.x1 === 100 && dup && Math.abs(dup.x1 - 400) < 1.5, JSON.stringify(dup && [dup.x1, dup.y1]));
  await page.keyboard.press('Control+z');
  check('Alt-drag (copy and move) is one undo step', (await saved()).shapes.length === board.shapes.length - 1);
  // Layers: bring forward / send backward step through paint order.
  await click(150, 330);
  const order = async () => (await saved()).shapes.map(shape => shape.id);
  const first = await order();
  await page.keyboard.press('Control+]');
  const forward = await order();
  check('Bring forward moves one step up the paint order', forward.indexOf('c') === first.indexOf('c') + 1, JSON.stringify([first, forward]));
  await page.keyboard.press('Control+[');
  check('Send backward moves it back', JSON.stringify(await order()) === JSON.stringify(first));
  await page.keyboard.press('Control+Shift+]');
  check('Bring to front puts it last in paint order', (await order()).at(-1) === 'c');
  await shot('object-controls');
  await context.close();
});

await run('selection', async () => {
  const a = { id: 'a', kind: 'rect', x1: 100, y1: 100, x2: 200, y2: 160, ...style, groupId: 'g1' };
  const b = { id: 'b', kind: 'rect', x1: 260, y1: 100, x2: 360, y2: 160, ...style, groupId: 'g1' };
  const c = { id: 'c', kind: 'rect', x1: 100, y1: 300, x2: 200, y2: 360, ...style };
  const d = { id: 'd', kind: 'rect', x1: 300, y1: 300, x2: 400, y2: 360, ...style };
  const { page, context, saved, screen } = await open('selection', { shapes: [a, b, c, d], groups: [{ id: 'g1', label: '' }] });
  const click = async (x, y, modifiers = []) => { const at = await screen(x, y); for (const key of modifiers) await page.keyboard.down(key); await page.mouse.click(at.x, at.y); for (const key of modifiers) await page.keyboard.up(key); };
  await click(150, 330);
  await click(350, 330, ['Shift']);
  check('Shift+click adds to the selection', JSON.stringify(await selectedIds(page)) === JSON.stringify(['c', 'd']));
  await click(350, 330, ['Shift']);
  check('Shift+click on a selected object takes it out, the rest stay', JSON.stringify(await selectedIds(page)) === JSON.stringify(['c']));
  await click(150, 130);
  check('a plain click on a grouped object picks the whole group', JSON.stringify(await selectedIds(page)) === JSON.stringify(['a', 'b']));
  await click(150, 130, ['Control']);
  check('Ctrl+click picks one member inside the group', JSON.stringify(await selectedIds(page)) === JSON.stringify(['a']));
  check('selecting never rewrites group membership', (await saved()).shapes.filter(shape => shape.groupId === 'g1').length === 2);
  await page.keyboard.press('Escape');
  check('Esc clears the selection', (await selectedIds(page)).length === 0);
  // Empty-canvas drag: a selection rectangle, never a pan.
  const view = await viewOf(page);
  const p1 = await screen(80, 280), p2 = await screen(420, 380);
  await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move(p2.x, p2.y, { steps: 8 }); await page.mouse.up();
  check('a plain drag on empty canvas draws a selection rectangle and does not pan', JSON.stringify(await selectedIds(page)) === JSON.stringify(['c', 'd']) && (await viewOf(page)) === view);
  const cursor = await page.locator('[data-canvas-surface]').evaluate(node => getComputedStyle(node).cursor);
  check('Select shows the normal arrow, not a hand', cursor === 'default', cursor);
  // Hand tool pans.
  await page.getByRole('button', { name: /^Hand/ }).click();
  const handCursor = await page.locator('[data-canvas-surface]').evaluate(node => getComputedStyle(node).cursor);
  await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move(p1.x + 120, p1.y + 40, { steps: 5 }); await page.mouse.up();
  check('the Hand tool pans, with the open-hand cursor', (await viewOf(page)) !== view && handCursor === 'grab', handCursor);
  await page.keyboard.press('v');
  check('V goes back to Select', (await page.getByRole('button', { name: /^Select/ }).getAttribute('aria-pressed')) === 'true');
  // Trackpad: two-finger scroll pans with Select active, pinch (ctrl+wheel) zooms.
  const panned = await viewOf(page);
  await page.mouse.move(700, 500);
  await page.mouse.wheel(60, 90);
  await page.waitForTimeout(100);
  const scrolled = await viewOf(page);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control');
  await page.waitForTimeout(100);
  check('a two-finger scroll pans both ways while Select stays armed (synthetic wheel)', scrolled !== panned && /translate\(-?[\d.]+px, -?[\d.]+px\) scale\(1\)/.test(scrolled), scrolled);
  check('pinch (Ctrl+wheel) zooms', !/scale\(1\)$/.test(await viewOf(page)), await viewOf(page));
  // Space+drag pans over a shape; a space typed in the composer is just a space.
  await page.evaluate(() => window.canvasApi.current.setView({ x: 400, y: 24, z: 1 }));
  await page.waitForTimeout(100);
  const beforeSpace = await viewOf(page);
  const over = await screen(150, 330);
  await page.keyboard.down(' ');
  await page.mouse.move(over.x, over.y); await page.mouse.down(); await page.mouse.move(over.x + 100, over.y, { steps: 5 }); await page.mouse.up();
  await page.keyboard.up(' ');
  check('Space+drag pans, even starting over a shape, and moves nothing', (await viewOf(page)) !== beforeSpace && (await saved()).shapes.find(shape => shape.id === 'c').x1 === 100, `${beforeSpace} -> ${await viewOf(page)} x1=${(await saved()).shapes.find(shape => shape.id === 'c').x1}`);
  await page.locator('[data-chat-composer]').click();
  await page.keyboard.type('a r t e ');
  check('letters and spaces typed in the composer stay there - no tool switch, no pan', (await page.locator('[data-chat-composer]').inputValue()) === 'a r t e ' && (await page.getByRole('button', { name: /^Select/ }).getAttribute('aria-pressed')) === 'true', JSON.stringify(await page.locator('[data-chat-composer]').inputValue()));
  await context.close();
});

await run('shortcuts', async () => {
  const { page, context } = await open('shortcuts', {});
  for (const [key, label] of [['r', 'Rectangle'], ['o', 'Ellipse'], ['a', 'Arrow'], ['l', 'Line'], ['p', 'Pen'], ['t', 'Text'], ['e', 'Eraser'], ['n', 'Sticky note'], ['h', 'Hand'], ['v', 'Select']]) {
    await page.keyboard.press(key);
    const pressed = await page.getByRole('button', { name: new RegExp(`^${label}`) }).first().getAttribute('aria-pressed');
    const title = await page.getByRole('button', { name: new RegExp(`^${label}`) }).first().getAttribute('title');
    check(`${key.toUpperCase()} arms ${label} and its tooltip names the key`, pressed === 'true' && title.includes(`(${key.toUpperCase()})`), title);
  }
  await context.close();
});

await run('esc and dialogs', async () => {
  const { page, context } = await open('esc-dialogs', { items: [textItem('t1', 100, 100)] });
  await page.locator('[data-item-id="t1"]').click();
  // A dialog that owns Esc: the canvas leaves its selection alone.
  await page.evaluate(() => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = '<button id="in-dialog">ok</button>';
    document.body.append(dialog);
    window.addEventListener('keydown', event => { if (event.key === 'Escape') { window.dialogSawEsc = true; dialog.remove(); } });
    dialog.querySelector('button').focus();
  });
  await page.keyboard.press('Escape');
  check('Esc goes to an open dialog first and keeps the canvas selection', await page.evaluate(() => window.dialogSawEsc === true) && (await page.locator('[data-item-id="t1"].ring-2').count()) === 1);
  // A right-click menu closes first, the selection stays.
  await page.locator('[data-item-id="t1"]').click({ button: 'right' });
  check('the right-click menu offers the new object actions', await page.getByRole('menuitem', { name: 'Lock' }).isVisible() && await page.getByRole('menuitem', { name: 'Cut' }).isVisible() && await page.getByRole('menuitem', { name: 'Copy style' }).isVisible() && await page.getByRole('menuitem', { name: 'Bring forward' }).isVisible());
  await page.keyboard.press('Escape');
  check('Esc closes the menu and keeps the selection', !(await page.getByRole('menu', { name: 'Canvas actions' }).isVisible()) && (await page.locator('[data-item-id="t1"].ring-2').count()) === 1);
  // In the editor, Esc finishes typing and keeps the words.
  await page.locator('[data-item-id="t1"]').dblclick();
  await page.keyboard.type(' typed');
  await page.keyboard.press('Escape');
  check('Esc in the editor keeps what was typed', (await page.locator('[data-item-id="t1"] [aria-label="Text"]').innerText()).includes('typed'));
  await page.keyboard.press('Escape');
  check('a second Esc (canvas focus) clears the selection', (await page.locator('[data-item-id="t1"].ring-2').count()) === 0);
  await context.close();
});

await run('legacy and read-only', async () => {
  // A board saved before this work: plain text with an old raw size, a shape with words, a labelled connector.
  const legacy = {
    items: [{ id: 'old', kind: 'text', x: 100, y: 100, w: 420, text: 'Old  text\nline two', size: 24, color: '#2383e2', opacity: 1 },
      { id: 'note', kind: 'sticky', x: 600, y: 100, text: 'old note', color: '#2383e2', opacity: 1 }],
    shapes: [{ id: 's', kind: 'ellipse', x1: 100, y1: 300, x2: 300, y2: 400, ...style, color: '#b42318', text: 'inside' },
      { id: 'arr', kind: 'arrow', x1: 400, y1: 350, x2: 600, y2: 350, ...style, label: 'old label' }],
  };
  const { page, context } = await open('legacy', legacy);
  const old = await page.locator('[data-item-id="old"] [aria-label="Text"]').evaluate(node => [node.innerText, getComputedStyle(node).fontSize, getComputedStyle(node).color]);
  check('an old plain text box loads unchanged: words, line break, double space, old size and colour', old[0].replace(/\n$/, '') === 'Old  text\nline two' && old[1] === '24px' && old[2] === 'rgb(35, 131, 226)', JSON.stringify(old));
  const inside = await page.locator('[data-shape-id="s"] [data-shape-text]').evaluate(node => [node.innerText, getComputedStyle(node).color]);
  check('old shape words keep following their outline colour', inside[0] === 'inside' && inside[1] === 'rgb(180, 35, 24)', JSON.stringify(inside));
  check('an old arrow keeps its arrowhead and label', (await page.locator('[data-shape-id="arr"] [data-head="arrow"]').count()) === 1 && (await page.locator('[data-shape-id="arr"] [data-line-label]').innerText()) === 'old label');
  await context.close();
  // The same board view-only: no editing, no handles, no panel; a drag pans.
  const view = await open('legacy', legacy, { readonly: true });
  const box = await view.page.locator('[data-item-id="old"]').boundingBox();
  await view.page.mouse.dblclick(box.x + 20, box.y + 10);
  check('a view-only board never opens text for editing', (await view.page.locator('[data-rich-editor]').count()) === 0);
  check('a view-only board shows no tools or style panel', (await view.page.getByRole('toolbar', { name: 'Canvas tools' }).count()) === 0 && (await view.page.locator('[data-style-panel]').count()) === 0);
  const t0 = await viewOf(view.page);
  await view.page.mouse.move(700, 600); await view.page.mouse.down(); await view.page.mouse.move(800, 650, { steps: 5 }); await view.page.mouse.up();
  check('a view-only board pans on drag', (await viewOf(view.page)) !== t0);
  await view.page.keyboard.press('r');
  await view.page.keyboard.press('Delete');
  check('tool keys and Delete do nothing on a view-only board', (await view.page.locator('[data-item-id]').count()) === 2);
  await view.context.close();
});


await run('composer and suggestions', async () => {
  const name = 'composer-hooks';
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  await page.goto(`${BASE}?board=${name}&hooks=1`);
  await page.locator('[data-canvas-surface]').waitFor();
  await page.locator('[data-next-step]').first().waitFor();
  const strip = () => page.evaluate(() => { const r = document.querySelector('[data-canvas-composer]')?.getBoundingClientRect(); return r ? r.height : 0; });
  const view = await viewOf(page);
  // Select something, type a draft, hide.
  await page.evaluate(() => window.canvasApi.current.insertText());
  await page.keyboard.press('Escape');
  await page.locator('[data-item-id]').first().click();
  const selectedBefore = await page.locator('[data-item-id].ring-2').count();
  await page.locator('[data-chat-composer]').fill('my unsent draft');
  const tall = await strip();
  await page.getByRole('button', { name: 'Hide chat composer' }).click();
  check('Hide chat composer removes it from view and frees its room', (await strip()) === 0 && tall > 0 && await page.getByRole('button', { name: 'Show chat composer' }).isVisible());
  check('hiding keeps the viewport and the selection', (await viewOf(page)) === view && (await page.locator('[data-item-id].ring-2').count()) === selectedBefore);
  const showBox = await page.getByRole('button', { name: 'Show chat composer' }).boundingBox();
  check('the Show button is small and unobtrusive', showBox.width < 120 && showBox.height <= 34, JSON.stringify(showBox));
  await page.getByRole('button', { name: 'Show chat composer' }).click();
  check('Show brings the composer back with the draft intact', (await page.locator('[data-chat-composer]').inputValue()) === 'my unsent draft' && (await strip()) > 0);
  // Suggestions: minimize is local, restore asks for nothing.
  const posts = await page.evaluate(() => window.hookPosts);
  await page.getByRole('button', { name: 'Minimize suggestions' }).click();
  check('Minimize folds the suggestions to a chip that frees their room', (await page.locator('[data-next-step]').count()) === 0 && await page.locator('[data-next-steps-minimized]').isVisible());
  await page.getByRole('button', { name: 'Restore suggestions' }).click();
  const shown = await page.locator('[data-next-step]').allInnerTexts();
  check('Restore shows the same suggestions with no new request', shown.length === 3 && shown[0].includes('Suggestion 1.1') && (await page.evaluate(() => window.hookPosts)) === posts);
  check('composer visibility and the card are independent', (await strip()) > 0);
  // Refresh: loading, no duplicate, replaced.
  await page.evaluate(() => { window.hookPost.delay = 600; });
  await page.getByRole('button', { name: 'Refresh suggestions' }).click();
  const busy = await page.getByRole('button', { name: 'Refresh suggestions' }).getAttribute('aria-busy');
  await page.getByRole('button', { name: 'Refresh suggestions' }).click({ force: true });
  const kept = await page.locator('[data-next-step]').first().innerText();
  check('Refresh shows loading, keeps the current suggestions and blocks a second request', busy === 'true' && kept.includes('Suggestion 1.1') && (await page.evaluate(() => window.hookPosts)) === posts + 1);
  await page.waitForTimeout(800);
  check('a successful refresh replaces the suggestions', (await page.locator('[data-next-step]').first().innerText()).includes(`Suggestion ${posts + 1}.1`));
  // Failure: kept, with a retry.
  await page.evaluate(() => { window.hookPost.delay = 50; window.hookPost.fail = true; });
  await page.getByRole('button', { name: 'Refresh suggestions' }).click();
  await page.waitForTimeout(300);
  check('a failed refresh keeps the suggestions and offers Try again', (await page.locator('[data-next-step]').count()) === 3 && await page.getByRole('button', { name: 'Try again' }).isVisible());
  await page.evaluate(() => { window.hookPost.fail = false; });
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.waitForTimeout(300);
  check('Try again succeeds and clears the error', !(await page.getByRole('button', { name: 'Try again' }).isVisible()) && (await page.locator('[data-next-step]').count()) === 3);
  // Stale: the canvas moves on before the refresh lands; its reply never shows.
  await page.evaluate(() => { window.hookPost.delay = 500; });
  await page.getByRole('button', { name: 'Refresh suggestions' }).click();
  const staleN = await page.evaluate(() => window.hookPosts);
  await page.evaluate(() => window.hookBasis('b'));
  await page.waitForTimeout(1400);
  const after = await page.locator('[data-next-step]').allInnerTexts();
  check('a refresh reply for a canvas the learner left is never shown', !after.some(text => text.includes(`Suggestion ${staleN}.`)), JSON.stringify(after));
  check('refresh never sent a chat message, picked a hook or added a card', (await page.locator('[data-chat-composer]').inputValue()) === 'my unsent draft' && !(await page.evaluate(() => window.picked)) && (await page.locator('[data-block-id]').count()) === 0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/composer-hooks.png` });
  await context.close();
});

await run('narrow', async () => {
  const { page, context, screen, shot } = await open('narrow', { shapes: [{ id: 'r1', kind: 'rect', x1: 40, y1: 200, x2: 260, y2: 300, ...style, text: 'words here' }] }, { viewport: { width: 390, height: 844 } });
  const centre = await screen(150, 250);
  await page.mouse.dblclick(centre.x, centre.y);
  await page.waitForTimeout(200);
  const panel = await page.locator('[data-style-panel]').boundingBox();
  const editor = await page.locator('[data-shape-id="r1"] [data-shape-text]').boundingBox();
  const canvas = await page.locator('[data-canvas-surface]').boundingBox();
  const overlaps = panel && editor && !(panel.y + panel.height <= editor.y || editor.y + editor.height <= panel.y || panel.x + panel.width <= editor.x || editor.x + editor.width <= panel.x);
  check('on a phone the style panel sits in the tools strip, never over the text being edited or the canvas', panel && !overlaps && panel.y + panel.height <= canvas.y + 1 && panel.x >= 0 && panel.x + panel.width <= 391, JSON.stringify({ panel, editor, canvas }));
  check('no horizontal page scroll on a phone', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot('narrow-panel');
  await context.close();
});


await run('explain back sketch', async () => {
  const block = { id: 'eb1', type: 'challenge', mode: 'explain_back', title: 'Explain softmax', prompt: 'Explain it back, with a sketch.', sketchOpen: true, sketch: { strokes: [], shapes: [], items: [] }, dx: 0, dy: 0 };
  const { page, context, saved, shot } = await open('explain-back', { blocks: [block] });
  const area = page.locator('[data-sketch="eb1"]');
  await area.waitFor();
  const box = await area.boundingBox();
  await page.mouse.click(box.x + box.width - 30, box.y + box.height - 20); // make the sketch the draw target
  await page.getByRole('button', { name: /^Rectangle/ }).click();
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + 40, box.y + 40); await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 80, { steps: 5 }); await page.mouse.up();
  await page.keyboard.up('Shift');
  let marks = (await saved()).blocks[0].sketch.shapes;
  const s = marks[0];
  check('Shift draws a square inside an Explain Back sketch too', marks.length === 1 && Math.abs(Math.abs(s.x2 - s.x1) - Math.abs(s.y2 - s.y1)) < 1, JSON.stringify(s));
  await page.getByRole('button', { name: /^Ellipse/ }).click();
  await page.mouse.move(box.x + 300, box.y + 60); await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + 100, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  marks = (await saved()).blocks[0].sketch.shapes;
  check('Esc cancels an unfinished sketch shape', marks.length === 1);
  check('the sketch marks stay on the card, never on the canvas', ((await saved()).shapes || []).length === 0);
  await shot('explain-back-sketch');
  await context.close();
});


await run('text boxes', async () => {
  const card = { id: 'card1', type: 'explanation', title: 'A card', body: 'Some words on a card.', dx: 0, dy: 0 };
  const { page, context, saved, screen, shot } = await open('text-boxes', { blocks: [card], items: [{ id: 'n1', kind: 'sticky', x: 700, y: 100, w: 160, h: 160, text: 'note', color: '#37352f', opacity: 1 }] });
  // A new text box grows with its words, transparent, no big empty card.
  await page.keyboard.press('t');
  const at = await screen(200, 420);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.type('short');
  const narrow = await page.locator('[data-item-id][data-text-mode="text"]').last().boundingBox();
  await page.keyboard.type(' and then a much longer line of words');
  const wide = await page.locator('[data-item-id][data-text-mode="text"]').last().boundingBox();
  const bg = await page.locator('[data-item-id][data-text-mode="text"]').last().evaluate(node => getComputedStyle(node).backgroundColor);
  await page.keyboard.press('Escape');
  check('a new text box grows with its words on a transparent background', wide.width > narrow.width + 100 && narrow.width < 140 && bg === 'rgba(0, 0, 0, 0)', JSON.stringify([narrow.width, wide.width, bg]));
  const item = (await saved()).items.find(entry => entry.kind === 'text');
  check('a new text box carries no fixed width until one is set', item.w === undefined);
  // Resize: wrapping changes, the font size does not.
  const id = item.id;
  const before = await page.locator(`[data-item-id="${id}"] [aria-label="Text"]`).evaluate(node => [getComputedStyle(node).fontSize, node.getBoundingClientRect().height]);
  const grip = await page.getByRole('button', { name: 'Resize text box' }).boundingBox();
  await page.mouse.move(grip.x + 4, grip.y + 4); await page.mouse.down(); await page.mouse.move(grip.x - 160, grip.y + 4, { steps: 5 }); await page.mouse.up();
  const after = await page.locator(`[data-item-id="${id}"] [aria-label="Text"]`).evaluate(node => [getComputedStyle(node).fontSize, node.getBoundingClientRect().height]);
  check('resizing a text box wraps the words and keeps the font size', after[0] === before[0] && after[1] > before[1] && (await saved()).items.find(entry => entry.id === id).w > 0, JSON.stringify([before, after]));
  // A note grows with its words instead of clipping them.
  await page.locator('[data-item-id="n1"]').dblclick();
  await page.keyboard.press('End');
  for (let i = 0; i < 12; i += 1) { await page.keyboard.press('Enter'); await page.keyboard.type(`line ${i}`); }
  await page.keyboard.press('Escape');
  const note = await page.locator('[data-item-id="n1"]').boundingBox();
  const words = await page.locator('[data-item-id="n1"] [aria-label="Sticky note"]').boundingBox();
  check('a sticky note grows to hold its words', note.height > 165 && words.y + words.height <= note.y + note.height + 2, JSON.stringify([note.height, words.height]));
  // A locked card is selected but never moved or deleted.
  await page.locator('[data-block-id="card1"]').click();
  await page.keyboard.press('Control+Shift+L');
  const handle = await page.locator('[data-block-id="card1"] [data-drag-handle]').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 3); await page.mouse.down(); await page.mouse.move(handle.x + 200, handle.y + 100, { steps: 5 }); await page.mouse.up();
  await page.keyboard.press('Delete');
  const block = (await saved()).blocks.find(entry => entry.id === 'card1');
  check('a locked card stays put and is not deleted', block && block.locked === true && block.dx === 0 && block.dy === 0, JSON.stringify(block && [block.dx, block.dy, block.locked]));
  await page.keyboard.press('Control+Shift+L');
  check('Ctrl+Shift+L again unlocks it', !(await saved()).blocks.find(entry => entry.id === 'card1').locked);
  await shot('text-boxes');
  await context.close();
});


await run('review regressions', async () => {
  const rect = { id: 'r1', kind: 'rect', x1: 100, y1: 100, x2: 300, y2: 180, ...style };
  const locked = { id: 'lk', kind: 'rect', x1: 400, y1: 100, x2: 500, y2: 180, ...style, locked: true };
  const a = { id: 'a', kind: 'rect', x1: 100, y1: 400, x2: 180, y2: 440, ...style }, b = { id: 'b', kind: 'rect', x1: 300, y1: 400, x2: 380, y2: 440, ...style };
  const link = { id: 'k', from: 'a', fromSide: 'right', to: 'b', toSide: 'left', color: '#37352f', route: 'straight', head: true };
  const { page, context, saved, screen } = await open('review-regressions', { items: [textItem('t1', 700, 100, { text: 'keep me' })], shapes: [rect, locked, a, b], links: [link] });
  const click = async (x, y) => { const at = await screen(x, y); await page.mouse.click(at.x, at.y); };
  // 1: Enter-edit, finish, delete, undo: the box comes back closed, and redo still works.
  await page.locator('[data-item-id="t1"]').click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  check('undo brings a text box back without reopening its editor', (await page.locator('[data-item-id="t1"]').count()) === 1 && (await editorText(page)) === null);
  await page.keyboard.press('Control+y');
  check('and redo still works after it', (await page.locator('[data-item-id="t1"]').count()) === 0);
  await page.keyboard.press('Control+z');
  // 2: an eraser sweep crossing a locked shape leaves it.
  await page.keyboard.press('e');
  const e1 = await screen(380, 140), e2 = await screen(620, 140);
  await page.mouse.move(e1.x, e1.y); await page.mouse.down(); await page.mouse.move(e2.x, e2.y, { steps: 12 }); await page.mouse.up();
  check('an eraser sweep never removes a locked shape', (await saved()).shapes.some(shape => shape.id === 'lk'));
  await page.keyboard.press('v');
  // 3: Alt-click copies nothing; Esc during an Alt-drag takes the copy back.
  const count = async () => (await saved()).shapes.length;
  const before = await count();
  const r = await screen(200, 140);
  await page.keyboard.down('Alt'); await page.mouse.click(r.x, r.y); await page.keyboard.up('Alt');
  check('an Alt-click makes no copy', (await count()) === before);
  await page.keyboard.down('Alt');
  await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(r.x + 150, r.y + 60, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up(); await page.keyboard.up('Alt');
  check('Esc during an Alt-drag removes the copy', (await count()) === before);
  // 4: copy two linked shapes, delete their link, duplicate them: no ghost link.
  await click(140, 420);
  await page.keyboard.down('Shift'); await click(340, 420); await page.keyboard.up('Shift');
  await page.keyboard.press('Control+c');
  const mid = await screen(240, 420);
  await page.keyboard.press('Escape');
  await page.mouse.click(mid.x, mid.y);
  await page.keyboard.press('Delete');
  await click(140, 420);
  await page.keyboard.down('Shift'); await click(340, 420); await page.keyboard.up('Shift');
  await page.keyboard.press('Control+d');
  check('a duplicate never brings back a link deleted since the copy', (await saved()).links.length === 0, JSON.stringify((await saved()).links.length));
  // 5 + 6: an H1 shape; double-click inside its open editor leaves one undo step; a height-only shrink keeps the words in.
  await page.keyboard.press('Escape');
  await page.mouse.dblclick(r.x, r.y);
  await page.keyboard.type('Big heading words that wrap');
  await page.mouse.dblclick(r.x, r.y); // select a word inside the editor
  await page.keyboard.press('Escape');
  await page.locator('[data-shape-id="r1"]').locator('rect').first().click({ force: true });
  await page.getByRole('button', { name: 'Heading 1' }).click();
  await page.waitForTimeout(150);
  const r1 = async () => { const s = (await saved()).shapes.find(shape => shape.id === 'r1'); return JSON.stringify([s.text, s.level]); };
  const trail = [await r1()];
  await page.keyboard.press('Control+z'); trail.push(await r1());
  await page.keyboard.press('Control+z'); trail.push(await r1());
  check('double-clicking inside an open shape editor adds no extra undo step', !(await saved()).shapes.find(shape => shape.id === 'r1').text, trail.join(' -> '));
  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+y');
  await page.locator('[data-shape-id="r1"]').locator('rect').first().click({ force: true });
  const grip = await page.locator('[data-shape-id="r1"] [data-handle="01"]').boundingBox();
  await page.mouse.move(grip.x + 5, grip.y + 5); await page.mouse.down(); await page.mouse.move(grip.x + 5, grip.y - 300, { steps: 6 }); await page.mouse.up();
  const words = await page.locator('[data-shape-id="r1"] [data-shape-text]').boundingBox();
  const outline = await page.locator('[data-shape-id="r1"] rect').first().boundingBox();
  check('a height-only shrink of an H1 shape still holds its words', words.y + words.height <= outline.y + outline.height + 1, JSON.stringify([words.y + words.height, outline.y + outline.height]));
  // 7: type in a text box, then switch to Code: one undo takes back only the switch.
  await page.locator('[data-item-id="t1"]').dblclick();
  await page.keyboard.press('End');
  await page.keyboard.type(' typed');
  await page.locator('[data-item-id="t1"] [data-text-mode="code"]').click();
  await page.keyboard.press('Control+z');
  const t = (await saved()).items.find(item => item.id === 't1');
  check('undo after typing then Code takes back only the switch', t.mode === undefined && t.text === 'keep me typed', JSON.stringify(t));
  await context.close();
  // 10: a click in a note's blank lower part keeps editing.
  const note = await open('review-note', { items: [{ id: 'n1', kind: 'sticky', x: 100, y: 100, w: 160, h: 200, text: 'top', color: '#37352f', opacity: 1 }] });
  await note.page.locator('[data-item-id="n1"]').dblclick();
  const nb = await note.page.locator('[data-item-id="n1"]').boundingBox();
  await note.page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height - 20);
  await note.page.keyboard.type('X');
  check('a click in the blank part of a note keeps editing, caret at the end', (await editorText(note.page)) === 'topX');
  // 11: Ask in chat shows a hidden composer.
  await note.page.keyboard.press('Escape');
  await note.page.getByRole('button', { name: 'Hide chat composer' }).click();
  await note.page.evaluate(() => window.dispatchEvent(new CustomEvent('small:ask-focus', { detail: { text: 'Explain this' } })));
  check('Ask in chat brings a hidden composer back', !(await note.page.locator('[data-canvas-composer][data-composer-hidden]').count()));
  await note.context.close();
});

await browser.close();
if (errors.length) { console.log('page errors:'); for (const error of errors) console.log(`  ${error}`); }
check('no page errors', errors.length === 0, errors.length ? `${errors.length}` : '');
const failed = results.filter(result => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
