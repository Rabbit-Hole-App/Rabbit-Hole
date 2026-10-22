// Release B lane B3 (C:/s/spec/rel-b.md B3 and B5; owner decisions 4A, 5A and A4, 2026-10-16), against the LOCAL stack only:
// the one source finder from Chat (/youtube, /arxiv, /wikipedia with a query searches at once, empty waits), a result
// previews on click and only Add to canvas adds it, Cancel gives the Chat draft back, the Insert menu's three entries open
// the same finder (Enter on an answered query only previews: lead ruling 2026-10-16), the top-bar Search control is gone, and "/" outside editable fields opens and focuses the right panel's
// canvas Find (which still finds), while inside Chat, Ctrl+K and the BlockNote document "/" is typed as before.
// Search answers come from a route in this check: no Exa call, no model call, nothing sent to the Tutor.
// usage: BASE=http://127.0.0.1:<app> SMALL_CP=http://127.0.0.1:<cp> TEST_BYPASS_SECRET=<that stack's> node e2e/source-finder-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || '';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('source-finder-check runs against a local stack only: set BASE');
const CP = process.env.SMALL_CP, secret = process.env.TEST_BYPASS_SECRET;
if (!CP || !secret) throw Error('set SMALL_CP and TEST_BYPASS_SECRET for the local stack');
const OUT = process.argv[2] || 'source-finder-shots';
mkdirSync(OUT, { recursive: true });
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `source-finder-${Date.now().toString(36)}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();
// The canvas: one card (Find and Ctrl+K have something to work on) and a short BlockNote document.
const canvasName = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'Source finder check' }) })).name;
const boardPath = `/api/learn/boards/${canvasName}/main`, now = await api(boardPath);
const run1 = text => [{ type: 'text', text, styles: {} }];
const saved = await api(boardPath, { method: 'PUT', body: JSON.stringify({ version: now.exists === false ? 0 : now.version ?? 0, state: {
  strokes: [], shapes: [], items: [], links: [], groups: [], areas: [],
  blocks: [{ id: 'c1', type: 'explanation', dx: 0, dy: 0, title: 'Softmax', body: 'Softmax turns scores into probabilities.' }],
  doc: { v: 1, x: 1000, y: 40, w: 760, blocks: [{ id: 'd1', type: 'paragraph', content: run1('Notes on attention'), children: [] }] },
} }) });
if (!saved.version) throw Error(`the seed board was not saved: ${JSON.stringify(saved).slice(0, 200)}`);

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const searches = [], tutor = [];
await context.route('**/api/learn/search?**', route => {
  const url = new URL(route.request().url());
  const source = url.searchParams.get('source'), q = url.searchParams.get('q');
  searches.push(`${source}:${q}`);
  const results = source === 'youtube'
    ? [{ key: 'yt1', title: 'Attention in transformers, visually', subtitle: 'A channel', why: 'Draws attention step by step.', item: { videoId: 'eMlx5fFNoYc', title: 'Attention in transformers, visually' } }]
    : source === 'wikipedia'
      ? [{ key: 'Backpropagation', title: 'Backpropagation', subtitle: 'Wikipedia', why: 'The algorithm itself.', item: { title: 'Backpropagation' } }]
      : [{ key: 'ax1', title: 'Attention Is All You Need', subtitle: 'Vaswani et al.', exact: true, why: 'The paper itself.', item: { id: '1706.03762', title: 'Attention Is All You Need' } }];
  return route.fulfill({ json: { results } });
});
await context.route('**/api/learn/wiki?**', route => route.fulfill({ json: { title: 'Backpropagation', displayTitle: 'Backpropagation', html: '<section><p>Backpropagation computes gradients.</p></section>', toc: [], licence: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' } } }));
await context.route('**youtube-nocookie.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>player</body></html>' }));
await context.route(/\/api\/learn\/(tutor\/plan|ask|artifact|selection|inline\/(generate|route))(\?|$)/, route => { tutor.push(new URL(route.request().url()).pathname); return route.fulfill({ status: 500, json: { error: 'not in this check' } }); });
await context.route('**/main/thumbnail', route => (route.request().method() === 'PUT' ? route.fulfill({ status: 204 }) : route.continue()));
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
await page.goto(`${BASE}/apps/${canvasName}`);
await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
const dock = page.locator('[data-chat-pane]');
const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
await composer().waitFor({ timeout: 30000 });
const pill = dock.locator('[data-command-pill]');
const finder = page.getByRole('dialog', { name: 'Search' });
const addButton = finder.getByRole('button', { name: 'Add to canvas' });
const menubar = page.getByRole('menubar', { name: 'Canvas menu' });
const iframes = () => page.locator('[aria-label="Lesson canvas"] iframe[src*="youtube-nocookie.com"]').count();
const findFocused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Find text on canvas');
const blank = async () => { await page.keyboard.press('Escape'); await page.mouse.click(260, 820); await page.evaluate(() => document.activeElement?.blur?.()); };

// 1. The top-bar Search control is gone.
ok('no top-bar Search control', await page.getByRole('button', { name: 'Search YouTube, arXiv and Wikipedia' }).count() === 0
  && await page.locator('button[title$="(/)"]').count() === 0);
await page.screenshot({ path: `${OUT}/01-top-bar.png` });

// 2. Chat: /youtube <query> searches at once; a click previews; Add to canvas adds; the command line clears.
await composer().click();
await composer().fill('/youtube ');
await pill.waitFor();
await composer().fill('attention');
await composer().press('Enter');
await finder.waitFor({ timeout: 10000 });
await finder.getByText('Attention in transformers, visually').waitFor({ timeout: 10000 });
ok('/youtube <query>: the finder opens on YouTube and searches at once', await finder.getByLabel('Search in').inputValue() === 'youtube' && searches.at(-1) === 'youtube:attention', searches.join(' '));
await finder.getByText('Attention in transformers, visually').click();
ok('a click previews the result and adds nothing', await finder.count() === 1 && await iframes() === 0 && await finder.locator('[role="option"][aria-selected="true"]').count() === 1);
await finder.getByRole('textbox').press('Enter');
// An add would close the finder in the same render as the key: two frames later it would be gone.
await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
ok('Enter on the answered query only previews: the finder stays and nothing is added', await finder.count() === 1 && await iframes() === 0 && searches.at(-1) === 'youtube:attention' && searches.filter(s => s === 'youtube:attention').length === 1);
await page.screenshot({ path: `${OUT}/02-youtube-preview.png` });
await addButton.click();
await finder.waitFor({ state: 'detached' });
await page.waitForFunction(() => document.querySelectorAll('[aria-label="Lesson canvas"] iframe[src*="youtube-nocookie.com"]').length === 1, null, { timeout: 10000 }).catch(() => {});
ok('Add to canvas puts the video card on this canvas and clears the command line', await iframes() === 1 && await pill.count() === 0 && await composer().inputValue() === '');

// 3. Chat: /arxiv with an empty query waits for input; Cancel gives the draft back, focused.
const before = searches.length;
await composer().fill('/arxiv ');
await pill.waitFor();
await composer().press('Enter');
await finder.waitFor({ timeout: 10000 });
ok('/arxiv with no query: the finder opens on arXiv, empty, and waits', await finder.getByLabel('Search in').inputValue() === 'arxiv' && await finder.getByRole('textbox').inputValue() === '' && searches.length === before);
await finder.getByRole('textbox').fill('1706.03762');
await finder.getByRole('textbox').press('Enter');
await finder.getByText('Attention Is All You Need').waitFor({ timeout: 10000 });
ok('typing an arXiv ID and Enter searches it, previewed as an exact match', searches.at(-1) === 'arxiv:1706.03762' && await finder.getByText('Exact match').count() === 1);
await page.screenshot({ path: `${OUT}/03-arxiv-preview.png` });
await finder.getByRole('button', { name: 'Close search' }).click();
await finder.waitFor({ state: 'detached' });
await page.waitForFunction(() => document.activeElement?.closest?.('[data-chat-composer]'), null, { timeout: 5000 }).catch(() => {});
ok('Cancel adds nothing and gives the Chat draft back, focused', await pill.getAttribute('data-command-pill') === 'arxiv' && await composer().inputValue() === ''
  && await page.locator('[aria-label="Paper reader"]').count() === 0 && await composer().evaluate(node => node === document.activeElement));
await dock.getByRole('button', { name: 'Remove Search arXiv', exact: true }).click();

// 4. Chat: /wikipedia <query>; Escape keeps the typed draft.
await composer().fill('/wikipedia backprop');
await composer().press('Enter');
await finder.getByText('Backpropagation', { exact: true }).first().waitFor({ timeout: 10000 });
ok('/wikipedia <query>: the finder opens on Wikipedia and searches at once', await finder.getByLabel('Search in').inputValue() === 'wikipedia' && searches.at(-1) === 'wikipedia:backprop');
await page.keyboard.press('Escape');
await finder.waitFor({ state: 'detached' });
ok('Escape gives the typed line back', await composer().inputValue() === '/wikipedia backprop');
await composer().fill('');

// 5. Insert: the three entries open the same finder, empty, waiting.
await blank();
await menubar.getByRole('menuitem', { name: /^Insert/ }).click();
const rows = await page.locator('[role="menubar"] [class*="top-9"] button[role="menuitem"]').allInnerTexts();
const at = label => rows.findIndex(text => text.trim() === label);
ok('Insert lists Search YouTube, Search arXiv and Search Wikipedia, in that order', at('Search YouTube') >= 0 && at('Search YouTube') < at('Search arXiv') && at('Search arXiv') < at('Search Wikipedia'), rows.map(text => text.trim()).join(' | '));
await page.screenshot({ path: `${OUT}/04-insert-menu.png` });
await page.getByRole('menuitem', { name: 'Search Wikipedia', exact: true }).click();
await finder.waitFor({ timeout: 10000 });
const quiet = searches.length;
ok('Insert > Search Wikipedia opens the finder on Wikipedia, empty, searching nothing', await finder.getByLabel('Search in').inputValue() === 'wikipedia' && await finder.getByRole('textbox').inputValue() === '' && searches.length === quiet);
await finder.getByRole('textbox').fill('backpropagation');
await finder.getByRole('textbox').press('Enter');
await finder.getByText('The algorithm itself.').waitFor({ timeout: 10000 });
await finder.getByText('The algorithm itself.').click();
ok('a click previews the article and adds nothing', await finder.count() === 1 && await page.locator('[aria-label="Lesson canvas"] [data-block-id]').filter({ hasText: 'Backpropagation computes gradients' }).count() === 0);
await addButton.click();
await finder.waitFor({ state: 'detached' });
await page.locator('[aria-label="Lesson canvas"]').getByText('Backpropagation computes gradients.').first().waitFor({ timeout: 10000 }).catch(() => {});
ok('Add to canvas puts the article card on the canvas', await page.locator('[aria-label="Lesson canvas"]').getByText('Backpropagation computes gradients.').count() >= 1);
for (const [label, source] of [['Search YouTube', 'youtube'], ['Search arXiv', 'arxiv']]) {
  await menubar.getByRole('menuitem', { name: /^Insert/ }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await finder.waitFor({ timeout: 10000 });
  ok(`Insert > ${label.slice(0, -1)} opens the same finder on ${source}`, await finder.getByLabel('Search in').inputValue() === source);
  await page.keyboard.press('Escape');
  await finder.waitFor({ state: 'detached' });
}

// 6. "/" outside editable fields opens the right panel on Find and focuses it; Find still finds.
await page.locator('[data-panel-close]').click();
await page.waitForFunction(() => !document.querySelector('[data-chat-pane]')?.offsetWidth, null, { timeout: 5000 }).catch(() => {});
await blank();
await page.keyboard.press('/');
await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Find text on canvas', null, { timeout: 5000 }).catch(() => {});
ok('"/" with the right panel hidden opens it on Find, focused', await findFocused() && await page.locator('[data-panel-tab="find"][aria-selected="true"]').count() === 1 && await finder.count() === 0);
await page.keyboard.type('softmax');
// Search owner brief: object results, including browsable results for an empty query.
await page.waitForFunction(() => document.querySelector('[data-find-count]')?.textContent === '1 result', null, { timeout: 5000 });
ok('Find still finds as you type', (await page.locator('[data-find-count]').innerText()) === '1 result', await page.locator('[data-find-count]').innerText());
await page.screenshot({ path: `${OUT}/05-slash-find.png` });
await page.keyboard.press('Escape');
await page.locator('[data-panel-tab="chat"]').click();
await blank();
await page.keyboard.press('/');
await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Find text on canvas', null, { timeout: 5000 }).catch(() => {});
ok('"/" with the panel open on Chat switches it to Find, focused', await findFocused() && await page.locator('[data-panel-tab="find"][aria-selected="true"]').count() === 1);
await page.locator('[data-panel-tab="chat"]').click();

// 7. Inside Chat "/" is typed and opens the picker, as before.
await composer().click();
await page.keyboard.type('/');
ok('inside Chat "/" is typed and opens the command picker', await composer().inputValue() === '/' && await dock.locator('[data-slash-picker]').count() === 1 && !(await findFocused()) && await page.locator('[data-panel-tab="chat"][aria-selected="true"]').count() === 1);
await page.keyboard.press('Escape');
await composer().fill('');

// 8. Inside Ctrl+K "/" stays in the editor.
// The card is selected and framed through Find (the added cards may have pushed it out of view), then the field lets go.
await blank();
await page.keyboard.press('/');
await page.keyboard.type('softmax');
await page.waitForFunction(() => document.querySelector('[data-find-count]')?.textContent === '1 result', null, { timeout: 5000 });
await page.keyboard.press('Enter');
await page.locator('[data-panel-tab="chat"]').click();
await page.evaluate(() => document.activeElement?.blur?.());
await page.keyboard.press('Control+k');
const quick = page.locator('[data-inline-ai]');
await quick.waitFor({ timeout: 10000 }).catch(() => {});
if (await quick.count()) {
  await page.waitForFunction(() => document.activeElement?.closest?.('[data-inline-ai]'), null, { timeout: 5000 }).catch(() => {});
  await page.keyboard.type('/');
  const where = await page.evaluate(() => `${document.activeElement?.tagName}${document.activeElement?.closest?.('[data-inline-ai]') ? ' in Ctrl+K' : ''}`);
  ok('inside Ctrl+K "/" stays in the editor, never moving to Find', where.endsWith('in Ctrl+K') && !(await findFocused()) && await page.locator('[data-panel-tab="find"][aria-selected="true"]').count() === 0, where);
  // Ctrl+K's /youtube goes through LearnPage's binding to the same finder (Release B integration of lanes B2 and B3).
  await page.keyboard.type('youtube attention');
  await page.keyboard.press('Enter');
  await finder.waitFor({ timeout: 10000 }).catch(() => {});
  ok('Ctrl+K /youtube <query> opens the same finder on YouTube and searches at once', await finder.count() === 1 && await finder.getByLabel('Search in').inputValue() === 'youtube' && searches.at(-1) === 'youtube:attention', searches.join(' '));
  await page.screenshot({ path: `${OUT}/05b-ctrlk-youtube.png` });
  await finder.getByRole('button', { name: 'Close search' }).click();
  await finder.waitFor({ state: 'detached' });
  ok('closing that finder leaves Ctrl+K open with nothing added', await quick.count() === 1 && await iframes() === 1);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
} else ok('Ctrl+K opens on the selected card', false);

// 9. Inside the BlockNote document "/" stays in the document.
await blank();
const viewMenu = menubar.getByRole('menuitem', { name: 'View', exact: true });
const viewChoice = menubar.locator('select').filter({ has: page.locator('option', { hasText: /^Editor$/ }) });
await viewMenu.click();
await viewChoice.selectOption({ label: 'Editor' });
await page.locator('[data-canvas-doc][data-doc-state="ready"]').waitFor({ timeout: 20000 }).catch(() => {});
const doc = page.locator('[data-canvas-doc-editor] .bn-editor');
await doc.getByText('Notes on attention').click();
await page.keyboard.press('End');
await page.keyboard.type('/');
const inDoc = await page.evaluate(() => `${document.activeElement?.tagName}.${String(document.activeElement?.className || '').slice(0, 40)}${document.activeElement?.closest?.('.bn-editor') ? ' in BlockNote' : ''}`);
ok('inside the BlockNote document "/" stays in the document, never moving to Find', inDoc.endsWith('in BlockNote') && !(await findFocused()) && await page.locator('[data-panel-tab="find"][aria-selected="true"]').count() === 0, inDoc);
await page.screenshot({ path: `${OUT}/06-blocknote-slash.png` });
await page.keyboard.press('Escape');

ok('no source command or finder reached the Tutor or a model', tutor.length === 0, tutor.join(' '));
ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
