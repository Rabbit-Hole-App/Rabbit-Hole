import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyNotebook, newNotebookBlock, trimOutputs, describeNotebook, activePath, ipynbPath, notebookUrl, notebookFromCode, notebookWriteBack } from './learn-notebook.js';
import { boardText } from './canvas-persist.js';

test('a new notebook block is a workspace holding one plain nbformat 4 Python notebook', () => {
  const block = newNotebookBlock();
  assert.equal(block.type, 'notebook');
  assert.equal(block.language, 'python');
  assert.ok(block.notebook_id);
  assert.equal(block.active_path, 'notebook.ipynb');
  assert.deepEqual(block.files, ['notebook.ipynb']);
  assert.equal(block.ipynb.nbformat, 4);
  assert.equal(block.ipynb.metadata.kernelspec.name, 'python');
  assert.deepEqual(block.ipynb.cells.map(cell => cell.cell_type), ['code']);
});

test('each card opens its own workspace', () => {
  const [a, b] = [newNotebookBlock(), newNotebookBlock()];
  assert.notEqual(notebookUrl(a.notebook_id), notebookUrl(b.notebook_id));
  assert.match(notebookUrl(a.notebook_id), /\/lab\/index\.html\?mode=single-document&workspace=[0-9a-f-]{36}$/);
});

test('cards made before workspaces open their notebook as notebook.ipynb', () => {
  const legacy = { id: 'x', type: 'notebook', notebook_id: 'nb-legacy-1', ipynb: emptyNotebook() };
  assert.equal(activePath(legacy), 'notebook.ipynb');
  assert.equal(ipynbPath(legacy), 'notebook.ipynb');
});

test('trimOutputs keeps small outputs and replaces only the oversized one', () => {
  const small = { output_type: 'execute_result', data: { 'text/plain': '20' }, metadata: {}, execution_count: 2 };
  const big = { output_type: 'display_data', data: { 'image/png': 'x'.repeat(200000) }, metadata: {} };
  const ipynb = { ...emptyNotebook(), cells: [{ cell_type: 'code', id: 'a', metadata: {}, source: 'x * 2', execution_count: 2, outputs: [small, big] }] };
  const trimmed = trimOutputs(ipynb);
  assert.deepEqual(trimmed.cells[0].outputs[0], small);
  assert.equal(trimmed.cells[0].outputs[1].output_type, 'stream');
  assert.match(trimmed.cells[0].outputs[1].text, /too large/);
  assert.equal(ipynb.cells[0].outputs[1], big, 'the live document is not mutated');
});

test('describeNotebook gives the tutor the workspace shape, not file contents', () => {
  const block = { ...newNotebookBlock(), notebook_id: 'nb-1', active_path: 'experiment.ipynb', ipynb_path: 'experiment.ipynb', files: ['data/', 'data/sample.json', 'experiment.ipynb', 'helper.py'], seed_files: { 'helper.py': 'SECRET = 1' } };
  block.ipynb.cells.push({ cell_type: 'markdown', id: 'm', metadata: {}, source: '# Notes' });
  const text = describeNotebook(block).text;
  assert.match(text, /notebook_id nb-1, language python/);
  assert.match(text, /Open file: experiment\.ipynb - 2 cells, 1 code and 1 Markdown/);
  assert.match(text, /Files: data\/, data\/sample\.json, experiment\.ipynb, helper\.py/);
  assert.doesNotMatch(text, /SECRET/);
  const editing = describeNotebook({ ...block, active_path: 'helper.py' }).text;
  assert.match(editing, /Open file: helper\.py\./);
});

test('Open in Notebook: a Code box gives one cell holding its text verbatim, and the box is untouched', () => {
  const box = Object.freeze({ id: 'box', kind: 'text', mode: 'code', lang: 'python', text: 'x = 1\n  print(x)  # kept as typed' });
  const before = JSON.stringify(box);
  const { block } = notebookFromCode(box);
  assert.equal(block.type, 'notebook');
  assert.notEqual(block.id, box.id);
  assert.deepEqual(block.ipynb.cells.map(cell => [cell.cell_type, cell.source]), [['code', box.text]]);
  assert.deepEqual({ ...block.ipynb, cells: [] }, { ...emptyNotebook(), cells: [] });
  assert.equal(JSON.stringify(box), before);
  assert.equal(notebookFromCode({ kind: 'text', mode: 'code', lang: 'python', text: 'y' }).block.ipynb.cells[0].source, 'y');
});

test('Open in Notebook: a Code exercise gives its Given setup, then its current code, never its checks', () => {
  const exercise = Object.freeze({ id: 'ex', type: 'code', setup: 'a = 1', starter: 'def f():\n    ...', checks: 'assert f()', draft: null });
  const sources = entry => notebookFromCode(entry).block.ipynb.cells.map(cell => [cell.cell_type, cell.source]);
  assert.deepEqual(sources(exercise), [['code', 'a = 1'], ['code', exercise.starter]]);
  assert.deepEqual(sources({ ...exercise, draft: 'def f():\n    return a' }), [['code', 'a = 1'], ['code', 'def f():\n    return a']]);
  const cells = notebookFromCode(exercise).block.ipynb.cells;
  assert.notEqual(cells[0].id, cells[1].id);
  assert.equal(exercise.draft, null);
});

test('Open in notebook: a Code sample gives its code verbatim in one cell, never its output, and the card is untouched', () => {
  const sample = Object.freeze({ id: 'cs', type: 'snippet', title: 'Vocabulary', brief: 'Why', code: 'chars = sorted(set(text))\nprint(chars)  # kept\n', output: "[' ', 'e']" });
  const before = JSON.stringify(sample);
  const { block } = notebookFromCode(sample);
  assert.equal(block.type, 'notebook');
  assert.notEqual(block.id, sample.id);
  assert.deepEqual(block.ipynb.cells.map(cell => [cell.cell_type, cell.source]), [['code', sample.code]]);
  assert.equal(JSON.stringify(sample), before);
  assert.deepEqual(notebookFromCode({ type: 'snippet', code: 'x = 1', language: 'Python' }).block.ipynb.cells.map(cell => cell.source), ['x = 1']);
});

test('Open in Notebook is Python only, and only for a code card', () => {
  for (const lang of [undefined, 'text', 'unknown-language']) {
    assert.deepEqual(notebookFromCode({ kind: 'text', mode: 'code', ...(lang ? { lang } : {}), text: 'x = 1' }), { disabled: 'Notebooks run Python only' }, 'Plain text or unknown code must not silently become Python');
  }
  assert.deepEqual(notebookFromCode({ kind: 'text', mode: 'code', lang: 'javascript', text: 'let a' }), { disabled: 'Notebooks run Python only' });
  assert.deepEqual(notebookFromCode({ type: 'code', language: 'r', starter: 'x <- 1' }), { disabled: 'Notebooks run Python only' });
  assert.deepEqual(notebookFromCode({ type: 'snippet', language: 'javascript', code: 'let a = 1' }), { disabled: 'Notebooks run Python only' });
  assert.equal(notebookFromCode({ kind: 'text', text: 'x = 1' }), null);
  assert.equal(notebookFromCode({ type: 'explanation', body: 'x = 1' }), null);
});

// Cross-device 409 (cross-device-report.md, gate 39735737303): a notebook frame reports its document while it starts, as
// JupyterLab's toJSON (@jupyter/ydoc YNotebook/YCodeCell key order) with the kernel's language_info. LearnPage saveBoard
// sends a PUT exactly when boardText differs from the text the server holds.
const CARD_IPYNB = { cells: [{ cell_type: 'code', id: 'c1', metadata: {}, outputs: [], execution_count: null, source: 'from helper import triple\ntriple(3)' }], metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' } }, nbformat: 4, nbformat_minor: 5 };
const LANGUAGE_INFO = { codemirror_mode: { name: 'python', version: 3 }, file_extension: '.py', mimetype: 'text/x-python', name: 'python', nbconvert_exporter: 'python', pygments_lexer: 'ipython3', version: '3.12.1' };
const frameJSON = (ipynb, edit = {}) => ({
  metadata: { kernelspec: { display_name: 'Python (Pyodide)', language: 'python', name: 'python' }, language_info: LANGUAGE_INFO },
  nbformat_minor: ipynb.nbformat_minor,
  nbformat: ipynb.nbformat,
  cells: ipynb.cells.map(cell => ({ id: cell.id, cell_type: cell.cell_type, source: cell.source, metadata: cell.metadata, outputs: cell.outputs, execution_count: cell.execution_count, ...edit })),
});
const notebookBoard = () => ({ strokes: [], blocks: [{ id: 'nb1', type: 'notebook', notebook_id: 'n1', active_path: 'experiment.ipynb', ipynb_path: 'experiment.ipynb', files: ['experiment.ipynb', 'helper.py'], ipynb: structuredClone(CARD_IPYNB) }] });
const writeBack = (state, rule, ipynb) => ({ ...state, blocks: state.blocks.map(block => { const patch = rule(block, 'experiment.ipynb', ipynb); return patch ? { ...block, ...patch } : block; }) });

test('opening a canvas with a notebook and doing nothing sends no board PUT', () => {
  const state = notebookBoard(), synced = boardText(state);
  const started = frameJSON(CARD_IPYNB);
  // The defect: the old copy (any open-notebook report) rewrote the card with the same notebook, so the board text changed.
  const old = (block, path, ipynb) => (path === activePath(block) ? { ipynb_path: path, ipynb } : null);
  assert.notEqual(boardText(writeBack(state, old, started)), synced, 'the old start-up write-back changed the board text');
  assert.equal(notebookWriteBack(state.blocks[0], 'experiment.ipynb', started), null);
  assert.equal(boardText(writeBack(state, notebookWriteBack, started)), synced, 'no change, so saveBoard sends no PUT');
});

test('an edit made in the notebook is still copied onto the card', () => {
  const block = notebookBoard().blocks[0];
  for (const edit of [{ source: 'triple(4)' }, { execution_count: 1, outputs: [{ output_type: 'execute_result', data: { 'text/plain': '9' }, metadata: {}, execution_count: 1 }] }, { metadata: { tags: ['x'] } }]) {
    const ipynb = frameJSON(CARD_IPYNB, edit);
    assert.deepEqual(notebookWriteBack(block, 'experiment.ipynb', ipynb), { ipynb_path: 'experiment.ipynb', ipynb });
  }
  const added = frameJSON(CARD_IPYNB);
  added.cells.push({ id: 'c2', cell_type: 'markdown', source: '', metadata: {} });
  assert.ok(notebookWriteBack(block, 'experiment.ipynb', added));
  // Another file's notebook is never copied; the same notebook under a newly opened path is (the card follows the open file).
  assert.equal(notebookWriteBack(block, 'other.ipynb', frameJSON(CARD_IPYNB)), null);
  assert.ok(notebookWriteBack({ ...block, active_path: 'copy.ipynb' }, 'copy.ipynb', frameJSON(CARD_IPYNB)));
});
