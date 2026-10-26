// Converts what tldraw saved into the native sketch (docs/features/tldraw-removal.md, workstream B). Pure, no tldraw, no
// storage: it reads through legacy-whiteboard.js and returns new objects, so the stored snapshot is never touched and a
// reopened board converts to the same marks and the same ids every time. Nothing here writes; the host decides, with
// whiteboard-sketch.js mayPersist, whether a derived sketch is ever saved.
//
// Approximation rules (each mark that departs from the original carries `approx`, a short reason, and the editor says so):
//  - rotation: strokes, lines and arrows rotate exactly (their points are transformed). A box stands upright at its rotated
//    centre, with width and height swapped at a quarter turn; that is exact for a rect, ellipse or diamond at any quarter turn
//    and for a hexagon at a half turn. Any other angle is `approx`, with the angle kept as `legacyRotation`. Text and notes
//    stand upright at their rotated centre.
//  - fills: tldraw's semi fill (the page colour) becomes none; solid, pattern and lined become a 20 percent tint, fill is opaque.
//  - frames: a rectangle plus a title; nothing is clipped to it, children keep their page positions.
//  - groups: no mark of their own; each member carries `legacyGroup` (its innermost group). Nesting is only in the snapshot.
//  - arrows: ends are page points. An end glued to a shape without a precise anchor is drawn to that shape's outline, on the
//    line toward the other end, as tldraw drew it; gluing itself is lost (the arrow no longer follows a moved shape).
//    A bend becomes a `curve` (the canvas curve has one fixed bend, so a different bend is `approx`), an elbow route an `elbow`.
//  - a line of more than two points is one pen stroke (`approx`), a spline is not smoothed.
//  - z-order is kept within each list (strokes, shapes, items) but not across them.
// Cannot be represented, so it stays only in the retained snapshot and is listed in `kept`: image, video, embed, bookmark,
// the three app shapes (three-d-viewer, interactive-graph, learn-video-pending), any unknown record, groups' relationships
// beyond `legacyGroup`, locks, every page but the one shown, pressure, rich text formatting, pattern fills, tldraw fonts.
import { LABEL_PX, LEGACY_STROKE, TEXT_PX, applyMatrix, invertMatrix, legacyColor, readLegacySnapshot, snapshotParts } from './legacy-whiteboard.js';
import { CONVERTER_VERSION, LIMITS, emptySketch, legacyState, legacyTarget, normalizeSketch, withStrokeIds } from './whiteboard-sketch.js';

// ---- look: tldraw names to the canvas's own fields ----
const INK = { black: '#37352f', blue: '#2383e2', red: '#b42318', green: '#1a7f37', violet: '#7c3aed' }; // the canvas palette; the rest keep tldraw's own colour
const inkOf = name => INK[name] || (name ? legacyColor(name) : INK.black);
const NOTE_INK = { black: '#37352f', yellow: '#f59e0b', orange: '#f59e0b', grey: '#37352f', white: '#37352f', blue: '#2383e2', 'light-blue': '#2383e2', red: '#b42318', 'light-red': '#b42318', green: '#1a7f37', 'light-green': '#1a7f37', violet: '#7c3aed', 'light-violet': '#7c3aed' };
const DASH = { dashed: 'dashed', dotted: 'dotted' };
// tldraw's `semi` fill is the page colour (the box hides what is behind it); the sketch has no such fill, so it becomes none.
const FILL_OPACITY = { solid: 0.2, pattern: 0.2, 'lined-fill': 0.2, fill: 1 };
const FONT = { sans: 'sans', serif: 'serif', mono: 'mono' }; // tldraw's hand-drawn font has no counterpart: the canvas default is used
const ALIGN = { start: 'left', 'start-legacy': 'left', middle: 'center', 'middle-legacy': 'center', end: 'right', 'end-legacy': 'right' };
const VALIGN = { start: 'top', middle: 'middle', end: 'bottom' };
const HEAD = { none: 'none', arrow: 'arrow', triangle: 'triangle', dot: 'dot', pipe: 'bar', bar: 'bar', inverted: 'triangle', diamond: 'dot', square: 'dot' };
const HEAD_EXACT = new Set(['none', 'arrow', 'triangle', 'dot', 'pipe']);

// The record kinds a document snapshot holds that the reader understands; any other kind is counted in the report and stays in the snapshot.
const KNOWN_RECORDS = ['document', 'page', 'shape', 'asset', 'binding'];
const tenth = n => Math.round(n * 10) / 10;
const clone = value => (value && typeof value === 'object' ? structuredClone(value) : value);
const angleOf = m => Math.atan2(m[1], m[0]);
const quarter = angle => { const k = angle / (Math.PI / 2); return Math.abs(k - Math.round(k)) < 0.01 ? ((Math.round(k) % 4) + 4) % 4 : null; }; // quarter turns, or null
const clean = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

// Ramer-Douglas-Peucker without recursion: keeps the points that bend the path more than `tolerance` px.
function simplify(points, tolerance) {
  if (points.length < 3 || !tolerance) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1, worst = tolerance;
    const dx = points[b].x - points[a].x, dy = points[b].y - points[a].y, length = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      const away = length ? Math.abs(dy * (points[i].x - points[a].x) - dx * (points[i].y - points[a].y)) / length : Math.hypot(points[i].x - points[a].x, points[i].y - points[a].y);
      if (away > worst) { worst = away; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return points.filter((_, i) => keep[i]);
}
// Points to the sketch's 0.1 px grid; a point repeating the one before it adds nothing.
const roundPath = points => points.map(p => ({ x: tenth(p.x), y: tenth(p.y) })).filter((p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y);

// Where a glued, imprecise arrow end lands: on the shape's outline, on the line from the shape's centre toward `toward` (page space).
function outlinePoint(target, toward) {
  const half = { x: target.w / 2, y: target.h / 2 }, local = applyMatrix(invertMatrix(target.matrix), toward);
  const d = { x: local.x - half.x, y: local.y - half.y };
  const reach = target.geo === 'ellipse' ? 1 / (Math.hypot(d.x / half.x, d.y / half.y) || 1) : Math.min(half.x / (Math.abs(d.x) || 1e-9), half.y / (Math.abs(d.y) || 1e-9));
  const s = Math.min(1, reach);
  return applyMatrix(target.matrix, { x: half.x + d.x * s, y: half.y + d.y * s });
}

// What a text box occupies, as S1 estimates it (no font metrics here): used to stand rotated text upright at its centre.
function textBox(shape) {
  const px = (TEXT_PX[shape.size] || 24) * shape.scale, rows = shape.text.split('\n');
  return { w: shape.autoSize ? Math.max(...rows.map(row => row.length)) * px * 0.55 : shape.w, h: rows.length * px * 1.35 };
}

function convert(read, tolerance) {
  const out = { strokes: [], shapes: [], items: [] }, kept = [], approx = [], skipped = [], groups = {}, used = new Set();
  const byId = Object.fromEntries(read.shapes.map(shape => [shape.id, shape]));
  const unique = base => { let id = base, n = 1; while (used.has(id)) id = `${base}~${n++}`; used.add(id); return id; };
  const groupOf = shape => (byId[shape.parentId]?.kind === 'group' ? shape.parentId : undefined);
  const add = (list, mark, shape, reasons = []) => {
    const meta = shape.meta && typeof shape.meta === 'object' && Object.keys(shape.meta).length ? clone(shape.meta) : undefined;
    const author = meta?.author === 'tutor' ? 'assistant' : ['learner', 'lesson', 'assistant'].includes(meta?.author) ? meta.author : undefined;
    const reason = [...new Set(reasons)].join(', ') || undefined;
    const group = groupOf(shape);
    if (group) (groups[group] ||= []).push(mark.id);
    out[list].push(clean({
      ...mark, ...(shape.opacity < 1 ? { opacity: shape.opacity } : {}), legacyId: shape.id, legacyGroup: group, author,
      explanationId: typeof meta?.explanationId === 'string' ? meta.explanationId : undefined, objectId: typeof meta?.objectId === 'string' ? meta.objectId : undefined, meta, approx: reason,
    }));
    if (reason) approx.push({ id: mark.id, legacyId: shape.id, reason });
  };
  // A box: where it lands once rotation is dealt with. Returns { x1, y1, x2, y2, reasons, rotation }.
  const box = (shape, kind) => {
    const angle = angleOf(shape.matrix), turns = quarter(angle);
    const centre = applyMatrix(shape.matrix, { x: shape.w / 2, y: shape.h / 2 });
    const odd = turns === 1 || turns === 3;
    const exact = turns === 0 || (['rect', 'ellipse', 'diamond'].includes(kind) && odd) || (['rect', 'ellipse', 'diamond', 'hexagon'].includes(kind) && turns === 2);
    const w = odd ? shape.h : shape.w, h = odd ? shape.w : shape.h;
    const at = turns === 0 ? { x: shape.matrix[4], y: shape.matrix[5] } : { x: centre.x - w / 2, y: centre.y - h / 2 };
    return { x1: tenth(at.x), y1: tenth(at.y), x2: tenth(at.x + w), y2: tenth(at.y + h), reasons: exact ? [] : ['rotation'], rotation: exact ? undefined : Math.round(angle * 1e4) / 1e4 };
  };
  const words = (shape, props) => clean({ fontSize: props.px && Math.min(160, Math.max(8, Math.round(props.px))), font: FONT[shape.font], align: ALIGN[props.align], valign: VALIGN[props.valign] });

  for (const shape of read.shapes) {
    const target = legacyTarget(shape), reasons = [];
    if (shape.kind === 'group') continue;
    if (!target) {
      const corners = shape.w ? [[0, 0], [shape.w, 0], [shape.w, shape.h], [0, shape.h]].map(([x, y]) => applyMatrix(shape.matrix, { x, y })) : [{ x: shape.matrix[4], y: shape.matrix[5] }];
      kept.push(clean({ id: shape.id, type: shape.type, kind: shape.kind, label: shape.label || shape.alt || undefined, group: groupOf(shape),
        x: tenth(Math.min(...corners.map(p => p.x))), y: tenth(Math.min(...corners.map(p => p.y))), x2: tenth(Math.max(...corners.map(p => p.x))), y2: tenth(Math.max(...corners.map(p => p.y))) }));
      continue;
    }
    if (shape.locked) reasons.push('lock not kept'); // the sketch has no lock: the mark stays editable
    if (shape.kind === 'stroke') {
      let points = roundPath(shape.points.map(p => applyMatrix(shape.matrix, p)));
      if (!points.length) { skipped.push({ legacyId: shape.id, reason: 'no points' }); continue; }
      if (shape.closed && points.length > 2) points.push(points[0]);
      if (points.length === 1) points = [points[0], { ...points[0] }]; // a dot: two equal points draw a round dot
      const before = points.length;
      points = simplify(points, tolerance);
      if (points.length < before && tolerance >= 1) reasons.push('simplified'); // under 1 px the thinning cannot be seen
      const scale = shape.scale || 1, width = (LEGACY_STROKE[shape.size] || 3.5) * scale;
      if (shape.closed && shape.fill !== 'none') reasons.push('fill');
      if (target.kind === 'highlighter') { if (!['yellow', 'orange', undefined].includes(shape.color)) reasons.push('highlighter colour'); add('strokes', { id: unique(shape.id), tool: 'highlighter', width: width * 4, points }, shape, reasons); }
      else add('strokes', { id: unique(shape.id), tool: 'pen', color: inkOf(shape.color), width, ...(DASH[shape.dash] ? { dash: DASH[shape.dash] } : {}), points }, shape, reasons);
    } else if (shape.kind === 'geo' || shape.kind === 'frame') {
      const frame = shape.kind === 'frame', placed = box(shape, target.kind);
      reasons.push(...placed.reasons);
      if (['pattern', 'lined-fill'].includes(shape.fill)) reasons.push('pattern fill');
      if (target.approx) reasons.push(frame ? 'frame' : `${shape.geo} drawn as ${target.kind}`);
      const width = (LEGACY_STROKE[shape.size] || 3.5) * (shape.scale || 1), color = inkOf(frame ? 'grey' : shape.color);
      const label = !frame && shape.text ? { text: shape.text, ...words(shape, { px: (LABEL_PX[shape.size] || 22) * shape.scale, align: shape.align, valign: shape.verticalAlign }), ...(shape.labelColor && shape.labelColor !== shape.color ? { textColor: inkOf(shape.labelColor) } : {}) } : {};
      add('shapes', { id: unique(shape.id), kind: target.kind, x1: placed.x1, y1: placed.y1, x2: placed.x2, y2: placed.y2, color: frame ? '#717171' : color, width: frame ? 2 : width,
        ...(DASH[shape.dash] && !frame ? { dash: DASH[shape.dash] } : {}), ...(!frame && shape.fill in FILL_OPACITY ? { fill: color, fillOpacity: FILL_OPACITY[shape.fill] } : {}), ...label, legacyRotation: placed.rotation }, shape, reasons);
      if (frame && shape.name) add('items', { id: unique(`${shape.id}#name`), kind: 'text', x: placed.x1, y: tenth(placed.y1 - 22), text: shape.name, color: '#717171', level: 'body' }, { ...shape, opacity: 1, meta: {} }, ['frame title']);
    } else if (shape.kind === 'arrow') {
      const rawA = applyMatrix(shape.matrix, shape.start), rawB = applyMatrix(shape.matrix, shape.end), glue = shape.bound || {};
      // A glued end without a precise anchor was drawn to the shape's outline; the reader put it at the shape's centre.
      const land = (field, raw, other) => { const g = glue[field]; return g && !g.precise && Math.abs(g.anchor.x - 0.5) < 1e-6 && Math.abs(g.anchor.y - 0.5) < 1e-6 ? outlinePoint(byId[g.id], other) : raw; };
      let a = land('start', rawA, rawB), b = land('end', rawB, rawA);
      if (glue.start || glue.end) reasons.push('glued end freed');
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1, bent = Math.abs(shape.bend) > 1;
      let kind = shape.route === 'elbow' ? 'elbow' : bent ? 'curve' : 'arrow', start = HEAD[shape.headStart] ?? 'none', end = HEAD[shape.headEnd] ?? 'none';
      if (kind === 'elbow') reasons.push('elbow route');
      if (kind === 'curve') {
        // The canvas curve bows to the right of its direction (curveControl, AdaptiveCanvas.jsx); tldraw's positive bend bows to the left, so those flip ends and heads.
        if (shape.bend > 0) { [a, b] = [b, a]; [start, end] = [end, start]; }
        if (Math.abs(Math.abs(shape.bend) / (0.15 * length) - 1) > 0.2) reasons.push('curve bend');
      }
      if (!HEAD_EXACT.has(shape.headStart || 'none') || !HEAD_EXACT.has(shape.headEnd || 'none')) reasons.push('arrowhead');
      const width = (LEGACY_STROKE[shape.size] || 3.5) * (shape.scale || 1);
      add('shapes', { id: unique(shape.id), kind, x1: tenth(a.x), y1: tenth(a.y), x2: tenth(b.x), y2: tenth(b.y), color: inkOf(shape.color), width, ...(DASH[shape.dash] ? { dash: DASH[shape.dash] } : {}), startHead: start, endHead: end,
        ...(shape.text ? { label: shape.text, ...words(shape, { px: (LABEL_PX[shape.size] || 22) * shape.scale }) } : {}) }, shape, reasons);
    } else if (shape.kind === 'line') {
      const points = shape.points.map(p => applyMatrix(shape.matrix, p)), width = (LEGACY_STROKE[shape.size] || 3.5) * (shape.scale || 1);
      if (points.length < 2) { skipped.push({ legacyId: shape.id, reason: 'fewer than two points' }); continue; }
      if (shape.spline === 'cubic') reasons.push('spline');
      if (points.length === 2) add('shapes', { id: unique(shape.id), kind: 'line', x1: tenth(points[0].x), y1: tenth(points[0].y), x2: tenth(points[1].x), y2: tenth(points[1].y), color: inkOf(shape.color), width, ...(DASH[shape.dash] ? { dash: DASH[shape.dash] } : {}), startHead: 'none', endHead: 'none' }, shape, reasons);
      else add('strokes', { id: unique(shape.id), tool: 'pen', color: inkOf(shape.color), width, ...(DASH[shape.dash] ? { dash: DASH[shape.dash] } : {}), points: simplify(roundPath(points), tolerance) }, shape, [...reasons, 'line drawn as a stroke']);
    } else if (shape.kind === 'text' || shape.kind === 'note') {
      const note = shape.kind === 'note', size = note ? { w: shape.w, h: shape.h } : textBox(shape), rotated = quarter(angleOf(shape.matrix)) !== 0;
      const centre = applyMatrix(shape.matrix, { x: size.w / 2, y: size.h / 2 });
      const at = rotated ? { x: centre.x - size.w / 2, y: centre.y - size.h / 2 } : { x: shape.matrix[4], y: shape.matrix[5] };
      if (rotated) reasons.push('rotation');
      const px = (note ? LABEL_PX : TEXT_PX)[shape.size] * shape.scale;
      add('items', { id: unique(shape.id), kind: note ? 'sticky' : 'text', x: tenth(at.x), y: tenth(at.y), text: shape.text, color: note ? NOTE_INK[shape.color] || '#37352f' : inkOf(shape.color),
        ...(note ? { w: tenth(shape.w), h: tenth(shape.h) } : shape.autoSize ? {} : { w: tenth(shape.w) }), ...words(shape, { px, align: note ? shape.align : shape.textAlign }) }, shape, reasons);
    }
  }
  return { sketch: out, kept, approx, skipped, groups };
}

// The snapshot's current page as { ok, sketch, kept, approx, report }. `target` (default 300,000 characters, three quarters of
// the block cap, leaving room for later edits) bounds the sketch: when the exact conversion is larger, strokes are thinned a
// little at a time (0.25, 0.5, 1, 2 px) until it fits, deterministically, so every open gives the same result. The snapshot keeps
// every original point either way.
export function convertLegacy(value, { pageId, target = LIMITS.sketchChars * 0.75 } = {}) {
  const read = readLegacySnapshot(value, { pageId });
  if (!read.ok) return { ok: false, reason: read.reason, sketch: emptySketch(), kept: [], approx: [], report: null };
  let tolerance = 0, done = convert(read, 0), chars = JSON.stringify(done.sketch).length;
  for (const next of [0.25, 0.5, 1, 2]) { if (chars <= target) break; tolerance = next; done = convert(read, next); chars = JSON.stringify(done.sketch).length; }
  const others = read.pages.filter(page => page.id !== read.pageId).map(page => ({ ...page, shapes: readLegacySnapshot(value, { pageId: page.id }).shapes.length }));
  const sketch = withStrokeIds(done.sketch);
  const unknownRecords = {};
  for (const record of Object.values(snapshotParts(value).store)) if (record && typeof record === 'object' && !KNOWN_RECORDS.includes(record.typeName)) unknownRecords[record.typeName] = (unknownRecords[record.typeName] || 0) + 1;
  return { ok: true, sketch, kept: done.kept, approx: done.approx, report: {
    version: CONVERTER_VERSION, page: read.pages.find(page => page.id === read.pageId) || null, otherPages: others, counts: { strokes: sketch.strokes.length, shapes: sketch.shapes.length, items: sketch.items.length },
    kept: done.kept.length, approx: done.approx.length, skipped: done.skipped, groups: done.groups, unsupported: read.unsupported, unknownRecords, simplified: tolerance, sketchChars: chars,
  } };
}

// What a whiteboard block shows when it opens, and nothing else: never mutates the block, never writes. Reads the block's
// `snapshot` in any of the three stored shapes (the editor snapshot, the document alone, a bare store). A saved sketch always
// wins over the snapshot (it holds the learner's edits); only a block with no saved sketch is derived, in memory.
//   sketch: what to draw. status: legacyState. derived: true when `sketch` was built from the snapshot just now and is not saved.
//   kept: snapshot objects with no native counterpart, with page boxes. approx: marks that are close stand-ins.
//   warnings: plain sentences the editor can show. report: the converter's counts (null when nothing was converted).
export function deriveSketch(block) {
  const status = legacyState(block), saved = block?.sketch != null, warnings = [];
  const keep = saved ? withStrokeIds(block.sketch) : null;
  if (status === 'none') return { sketch: keep || emptySketch(), status, derived: false, kept: [], approx: approxOf(keep), warnings, report: null };
  const legacy = convertLegacy(block.snapshot);
  if (!legacy.ok) warnings.push('The original drawing could not be read by this version. It is kept unchanged and can be downloaded.');
  if (status === 'diverged') warnings.push('The original board was changed by an older version after this drawing was made. Both are kept.');
  if (saved && block.sketchFrom == null) warnings.push('This drawing has no record of the original board it came from. Both are kept.');
  const foreign = Object.keys(legacy.report?.unknownRecords || {}).length + Object.keys(legacy.report?.unsupported || {}).length;
  if (foreign) warnings.push('The original board holds objects this version does not know. They are kept in the original.');
  if (legacy.report?.otherPages.length) warnings.push(`${legacy.report.otherPages.length} other page${legacy.report.otherPages.length === 1 ? '' : 's'} of the original board stay only in the original.`);
  return { sketch: keep || legacy.sketch, status, derived: !saved && legacy.ok, kept: legacy.kept, approx: saved ? approxOf(keep) : legacy.approx, warnings, report: legacy.report };
}
const approxOf = sketch => (sketch ? Object.values(normalizeSketch(sketch)).flat().filter(mark => mark.approx).map(mark => ({ id: mark.id, legacyId: mark.legacyId, reason: mark.approx })) : []);

// What the learner is told when a save is refused (saveVerdict). The original is never deleted to make room, so every message
// says so, and both downloads stay offered. Returns null for a save that fits.
export function saveNotice(verdict) {
  if (!verdict || verdict.ok && !verdict.warn) return null;
  const downloads = ['Download my drawing', 'Download original'];
  if (verdict.ok) return { level: 'warn', message: 'This canvas is close to its size limit.', keepsOriginal: true, downloads };
  const why = verdict.reason === 'sketch-too-large' ? 'This drawing is too large to save beside the original board.' : 'This canvas is full, so this change cannot be saved.';
  return { level: 'error', message: `${why} Nothing was deleted: the original board is still saved as it was. Your changes stay on screen until you leave this page. Use Download my drawing to keep them.`, keepsOriginal: true, downloads };
}
