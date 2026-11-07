// Ask about selection: what each card under the rectangle gives the model besides the picture. The picture is made by html-to-image,
// which cannot draw an iframe (the capture drops them), so a notebook, a PDF viewer or a YouTube player is a blank body in it. Each such
// card says so (omitted) and carries what the board saved about it (saved), so the model never reads a blank box as the card.
import { activePath, ipynbPath } from './learn-notebook.js';
import { describeYouTube, describeCanvasObject } from './learn-ask-target.js';

// Bounded: the server keeps the first 8000 characters of the target text (CANVAS_TARGET_LIMIT, learn-ask-context.js), and the coverage
// list comes before every excerpt, so a long excerpt can only cost itself.
export const EVIDENCE_LIMITS = Object.freeze({ cells: 6, cellChars: 400, cellsTotal: 2400, cardText: 700, excerpts: 3000 });

const clip = (text, max) => (text.length > max ? `${text.slice(0, max)} [cut, ${text.length - max} more characters]` : text);
const sourceOf = cell => (Array.isArray(cell?.source) ? cell.source.join('') : String(cell?.source ?? ''));

// The notebook's saved cells (the card's own nbformat copy): the first few, each cut; never outputs, which may be large or private.
export function savedCells(block) {
  const cells = activePath(block) === ipynbPath(block) ? block.ipynb?.cells : null;
  if (!Array.isArray(cells) || !cells.length) return 'No saved cells.';
  const shown = [];
  let used = 0;
  for (const cell of cells.slice(0, EVIDENCE_LIMITS.cells)) {
    const text = clip(sourceOf(cell).trim(), EVIDENCE_LIMITS.cellChars);
    if (used + text.length > EVIDENCE_LIMITS.cellsTotal) break;
    used += text.length;
    shown.push(`[${cell.cell_type || 'code'} ${shown.length + 1}] ${text || '(empty)'}`);
  }
  return [`Saved cells (${shown.length} of ${cells.length}):`, ...shown].join('\n');
}

// { omitted?, saved?, savedLabel? } for a card, or {} when the picture is all there is and the card has no text of its own.
export function cardEvidence(block) {
  switch (block.type) {
    case 'notebook': return { omitted: 'the live notebook pane is omitted', saved: savedCells(block), savedLabel: 'Saved cells' };
    case 'pdf': return { omitted: 'the embedded PDF viewer is omitted and the visible page is unknown', saved: describeCanvasObject(block)?.text || `PDF on the canvas: ${block.label || 'untitled'}`, savedLabel: 'File' };
    case 'video': return block.videoId ? { omitted: 'the playback frame and the current time are unavailable', saved: describeYouTube(block), savedLabel: 'Saved moment' } : {};
    case 'animation3d': return { omitted: 'the live 3D visuals are unverified', saved: `3D scene${block.title ? ` "${block.title}"` : ''}`, savedLabel: 'Saved state' };
    default: {
      const text = describeCanvasObject(block)?.text;
      return text ? { saved: clip(text, EVIDENCE_LIMITS.cardText), savedLabel: 'Card text' } : {};
    }
  }
}
