import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyNotebook, newNotebookBlock, trimOutputs, describeNotebook } from './learn-notebook.js';

test('a new notebook block holds a plain nbformat 4 Python document', () => {
  const block = newNotebookBlock();
  assert.equal(block.type, 'notebook');
  assert.equal(block.language, 'python');
  assert.ok(block.notebook_id);
  assert.equal(block.ipynb.nbformat, 4);
  assert.equal(block.ipynb.metadata.kernelspec.name, 'python');
  assert.deepEqual(block.ipynb.cells.map(cell => cell.cell_type), ['code']);
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

test('describeNotebook tells the tutor the notebook exists', () => {
  const block = { ...newNotebookBlock(), notebook_id: 'nb-1' };
  block.ipynb.cells.push({ cell_type: 'markdown', id: 'm', metadata: {}, source: '# Notes' });
  assert.match(describeNotebook(block).text, /notebook_id nb-1, language python\): 2 cells, 1 code and 1 Markdown/);
});
