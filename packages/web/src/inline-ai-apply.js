// Validated application of an inline AI result (docs/features/inline-ai-editor.md §8-§11). Permission is enforced here,
// in code, never by a prompt: an edit may touch only the frozen target's ids (only its range, when a range was
// selected), only through the listed operations and fields, and never moves, regroups, deletes, restyles a neighbour or
// switches Text|Code. An explanation adds one note (and, when it helps, one annotation connector) beside the target.
// Pure: the canvas applies the transaction this returns in one undo step.
import { reconcileRuns, runsOf, sliceRuns, spliceRuns, textPatch, fontSize as validSize, hexColor } from './learn-rich-text.js';
import { TEXT_LEVELS } from './learn-style-panel.js';
import { cardEditSpec, cardEditText, cardEditComparison, validateCardContent } from './inline-card-edit.js';
import { validateNativePlan } from './inline-native-plan.js';
import { validateInlinePlan } from './inline-tool-plan.js';
import { LIMITS } from './inline-ai-context.js';

export const EDIT_OPS = ['replace_text', 'replace_range', 'set_style', 'replace_card_content'];
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
  if(edit?.plan){
    if(edit.ops?.length)return {ok:false,errors:['Combine native changes in one tool plan; text operations must use a separate preview.'],changes:[]};
    if(frozen.range)return {ok:false,errors:['Native changes require whole objects.'],changes:[]};
    return frozen.toolSnapshot?validateInlinePlan(edit.plan,frozen.toolSnapshot,board,board.boxes||{},{requestId:frozen.requestId}):validateNativePlan(edit.plan,frozen.nativeTools,board,board.boxes||{});
  }
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
    if (where.list === 'blocks' && !cardEditSpec(where.entity).ok) { errors.push(cardEditSpec(where.entity).reason); continue; }
    if (op.op === 'replace_card_content') {
      if (frozen.range || where.list !== 'blocks') { errors.push('Structured edits require a whole supported card.'); continue; }
      if ((frozen.clipped || []).includes(op.id)) { errors.push('This card was not read completely. Reduce the selection before editing.'); continue; }
      const original = cardEditSpec(where.entity);
      if (JSON.stringify(original.content).length > LIMITS.targetChars) { errors.push('This card exceeds the complete-content edit budget.'); continue; }
      const checked = validateCardContent(current, op.content);
      if (!checked.ok) { errors.push(checked.error); continue; }
      after = checked.after;
      where.field = 'cardContent';
    } else if (op.op === 'replace_text') {
      if (frozen.range) { errors.push('Only the selected words may change.'); continue; }
      if (!where.field) { errors.push('Cards are changed in the card itself, not inline.'); continue; }
      // The model did not read this target whole: a whole replace would erase what it never saw. A long text was cut
      // short; a short one was left out because the selection is past the context budget.
      const longText = wordsOf(where.entity, where.field).length > LIMITS.targetChars;
      if (longText) { errors.push(`This text is longer than the ${LIMITS.targetChars} characters an edit can read, so it can't be rewritten whole. Select the words to change, then press Ctrl+K.`); continue; }
      if ((frozen.clipped || []).includes(op.id)) { errors.push(`This selection is more than an edit can read at once (${LIMITS.objects} objects, ${LIMITS.total} characters). Select fewer objects, then press Ctrl+K.`); continue; }
      if (typeof op.text !== 'string' || op.text.length > MAX_EDIT_TEXT) { errors.push('The new text is missing or too long.'); continue; }
      after = withText(current, where.field, where.runs, op.text);
      if (where.list === 'blocks' && current.type === 'snippet' && current.code !== op.text && Object.hasOwn(current, 'output')) after.output = '';
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

// An edit's words as a diff (A7 ghost): runs of same, removed and added words, by the longest common run of words
// (spaces kept with the word before them). ponytail: O(n*m) over words, fine for one object's text (an edit is at most
// one selection); a long document diff would want Myers.
export function wordDiff(before, after) {
  const words = text => String(text).match(/\S+\s*|\s+/g) || [];
  const a = words(before), b = words(after);
  const key = word => word.trimEnd();
  const n = a.length, m = b.length, keep = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) keep[i][j] = key(a[i]) === key(b[j]) ? keep[i + 1][j + 1] + 1 : Math.max(keep[i + 1][j], keep[i][j + 1]);
  const out = [];
  const push = (kind, t) => { const last = out[out.length - 1]; if (last?.kind === kind) last.t += t; else out.push({ kind, t }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) { push('same', b[j]); i += 1; j += 1; }
    else if (keep[i + 1][j] >= keep[i][j + 1]) { push('del', a[i]); i += 1; }
    else { push('add', b[j]); j += 1; }
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('add', b[j++]);
  return out;
}

// What the preview shows for one change: before and after words, and which style keys moved.
export function describeChange(change) {
  if(change.field==='notebookCells'){
    const source=cell=>Array.isArray(cell.source)?cell.source.join(''):cell.source;
    const fields=change.cellIds.map(id=>{const before=change.before.ipynb.cells.find(cell=>cell.id===id),after=change.after.ipynb.cells.find(cell=>cell.id===id);return{key:id,label:`Cell ${id}`,before:source(before),after:source(after),code:before.cell_type==='code'};});
    return{id:change.id,structured:true,fields,before:fields.map(field=>field.before).join('\n'),after:fields.map(field=>field.after).join('\n'),style:[],notice:`Source only; ${change.staleCellIds.length} code cell outputs will be cleared. No code has been run.`};
  }
  if(change.field==='native')return {id:change.id,native:true,before:String(change.before.text||change.before.label||''),after:String(change.after.text||change.after.label||''),style:Object.keys(change.after).filter(key=>JSON.stringify(change.before[key])!==JSON.stringify(change.after[key])).map(key=>[key,change.before[key]??null,change.after[key]??null]),list:change.list,bounds:change.bounds||(change.list==='shapes'?{x:Math.min(change.after.x1,change.after.x2),y:Math.min(change.after.y1,change.after.y2),w:Math.abs(change.after.x2-change.after.x1),h:Math.abs(change.after.y2-change.after.y1)}:{x:change.after.x,y:change.after.y,w:change.after.w,h:change.after.h}),appearance:change.after};
  if (change.field === 'cardContent') return { id: change.id, structured: true, fields: cardEditComparison(cardEditSpec(change.before).content, cardEditSpec(change.after).content), before: cardEditText(cardEditSpec(change.before).content), after: cardEditText(cardEditSpec(change.after).content), style: [], ...(change.before.type === 'snippet' && change.before.code !== change.after.code && change.before.output ? { notice: 'The previous code output will be cleared; the revised code has not been run.' } : {}) };
  const field = change.field || 'text';
  const styleKeys = STYLE_KEYS.filter(key => change.before[key] !== change.after[key]);
  return { id: change.id, before: String(change.before[field] ?? ''), after: String(change.after[field] ?? ''), style: styleKeys.map(key => [key, change.before[key] ?? null, change.after[key] ?? null]) };
}

// Annotation placement (§9, A7): beside the target, in free space, inside what the learner can see when possible; never
// moving anything. obstacles: the boxes of everything else on the canvas (obstaclesOf). The one placer for every result
// the editor adds: a note, a card, their connector.
const GAP = 40, PAD = 12, STEP = 28;
const overlaps = (a, b) => a.x < b.x + b.w + PAD && a.x + a.w + PAD > b.x && a.y < b.y + b.h + PAD && a.y + a.h + PAD > b.y;
export const inside = (a, v) => a.x >= v.x && a.y >= v.y && a.x + a.w <= v.x + v.w && a.y + a.h <= v.y + v.h;
// A spot is free when it keeps clear of every obstacle and the target (with PAD all round).
export const freeSpot = (spot, obstacles, target = null) => !obstacles.some(box => overlaps(spot, box)) && !(target && overlaps(spot, target));
// reach: how many steps out the rings go (12 for a note beside its target; a larger result asks for more).
export function placeNote(target, size, obstacles, visible = null, reach = 12) {
  const bases = [
    ['right', { x: target.x + target.w + GAP, y: target.y + target.h / 2 - size.h / 2 }, [0, 1]],
    ['left', { x: target.x - GAP - size.w, y: target.y + target.h / 2 - size.h / 2 }, [0, 1]],
    ['bottom', { x: target.x + target.w / 2 - size.w / 2, y: target.y + target.h + GAP }, [1, 0]],
    ['top', { x: target.x + target.w / 2 - size.w / 2, y: target.y - GAP - size.h }, [1, 0]],
  ];
  const tries = [];
  for (let k = 0; k <= reach; k += 1) for (const [side, at, [ax, ay]] of bases) for (const sign of k ? [1, -1] : [1]) {
    const out = Math.floor(k / 4) * STEP * 3; // every four steps, one ring further out
    const push = { right: [out, 0], left: [-out, 0], bottom: [0, out], top: [0, -out] }[side];
    tries.push({ side, x: at.x + ax * sign * k * STEP + push[0], y: at.y + ay * sign * k * STEP + push[1] });
  }
  const free = spot => freeSpot({ ...spot, ...size }, obstacles, target);
  const seen = spot => !visible || inside({ ...spot, ...size }, visible);
  const found = tries.find(spot => free(spot) && seen(spot)) || tries.find(free);
  // Nothing free in the rings: right of everything on the board, level with the target - free by construction, never
  // on top of anything. The caller pans to it when it is off-screen.
  const spot = found || { side: 'right', x: Math.max(target.x + target.w, ...obstacles.map(box => box.x + box.w)) + GAP, y: target.y + target.h / 2 - size.h / 2 };
  return { ...spot, offscreen: !seen(spot) };
}
// Every kind of thing on the board as boxes the placer keeps clear of (A7): measured boxes (cards, chat cards, shapes,
// lines, text, stickies, ink), connectors along their drawn paths (sampled points), group frames, areas and comment
// pins. exclude: ids that are not obstacles (the target itself is kept clear by the placer).
const PATH_PAD = 10;
export function obstaclesOf({ boxes = [], paths = [], frames = [], areas = [], pins = [] }, exclude = []) {
  const keep = entry => !exclude.includes(entry.id);
  const along = path => path.points.map(point => ({ id: path.id, x: point.x - PATH_PAD, y: point.y - PATH_PAD, w: PATH_PAD * 2, h: PATH_PAD * 2 }));
  return [...boxes.filter(keep), ...paths.filter(keep).flatMap(along), ...frames.filter(keep), ...areas.filter(keep), ...pins];
}
export const FACING = { right: ['left', 'right'], left: ['right', 'left'], bottom: ['top', 'bottom'], top: ['bottom', 'top'] };
// Answers about a selected card (a question asked with the card selected): each beside its card in free space, by the
// same placer, clear of every obstacle and of the answers placed before it in the same pass. obstacles keep their ids
// (obstaclesOf); the answers' own boxes and each one's ignore ids (its card, its own connector) are not obstacles.
// sides: the connector's [card side, answer side].
export function placeAnswers(answers, obstacles, visible = null) {
  const moving = new Set(answers.map(answer => answer.id)), placed = [];
  return answers.map(({ target, size, ignore = [] }) => {
    const spot = placeNote(target, size, [...obstacles.filter(box => !moving.has(box.id) && !ignore.includes(box.id)), ...placed], visible);
    placed.push({ x: spot.x, y: spot.y, ...size });
    return { ...spot, sides: [FACING[spot.side][1], FACING[spot.side][0]] };
  });
}
// Whether an explanation draws its annotation connector: one target, a boxed shape or a card.
export const explainConnects = (ids, board) => ids.length === 1 && ((board.shapes || []).some(shape => shape.id === ids[0] && BOXED.has(shape.kind)) || (board.blocks || []).some(block => block.id === ids[0]));

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
// place: the placement the ghost showed (A7) - Accept applies exactly that; without one, the placer runs here.
export function explainTx({ requestId, text, frozen, board, boxes, size, visible, mode = 'explain', route = 'note', place: shown = null }) {
  const targetBox = boxes.target;
  const place = shown || placeNote(targetBox, size, boxes.obstacles, visible);
  const inline = { requestId, mode, route, sources: frozen.ids.slice(), ...(frozen.range ? { range: { id: frozen.range.id, from: frozen.range.from, to: frozen.range.to } } : {}) };
  const note = { id: noteId(requestId), kind: 'rect', x1: place.x, y1: place.y, x2: place.x + size.w, y2: place.y + size.h,
    color: '#6b7280', width: 2, dash: 'dashed', fill: null, opacity: 1, round: true, text: String(text), textColor: '#37352f', align: 'left', valign: 'top', inline };
  const one = explainConnects(frozen.ids, board) ? frozen.ids[0] : null;
  const connectable = !!one;
  const [fromSide, toSide] = FACING[place.side] || FACING.right;
  const link = connectable ? { id: linkId(requestId), from: note.id, fromSide, to: one, toSide, color: '#6b7280', route: 'straight', head: true, kind: 'annotation', inline } : null;
  return { id: requestId, kind: 'explain', shapes: [note], links: link ? [link] : [], place };
}

// A generated card (an existing handler's validated block) goes in the column after the target card, or where the
// learner is looking; it carries its provenance and, beside a card target, an annotation connector.
// place (A7): the spot its ghost showed - the card goes at the end of the column (end: no other card moves), offset
// (dx, dy) to that spot, its connector on the facing sides. Without one, it follows the target card in the column.
export function cardTx({ requestId, block, frozen, board, route, place = null }) {
  const inline = { requestId, mode: 'explain', route, sources: frozen.ids.slice() };
  const card = { ...block, id: cardId(requestId), dx: place ? place.dx : 0, dy: place ? place.dy : 0, inline };
  const after = place ? null : frozen.ids.find(id => (board.blocks || []).some(entry => entry.id === id)) || null;
  const one = explainConnects(frozen.ids, board) ? frozen.ids[0] : null;
  const [fromSide, toSide] = place ? FACING[place.side] || FACING.right : ['top', 'bottom'];
  const link = one ? { id: linkId(requestId), from: card.id, fromSide, to: one, toSide, color: '#6b7280', route: 'straight', head: true, kind: 'annotation', inline } : null;
  return { id: requestId, kind: 'card', block: card, after, ...(place ? { end: true } : {}), links: link ? [link] : [] };
}

export const editTx = ({ requestId, changes, additions=[], removals=[] }) => ({ id: requestId, kind: 'edit', changes: changes.map(({ id, list, after }) => ({ id, list, after })), additions, removals });

// The transaction against the current lists (§11): edits patch only their own ids (an unrelated concurrent edit
// stays), additions skip ids already there (a second Accept adds nothing).
export function applyTx(state, tx) {
  const next = { ...state };
  const has = (list, id) => (state[list] || []).some(entry => entry.id === id);
  if (tx.kind === 'edit'||tx.kind==='annotations') {
    for (const change of tx.changes) next[change.list] = (next[change.list] || state[change.list] || []).map(entry => (entry.id === change.id ? change.after : entry));
    for(const removal of tx.removals||[])next[removal.list]=(next[removal.list]||[]).filter(entry=>entry.id!==removal.id);
    for(const addition of tx.additions||[])if(!(next[addition.list]||[]).some(entry=>entry.id===addition.id))next[addition.list]=[...(next[addition.list]||[]),addition.after];
    return next;
  }
  if (tx.shapes?.length) next.shapes = [...state.shapes, ...tx.shapes.filter(shape => !has('shapes', shape.id))];
  if (tx.block && !has('blocks', tx.block.id)) {
    const at = tx.after ? state.blocks.findIndex(block => block.id === tx.after) : -1;
    next.blocks = tx.first ? [tx.block, ...state.blocks] : at < 0 ? [...state.blocks, tx.block] : [...state.blocks.slice(0, at + 1), tx.block, ...state.blocks.slice(at + 1)];
  }
  if (tx.links?.length) next.links = [...state.links, ...tx.links.filter(link => !has('links', link.id))];
  if (tx.groups?.length) next.groups = [...(state.groups || []), ...tx.groups.filter(group => !has('groups', group.id))];
  return next;
}
