// Validated application of an inline AI result (docs/features/inline-ai-editor.md §8-§11). Permission is enforced here,
// in code, never by a prompt: an edit may touch only the frozen target's ids (only its range, when a range was
// selected), only through the listed operations and fields, and never moves, regroups, deletes, restyles a neighbour or
// switches Text|Code. An explanation adds one note (and, when it helps, one annotation connector) beside the target.
// Pure: the canvas applies the transaction this returns in one undo step.
import { reconcileRuns, runsOf, sliceRuns, spliceRuns, textPatch, fontSize as validSize, hexColor } from './learn-rich-text.js';
import { TEXT_LEVELS } from './learn-style-panel.js';
import { LIMITS } from './inline-ai-context.js';

export const EDIT_OPS = ['replace_text', 'replace_range', 'set_style'];
const STYLE_KEYS = ['fontSize', 'level', 'bold', 'italic', 'underline', 'textColor'];
const BOXED = new Set(['rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star']);
const LINEAR = new Set(['line', 'arrow', 'curve', 'elbow']);
export const MAX_EDIT_TEXT = 20000;

// Where an object lives and which field holds its words. Cards: only a code sample's code is edited inline.
export function locate(board, id) {
  const shape = (board.shapes || []).find(entry => entry.id === id);
  if (shape) return { list: 'shapes', entity: shape, field: LINEAR.has(shape.kind) ? 'label' : 'text', runs: true, styled: true };
  const item = (board.items || []).find(entry => entry.id === id);
  if (item) return item.kind === 'equation' ? { list: 'items', entity: item, field: 'latex', runs: false, styled: false }
    : { list: 'items', entity: item, field: 'text', runs: item.kind !== 'section', styled: item.kind === 'text' || item.kind === 'sticky' };
  const link = (board.links || []).find(entry => entry.id === id);
  if (link) return { list: 'links', entity: link, field: 'label', runs: true, styled: true };
  const block = (board.blocks || []).find(entry => entry.id === id);
  if (block) return { list: 'blocks', entity: block, field: block.type === 'snippet' ? 'code' : null, runs: false, styled: false };
  return null;
}
const wordsOf = (entity, field) => String(entity[field] ?? '');
// New words with the formatting of what they replace; the Text|Code mode and every other field stay as they were.
const withText = (entity, field, runs, text) => {
  if (!runs) return { ...entity, [field]: text };
  const kept = field === 'label' ? { ...entity, text: entity.label } : entity;
  const patch = textPatch(reconcileRuns(runsOf(kept), text));
  return field === 'label' ? { ...entity, label: patch.text, runs: patch.runs } : { ...entity, ...patch };
};

// H1-H4/Text: the preset decides size and weight again, as the canvas's own level control does (its presetPatch).
const levelPatch = (entity, level) => {
  const runs = Array.isArray(entity.runs) ? entity.runs.map(run => { const rest = { ...run }; delete rest.s; delete rest.b; return rest; }) : undefined;
  return { ...entity, level, fontSize: undefined, bold: undefined, runs };
};

// One model edit checked against the frozen target and the board as it is now. Returns { ok, changes: [{ id, list,
// field, before, after }], errors, limitation }. Nothing is applied here.
export function validateEdit(edit, frozen, board) {
  const errors = [], changes = new Map();
  const limitation = typeof edit?.limitation === 'string' && edit.limitation.trim() ? edit.limitation.trim().slice(0, 300) : null;
  const ops = Array.isArray(edit?.ops) ? edit.ops : null;
  if (!ops) return { ok: false, errors: ['The edit had no operations.'], changes: [], limitation };
  if (!ops.length) return { ok: false, errors: limitation ? [] : ['The edit changed nothing.'], changes: [], limitation };
  const permitted = frozen.range ? [frozen.range.id] : frozen.ids;
  for (const op of ops) {
    if (!op || !EDIT_OPS.includes(op.op)) { errors.push(`"${op?.op}" is not an allowed edit.`); continue; }
    if (!permitted.includes(op.id)) { errors.push(`${op.id} is outside the selection.`); continue; }
    const where = locate(board, op.id);
    if (!where) { errors.push(`${op.id} is no longer on the canvas.`); continue; }
    if (where.entity.locked) { errors.push(`${op.id} is locked.`); continue; }
    const current = changes.get(op.id)?.after || where.entity;
    let after = null;
    if (op.op === 'replace_text') {
      if (frozen.range) { errors.push('Only the selected words may change.'); continue; }
      if (!where.field) { errors.push('Cards are changed in the card itself, not inline.'); continue; }
      // The model did not read this target whole: a whole replace would erase what it never saw. A long text was cut
      // short; a short one was left out because the selection is past the context budget.
      const longText = wordsOf(where.entity, where.field).length > LIMITS.targetChars;
      if (longText) { errors.push(`This text is longer than the ${LIMITS.targetChars} characters an edit can read, so it can't be rewritten whole. Select the words to change, then press Ctrl+K.`); continue; }
      if ((frozen.clipped || []).includes(op.id)) { errors.push(`This selection is more than an edit can read at once (${LIMITS.objects} objects, ${LIMITS.total} characters). Select fewer objects, then press Ctrl+K.`); continue; }
      if (typeof op.text !== 'string' || op.text.length > MAX_EDIT_TEXT) { errors.push('The new text is missing or too long.'); continue; }
      after = withText(current, where.field, where.runs, op.text);
    } else if (op.op === 'replace_range') {
      const range = frozen.range;
      if (!range || op.from !== range.from || op.to !== range.to) { errors.push('An edit may replace only the selected words.'); continue; }
      if (typeof op.text !== 'string' || op.text.length > MAX_EDIT_TEXT) { errors.push('The new text is missing or too long.'); continue; }
      const words = wordsOf(current, where.field);
      if (words.slice(range.from, range.to) !== range.text) { errors.push('The selected words changed since you asked.'); continue; }
      if (where.runs) {
        const runs = runsOf(where.field === 'label' ? { ...current, text: current.label } : current);
        const like = sliceRuns(runs, range.from, range.to)[0] || {};
        const { t: _t, ...attrs } = like;
        const patch = textPatch(spliceRuns(runs, range.from, range.to, op.text, attrs));
        after = where.field === 'label' ? { ...current, label: patch.text, runs: patch.runs } : { ...current, ...patch };
      } else after = { ...current, [where.field]: words.slice(0, range.from) + op.text + words.slice(range.to) };
    } else {
      if (frozen.range) { errors.push('Select the whole object to restyle it.'); continue; }
      if (!where.styled) { errors.push('That object has no text style to change.'); continue; }
      const style = op.style && typeof op.style === 'object' ? op.style : {};
      const keys = Object.keys(style);
      if (!keys.length || keys.some(key => !STYLE_KEYS.includes(key))) { errors.push('Only font size, level, bold, italic, underline and text colour can change.'); continue; }
      let next = current, bad = false;
      for (const key of keys) {
        const value = style[key];
        if (key === 'fontSize') { const size = validSize(value); if (!size) bad = true; else next = { ...next, fontSize: size }; }
        else if (key === 'level') { if (!TEXT_LEVELS.some(level => level.id === value)) bad = true; else next = levelPatch(next, value); }
        else if (key === 'textColor') { const color = hexColor(value); if (!color) bad = true; else next = { ...next, textColor: color }; }
        else if (typeof value !== 'boolean') bad = true;
        else next = { ...next, [key]: value };
      }
      if (bad) { errors.push('A style value was out of range.'); continue; }
      after = next;
    }
    changes.set(op.id, { id: op.id, list: where.list, field: where.field, before: changes.get(op.id)?.before || where.entity, after });
  }
  const list = [...changes.values()].filter(change => JSON.stringify(change.before) !== JSON.stringify(change.after));
  if (!errors.length && !list.length) errors.push(limitation ? '' : 'The edit changed nothing.');
  return { ok: !errors.filter(Boolean).length && list.length > 0, errors: errors.filter(Boolean), changes: list, limitation };
}

// What the preview shows for one change: before and after words, and which style keys moved.
export function describeChange(change) {
  const field = change.field || 'text';
  const styleKeys = STYLE_KEYS.filter(key => change.before[key] !== change.after[key]);
  return { id: change.id, before: String(change.before[field] ?? ''), after: String(change.after[field] ?? ''), style: styleKeys.map(key => [key, change.before[key] ?? null, change.after[key] ?? null]) };
}

// Annotation placement (§9): beside the target, in free space, inside what the learner can see when possible; never
// moving anything or the camera. obstacles: the boxes of everything else on the canvas.
const GAP = 40, PAD = 12, STEP = 28;
const overlaps = (a, b) => a.x < b.x + b.w + PAD && a.x + a.w + PAD > b.x && a.y < b.y + b.h + PAD && a.y + a.h + PAD > b.y;
const inside = (a, v) => a.x >= v.x && a.y >= v.y && a.x + a.w <= v.x + v.w && a.y + a.h <= v.y + v.h;
export function placeNote(target, size, obstacles, visible = null) {
  const bases = [
    ['right', { x: target.x + target.w + GAP, y: target.y + target.h / 2 - size.h / 2 }, [0, 1]],
    ['left', { x: target.x - GAP - size.w, y: target.y + target.h / 2 - size.h / 2 }, [0, 1]],
    ['bottom', { x: target.x + target.w / 2 - size.w / 2, y: target.y + target.h + GAP }, [1, 0]],
    ['top', { x: target.x + target.w / 2 - size.w / 2, y: target.y - GAP - size.h }, [1, 0]],
  ];
  const tries = [];
  for (let k = 0; k <= 12; k += 1) for (const [side, at, [ax, ay]] of bases) for (const sign of k ? [1, -1] : [1]) {
    const out = Math.floor(k / 4) * STEP * 3; // every four steps, one ring further out
    const push = { right: [out, 0], left: [-out, 0], bottom: [0, out], top: [0, -out] }[side];
    tries.push({ side, x: at.x + ax * sign * k * STEP + push[0], y: at.y + ay * sign * k * STEP + push[1] });
  }
  const free = spot => !obstacles.some(box => overlaps({ ...spot, ...size }, box)) && !overlaps({ ...spot, ...size }, target);
  return tries.find(spot => free(spot) && (!visible || inside({ ...spot, ...size }, visible)))
    || tries.find(free) || { ...tries[0], crowded: true };
}
const FACING = { right: ['left', 'right'], left: ['right', 'left'], bottom: ['top', 'bottom'], top: ['bottom', 'top'] };

export const noteId = requestId => `inline-${requestId}-note`;
export const linkId = requestId => `inline-${requestId}-link`;
export const cardId = requestId => `inline-${requestId}-card`;
const NOTE_W = 260;
// The note's size: its text box takes 88% of the width (TEXT_BOX.rect), and words never overflow it on load. measure
// (the canvas's measureHeight) gives the real height in a browser; the estimate keeps it pure for the tests.
export const noteSize = (text, measure = null) => {
  const inner = NOTE_W * 0.88;
  const tall = measure ? measure(text, inner) : Math.ceil((String(text).length * 7.2) / inner + String(text).split('\n').length - 1) * 18;
  return { w: NOTE_W, h: Math.max(48, Math.ceil(tall / 0.88) + 8) };
};

// The explanation's transaction: one editable text note (a native shape) beside the target and, when the target is one
// object with ports, one connector marked as an annotation - never a structural edge, so the next explanation does not
// count it as a child. Provenance (inline.sources) persists on both.
export function explainTx({ requestId, text, frozen, board, boxes, size, visible, mode = 'explain', route = 'note' }) {
  const targetBox = boxes.target;
  const place = placeNote(targetBox, size, boxes.obstacles, visible);
  const inline = { requestId, mode, route, sources: frozen.ids.slice(), ...(frozen.range ? { range: { id: frozen.range.id, from: frozen.range.from, to: frozen.range.to } } : {}) };
  const note = { id: noteId(requestId), kind: 'rect', x1: place.x, y1: place.y, x2: place.x + size.w, y2: place.y + size.h,
    color: '#6b7280', width: 2, dash: 'dashed', fill: null, opacity: 1, round: true, text: String(text), textColor: '#37352f', align: 'left', valign: 'top', inline };
  const one = frozen.ids.length === 1 ? frozen.ids[0] : null;
  const connectable = one && (board.shapes || []).some(shape => shape.id === one && BOXED.has(shape.kind)) || (one && (board.blocks || []).some(block => block.id === one));
  const [fromSide, toSide] = FACING[place.side];
  const link = connectable ? { id: linkId(requestId), from: note.id, fromSide, to: one, toSide, color: '#6b7280', route: 'straight', head: true, kind: 'annotation', inline } : null;
  return { id: requestId, kind: 'explain', shapes: [note], links: link ? [link] : [], place };
}

// A generated card (an existing handler's validated block) goes in the column after the target card, or where the
// learner is looking; it carries its provenance and, beside a card target, an annotation connector.
export function cardTx({ requestId, block, frozen, board, route }) {
  const inline = { requestId, mode: 'explain', route, sources: frozen.ids.slice() };
  const card = { ...block, id: cardId(requestId), dx: 0, dy: 0, inline };
  const after = frozen.ids.find(id => (board.blocks || []).some(entry => entry.id === id)) || null;
  const one = frozen.ids.length === 1 ? frozen.ids[0] : null;
  const connectable = one && ((board.shapes || []).some(shape => shape.id === one && BOXED.has(shape.kind)) || (board.blocks || []).some(entry => entry.id === one));
  const link = connectable ? { id: linkId(requestId), from: card.id, fromSide: 'top', to: one, toSide: 'bottom', color: '#6b7280', route: 'straight', head: true, kind: 'annotation', inline } : null;
  return { id: requestId, kind: 'card', block: card, after, links: link ? [link] : [] };
}

export const editTx = ({ requestId, changes }) => ({ id: requestId, kind: 'edit', changes: changes.map(({ id, list, after }) => ({ id, list, after })) });

// The transaction against the current lists (§11): edits patch only their own ids (an unrelated concurrent edit
// stays), additions skip ids already there (a second Accept adds nothing).
export function applyTx(state, tx) {
  const next = { ...state };
  const has = (list, id) => (state[list] || []).some(entry => entry.id === id);
  if (tx.kind === 'edit') {
    for (const change of tx.changes) next[change.list] = (next[change.list] || state[change.list] || []).map(entry => (entry.id === change.id ? change.after : entry));
    return next;
  }
  if (tx.shapes?.length) next.shapes = [...state.shapes, ...tx.shapes.filter(shape => !has('shapes', shape.id))];
  if (tx.block && !has('blocks', tx.block.id)) {
    const at = tx.after ? state.blocks.findIndex(block => block.id === tx.after) : -1;
    next.blocks = tx.first ? [tx.block, ...state.blocks] : at < 0 ? [...state.blocks, tx.block] : [...state.blocks.slice(0, at + 1), tx.block, ...state.blocks.slice(at + 1)];
  }
  if (tx.links?.length) next.links = [...state.links, ...tx.links.filter(link => !has('links', link.id))];
  return next;
}
