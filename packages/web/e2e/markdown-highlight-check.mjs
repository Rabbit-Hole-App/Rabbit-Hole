import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Browser acceptance for saved Markdown highlights and Full content on file cards (docs/features/pdf-excerpts.md "Markdown
// cards"; card-layout.js): the real AdaptiveCanvas and FileDocCard mounted by e2e/canvas-editing-harness.html under Vite dev, as
// the owner's canvas page (?scope=). Stored file cards (fileRef) read their originals from a routed /api/learn/files/<id>, and
// the highlights routes are an in-memory stand-in that checks the key, revision and quote of what the card sends. No model, no
// server; nothing leaves the machine.
// usage: start `npx vite --port 5391 --strictPort --host 127.0.0.1` in packages/web, then node e2e/markdown-highlight-check.mjs
const BASE = process.env.HARNESS || 'http://127.0.0.1:5391/e2e/canvas-editing-harness.html';
const total = 14;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const SENTENCE = 'The loss is the mean squared error.';
// Three identical sentences under different headings, then enough lines to need Show more (a chunk is 64 KiB).
const MD = `# Notes\n\n$$a^2 + b^2 = c^2$$\n\n${SENTENCE}\n\n## Second\n\n${SENTENCE}\n\n## Third\n\n${SENTENCE}\n\n## Filler\n\n${Array.from({ length: 3000 }, (_, i) => `Filler line number ${i}, kept plain.`).join('\n\n')}\n`;
const REV = 'a'.repeat(64), MD_ID = `fs_${'1'.repeat(24)}`, DOCX_ID = `fs_${'2'.repeat(24)}`;
const docx = readFileSync(new URL('../test/fixtures/file-imports/document.docx', import.meta.url));
const stored = (id, kind, format, label) => ({ id: label, type: 'file', kind, format, label, dx: 0, dy: 0, size: 1, fileRef: { v: 1, source: { id, rev: REV }, family: kind, meta: { name: label, title: label }, view: {}, derivatives: {}, job: null, doc: null, status: { preview: 'pending', context: 'none' } } });

const browser = await chromium.launch();
const errors = [];
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
// The highlights the stand-in holds, as a server would: by id, with the key and revision of the PUT.
const store = new Map(), puts = [];
await context.route('**/api/learn/files/**', route => {
  const id = new URL(route.request().url()).pathname.split('/')[4];
  if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  return route.fulfill({ status: 200, contentType: id === MD_ID ? 'text/markdown' : 'application/octet-stream', body: id === MD_ID ? Buffer.from(MD) : docx });
});
await context.route('**/api/learn/pdf-highlights**', async route => {
  const request = route.request(), url = new URL(request.url()), json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const id = decodeURIComponent(url.pathname.split('/')[4] || '');
  if (request.method() === 'GET') return json(200, { sha256: REV, highlights: [...store.values()], changed: 0 });
  if (request.method() === 'DELETE') { store.delete(id); return json(200, { deleted: true }); }
  const body = request.postDataJSON();
  puts.push({ id, key: body.key, sha256: body.sha256, quote: body.quote });
  store.set(id, { id, kind: 'text', page: body.page, rects: body.rects, rotate: 0, view: body.view, quote: body.quote });
  return json(200, { highlight: store.get(id) });
});
await context.route('**/api/**', route => (route.request().url().includes('/api/learn/files/') || route.request().url().includes('/api/learn/pdf-highlights') ? route.fallback() : route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })));

await page.goto(`${BASE}?board=md-hl&scope=canvas-md`);
await page.evaluate(([key, blocks]) => localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks })), ['harness:md-hl', [stored(MD_ID, 'markdown', 'md', 'repeat.md'), { ...stored(DOCX_ID, 'document', 'docx', 'doc.docx'), dx: 700 }]]);
await page.reload();
const card = id => page.locator(`[data-block-id="${id}"]`);
const text = card('repeat.md').locator('[data-file-doc-md]');
await text.first().waitFor({ timeout: 60000 });
await card('doc.docx').locator('[data-file-doc-document] h1').first().waitFor({ timeout: 60000 }).catch(() => {});

// Where the painted highlight sits in the rendered text, from the browser's own highlight registry.
const painted = () => page.evaluate(() => {
  const root = document.querySelector('[data-block-id="repeat.md"] [data-file-doc-md]'), found = [...(CSS.highlights.get('wiki-highlight') || [])].filter(range => root.contains(range.commonAncestorContainer));
  const before = range => { const r = document.createRange(); r.setStart(root, 0); r.setEnd(range.startContainer, range.startOffset); return r.toString().length; };
  return { count: found.length, at: found.map(before), words: found.map(String), text: root.textContent };
});
const occurrence = (all, n) => { let at = -1; for (let i = 0; i <= n; i++) at = all.indexOf(SENTENCE, at + 1); return at; };
const selectSecond = () => page.evaluate(sentence => {
  const root = document.querySelector('[data-block-id="repeat.md"] [data-file-doc-md]'), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.data.includes(sentence) && ++seen === 2) {
    const range = document.createRange(); range.setStart(node, node.data.indexOf(sentence)); range.setEnd(node, node.data.indexOf(sentence) + sentence.length);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); return true;
  }
  return false;
}, SENTENCE);
const toggleFull = async id => { await card(id).locator('[data-drag-zone]').first().click({ button: 'right', position: { x: 30, y: 8 } }); await page.locator('[data-card-layout-toggle]').click(); };
const layout = id => card(id).getAttribute('data-card-layout');
const saved = async () => { await page.waitForTimeout(700); return JSON.parse(await page.evaluate(() => localStorage.getItem('harness:md-hl'))).blocks; };

// 1-3 the highlight is made on the second of three identical sentences
check('1 selecting rendered Markdown offers Highlight, and a plain selection saves nothing', await selectSecond() && await page.locator('[data-file-doc-selection-toolbar] button[aria-label="Highlight"]').waitFor({ timeout: 5000 }).then(() => true, () => false) && puts.length === 0);
await page.locator('[data-file-doc-selection-toolbar] button[aria-label="Highlight"]').click();
await page.waitForFunction(() => CSS.highlights.get('wiki-highlight')?.size > 0, null, { timeout: 5000 });
let now = await painted(), second = occurrence(now.text, 1);
check('2 Highlight saves the quote (exact, prefix, suffix) under file:<id> with the file revision, and paints the SECOND occurrence', puts.length === 1 && puts[0].key === `file:${MD_ID}` && puts[0].sha256 === REV
  && puts[0].quote.exact === SENTENCE && puts[0].quote.prefix.includes('Second') && now.count === 1 && now.at[0] === second && now.at[0] !== occurrence(now.text, 0) && now.at[0] !== occurrence(now.text, 2), JSON.stringify({ at: now.at, second, put: puts[0]?.quote }));
check('3 the Markdown file itself is unchanged: highlights are not written into the card or the board', !JSON.stringify(await saved()).includes('mean squared'));

// 4 reload
await page.reload();
await text.first().waitFor({ timeout: 60000 });
await page.waitForFunction(() => CSS.highlights.get('wiki-highlight')?.size > 0, null, { timeout: 10000 });
now = await painted();
check('4 after a reload the highlight is still on the second occurrence', now.count === 1 && now.at[0] === occurrence(now.text, 1), JSON.stringify(now.at));

// 5 Show more
await card('repeat.md').locator('[data-file-doc-more]').click();
await page.waitForTimeout(300);
const longer = await painted();
check('5 Show more draws more text and the highlight stays on the second occurrence', longer.text.length > now.text.length && longer.count === 1 && longer.at[0] === occurrence(longer.text, 1), `${now.text.length} -> ${longer.text.length}`);

// 6-8 Full content on the Markdown card: persisted, every chunk drawn, highlight on the right occurrence in both modes
await toggleFull('repeat.md');
await page.waitForFunction(() => document.querySelector('[data-block-id="repeat.md"]')?.getAttribute('data-card-layout') === 'full');
await page.waitForTimeout(400);
const full = await painted(), box = await card('repeat.md').boundingBox(), body = await card('repeat.md').locator('[data-file-doc-text]').evaluate(node => ({ client: node.clientHeight, scroll: node.scrollHeight }));
check('6 Full content draws every chunk with no Show more, the card as tall as its text, and the highlight is on the second occurrence', await card('repeat.md').locator('[data-file-doc-more]').count() === 0 && full.text.length >= longer.text.length
  && body.client >= body.scroll - 1 && box.height > 3000 && full.count === 1 && full.at[0] === occurrence(full.text, 1), JSON.stringify({ body, height: box.height, at: full.at }));
check('7 the layout is saved on the block (cardLayout.mode full), and the file reference is untouched', (await saved()).find(b => b.id === 'repeat.md').cardLayout?.mode === 'full' && (await saved()).find(b => b.id === 'repeat.md').fileRef.source.id === MD_ID);
await page.reload();
await text.first().waitFor({ timeout: 60000 });
await page.waitForFunction(() => CSS.highlights.get('wiki-highlight')?.size > 0, null, { timeout: 10000 });
now = await painted();
const reloadedFull = await layout('repeat.md');
await toggleFull('repeat.md');
await page.waitForFunction(() => document.querySelector('[data-block-id="repeat.md"]')?.getAttribute('data-card-layout') === 'scrollable');
await page.waitForTimeout(300);
const scrollable = await painted();
check('8 Full survives a reload, and switching back to scrollable keeps the highlight on the second occurrence', reloadedFull === 'full' && now.count === 1 && now.at[0] === occurrence(now.text, 1) && await layout('repeat.md') === 'scrollable'
  && scrollable.count === 1 && scrollable.at[0] === occurrence(scrollable.text, 1) && (await saved()).find(b => b.id === 'repeat.md').cardLayout?.mode === 'scrollable', JSON.stringify({ reloadedFull, at: scrollable.at }));

// 9 removal uses the webpage card's menu
await page.evaluate(sentence => {
  const root = document.querySelector('[data-block-id="repeat.md"] [data-file-doc-md]'), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.data.includes(sentence) && ++seen === 2) { const at = node.data.indexOf(sentence) + 8, range = document.createRange(); range.setStart(node, at); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); }
}, SENTENCE);
await page.locator('[data-block-id="repeat.md"] [data-file-doc-text]').dispatchEvent('click');
const menu = page.locator('[data-file-doc-highlight-menu]');
await menu.waitFor({ timeout: 5000 });
await menu.getByRole('menuitem', { name: 'Remove highlight' }).click();
await page.waitForFunction(() => !CSS.highlights.get('wiki-highlight')?.size, null, { timeout: 5000 });
check('9 a click on the highlight offers Remove highlight; removing deletes it', store.size === 0 && (await painted()).count === 0);

// 10-11 typeset math: a selection that starts inside it is refused; one that spans past it is kept, on the right text
const selectRange = (from, to) => page.evaluate(([a, b]) => {
  const root = document.querySelector('[data-block-id="repeat.md"] [data-file-doc-md]'), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  const pick = spec => { const node = nodes.find(n => (spec.inKatex ? n.parentElement.closest('.katex') : !n.parentElement.closest('.katex')) && n.data.includes(spec.text)); return [node, node.data.indexOf(spec.text) + (spec.end ? spec.text.length : 0)]; };
  const range = document.createRange(), [sn, so] = pick(a), [en, eo] = pick(b);
  range.setStart(sn, so); range.setEnd(en, eo); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
}, [from, to]);
const before = puts.length;
await selectRange({ inKatex: true, text: 'a' }, { text: SENTENCE, end: true });
await page.waitForTimeout(400);
check('10 a selection that starts inside typeset math is refused: no Highlight, nothing saved', await page.locator('[data-file-doc-selection-toolbar]').count() === 0 && puts.length === before);
await selectRange({ text: 'Notes' }, { text: SENTENCE, end: true });
await page.locator('[data-file-doc-selection-toolbar] button[aria-label="Highlight"]').waitFor({ timeout: 5000 });
await page.locator('[data-file-doc-selection-toolbar] button[aria-label="Highlight"]').click();
await page.waitForFunction(() => CSS.highlights.get('wiki-highlight')?.size > 0, null, { timeout: 5000 });
const spanning = await painted();
await page.reload();
await text.first().waitFor({ timeout: 60000 });
await page.waitForFunction(() => CSS.highlights.get('wiki-highlight')?.size > 0, null, { timeout: 10000 });
await page.waitForTimeout(300);
const again = await painted();
check('11 a selection that spans past the math is saved, and after a reload it is painted from the same place to the same end', spanning.count === 1 && again.count === 1 && spanning.at[0] === again.at[0] && again.words[0] === spanning.words[0] && again.words[0].startsWith('Notes') && again.words[0].endsWith(SENTENCE), JSON.stringify({ a: spanning.at, b: again.at, words: again.words[0]?.slice(0, 30) }));

// 12-14 Full content on a Word document: toggle on, reload, toggle off
await toggleFull('doc.docx');
await page.waitForFunction(() => document.querySelector('[data-block-id="doc.docx"]')?.getAttribute('data-card-layout') === 'full');
await page.waitForTimeout(400);
const docBody = await card('doc.docx').locator('[data-file-doc-document]').evaluate(node => ({ client: node.clientHeight, scroll: node.scrollHeight }));
check('12 Full content on a .docx card: no Show more, the card as tall as its text, cardLayout saved', await card('doc.docx').locator('button:has-text("Show more")').count() === 0 && docBody.client >= docBody.scroll - 1
  && (await saved()).find(b => b.id === 'doc.docx').cardLayout?.mode === 'full', JSON.stringify(docBody));
await page.reload();
await card('doc.docx').locator('[data-file-doc-document]').waitFor({ timeout: 60000 });
check('13 the .docx card is still Full after a reload', await layout('doc.docx') === 'full');
await toggleFull('doc.docx');
await page.waitForFunction(() => document.querySelector('[data-block-id="doc.docx"]')?.getAttribute('data-card-layout') === 'scrollable');
check('14 and back to scrollable, saved', (await saved()).find(b => b.id === 'doc.docx').cardLayout?.mode === 'scrollable' && errors.length === 0, errors.join(' | '));

await browser.close();
const passed = results.filter(r => r.ok).length;
console.log(`${passed}/${total} checks passed`);
if (passed !== total || results.length !== total) process.exit(1);
