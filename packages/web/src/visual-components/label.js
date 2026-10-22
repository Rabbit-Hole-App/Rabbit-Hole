// LabelContent -> the scene's label runs (EXP-T04 M2). Lane B owns the runs
// shape and its renderer (animation-scene.js runSchema, AnimatedScene.jsx
// RunsLabel); this only splits authored content into lines that fit and
// emits that shape. Text stays text (code and non-Latin prose included);
// only explicit math runs are typeset, never strings that look like maths.
import { plainMath } from '../animation-scene.js';
import { lineHeight, textWidth } from './text.js';

const MAX_RUNS = 16, MAX_RUN_TEXT = 200;

export const labelRuns = label => (typeof label === 'string' ? [{ kind: 'text', text: label }] : label.runs);
const pieceText = piece => (piece.kind === 'math' ? plainMath(piece.tex) : piece.text);
export const plainLabel = label => labelRuns(label).map(pieceText).join('');
export const hasMath = label => typeof label !== 'string' && label.runs.some(run => run.kind === 'math');

// Width is estimated from the plain reading, the same text RunsLabel and the
// layout lint measure, so the compiler, renderer box and lint agree.
// shortcut: estimated, not glyph-measured bounds; the T18 render check is what sees real KaTeX widths.
export const labelWidth = (label, typography = 'body') => textWidth(plainLabel(label), typography);

// Merge adjacent text pieces so a line carries as few runs as possible.
function toRuns(pieces) {
  const runs = [];
  for (const piece of pieces) {
    const last = runs[runs.length - 1];
    if (piece.kind === 'text' && last?.kind === 'text' && last.text.length + piece.text.length <= MAX_RUN_TEXT) last.text += piece.text;
    else runs.push({ ...piece });
  }
  return runs;
}

// Greedy wrap at word boundaries; a math run never breaks. Returns one entry
// per line: its plain reading and, when it holds math, its runs.
export function wrapLabel(label, maxWidth, typography = 'body') {
  const perChar = textWidth('x', typography) || 1;
  const maxChars = Math.max(1, Math.floor(maxWidth / perChar));
  // Words keep their trailing space so joining pieces restores the prose.
  const pieces = labelRuns(label).flatMap(run => (run.kind === 'math' ? [run]
    : run.text.match(/\S+\s*|\s+/g).flatMap(word => (word.trimEnd().length > maxChars ? word.match(new RegExp(`.{1,${maxChars}}`, 'gsu')) : [word]))
      .map(text => ({ kind: 'text', text }))));
  const lines = [];
  let line = [];
  const width = list => list.map(pieceText).join('').trimEnd().length;
  for (const piece of pieces) {
    if (piece.kind === 'math' && plainMath(piece.tex).length > maxChars) throw new Error(`the formula "${piece.tex.slice(0, 60)}" is wider than its ${maxWidth}px line`);
    if (line.length && width([...line, piece]) > maxChars) { lines.push(line); line = []; }
    if (!line.length && piece.kind === 'text' && !piece.text.trim()) continue;
    line.push(piece);
  }
  if (line.length) lines.push(line);
  return lines.map(list => {
    const last = list[list.length - 1];
    if (last.kind === 'text') list[list.length - 1] = { kind: 'text', text: last.text.trimEnd() };
    const kept = list.filter(piece => piece.kind === 'math' || piece.text);
    const plain = kept.map(pieceText).join('');
    if (!kept.some(piece => piece.kind === 'math')) return { plain, runs: null };
    const runs = toRuns(kept);
    if (runs.length > MAX_RUNS) throw new Error(`a label line holds ${runs.length} runs (at most ${MAX_RUNS})`);
    return { plain, runs };
  });
}

// The initialState fields one line puts on a scene object: a plain label (or
// text, for a text object) always, the runs only when the line holds math.
export const lineFields = (line, field = 'label') => ({ [field]: line.plain, ...(line.runs ? { runs: line.runs } : {}) });

const PAD = 16;
// A box whose label fits on one line keeps it as the box's own label (drawn
// centred by the renderer); a longer one wraps into text lines inside the
// box. Width grows with the label between minWidth and maxWidth.
export function labelledBox({ id, label, role = 'neutral', minWidth, maxWidth, minHeight = 56, typography = 'body' }) {
  const oneLine = labelWidth(label, typography) + 2 * PAD;
  if (oneLine <= maxWidth) {
    const w = Math.max(minWidth, oneLine);
    const [line] = wrapLabel(label, Infinity, typography);
    return { w, h: minHeight, objects: [{ id, type: 'box', initialState: { ...lineFields(line), x: 0, y: 0, w, h: minHeight, role } }] };
  }
  const lines = wrapLabel(label, maxWidth - 2 * PAD, typography);
  const step = lineHeight(typography);
  const h = Math.max(minHeight, lines.length * step + 2 * PAD);
  const top = (h - lines.length * step) / 2;
  return {
    w: maxWidth, h,
    objects: [
      { id, type: 'box', initialState: { x: 0, y: 0, w: maxWidth, h, role } },
      // A text object draws from its baseline; 0.75 of a line sits above it.
      ...lines.map((line, index) => ({ id: `${id}-line${index}`, type: 'text', initialState: { ...lineFields(line, 'text'), x: PAD, y: Math.round(top + index * step + step * 0.75), typography } })),
    ],
  };
}
