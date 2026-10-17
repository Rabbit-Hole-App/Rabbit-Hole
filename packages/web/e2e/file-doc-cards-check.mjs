import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';

// Browser check for file imports lane 2 (docs/features/canvas-file-imports.md): text, Markdown, CSV/TSV, workbook, Word and
// presentation cards rendered by the real AdaptiveCanvas in e2e/canvas-editing-harness.html under Vite dev - no server, no
// model, nothing leaves the machine. Each card's original sits in this browser's asset cache (IndexedDB small-learn-assets),
// exactly where a drop puts it; the board holds only the card. Real files from test/fixtures/file-imports; the large ones
// (big.csv, big.xlsx, big.txt) from FIXTURES (C:/s/fi-fixtures/lane2) when present, for the bounded-view and timing steps.
// usage: start `npx vite --port 5393 --strictPort --host 127.0.0.1` in packages/web, then
//        node e2e/file-doc-cards-check.mjs [screenshot dir]
const BASE = process.env.HARNESS || 'http://127.0.0.1:5393/e2e/canvas-editing-harness.html';
const SHOTS = process.argv[2] || null;
const BIG = process.env.FIXTURES || 'C:/s/fi-fixtures/lane2';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const small = name => readFileSync(new URL(`../test/fixtures/file-imports/${name}`, import.meta.url));
const TYPES = { csv: 'text/csv', tsv: 'text/tab-separated-values', txt: 'text/plain', md: 'text/markdown', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

const results = [];
const total = 16;
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const errors = [];
const timings = {};

const card = (id, kind, format, label, extra = {}) => ({ id, type: 'file', kind, format, label, assetKey: `import:${id}`, size: 1, dx: 0, dy: 0, ...extra });
async function open(name, files, blocks, viewport = { width: 1500, height: 1000 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(180000); // Vite dev optimizes dependencies on the first load
  let workers = 0;
  page.on('worker', () => { workers++; });
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|favicon/.test(message.text())) errors.push(`${name}: ${message.text()}`); });
  await page.goto(`${BASE}?board=${name}`);
  await page.evaluate(async ([key, board, assets]) => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('small-learn-assets', 1); r.onupgradeneeded = () => r.result.createObjectStore('assets'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    for (const { key: assetKey, b64, type, name: fileName } of assets) {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      await new Promise((resolve, reject) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').put(new File([bytes], fileName, { type }), assetKey); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    }
    localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks: board }));
  }, [`harness:${name}`, blocks, files.map(({ key, bytes, name: fileName }) => ({ key, b64: bytes.toString('base64'), type: TYPES[fileName.split('.').pop()] || '', name: fileName }))]);
  const started = Date.now();
  await page.reload();
  await page.locator('[data-canvas-surface]').waitFor();
  const ready = async (selector, timeout = 30000) => { await page.locator(`${selector}`).first().waitFor({ timeout }); return Date.now() - started; };
  const saved = async () => { await page.waitForTimeout(600); return page.evaluate(key => localStorage.getItem(key) || '', `harness:${name}`); };
  return { page, context, ready, saved, workers: () => workers };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const byId = (page, id) => page.locator(`[data-block-id="${id}"]`);

// 1-2 Text and Markdown
{
  const { page, context, ready, saved } = await open('fi-text', [{ key: 'import:t1', bytes: small('notes.txt'), name: 'notes.txt' }, { key: 'import:m1', bytes: small('readme.md'), name: 'readme.md' }, { key: 'import:u1', bytes: small('utf16le.txt'), name: 'utf16le.txt' }, { key: 'import:b1', bytes: small('binary.txt'), name: 'binary.txt' }],
    [card('t1', 'text', 'txt', 'notes.txt'), card('m1', 'markdown', 'md', 'readme.md'), card('u1', 'text', 'txt', 'utf16le.txt'), card('b1', 'text', 'txt', 'binary.txt')]);
  await ready('[data-file-doc-text]');
  await page.waitForTimeout(500);
  const text = await byId(page, 't1').locator('[data-file-doc-text]').innerText();
  const utf16 = await byId(page, 'u1').locator('[data-file-doc-text]').innerText();
  const meta = await byId(page, 't1').locator('[data-file-doc-meta]').innerText();
  const binary = await byId(page, 'b1').locator('[data-file-doc-error]').innerText().catch(() => '');
  check('1 a text card shows the file as written (CRLF, tab), its encoding and line ends; UTF-16 decodes by its BOM; a binary .txt says why it is not shown',
    text.includes('Plain notes') && text.includes('and a tab') && /UTF-8/.test(meta) && /MIXED line ends/.test(meta) && utf16.includes('UTF-16 text Zoë') && /looks like a binary file/.test(binary), `${meta} | ${binary}`);
  const md = byId(page, 'm1');
  const heading = await md.locator('h1, h2, h3').first().innerText().catch(() => '');
  const anchors = await md.locator('a').evaluateAll(list => list.map(a => a.getAttribute('href')));
  const code = await md.locator('pre, code').count();
  const katex = await md.locator('.katex').count();
  const images = await md.locator('[data-file-doc-images]').count();
  check('2 a Markdown card renders headings, code and math; only the https link is a link; its linked image is said to be not shown',
    heading === 'Title' && anchors.length === 1 && anchors[0] === 'https://example.com' && code > 0 && katex > 0 && images === 1, `heading=${heading} anchors=${JSON.stringify(anchors)} code=${code} katex=${katex}`);
  await shot(page, '1-text-markdown');
  const board = await saved();
  check('3 the board holds the cards, not the text', board.length < 2000 && !board.includes('Plain notes') && !board.includes('UTF-16 text'), `${board.length} chars`);
  await context.close();
}

// 4-5 CSV / TSV, and the bounded view of a 200,000-row CSV
{
  const files = [{ key: 'import:c1', bytes: small('quoted.csv'), name: 'quoted.csv' }, { key: 'import:c2', bytes: small('semicolon.csv'), name: 'semicolon.csv' }, { key: 'import:c3', bytes: small('latin1.csv'), name: 'latin1.csv' }];
  const blocks = [card('c1', 'table', 'csv', 'quoted.csv'), card('c2', 'table', 'csv', 'semicolon.csv'), card('c3', 'table', 'csv', 'latin1.csv')];
  const big = existsSync(`${BIG}/big.csv`);
  if (big) { files.push({ key: 'import:c4', bytes: readFileSync(`${BIG}/big.csv`), name: 'big.csv' }); blocks.push(card('c4', 'table', 'csv', 'big.csv', { dx: 700, dy: -900 })); }
  const { page, context, ready, saved, workers } = await open('fi-table', files, blocks);
  await ready('[data-block-id="c1"] [data-file-doc-table]');
  const q = byId(page, 'c1');
  const header = await q.locator('[data-file-doc-header] [role="columnheader"]').allInnerTexts();
  const cells = await q.locator('[role="gridcell"]').allInnerTexts();
  const meta = await q.locator('[data-file-doc-meta]').innerText();
  const semi = await byId(page, 'c2').locator('[role="gridcell"]').allInnerTexts();
  check('4 a CSV card: header row, quoted commas and doubled quotes, embedded line break, empty value, leading zeros kept; delimiter detected (semicolon file)',
    JSON.stringify(header) === JSON.stringify(['id', 'name', 'note', 'amount']) && cells.includes('00123') && cells.includes('Smith, Jane') && cells.includes('she said "hi"') && cells.some(c => /line one\s+line two/.test(c)) && /3 rows × 4 columns/.test(meta)
    && semi.includes('2,5') && await byId(page, 'c2').locator('[data-file-doc-delimiter]').inputValue() === ';', `${meta} ${JSON.stringify(header)}`);
  const latinError = await byId(page, 'c3').locator('[data-file-doc-error]').innerText();
  await byId(page, 'c3').locator('[data-file-doc-encoding]').selectOption('windows-1252');
  await byId(page, 'c3').locator('[role="gridcell"]').first().waitFor();
  const latin = await byId(page, 'c3').locator('[role="gridcell"]').allInnerTexts();
  check('5 an undecodable CSV says so and offers its encoding; Windows-1252 then reads it, and the choice is kept on the card', /not valid UTF-8/.test(latinError) && latin.includes('José') && latin.includes('München') && (await saved()).includes('"encoding":"windows-1252"'));
  if (big) {
    timings.bigCsv = await ready('[data-block-id="c4"] [data-file-doc-bound]', 60000);
    const c4 = byId(page, 'c4');
    const domCells = await c4.locator('[role="gridcell"]').count();
    const bound = await c4.locator('[data-file-doc-bound]').innerText();
    await c4.locator('[data-file-doc-table]').evaluate(node => { node.scrollTop = node.scrollHeight; });
    await page.waitForTimeout(300);
    const last = await c4.locator('[role="gridcell"]').allInnerTexts();
    check('6 a 200,000-row CSV shows a bounded, virtualized preview: few cells in the DOM, the bound said, the last previewed rows reachable by scrolling',
      domCells < 1500 && /Showing 9,999 of 200,000 rows/.test(bound) && last.includes('0009998'), `${domCells} cells, ${bound}, ready in ${timings.bigCsv} ms`);
  } else check('6 big.csv fixture missing', false);
  check('7 parsing ran in a worker', workers() >= 1, `${workers()} worker(s)`);
  await shot(page, '2-tables');
  const board = await saved();
  check('8 the board holds no rows', board.length < 3000 && !board.includes('Smith, Jane') && !board.includes('0009998'), `${board.length} chars`);
  await context.close();
}

// 9 Workbooks (.xlsx and .xls)
{
  const files = [{ key: 'import:w1', bytes: small('workbook.xlsx'), name: 'workbook.xlsx' }, { key: 'import:w2', bytes: small('workbook.xls'), name: 'workbook.xls' }];
  const blocks = [card('w1', 'workbook', 'xlsx', 'workbook.xlsx'), card('w2', 'workbook', 'xls', 'workbook.xls', { sheets: ['Q1', 'Empty'] })];
  const bigBook = existsSync(`${BIG}/big.xlsx`);
  if (bigBook) { files.push({ key: 'import:w3', bytes: readFileSync(`${BIG}/big.xlsx`), name: 'big.xlsx' }); blocks.push(card('w3', 'workbook', 'xlsx', 'big.xlsx', { dx: 760, dy: -980 })); }
  const { page, context, ready, saved } = await open('fi-book', files, blocks);
  await ready('[data-block-id="w1"] [data-file-doc-table]');
  const w1 = byId(page, 'w1');
  const tabs = await w1.locator('[data-file-doc-sheets] [role="tab"]').allInnerTexts();
  const cells = await w1.locator('[role="gridcell"]').allInnerTexts();
  await w1.locator('[data-cell="1:3"]').click();
  const formula = await w1.locator('[data-file-doc-cell]').innerText();
  await w1.locator('[data-sheet="Empty"]').click();
  const empty = await w1.locator('[data-file-doc-empty]').innerText();
  await ready('[data-block-id="w2"] [data-file-doc-table]');
  const xlsTabs = await byId(page, 'w2').locator('[data-file-doc-sheets] [role="tab"]').allInnerTexts();
  const xlsCells = await byId(page, 'w2').locator('[role="gridcell"]').allInnerTexts();
  const ok = JSON.stringify(tabs.map(t => t.trim())) === JSON.stringify(['Q1', 'Notes', 'Empty']) && cells.includes('00123') && cells.includes('Zoë') && cells.includes('ƒ25') && cells.includes('ƒ2026-10-16')
    && /Q1!D2 · Formula =C2\*2 · cached value 25/.test(formula) && /This sheet is empty/.test(empty) && (await saved()).includes('"sheet":"Empty"')
    && JSON.stringify(xlsTabs.map(t => t.trim())) === JSON.stringify(['Q1', 'Empty']) && xlsCells.includes('07890');
  check('9 workbook cards (.xlsx and .xls): sheet tabs, leading zeros, Unicode, formula cells marked; a cell says its formula and cached value; the chosen sheet is kept; a card shows only its chosen sheets', ok, formula);
  await w1.locator('[data-sheet="Q1"]').click();
  if (bigBook) {
    timings.bigXlsx = await ready('[data-block-id="w3"] [data-file-doc-bound]', 60000);
    const bound = await byId(page, 'w3').locator('[data-file-doc-bound]').innerText();
    check('10 a 20,001-row workbook previews 10,000 rows and says so', /Showing 10,000 of 20,001 rows/.test(bound), `${bound}; ready in ${timings.bigXlsx} ms`);
  } else check('10 big.xlsx fixture missing', false);
  await shot(page, '3-workbooks');
  await context.close();
}

// 11-12 Word and PowerPoint
{
  const { page, context, ready, saved } = await open('fi-office', [{ key: 'import:d1', bytes: small('document.docx'), name: 'document.docx' }, { key: 'import:p1', bytes: small('deck.pptx'), name: 'deck.pptx' }],
    [card('d1', 'document', 'docx', 'document.docx'), card('p1', 'presentation', 'pptx', 'deck.pptx', { dx: 700, dy: -600 })]);
  await ready('[data-block-id="d1"] [data-file-doc-document] h1');
  const d1 = byId(page, 'd1');
  const h1 = await d1.locator('[data-file-doc-document] h1').innerText();
  const tableCells = await d1.locator('[data-file-doc-document] td').allInnerTexts();
  const img = await d1.locator('[data-file-doc-document] img').getAttribute('src');
  const link = await d1.locator('[data-file-doc-document] a').evaluate(a => [a.getAttribute('href'), a.getAttribute('rel'), a.getAttribute('target')]);
  const losses = await d1.locator('[data-file-doc-losses]').innerText();
  const scripts = await d1.locator('script, iframe, object, embed').count();
  check('11 a Word card shows headings, the table, the embedded image (from the file, by object URL) and a safe link, and says what the preview leaves out',
    h1 === 'Import fixture heading' && tableCells.map(t => t.trim()).includes('Col B') && /^blob:/.test(img || '') && link[0] === 'https://example.com/' && /noopener/.test(link[1]) && link[2] === '_blank' && /page layout/.test(losses) && scripts === 0, losses);
  await ready('[data-block-id="p1"] [data-file-doc-slide]');
  const p1 = byId(page, 'p1');
  const first = await p1.locator('[data-file-doc-slide]').innerText();
  await p1.locator('[data-file-doc-next]').click();
  const notes = await p1.locator('[data-file-doc-notes]').innerText();
  await p1.locator('[data-file-doc-next]').click(); await p1.locator('[data-file-doc-next]').click();
  const last = await p1.locator('[data-file-doc-slide]').innerText();
  const awaiting = await p1.locator('[data-file-doc-awaiting]').innerText();
  const board = await saved();
  check('12 a presentation card navigates slides by their own numbers, labels speaker notes and hidden slides, keeps the slide, and says slide images await the converter',
    first === 'Slide 1 of 4' && /^Speaker notes: Speaker note for slide 2/.test(notes) && last === 'Slide 4 of 4 (hidden)' && /presentation converter/.test(awaiting) && board.includes('"slide":4') && !board.includes('Body of slide'), `${first} | ${last}`);
  await shot(page, '4-office');
  await context.close();
}

// 13-16 Importing: real drop events on the canvas through useDocImport (e2e/file-import-harness.jsx), as LearnPage sends them.
{
  const IMPORT = BASE.replace('canvas-editing-harness', 'file-import-harness');
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', error => errors.push(`import: ${error.message}`));
  await page.goto(IMPORT);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const surface = page.locator('[data-canvas-surface]');
  await surface.waitFor();
  const drop = async (name, bytes, as = name) => {
    const box = await surface.boundingBox();
    await page.evaluate(([element, fileName, b64, x, y]) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], fileName, { type: '' }));
      const init = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y };
      element.dispatchEvent(new DragEvent('dragover', init));
      element.dispatchEvent(new DragEvent('drop', init));
    }, [await surface.elementHandle(), as, bytes.toString('base64'), box.x + box.width / 2, box.y + box.height / 2]);
    await page.waitForTimeout(800);
  };
  const cards = () => page.locator('[data-file-doc-card]').count();
  const board = async () => { await page.waitForTimeout(600); return JSON.parse(await page.evaluate(() => localStorage.getItem('harness:file-import') || '{}')); };
  await drop('quoted.csv', small('quoted.csv'));
  await drop('document.docx', small('document.docx'));
  const placed = (await board()).blocks || [];
  check('13 a dropped CSV and a dropped .docx each become their card at once, no dialog', await cards() === 2 && placed.map(b => b.kind).join() === 'table,document' && await page.locator('[data-doc-import-dialog]').count() === 0, placed.map(b => `${b.kind}:${b.format}`).join());
  await drop('workbook.xlsx', small('workbook.xlsx'));
  const dialog = page.locator('[data-doc-import-dialog="workbook"]');
  await dialog.locator('[role="dialog"]').waitFor();
  const sheets = await dialog.locator('[data-import-sheet]').evaluateAll(list => list.map(label => label.getAttribute('data-import-sheet')));
  await dialog.locator('[data-import-sheet="Empty"] input').uncheck();
  await dialog.locator('[data-import-choice="sheets"]').click();
  await dialog.getByRole('button', { name: 'Add to canvas' }).click();
  await page.waitForTimeout(800);
  const afterBook = (await board()).blocks || [];
  const perSheet = afterBook.filter(b => b.kind === 'workbook');
  check('14 a workbook asks which sheets and how; A card per sheet makes one card per chosen sheet, sharing one original', JSON.stringify(sheets) === JSON.stringify(['Q1', 'Notes', 'Empty']) && perSheet.length === 2
    && perSheet.map(b => b.sheet).join() === 'Q1,Notes' && new Set(perSheet.map(b => b.assetKey)).size === 1, perSheet.map(b => b.sheet).join());
  await drop('deck.pptx', small('deck.pptx'));
  const deck = page.locator('[data-doc-import-dialog="presentation"]');
  await deck.locator('[role="dialog"]').waitFor();
  await deck.locator('[data-import-choice="slides"]').click();
  await deck.locator('[data-import-from]').fill('3'); await deck.locator('[data-import-to]').fill('2');
  const rangeError = await deck.locator('[data-import-error]').innerText();
  const disabled = await deck.getByRole('button', { name: 'Add to canvas' }).isDisabled();
  await deck.locator('[data-import-from]').fill('2'); await deck.locator('[data-import-to]').fill('3');
  await deck.getByRole('button', { name: 'Add to canvas' }).click();
  await page.waitForTimeout(800);
  const slides = ((await board()).blocks || []).filter(b => b.kind === 'presentation');
  check('15 a presentation offers the whole deck or a validated slide range; slides 2-3 become two cards keeping their own slide numbers', /From must not be after To/.test(rangeError) && disabled && slides.map(b => b.slide).join() === '2,3', slides.map(b => JSON.stringify(b.slides)).join());
  await page.waitForTimeout(500);
  const slideLabels = await page.locator('[data-file-doc-slide]').allInnerTexts();
  await drop('renamed.xlsx', small('document.docx'));
  await drop('fake.pptx', small('quoted.csv'));
  await drop('old.doc', small('document.doc'));
  const toasts = await page.evaluate(() => window.toasts);
  const total2 = await cards();
  check('16 misnamed and fake files are refused with their reason before any parser runs; a .doc says it needs the converter; nothing else is placed',
    toasts.some(t => /renamed\.xlsx is actually a Word document/.test(t)) && toasts.some(t => /fake\.pptx is not a valid PowerPoint presentation/.test(t)) && toasts.some(t => /old\.doc: Word 97-2003 \(\.doc\) previews need the document converter/.test(t))
    && total2 === 6 && slideLabels.join('|') === 'Slide 2 of 4|Slide 3 of 4', `${toasts.join(' / ')} | ${slideLabels.join('|')}`);
  await shot(page, '5-imported');
  await context.close();
}

await browser.close();
if (errors.length) { console.log(`page errors:\n${errors.join('\n')}`); }
console.log(`timings: ${JSON.stringify(timings)}`);
const passed = results.filter(r => r.ok).length;
console.log(`${passed === total && !errors.length ? 'PASS' : 'FAIL'} ${passed}/${total}`);
process.exit(passed === total && !errors.length ? 0 : 1);
