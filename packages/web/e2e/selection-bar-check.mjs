import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { treeBoard, flowBoard } from '../src/inline-ai-fixtures.js';

// The selection action bar (owner brief 2026-10-13: "rename Ask in chat to Add to chat (ctrl + L) or Quick Edit (ctrl + k )";
// docs/features/selection-action-bar.md), against the real AdaptiveCanvas in e2e/inline-ai-harness.html under Vite dev: no server,
// no model. One bar for each kind of selection, where it sits, when it hides, its keys. The chip in the real composer is
// e2e/add-to-chat-check.mjs (a local stack); Search on Ctrl/Cmd+Shift+F is e2e/canvas-shell-check.mjs.
// usage: in packages/web, `npx vite --port 5394 --strictPort --host 127.0.0.1`, then
//        HARNESS=http://127.0.0.1:5394/e2e/inline-ai-harness.html node e2e/selection-bar-check.mjs [screenshot dir] [--only=<name substring>]
//        MERGED=1 also runs the Edit-mode assertion, which needs the inline editor's mode argument (feature/inline-context).
const BASE = process.env.HARNESS || 'http://127.0.0.1:5394/e2e/inline-ai-harness.html';
const SHOTS = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const ONLY = (process.argv.find(arg => arg.startsWith('--only=')) || '').slice(7);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const errors = [];
const both = () => {
  const tree = treeBoard(), flow = flowBoard();
  return {
    shapes: [...tree.shapes, ...flow.shapes], links: [...tree.links, ...flow.links], items: [...tree.items, ...flow.items], groups: flow.groups,
    blocks: [...flow.blocks, { id: 'card1', type: 'explanation', title: 'A lesson card', body: 'The words of the card.', dx: 0, dy: 0 }],
  };
};

async function open(name, { viewport = { width: 1500, height: 950 }, init = null } = {}) {
  const context = await browser.newContext({ viewport });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|favicon|404/.test(message.text())) errors.push(`${name}: ${message.text()}`); });
  await page.route('**/api/**', route => route.request().method() !== 'GET' ? route.abort() : route.continue());
  await page.route('**/api/learn/graph-config**', route => route.fulfill({ json: { desmosApiKey: null } }));
  await page.route('**/api/learn/photos**', route => route.fulfill({ json: { photos: [] } }));
  const key = `harness:${name}`, board = both();
  await context.addInitScript(([key, board]) => {
    if (sessionStorage.getItem('harness:seeded')) return;
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [], groups: [], areas: [], ...board }));
    sessionStorage.setItem('harness:seeded', '1');
  }, [key, board]);
  await page.goto(`${BASE}?board=${name}`);
  await page.locator('[data-canvas-surface]').waitFor();
  await page.waitForFunction(ids => ids.every(id => document.querySelector(`[data-shape-id="${id}"],[data-item-id="${id}"]`)), [...board.shapes, ...board.items].map(entry => entry.id));
  await page.waitForTimeout(300);
  // The ask-focus events the canvas sends (Add to chat reveals and focuses the composer through one) and the keys' fate.
  await page.evaluate(() => { window.__askFocus = []; window.addEventListener('small:ask-focus', event => window.__askFocus.push(event.detail?.text ?? null)); });
  const shot = async label => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${label}.png` }); };
  return { page, context, shot };
}
const run = async (name, fn) => {
  if (ONLY && !name.includes(ONLY)) return;
  try { await fn(); } catch (error) { check(`${name} (threw)`, false, error.message.split('\n')[0]); }
};
// Pan (wheel) until a thing sits in the open middle of the canvas, clear of the composer, the hooks and the tools.
const reveal = async (page, locator) => {
  const view = page.viewportSize();
  await locator.waitFor({ state: 'attached' });
  for (let i = 0; i < 10; i += 1) {
    const b = await locator.boundingBox();
    if (b && b.y > 120 && b.y + b.height < view.height - 220 && b.x > 360 && b.x + b.width < view.width - 300) return b;
    const dy = b ? b.y + b.height / 2 - view.height * 0.4 : 0, dx = b ? b.x + b.width / 2 - view.width * 0.5 : 0;
    await page.mouse.move(view.width * 0.5, view.height * 0.4); await page.mouse.wheel(Math.round(dx), Math.round(dy));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  return locator.boundingBox();
};
const centerOf = async (page, locator) => { const box = await reveal(page, locator); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
const clickAt = async (page, locator, modifiers = []) => { const at = await centerOf(page, locator); for (const key of modifiers) await page.keyboard.down(key); await page.mouse.click(at.x, at.y); for (const key of modifiers) await page.keyboard.up(key); };
const shape = id => page => page.locator(`[data-shape-id="${id}"]`).first();
const bars = page => page.locator('[data-selection-bar]:visible');
const rect = locator => locator.boundingBox();
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60)))));
// A selection's box on screen: the union of what is selected.
const selectionBox = async (page, locators) => {
  const boxes = await Promise.all(locators.map(locator => rect(locator)));
  const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y));
  return { left, top, right: Math.max(...boxes.map(b => b.x + b.width)), bottom: Math.max(...boxes.map(b => b.y + b.height)) };
};
const clear = async page => { await page.keyboard.press('Escape'); await page.mouse.click(60, 900); await settle(page); };

await run('one bar for each kind of selection, above it, never over it', async () => {
  const { page, context, shot } = await open('bar-kinds');
  const cases = [
    ['a lesson card', async () => { await clickAt(page, page.locator('[data-block-id="card1"] [data-drag-zone]').first()); return [page.locator('[data-block-id="card1"]')]; }],
    ['an image', async () => { await clickAt(page, page.locator('[data-block-id="img1"] [data-drag-zone]').first()); return [page.locator('[data-block-id="img1"]')]; }],
    ['a shape', async () => { await clickAt(page, shape('n23')(page)); return [shape('n23')(page)]; }],
    ['a text object', async () => { await clickAt(page, page.locator('[data-item-id="code1"]')); return [page.locator('[data-item-id="code1"]')]; }],
    ['a sticky note', async () => { await clickAt(page, page.locator('[data-item-id="aside"]')); return [page.locator('[data-item-id="aside"]')]; }],
    ['a group', async () => { await clickAt(page, shape('g1')(page)); return [shape('g1')(page), shape('g2')(page)]; }],
    ['several objects', async () => { await clickAt(page, shape('n3')(page)); await clickAt(page, shape('n23')(page), ['Shift']); return [shape('n3')(page), shape('n23')(page)]; }],
  ];
  for (const [label, select] of cases) {
    await clear(page);
    const objects = await select();
    await settle(page);
    const count = await bars(page).count();
    const bar = count ? await rect(bars(page).first()) : null;
    const around = await selectionBox(page, objects);
    check(`${label}: exactly one bar, with Add to chat and Quick Edit`, count === 1 && await page.getByRole('button', { name: 'Add to chat' }).count() === 1 && await page.getByRole('button', { name: 'Quick Edit' }).count() === 1, `bars ${count}`);
    check(`${label}: it sits above the selection or below it and never over it`, !!bar && (bar.y + bar.height <= around.top + 1 || bar.y >= around.bottom - 1), JSON.stringify({ bar, around }));
    check(`${label}: it stays inside the window`, !!bar && bar.x >= 0 && bar.y >= 0 && bar.x + bar.width <= 1500 && bar.y + bar.height <= 950);
    await shot(`bar-${label.replace(/\W+/g, '-')}`);
  }
  // Nothing selected: no bar. A lone empty text box has nothing to add, so no bar either.
  await clear(page);
  check('nothing selected: no bar', (await bars(page).count()) === 0);
  await context.close();
});

await run('the bar names its shortcuts: Ctrl on Windows and Linux, Cmd on a Mac, as tooltips, accessible names and badges', async () => {
  const win = await open('bar-keys');
  await clickAt(win.page, shape('n23')(win.page));
  await settle(win.page);
  const add = win.page.getByRole('button', { name: 'Add to chat' }), edit = win.page.getByRole('button', { name: 'Quick Edit' });
  check('Windows: badges read Ctrl+L and Ctrl+K', (await add.innerText()).includes('Ctrl+L') && (await edit.innerText()).includes('Ctrl+K'), `${await add.innerText()} | ${await edit.innerText()}`);
  check('the tooltips carry the shortcut too, and the keys are announced', (await add.getAttribute('title')) === 'Add to chat (Ctrl+L)' && (await edit.getAttribute('title')) === 'Quick Edit (Ctrl+K)' && (await add.getAttribute('aria-keyshortcuts')) === 'Control+L');
  await win.context.close();
  const mac = await open('bar-keys-mac', { init: () => Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' }) });
  await clickAt(mac.page, shape('n23')(mac.page));
  await settle(mac.page);
  const addMac = mac.page.getByRole('button', { name: 'Add to chat' });
  check('Mac: badges read Cmd+L and Cmd+K', (await addMac.innerText()).includes('Cmd+L') && (await mac.page.getByRole('button', { name: 'Quick Edit' }).innerText()).includes('Cmd+K') && (await addMac.getAttribute('title')) === 'Add to chat (Cmd+L)');
  await mac.context.close();
});

await run('clicking an action keeps the selection; Quick Edit opens the editor, hides the bar and returns it on close', async () => {
  const { page, context, shot } = await open('bar-edit');
  await clickAt(page, shape('n23')(page));
  await settle(page);
  await page.getByRole('button', { name: 'Add to chat' }).click();
  await settle(page);
  check('Add to chat leaves the selection and the bar as they were', (await bars(page).count()) === 1 && (await shape('n23')(page).locator('[data-handle]').count()) > 0);
  check('and asks the composer to take the focus once, writing no question', JSON.stringify(await page.evaluate(() => window.__askFocus)) === '[null]');
  await page.getByRole('button', { name: 'Quick Edit' }).click();
  await page.locator('[data-inline-ai]').waitFor();
  await settle(page);
  check('Quick Edit opens the inline editor, focused in its prompt', await page.evaluate(() => document.activeElement?.matches('[data-inline-prompt]')));
  check('the bar is hidden while the editor is open', (await bars(page).count()) === 0);
  check('and the selected target is kept', (await page.locator('[data-inline-target]').count()) === 1 && /23/.test(await page.locator('[data-inline-target-label]').innerText()));
  await shot('bar-editor-open');
  await page.keyboard.press('Escape');
  await page.locator('[data-inline-ai]').waitFor({ state: 'detached' });
  await settle(page);
  check('closing the editor keeps the selection and brings the bar back', (await bars(page).count()) === 1);
  await context.close();
});

await run('the bar is hidden while dragging, resizing a text box, typing, and with nothing selected', async () => {
  const { page, context } = await open('bar-hidden');
  const at = await centerOf(page, shape('n23')(page));
  await page.mouse.click(at.x, at.y);
  await settle(page);
  check('selected: one bar', (await bars(page).count()) === 1);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 40, at.y + 30, { steps: 5 });
  await settle(page);
  check('mid-drag: no bar', (await bars(page).count()) === 0);
  await page.mouse.up();
  await settle(page);
  check('after the drop: the bar is back, above the moved shape', (await bars(page).count()) === 1);
  // Typing in a text box: the editor is open, so no bar.
  await clear(page);
  await page.locator('[data-item-id="para"]').dblclick();
  await settle(page);
  check('while words are being typed: no bar', (await bars(page).count()) === 0 && await page.evaluate(() => !!document.activeElement?.isContentEditable));
  await page.keyboard.press('Escape');
  await clear(page);
  check('selection cleared: no bar', (await bars(page).count()) === 0);
  await context.close();
});

// The chords. Ctrl/Cmd+L with a selection adds it (and the browser's own Ctrl+L is prevented only then); without a selection, with
// Shift, in a text field, or with the editor open it is left alone. Ctrl/Cmd+K is Quick Edit wherever the canvas has focus, even
// with nothing selected (it is never anything else: Search moved to Ctrl/Cmd+Shift+F).
await run('Ctrl+L and Ctrl+K: scoped to the canvas selection, never while typing, never with Shift', async () => {
  const { page, context } = await open('bar-chords');
  // A chord is dispatched where the focus is. Add to chat moves the focus into the composer, so each press that means the canvas has the focus first.
  const press = (init, focusCanvas = true) => page.evaluate(([init, focusCanvas]) => { if (focusCanvas) document.activeElement?.blur?.(); const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); (document.activeElement || document.body).dispatchEvent(event); return event.defaultPrevented; }, [init, focusCanvas]);
  const asked = () => page.evaluate(() => window.__askFocus.length);
  await clear(page);
  check('Ctrl+L with no selection is the browser\'s: not prevented, nothing asked', !(await press({ key: 'l', ctrlKey: true })) && (await asked()) === 0);
  await clickAt(page, shape('n23')(page));
  await settle(page);
  check('Ctrl+L with a selection adds it: prevented, the composer is asked to take focus', (await press({ key: 'l', ctrlKey: true })) === true && (await asked()) === 1);
  check('Cmd+L does the same on a Mac', (await press({ key: 'l', metaKey: true })) === true && (await asked()) === 2);
  check('Ctrl+Shift+L is still the lock command, not Add to chat', (await asked()) === 2 && (await press({ key: 'L', code: 'KeyL', ctrlKey: true, shiftKey: true })) === true && (await asked()) === 2);
  await page.keyboard.press('Control+z');
  await page.locator('[data-chat-composer]').click();
  check('Ctrl+L inside the composer\'s text field does nothing', !(await press({ key: 'l', ctrlKey: true }, false)) && (await asked()) === 2);
  check('and Ctrl+K inside it is not Quick Edit either', !(await press({ key: 'k', ctrlKey: true }, false)) && (await page.locator('[data-inline-ai]').count()) === 0);
  await clear(page);
  await page.locator('body').click({ position: { x: 60, y: 900 } });
  await page.waitForFunction(() => document.querySelectorAll('[data-selection-bar]').length === 0 && !document.querySelector('[data-shape-id] [data-handle]')); // nothing is selected now
  const prevented = await press({ key: 'k', ctrlKey: true });
  await page.locator('[data-inline-hint]').waitFor({ timeout: 2000 }).catch(() => {});
  await settle(page);
  check('Ctrl+K on the canvas with nothing selected stays on the canvas: prevented, a hint, no editor, no Search', prevented === true && (await page.locator('[data-inline-hint]').count()) === 1 && (await page.locator('[data-inline-ai]').count()) === 0, JSON.stringify({ prevented, hint: await page.locator('[data-inline-hint]').count(), editor: await page.locator('[data-inline-ai]').count(), bars: await bars(page).count() }));
  await clickAt(page, shape('n23')(page));
  await settle(page);
  await page.keyboard.press('Control+k');
  await page.locator('[data-inline-ai]').waitFor();
  check('Ctrl+K with a selection opens the editor, and with it open Ctrl+L leaves the bar and the chip alone', (await bars(page).count()) === 0 && !(await press({ key: 'l', ctrlKey: true })) && (await asked()) === 2);
  await context.close();
});

// Written for the merge with feature/inline-context: Quick Edit passes 'edit' to openInline, which opens Edit selection mode; on this branch
// the argument is ignored and the editor opens in its old default (Explain).
await run('Quick Edit opens with Edit selection active (needs the inline editor branch)', async () => {
  if (process.env.MERGED !== '1') { console.log('- skipped: needs feature/inline-context (run with MERGED=1 after the merge)'); return; }
  const { page, context } = await open('bar-edit-mode');
  await clickAt(page, shape('n23')(page));
  await settle(page);
  await page.getByRole('button', { name: 'Quick Edit' }).click();
  await page.locator('[data-inline-ai]').waitFor();
  // Since inline-context point 8 (182507b1) the modes sit in a menu behind the mode toggle: open it, then read the toggle's
  // current mode and the checked row, as inline-ai-check does.
  const toggle = page.locator('[data-inline-ai] [data-inline-mode-toggle]');
  await toggle.click();
  check('Edit selection is the active mode, and Explain selection is still offered', (await toggle.getAttribute('data-inline-mode-current')) === 'edit'
    && (await page.locator('[data-inline-ai] [data-inline-mode="edit"]').getAttribute('aria-checked')) === 'true' && await page.locator('[data-inline-ai] [data-inline-mode="explain"]').isVisible());
  await context.close();
});

await browser.close();
const failed = results.filter(result => !result.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
if (errors.length) { console.log('page errors:', errors.slice(0, 5)); }
process.exit(failed || errors.length ? 1 : 0);
