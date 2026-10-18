import { activePath, ipynbPath } from './learn-notebook.js';

const fail = reason => ({ ok: false, changes: [], staleCellIds: [], errors: [reason] });
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key));
const validIds = ids => Array.isArray(ids) && ids.length > 0 && ids.length <= 20 && ids.every(id => typeof id === 'string' && /^[\w-]{1,64}$/.test(id)) && new Set(ids).size === ids.length;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Pure saved-document proposal. The caller must synchronize the live notebook
// frame before freezing and accepting, and authorize the canvas mutation.
export function previewNotebookCellEdit(input, { block, frozen, readOnly = false } = {}) {
  try {
    if (readOnly || block?.locked) return fail('This notebook is read-only or locked.');
    if (!keys(input, ['targetId', 'cellIds', 'edits']) || !validIds(input.cellIds) || !Array.isArray(input.edits) || !input.edits.length || input.edits.length > 20) return fail('Invalid bounded notebook edit.');
    if (!block || block.type !== 'notebook' || !block.notebook_id || block.id !== input.targetId || frozen?.id !== block.id || frozen.notebookId !== block.notebook_id || frozen.path !== activePath(block) || activePath(block) !== ipynbPath(block)) return fail('The active notebook identity changed.');
    if (!validIds(frozen.cellIds) || !same([...input.cellIds].sort(), [...frozen.cellIds].sort())) return fail('The selected notebook cells changed.');
    const notebook = block.ipynb;
    if (!plain(notebook) || notebook.nbformat !== 4 || !Array.isArray(notebook.cells) || notebook.cells.length > 1000) return fail('Unsupported notebook document.');
    const revision = JSON.stringify(notebook);
    if (revision.length > 1000000 || revision !== frozen.revision) return fail('The notebook document changed or exceeds the edit limit.');
    const allIds = notebook.cells.map(cell => cell?.id);
    if (allIds.some(id => typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) || new Set(allIds).size !== allIds.length || input.cellIds.some(id => !allIds.includes(id))) return fail('Notebook cells need unique stable IDs.');
    if (input.edits.some(edit => !keys(edit, ['id', 'source']) || !input.cellIds.includes(edit.id) || typeof edit.source !== 'string' || edit.source.length > 20000) || new Set(input.edits.map(edit => edit.id)).size !== input.edits.length || input.edits.reduce((sum, edit) => sum + edit.source.length, 0) > 60000) return fail('Cell edits exceed the selected scope or source limit.');
    const edits = new Map(input.edits.map(edit => [edit.id, edit.source]));
    let invalidate = false;
    const staleCellIds = [];
    const cells = notebook.cells.map(cell => {
      let after = cell;
      if (edits.has(cell.id)) {
        if (!['code', 'markdown'].includes(cell.cell_type) || !(typeof cell.source === 'string' || Array.isArray(cell.source) && cell.source.every(line => typeof line === 'string'))) throw new Error('Only code and Markdown cell source can be edited.');
        const oldSource = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
        if (oldSource !== edits.get(cell.id)) {
          after = { ...cell, source: edits.get(cell.id) };
          if (cell.cell_type === 'code') invalidate = true;
        }
      }
      if (invalidate && cell.cell_type === 'code') {
        staleCellIds.push(cell.id);
        after = { ...after, outputs: [], execution_count: null };
      }
      return after;
    });
    const after = { ...block, ipynb: { ...notebook, cells } };
    return { ok: true, changes: same(block, after) ? [] : [{ id: block.id, list: 'blocks', before: block, after }], staleCellIds, errors: [] };
  } catch {
    return fail('The notebook request or frozen document is malformed.');
  }
}
