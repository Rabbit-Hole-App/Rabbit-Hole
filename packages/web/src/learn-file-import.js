// Importing a .ipynb or .py onto the canvas (docs/features/canvas-file-drop.md). Pure: the caller reads the file, caches its
// bytes and places the card. Nothing here runs code, installs anything or calls the network; a notebook card opens its
// cells in the notebook runtime and runs them only from its own Run all.
import { newNotebookBlock, trimOutputs } from './learn-notebook.js';

const MB = 1024 * 1024;
// A File attachment is a board file: the board's server copy takes files up to 25 MB (LearnPage syncAssets).
export const IMPORT_LIMIT = 25 * MB;
// A notebook or code card keeps its content in the canvas itself, whose saved copy is capped at 1.9 MB (learn-boards.js MAX_STATE).
export const CARD_LIMIT = 1_900_000;

export const IMPORT_CHOICES = {
  ipynb: [['notebook', 'Notebook'], ['attachment', 'File attachment']],
  py: [['code', 'Code card'], ['notebook', 'Notebook'], ['attachment', 'File attachment']],
  // Code pasted onto the canvas (docs/features/repository-browser.md "Files in Learn"): the same dialog, these two choices only.
  paste: [['code', 'Code card'], ['notebook', 'Jupyter notebook']],
};
export const importKind = (name) => (/\.ipynb$/i.test(name || '') ? 'ipynb' : /\.py$/i.test(name || '') ? 'py' : null);
const mb = (n) => `${(n / MB).toFixed(1)} MB`;
// A file name as the notebook workspace keeps it: one file at its top level.
const fileName = (name) => String(name || 'file').replace(/[/\\]/g, '_');

// Before anything is read: { kind } or { error }, the error a visible line that names the file.
export function checkImport(file) {
  const kind = importKind(file.name);
  if (!kind) return { error: `${file.name || 'That file'}: add a .ipynb notebook or a .py file` };
  if (!file.size) return { error: `${file.name}: the file is empty` };
  if (file.size > IMPORT_LIMIT) return { error: `${file.name} is ${mb(file.size)}; files up to 25 MB can be added to a canvas` };
  return { kind };
}

// Saved outputs a notebook card shows: text, Markdown and PNG or JPEG images. Anything else (HTML, JavaScript, widgets) is
// replaced by a line naming it, so no script from a saved output ever reaches the page, and nothing goes silently.
const SHOWN = new Set(['text/plain', 'text/markdown', 'image/png', 'image/jpeg']);
const note = (text) => ({ output_type: 'stream', name: 'stdout', text: `[${text}]\n` });
export function safeOutputs(ipynb) {
  return {
    ...ipynb,
    cells: ipynb.cells.map((cell) => {
      if (cell.cell_type !== 'code' || !Array.isArray(cell.outputs)) return cell;
      return { ...cell, outputs: cell.outputs.map((output) => {
        if (output?.output_type === 'stream' || output?.output_type === 'error') return output;
        if (!output?.data || typeof output.data !== 'object') return note('Output not shown');
        const kept = Object.fromEntries(Object.entries(output.data).filter(([type]) => SHOWN.has(type)));
        const dropped = Object.keys(output.data).filter((type) => !SHOWN.has(type));
        if (!Object.keys(kept).length) return note(`Output not shown: ${dropped.join(', ')}`);
        return { ...output, data: kept };
      }) };
    }),
  };
}

// A saved Jupyter notebook (nbformat 4): its cells, Markdown and supported outputs as they are. Throws a visible line.
export function parseNotebook(text, name) {
  let notebook;
  try { notebook = JSON.parse(text); } catch (error) { throw Error(`${name} is not valid notebook JSON (${error.message}). Add it as a File attachment to keep it as it is.`); }
  if (!notebook || typeof notebook !== 'object' || notebook.nbformat !== 4 || !Array.isArray(notebook.cells)) {
    throw Error(`${name}: only Jupyter notebooks in format 4 open as a notebook card. Add it as a File attachment to keep it as it is.`);
  }
  const cells = notebook.cells.filter((cell) => cell && typeof cell === 'object').map((cell) => ({
    ...cell,
    cell_type: ['code', 'markdown', 'raw'].includes(cell.cell_type) ? cell.cell_type : 'raw',
    source: Array.isArray(cell.source) ? cell.source.join('') : String(cell.source ?? ''),
    metadata: cell.metadata && typeof cell.metadata === 'object' ? cell.metadata : {},
    ...(cell.cell_type === 'code' ? { outputs: Array.isArray(cell.outputs) ? cell.outputs : [], execution_count: cell.execution_count ?? null } : {}),
  }));
  return { ...notebook, cells, metadata: notebook.metadata && typeof notebook.metadata === 'object' ? notebook.metadata : {} };
}

// A .py as a notebook: its code in one cell, never run; the original file sits beside it in the workspace.
export function pyNotebook(text) {
  return {
    cells: [{ cell_type: 'code', id: crypto.randomUUID().slice(0, 8), metadata: {}, outputs: [], execution_count: null, source: text }],
    metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' }, language_info: { name: 'python' } },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

// The card for a confirmed choice. `assetKey` holds the original bytes (cached and saved with the board), so the file
// itself survives whatever the card shows. Throws a visible line when the content cannot be a card.
export function importBlock({ name: raw, kind, choice, text, assetKey, size }) {
  const name = fileName(raw);
  if (!IMPORT_CHOICES[kind]?.some(([id]) => id === choice)) throw Error(`${name}: choose how to add it`);
  if (choice === 'attachment') return { id: crypto.randomUUID(), type: 'file', kind: 'attachment', dx: 0, dy: 0, assetKey, label: name, size };
  let block;
  if (choice === 'code') block = { id: crypto.randomUUID(), type: 'snippet', dx: 0, dy: 0, title: name, code: text, output: '', source_asset: assetKey };
  else if (kind === 'ipynb') block = { ...newNotebookBlock(), active_path: name, files: [name], ipynb_path: name, ipynb: trimOutputs(safeOutputs(parseNotebook(text, name))), source_asset: assetKey };
  else {
    const notebook = `${name.replace(/\.[^.]+$/, '')}.ipynb`; // train.py -> train.ipynb; a pasted utils.js keeps its own name beside it
    block = { ...newNotebookBlock(), active_path: notebook, files: [notebook, name], ipynb_path: notebook, ipynb: pyNotebook(text), seed_files: { [name]: text }, source_asset: assetKey };
  }
  const length = JSON.stringify(block).length;
  if (length > CARD_LIMIT) throw Error(`${name}: a ${choice === 'code' ? 'code' : 'notebook'} card keeps its content in the canvas, up to 1.90 MB, and this one needs ${(length / 1e6).toFixed(2)} MB. Add it as a File attachment (up to 25 MB) instead.`);
  return block;
}

// Pasted code (docs/features/repository-browser.md "Files in Learn"): the name the dialog shows and the card keeps - a Files copy's own file name, else
// snippet.py - and the card for the confirmed choice, through importBlock. A Files copy keeps its path and language, and a
// Code card its lines as a code source (card-sources.js), so the card says where it came from. Nothing runs or installs.
export const pasteName = (copy) => (copy?.path ? copy.path.split('/').pop() : 'snippet.py');
export function pasteBlock({ text, copy = null, choice, assetKey, language = null }) {
  const block = importBlock({ name: pasteName(copy), kind: 'paste', choice, text, assetKey, size: text.length });
  const lines = copy?.repo && Number.isInteger(copy.start) && Number.isInteger(copy.end) ? [copy.start, copy.end] : null;
  return {
    ...block,
    ...(copy?.path ? { path: copy.path } : {}),
    ...(language ? { language } : {}),
    ...(choice === 'code' && lines ? { sources: [{ kind: 'code', repo: copy.repo, revision: copy.commit, path: copy.path, lines }] } : {}),
  };
}
