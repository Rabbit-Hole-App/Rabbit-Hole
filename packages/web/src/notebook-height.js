// The Full content height of a notebook card (card-layout.js): "every cell drawn, the card as tall as its content".
// The notebook itself runs in an iframe on its own origin (NotebookCard.jsx), so the page cannot measure it. This estimates
// the height JupyterLab gives the card's copy of the active notebook (block.ipynb) at a given card width, from JupyterLab's
// own metrics (13px code at 17px lines, 21px prose lines). It errs high: a few blank pixels under the last cell beat a clipped
// cell. ponytail: an estimate, not a measurement; the exact height needs the notebook site's bridge (notebook-canvas/
// canvas-bridge.js) to report the rendered height, which is a separate site deploy. Replace this then.
export const NOTEBOOK_CHROME = 96; // toolbar, notebook padding, and the room below the last cell
const CODE_LINE = 17, PROSE_LINE = 21, CELL = 24, OUTPUT = 12, MONO = 7.8, PROSE = 7.2, PROMPT = 110, IMAGE = 240;

const text = value => (Array.isArray(value) ? value.join('') : String(value ?? ''));
const lines = (value, perLine) => text(value).replace(/\n$/, '').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);

// A PNG's own height at the width it is drawn, read from its header (bytes 16 to 24 of the file), else a fixed allowance.
function imageHeight(data, width) {
  try {
    const head = atob(text(data).replace(/\s/g, '').slice(0, 44)), at = index => head.charCodeAt(index);
    const w = (at(16) << 24 | at(17) << 16 | at(18) << 8 | at(19)) >>> 0, h = (at(20) << 24 | at(21) << 16 | at(22) << 8 | at(23)) >>> 0;
    return w && h ? Math.ceil(h * Math.min(1, width / w)) : IMAGE;
  } catch { return IMAGE; }
}

function outputHeight(output, width) {
  const perLine = Math.max(20, Math.floor(width / MONO));
  if (output.output_type === 'stream') return OUTPUT + lines(output.text, perLine) * CODE_LINE;
  if (output.output_type === 'error') return OUTPUT + lines((output.traceback || []).join('\n').replace(/\u001b\[[0-9;]*m/g, ''), perLine) * CODE_LINE;
  const data = output.data || {};
  if (data['image/png']) return OUTPUT + imageHeight(data['image/png'], width);
  if (data['image/jpeg'] || data['image/svg+xml']) return OUTPUT + IMAGE;
  const html = data['text/html'];
  if (html) return OUTPUT + lines(text(html).replace(/<[^>]*>/g, ' ').trim(), perLine) * PROSE_LINE + CELL;
  return OUTPUT + lines(data['text/plain'], perLine) * CODE_LINE;
}

function cellHeight(cell, width) {
  const inner = Math.max(120, width - PROMPT), source = text(cell.source);
  if (cell.cell_type === 'markdown') {
    const perLine = Math.max(20, Math.floor(inner / PROSE));
    return CELL + source.split('\n').reduce((sum, line) => sum + (line.trim() ? Math.ceil(line.length / perLine) * (/^#{1,6}\s/.test(line) ? PROSE_LINE * 1.6 : PROSE_LINE) + 8 : 6), 0);
  }
  // Code does not wrap in the editor, so every source line is one line.
  return CELL + Math.max(1, source.split('\n').length) * CODE_LINE + 8 + (cell.outputs || []).reduce((sum, output) => sum + outputHeight(output, inner), 0);
}

export const notebookHeight = (ipynb, width) => Math.ceil(NOTEBOOK_CHROME + (ipynb?.cells || []).reduce((sum, cell) => sum + cellHeight(cell, width), 0));
