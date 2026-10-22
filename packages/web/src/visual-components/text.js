// Label measurement and wrapping for compiled components. Scene text draws on
// one line per object (AnimatedScene.jsx), so a long label becomes several
// text lines here, measured with the same estimate the layout lint and the
// renderer's label placement use (scene-layout.js estimateTextBox).
import { estimateTextBox } from '../scene-layout.js';
import { textStyle } from '../scene-style.js';
import { ROLES, ROLE_FILL } from '../scene-vocab.js';

// Roles a component may give a box that holds wrapped text: neutral ink stays
// readable on soft and strong fills, not on the solid ones.
export const BOX_ROLES = ROLES.filter(role => ROLE_FILL[role] !== 'solid');

export const lineHeight = typography => Math.ceil(textStyle(typography).fontSize * 1.4);

export function textWidth(text, typography = 'body') {
  const box = estimateTextBox({ text, x: 0, y: 0, fontSize: textStyle(typography).fontSize, anchor: 'start', baseline: 'auto' });
  return Math.ceil(box.xMax - box.xMin);
}

// Greedy word wrap; a single word wider than the line is split, never
// overflowed. Same input, same lines.
export function wrapText(text, maxWidth, typography = 'body') {
  const perChar = textWidth('x', typography) || 1;
  const maxChars = Math.max(1, Math.floor(maxWidth / perChar));
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const pieces = word.length > maxChars ? word.match(new RegExp(`.{1,${maxChars}}`, 'gu')) : [word];
    for (const piece of pieces) {
      const next = line ? `${line} ${piece}` : piece;
      if (next.length > maxChars && line) { lines.push(line); line = piece; } else line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// Plain text of a label. Math runs need T04-M2's typeset label path; until
// then they are refused, never shown as raw LaTeX that looks like success.
export function labelText(label) {
  if (label == null) return '';
  if (typeof label === 'string') return label;
  const math = label.runs.find(run => run.kind === 'math');
  if (math) throw new Error(`math labels are not supported by this compiler yet ("${math.tex.slice(0, 40)}")`);
  return label.runs.map(run => run.text).join('');
}

const PAD = 16;
// A box whose label fits on one line keeps it as the box's own label (drawn
// centred by the renderer); a longer one wraps into text lines inside the
// box. Width grows with the text between minWidth and maxWidth.
export function labelledBox({ id, text, role = 'neutral', minWidth, maxWidth, minHeight = 56, typography = 'body' }) {
  const oneLine = textWidth(text, typography) + 2 * PAD;
  if (oneLine <= maxWidth) {
    const w = Math.max(minWidth, oneLine);
    return { w, h: minHeight, objects: [{ id, type: 'box', initialState: { label: text, x: 0, y: 0, w, h: minHeight, role } }] };
  }
  const lines = wrapText(text, maxWidth - 2 * PAD, typography);
  const step = lineHeight(typography);
  const h = Math.max(minHeight, lines.length * step + 2 * PAD);
  const top = (h - lines.length * step) / 2;
  return {
    w: maxWidth, h,
    objects: [
      { id, type: 'box', initialState: { x: 0, y: 0, w: maxWidth, h, role } },
      // A text object draws from its baseline; 0.8 of a line sits above it.
      ...lines.map((line, index) => ({ id: `${id}-line${index}`, type: 'text', initialState: { text: line, x: PAD, y: Math.round(top + index * step + step * 0.75), typography } })),
    ],
  };
}

export const sides = (w, h) => ({
  top: { x: w / 2, y: 0 }, bottom: { x: w / 2, y: h }, left: { x: 0, y: h / 2 }, right: { x: w, y: h / 2 },
});
