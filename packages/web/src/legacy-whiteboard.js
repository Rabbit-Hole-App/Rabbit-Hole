// Reads the snapshots tldraw wrote, without tldraw (docs/features/tldraw-removal.md, slice S1). Pure and read-only: it never
// mutates or rewrites what it is given, so an old whiteboard or note can always be read again and nothing is destroyed.
// It understands the three shapes the app stored: the whole editor snapshot { document: { store, schema }, session } (a
// whiteboard block's `snapshot`), the document alone { document: { store, schema } } (a saved note), and a bare store
// snapshot { store, schema }. A record it does not know becomes `unknown` and is counted, never dropped silently.
// ponytail: geometry is a faithful preview, not tldraw's exact rendering (no text wrapping or font metrics, arrow arcs are
// quadratic, pattern fills are flat); the exact stroke points, text and colours are kept so S2 can convert them.

// tldraw 5.4.2 default light theme (editor/src/lib/editor/managers/ThemeManager/defaultThemes.ts): solid, note, semi, lined.
const PALETTE = {
  black: ['#1d1d1d', '#FCE19C', '#e8e8e8', '#363636'], grey: ['#9fa8b2', '#C0CAD3', '#eceef0', '#bbc1c9'],
  'light-violet': ['#e085f4', '#DFB0F9', '#f5eafa', '#e9abf7'], violet: ['#ae3ec9', '#DB91FD', '#ecdcf2', '#be68d4'],
  blue: ['#4465e9', '#8AA3FF', '#dce1f8', '#6580ec'], 'light-blue': ['#4ba1f1', '#9BC4FD', '#ddedfa', '#7abaf5'],
  yellow: ['#f1ac4b', '#FED49A', '#f9f0e6', '#f5c27a'], orange: ['#e16919', '#FAA475', '#f8e2d4', '#ea8643'],
  green: ['#099268', '#6FC896', '#d3e9e3', '#0bad7c'], 'light-green': ['#4cb05e', '#98D08A', '#dbf0e0', '#7ec88c'],
  'light-red': ['#f87777', '#F7A5A1', '#f4dadb', '#f99a9a'], red: ['#e03131', '#FC8282', '#f4dadb', '#e75f5f'],
  white: ['#FFFFFF', '#FFFFFF', '#f5f5f5', '#ffffff'],
};
const PAGE_SOLID = '#fcfffe';
const tone = (name, at) => (PALETTE[name] || PALETTE.black)[at];
const STROKE = { s: 2, m: 3.5, l: 5, xl: 10 };
const TEXT_PX = { s: 18, m: 24, l: 36, xl: 44 };
const LABEL_PX = { s: 18, m: 22, l: 26, xl: 32 };
const FONTS = { draw: 'Caveat, "Comic Sans MS", cursive', sans: 'Inter, Arial, sans-serif', serif: 'Georgia, serif', mono: 'ui-monospace, Consolas, monospace' };
const NOTE_SIZE = 200;
// The app's own shape types (learn-shape-utils.js): a card in the picture, named by what it held.
const CARDS = { 'three-d-viewer': '3D model', 'interactive-graph': 'Interactive graph', 'learn-video-pending': 'Generated video' };

// A whiteboard block's snapshot, a note's snapshot, or a bare store snapshot; null for anything else.
export function snapshotParts(value) {
  const document = value?.document && typeof value.document === 'object' ? value.document : value;
  const store = document?.store;
  if (!store || typeof store !== 'object' || Array.isArray(store)) return null;
  return { store, schema: document.schema || null, session: value.session || null };
}

// ---- points: tldraw's delta-encoded base64 paths (tlschema/src/misc/b64Vecs.ts) ----
function half(bits) {
  const sign = bits >> 15 ? -1 : 1, exponent = (bits >> 10) & 31, fraction = bits & 1023;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}
// First point as Float32, then Float16 deltas; dim 2 is x,y only, dim 3 (or absent) is x,y,z.
export function decodePath(path, dim) {
  if (typeof path !== 'string' || !path) return [];
  let bytes;
  try { bytes = Uint8Array.from(atob(path), char => char.charCodeAt(0)); } catch { return []; }
  const view = new DataView(bytes.buffer), width = dim === 2 ? 2 : 3, first = 4 * width, step = 2 * width;
  if (bytes.length < first) return [];
  let x = view.getFloat32(0, true), y = view.getFloat32(4, true);
  const points = [{ x, y }];
  for (let at = first; at + step <= bytes.length; at += step) {
    x += half(view.getUint16(at, true)); y += half(view.getUint16(at + 2, true));
    points.push({ x, y });
  }
  return points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}
// A draw or highlight shape's segments joined into one polyline; a pre-b64 segment kept its points as an array.
const pointsOf = segments => (segments || []).flatMap(segment => (Array.isArray(segment.points) ? segment.points : decodePath(segment.path, segment.dim)));

// ---- text: tldraw's rich text is a TipTap document ----
const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote']);
function lines(node) {
  if (!node || typeof node !== 'object') return [''];
  if (node.type === 'text') return [String(node.text || '')];
  if (node.type === 'hardBreak') return ['\n'];
  const parts = (node.content || []).flatMap(lines);
  return BLOCKS.has(node.type) ? [parts.join('')] : parts;
}
export const plainText = (rich, legacy = '') => (rich && rich.type === 'doc' ? lines(rich).join('\n') : String(legacy || '')).trim();

// ---- geometry: [a b c d e f] affine matrices, as SVG's matrix(a b c d e f) ----
const IDENTITY = [1, 0, 0, 1, 0, 0];
const times = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const placed = (x, y, rotation) => [Math.cos(rotation), Math.sin(rotation), -Math.sin(rotation), Math.cos(rotation), x, y];
const apply = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const invert = m => { const d = m[0] * m[3] - m[1] * m[2] || 1; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
const num = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const byIndex = (a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0);

// What a shape is, from the record alone (the fields S2 converts); sizes are local to the shape.
function describe(shape, store) {
  const p = shape.props || {}, text = plainText(p.richText, p.text), scale = num(p.scale, 1);
  switch (shape.type) {
    case 'draw': case 'highlight':
      return { kind: 'stroke', highlight: shape.type === 'highlight', points: pointsOf(p.segments).map(point => ({ x: point.x * num(p.scaleX, 1) * scale, y: point.y * num(p.scaleY, 1) * scale })), color: p.color, size: p.size, dash: p.dash, fill: p.fill, closed: !!p.isClosed };
    case 'geo': return { kind: 'geo', geo: p.geo, w: num(p.w) * scale, h: (num(p.h) + num(p.growY)) * scale, color: p.color, labelColor: p.labelColor, fill: p.fill, dash: p.dash, size: p.size, font: p.font, align: p.align, verticalAlign: p.verticalAlign, text, scale };
    case 'text': return { kind: 'text', text, w: num(p.w), color: p.color, size: p.size, font: p.font, textAlign: p.textAlign, autoSize: p.autoSize !== false, scale };
    case 'note': return { kind: 'note', text, color: p.color, size: p.size, font: p.font, w: NOTE_SIZE * scale, h: (NOTE_SIZE + num(p.growY)) * scale, scale };
    case 'frame': return { kind: 'frame', name: p.name || '', w: num(p.w), h: num(p.h) };
    case 'arrow': return { kind: 'arrow', start: p.start || { x: 0, y: 0 }, end: p.end || { x: 0, y: 0 }, bend: num(p.bend), headStart: p.arrowheadStart, headEnd: p.arrowheadEnd, color: p.color, size: p.size, dash: p.dash, text, labelColor: p.labelColor, font: p.font, scale };
    case 'line': return { kind: 'line', points: Object.values(p.points || {}).sort(byIndex).map(point => ({ x: num(point.x), y: num(point.y) })), color: p.color, size: p.size, dash: p.dash, spline: p.spline, scale };
    case 'image': case 'video': case 'embed': case 'bookmark': {
      const asset = p.assetId && store[p.assetId]?.props;
      return { kind: shape.type, w: num(p.w), h: num(p.h), src: asset?.src || p.url || '', alt: p.altText || asset?.name || '', crop: p.crop || null };
    }
    case 'group': return { kind: 'group' };
    default:
      if (CARDS[shape.type]) return { kind: 'card', type: shape.type, w: num(p.w), h: num(p.h), label: shape.meta?.concept || p.spec?.title || p.spec?.concept || p.caption || CARDS[shape.type] };
      return { kind: 'unknown', type: shape.type };
  }
}

// Reads one page: its shapes in painting order with their page-space matrix. pageId defaults to the session's page, else
// the first page. Never throws on a record it does not understand; { ok: false, reason } only when there is no store.
export function readLegacySnapshot(value, { pageId } = {}) {
  const parts = snapshotParts(value);
  if (!parts) return { ok: false, reason: 'not a tldraw snapshot' };
  const records = Object.values(parts.store).filter(record => record && typeof record === 'object');
  const pages = records.filter(record => record.typeName === 'page').sort(byIndex).map(page => ({ id: page.id, name: page.name || '' }));
  const page = pages.find(item => item.id === (pageId || parts.session?.currentPageId)) || pages[0];
  const empty = { ok: true, pages, pageId: page?.id || null, shapes: [], assets: {}, unsupported: {}, schema: parts.schema };
  if (!page) return empty;
  const byParent = new Map();
  for (const record of records) if (record.typeName === 'shape') byParent.set(record.parentId, [...(byParent.get(record.parentId) || []), record]);
  for (const list of byParent.values()) list.sort(byIndex);
  const shapes = [], unsupported = {};
  const walk = (parentId, parentMatrix, depth) => {
    if (depth > 32) return;
    for (const record of byParent.get(parentId) || []) {
      const matrix = times(parentMatrix, placed(num(record.x), num(record.y), num(record.rotation)));
      const detail = describe(record, parts.store);
      if (detail.kind === 'unknown') unsupported[detail.type] = (unsupported[detail.type] || 0) + 1;
      shapes.push({ id: record.id, type: record.type, parentId: record.parentId, matrix, opacity: num(record.opacity, 1), locked: !!record.isLocked, meta: record.meta || {}, ...detail });
      walk(record.id, matrix, depth + 1);
    }
  };
  walk(page.id, IDENTITY, 0);
  // An arrow bound to a shape ends on that shape (binding records), not where its own props were last left.
  const byId = Object.fromEntries(shapes.map(shape => [shape.id, shape]));
  for (const binding of records.filter(record => record.typeName === 'binding' && record.type === 'arrow')) {
    const arrow = byId[binding.fromId], to = byId[binding.toId], terminal = binding.props?.terminal;
    if (arrow?.kind !== 'arrow' || !to?.w || !to?.h || !['start', 'end'].includes(terminal)) continue;
    const anchor = binding.props.normalizedAnchor || { x: 0.5, y: 0.5 };
    arrow[terminal] = apply(invert(arrow.matrix), apply(to.matrix, { x: to.w * anchor.x, y: to.h * anchor.y }));
  }
  const assets = Object.fromEntries(records.filter(record => record.typeName === 'asset').map(asset => [asset.id, { type: asset.type, name: asset.props?.name || '', src: asset.props?.src || '', w: num(asset.props?.w), h: num(asset.props?.h) }]));
  return { ...empty, shapes, assets, unsupported };
}

// ---- SVG ----
const esc = value => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const round = n => +n.toFixed(1);
const path = points => points.map((point, i) => `${i ? 'L' : 'M'}${round(point.x)} ${round(point.y)}`).join('');
const dashOf = (dash, width) => (dash === 'dashed' ? `${width * 2.5} ${width * 2}` : dash === 'dotted' ? `0.1 ${width * 2}` : '');
// tldraw: semi is the page colour, solid the colour's light tint, fill the colour itself (GeoShapeUtil DEFAULT_FILL_COLOR_NAMES).
const fillOf = (fill, color) => (fill === 'semi' ? PAGE_SOLID : fill === 'solid' || fill === 'pattern' ? tone(color, 2) : fill === 'fill' ? tone(color, 0) : fill === 'lined-fill' ? tone(color, 3) : 'none');
const polygon = (geo, w, h) => ({
  triangle: [[w / 2, 0], [w, h], [0, h]], diamond: [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]], rhombus: [[w * 0.25, 0], [w, 0], [w * 0.75, h], [0, h]],
  trapezoid: [[w * 0.2, 0], [w * 0.8, 0], [w, h], [0, h]], hexagon: [[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]],
  pentagon: [[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]],
  octagon: [[w * 0.3, 0], [w * 0.7, 0], [w, h * 0.3], [w, h * 0.7], [w * 0.7, h], [w * 0.3, h], [0, h * 0.7], [0, h * 0.3]],
  star: Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.4 : 1, a = -Math.PI / 2 + (i * Math.PI) / 5; return [w / 2 + (Math.cos(a) * r * w) / 2, h / 2 + (Math.sin(a) * r * h) / 2]; }),
})[geo];
// Lines of text centred on (x, y).
const label = (text, x, y, px, { anchor = 'middle', color = '#1d1d1d', font = 'draw' } = {}) => String(text).split('\n').map((line, i, all) => `<text x="${x}" y="${round(y + (i - (all.length - 1) / 2) * px * 1.35)}" text-anchor="${anchor}" dominant-baseline="central" font-size="${px}" font-family='${FONTS[font] || FONTS.draw}' fill="${color}">${esc(line)}</text>`).join('');
const headOf = (kind, at, from, color, width) => {
  if (!kind || kind === 'none') return '';
  const angle = Math.atan2(at.y - from.y, at.x - from.x), size = 8 + width * 2, back = a => `${round(at.x - Math.cos(angle + a) * size)} ${round(at.y - Math.sin(angle + a) * size)}`;
  if (kind === 'dot') return `<circle cx="${at.x}" cy="${at.y}" r="${size / 3}" fill="${color}"/>`;
  const filled = ['triangle', 'diamond', 'inverted', 'square'].includes(kind);
  return `<path d="M${back(0.45)}L${round(at.x)} ${round(at.y)}L${back(-0.45)}${filled ? 'Z' : ''}" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
};

function draw(shape) {
  const color = tone(shape.color, 0), width = STROKE[shape.size] || 3.5, dash = dashOf(shape.dash, width);
  const stroke = `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}`;
  switch (shape.kind) {
    case 'stroke':
      if (shape.points.length < 2) return shape.points.length ? `<circle cx="${round(shape.points[0].x)}" cy="${round(shape.points[0].y)}" r="${width / 2}" fill="${color}"/>` : '';
      return shape.highlight
        ? `<path d="${path(shape.points)}" fill="none" stroke="${color}" stroke-width="${width * 4}" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/>`
        : `<path d="${path(shape.points)}${shape.closed ? 'Z' : ''}" fill="${shape.closed ? fillOf(shape.fill, shape.color) : 'none'}" ${stroke}/>`;
    case 'geo': {
      const w = Math.max(shape.w, 1), h = Math.max(shape.h, 1), fill = fillOf(shape.fill, shape.color), corners = polygon(shape.geo, w, h);
      const body = corners ? `<path d="${path(corners.map(([x, y]) => ({ x, y })))}Z" fill="${fill}" ${stroke}/>`
        : ['ellipse', 'cloud', 'heart'].includes(shape.geo) ? `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" ${stroke}/>`
          : `<rect width="${w}" height="${h}" rx="${shape.geo === 'oval' ? h / 2 : 0}" fill="${fill}" ${stroke}/>`;
      return body + (shape.text ? label(shape.text, w / 2, h / 2, LABEL_PX[shape.size] || 22, { color: tone(shape.labelColor || shape.color, 0), font: shape.font }) : '');
    }
    case 'text': { const px = (TEXT_PX[shape.size] || 24) * shape.scale; return label(shape.text, 0, (shape.text.split('\n').length * px * 1.35) / 2, px, { anchor: 'start', color, font: shape.font }); }
    case 'note': return `<rect width="${shape.w}" height="${shape.h}" fill="${tone(shape.color, 1)}" stroke="#00000022"/>${shape.text ? label(shape.text, shape.w / 2, shape.h / 2, (LABEL_PX[shape.size] || 22) * shape.scale, { color: '#000000', font: shape.font }) : ''}`;
    case 'frame': return `<rect width="${shape.w}" height="${shape.h}" fill="#ffffff" stroke="#717171"/>${shape.name ? `<text y="-8" font-size="12" font-family='${FONTS.sans}' fill="#717171">${esc(shape.name)}</text>` : ''}`;
    case 'arrow': {
      const a = shape.start, b = shape.end, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, length = Math.hypot(b.x - a.x, b.y - a.y) || 1, u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
      // tldraw puts the arc's middle at the chord's midpoint pushed -bend along the chord's perpendicular (curved-arrow.ts).
      const control = { x: mid.x - u.y * shape.bend * 2, y: mid.y + u.x * shape.bend * 2 }, bent = Math.abs(shape.bend) > 1, at = bent ? { x: (mid.x + control.x) / 2, y: (mid.y + control.y) / 2 } : mid;
      return `<path d="M${a.x} ${a.y}${bent ? `Q${control.x} ${control.y} ${b.x} ${b.y}` : `L${b.x} ${b.y}`}" fill="none" ${stroke}/>`
        + headOf(shape.headEnd, b, bent ? control : a, color, width) + headOf(shape.headStart, a, bent ? control : b, color, width)
        + (shape.text ? label(shape.text, at.x, at.y, (LABEL_PX[shape.size] || 22) * shape.scale, { color: tone(shape.labelColor || shape.color, 0), font: shape.font }) : '');
    }
    case 'line': return shape.points.length > 1 ? `<path d="${path(shape.points)}" fill="none" ${stroke}/>` : '';
    case 'image': case 'video': case 'embed': case 'bookmark': {
      const src = shape.kind === 'image' && /^(data:image\/|https:)/.test(shape.src) ? shape.src : '';
      return src ? `<image href="${esc(src)}" width="${shape.w}" height="${shape.h}" preserveAspectRatio="none"/>` : `<rect width="${shape.w}" height="${shape.h}" fill="#f4f5f7" stroke="#a3a3a3"/>${label(shape.alt || shape.kind, shape.w / 2, shape.h / 2, 14, { color: '#525252', font: 'sans' })}`;
    }
    case 'card': return `<rect width="${shape.w}" height="${shape.h}" rx="8" fill="#f4f5f7" stroke="#a3a3a3"/>${label(shape.label, shape.w / 2, shape.h / 2, 16, { color: '#171717', font: 'sans' })}`;
    default: return '';
  }
}

// Local extent of a shape, for the picture's bounds: its points, its box, or an estimate for text.
function extent(shape) {
  const around = list => (list.length ? { x: Math.min(...list.map(p => p.x)), y: Math.min(...list.map(p => p.y)), x2: Math.max(...list.map(p => p.x)), y2: Math.max(...list.map(p => p.y)) } : null);
  if (shape.points) return around(shape.points);
  if (shape.kind === 'arrow') return around([shape.start, shape.end]);
  if (shape.kind === 'text') {
    const px = (TEXT_PX[shape.size] || 24) * shape.scale, rows = shape.text.split('\n');
    return { x: 0, y: 0, x2: shape.autoSize ? Math.max(...rows.map(row => row.length)) * px * 0.55 : shape.w, y2: rows.length * px * 1.35 };
  }
  return shape.w ? { x: 0, y: 0, x2: shape.w, y2: shape.h } : null;
}

// Page-space rectangle { x, y, x2, y2 } of a shape read above (its extent through its matrix), or null when it has none.
export function shapeBounds(shape) {
  const local = extent(shape);
  if (!local) return null;
  const corners = [[local.x, local.y], [local.x2, local.y], [local.x2, local.y2], [local.x, local.y2]].map(([x, y]) => apply(shape.matrix, { x, y }));
  return { x: Math.min(...corners.map(p => p.x)), y: Math.min(...corners.map(p => p.y)), x2: Math.max(...corners.map(p => p.x)), y2: Math.max(...corners.map(p => p.y)) };
}

// A static SVG of one page: { svg, x, y (the picture's top left in page space), width, height, shapes (drawn), unsupported }. `only(shape)` limits it to some shapes. What a read-only view or a thumbnail can
// show while the stored snapshot stays untouched. An empty page gives an empty 1x1 svg.
export function legacySnapshotToSvg(value, { pageId, padding = 20, maxSize = 4000, only = null } = {}) {
  const read = readLegacySnapshot(value, { pageId });
  if (!read.ok) return { ...read, svg: '', width: 0, height: 0, shapes: 0, unsupported: {} };
  const corners = [], body = [];
  for (const shape of read.shapes) {
    if (only && !only(shape)) continue;
    const inner = shape.kind === 'group' ? '' : draw(shape), local = extent(shape);
    if (!inner) continue;
    if (local) for (const [x, y] of [[local.x, local.y], [local.x2, local.y], [local.x2, local.y2], [local.x, local.y2]]) corners.push(apply(shape.matrix, { x, y }));
    body.push(`<g transform="matrix(${shape.matrix.map(n => +n.toFixed(4)).join(' ')})"${shape.opacity < 1 ? ` opacity="${shape.opacity}"` : ''}>${inner}</g>`);
  }
  if (!body.length || !corners.length) return { ok: true, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', width: 1, height: 1, shapes: 0, unsupported: read.unsupported };
  const left = Math.min(...corners.map(p => p.x)) - padding, top = Math.min(...corners.map(p => p.y)) - padding;
  const width = Math.min(maxSize, Math.ceil(Math.max(...corners.map(p => p.x)) + padding - left)), height = Math.min(maxSize, Math.ceil(Math.max(...corners.map(p => p.y)) + padding - top));
  return { ok: true, x: round(left), y: round(top), width, height, shapes: body.length, unsupported: read.unsupported,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(left)} ${round(top)} ${width} ${height}" width="${width}" height="${height}">${body.join('')}</svg>` };
}
