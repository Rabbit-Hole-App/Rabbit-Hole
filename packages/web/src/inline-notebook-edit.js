import { activePath, ipynbPath } from './learn-notebook.js';

const fail = reason => ({ ok: false, changes: [], staleCellIds: [], errors: [reason] });
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key));
const validIds = ids => Array.isArray(ids) && ids.length > 0 && ids.length <= 20 && ids.every(id => typeof id === 'string' && /^[\w-]{1,64}$/.test(id)) && new Set(ids).size === ids.length;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Pure saved-document proposal. The caller must synchronize the live notebook
// frame before freezing and accepting, and authorize the canvas mutation.
export function previewNotebookCellEdit(input, { block, frozen, readOnly = false, requestId } = {}) {
  try {
    if (readOnly || block?.locked) return fail('This notebook is read-only or locked.');
    if (!keys(input, ['targetId', 'cellIds', 'edits', 'splits']) || !validIds(input.cellIds) || !Array.isArray(input.edits) || input.edits.length > 20) return fail('Invalid bounded notebook edit.');
    const splits = input.splits || [];
    if (!Array.isArray(splits) || splits.length > 20 || !input.edits.length && !splits.length) return fail('Invalid bounded notebook split.');
    if (splits.length && (typeof requestId !== 'string' || !/^[\w-]{8,80}$/.test(requestId))) return fail('Notebook splitting needs a stable request identity.');
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
    const partitions = new Map(), addedCellIds = [], usedIds = new Set(allIds);
    for (const split of splits) {
      if (!keys(split, ['id','offsets']) || !input.cellIds.includes(split.id) || edits.has(split.id) || partitions.has(split.id) || !Array.isArray(split.offsets) || !split.offsets.length || split.offsets.length > 3) return fail('Split only selected cells at one to three explicit source boundaries.');
      const cell = notebook.cells.find(value => value.id === split.id);
      if (!['code','markdown'].includes(cell.cell_type)) return fail('Only code and Markdown cells can be split.');
      if (!(typeof cell.source === 'string' || Array.isArray(cell.source) && cell.source.every(line => typeof line === 'string'))) return fail('Cell source must contain only text.');
      const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
      if (typeof source !== 'string' || split.offsets.some((offset,index) => !Number.isSafeInteger(offset) || offset <= (index ? split.offsets[index-1] : 0) || offset >= source.length || /[\uD800-\uDBFF]/.test(source[offset-1]) && /[\uDC00-\uDFFF]/.test(source[offset]))) return fail('Split boundaries must preserve nonempty source and Unicode characters.');
      const bounds = [0,...split.offsets,source.length];
      const parts = bounds.slice(1).map((end,index) => {
        const id = index === 0 ? cell.id : `split_${requestId.slice(0,40)}_${allIds.indexOf(cell.id)}_${index}`;
        if (index && usedIds.has(id)) throw Error('A split cell identity already exists.');
        if (index) { usedIds.add(id); addedCellIds.push(id); }
        return { ...cell, id, source: source.slice(bounds[index],end), metadata: index ? {} : cell.metadata };
      });
      partitions.set(split.id,parts);
    }
    if (addedCellIds.length > 20 || notebook.cells.length + addedCellIds.length > 1000) return fail('The split exceeds the notebook cell limit.');
    let invalidate = false;
    const staleCellIds = [];
    const cells = notebook.cells.flatMap(cell => {
      if (partitions.has(cell.id)) {
        if (cell.cell_type === 'code') invalidate = true;
        return partitions.get(cell.id).map(part => {
          if (part.cell_type !== 'code') return part;
          staleCellIds.push(part.id);
          return { ...part, outputs: [], execution_count: null };
        });
      }
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
    if (JSON.stringify(after.ipynb).length > 1000000) return fail('The split exceeds the notebook document limit.');
    return { ok: true, changes: same(block, after) ? [] : [{ id: block.id, list: 'blocks', before: block, after }], staleCellIds, addedCellIds, errors: [] };
  } catch {
    return fail('The notebook request or frozen document is malformed.');
  }
}
