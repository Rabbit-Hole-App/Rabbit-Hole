import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_LIMIT, IMPORT_CHOICES, IMPORT_LIMIT, checkImport, codeBlock, importBlock, importKind, importSummary, parseNotebook, pyNotebook, safeOutputs } from './learn-file-import.js';
import { assetKeysOf } from './learn-board-assets.js';

// Dropping or uploading a .ipynb or .py (owner, 2026-10-08; docs/features/canvas-file-drop.md).
const file = (name, size = 10) => ({ name, size });
const NOTEBOOK = {
  nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: 'python3' } },
  cells: [
    { cell_type: 'markdown', metadata: {}, source: ['# Title\n', 'Some *Markdown*.'] },
    { cell_type: 'code', metadata: {}, execution_count: 3, source: 'print(1)', outputs: [
      { output_type: 'stream', name: 'stdout', text: '1\n' },
      { output_type: 'execute_result', execution_count: 3, metadata: {}, data: { 'text/plain': 'df', 'text/html': '<table onclick="x()">', 'image/png': 'iVBOR' } },
      { output_type: 'display_data', metadata: {}, data: { 'application/javascript': 'alert(1)', 'text/html': '<script>alert(1)</script>' } },
      { output_type: 'error', ename: 'E', evalue: 'v', traceback: [] },
    ] },
  ],
};

test('.ipynb, .py and common code files are imports, any case; the choices are the owner\'s', () => {
  assert.deepEqual(['a.ipynb', 'B.IPYNB', 'x.py', 'X.PY', 'x.pyc', 'py', ''].map(importKind), ['ipynb', 'ipynb', 'py', 'py', null, null, null]);
  // File imports lane 2 (canvas-file-imports.md): .txt is a Text card, .md/.markdown a Markdown card (or its source as a Code
  // card); a Word 97-2003 .doc is not an import (its family is planned until its converter; DocImport.jsx says so on drop).
  assert.deepEqual(['notes.txt', 'README.md', 'a.MARKDOWN', 'old.doc'].map(importKind), ['text', 'markdown', 'markdown', null]);
  assert.deepEqual(IMPORT_CHOICES.text.map(([id]) => id), ['text', 'attachment']);
  assert.deepEqual(IMPORT_CHOICES.markdown.map(([id]) => id), ['markdown', 'code', 'attachment']);
  // Repository graph Release 2 (lane DROP): other source and config files are code; images, PDFs and archives are not.
  assert.deepEqual(['app.js', 'Main.TS', 'lib.rs', 'ci.yml', 'Dockerfile', 'a.png', 'a.pdf', 'a.zip'].map(importKind), ['code', 'code', 'code', 'code', 'code', null, null, null]);
  assert.deepEqual(IMPORT_CHOICES.ipynb.map(([, label]) => label), ['Notebook', 'File attachment']);
  assert.deepEqual(IMPORT_CHOICES.py.map(([, label]) => label), ['Code card', 'Notebook', 'File attachment']);
  assert.deepEqual(IMPORT_CHOICES.code.map(([, label]) => label), ['Code card', 'File attachment'], 'a code file is never a notebook');
});

test('empty and oversized files are refused with a line that names the file and the limit', () => {
  assert.deepEqual(checkImport(file('a.ipynb')), { kind: 'ipynb' });
  assert.equal(checkImport(file('a.ipynb', 0)).error, 'a.ipynb: the file is empty');
  assert.equal(checkImport(file('big.py', IMPORT_LIMIT + 1)).error, 'big.py is 25.0 MiB; files up to 25 MiB can be added to a canvas');
  assert.match(checkImport(file('page.bin')).error, /^page\.bin: add a \.ipynb notebook, a \.py file, a text or Markdown file or another code file$/);
  assert.deepEqual(checkImport(file('big.js', IMPORT_LIMIT)), { kind: 'code' }, 'a code file takes the same 25 MiB limit');
});

test('a notebook keeps its cells and Markdown; saved outputs keep text and images, anything else becomes a visible line', () => {
  const parsed = parseNotebook(JSON.stringify(NOTEBOOK), 'a.ipynb');
  assert.deepEqual(parsed.cells.map((c) => [c.cell_type, c.source]), [['markdown', '# Title\nSome *Markdown*.'], ['code', 'print(1)']]);
  assert.equal(parsed.cells[1].execution_count, 3);
  const outputs = safeOutputs(parsed).cells[1].outputs;
  assert.deepEqual(outputs[0], NOTEBOOK.cells[1].outputs[0], 'a stream stays');
  assert.deepEqual(outputs[1].data, { 'text/plain': 'df', 'image/png': 'iVBOR' }, 'no HTML survives beside text and an image');
  assert.deepEqual(outputs[2], { output_type: 'stream', name: 'stdout', text: '[Output not shown: application/javascript, text/html]\n' });
  assert.equal(outputs[3].output_type, 'error');
  assert.doesNotMatch(JSON.stringify(safeOutputs(parsed)), /<script|alert\(1\)|onclick/, 'no script from a saved output');
});

test('invalid JSON and other formats are refused, naming the file and offering File attachment', () => {
  assert.throws(() => parseNotebook('{not json', 'broken.ipynb'), /^Error: broken\.ipynb is not valid notebook JSON \(.+\)\. Add it as a File attachment to keep it as it is\.$/);
  for (const text of ['null', '[]', '{"nbformat":3,"worksheets":[]}', '{"nbformat":4}']) {
    assert.throws(() => parseNotebook(text, 'old.ipynb'), /^Error: old\.ipynb: only Jupyter notebooks in format 4 open as a notebook card\. Add it as a File attachment/);
  }
});

test('a .py as a notebook: its code in one cell, never run, and the original file kept beside it', () => {
  const block = importBlock({ name: 'train.py', kind: 'py', choice: 'notebook', text: 'x = 1\nprint(x)', assetKey: 'import:1' });
  assert.equal(block.type, 'notebook');
  assert.deepEqual([block.active_path, block.ipynb_path, block.files], ['train.ipynb', 'train.ipynb', ['train.ipynb', 'train.py']]);
  assert.deepEqual(block.ipynb.cells.map((c) => [c.cell_type, c.source, c.execution_count, c.outputs]), [['code', 'x = 1\nprint(x)', null, []]]);
  assert.deepEqual(block.seed_files, { 'train.py': 'x = 1\nprint(x)' });
  assert.deepEqual(pyNotebook('a').nbformat, 4);
});

test('each choice makes its card, keeping the file name and the original bytes with the board', () => {
  const code = importBlock({ name: 'train.py', kind: 'py', choice: 'code', text: 'x = 1', assetKey: 'import:2' });
  assert.deepEqual([code.type, code.title, code.code, code.output, code.source_asset], ['snippet', 'train.py', 'x = 1', '', 'import:2']);
  const notebook = importBlock({ name: 'a.ipynb', kind: 'ipynb', choice: 'notebook', text: JSON.stringify(NOTEBOOK), assetKey: 'import:3' });
  assert.deepEqual([notebook.type, notebook.active_path, notebook.files, notebook.source_asset], ['notebook', 'a.ipynb', ['a.ipynb'], 'import:3']);
  assert.equal(notebook.seed_files, undefined);
  const attached = importBlock({ name: 'a.ipynb', kind: 'ipynb', choice: 'attachment', text: '', assetKey: 'import:4', size: 2048 });
  assert.deepEqual(attached, { id: attached.id, type: 'file', kind: 'attachment', dx: 0, dy: 0, assetKey: 'import:4', label: 'a.ipynb', size: 2048 });
  // The original bytes of every import are board files, saved with the canvas (LearnPage syncAssets).
  assert.deepEqual(assetKeysOf({ blocks: [code, notebook, attached] }), ['import:2', 'import:3', 'import:4']);
  assert.throws(() => importBlock({ name: 'a.ipynb', kind: 'ipynb', choice: 'code', text: '{}', assetKey: 'k' }), /choose how to add it/, 'a notebook is never a code card');
  assert.equal(importBlock({ name: 'dir/evil.py', kind: 'py', choice: 'code', text: '', assetKey: 'k' }).title, 'dir_evil.py', 'one file name, no path');
});

test('content too big for a card names the file and the 1.90 MB limit and points to File attachment; nothing is cut', () => {
  const text = 'x'.repeat(CARD_LIMIT + 20_000);
  assert.throws(() => importBlock({ name: 'huge.py', kind: 'py', choice: 'code', text, assetKey: 'k' }),
    /^Error: huge\.py: a code card keeps its content in the canvas, up to 1\.90 MB, and this one needs 1\.92 MB\. Add it as a File attachment \(up to 25 MB\) instead\.$/);
  assert.throws(() => importBlock({ name: 'huge.py', kind: 'py', choice: 'notebook', text, assetKey: 'k' }), /a notebook card keeps its content in the canvas, up to 1\.90 MB/);
  assert.equal(importBlock({ name: 'huge.py', kind: 'py', choice: 'attachment', text: '', assetKey: 'k', size: text.length }).kind, 'attachment');
});

test('importing touches no network: no fetch, no ask, no media upload', () => {
  const real = globalThis.fetch;
  globalThis.fetch = () => { throw Error('network touched'); };
  try {
    importBlock({ name: 'a.ipynb', kind: 'ipynb', choice: 'notebook', text: JSON.stringify(NOTEBOOK), assetKey: 'k' });
    importBlock({ name: 't.py', kind: 'py', choice: 'notebook', text: 'print(1)', assetKey: 'k' });
  } finally { globalThis.fetch = real; }
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.doesNotMatch(read('./learn-file-import.js'), /fetch\(|api\(|\/ask|learnAction|streamAsk/);
  // The page's import step: read, validate, cache the bytes in this browser, place the card. No upload, no ask.
  const page = read('./LearnPage.jsx'), add = page.slice(page.indexOf('const addImport = async'), page.indexOf('const takeDrop = async'));
  assert.doesNotMatch(add, /fetch\(|api\(|\/ask|learnAction|\/api\/learn\/media/);
  // A pasted code block (kind 'paste', repository-browser.md "Files in Learn") takes the same steps through pasteBlock; a
  // dropped file's Code card through codeBlock and insertCodeCard. Every file of a drop is read before any card is placed.
  assert.match(add, /const block = kind === 'paste' \? pasteBlock\(\{ text: await file\.text\(\), copy, choice: chosen, assetKey, language: languageOf\(copy\?\.path\) \}\)\n\s+: chosen === 'code' \? codeBlock\(\{ name: file\.name, text: await file\.text\(\), assetKey, size: file\.size \}\)\n\s+: importBlock\(\{ name: file\.name, kind, choice: chosen, text: chosen === 'attachment' \? '' : await file\.text\(\), assetKey, size: file\.size \}\);\n\s+made\.push\(\{ file, assetKey, block \}\);\n\s+\}\n\s+for \(const \{ file, assetKey, block \} of made\) \{\n\s+await cacheAsset\(assetKey, file\);\n\s+if \(block\.type === 'repo-code'\) insertCodeCard\(chat\?\.canvasOps, block, at\); else canvas\(\)\?\.insertImported\(block, at\);/);
});

test('every drop and every upload of a .ipynb or .py opens the one Add to canvas dialog, at the drop point', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const page = read('./LearnPage.jsx'), canvas = read('./AdaptiveCanvas.jsx'), dialog = read('./FileImportDialog.jsx');
  assert.match(page, /if \(importKind\(file\.name\)\) \{\n\s+const \{ kind, error \} = checkImport\(file\);\n\s+if \(error\) toast\(error, \{ tone: 'error' \}\); else asked\.push\(\{ id: crypto\.randomUUID\(\), file, kind, at \}\);/);
  // The picker's list is the capability registry's (file-capabilities.test.mjs proves it holds .ipynb, .py and the rest).
  // Owner brief 2026-10-22 item 3: the picker asks where the file goes first; Add to canvas is the same takeDrop.
  assert.match(page, /type="file" multiple accept=\{acceptList\(\)\}[^>]*\n\s+onChange=\{event => \{ const files = \[\.\.\.\(event\.target\.files \|\| \[\]\)\]; event\.target\.value = ''; if \(files\.length\) setUploadAsk\(files\);/, 'Insert > Upload a file offers them and asks where they go');
  assert.match(page, /if \(choice === 'canvas'\) \{ await takeDrop\(files\); return; \}/, 'Add to canvas goes through the same takeDrop');
  assert.match(page, /<FileImportDialog key=\{imports\[0\]\.id\} file=\{imports\[0\]\.file\} kind=\{imports\[0\]\.kind\}[^>]*onCancel=\{nextImport\} onConfirm=\{addImport\} \/>/);
  // A dropped folder's files are read first (model-drop.js droppedFiles, file-imports Lane 4); the drop point is taken at the drop.
  assert.match(canvas, /const at = local\(event\); droppedFiles\(event\.dataTransfer\)\.then\(files => onDropFiles\(files, at\)/, 'the drop point rides with the files');
  assert.match(canvas, /insertImported: \(block, at = null\) => \{/);
  assert.match(dialog, /<ConfirmDialog title="Add to canvas" confirmLabel=\{busy \? 'Adding' : 'Add to canvas'\} confirmVariant="primary" onCancel=\{onCancel\}/);
  assert.match(dialog, /<span data-import-file[^>]*>\{file\.name\}<\/span>/);
});

// Repository graph Release 2, lane DROP (C:/s/spec/repo-graph-r2-plan.md): a dropped code file's Code card is a repo-code
// card whose text stays in its asset - the file's own bytes, saved with the board - never in the board itself.
test('a dropped code file becomes a repo-code card that keeps its name, language and bytes as an upload source', () => {
  const block = codeBlock({ name: 'src/app.ts', text: 'const a = 1;\n\tindented  \n', assetKey: 'import:9', size: 26 });
  assert.deepEqual({ ...block, id: 'x' }, { id: 'x', type: 'repo-code', dx: 0, dy: 0, title: 'src_app.ts', language: 'typescript', source: { kind: 'upload', assetKey: 'import:9', name: 'src_app.ts', size: 26 } });
  assert.doesNotMatch(JSON.stringify(block), /const a = 1/, 'no source text in the board');
  assert.equal(codeBlock({ name: 'train.py', text: 'x = 1', assetKey: 'k', size: 5 }).language, 'python');
  assert.deepEqual(assetKeysOf({ blocks: [block, { type: 'repo-code', source: { kind: 'repository', path: 'a.py' } }] }), ['import:9'], 'the upload is a board file; a repository card has none');
  assert.throws(() => codeBlock({ name: 'blob.js', text: 'MZ\u0000\u0000', assetKey: 'k', size: 4 }),
    /^Error: blob\.js looks like a binary file, not code\. Add it as a File attachment to keep it as it is\.$/);
});

test('a drop of several files is one dialog that says what it will create before anything is placed', () => {
  assert.equal(importSummary(['code']), '1 code card');
  assert.equal(importSummary(['code', 'code', 'notebook']), '2 code cards and 1 notebook');
  assert.equal(importSummary(['attachment', 'code', 'notebook', 'attachment']), '1 code card, 1 notebook and 2 file attachments');
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const page = read('./LearnPage.jsx'), dialog = read('./FileImportDialog.jsx');
  assert.match(page, /if \(asked\.length > 1\) setImports\(queue => \[\.\.\.queue, \{ id: crypto\.randomUUID\(\), kind: 'batch', files: asked, at \}\]\);/);
  assert.match(dialog, /if \(kind === 'batch'\) return <BatchImport files=\{files\}/);
  assert.match(dialog, /<span data-import-summary[^>]*>Adds \{importSummary\(choices\)\}\.<\/span>/);
  assert.match(dialog, /onConfirm=\{\(\) => \{ if \(!busy\) onConfirm\(choices\); \}\}/, 'one Add to canvas for the whole drop');
});
