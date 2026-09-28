// The canvas notebook's document helpers (docs/features/canvas-notebook.md).
// The board stores a plain nbformat 4 document; nothing here invents a format.

export const NOTEBOOK_PROTOCOL = 'rh-notebook/1';
export const NOTEBOOK_ORIGIN = import.meta.env?.VITE_NOTEBOOK_ORIGIN || 'https://small-learn-notebook-dev.zeroshothq.workers.dev';
export const NOTEBOOK_URL = `${NOTEBOOK_ORIGIN}/notebooks/index.html?path=canvas.ipynb`;

// One output bigger than this is replaced by a note when saved.
const OUTPUT_LIMIT = 100000;

export function emptyNotebook() {
  return {
    cells: [{ cell_type: 'code', id: crypto.randomUUID().slice(0, 8), metadata: {}, outputs: [], execution_count: null, source: '' }],
    metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' }, language_info: { name: 'python' } },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

export function newNotebookBlock() {
  return { id: crypto.randomUUID(), type: 'notebook', notebook_id: crypto.randomUUID(), language: 'python', dx: 0, dy: 0, ipynb: emptyNotebook() };
}

// ponytail: a large plot or table is dropped rather than saved, so one output
// cannot fill localStorage; re-running the cell brings it back.
export function trimOutputs(ipynb) {
  if (!ipynb?.cells) return ipynb;
  const cells = ipynb.cells.map(cell => {
    if (!cell.outputs?.some(output => JSON.stringify(output).length > OUTPUT_LIMIT)) return cell;
    return {
      ...cell,
      outputs: cell.outputs.map(output => (JSON.stringify(output).length > OUTPUT_LIMIT
        ? { output_type: 'stream', name: 'stdout', text: '[This output was too large to save with the board. Run the cell again to see it.]\n' }
        : output)),
    };
  });
  return { ...ipynb, cells };
}

export function describeNotebook(block) {
  const cells = block.ipynb?.cells || [];
  const count = type => cells.filter(cell => cell.cell_type === type).length;
  return {
    kind: 'Notebook',
    title: 'Notebook',
    text: `Jupyter notebook on the canvas (notebook_id ${block.notebook_id}, language ${block.language || 'python'}): ${cells.length} cells, ${count('code')} code and ${count('markdown')} Markdown.`,
  };
}
