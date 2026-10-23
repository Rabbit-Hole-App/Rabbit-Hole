import { chromium } from '@playwright/test';

// The menubar round: Upload lives in Insert only; Edit has Copy, Paste,
// Duplicate and Delete; the Arrange menu groups, aligns and distributes through submenus; the
// keyboard shortcuts; and the ? sheet that lists them. (Owner brief 2026-10-22: Insert, Edit, Arrange, View; no Files menu.)

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };
const KEY = 'small.adaptive-canvas:example-team:b@e.test:nanogpt:menu-keys-1:s0';
const sticky = (id, x, y) => ({ id, kind: 'sticky', x, y, w: 160, h: 160, text: id, color: '#f59e0b', opacity: 1 });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addInitScript(([key, items]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items, links: [], blocks: [], groups: [] }));
}, [KEY, [sticky('a', 100, 100), sticky('b', 400, 260), sticky('c', 900, 180)]]);
const page = await context.newPage();
await page.route('**/api/**', route => route.fulfill({ json: replies[new URL(route.request().url()).pathname] || {} }));
page.on('pageerror', error => console.log('PAGEERROR:', error.message));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const menubar = page.getByRole('menubar', { name: 'Canvas menu' });
// // Owner brief 2026-10-22: rows are found by their exact name wherever they sit; a submenu (Align, Distribute, Layer order) opens by its row.
const row = label => menubar.locator(`[data-menu-item="${label}"]`);
const openMenu = async (title, sub = null) => { await menubar.getByRole('menuitem', { name: title, exact: true }).click(); await page.waitForTimeout(200); if (sub) { await row(sub).click(); await page.waitForTimeout(120); } };
// Closed by its own title, not Esc: Esc also lets go of the canvas selection.
const enabled = async (title, label, sub = null) => { await openMenu(title, sub); const on = !(await row(label).isDisabled()); await openMenu(title); await page.waitForTimeout(80); return on; };
const choose = async (title, label, sub = null) => { await openMenu(title, sub); await row(label).click(); await page.waitForTimeout(500); };
const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').items || [], KEY);
const at = async id => (await stored()).find(item => item.id === id);
const zoom = () => page.locator('[aria-label="Zoom controls"] [title="Reset zoom"]').innerText();
const note = id => page.locator(`[data-item-id="${id}"]`);
const blank = async () => { await page.keyboard.press('Escape'); await page.mouse.click(1100, 880); await page.waitForTimeout(150); };

await page.goto('http://localhost:5189/apps/nanogpt?tab=learn&board=menu-keys-1');
await page.waitForSelector('[data-item-id="c"]', { timeout: 30000 });
await page.waitForTimeout(1500);

// --- Upload moved to Insert ---
await openMenu('Insert');
ok('Insert offers Upload a file', await row('Upload a file').count() === 1);
const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null), row('Upload a file').click()]);
ok('and it opens the file picker', !!chooser && chooser.isMultiple());
ok('there is no Files menu, and no upload row anywhere but Insert', (await menubar.getByRole('menuitem', { name: /^Files/ }).count()) === 0 && (await page.locator('[role="menubar"]').innerText()).match(/Upload from your computer/) === null);
await blank();

// --- Edit rows follow the selection ---
ok('nothing selected: Copy, Duplicate, Delete are greyed; Group, Ungroup and Lock (now in Arrange) too', !(await enabled('Edit', 'Copy')) && !(await enabled('Edit', 'Duplicate')) && !(await enabled('Arrange', 'Group')) && !(await enabled('Arrange', 'Ungroup')) && !(await enabled('Arrange', 'Lock')) && !(await enabled('Edit', 'Delete')));
ok('Paste is greyed until something is copied', !(await enabled('Edit', 'Paste')));
await openMenu('Edit');
ok('each Edit row shows its shortcut', (await row('Duplicate').innerText()).includes('Ctrl D') && (await row('Select all').innerText()).includes('Ctrl A'));
await openMenu('Edit');
await openMenu('Arrange');
ok('Group and Ungroup show theirs in Arrange', (await row('Group').innerText()).includes('Ctrl G') && (await row('Ungroup').innerText()).includes('Ctrl Shift G'));
await page.keyboard.press('Escape');
ok('Arrange is greyed with nothing selected', !(await enabled('Arrange', 'Left', 'Align')) && !(await enabled('Arrange', 'Horizontally', 'Distribute')));

// --- Ctrl+A and Arrange ---
await blank();
await page.keyboard.press('Control+a');
await page.waitForTimeout(200);
ok('Ctrl+A selects everything: Copy and Arrange light up', (await enabled('Edit', 'Copy')) && (await enabled('Arrange', 'Horizontally', 'Distribute')));
await choose('Arrange', 'Top', 'Align');
const tops = (await stored()).map(item => item.y);
ok('Align top lines every note up with the highest', tops.every(y => y === 100), tops.join(','));
await page.keyboard.press('Control+z');
await page.waitForTimeout(500);
ok('undo puts them back', (await at('b')).y === 260 && (await at('c')).y === 180);
await page.keyboard.press('Control+a');
await choose('Arrange', 'Horizontally', 'Distribute');
ok('Distribute horizontally evens the gaps; the ends stay', (await at('a')).x === 100 && (await at('b')).x === 500 && (await at('c')).x === 900, `${(await at('a')).x},${(await at('b')).x},${(await at('c')).x}`);
await page.keyboard.press('Control+a');
await choose('Arrange', 'Center', 'Align');
const centres = (await stored()).map(item => item.x + 80);
ok('Align center stacks their centres', centres.every(x => x === centres[0]), centres.join(','));
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);

// --- Group and Ungroup by keyboard; a group aligns as one piece ---
await blank();
await note('a').click({ position: { x: 150, y: 150 } });
await note('b').click({ position: { x: 150, y: 150 }, modifiers: ['Shift'] });
await page.waitForTimeout(150);
await page.keyboard.press('Control+g');
await page.waitForTimeout(400);
ok('Ctrl+G groups the selection', (await page.locator('[data-group-box]').count()) === 1);
const before = { a: await at('a'), b: await at('b') };
await page.keyboard.press('Control+a');
await page.waitForTimeout(200);
ok('a group counts as one piece: two pieces cannot be distributed', (await enabled('Arrange', 'Top', 'Align')) && !(await enabled('Arrange', 'Horizontally', 'Distribute')));
await choose('Arrange', 'Bottom', 'Align');
const after = { a: await at('a'), b: await at('b'), c: await at('c') };
ok('the group moves as one, its members keep their spacing', after.b.y - after.a.y === before.b.y - before.a.y && Math.max(after.a.y, after.b.y) + 160 === after.c.y + 160, JSON.stringify({ a: after.a.y, b: after.b.y, c: after.c.y }));
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
await note('a').click({ position: { x: 150, y: 150 } });
await page.waitForTimeout(150);
ok('Ungroup lights up on a grouped selection', await enabled('Arrange', 'Ungroup'));
await page.keyboard.press('Control+Shift+g');
await page.waitForTimeout(400);
ok('Ctrl+Shift+G ungroups', (await page.locator('[data-group-box]').count()) === 0);

// --- Duplicate, Copy and Paste ---
await blank();
await note('c').click({ position: { x: 30, y: 130 } }); // its right side sits under the toolbar
await page.keyboard.press('Control+d');
await page.waitForTimeout(500);
ok('Ctrl+D duplicates the selection', (await stored()).length === 4);
await choose('Edit', 'Copy');
ok('Edit > Copy fills the clipboard: Paste lights up', await enabled('Edit', 'Paste'));
await choose('Edit', 'Paste');
ok('Edit > Paste adds the copy', (await stored()).length === 5);
await choose('Edit', 'Delete');
ok('Edit > Delete removes it', (await stored()).length === 4);

// --- zoom keys ---
await blank();
await page.keyboard.press('Shift+Digit0');
await page.waitForTimeout(200);
ok('Shift+0 zooms to 100%', (await zoom()).trim() === '100%', await zoom());
await page.keyboard.press('Control+Equal');
await page.waitForTimeout(200);
ok('Ctrl+= zooms in', parseInt(await zoom(), 10) > 100, await zoom());
await page.keyboard.press('Control+Minus');
await page.keyboard.press('Control+Minus');
await page.waitForTimeout(200);
ok('Ctrl+- zooms out', parseInt(await zoom(), 10) < 100, await zoom());
for (let step = 0; step < 4; step += 1) await page.keyboard.press('Control+Equal');
await page.keyboard.press('Shift+Digit1');
await page.waitForTimeout(300);
// Fit never zooms past 100%, and these notes fit at 100%.
ok('Shift+1 zooms to fit, notes included', parseInt(await zoom(), 10) <= 100 && await note('c').isVisible() && (await note('c').boundingBox()).x < 1000, await zoom());
await openMenu('View');
ok('View rows show the zoom keys', (await row('Zoom in').innerText()).includes('Ctrl +') && (await row('Fit canvas').innerText()).includes('Shift 1') && (await row('Zoom to 100%').innerText()).includes('Shift 0'));
await page.keyboard.press('Escape');

// --- / and ? ---
await blank();
// Release B (C:/s/spec/rel-b.md, owner decision 5A, 2026-10-16): the top-bar Search control is gone; / focuses the right
// panel's canvas Find; source search is in Insert.
ok('no top-bar Search control', (await page.getByRole('button', { name: 'Search YouTube, arXiv and Wikipedia' }).count()) === 0);
ok('and no Search in the menubar', (await menubar.getByRole('menuitem', { name: /^Search/ }).count()) === 0);
await page.keyboard.press('/');
await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Find text on canvas', null, { timeout: 5000 }).catch(() => {});
ok('/ focuses the canvas Find and opens no Search', (await page.getByRole('dialog', { name: 'Search' }).count()) === 0
  && await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Find text on canvas'));
await page.keyboard.press('Escape');
await blank();
await page.keyboard.press('?');
await page.waitForTimeout(250);
const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
ok('? opens the shortcuts sheet', (await sheet.count()) === 1);
let sections = 0;
for (const name of ['Canvas', 'Edit', 'View', 'Presenting']) sections += await sheet.getByRole('region', { name }).count();
ok('it lists Canvas, Edit, View and Presenting', sections === 4 && /Duplicate\s*Ctrl\s*D/.test(await sheet.innerText()), `${sections} sections`);
await page.keyboard.press('?');
await page.waitForTimeout(150);
ok('? again closes it', (await sheet.count()) === 0);
await openMenu('View');
ok('View lists no Keyboard shortcuts or Slash commands row (the ? key and the slash palette open them)', (await row('Keyboard shortcuts').count()) === 0 && (await row('Slash commands').count()) === 0);
await page.keyboard.press('Escape');
await blank();
await page.keyboard.press('?');
await page.waitForTimeout(250);
ok('? opens it again', (await sheet.count()) === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
ok('Esc closes it', (await sheet.count()) === 0);

// --- keys stand down while typing ---
const composer = page.locator('[data-chat-pane] [data-chat-composer] :is(textarea, input:not([type="file"]))');
await blank();
await composer.click();
await page.keyboard.type('what does / mean?');
await page.keyboard.press('Control+a');
await page.waitForTimeout(200);
ok('typing / and ? in the chat opens nothing', (await composer.inputValue()) === 'what does / mean?' && (await page.getByRole('dialog').count()) === 0);
ok('Ctrl+A in the chat selects the text, not the canvas', !(await enabled('Edit', 'Copy')));

console.log(failed ? `${failed} failed` : 'all green');
await browser.close();
process.exit(failed ? 1 : 0);
