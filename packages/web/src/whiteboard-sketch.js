// The shared data contract for the native Whiteboard (docs/features/tldraw-removal.md, "Data contract"). Pure, no imports, so
// Node tests and every workstream (editor, migration, Tutor and selection, rich-media cards) build on the same types.
// A whiteboard block keeps the tldraw snapshot it was saved with (`snapshot`, never modified by this module) and, once
// converted, the native drawing (`sketch`, the same { strokes, shapes, items } the Explain Back sketch uses).

export const SKETCH_KEYS = ['strokes', 'shapes', 'items'];
export const STROKE_TOOLS = ['pen', 'highlighter'];
export const SHAPE_KINDS = ['rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star', 'line', 'arrow', 'curve', 'elbow'];
export const ITEM_KINDS = ['text', 'sticky'];
// 'tutor' appears in older docs and is read as 'assistant'; the code has always written 'assistant' (WhiteboardBlock.jsx).
export const AUTHORS = ['learner', 'lesson', 'assistant'];
export const LIMITS = {
  sketchChars: 400_000, // the block's own cap today (WhiteboardBlock.jsx); applies to `sketch` alone, never to `snapshot`
  boardChars: 1_900_000, // learn-boards.js MAX_STATE, the whole board as the server counts it
  warnAt: 0.85, // canvas-doc.js boardSizeWarning
};
// A Tutor plan kind that becomes an ordinary canvas card (learn-board-renderer PLAN_KINDS) and the block type it becomes
// (BLOCK_TYPES in LearningBlocks.jsx: graph, model3d, videoGenerate, scene, image).
export const RICH_CARD = { graph: 'graph', three_d: 'model3d', video: 'videoGenerate', scene: 'scene', image: 'image', paper_figure: 'image' };

const finite = value => typeof value === 'number' && Number.isFinite(value);
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const authorOf = mark => (mark?.author === 'tutor' ? 'assistant' : AUTHORS.includes(mark?.author) ? mark.author : 'learner');

// ---------- sketch: shape of the three lists ----------
export const emptySketch = () => ({ strokes: [], shapes: [], items: [] });
// A saved sketch may lack a list (editSketch fills them as it goes); reading never fails on that.
export const normalizeSketch = sketch => ({ strokes: sketch?.strokes || [], shapes: sketch?.shapes || [], items: sketch?.items || [] });

// { ok, errors }. Ids: every shape and item has one, a stroke may; all ids present are unique across the three lists.
// `meta` (legacy Tutor fields), `author`, `explanationId`, `objectId`, `legacyId`, `legacyGroup` are optional.
export function validateSketch(sketch) {
  const errors = [];
  if (!plain(sketch)) return { ok: false, errors: ['sketch is not an object'] };
  const seen = new Set();
  const id = (mark, where, required) => {
    if (mark.id === undefined && !required) return;
    if (typeof mark.id !== 'string' || !mark.id) errors.push(`${where}: id must be a non-empty string`);
    else if (seen.has(mark.id)) errors.push(`${where}: duplicate id ${mark.id}`);
    else seen.add(mark.id);
  };
  const common = (mark, where) => {
    if (mark.author !== undefined && ![...AUTHORS, 'tutor'].includes(mark.author)) errors.push(`${where}: unknown author ${String(mark.author).slice(0, 20)}`);
    if (mark.meta !== undefined && !plain(mark.meta)) errors.push(`${where}: meta must be an object`);
  };
  for (const key of SKETCH_KEYS) if (sketch[key] !== undefined && !Array.isArray(sketch[key])) errors.push(`${key} must be a list`);
  (Array.isArray(sketch.strokes) ? sketch.strokes : []).forEach((stroke, i) => {
    const where = `strokes[${i}]`;
    if (!plain(stroke)) return errors.push(`${where}: not an object`);
    id(stroke, where, false); common(stroke, where);
    if (!STROKE_TOOLS.includes(stroke.tool)) errors.push(`${where}: tool must be pen or highlighter`);
    if (!Array.isArray(stroke.points) || !stroke.points.every(p => plain(p) && finite(p.x) && finite(p.y))) errors.push(`${where}: points must be a list of finite {x, y}`);
  });
  (Array.isArray(sketch.shapes) ? sketch.shapes : []).forEach((shape, i) => {
    const where = `shapes[${i}]`;
    if (!plain(shape)) return errors.push(`${where}: not an object`);
    id(shape, where, true); common(shape, where);
    if (!SHAPE_KINDS.includes(shape.kind)) errors.push(`${where}: unknown kind ${String(shape.kind).slice(0, 20)}`);
    if (!['x1', 'y1', 'x2', 'y2'].every(key => finite(shape[key]))) errors.push(`${where}: x1 y1 x2 y2 must be finite numbers`);
  });
  (Array.isArray(sketch.items) ? sketch.items : []).forEach((item, i) => {
    const where = `items[${i}]`;
    if (!plain(item)) return errors.push(`${where}: not an object`);
    id(item, where, true); common(item, where);
    if (!ITEM_KINDS.includes(item.kind)) errors.push(`${where}: unknown kind ${String(item.kind).slice(0, 20)}`);
    if (!finite(item.x) || !finite(item.y)) errors.push(`${where}: x and y must be finite numbers`);
    if (item.text !== undefined && typeof item.text !== 'string') errors.push(`${where}: text must be a string`);
  });
  return { ok: !errors.length, errors };
}

// ---------- the whiteboard block ----------
// block = { id, type: 'whiteboard', title, narration, snapshot (tldraw, opaque, kept verbatim), sketch, sketchFrom: { digest, v },
//           tooLarge, marked, demo }. `toolsHidden` is retired with the per-card toolbar. A snapshot is never inspected here.
export function validateWhiteboardBlock(block) {
  const errors = [];
  if (!plain(block)) return { ok: false, errors: ['block is not an object'] };
  if (block.type !== 'whiteboard') errors.push('type must be whiteboard');
  if (typeof block.id !== 'string' || !block.id) errors.push('id must be a non-empty string');
  if (block.snapshot != null && !plain(block.snapshot)) errors.push('snapshot must be an object or null');
  if (block.sketch != null) { const result = validateSketch(block.sketch); errors.push(...result.errors.map(message => `sketch: ${message}`)); }
  if (block.sketchFrom != null && !(plain(block.sketchFrom) && typeof block.sketchFrom.digest === 'string' && finite(block.sketchFrom.v))) errors.push('sketchFrom must be { digest, v }');
  if (block.sketchFrom != null && block.snapshot == null) errors.push('sketchFrom needs the snapshot it was made from');
  return { ok: !errors.length, errors };
}

// A stable digest of a snapshot (cyrb53 over canonical JSON, keys sorted): the same snapshot gives the same digest on every
// open and in every browser, and any change to it, such as an edit made by an older tldraw build, gives another.
const canonical = value => (Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : plain(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value) ?? 'null');
export function digestOf(value) {
  const text = canonical(value);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
export const CONVERTER_VERSION = 1;

// 'none': no tldraw snapshot (a new board). 'unconverted': a snapshot and no saved sketch (derive in memory, write nothing).
// 'converted': the saved sketch was made from exactly this snapshot. 'diverged': the snapshot changed after the sketch was
// made (an older tldraw build edited it); both are kept, the sketch is shown, and the editor says the original changed.
export function legacyState(block) {
  if (block?.snapshot == null) return 'none';
  if (block.sketch == null || block.sketchFrom == null) return 'unconverted';
  return block.sketchFrom.digest === digestOf(block.snapshot) ? 'converted' : 'diverged';
}

// ---------- persistence ----------
// Deriving a sketch from a snapshot happens in memory on open and never calls a save. A write needs an edit by someone who
// may edit; a shared read-only viewer, a share-link guest without a copy and a fork preview never write.
export const mayPersist = ({ readOnly = false, canEdit = true } = {}) => !readOnly && canEdit !== false;

// The block after an authorized edit: `sketch` replaced, `snapshot` carried over by reference and untouched, `sketchFrom`
// recorded the first time a sketch is saved over a snapshot so the pair can be told apart later.
export function withSketch(block, sketch) {
  const next = { ...block, sketch: normalizeSketch(sketch) };
  if (block.snapshot != null && block.sketchFrom == null) next.sketchFrom = { digest: digestOf(block.snapshot), v: CONVERTER_VERSION };
  delete next.tooLarge;
  return next;
}

// Can this sketch be saved with the board as it is? Never answers "drop the snapshot": a sketch that does not fit stays in
// memory with `tooLarge`, exactly as an over-size tldraw board did, and the original is kept whole.
// boardChars: the board's current serialized length (the server counts JSON.stringify(state).length).
export function saveVerdict({ block, sketch, boardChars }) {
  const sketchChars = JSON.stringify(normalizeSketch(sketch)).length;
  const before = block?.sketch ? JSON.stringify(normalizeSketch(block.sketch)).length : 0;
  const after = boardChars - before + sketchChars + (block?.sketchFrom ? 0 : block?.snapshot != null ? 64 : 0);
  if (sketchChars > LIMITS.sketchChars) return { ok: false, reason: 'sketch-too-large', sketchChars, boardChars: after };
  if (after > LIMITS.boardChars) return { ok: false, reason: 'board-too-large', sketchChars, boardChars: after };
  return { ok: true, sketchChars, boardChars: after, warn: after >= LIMITS.boardChars * LIMITS.warnAt };
}

// ---------- marks: ids, bounds, selection ----------
const fresh = (list, base) => { let id = base, n = 1; while (list.has(id)) id = `${base}~${n++}`; list.add(id); return id; };
// Strokes are not required to carry an id (the shared gesture code makes none), a whiteboard's must: Ask about selection and
// Remove explanation name marks. The id of an id-less stroke is derived from its content, so reopening gives the same one.
export function withStrokeIds(sketch) {
  const used = new Set([...(sketch.shapes || []), ...(sketch.items || []), ...(sketch.strokes || [])].map(mark => mark.id).filter(Boolean));
  return { ...normalizeSketch(sketch), strokes: (sketch.strokes || []).map(stroke => (stroke.id ? stroke : { ...stroke, id: fresh(used, `stroke:${digestOf({ t: stroke.tool, p: stroke.points }).slice(0, 10)}`) })) };
}

// Page-space rectangle { x, y, x2, y2 } of a mark. Text boxes without a stored size are estimated (no font metrics here).
export function markBounds(mark, list) {
  if (list === 'strokes') {
    const pad = (mark.width || 2) / 2, xs = (mark.points || []).map(p => p.x), ys = (mark.points || []).map(p => p.y);
    return xs.length ? { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, x2: Math.max(...xs) + pad, y2: Math.max(...ys) + pad } : null;
  }
  if (list === 'shapes') return { x: Math.min(mark.x1, mark.x2), y: Math.min(mark.y1, mark.y2), x2: Math.max(mark.x1, mark.x2), y2: Math.max(mark.y1, mark.y2) };
  const rows = String(mark.text || '').split('\n'), sticky = mark.kind === 'sticky';
  const w = finite(mark.w) ? mark.w : sticky ? 160 : Math.max(24, Math.max(...rows.map(row => row.length)) * 9), h = finite(mark.h) ? mark.h : sticky ? 160 : rows.length * 24;
  return { x: mark.x, y: mark.y, x2: mark.x + w, y2: mark.y + h };
}
export const listsOf = sketch => { const s = normalizeSketch(sketch); return [['strokes', s.strokes], ['shapes', s.shapes], ['items', s.items]]; };
const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x2 <= b.x2 && a.y2 <= b.y2;
const touches = (a, b) => a.x < b.x2 && a.x2 > b.x && a.y < b.y2 && a.y2 > b.y;

// What Ask about selection sends for the shapes under a crop, the same { id, type, text, author } the tldraw board sent
// (area-crop.js cropBinding): the marks wholly inside the rectangle, else the ones it touches. rect is in sketch space.
export function marksIn(sketch, rect) {
  const all = listsOf(sketch).flatMap(([list, marks]) => marks.map((mark, index) => ({ mark, list, index, box: markBounds(mark, list) }))).filter(entry => entry.box);
  const whole = all.filter(entry => inside(entry.box, rect));
  return (whole.length ? whole : all.filter(entry => touches(entry.box, rect))).map(({ mark, list, index }) => ({
    id: mark.id || `stroke:${index}`, type: list === 'strokes' ? 'stroke' : mark.kind, text: String(mark.text || mark.label || '').slice(0, 500), author: authorOf(mark),
  }));
}

// ---------- fit and focus: no pan or zoom inside the card, nothing clipped ----------
// A view maps sketch space to the card's frame: screen = sketch * s + (tx, ty). The view is presentation state: it is not
// saved, not shared and never causes a write.
export const IDENTITY_VIEW = Object.freeze({ s: 1, tx: 0, ty: 0 });
export function contentBounds(sketch) {
  const boxes = listsOf(sketch).flatMap(([list, marks]) => marks.map(mark => markBounds(mark, list))).filter(Boolean);
  return boxes.length ? { x: Math.min(...boxes.map(b => b.x)), y: Math.min(...boxes.map(b => b.y)), x2: Math.max(...boxes.map(b => b.x2)), y2: Math.max(...boxes.map(b => b.y2)) } : null;
}
// The view that shows `rect` whole inside `frame` ({ w, h }) with padding, centred; never magnifies past maxScale.
export function viewFor(rect, frame, { padding = 16, maxScale = 1 } = {}) {
  const w = Math.max(rect.x2 - rect.x, 1), h = Math.max(rect.y2 - rect.y, 1);
  const s = Math.min(maxScale, Math.max((frame.w - 2 * padding) / w, 0.01), Math.max((frame.h - 2 * padding) / h, 0.01));
  return { s, tx: (frame.w - w * s) / 2 - rect.x * s, ty: (frame.h - h * s) / 2 - rect.y * s };
}
export const fitView = (sketch, frame, options) => { const bounds = contentBounds(sketch); return bounds ? viewFor(bounds, frame, options) : IDENTITY_VIEW; };
export const focusView = viewFor;
// True when some mark lies outside the frame at the identity view: the card then opens fitted instead of clipped.
export const isClipped = (sketch, frame) => { const b = contentBounds(sketch); return !!b && (b.x < 0 || b.y < 0 || b.x2 > frame.w || b.y2 > frame.h); };
export const initialView = (sketch, frame) => (isClipped(sketch, frame) ? fitView(sketch, frame) : IDENTITY_VIEW);
export const toSketch = (point, view) => ({ x: (point.x - view.tx) / view.s, y: (point.y - view.ty) / view.s });
export const toFrame = (point, view) => ({ x: point.x * view.s + view.tx, y: point.y * view.s + view.ty });

// ---------- Tutor draw-back ----------
// What the Tutor's answer adds to a whiteboard: marks (author 'assistant', all carrying the one explanationId) and, for
// graph, 3D, video and scene objects, cards beside the board. { explanationId, marks: { strokes?, shapes?, items? },
// cards: [{ kind (a RICH_CARD key), objectId, text, operation }] }.
export function validateDrawBack(result) {
  const errors = [];
  if (!plain(result) || typeof result.explanationId !== 'string' || !result.explanationId) return { ok: false, errors: ['explanationId is required'] };
  const marks = normalizeSketch(result.marks);
  const check = validateSketch(marks);
  errors.push(...check.errors);
  for (const [list, items] of listsOf(marks)) items.forEach((mark, i) => {
    if (authorOf(mark) !== 'assistant' || mark.author === undefined) errors.push(`${list}[${i}]: author must be assistant`);
    if (mark.explanationId !== result.explanationId) errors.push(`${list}[${i}]: explanationId must match the result`);
    if (typeof mark.objectId !== 'string' || !mark.objectId) errors.push(`${list}[${i}]: objectId is required`);
  });
  (result.cards || []).forEach((card, i) => {
    if (!RICH_CARD[card?.kind]) errors.push(`cards[${i}]: kind ${String(card?.kind).slice(0, 20)} is not a card kind`);
    if (typeof card?.objectId !== 'string' || !card.objectId) errors.push(`cards[${i}]: objectId is required`);
  });
  return { ok: !errors.length, errors };
}
// The same request gives the same id, so a retry or a reload after the answer was drawn finds its marks and cards already
// there. requestKey is stable per Tutor request: the answer block's id, or a digest of the question.
export const explanationIdFor = (whiteboardId, requestKey) => `exp:${digestOf([whiteboardId, requestKey])}`;
// Remove explanation: the Tutor's marks (one explanation, or all) go, the learner's and the lesson's stay. Cards beside the
// board are ordinary cards and are not touched.
export function removeExplanation(sketch, explanationId) {
  const keep = mark => authorOf(mark) !== 'assistant' || (explanationId !== undefined && mark.explanationId !== explanationId);
  const s = normalizeSketch(sketch);
  return { strokes: s.strokes.filter(keep), shapes: s.shapes.filter(keep), items: s.items.filter(keep) };
}
export const countAssistant = sketch => listsOf(sketch).reduce((n, [, marks]) => n + marks.filter(mark => authorOf(mark) === 'assistant').length, 0);

// ---------- rich-media cards beside a board ----------
// An ordinary canvas card whose `whiteboardLink` says where it came from: { whiteboard, explanationId, objectId }. The card
// id is a function of the link, so inserting twice is one card (retry, reload, two tabs); an existing card is never replaced.
export const cardIdFor = link => `wbcard:${digestOf([link.whiteboard, link.explanationId, link.objectId])}`;
export const validateLink = link => ({ ok: plain(link) && ['whiteboard', 'explanationId', 'objectId'].every(key => typeof link[key] === 'string' && link[key]), errors: [] });
export function insertLinkedCards(blocks, cards) {
  const have = new Set(blocks.map(block => block.id)), added = [];
  const next = [...blocks];
  for (const card of cards) {
    if (!validateLink(card.whiteboardLink).ok || RICH_CARD[card.kind] === undefined) throw new Error('a linked card needs a card kind and a whiteboardLink');
    const id = cardIdFor(card.whiteboardLink);
    if (have.has(id)) continue;
    have.add(id); added.push(id);
    next.push({ ...card.block, id, type: RICH_CARD[card.kind], whiteboardLink: card.whiteboardLink });
  }
  return { blocks: next, added };
}
export const cardsOf = (blocks, whiteboardId) => blocks.filter(block => block.whiteboardLink?.whiteboard === whiteboardId);

// ---------- legacy marks: where each tldraw record goes ----------
// shape: a record as read by legacy-whiteboard.js readLegacySnapshot (kind, geo, bend, spline). Returns where the converter
// puts it, or null when the native sketch has no counterpart: such a record stays in `snapshot`, is listed by the editor
// as kept from the original board, and is never dropped or flattened. approx: the native mark is a close stand-in.
const GEO = { rectangle: 'rect', ellipse: 'ellipse', triangle: 'triangle', diamond: 'diamond', hexagon: 'hexagon', star: 'star' };
const GEO_APPROX = { oval: 'rect', cloud: 'ellipse', heart: 'ellipse', rhombus: 'diamond', 'rhombus-2': 'diamond', pentagon: 'hexagon', octagon: 'hexagon', trapezoid: 'rect', 'x-box': 'rect', 'check-box': 'rect', 'arrow-left': 'rect', 'arrow-right': 'rect', 'arrow-up': 'rect', 'arrow-down': 'rect' };
export function legacyTarget(shape) {
  switch (shape?.kind) {
    case 'stroke': return { list: 'strokes', kind: shape.highlight ? 'highlighter' : 'pen', approx: false };
    case 'geo': return GEO[shape.geo] ? { list: 'shapes', kind: GEO[shape.geo], approx: false } : { list: 'shapes', kind: GEO_APPROX[shape.geo] || 'rect', approx: true };
    case 'arrow': return { list: 'shapes', kind: Math.abs(shape.bend || 0) > 1 ? 'curve' : 'arrow', approx: false };
    case 'line': return { list: 'shapes', kind: 'line', approx: shape.spline === 'cubic' };
    case 'frame': return { list: 'shapes', kind: 'rect', approx: true };
    case 'text': return { list: 'items', kind: 'text', approx: false };
    case 'note': return { list: 'items', kind: 'sticky', approx: false };
    default: return null; // group (members keep legacyGroup), image, video, embed, bookmark, card, unknown
  }
}
