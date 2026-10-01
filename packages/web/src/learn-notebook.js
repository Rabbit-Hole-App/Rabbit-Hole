// The canvas notebook's card helpers (docs/features/canvas-notebook.md). A card
// is a small Jupyter workspace: its files live in the notebook origin's browser
// storage under the card's notebook_id; the card keeps the manifest (active
// path, file list) and a plain nbformat 4 copy of its active notebook.

export const NOTEBOOK_PROTOCOL = 'rh-notebook/1';
// Production sets VITE_NOTEBOOK_ORIGIN (rabbit-hole-canvas-notebook); the default is the rabbit-hole account's dev site.
export const NOTEBOOK_ORIGIN = import.meta.env?.VITE_NOTEBOOK_ORIGIN || 'https://small-learn-canvas-notebook-dev.tryrabbithole.workers.dev';
export const notebookUrl = notebookId => `${NOTEBOOK_ORIGIN}/lab/index.html?mode=single-document&workspace=${encodeURIComponent(notebookId)}`;
export const FIRST_NOTEBOOK = 'notebook.ipynb';

// Tool Performance v1 (learn-warmup.js): open the notebook site once, hidden,
// so its code lands in the same browser cache partition the cards' frames use.
// No workspace is initialised, no notebook opens and no Python starts; the
// frame goes once loaded. 'warmup' can never be a card's workspace (a UUID).
export function warmNotebookSite() {
  return new Promise(resolve => {
    const frame = document.createElement('iframe');
    frame.src = notebookUrl('warmup');
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', left: '-20px', top: '-20px', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', border: '0' });
    const finish = () => { frame.remove(); resolve(); };
    frame.addEventListener('load', () => setTimeout(finish, 4000), { once: true });
    setTimeout(finish, 30000);
    document.body.appendChild(frame);
  });
}

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
  return { id: crypto.randomUUID(), type: 'notebook', notebook_id: crypto.randomUUID(), language: 'python', dx: 0, dy: 0, active_path: FIRST_NOTEBOOK, files: [FIRST_NOTEBOOK], ipynb_path: FIRST_NOTEBOOK, ipynb: emptyNotebook() };
}

// Cards made before workspaces carry only `ipynb`; they open as notebook.ipynb.
export const activePath = block => block.active_path || FIRST_NOTEBOOK;
export const ipynbPath = block => block.ipynb_path || block.active_path || FIRST_NOTEBOOK;

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

// What the tutor is told: the workspace's shape, never file contents.
export function describeNotebook(block) {
  const active = activePath(block);
  const files = block.files?.length ? block.files : [active];
  const cells = active === ipynbPath(block) ? block.ipynb?.cells : null;
  const count = type => cells.filter(cell => cell.cell_type === type).length;
  return {
    kind: 'Notebook',
    title: active,
    text: [
      `Jupyter notebook workspace on the canvas (notebook_id ${block.notebook_id}, language ${block.language || 'python'}).`,
      `Open file: ${active}${cells ? ` - ${cells.length} cells, ${count('code')} code and ${count('markdown')} Markdown` : ''}.`,
      `Files: ${files.join(', ')}.`,
    ].join('\n'),
  };
}
