import { chromium, firefox, webkit } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';
import { menubar, openMenu } from './canvas-menu-helpers.mjs';

// View > Shortcuts and the shortcut inventory (owner brief 2026-11-02, C:/s/spec/shortcuts/owner-brief-2026-11-02.md; src/shortcuts.js,
// ShortcutsSheet.jsx, canvas-menus.js, canvas-actions.js, AdaptiveCanvas.jsx, LearnPage.jsx, Shell.jsx). Real keys through the browser's
// input pipeline (Playwright keyboard), never a synthetic dispatchEvent: View > Shortcuts directly below Slash Commands, and ?; the
// window's title, seven sections, Quick Edit first, search, the Windows / Mac choice, Tab kept inside, background canvas keys
// suspended (Delete, Undo, Duplicate, a tool key, Shift+G), Esc closing it once with the selection kept, focus returned; each new key
// (Shift+S, Shift+P, Shift+G, Shift+2) acting once, a held key once, and standing down in a field; the right-click menu's platform
// hints and aria-keyshortcuts, Delete doing nothing while the menu is open and Enter choosing the row, never editing the object
// underneath; the menubar's aria-keyshortcuts; a Mac (platform emulated: navigator.platform and the user agent) spelling ⌘K, ⌘Z and
// Delete ⌫, with the Chat send setting Ctrl/⌘+Enter; a 390px dark window whose header stays put and whose keycaps are 4.5:1 or more.
// What Playwright cannot show: a browser's own reserved shortcuts (CDP and Juggler input reach the page directly, never the browser's
// accelerator table), and a real Mac keyboard.
// usage: node e2e/shortcuts-check.mjs [screenshot dir]  (BROWSER=firefox|webkit for another engine; chromium by default)
// A local stack instead: BASE=http://127.0.0.1:<app> SMALL_CP=http://127.0.0.1:<cp> node e2e/shortcuts-check.mjs [dir] - a fresh canvas and
// a session minted with packages/control-plane/.dev.vars. Without BASE it runs on the shortcuts dev clone with a dev test user.
const LOCAL = process.env.BASE || null;
if (LOCAL && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(LOCAL)) throw Error('BASE must be a local stack');
const BASE = LOCAL || 'https://rabbit-hole-web-dev-shortcuts.tryrabbithole.workers.dev';
const SHOTS = process.argv[2] || 'e2e/shots/shortcuts';
const ENGINE = { chromium, firefox, webkit }[process.env.BROWSER || 'chromium'];
if (!ENGINE) throw Error('BROWSER must be chromium, firefox or webkit');
mkdirSync(SHOTS, { recursive: true });
const UA = { 'User-Agent': 'shortcuts-check' };
let session;
if (LOCAL) {
  const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
  session = (await (await fetch(`${process.env.SMALL_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `shortcuts-${Date.now().toString(36)}@example.com`, secret }) })).json()).session;
} else {
  const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
  const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
  session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'shortcuts-check@example.com', secret }) })).json()).session;
}
if (!session) throw Error('no test session');
const made = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json', origin: BASE, cookie: `small_session=${session}` }, body: JSON.stringify({ title: 'Shortcuts check' }) })).json();
if (!made?.name) throw Error('no canvas');

const total = 47;
let passed = 0, failed = 0;
const ok = (name, condition, extra = '') => { if (condition) passed += 1; else failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const browser = await ENGINE.launch();
const errors = [], live = [];
// Anything that would generate, search, capture, grade or transcribe: the window and these keys never ask a model.
const LIVE = /\/api\/(learn\/(artifact|image|video|scene|tts|search|photos|transcribe|coaching|webcard|explain|cad|motion|inline)|ask)\b/;
const WIN = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' };
const MAC = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' };
async function open(tag, { viewport = { width: 1440, height: 900 }, scheme = 'light', mac = false, prefs = null } = {}) {
  // Playwright's WebKit reports a Mac user agent on every OS, so its Windows run says Windows explicitly (emulated, like the Mac run).
  const win = !mac && ENGINE === webkit;
  const context = await browser.newContext({ viewport, colorScheme: scheme, ...(mac ? MAC : win ? WIN : {}) });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  if (mac || win) await context.addInitScript(platform => Object.defineProperty(Navigator.prototype, 'platform', { get: () => platform }), mac ? 'MacIntel' : 'Win32');
  if (prefs) await context.addInitScript(value => { try { localStorage.setItem('rh.ui-prefs', value); } catch { /* the check reads the default */ } }, JSON.stringify(prefs));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${tag}: ${error.message.slice(0, 160)}`));
  page.on('request', request => { if (request.method() !== 'GET' && LIVE.test(new URL(request.url()).pathname)) live.push(`${tag} ${request.method()} ${new URL(request.url()).pathname}`); });
  await page.goto(`${BASE}/apps/${made.name}`);
  await menubar(page).waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  return { context, page };
}
const sheet = page => page.getByRole('dialog', { name: 'Shortcuts', exact: true });
const keysOf = (page, id) => sheet(page).locator(`[data-shortcut="${id}"] [data-shortcut-key]`).allInnerTexts();
const blur = page => page.evaluate(() => document.activeElement?.blur?.());
const objects = page => page.locator('[data-item-id]').count();
const world = page => page.locator('[data-canvas-world]').evaluate(node => node.style.transform);
const pressedTool = page => page.locator('button[aria-keyshortcuts][aria-pressed="true"]').first().getAttribute('aria-keyshortcuts').catch(() => null);
async function rowState(page, menu, name, submenu = null) {
  const panel = await openMenu(page, menu, submenu);
  const row = panel.locator(`[data-menu-item="${name}"]`).first();
  const state = { disabled: await row.isDisabled(), checked: await row.getAttribute('aria-checked'), hint: await row.locator('[data-menu-hint]').innerText().catch(() => null), keys: await row.getAttribute('aria-keyshortcuts') };
  // One Esc per open level, each only while a menu is still open: a spare Esc would reach the canvas and clear its selection.
  for (let step = 0; step < 3 && await menubar(page).getByRole('menu').count(); step += 1) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
  await blur(page);
  return state;
}
const selected = async page => !(await rowState(page, 'Edit', 'Delete')).disabled;
const gridOn = async page => (await rowState(page, 'Arrange', 'Snap to grid')).checked === 'true';
const panelOn = async page => (await rowState(page, 'View', 'Right panel', 'Show / hide')).checked === 'true';

// ---- Windows (this runner's platform), 1440x900, light.
{
  const { context, page } = await open('win');
  const insert = await openMenu(page, 'Insert');
  await insert.getByRole('menuitem', { name: 'Sticky note', exact: true }).click();
  await page.locator('[data-item-id]').first().waitFor({ timeout: 10000 });
  await page.keyboard.press('Escape');
  await blur(page);
  await page.keyboard.press('Control+a');
  const count = await objects(page);
  ok('setup: a sticky note on the canvas, selected', count >= 1 && await selected(page), `${count} objects`);

  // View > Shortcuts, directly below Slash Commands.
  const view = await openMenu(page, 'View');
  const names = await view.locator(':scope > [data-menu-item]').evaluateAll(rows => rows.map(row => row.dataset.menuItem));
  ok('View: Shortcuts sits directly below Slash Commands', names.indexOf('Shortcuts') === names.indexOf('Slash Commands') + 1 && names.indexOf('Shortcuts') > 0, names.join(' | '));
  await view.locator('[data-menu-item="Shortcuts"]').click();
  await sheet(page).waitFor({ timeout: 5000 });
  ok('View > Shortcuts opens the window titled Shortcuts, search focused', (await sheet(page).locator('h2').innerText()) === 'Shortcuts' && await sheet(page).locator('[data-shortcuts-search]').evaluate(node => node === document.activeElement));
  const sections = await sheet(page).locator('[data-shortcuts-section]').evaluateAll(nodes => nodes.map(node => node.dataset.shortcutsSection));
  ok('seven sections in the owner\'s order', sections.join('|') === 'Essentials|Canvas navigation|Selection, editing and arrangement|Drawing tools|Chat and text editing|Presenting and interactive cards|Mouse and trackpad', sections.join('|'));
  const first = await sheet(page).locator('[data-shortcut]').first().getAttribute('data-shortcut');
  ok('Quick Edit is the first shortcut, Ctrl+K', first === 'quick-edit' && (await keysOf(page, 'quick-edit')).join() === 'Ctrl+K', `${first} ${(await keysOf(page, 'quick-edit')).join()}`);
  ok('Windows is chosen on this platform', (await sheet(page).locator('[data-shortcuts-platform="win"]').getAttribute('aria-checked')) === 'true');
  ok('the four new keys are listed', (await keysOf(page, 'slash-commands')).join() === 'Shift+S' && (await keysOf(page, 'right-panel')).join() === 'Shift+P'
    && (await keysOf(page, 'grid')).join() === 'Shift+G' && (await keysOf(page, 'fit-selection')).join() === 'Shift+2');
  await page.keyboard.type('snap grid');
  ok('search filters to the matching row', (await sheet(page).locator('[data-shortcut]').evaluateAll(nodes => nodes.map(node => node.dataset.shortcut))).join() === 'grid');
  await sheet(page).locator('[data-shortcuts-search]').fill('zzzz');
  ok('no match says so', await sheet(page).getByText('No shortcuts match').count() === 1);
  await sheet(page).locator('[data-shortcuts-search]').fill('');
  await sheet(page).locator('[data-shortcuts-platform="mac"]').click();
  ok('Mac shows ⌘K and Delete ⌫', (await keysOf(page, 'quick-edit')).join() === '⌘K' && (await keysOf(page, 'delete')).join() === 'Delete ⌫' && (await sheet(page).locator('[data-shortcuts-platform="mac"]').getAttribute('aria-checked')) === 'true');
  await page.keyboard.press('ArrowLeft');
  ok('the arrows move the platform choice back to Windows', (await keysOf(page, 'quick-edit')).join() === 'Ctrl+K' && await sheet(page).locator('[data-shortcuts-platform="win"]').evaluate(node => node === document.activeElement));
  let inside = true;
  for (let n = 0; n < 8; n += 1) { await page.keyboard.press('Tab'); inside &&= await page.evaluate(() => !!document.activeElement?.closest('[data-shortcuts-sheet]')); }
  for (let n = 0; n < 4; n += 1) { await page.keyboard.press('Shift+Tab'); inside &&= await page.evaluate(() => !!document.activeElement?.closest('[data-shortcuts-sheet]')); }
  ok('Tab and Shift+Tab stay inside the window', inside);
  // Background canvas keys from a control in the window (not a text field): none of them may act on the canvas.
  await sheet(page).locator('[data-shortcuts-platform="win"]').focus();
  const tool = await pressedTool(page), transform = await world(page);
  for (const key of ['Delete', 'Backspace', 'Control+d', 'Control+z', 'r', 'Shift+Digit2', 'Control+Minus']) await page.keyboard.press(key);
  ok('Delete, Backspace, Ctrl+D, Ctrl+Z, a tool key, Shift+2 and zoom do nothing behind the window', await objects(page) === count && await pressedTool(page) === tool && await world(page) === transform, `${await objects(page)} objects, tool ${await pressedTool(page)}`);
  await page.screenshot({ path: `${SHOTS}/win-sheet.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok('one Esc closes the window', await sheet(page).count() === 0);
  ok('focus goes back to the canvas (the opener, a menu row, is gone)', await page.evaluate(() => document.activeElement === document.body));
  const kept = await selected(page), left = await objects(page);
  ok('the Esc left the selection and the objects alone', kept && left === count, `selected ${kept}, ${left} objects`);

  // ? opens it, a ? typed in its search is text, and Esc returns focus to the page.
  await page.keyboard.press('?');
  await sheet(page).waitFor({ timeout: 5000 });
  await page.keyboard.press('?');
  ok('? opens the window; a ? typed in the search is text', (await sheet(page).locator('[data-shortcuts-search]').inputValue()) === '?' && await sheet(page).count() === 1);
  await page.keyboard.press('Escape');
  ok('Esc closes it and the focus is back on the page', await sheet(page).count() === 0 && await page.evaluate(() => document.activeElement === document.body));

  // Shift+G: once per press, a held key once.
  const grid = await gridOn(page);
  await page.keyboard.press('Shift+G');
  const flipped = await gridOn(page);
  await page.keyboard.down('Shift'); await page.keyboard.down('G'); await page.keyboard.down('G'); await page.keyboard.down('G'); await page.keyboard.up('G'); await page.keyboard.up('Shift');
  ok('Shift+G turns Snap to grid on or off once', flipped === !grid);
  ok('Shift+G held down toggles once, not on every repeat', await gridOn(page) === grid);
  // Shift+P: the right panel.
  const panel = await panelOn(page);
  await page.keyboard.press('Shift+P');
  const panelFlipped = await panelOn(page);
  await page.keyboard.press('Shift+P');
  ok('Shift+P shows or hides the right panel, once per press', panelFlipped === !panel && await panelOn(page) === panel);
  // Shift+S: Slash Commands, and no Shortcuts window over it.
  await page.keyboard.press('Shift+S');
  const slash = page.getByRole('dialog', { name: 'Slash Commands' });
  await slash.waitFor({ timeout: 10000 }).catch(() => {});
  ok('Shift+S opens Slash Commands', await slash.count() === 1);
  await slash.locator('button[aria-label="Close Slash Commands"]').focus().catch(() => {});
  await page.keyboard.press('?');
  ok('? does not open Shortcuts over Slash Commands', await sheet(page).count() === 0);
  await page.keyboard.press('Escape');
  await slash.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await blur(page);
  // Shift+2: Fit selection with a selection, nothing without one.
  await page.keyboard.press('Control+a');
  for (let n = 0; n < 3; n += 1) await page.keyboard.press('Control+Minus');
  await page.waitForTimeout(400);
  const zoomedOut = await world(page);
  await page.keyboard.press('Shift+Digit2');
  await page.waitForTimeout(500);
  const fitted = await world(page);
  ok('Shift+2 fits the selection', fitted !== zoomedOut, `${zoomedOut} -> ${fitted}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const unselected = await world(page);
  await page.keyboard.press('Shift+Digit2');
  await page.waitForTimeout(400);
  ok('Shift+2 with nothing selected does nothing, as its row is disabled', await world(page) === unselected && (await rowState(page, 'View', 'Fit selection')).disabled);

  // In a text field every one of them is typing.
  await page.keyboard.press('Control+a');
  const gridBefore = await gridOn(page), panelBefore = await panelOn(page);
  await page.keyboard.press('/');
  await page.waitForTimeout(300);
  const field = await page.evaluate(() => document.activeElement?.tagName);
  for (const key of ['Shift+S', 'Shift+G', 'Shift+P', 'Shift+Digit2', 'Backspace']) await page.keyboard.press(key);
  const typed = await page.evaluate(() => document.activeElement?.value ?? null);
  ok('in the Find field Shift+S, Shift+G, Shift+P and Shift+2 type', field === 'INPUT' && typed === 'SGP', `${field} "${typed}"`);
  ok('...and open, toggle and delete nothing', await page.getByRole('dialog', { name: 'Slash Commands' }).count() === 0 && await gridOn(page) === gridBefore && await panelOn(page) === panelBefore && await objects(page) === count);

  // The right-click menu: platform hints and aria keys; Delete does nothing while it is open; Enter chooses a row, never edits.
  await blur(page);
  await page.locator('[data-item-id]').first().click({ button: 'right' });
  const menu = page.locator('[data-canvas-menu]');
  await menu.waitFor({ timeout: 5000 });
  const hint = async action => ({ hint: await menu.locator(`[data-action="${action}"] [data-menu-hint]`).innerText().catch(() => null), keys: await menu.locator(`[data-action="${action}"]`).getAttribute('aria-keyshortcuts').catch(() => null) });
  const [edit, fit, del, copy] = [await hint('text.edit'), await hint('zoom-to-selection'), await hint('delete'), await hint('copy')];
  ok('menu: Edit text shows Enter, Fit selection Shift+2, Delete and Copy Ctrl+C, each with aria-keyshortcuts', edit.hint === 'Enter' && edit.keys === 'Enter' && fit.hint === 'Shift+2' && fit.keys === 'Shift+2'
    && del.hint === 'Delete' && del.keys === 'Delete Backspace' && copy.hint === 'Ctrl+C' && copy.keys === 'Control+C', JSON.stringify({ edit, fit, del, copy }));
  ok('menu: Fit selection is the row\'s name, as in View', (await menu.locator('[data-action="zoom-to-selection"]').innerText()).startsWith('Fit selection'));
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+d');
  ok('Delete and Ctrl+D do nothing while the menu is open', await objects(page) === count && await menu.count() === 1);
  await page.keyboard.press('Escape');
  ok('Esc closes the menu and runs nothing', await menu.count() === 0 && await objects(page) === count);
  await page.locator('[data-item-id]').first().click({ button: 'right' });
  await menu.waitFor({ timeout: 5000 });
  await menu.locator('[data-action="zoom-to-selection"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  ok('Enter chooses the focused row and does not also edit the object', await menu.count() === 0 && await page.locator('[data-rich-editor]').count() === 0 && await objects(page) === count);
  // The menubar: the same hints and aria keys.
  const undo = await rowState(page, 'Edit', 'Undo');
  ok('menubar: Undo shows Ctrl+Z with aria-keyshortcuts Control+Z', undo.hint === 'Ctrl+Z' && undo.keys === 'Control+Z', JSON.stringify(undo));
  const shortcutsRow = await rowState(page, 'View', 'Shortcuts');
  ok('menubar: Shortcuts shows ?', shortcutsRow.hint === '?' && shortcutsRow.keys === '?');
  await context.close();
}

// ---- A Mac (emulated: navigator.platform MacIntel and a Mac user agent; not a real Mac keyboard), 1280x800, dark, Chat sending
// on Ctrl/⌘+Enter.
{
  const { context, page } = await open('mac', { viewport: { width: 1280, height: 800 }, scheme: 'dark', mac: true, prefs: { chatSend: 'mod' } });
  await blur(page);
  await page.keyboard.press('?');
  await sheet(page).waitFor({ timeout: 5000 });
  ok('Mac: the window starts on Mac', (await sheet(page).locator('[data-shortcuts-platform="mac"]').getAttribute('aria-checked')) === 'true');
  ok('Mac: Quick Edit ⌘K first, ⌘Shift+F, ⌘Option+C, Delete ⌫', (await keysOf(page, 'quick-edit')).join() === '⌘K' && (await keysOf(page, 'search')).join() === '⌘Shift+F' && (await keysOf(page, 'copy-style')).join() === '⌘Option+C' && (await keysOf(page, 'delete')).join() === 'Delete ⌫');
  ok('Mac: the context menu is the pointer ways, never an unverified Shift+F10', (await keysOf(page, 'menu-open')).join() === 'Right-click,Two-finger click');
  ok('Chat set to send on ⌘Return: the window says so, and that Return adds a line', (await keysOf(page, 'chat-send')).join() === '⌘Return' && (await keysOf(page, 'chat-newline')).join() === 'Return'
    && (await sheet(page).locator('[data-shortcut="chat-send"]').innerText()).includes('Enter adds a new line'));
  ok('Mac: no Ctrl anywhere in the window', !(await sheet(page).locator('[data-shortcut-key]').allInnerTexts()).some(text => /Ctrl/.test(text)));
  await page.screenshot({ path: `${SHOTS}/mac-dark-sheet.png` });
  await page.keyboard.press('Escape');
  const undo = await rowState(page, 'Edit', 'Undo');
  ok('Mac: the menubar reads ⌘Z with aria-keyshortcuts Meta+Z', undo.hint === '⌘Z' && undo.keys === 'Meta+Z', JSON.stringify(undo));
  const delRow = await rowState(page, 'Edit', 'Delete');
  ok('Mac: Delete reads Delete ⌫', delRow.hint === 'Delete ⌫', JSON.stringify(delRow));
  await context.close();
}

// ---- 390x844, dark: the window fills the screen, its header and search stay put while the list scrolls, keycaps are readable.
{
  const { context, page } = await open('narrow', { viewport: { width: 390, height: 844 }, scheme: 'dark' });
  await blur(page);
  await page.keyboard.press('?');
  await sheet(page).waitFor({ timeout: 5000 });
  const box = await sheet(page).boundingBox();
  ok('narrow: the window fills the screen width', box && box.width >= 380 && box.x <= 5, JSON.stringify(box));
  await sheet(page).locator('[data-shortcuts-list]').evaluate(node => { node.scrollTop = node.scrollHeight; });
  await page.waitForTimeout(200);
  const search = await sheet(page).locator('[data-shortcuts-search]').boundingBox();
  const scrolled = await sheet(page).locator('[data-shortcuts-list]').evaluate(node => node.scrollTop > 0);
  ok('narrow: scrolled to the end, the search and platform choice are still on screen', scrolled && search && search.y >= 0 && search.y + search.height <= 844 && await sheet(page).locator('[data-shortcuts-platform="mac"]').isVisible(), JSON.stringify(search));
  ok('narrow: no sideways scroll', await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1) && await sheet(page).locator('[data-shortcuts-list]').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
  const contrast = await sheet(page).locator('[data-shortcut-key]').first().evaluate(node => {
    const rgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => { const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    let back = node, bg = 'rgba(0, 0, 0, 0)';
    while (back && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(back).backgroundColor; back = back.parentElement; }
    const [a, b] = [lum(rgb(getComputedStyle(node).color)), lum(rgb(bg))];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  ok('dark: keycap text is 4.5:1 or more on its background', contrast >= 4.5, contrast.toFixed(2));
  await page.screenshot({ path: `${SHOTS}/narrow-dark-scrolled.png` });
  await page.keyboard.press('Escape');
  ok('narrow: Esc closes it', await sheet(page).count() === 0);
  await context.close();
}

ok('no page errors and no model request from the window or the keys', errors.length === 0 && live.length === 0, `${errors.join(' | ')} ${live.join(' ')}`);
await browser.close();
const executed = passed + failed;
if (executed !== total) { failed += 1; console.log(`FAIL  ran ${executed} of ${total} steps`); }
console.log(`${passed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
