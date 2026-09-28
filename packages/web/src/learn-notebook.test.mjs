import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyNotebook, newNotebookBlock, trimOutputs, describeNotebook, activePath, ipynbPath, notebookUrl } from './learn-notebook.js';

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
