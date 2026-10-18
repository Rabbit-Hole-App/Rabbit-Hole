import test from 'node:test';
import assert from 'node:assert/strict';
import { previewNotebookCellEdit } from './inline-notebook-edit.js';

function fixture() {
  const code = id => ({ id, cell_type: 'code', source: ['x = 1\n'], metadata: { custom: true }, outputs: [{ output_type: 'stream', text: '1' }], execution_count: 3 });
  const block = { id: 'block', type: 'notebook', notebook_id: 'workspace', active_path: 'a.ipynb', ipynb_path: 'a.ipynb', ipynb: { nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [code('first'), { id: 'md', cell_type: 'markdown', source: 'Note', metadata: {} }, code('last')] } };
  const frozen = { id: block.id, notebookId: block.notebook_id, path: block.active_path, cellIds: ['first'], revision: JSON.stringify(block.ipynb) };
  const input = { targetId: block.id, cellIds: ['first'], edits: [{ id: 'first', source: 'x = 2' }] };
  return { block, frozen, input };
}
test('code edits preserve metadata and IDs, clearing edited and downstream output without execution', () => {
  const { block, frozen, input } = fixture(), before = structuredClone(block);
  const result = previewNotebookCellEdit(input, { block, frozen });
  assert.equal(result.ok, true); assert.deepEqual(block, before);
  assert.deepEqual(result.staleCellIds, ['first', 'last']);
  const cells = result.changes[0].after.ipynb.cells;
  assert.deepEqual(cells[0].metadata, before.ipynb.cells[0].metadata);
  assert.equal(cells[0].source, 'x = 2'); assert.deepEqual(cells[2].source, ['x = 1\n']);
  assert.deepEqual(cells[2].outputs, []); assert.equal(cells[2].execution_count, null);
});
test('Markdown edits leave every code output intact', () => {
  const f = fixture(); f.frozen.cellIds = f.input.cellIds = ['md']; f.input.edits = [{ id: 'md', source: 'Updated' }];
  const result = previewNotebookCellEdit(f.input, f);
  assert.equal(result.ok, true); assert.deepEqual(result.staleCellIds, []);
  assert.deepEqual(result.changes[0].after.ipynb.cells[2], f.block.ipynb.cells[2]);
});
test('identical source is a no-op and does not invalidate outputs', () => {
  const f = fixture(); f.input.edits[0].source = 'x = 1\n';
  const result = previewNotebookCellEdit(f.input, f);
  assert.deepEqual(result.changes, []); assert.deepEqual(result.staleCellIds, []);
});
test('stale revision, switched document, workspace, locks and readonly fail closed', () => {
  for (const mutate of [f => f.block.ipynb.cells[0].source = 'changed', f => f.block.active_path = 'other', f => f.block.notebook_id = 'other', f => f.block.locked = true, f => f.readOnly = true]) {
    const f = fixture(); mutate(f); assert.equal(previewNotebookCellEdit(f.input, f).ok, false);
  }
});
test('missing or duplicate IDs, unselected edits and oversized source fail closed', () => {
  for (const mutate of [f => delete f.block.ipynb.cells[0].id, f => f.block.ipynb.cells[2].id = 'first', f => f.input.edits[0].id = 'last', f => f.input.edits[0].source = 'x'.repeat(20001), f => f.input.edits.push(f.input.edits[0])]) {
    const f = fixture(); mutate(f); f.frozen.revision = JSON.stringify(f.block.ipynb); assert.equal(previewNotebookCellEdit(f.input, f).ok, false);
  }
});
test('malformed snapshots and execution/output injection are rejected', () => {
  const f = fixture();
  for (const frozen of [null, {}, { ...f.frozen, cellIds: [null] }]) assert.equal(previewNotebookCellEdit(f.input, { block: f.block, frozen }).ok, false);
  f.input.edits[0].outputs = []; assert.equal(previewNotebookCellEdit(f.input, f).ok, false);
});
