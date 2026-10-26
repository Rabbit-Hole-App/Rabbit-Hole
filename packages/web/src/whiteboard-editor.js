// The native Whiteboard editor's rules (docs/features/tldraw-removal.md, workstream A): what a card shows, how an edit becomes
// a saved block, what is persisted, and the card's view (Fit, focus, reset). Pure, so Node tests drive the whole state machine.
// The marks themselves are drawn and edited by the canvas's own tools (AdaptiveCanvas drawGesture); undo and redo are the
// canvas's block-level history, which restores the block objects this module returns, so every edit is one step.
import { deriveSketch } from './whiteboard-derive.js';
import { sigmoidSketch } from './whiteboard-seed.js';
import {
  IDENTITY_VIEW, emptySketch, fitView, focusView, initialView, legacyState, mayPersist, normalizeSketch, saveVerdict, withSketch, withStrokeIds,
} from './whiteboard-sketch.js';

// Above this size the whole board is measured too (JSON of the board is costly per pointer move); below it a sketch cannot be
// what pushes a board over its limit by itself. ponytail: a small edit on an already full board is stopped by the server and the
// page's size warning (LearnPage boardSizeWarning), not here.
const MEASURE_BOARD_AT = 100_000;

// ---------- what the card shows ----------
const shown = new WeakMap();
// The effective sketch of a whiteboard block: the saved one, else (a block with a tldraw snapshot) the one derived in memory,
// else the seeded demo, else empty. Strokes carry ids (withStrokeIds). Cached per block object; deriving never writes.
export function sketchOf(block) {
  if (!block) return emptySketch();
  let sketch = shown.get(block);
  if (!sketch) {
    sketch = withStrokeIds(block.sketch != null ? block.sketch : block.snapshot != null ? deriveSketch(block).sketch : block.demo === 'sigmoid' ? sigmoidSketch() : emptySketch());
    shown.set(block, sketch);
  }
  return sketch;
}
// A snapshot that cannot be converted yet (the migration seam): the card shows the original's kept layer, saves nothing.
export const conversionPending = block => block?.snapshot != null && block.sketch == null && deriveSketch(block).pending === true;

// ---------- an edit becomes a saved block ----------
// `change` maps the sketch to the next one. A viewer who may not edit, or a board that is not converted yet, gets the block back
// unchanged (no write). A sketch that does not fit stays on screen with `tooLarge`; the last fitting sketch rides along as
// `savedSketch` so persistable() can save that instead. The snapshot is never touched.
export function editWhiteboard(block, change, { readOnly = false, canEdit = true, boardChars = null } = {}) {
  if (!mayPersist({ readOnly, canEdit }) || conversionPending(block)) return block;
  const sketch = withStrokeIds(change(sketchOf(block)));
  const next = withSketch(block, sketch);
  const small = JSON.stringify(normalizeSketch(sketch)).length <= MEASURE_BOARD_AT;
  const verdict = saveVerdict({ block, sketch, boardChars: small ? 0 : boardChars?.() ?? 0 });
  delete next.savedSketch;
  if (verdict.ok) return next;
  return { ...next, tooLarge: true, savedSketch: block.tooLarge ? block.savedSketch ?? null : block.sketch ?? null };
}
// One list of the sketch (the canvas's gesture code edits one list at a time).
export const editList = (block, key, change, options) => editWhiteboard(block, sketch => ({ ...sketch, [key]: change(sketch[key] || []) }), options);

// What a save writes. A block whose sketch did not fit is saved with the last sketch that did (or none), so the oversize
// drawing lasts until a reload, as an over-size tldraw board did; the snapshot is always saved whole.
export function persistable(block) {
  if (block?.type !== 'whiteboard' || !block.tooLarge) return block;
  const { tooLarge, savedSketch, sketch, ...rest } = block;
  return savedSketch != null ? { ...rest, sketch: savedSketch } : rest;
}

// A tutor answer's marks merged into a sketch. A mark already there (same id: a retry or a reload) is not added twice. Used with
// one editWhiteboard, so the whole answer is one edit and one undo step.
export function mergeMarks(sketch, marks) {
  const add = normalizeSketch(marks), have = new Set([...sketch.strokes, ...sketch.shapes, ...sketch.items].map(mark => mark.id));
  const fresh = list => list.filter(mark => !have.has(mark.id));
  return { strokes: [...sketch.strokes, ...fresh(add.strokes)], shapes: [...sketch.shapes, ...fresh(add.shapes)], items: [...sketch.items, ...fresh(add.items)] };
}
export const addMarks = (block, marks, options) => editWhiteboard(block, sketch => mergeMarks(sketch, marks), options);

// The note the card shows under its title, or ''.
export function boardNotice(block) {
  if (conversionPending(block)) return 'This board has not been converted yet, so it cannot be edited here. Your original drawing is kept.';
  if (block.tooLarge) return 'This drawing is too large to save; it stays until you reload.';
  if (legacyState(block) === 'diverged') return 'The original board was changed in an older version. Your drawing is shown and the original is kept.';
  return '';
}

// ---------- the card's view: Fit, focus, reset (never saved, never shared, never a write) ----------
// state = { view, auto }. auto: the view was chosen by the card (open or resize), so a resize or a new frame chooses again;
// a Fit, Reset or focus the learner pressed is kept.
export const VIEW_START = { view: IDENTITY_VIEW, auto: true };
export function viewStep(state, action) {
  const { sketch, frame } = action;
  if (!frame?.w || !frame?.h) return state;
  switch (action.type) {
    case 'frame': return state.auto ? { view: initialView(sketch, frame), auto: true } : state;
    case 'fit': return { view: fitView(sketch, frame), auto: false };
    case 'reset': return { view: IDENTITY_VIEW, auto: false };
    case 'focus': return { view: focusView(action.rect, frame), auto: false };
    default: return state;
  }
}

// A selection that only keeps marks that still exist (after a delete, an undo or a Tutor removal).
export const pruneSelection = (selection, sketch) => {
  const ids = new Set([...sketch.shapes, ...sketch.items].map(mark => mark.id));
  const kept = selection.filter(id => ids.has(id));
  return kept.length === selection.length ? selection : kept;
};
