// Native diagrams for the inline editor (owner brief 2026-10-13 §6). A model gives structure only - shapes with labels,
// connectors with direction, groups, and relative layout hints - in the canvas's own vocabulary. App code checks it
// (validateDiagram), lays it out deterministically (layoutDiagram) and turns it into ordinary canvas shapes, connectors
// and groups with fresh ids (toCanvasObjects): the same records the shape tools and the connector tool store. Pure.
// No subject knowledge lives here: a tree, a cycle or a pipeline is only what the model's connectors say.
import { DEFAULT_STYLE } from './inline-placement.js';

export const DIAGRAM_LIMITS = Object.freeze({ shapes: 40, connectors: 60, groups: 8, id: 40, label: 80, text: 2400 });
export const NODE_KINDS = Object.freeze(['rect', 'ellipse', 'diamond', 'triangle', 'hexagon', 'star']);
export const DIRECTIONS = Object.freeze(['forward', 'both', 'none']);
export const FLOWS = Object.freeze(['down', 'right', 'up', 'left']);
export const ARRANGEMENTS = Object.freeze(['layered', 'row', 'column', 'grid', 'cycle']);
// Tones name a role, never a colour: the region's own ink for default, the canvas palette (CanvasStylePanel COLORS) else.
export const TONES = Object.freeze({ default: null, accent: '#2383e2', success: '#1a7f37', warning: '#f59e0b', danger: '#b42318', highlight: '#7c3aed', muted: '#6b7280' });
const SPACING = [0.5, 3];

const text = (max, min = 1) => ({ type: 'string', minLength: min, maxLength: max });
// The model's tool input. validateDiagram checks the same rules again: a schema is a request, not a guarantee.
export const DIAGRAM_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false, required: ['shapes'],
  properties: {
    layout: { type: 'object', additionalProperties: false, properties: {
      arrange: { type: 'string', enum: [...ARRANGEMENTS] }, flow: { type: 'string', enum: [...FLOWS] },
      spacing: { type: 'number', minimum: SPACING[0], maximum: SPACING[1] },
    } },
    shapes: { type: 'array', minItems: 1, maxItems: DIAGRAM_LIMITS.shapes, items: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: {
      id: text(DIAGRAM_LIMITS.id), label: text(DIAGRAM_LIMITS.label), kind: { type: 'string', enum: [...NODE_KINDS] }, tone: { type: 'string', enum: Object.keys(TONES) },
    } } },
    connectors: { type: 'array', maxItems: DIAGRAM_LIMITS.connectors, items: { type: 'object', additionalProperties: false, required: ['from', 'to'], properties: {
      from: text(DIAGRAM_LIMITS.id), to: text(DIAGRAM_LIMITS.id), label: text(DIAGRAM_LIMITS.label, 0), direction: { type: 'string', enum: [...DIRECTIONS] },
    } } },
    groups: { type: 'array', maxItems: DIAGRAM_LIMITS.groups, items: { type: 'object', additionalProperties: false, required: ['label', 'members'], properties: {
      label: text(DIAGRAM_LIMITS.label, 0), members: { type: 'array', minItems: 2, items: text(DIAGRAM_LIMITS.id) },
    } } },
  },
});

const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const extra = (entry, allowed) => Object.keys(entry).filter(key => !allowed.includes(key));
const words = (value, max, min = 1) => typeof value === 'string' && value.trim().length >= min && value.length <= max;

// Every reference resolves, only listed properties and values, finite numbers, and limits on counts and text. Returns
// { ok, errors, spec } with defaults filled in; nothing is laid out or drawn from a spec that is not ok.
export function validateDiagram(spec) {
  const errors = [];
  if (!plain(spec)) return { ok: false, errors: ['The diagram is not an object.'], spec: null };
  for (const key of extra(spec, ['layout', 'shapes', 'connectors', 'groups'])) errors.push(`Unsupported property ${key}.`);
  const layout = spec.layout ?? {};
  if (!plain(layout)) errors.push('layout must be an object.');
  else {
    for (const key of extra(layout, ['arrange', 'flow', 'spacing'])) errors.push(`Unsupported layout property ${key}.`);
    if (layout.arrange != null && !ARRANGEMENTS.includes(layout.arrange)) errors.push(`Unknown arrangement ${layout.arrange}.`);
    if (layout.flow != null && !FLOWS.includes(layout.flow)) errors.push(`Unknown flow ${layout.flow}.`);
    if (layout.spacing != null && !(typeof layout.spacing === 'number' && Number.isFinite(layout.spacing) && layout.spacing >= SPACING[0] && layout.spacing <= SPACING[1])) errors.push('spacing must be a finite number from 0.5 to 3.');
  }
  const shapes = Array.isArray(spec.shapes) ? spec.shapes : [];
  const connectors = spec.connectors ?? [], groups = spec.groups ?? [];
  if (!shapes.length) errors.push('A diagram needs at least one shape.');
  if (shapes.length > DIAGRAM_LIMITS.shapes) errors.push(`At most ${DIAGRAM_LIMITS.shapes} shapes.`);
  if (!Array.isArray(connectors) || connectors.length > DIAGRAM_LIMITS.connectors) errors.push(`connectors must be a list of at most ${DIAGRAM_LIMITS.connectors}.`);
  if (!Array.isArray(groups) || groups.length > DIAGRAM_LIMITS.groups) errors.push(`groups must be a list of at most ${DIAGRAM_LIMITS.groups}.`);
  const ids = new Set();
  let chars = 0;
  for (const shape of shapes) {
    if (!plain(shape)) { errors.push('A shape is not an object.'); continue; }
    for (const key of extra(shape, ['id', 'label', 'kind', 'tone'])) errors.push(`Unsupported shape property ${key}.`);
    if (!words(shape.id, DIAGRAM_LIMITS.id)) errors.push('Every shape needs a short id.');
    else if (ids.has(shape.id)) errors.push(`Shape id ${shape.id} is used twice.`);
    else ids.add(shape.id);
    if (!words(shape.label, DIAGRAM_LIMITS.label)) errors.push(`Shape ${String(shape.id).slice(0, 40)} needs a label of at most ${DIAGRAM_LIMITS.label} characters.`);
    if (shape.kind != null && !NODE_KINDS.includes(shape.kind)) errors.push(`Unknown shape kind ${shape.kind}.`);
    if (shape.tone != null && !Object.hasOwn(TONES, shape.tone)) errors.push(`Unknown tone ${shape.tone}.`);
    chars += String(shape.label || '').length;
  }
  for (const link of Array.isArray(connectors) ? connectors : []) {
    if (!plain(link)) { errors.push('A connector is not an object.'); continue; }
    for (const key of extra(link, ['from', 'to', 'label', 'direction'])) errors.push(`Unsupported connector property ${key}.`);
    if (!ids.has(link.from) || !ids.has(link.to)) errors.push(`A connector joins ${String(link.from).slice(0, 40)} to ${String(link.to).slice(0, 40)}, which are not both shapes of this diagram.`);
    else if (link.from === link.to) errors.push(`A connector joins ${link.from} to itself.`);
    if (link.label != null && !words(link.label, DIAGRAM_LIMITS.label, 0)) errors.push('A connector label is too long.');
    if (link.direction != null && !DIRECTIONS.includes(link.direction)) errors.push(`Unknown direction ${link.direction}.`);
    chars += String(link.label || '').length;
  }
  const grouped = new Set();
  for (const group of Array.isArray(groups) ? groups : []) {
    if (!plain(group)) { errors.push('A group is not an object.'); continue; }
    for (const key of extra(group, ['label', 'members'])) errors.push(`Unsupported group property ${key}.`);
    if (group.label != null && !words(group.label, DIAGRAM_LIMITS.label, 0)) errors.push('A group label is too long.');
    const members = Array.isArray(group.members) ? group.members : [];
    if (members.length < 2) errors.push('A group needs at least two members.');
    for (const id of members) {
      if (!ids.has(id)) errors.push(`Group member ${String(id).slice(0, 40)} is not a shape of this diagram.`);
      else if (grouped.has(id)) errors.push(`Shape ${id} is in two groups.`);
      else grouped.add(id);
    }
    chars += String(group.label || '').length;
  }
  if (chars > DIAGRAM_LIMITS.text) errors.push(`The diagram's text is longer than ${DIAGRAM_LIMITS.text} characters.`);
  if (errors.length) return { ok: false, errors, spec: null };
  return { ok: true, errors: [], spec: {
    layout: { arrange: layout.arrange || 'layered', flow: layout.flow || 'down', spacing: layout.spacing ?? 1 },
    shapes: shapes.map(shape => ({ id: shape.id, label: shape.label.trim(), kind: shape.kind || null, tone: shape.tone || 'default' })),
    connectors: connectors.map(link => ({ from: link.from, to: link.to, label: String(link.label || '').trim(), direction: link.direction || 'forward' })),
    groups: groups.map(group => ({ label: String(group.label || '').trim(), members: group.members.slice() })),
  } };
}

// A style number from the board, or the default when it is not a sensible finite value.
const num = (value, fallback, min, max) => (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback);
// A node's box: wide enough for its label on at most three lines at the region's font size, never narrower than the
// region's shapes. ponytail: an estimate (0.6 em per character); the canvas measures text, so a long word may wrap early.
function sizeOf(label, style) {
  const font = num(style.fontSize, DEFAULT_STYLE.fontSize, 8, 64), minW = num(style.nodeW, DEFAULT_STYLE.nodeW, 40, 400), minH = num(style.nodeH, DEFAULT_STYLE.nodeH, 24, 300);
  const line = label.length * font * 0.6, maxW = Math.max(minW, 240);
  const w = Math.min(maxW, Math.max(minW, Math.ceil(line) + 32));
  const lines = Math.min(3, Math.ceil(line / (w - 32)) || 1);
  return { w, h: Math.max(minH, Math.ceil(lines * font * 1.4) + 24) };
}

// Ranks along the connectors, longest path from the sources; an edge back into the current path (a cycle) is skipped,
// found in the spec's order, so the result never depends on anything but the spec.
function ranksOf(ids, connectors) {
  const out = new Map(ids.map(id => [id, []]));
  for (const link of connectors) out.get(link.from).push(link.to);
  const state = new Map(), forward = new Map(ids.map(id => [id, []]));
  const visit = id => {
    state.set(id, 'open');
    for (const next of out.get(id)) {
      if (state.get(next) === 'open') continue;
      forward.get(id).push(next);
      if (!state.has(next)) visit(next);
    }
    state.set(id, 'done');
  };
  for (const id of ids) if (!state.has(id)) visit(id);
  const rank = new Map(ids.map(id => [id, 0]));
  // Longest path over the acyclic forward edges: relax until stable (at most n rounds).
  for (let round = 0, moved = true; moved && round < ids.length; round += 1) {
    moved = false;
    for (const id of ids) for (const next of forward.get(id)) if (rank.get(next) < rank.get(id) + 1) { rank.set(next, rank.get(id) + 1); moved = true; }
  }
  return { rank, forward };
}

// Positions for a checked spec, in the diagram's own frame (top-left at 0,0). Deterministic: the same spec and style give
// the same layout. The model never gives coordinates; spacing comes from the region's style times the spec's hint.
export function layoutDiagram(spec, style = DEFAULT_STYLE) {
  const ids = spec.shapes.map(shape => shape.id), index = new Map(ids.map((id, i) => [id, i]));
  const size = new Map(spec.shapes.map(shape => [shape.id, sizeOf(shape.label, style)]));
  const gap = num(style.gap, DEFAULT_STYLE.gap, 8, 400) * spec.layout.spacing, layerGap = num(style.layerGap, DEFAULT_STYLE.layerGap, 8, 600) * spec.layout.spacing;
  const at = new Map();
  const { arrange, flow } = spec.layout;
  const across = flow === 'right' || flow === 'left'; // layers run left to right instead of top to bottom
  if (arrange === 'layered') {
    const { rank, forward } = ranksOf(ids, spec.connectors);
    const parents = new Map(ids.map(id => [id, []]));
    for (const id of ids) for (const next of forward.get(id)) parents.get(next).push(id);
    const layers = [];
    for (const id of ids) (layers[rank.get(id)] ||= []).push(id);
    // Along a layer: each node near the middle of its parents, in spec order where they tie, then pushed apart so no two
    // overlap, then the layer shifted back so it stays centred on its parents.
    const breadth = id => (across ? size.get(id).h : size.get(id).w), depth = id => (across ? size.get(id).w : size.get(id).h);
    const centre = new Map();
    let offset = 0;
    for (const layer of layers.filter(Boolean)) {
      const want = id => (parents.get(id).length ? parents.get(id).reduce((sum, p) => sum + centre.get(p), 0) / parents.get(id).length : null);
      const order = layer.slice().sort((a, b) => ((want(a) ?? Infinity) - (want(b) ?? Infinity)) || index.get(a) - index.get(b));
      let edge = -Infinity;
      const placed = order.map(id => {
        const start = want(id) == null ? (edge === -Infinity ? 0 : edge + gap) : Math.max(want(id) - breadth(id) / 2, edge === -Infinity ? -Infinity : edge + gap);
        edge = start + breadth(id);
        return [id, start + breadth(id) / 2];
      });
      const anchored = placed.filter(([id]) => want(id) != null);
      const shift = anchored.length ? anchored.reduce((sum, [id, c]) => sum + (want(id) - c), 0) / anchored.length : 0;
      for (const [id, c] of placed) centre.set(id, c + shift);
      const thick = Math.max(...layer.map(depth));
      for (const id of layer) at.set(id, across ? { x: offset + (thick - depth(id)) / 2, y: centre.get(id) - breadth(id) / 2 } : { x: centre.get(id) - breadth(id) / 2, y: offset + (thick - depth(id)) / 2 });
      offset += thick + layerGap;
    }
  } else if (arrange === 'cycle') {
    // Around a circle, clockwise from the top, in spec order; the radius keeps neighbours a gap apart.
    const n = ids.length, widest = Math.max(...ids.map(id => Math.max(size.get(id).w, size.get(id).h)));
    const radius = n < 2 ? 0 : Math.max(widest, ((widest + gap) * n) / (2 * Math.PI));
    ids.forEach((id, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      at.set(id, { x: radius * Math.cos(angle) - size.get(id).w / 2, y: radius * Math.sin(angle) - size.get(id).h / 2 });
    });
  } else {
    // row, column, grid: a grid in spec order, cells as large as the largest node.
    const cols = arrange === 'row' ? ids.length : arrange === 'column' ? 1 : Math.ceil(Math.sqrt(ids.length));
    const cellW = Math.max(...ids.map(id => size.get(id).w)), cellH = Math.max(...ids.map(id => size.get(id).h));
    ids.forEach((id, i) => at.set(id, { x: (i % cols) * (cellW + gap) + (cellW - size.get(id).w) / 2, y: Math.floor(i / cols) * (cellH + gap) + (cellH - size.get(id).h) / 2 }));
  }
  // up and left are down and right mirrored.
  if (arrange === 'layered' && (flow === 'up' || flow === 'left')) for (const id of ids) {
    const box = at.get(id), s = size.get(id);
    at.set(id, flow === 'up' ? { x: box.x, y: -box.y - s.h } : { x: -box.x - s.w, y: box.y });
  }
  const minX = Math.min(...ids.map(id => at.get(id).x)), minY = Math.min(...ids.map(id => at.get(id).y));
  const nodes = ids.map(id => ({ id, x: Math.round(at.get(id).x - minX), y: Math.round(at.get(id).y - minY), ...size.get(id) }));
  const bounds = { x: 0, y: 0, w: Math.max(...nodes.map(node => node.x + node.w)), h: Math.max(...nodes.map(node => node.y + node.h)) };
  return { nodes, bounds };
}

// Which sides a connector leaves and enters by: the facing sides along the larger offset between the two centres.
function sides(a, b) {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2), dy = b.y + b.h / 2 - (a.y + a.h / 2);
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
}

// The canvas records for a laid-out diagram placed at `at` (its top-left in world units, from placeResult), as one
// insertion: { id, kind: 'diagram', shapes, links, groups } for applyTx. Ids are fresh, from the request id; the spec's
// own ids never reach the canvas. taken: every id on the board now - a clash refuses rather than overwrite anything.
export function toCanvasObjects(spec, layout, { requestId, at, style = DEFAULT_STYLE, taken = new Set() }) {
  const base = `inline-${requestId}`;
  const shapeId = new Map(spec.shapes.map((shape, i) => [shape.id, `${base}-s${i}`]));
  const groupIds = spec.groups.map((_, i) => `${base}-g${i}`);
  const all = [...shapeId.values(), ...spec.connectors.map((_, i) => `${base}-c${i}`), ...groupIds];
  const clash = all.find(id => taken.has(id));
  if (clash) throw new Error(`The diagram's id ${clash} is already on the canvas.`);
  const groupOf = new Map(spec.groups.flatMap((group, i) => group.members.map(id => [id, groupIds[i]])));
  const node = new Map(layout.nodes.map(entry => [entry.id, { ...entry, x: entry.x + at.x, y: entry.y + at.y }]));
  const ink = style.color || DEFAULT_STYLE.color;
  const shapes = spec.shapes.map(shape => {
    const box = node.get(shape.id);
    const kind = shape.kind || style.kind || DEFAULT_STYLE.kind;
    return {
      id: shapeId.get(shape.id), kind, x1: box.x, y1: box.y, x2: box.x + box.w, y2: box.y + box.h,
      color: TONES[shape.tone] || ink, width: style.width ?? DEFAULT_STYLE.width, dash: 'solid', fill: style.fill ?? null, opacity: 1,
      round: kind === 'rect' && (style.round ?? DEFAULT_STYLE.round), text: shape.label, textColor: style.textColor || DEFAULT_STYLE.textColor,
      font: style.font || DEFAULT_STYLE.font, fontSize: style.fontSize || DEFAULT_STYLE.fontSize, align: 'center', valign: 'middle',
      ...(groupOf.has(shape.id) ? { groupId: groupOf.get(shape.id) } : {}),
    };
  });
  const links = spec.connectors.map((link, i) => {
    const [fromSide, toSide] = sides(node.get(link.from), node.get(link.to));
    return {
      id: `${base}-c${i}`, from: shapeId.get(link.from), fromSide, to: shapeId.get(link.to), toSide, color: style.lineColor || ink,
      route: style.route || DEFAULT_STYLE.route, head: link.direction !== 'none', ...(link.direction === 'both' ? { startHead: 'arrow' } : {}),
      ...(link.label ? { label: link.label } : {}),
    };
  });
  const groups = spec.groups.map((group, i) => ({ id: groupIds[i], label: group.label }));
  for (const shape of shapes) if (![shape.x1, shape.y1, shape.x2, shape.y2].every(Number.isFinite)) throw new Error('The diagram has a position that is not a finite number.');
  return { id: requestId, kind: 'diagram', shapes, links, groups };
}
