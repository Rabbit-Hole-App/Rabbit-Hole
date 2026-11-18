// Learn sections C §3: a notebook item. The Make turn writes the cells; the server builds the nbformat 4 files (the shape
// learn-notebook.js emptyNotebook makes), checks them (C §3d) and marks the cells today's runtime cannot run, never refusing an import.
import { anchorText } from './graph.js';

const MIN_CELLS = 3, MAX_CELLS = 16, MAX_CODE_LINES = 40, MAX_MARKDOWN_WORDS = 150;
// The copy table's sentence (C §3d), appended to the markdown cell before a cell the runtime cannot run.
export const UNAVAILABLE_SENTENCE = pkg => `This cell needs ${pkg}, which the notebook can't run here yet; read it, and run it in your own environment.`;
const KERNEL = { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' }, language_info: { name: 'python' } };
const NETWORK = /^\s*(?:import|from)\s+(?:requests|urllib\d?|http|socket|httpx|aiohttp|ftplib|smtplib|pyodide\.http)\b|\b(?:urlopen|pyfetch|open_url|wget|curl)\s*\(|\bfetch\s*\(\s*['"]https?:|['"]https?:\/\//m;
const PLACEHOLDER = /your code here|^\s*(?:pass|\.\.\.)\s*$|#\s*todo\b/im;
const cell = { type: 'object', additionalProperties: false, required: ['type', 'source'], properties: { type: { type: 'string', enum: ['markdown', 'code'] }, source: { type: 'string', maxLength: 4000 } } };

export const fields = {
  notebooks: {
    type: 'array', minItems: 1, maxItems: 3, description: 'One .ipynb per notebook; the first opens.',
    items: { type: 'object', additionalProperties: false, required: ['path', 'cells'], properties: { path: { type: 'string', pattern: '^[\\w-]+\\.ipynb$' }, cells: { type: 'array', minItems: MIN_CELLS, maxItems: MAX_CELLS, items: cell } } },
  },
  helpers: {
    type: 'array', maxItems: 4, description: 'Shared .py files of the workspace, including those copied from an earlier section\'s notebook (buildup).',
    items: { type: 'object', additionalProperties: false, required: ['path', 'content'], properties: { path: { type: 'string', pattern: '^[\\w-]+\\.py$' }, content: { type: 'string', maxLength: 8000 } } },
  },
  continues: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 40 }, description: 'buildup: the section ids whose notebooks this one continues.' },
};
export const required = ['notebooks'];
export const tools = ['read_source', 'search_code', 'get_relationships'];

// `while True` with no break in the same cell.
const endless = code => /^\s*while\s+(?:True|1)\s*:/m.test(code) && !/\bbreak\b/.test(code);
const modulesOf = code => [...String(code).matchAll(/^[ \t]*(?:from[ \t]+([\w.]+)[ \t]+import[ \t]+([\w, \t]+)|import[ \t]+([\w.]+))/gm)].map(m => ({ module: (m[1] ?? m[3]).split('.')[0], names: m[2] ? m[2].split(',').map(x => x.trim().split(/\s+/)[0]).filter(Boolean) : [] }));
const defines = (text, name) => new RegExp(`^(?:def|class)\\s+${name}\\b|^${name}\\s*=`, 'm').test(text);

function checkCells(nb, content, ctx) {
  const cells = nb.cells, code = cells.filter(c => c.type === 'code'), markdown = cells.filter(c => c.type === 'markdown');
  if (cells.length < MIN_CELLS || cells.length > MAX_CELLS) return `${nb.path} has ${cells.length} cells; a notebook has ${MIN_CELLS} to ${MAX_CELLS}`;
  if (cells[0].type !== 'markdown') return `${nb.path} must open with a markdown cell`;
  if (markdown.length < code.length) return `${nb.path} has ${code.length} code cells and ${markdown.length} markdown cells; explain as you go, at least one markdown cell per code cell`;
  for (const [i, c] of cells.entries()) {
    if (c.type === 'markdown' && c.source.trim().split(/\s+/).length > MAX_MARKDOWN_WORDS) return `${nb.path} cell ${i + 1} is over ${MAX_MARKDOWN_WORDS} words`;
    if (c.type !== 'code') continue;
    if (!c.source.trim() || PLACEHOLDER.test(c.source)) return `${nb.path} cell ${i + 1} is empty or a placeholder; every code cell runs as given`;
    if (c.source.split('\n').length > MAX_CODE_LINES) return `${nb.path} cell ${i + 1} is over ${MAX_CODE_LINES} lines`;
    if (endless(c.source)) return `${nb.path} cell ${i + 1} has a while True loop with no break`;
    if (NETWORK.test(c.source)) return `${nb.path} cell ${i + 1} reaches the network; the notebook runs offline`;
  }
  if (content === 'source') {
    // The source's lines, unchanged but for imports, the first (parameter) cell and the last (entry) cell.
    const anchored = anchorText(ctx), lines = new Set(anchored.split('\n').map(l => l.trim()).filter(Boolean));
    const body = code.slice(1, -1).flatMap(c => c.source.split('\n')).map(l => l.trim()).filter(l => l && !l.startsWith('#') && !/^(?:import|from)\s/.test(l));
    const changed = body.find(l => !lines.has(l));
    if (changed) return `"${changed.slice(0, 80)}" is not in the source's anchored lines; copy the source unchanged except imports and the entry call`;
    const params = [...anchored.matchAll(/^([A-Za-z_]\w*)\s*=\s*(?:-?[\d.]+(?:e-?\d+)?|True|False|None|['"][^'"\n]*['"])\s*(?:#.*)?$/gm)].map(m => m[1]);
    const missing = params.find(p => !defines(code[0]?.source ?? '', p));
    if (missing) return `The first code cell must set every parameter the source exposes here; ${missing} is missing`;
  }
  return null;
}

export async function validate(input, ctx, { unavailableImports = null } = {}) {
  const content = ctx.item?.content, notebooks = input.notebooks ?? [], helpers = input.helpers ?? [];
  if (!['source', 'authored', 'buildup'].includes(content)) return { error: 'A notebook item needs content source, authored or buildup' };
  if (!notebooks.length) return { error: 'Give at least one notebook' };
  const paths = [...notebooks.map(n => n.path), ...helpers.map(h => h.path)];
  if (new Set(paths).size !== paths.length) return { error: 'Every file in the workspace needs its own path' };
  for (const nb of notebooks) { const problem = checkCells(nb, content, ctx); if (problem) return { error: problem }; }
  for (const h of helpers) {
    if (endless(h.content)) return { error: `${h.path} has a while True loop with no break` };
    if (NETWORK.test(h.content)) return { error: `${h.path} reaches the network; the notebook runs offline` };
  }
  // buildup: what it imports from a workspace helper is defined there (C §3d), and the lineage is recorded.
  const helperOf = Object.fromEntries(helpers.map(h => [h.path.replace(/\.py$/, ''), h.content]));
  if (content === 'buildup') {
    if (!input.continues?.length) return { error: 'A buildup notebook names the earlier sections it continues' };
    for (const { module, names } of notebooks.flatMap(nb => nb.cells.filter(c => c.type === 'code').flatMap(c => modulesOf(c.source)))) {
      if (!(module in helperOf)) continue;
      const absent = names.find(n => !defines(helperOf[module], n));
      if (absent) return { error: `${absent} is imported from ${module}.py but not defined there; copy the earlier section's helper in` };
    }
  }
  // ponytail: dynamic so the tests can inject the list while BROWSER's notebook-runtime.js lands (BLOCKERS.md).
  const unavailable = unavailableImports ?? (await import('../../../web/src/notebook-runtime.js')).unavailableImports;
  const runtime = [], files = [];
  for (const nb of notebooks) {
    const cells = nb.cells.map(c => ({ ...c }));
    cells.forEach((c, i) => {
      if (c.type !== 'code') return;
      const pkg = unavailable(c.source).find(p => !(p in helperOf));
      if (!pkg) return;
      c.runtime = pkg;
      runtime.push({ path: nb.path, cell: i, package: pkg });
      const before = cells.slice(0, i).findLast(x => x.type === 'markdown');
      before.source = `${before.source.trimEnd()}\n\n${UNAVAILABLE_SENTENCE(pkg)}`;
    });
    const ipynb = {
      cells: cells.map((c, i) => (c.type === 'markdown'
        ? { cell_type: 'markdown', id: `c${i + 1}`, metadata: {}, source: c.source }
        : { cell_type: 'code', id: `c${i + 1}`, metadata: c.runtime ? { runtime: 'unavailable', package: c.runtime } : {}, outputs: [], execution_count: null, source: c.source })),
      metadata: KERNEL, nbformat: 4, nbformat_minor: 5,
    };
    files.push({ path: nb.path, content: JSON.stringify(ipynb) });
  }
  for (const h of helpers) files.push({ path: h.path, content: h.content });
  const lineage = content === 'buildup' ? [...input.continues, ...(ctx.section?.id ? [ctx.section.id] : [])] : null;
  return { perform: { op: 'notebook', files, activePath: notebooks[0].path, runtime }, record: { content, ...(lineage ? { notebookLineage: lineage } : {}), ...(runtime.length ? { runtime } : {}) } };
}
