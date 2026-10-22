// The canvas notebook's card helpers (docs/features/canvas-notebook.md). A card
// is a small Jupyter workspace: its files live in the notebook origin's browser
// storage under the card's notebook_id; the card keeps the manifest (active
// path, file list) and a plain nbformat 4 copy of its active notebook.

import { codeLang } from './code-lang.js';

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

// Open in notebook (docs/features/canvas-notebook.md): a new notebook card holding a code card's code - a Code box's text
// or a Code sample's code in one cell; a Code exercise's Given setup, then its current code, so Run all runs.
// { disabled } for code a notebook cannot run; null for anything that is not a code card. The code card is never touched.
export function notebookFromCode(entry) {
  const box = entry?.kind === 'text' && entry.mode === 'code';
  if (!box && entry?.type !== 'code' && entry?.type !== 'snippet') return null;
  if ((box ? codeLang(entry) : String(entry.language || 'python').toLowerCase()) !== 'python') return { disabled: 'Notebooks run Python only' };
  const block = newNotebookBlock();
  const [cell] = block.ipynb.cells;
  const sources = box ? [entry.text] : entry.type === 'snippet' ? [entry.code] : [entry.setup, entry.draft ?? entry.starter];
  const cells = sources.map((source, index) => ({ ...cell, id: index ? crypto.randomUUID().slice(0, 8) : cell.id, source: String(source ?? '') }));
  return { block: { ...block, ipynb: { ...block.ipynb, cells } } };
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

// The frame reports its notebook as JupyterLab's toJSON, in another key order than the card's copy (@jupyter/ydoc
// YNotebook.toJSON: metadata, nbformat_minor, nbformat, cells), and the kernel writes language_info and kernelspec when
// it starts. Neither is an edit, so neither may change the board: copying them on open made a device that only opened
// the canvas save it, and the other device's next edit a 409 (cross-device-report.md, gate 39735737303).
// shortcut: an edit to only language_info or kernelspec is not copied onto the card; it goes with the next real edit.
const sorted = value => (Array.isArray(value) ? value.map(sorted)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value);
const canonical = ipynb => { const { language_info, kernelspec, ...metadata } = ipynb?.metadata || {}; return JSON.stringify(sorted({ ...ipynb, metadata })); };
export const sameNotebook = (a, b) => canonical(a) === canonical(b);

// What a notebook document reported by the frame changes on its card: { ipynb_path, ipynb }, or null for nothing (not
// the open notebook, or the card already holds this document).
export function notebookWriteBack(block, path, ipynb) {
  if (path !== activePath(block)) return null;
  if (path === ipynbPath(block) && sameNotebook(block.ipynb, ipynb)) return null;
  return { ipynb_path: path, ipynb };
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
