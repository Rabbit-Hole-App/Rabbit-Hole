import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Acceptance for notebook workspaces (docs/features/canvas-notebook.md) on the
// parallel clone: files and folders made in the card's Files drawer, imported
// and read from Python, switched between, restored on reload, and private to
// their card. Real browser Python; no model calls. Prints no secrets.
// usage: node e2e/canvas-notebook-workspace.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `nb-workspace-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'canvas-notebook-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'canvas-notebook-check' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1800, height: 1300 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const board = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), KEY);
const notebooks = async () => ((await board()).blocks || []).filter(block => block.type === 'notebook');
const cardOf = id => page.locator(`[data-block-id="${id}"]`);
const frameOf = notebookId => page.frames().find(frame => frame.url().includes(`workspace=${notebookId}`));
const started = async card => { await card.waitFor({ timeout: 60000 }); await card.getByText('Starting Python…').waitFor({ state: 'detached', timeout: 120000 }); };

await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await page.getByRole('menubar', { name: 'Canvas menu' }).waitFor({ timeout: 60000 });
await page.getByRole('toolbar').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);

// 1. Insert → Notebook
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'Insert' }).click();
await page.getByRole('menuitem', { name: 'Notebook' }).click();
await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').blocks?.some(block => block.type === 'notebook'), KEY, { timeout: 10000 });
const [first] = await notebooks();
const card = cardOf(first.id);
await started(card);
const nb = page.frameLocator(`[data-block-id="${first.id}"] [data-notebook-frame]`);
await shot('ws-files-closed');

// 2. open Files
await card.getByRole('button', { name: 'Files' }).click();
const listing = nb.locator('.jp-DirListing-content');
await listing.waitFor({ timeout: 10000 });
check('Files opens a drawer with the workspace tree', await nb.locator('.jp-DirListing-item', { hasText: 'notebook.ipynb' }).count() === 1);
const item = name => nb.locator('.jp-DirListing-item').filter({ has: nb.locator('.jp-DirListing-itemText', { hasText: new RegExp(`^${name.replace('.', '\\.')}$`) }) });
const rename = async (from, to) => {
  const editor = nb.locator('input.jp-DirListing-editor');
  if (!(await editor.isVisible().catch(() => false))) {
    await item(from).click({ button: 'right' });
    await nb.locator('.lm-Menu-item', { hasText: /^Rename/ }).first().click();
  }
  await editor.fill(to);
  await editor.press('Enter');
  const accept = nb.locator('.jp-Dialog .jp-mod-accept');
  if (await accept.waitFor({ timeout: 1500 }).then(() => true, () => false)) await accept.click();
  await item(to).waitFor({ timeout: 10000 });
};
const toolbar = title => nb.locator(`.jp-FileBrowser-toolbar [title="${title}"]`).first();
// Opens a file from the drawer and waits until Jupyter shows it.
const openFile = async name => {
  await item(name).click();
  await frameOf(first.notebook_id).waitForFunction(path => window.jupyterapp.shell.currentWidget?.context?.path?.endsWith(path), name, { timeout: 15000 });
  await page.waitForTimeout(400);
};
const typeInEditor = async text => {
  const editor = nb.locator('.jp-FileEditor .cm-content:visible').first();
  await editor.waitFor({ timeout: 10000 });
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(text);
  await page.waitForTimeout(900); // the bridge saves 400 ms after an edit
};

// 3-4. experiment.ipynb, helper.py, config.json
await toolbar('New notebook').click();
await item('Untitled.ipynb').waitFor({ timeout: 10000 });
await rename('Untitled.ipynb', 'experiment.ipynb');
await toolbar('New file').click();
await page.waitForTimeout(800);
await rename('untitled.py', 'helper.py');
await openFile('helper.py');
await typeInEditor('def triple(x):\n    return 3 * x\n');
await toolbar('New file').click();
await page.waitForTimeout(800);
await rename('untitled.py', 'config.json');
await openFile('config.json');
await typeInEditor('{"threshold": 7}\n');
check('the new files are in the tree', (await Promise.all(['experiment.ipynb', 'helper.py', 'config.json'].map(name => item(name).count()))).every(count => count === 1));

// 5-6. import helper.py and read config.json from experiment.ipynb
await openFile('experiment.ipynb');
const cell = nb.locator('.jp-NotebookPanel:visible .jp-Cell .cm-content').first();
await cell.waitFor({ timeout: 15000 });
await cell.click();
await page.keyboard.insertText('from helper import triple\nimport json\ntriple(json.load(open("config.json"))["threshold"])');
await page.keyboard.press('Shift+Enter');
const out21 = nb.locator('.jp-NotebookPanel:visible .jp-OutputArea-output').filter({ hasText: /^\s*21\s*$/ });
await out21.waitFor({ timeout: 180000 }).catch(() => {});
check('experiment.ipynb imports helper.py and reads config.json', await out21.count() === 1);

// 7. a subfolder with a file in it
await toolbar('New Folder').click();
await page.waitForTimeout(600);
await rename('Untitled Folder', 'data');
await item('data').click();
await nb.locator('.jp-BreadCrumbs', { hasText: 'data' }).waitFor({ timeout: 5000 }).catch(() => {});
await toolbar('New file').click();
await page.waitForTimeout(800);
await rename('untitled.py', 'notes.txt');
await openFile('notes.txt');
await typeInEditor('scores go in here\n');
await nb.locator('.jp-BreadCrumbs-home').first().click();
await item('data').waitFor({ timeout: 5000 });
await shot('ws-files-open');

// 8. switch between files
await openFile('helper.py');
await nb.locator('.jp-FileEditor .cm-content:visible', { hasText: 'def triple' }).waitFor({ timeout: 10000 });
const helperOpen = await nb.locator('.jp-FileEditor .cm-content:visible', { hasText: 'def triple' }).count() === 1;
const runDisabled = await page.waitForFunction(id => document.querySelector(`[data-block-id="${id}"] [data-notebook-header] button:nth-of-type(2)`)?.disabled, first.id, { timeout: 5000 }).then(() => true, () => false);
await page.waitForTimeout(600);
const onHelper = (await notebooks()).find(block => block.id === first.id);
await openFile('experiment.ipynb');
await out21.waitFor({ timeout: 15000 });
const backOnNotebook = await out21.isVisible();
check('switching files opens each one in the card', helperOpen && runDisabled && onHelper.active_path === 'helper.py' && backOnNotebook, JSON.stringify({ helperOpen, runDisabled, active: onHelper.active_path, backOnNotebook }));

// 9. collapse Files and keep working
await card.getByRole('button', { name: 'Files' }).click();
await page.waitForTimeout(500);
const drawerGone = !(await listing.isVisible());
await nb.locator('.jp-NotebookPanel:visible .jp-Cell').last().click();
await page.keyboard.press('Escape');
await page.keyboard.press('b');
await page.keyboard.press('Enter');
await page.keyboard.insertText('triple(2)');
await page.keyboard.press('Shift+Enter');
const out6 = nb.locator('.jp-NotebookPanel:visible .jp-OutputArea-output').filter({ hasText: /^\s*6\s*$/ });
await out6.waitFor({ timeout: 30000 }).catch(() => {});
check('with Files collapsed the notebook keeps working', drawerGone && await out6.count() === 1);
await page.waitForTimeout(1200);

// 10-11. reload: tree, files, active document, cells and outputs return
const before = (await notebooks()).find(block => block.id === first.id);
await page.reload();
await started(card);
const nbAgain = page.frameLocator(`[data-block-id="${first.id}"] [data-notebook-frame]`);
const outAgain = nbAgain.locator('.jp-NotebookPanel:visible .jp-OutputArea-output');
await outAgain.filter({ hasText: /^\s*6\s*$/ }).waitFor({ timeout: 20000 }).catch(() => {});
const after = (await notebooks()).find(block => block.id === first.id);
const expected = ['config.json', 'data/', 'data/notes.txt', 'experiment.ipynb', 'helper.py', 'notebook.ipynb'];
check('the card keeps the manifest', expected.every(path => after.files.includes(path)) && after.active_path === 'experiment.ipynb', JSON.stringify(after.files));
check('reload reopens experiment.ipynb with its cells and outputs', await outAgain.filter({ hasText: /^\s*21\s*$/ }).count() === 1 && await outAgain.filter({ hasText: /^\s*6\s*$/ }).count() === 1);
const reloadedFrame = frameOf(first.notebook_id);
const stored = await reloadedFrame.evaluate(async () => {
  const contents = window.jupyterapp.serviceManager.contents;
  const read = async path => (await contents.get(path, { content: true })).content;
  return { helper: await read('helper.py'), config: await read('config.json'), notes: await read('data/notes.txt') };
});
check('file contents survive the reload', stored.helper.includes('def triple') && stored.config.includes('"threshold": 7') && stored.notes.includes('scores go in here'));
check('the saved copy matches the open notebook', before.ipynb_path === 'experiment.ipynb' && after.ipynb.cells.some(c => (Array.isArray(c.source) ? c.source.join('') : c.source).includes('triple(2)')));

// 12. another notebook card cannot see this workspace
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'Insert' }).click();
await page.getByRole('menuitem', { name: 'Notebook' }).click();
await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').blocks?.filter(block => block.type === 'notebook').length === 2, KEY, { timeout: 10000 });
const second = (await notebooks()).find(block => block.id !== first.id);
await started(cardOf(second.id));
const secondRoot = await frameOf(second.notebook_id).evaluate(async () => (await window.jupyterapp.serviceManager.contents.get('', { content: true })).content.map(entry => entry.path));
check('a second notebook card sees only its own workspace', JSON.stringify(secondRoot) === '["notebook.ipynb"]' && second.notebook_id !== first.notebook_id, JSON.stringify(secondRoot));

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
