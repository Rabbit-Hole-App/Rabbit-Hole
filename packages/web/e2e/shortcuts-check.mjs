import { chromium, firefox, webkit } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';
import { menubar, openMenu } from './canvas-menu-helpers.mjs';
import { SECTIONS, shortcutRows } from '../src/shortcuts.js';

// View > Shortcuts and the shortcut inventory (owner brief 2026-11-02, C:/s/spec/shortcuts/owner-brief-2026-11-02.md; src/shortcuts.js,
// ShortcutsSheet.jsx, canvas-menus.js, canvas-actions.js, AdaptiveCanvas.jsx, LearnPage.jsx, Shell.jsx). Real keys through the browser's
// input pipeline (Playwright keyboard), never a synthetic dispatchEvent: View > Shortcuts directly below Slash Commands, and ?; the
// window's title, its sections as tabs (seven plus Menus), Quick Edit first, search across tabs, the Windows / Mac choice, Tab kept inside, background canvas keys
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

const total = 62;
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
// One section shows at a time: a row's keys are read on its own tab, which is opened only when the row is not already shown.
const tabTo = (page, title) => sheet(page).locator(`[data-shortcuts-tab="${title}"]`).click();
async function keysOf(page, id) {
  const row = sheet(page).locator(`[data-shortcut="${id}"]`);
  if (!await row.count()) await tabTo(page, shortcutRows().find(entry => entry.id === id).section);
  return row.locator('[data-shortcut-key]').allInnerTexts();
}
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
  // Owner 2026-11-02 (second pass): the sections are tabs (the house Radix Tabs, as in Creator Analytics), Essentials open.
  const tabs = await sheet(page).locator('[role="tab"]').evaluateAll(nodes => nodes.map(node => `${node.textContent}${node.getAttribute('aria-selected') === 'true' ? '*' : ''}`));
  ok('the seven sections plus Menus are tabs in order, Essentials selected', tabs.join('|') === 'Essentials*|Navigation|Editing|Menus|Drawing|Chat and text|Presenting|Mouse and trackpad', tabs.join('|'));
  const panels = await sheet(page).locator('[data-shortcuts-section]').evaluateAll(nodes => nodes.map(node => node.dataset.shortcutsSection));
  ok('one section shows at a time, in a tab panel', panels.join() === 'Essentials' && (await sheet(page).locator('[data-shortcuts-list]').getAttribute('role')) === 'tabpanel', panels.join());
  const first = await sheet(page).locator('[data-shortcut]').first().getAttribute('data-shortcut');
  ok('Quick Edit is the first shortcut, Ctrl+K', first === 'quick-edit' && (await keysOf(page, 'quick-edit')).join() === 'Ctrl+K', `${first} ${(await keysOf(page, 'quick-edit')).join()}`);
  ok('Windows is chosen on this platform', (await sheet(page).locator('[data-shortcuts-platform="win"]').getAttribute('aria-checked')) === 'true');
  ok('the four new keys are listed', (await keysOf(page, 'slash-commands')).join() === 'Shift+S' && (await keysOf(page, 'right-panel')).join() === 'Shift+P'
    && (await keysOf(page, 'grid')).join() === 'Shift+G' && (await keysOf(page, 'fit-selection')).join() === 'Shift+2');
  // The four new keys sent us to Navigation: the search is made from there, and clearing it must come back to it.
  const before = await sheet(page).locator('[role="tab"][aria-selected="true"]').innerText();
  await sheet(page).locator('[data-shortcuts-search]').focus();
  await page.keyboard.type('snap grid');
  ok('search filters to the matching row', (await sheet(page).locator('[data-shortcut]').evaluateAll(nodes => nodes.map(node => node.dataset.shortcut))).join() === 'grid');
  await sheet(page).locator('[data-shortcuts-search]').fill('esc');
  const found = await sheet(page).locator('[data-shortcuts-section]').evaluateAll(nodes => nodes.map(node => node.dataset.shortcutsSection));
  ok('a search shows matches from every section under its name, with no tab selected', found.length >= 3 && found.includes('Essentials') && found.includes('Menus') && await sheet(page).locator('[role="tab"][aria-selected="true"]').count() === 0, found.join());
  await sheet(page).locator('[data-shortcuts-search]').fill('zzzz');
  ok('no match says so', await sheet(page).getByText('No shortcuts match').count() === 1);
  await sheet(page).locator('[data-shortcuts-search]').fill('');
  ok('clearing the search returns to the selected tab', before === 'Navigation' && (await sheet(page).locator('[data-shortcuts-section]').evaluateAll(nodes => nodes.map(node => node.dataset.shortcutsSection))).join() === 'Canvas navigation'
    && (await sheet(page).locator('[role="tab"][aria-selected="true"]').innerText()) === 'Navigation', before);
  // Tab order: search, platform choice, the tab row (its selected tab), the list; the arrows move between tabs.
  await tabTo(page, 'Essentials');
  await sheet(page).locator('[data-shortcuts-search]').focus();
  const order = [];
  for (let n = 0; n < 3; n += 1) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => document.activeElement?.dataset.shortcutsPlatform || document.activeElement?.getAttribute('role') || document.activeElement?.tagName)); }
  ok('Tab goes search, platform choice, the selected tab, then the list', order.join() === 'win,tab,tabpanel', order.join());
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  ok('ArrowRight moves to the next tab and shows it', (await sheet(page).locator('[role="tab"][aria-selected="true"]').innerText()) === 'Navigation'
    && (await sheet(page).locator('[data-shortcuts-section]').evaluateAll(nodes => nodes.map(node => node.dataset.shortcutsSection))).join() === 'Canvas navigation'
    && await page.evaluate(() => document.activeElement?.textContent === 'Navigation'));
  // Owner 2026-11-02 (third pass): the window fits its tab, up to the viewport cap; only the height changes between tabs.
  const sizeOn = async title => { await tabTo(page, title); await page.waitForTimeout(150); return { ...(await sheet(page).boundingBox()), scrolls: await sheet(page).locator('[data-shortcuts-list]').evaluate(node => node.scrollHeight > node.clientHeight + 1) }; };
  const [short, long] = [await sizeOn('Drawing'), await sizeOn('Selection, editing and arrangement')];
  ok('the window fits the tab: shorter on Drawing than on Editing, the same width, no more than 84% of the viewport', short.height + 100 < long.height && short.width === long.width && long.height <= 900 * 0.84 + 1 && !short.scrolls, JSON.stringify({ short, long }));
  await page.screenshot({ path: `${SHOTS}/win-light-editing.png` });
  await tabTo(page, 'Drawing');
  await page.screenshot({ path: `${SHOTS}/win-light-drawing.png` });
  await sheet(page).locator('[data-shortcuts-platform="mac"]').click();
  ok('Mac shows ⌘K and Delete ⌫', (await keysOf(page, 'quick-edit')).join() === '⌘K' && (await keysOf(page, 'delete')).join() === 'Delete ⌫' && (await sheet(page).locator('[data-shortcuts-platform="mac"]').getAttribute('aria-checked')) === 'true');
  await tabTo(page, 'Essentials');
  await sheet(page).locator('[data-shortcuts-platform="mac"]').focus();
  await page.keyboard.press('ArrowLeft');
  ok('the arrows move the platform choice back to Windows', (await keysOf(page, 'quick-edit')).join() === 'Ctrl+K' && await sheet(page).locator('[data-shortcuts-platform="win"]').evaluate(node => node === document.activeElement));
  let inside = true;
  for (let n = 0; n < 8; n += 1) { await page.keyboard.press('Tab'); inside &&= await page.evaluate(() => !!document.activeElement?.closest('[data-shortcuts-sheet]')); }
  for (let n = 0; n < 4; n += 1) { await page.keyboard.press('Shift+Tab'); inside &&= await page.evaluate(() => !!document.activeElement?.closest('[data-shortcuts-sheet]')); }
  ok('Tab and Shift+Tab stay inside the window', inside);
  // Background canvas keys from a control in the window (not a text field): none of them may act on the canvas.
  await sheet(page).locator('[data-shortcuts-platform="win"]').focus();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/win-sheet.png` });
  const tool = await pressedTool(page), transform = await world(page);
  // Ctrl+Z goes last: from a control, the browser's own undo moves the focus back into the search it edits.
  const fromControl = [];
  for (const key of ['Delete', 'Backspace', 'Control+d', 'r', 'Shift+Digit2', 'Control+Minus', 'Control+z']) { if (key === 'Control+z') fromControl.push(await sheet(page).locator('[data-shortcuts-search]').inputValue()); await page.keyboard.press(key); }
  ok('Delete, Backspace, Ctrl+D, a tool key, Shift+2, zoom and Ctrl+Z from a control do nothing behind the window', fromControl[0] === '' && await objects(page) === count && await pressedTool(page) === tool && await world(page) === transform, `search "${fromControl[0]}", ${await objects(page)} objects, tool ${await pressedTool(page)}`);
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
  const macKeys = [];
  for (const title of SECTIONS) { await tabTo(page, title); macKeys.push(...await sheet(page).locator('[data-shortcut-key]').allInnerTexts()); }
  ok('Mac: no Ctrl on any tab', macKeys.length > 60 && !macKeys.some(text => /Ctrl/.test(text)), `${macKeys.length} keys`);
  await tabTo(page, 'Essentials');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/mac-dark-sheet.png` });
  for (const [title, name] of [['Drawing', 'drawing'], ['Selection, editing and arrangement', 'editing']]) { await tabTo(page, title); await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/mac-dark-${name}.png` }); }
  await page.keyboard.press('Escape');
  const undo = await rowState(page, 'Edit', 'Undo');
  ok('Mac: the menubar reads ⌘Z with aria-keyshortcuts Meta+Z', undo.hint === '⌘Z' && undo.keys === 'Meta+Z', JSON.stringify(undo));
  const delRow = await rowState(page, 'Edit', 'Delete');
  ok('Mac: Delete reads Delete ⌫', delRow.hint === 'Delete ⌫', JSON.stringify(delRow));
  await context.close();
}

// ---- 390x844, dark and light: the window fills the screen, the tab row scrolls sideways inside it (never the page), the header,
// search and tabs stay put while the list scrolls, and keycaps are readable.
for (const scheme of ['dark', 'light']) {
  const { context, page } = await open(`narrow-${scheme}`, { viewport: { width: 390, height: 844 }, scheme });
  await blur(page);
  await page.keyboard.press('?');
  await sheet(page).waitFor({ timeout: 5000 });
  const box = await sheet(page).boundingBox();
  ok(`narrow ${scheme}: the window fills the screen width`, box && box.width >= 380 && box.x <= 5, JSON.stringify(box));
  const row = await sheet(page).locator('[data-shortcuts-tabs]').evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth, right: node.getBoundingClientRect().right }));
  ok(`narrow ${scheme}: the tab row scrolls sideways inside the window`, row.scroll > row.client && row.right <= 391, JSON.stringify(row));
  await page.screenshot({ path: `${SHOTS}/narrow-${scheme}-essentials.png` });
  await tabTo(page, 'Drawing'); await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/narrow-${scheme}-drawing.png` });
  await tabTo(page, 'Mouse and trackpad');
  const last = await sheet(page).locator('[data-shortcuts-tab="Mouse and trackpad"]').boundingBox();
  ok(`narrow ${scheme}: the last tab scrolls into view and opens`, last && last.x >= 0 && last.x + last.width <= 391 && (await sheet(page).locator('[data-shortcuts-section]').getAttribute('data-shortcuts-section')) === 'Mouse and trackpad', JSON.stringify(last));
  await tabTo(page, 'Selection, editing and arrangement');
  await sheet(page).locator('[data-shortcuts-list]').evaluate(node => { node.scrollTop = node.scrollHeight; });
  await page.waitForTimeout(200);
  const search = await sheet(page).locator('[data-shortcuts-search]').boundingBox();
  const scrolled = await sheet(page).locator('[data-shortcuts-list]').evaluate(node => node.scrollTop > 0);
  ok(`narrow ${scheme}: scrolled to the end of Editing, the search, platform choice and tabs are still on screen`, scrolled && search && search.y >= 0 && search.y + search.height <= 844
    && await sheet(page).locator('[data-shortcuts-platform="mac"]').isVisible() && await sheet(page).locator('[data-shortcuts-tab="Selection, editing and arrangement"]').isVisible(), JSON.stringify(search));
  ok(`narrow ${scheme}: no sideways page scroll`, await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1) && await sheet(page).locator('[data-shortcuts-list]').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
  const contrast = await sheet(page).locator('[data-shortcut-key]').first().evaluate(node => {
    const rgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => { const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    let back = node, bg = 'rgba(0, 0, 0, 0)';
    while (back && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(back).backgroundColor; back = back.parentElement; }
    const [a, b] = [lum(rgb(getComputedStyle(node).color)), lum(rgb(bg))];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  ok(`narrow ${scheme}: keycap text is 4.5:1 or more on its background`, contrast >= 4.5, contrast.toFixed(2));
  await page.screenshot({ path: `${SHOTS}/narrow-${scheme}-scrolled.png` });
  await page.keyboard.press('Escape');
  ok(`narrow ${scheme}: Esc closes it`, await sheet(page).count() === 0);
  await context.close();
}

ok('no page errors and no model request from the window or the keys', errors.length === 0 && live.length === 0, `${errors.join(' | ')} ${live.join(' ')}`);
await browser.close();
const executed = passed + failed;
if (executed !== total) { failed += 1; console.log(`FAIL  ran ${executed} of ${total} steps`); }
console.log(`${passed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
