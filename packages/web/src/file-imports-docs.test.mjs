// File imports lane 2 (docs/features/canvas-file-imports.md): text, tables, workbooks, Word documents and presentations,
// against real files. The Office fixtures in test/fixtures/file-imports were saved by Microsoft Excel, Word and PowerPoint
// (Microsoft 365, 2026-10-16, through COM automation): workbook.xlsx/.xls (three sheets, text IDs with leading zeros,
// formulas, a date, Unicode, an empty sheet), document.docx/.doc (headings, bold/italic, a list, a table, a link, a PNG),
// deck.pptx (four slides, notes on slide 2, slide 4 hidden).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { decodeText, isNotebookJson, looksBinary, newlineOf, textChunks, textExcerpt } from './file-text.js';
import { columnName, detectDelimiter, parseDelimited, quoteSheet, tableExcerpt } from './file-table.js';
import { cellText, describeCell, readWorkbook } from './file-workbook.js';
import { officeKind, paragraphsOf, readPresentation, slidesExcerpt, unescapeXml } from './file-office.js';
import { htmlTree, readDocx, treeText } from './file-docx.js';
import { checkDocFile, docBlock, docBlocks, docKind, slideRange, textBlock } from './file-doc-import.js';
import { describeFileCard, setFileExcerpt } from './file-excerpts.js';
import { idempotencyKey, jobRequest, jobView } from './file-job.js';
import { parseFile } from './file-parse-core.js';
import { assetKeysOf } from './learn-board-assets.js';
import { describeCanvasObject } from './learn-ask-target.js';
import { codeLanguage } from './code-language.js';

const fixture = name => new Uint8Array(readFileSync(new URL(`../test/fixtures/file-imports/${name}`, import.meta.url)));

test('text: UTF-8 with or without a BOM, UTF-16 by its BOM, line ends said; binary and undecodable bytes refused', () => {
  const notes = decodeText(fixture('notes.txt'), { name: 'notes.txt' });
  assert.equal(notes.encoding, 'utf-8');
  assert.equal(notes.newline, 'mixed', 'CRLF lines and a final LF line');
  assert.equal(notes.text, 'Plain notes\r\nwith CRLF\r\nand a tab\there\n', 'the text is kept exactly');
  assert.deepEqual(decodeText(fixture('utf16le.txt')), { text: 'UTF-16 text Zoë\n', encoding: 'utf-16le', bom: true, newline: 'lf' });
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69])).text, 'hi', 'a UTF-8 BOM is not part of the text');
  assert.throws(() => decodeText(fixture('binary.txt'), { name: 'binary.txt' }), /binary\.txt looks like a binary file, not text/);
  assert.equal(looksBinary(fixture('binary.txt')), true);
  const latin = (() => { try { decodeText(fixture('latin1.csv'), { name: 'latin1.csv' }); return null; } catch (error) { return error; } })();
  assert.equal(latin?.code, 'encoding', 'Latin-1 bytes are not silently mangled as UTF-8');
  assert.equal(decodeText(fixture('latin1.csv'), { encoding: 'windows-1252' }).text, 'name,city\nJosé,München\n', 'the encoding choice decodes it');
  assert.equal(newlineOf('a\rb\r'), 'cr');
});

test('text: bounded chunks cut at line ends, and the excerpt says how much it covers', () => {
  const text = 'line\n'.repeat(100000); // 500,000 characters
  const view = textChunks(text, 200000, 65536);
  assert.equal(view.truncated, true);
  assert.equal(view.total, 500000);
  assert.ok(view.chunks.every(chunk => chunk.endsWith('\n')), 'each chunk ends at a line end');
  assert.equal(view.chunks.join('').length, view.shown);
  assert.ok(view.shown <= 200000);
  assert.deepEqual(textExcerpt('short'), { text: 'short', coverage: 'extracted', note: '' });
  assert.equal(textExcerpt(text, 100).coverage, 'partial');
  assert.match(textExcerpt(text, 100).note, /first 100 of 500,000 characters/);
});

test('a JSON file is a notebook only by its structure', () => {
  assert.equal(isNotebookJson(new TextDecoder().decode(fixture('data.json'))), false, 'nbformat 3 with cells is not a notebook card');
  assert.equal(isNotebookJson('{"nbformat":4,"cells":[]}'), true);
  assert.equal(isNotebookJson('not json'), false);
});

test('code: the spec list maps to a highlighted language, jsonl, ini and kts included; HTML is source', () => {
  const list = ['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'java', 'go', 'rs', 'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'cs', 'rb', 'php', 'swift', 'kt', 'kts', 'sh', 'bash', 'sql', 'r', 'jl', 'lua', 'scala', 'html', 'css', 'scss', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'xml'];
  const missing = list.filter(ext => codeLanguage(`file.${ext}`) === 'text' || codeLanguage(`FILE.${ext.toUpperCase()}`) === 'text');
  assert.deepEqual(missing, [], 'every listed extension, any case, has a language');
  assert.deepEqual(['a.jsonl', 'setup.ini', 'build.gradle.kts', 'page.html'].map(codeLanguage), ['jsonl', 'ini', 'kotlin', 'html']);
});

test('CSV/TSV: quotes, embedded line breaks, doubled quotes, empty values, BOM; values stay text (leading zeros kept)', () => {
  const quoted = decodeText(fixture('quoted.csv')).text;
  assert.equal(detectDelimiter(quoted, 'quoted.csv'), ',');
  const table = parseDelimited(quoted, { delimiter: ',' });
  assert.deepEqual(table.rows, [
    ['id', 'name', 'note', 'amount'],
    ['00123', 'Smith, Jane', 'line one\r\nline two', '12.50'],
    ['00456', 'Zoë', 'she said "hi"', ''],
    ['07890', '日本語', '', '3'],
  ]);
  assert.deepEqual([table.totalRows, table.totalCols, table.truncatedRows], [4, 4, false]);
  const semi = decodeText(fixture('semicolon.csv')).text;
  assert.equal(detectDelimiter(semi, 'semicolon.csv'), ';', 'a semicolon file with decimal commas');
  assert.deepEqual(parseDelimited(semi, { delimiter: ';' }).rows[1], ['1', '2,5', 'x']);
  const tsv = decodeText(fixture('data.tsv')).text;
  assert.equal(detectDelimiter(tsv, 'data.tsv'), '\t');
  assert.deepEqual(parseDelimited(tsv, { delimiter: '\t' }).rows, [['id', 'city', 'count'], ['001', 'Paris', '3'], ['002', 'Quoted\tTab', '4'], ['003', 'Oslo', '']]);
  assert.deepEqual(parseDelimited('a,b\n\n1,2', { delimiter: ',' }).rows, [['a', 'b'], [''], ['1', '2']], 'a blank line is an empty record, not dropped');
  assert.deepEqual(parseDelimited('a,"b', { delimiter: ',' }).rows, [['a', 'b']], 'an unclosed quote keeps its text');
});

test('CSV: a large file is bounded by rows and columns, and the counts say how much exists', () => {
  let csv = 'id,a,b\n';
  for (let i = 0; i < 25000; i++) csv += `${String(i).padStart(6, '0')},${i},"x,${i}"\n`;
  const table = parseDelimited(csv, { delimiter: ',', maxRows: 1000, maxCols: 2 });
  assert.deepEqual([table.rows.length, table.totalRows, table.cols, table.totalCols, table.truncatedRows, table.truncatedCols], [1000, 25001, 2, 3, true, true]);
  assert.deepEqual(table.rows[1], ['000000', '0']);
  const excerpt = tableExcerpt(table, { limit: 200 });
  assert.equal(excerpt.coverage, 'partial');
  assert.match(excerpt.range, /^A1:B\d+$/);
  assert.match(excerpt.note, /^rows 1-\d+ of 25,001, columns A-B of 3$/);
  assert.deepEqual([columnName(0), columnName(25), columnName(26), columnName(701), columnName(702)], ['A', 'Z', 'AA', 'ZZ', 'AAA']);
  assert.equal(quoteSheet("Q1 'sales'"), "'Q1 ''sales'''");
});

for (const name of ['workbook.xlsx', 'workbook.xls']) {
  test(`workbook ${name}: sheet names, typed values as shown, leading zeros, formula text beside the cached value`, () => {
    const book = readWorkbook(XLSX, fixture(name), { name });
    assert.equal(book.format, name.split('.').pop());
    assert.deepEqual(book.sheets.map(sheet => sheet.name), ['Q1', 'Notes', 'Empty']);
    const [q1, notes, empty] = book.sheets;
    assert.deepEqual([q1.totalRows, q1.totalCols, q1.formulas], [4, 5, 4]);
    assert.deepEqual(q1.rows[0], ['ID', 'Name', 'Amount', 'Double', 'When']);
    assert.deepEqual(q1.rows.slice(1).map(row => cellText(row[0])), ['00123', '00456', '07890'], 'text IDs keep their leading zeros');
    assert.deepEqual(q1.rows.slice(1).map(row => cellText(row[1])), ['Zoë', '日本語', ''], 'Unicode and an empty cell');
    assert.deepEqual(q1.rows[1][3], { v: '25', t: 'n', f: '=C2*2' }, 'formula text and the cached value');
    assert.deepEqual(q1.rows[1][4], { v: '2026-10-16', t: 'n', f: '=DATE(2026,10,16)', raw: '46311' }, 'the number format is applied; the stored serial kept');
    assert.deepEqual(describeCell(q1.rows[1][3], 1, 3), { address: 'D2', value: '25', formula: '=C2*2', kind: 'formula' });
    assert.deepEqual(describeCell(q1.rows[1][0], 1, 0), { address: 'A2', value: '00123', kind: 'text' });
    assert.equal(cellText(notes.rows[0][0]), 'Line one\nLine two');
    assert.deepEqual([empty.totalRows, empty.rows.length], [0, 0], 'an empty sheet is empty, not an error');
  });
}

test('workbook: a cell with a formula and no saved value is said to have none; rows are bounded with the full count kept', () => {
  assert.deepEqual(describeCell({ v: '', t: 'z', f: '=A1', cached: false }, 0, 1), { address: 'B1', value: '', formula: '=A1', kind: 'formula-no-cache' });
  const book = readWorkbook(XLSX, fixture('workbook.xlsx'), { maxRows: 2 });
  assert.deepEqual([book.sheets[0].rows.length, book.sheets[0].totalRows, book.sheets[0].truncatedRows], [2, 4, true]);
  assert.throws(() => readWorkbook(XLSX, fixture('quoted.csv'), { name: 'quoted.xlsx' }), /quoted\.xlsx is not an Excel workbook/);
});

test('office files are told apart by structure, not by name', () => {
  assert.deepEqual(['workbook.xlsx', 'workbook.xls', 'document.docx', 'document.doc', 'deck.pptx', 'quoted.csv'].map(name => officeKind(fixture(name))), ['xlsx', 'xls', 'docx', 'doc', 'pptx', null]);
  const head = name => fixture(name);
  assert.deepEqual(checkDocFile({ name: 'deck.pptx', size: 10 }, head('deck.pptx')), { kind: 'presentation', format: 'pptx' });
  assert.deepEqual(checkDocFile({ name: 'document.docx', size: 10 }, head('document.docx')), { kind: 'document', format: 'docx' });
  assert.deepEqual(checkDocFile({ name: 'data.csv', size: 10 }, head('quoted.csv')), { kind: 'table', format: 'csv' });
  assert.match(checkDocFile({ name: 'renamed.xlsx', size: 10 }, head('document.docx')).error, /renamed\.xlsx is actually a Word document \(\.docx\)/);
  assert.match(checkDocFile({ name: 'fake.docx', size: 10 }, head('quoted.csv')).error, /fake\.docx is not a valid Word document/);
  assert.match(checkDocFile({ name: 'x.csv', size: 10 }, head('binary.txt')).error, /x\.csv looks like a binary file/);
  assert.match(checkDocFile({ name: 'x.csv', size: 0 }, new Uint8Array()).error, /the file is empty/);
  assert.match(checkDocFile({ name: 'x.xlsx', size: 26 * 1024 * 1024 }, head('workbook.xlsx')).error, /files up to 25 MiB/);
  assert.equal(docKind('a.TSV'), 'table');
  assert.equal(docKind('data.json'), null, 'JSON is never a table by extension');
});

test('presentation: slides in deck order with their own numbers, titles, notes labelled, hidden slides marked', () => {
  const deck = readPresentation(XLSX.CFB, fixture('deck.pptx'));
  assert.equal(deck.count, 4);
  assert.equal(Math.round(deck.size.ratio * 1000) / 1000, 1.778, '16:9');
  assert.deepEqual(deck.slides.map(slide => [slide.number, slide.title, slide.hidden]), [[1, 'Slide 1 title', false], [2, 'Slide 2 title', false], [3, 'Slide 3 title', false], [4, 'Slide 4 title', true]]);
  assert.equal(deck.slides[1].text, 'Slide 2 title\nBody of slide 2\nSecond point on 2');
  assert.equal(deck.slides[1].notes, 'Speaker note for slide 2', 'only the notes body, not the slide number placeholder');
  assert.equal(deck.slides[0].notes, '');
  const excerpt = slidesExcerpt(deck.slides);
  assert.match(excerpt.text, /\[Slide 2\]\n[\s\S]*Speaker notes: Speaker note for slide 2/);
  assert.match(excerpt.text, /\[Slide 4, hidden\]/);
  assert.equal(unescapeXml('a &amp; b &lt;c&gt; &#233; &#x263A;'), 'a & b <c> é ☺');
  assert.deepEqual(paragraphsOf('<a:p><a:pPr/><a:r><a:t>one</a:t></a:r><a:br/><a:r><a:t xml:space="preserve"> two</a:t></a:r></a:p>'), ['one\n two']);
  assert.throws(() => readPresentation(XLSX.CFB, fixture('document.docx'), { name: 'x.pptx' }), /x\.pptx is not a PowerPoint presentation/);
});

test('Word: headings, emphasis, list, table, safe link and the embedded image, with mammoth\'s conversion notes', async () => {
  const doc = await readDocx(mammoth, fixture('document.docx'));
  const tags = doc.nodes.filter(node => typeof node === 'object').map(node => node.t);
  assert.deepEqual(tags, ['h1', 'p', 'h2', 'ul', 'table', 'p', 'p', 'p']);
  assert.equal(doc.images.length, 1);
  assert.equal(doc.images[0].type, 'image/png');
  assert.deepEqual([...doc.images[0].bytes.slice(1, 4)].map(b => String.fromCharCode(b)).join(''), 'PNG');
  assert.match(doc.text, /^# Import fixture heading\nA first paragraph with bold and italic text\. Unicode: Zoë 日本語\.\n## Second level\n- Bullet one\n- Bullet two/);
  assert.match(doc.text, /Col A \| Col B \| Col C/);
  const link = JSON.stringify(doc.nodes).match(/\{"t":"a","c":\["example link"\],"a":\{"href":"https:\/\/example.com\/"\}\}|\{"t":"a","a":\{"href":"https:\/\/example\.com\/"\},"c":\["example link"\]\}/);
  assert.ok(link, 'the link keeps its https target');
  assert.ok(Array.isArray(doc.messages));
  await assert.rejects(readDocx(mammoth, fixture('document.doc'), { name: 'old.docx' }), /old\.docx could not be read as a Word document/);
});

test('Word: the HTML tree keeps only allowed elements and safe targets; nothing active survives', () => {
  const { nodes } = htmlTree('<p onclick="x()">a<script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href=" https://ok.test/ ">ok</a></p><iframe src="https://evil"></iframe><img src="https://evil/x.png" onerror="x()"><img src="rh-image:2" alt="pic"><td colspan="3" rowspan="x">c</td><style>p{}</style>');
  const json = JSON.stringify(nodes);
  assert.doesNotMatch(json, /onclick|onerror|javascript:|iframe|evil|"script"|"style"/);
  assert.deepEqual(nodes[0], { t: 'p', c: ['a', 'alert(1)', { t: 'span', c: ['bad'] }, { t: 'a', c: ['ok'], a: { href: 'https://ok.test/' } }] });
  assert.deepEqual(nodes.filter(node => node.t === 'img').map(node => node.a), [{ missing: 'image' }, { img: 2, alt: 'pic' }]);
  assert.deepEqual(nodes.find(node => node.t === 'td').a, { colspan: 3 });
  assert.equal(treeText(htmlTree('<h2>T</h2><ul><li>x</li></ul>').nodes), '## T\n- x');
  assert.equal(htmlTree('<p>a</p>'.repeat(10), { maxNodes: 5 }).truncated, true);
});

test('cards keep only a reference and view state; one asset key for every card made from one file', () => {
  const file = { name: 'deck.pptx', size: 44512, assetKey: 'import:k1', kind: 'presentation', format: 'pptx' };
  const slides = docBlocks(file, { mode: 'slides', from: 2, to: 3 });
  assert.deepEqual(slides.map(block => [block.slides, block.slide, block.assetKey]), [[[2, 2], 2, 'import:k1'], [[3, 3], 3, 'import:k1']]);
  assert.equal(docBlocks(file, { mode: 'whole' }).length, 1);
  const book = { name: 'w.xlsx', size: 11660, assetKey: 'import:k2', kind: 'workbook', format: 'xlsx' };
  assert.deepEqual(docBlocks(book, { mode: 'workbook', sheets: ['Q1', 'Notes'] }).map(b => [b.sheets, b.sheet]), [[['Q1', 'Notes'], 'Q1']]);
  assert.deepEqual(docBlocks(book, { mode: 'sheets', sheets: ['Q1', 'Notes'] }).map(b => [b.sheets, b.sheet]), [[['Q1'], 'Q1'], [['Notes'], 'Notes']]);
  const blocks = [...slides, docBlock({ ...book, view: {} }), textBlock({ name: 'a/b/notes.md', size: 5, assetKey: 'import:k3', kind: 'markdown' })];
  assert.deepEqual(assetKeysOf({ blocks }), ['import:k1', 'import:k2', 'import:k3'], 'the board saves each original once');
  for (const block of blocks) assert.ok(JSON.stringify(block).length < 400, 'a card is a compact reference');
  assert.deepEqual(slideRange('2', '3', 4), { from: 2, to: 3 });
  assert.equal(slideRange('0', '3', 4).error, 'Slides run from 1 to 4.');
  assert.equal(slideRange('3', '2', 4).error, 'From must not be after To.');
  assert.equal(slideRange('1.5', '2', 4).error, 'Enter whole slide numbers.');
});

test('chat context: a card says what it covers; before it is read only its name is known', () => {
  const block = { id: 'b1', type: 'file', kind: 'table', label: 'big.csv' };
  assert.match(describeCanvasObject(block).text, /Table on the canvas: big\.csv\n\[Its content has not been read in this browser yet; only its name is known\.\]/);
  setFileExcerpt('b1', { text: 'id\ta', coverage: 'partial', note: 'rows 1-2 of 200,001', where: '200,001 rows × 6 columns' });
  assert.equal(describeFileCard(block).text, 'Table on the canvas: big.csv (200,001 rows × 6 columns)\n[Partial content: rows 1-2 of 200,001. The rest is in the original file and was not read.]\nid\ta');
  setFileExcerpt('b1', null);
  assert.equal(describeFileCard({ type: 'file', kind: 'image', label: 'x.png' }), null, 'other file cards keep their own description');
});

test('converter jobs: the request lane 2 sends, one key per card and source revision, and each state\'s line', () => {
  assert.deepEqual(jobRequest('doc'), { converter: 'office-pdf', options: { poster: true } });
  assert.deepEqual(jobRequest('pptx', { from: 2, to: 5 }), { converter: 'slides', options: { width: 1280, from: 2, to: 5 } });
  assert.equal(jobRequest('docx'), null, 'a .docx is read in the browser');
  assert.equal(idempotencyKey({ card: 'c', rev: 'r', converter: 'slides', options: { to: 5, from: 2 } }), idempotencyKey({ card: 'c', rev: 'r', converter: 'slides', options: { from: 2, to: 5 } }));
  assert.deepEqual(['queued', 'converting', 'ready', 'ready_with_limitations', 'failed'].map(state => jobView({ state }).label), ['Queued', 'Converting', 'Ready', 'Ready with limitations', 'Failed']);
  assert.deepEqual(jobView({ state: 'failed', error: 'timeout' }), { label: 'Failed', tone: 'error', terminal: true, canCancel: false, canRetry: true, limitations: [], error: 'timeout' });
  assert.equal(jobView({ state: 'converting', cancel_requested: 1 }).canCancel, false);
  assert.deepEqual(jobView({ state: 'ready_with_limitations', limitations: ['Animations are not rendered'] }).limitations, ['Animations are not rendered']);
});

test('the worker entry parses each kind; a table parse names its delimiter and encoding', async () => {
  const table = await parseFile('table', fixture('semicolon.csv'), { name: 'semicolon.csv' });
  assert.deepEqual([table.delimiter, table.encoding, table.totalRows], [';', 'utf-8', 3]);
  await assert.rejects(parseFile('table', fixture('latin1.csv'), { name: 'latin1.csv' }), error => error.code === 'encoding');
  assert.equal((await parseFile('table', fixture('latin1.csv'), { name: 'latin1.csv', encoding: 'windows-1252' })).rows[1][0], 'José');
  assert.equal((await parseFile('workbook', fixture('workbook.xls'), {})).sheets.length, 3);
  assert.equal((await parseFile('presentation', fixture('deck.pptx'), {})).count, 4);
  assert.equal((await parseFile('document', fixture('document.docx'), {})).images.length, 1);
});

test('extracted text derivative: one unit per natural location, complete or limited said', async () => {
  const { lineUnits, tableUnits, workbookUnits, slideUnits, documentUnits, notebookUnits } = await import('./file-text-units.js');
  const lines = Array.from({ length: 450 }, (_, i) => `line ${i + 1}`).join('\r\n');
  const text = lineUnits(lines);
  assert.deepEqual(text.units.map(unit => unit.loc), [{ start: 1, end: 200 }, { start: 201, end: 400 }, { start: 401, end: 450 }]);
  assert.equal(text.units[1].text.split('\n')[0], 'line 201', 'units keep the file\'s own line numbers');
  assert.deepEqual([text.v, text.complete, text.limited], [1, true, undefined]);
  const cut = lineUnits(lines, { limit: 3000 });
  assert.deepEqual([cut.complete, cut.limited, cut.units.length], [false, 'lines 1-200 of 450', 1]);
  const csv = await parseFile('table', fixture('quoted.csv'), { name: 'quoted.csv' });
  const table = tableUnits(csv);
  assert.deepEqual(table, { v: 1, units: [{ loc: { rows: [1, 4] }, text: 'id\tname\tnote\tamount\n00123\tSmith, Jane\tline one line two\t12.50\n00456\tZoë\tshe said "hi"\t\n07890\t日本語\t\t3' }], complete: true });
  assert.equal(tableUnits({ ...csv, rows: csv.rows.slice(0, 2), totalRows: 4 }).limited, 'rows 1-2 of 4');
  const book = workbookUnits(readWorkbook(XLSX, fixture('workbook.xlsx')));
  assert.deepEqual(book.units.map(unit => unit.loc), [{ sheet: 'Q1', cells: 'A1:E4' }, { sheet: 'Notes', cells: 'A1:A2' }]);
  assert.match(book.units[0].text, /^ID\tName\tAmount\tDouble\tWhen\n00123\tZoë\t12\.5\t25 \[=C2\*2\]\t2026-10-16 \[=DATE\(2026,10,16\)\]/);
  assert.equal(book.complete, true);
  assert.match(workbookUnits(readWorkbook(XLSX, fixture('workbook.xlsx'), { sheets: ['Q1'] })).limited, /sheets not read: Notes, Empty/);
  const deck = slideUnits(readPresentation(XLSX.CFB, fixture('deck.pptx')));
  assert.deepEqual(deck.units.map(unit => unit.loc.slide), [1, 2, 3, 4]);
  assert.match(deck.units[1].text, /Speaker notes: Speaker note for slide 2$/);
  assert.match(deck.units[3].text, /^\[Hidden slide\]/);
  const doc = documentUnits(await readDocx(mammoth, fixture('document.docx')));
  assert.deepEqual([doc.units.length, doc.units[0].loc, doc.complete], [1, { start: 1, end: doc.units[0].text.split('\n').length }, true]);
  const nb = notebookUnits({ cells: [{ id: 'a1', cell_type: 'markdown', source: ['# T'] }, { cell_type: 'code', source: 'print(1)', outputs: [{ output_type: 'stream', text: ['1\n'] }, { output_type: 'display_data', data: { 'text/html': '<b>x</b>' } }] }] });
  assert.deepEqual(nb.units.map(unit => unit.loc), [{ cell: 'a1' }, { cell: '2' }]);
  assert.equal(nb.units[1].text, '[code cell]\nprint(1)\nOutput:\n1\n\n[output not read: text/html]');
  for (const derivative of [text, table, book, deck, doc, nb]) assert.doesNotThrow(() => JSON.parse(JSON.stringify(derivative)));
});
