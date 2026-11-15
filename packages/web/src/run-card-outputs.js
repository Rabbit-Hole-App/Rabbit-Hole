// packages/web/src/run-card-outputs.js
// What a run shows under its log (Run card v1.1 Part 2, outputs A): text with carriage-return progress collapsed, a metric chart, a JSON tree, an image, and rows for the rest.
// The shapes are run-status.json (stdoutKind, metrics, producedFiles). Pure: no React, no network, no DOM.

export const CHART_POINTS = 200; // a series is thinned to this many points before it is drawn
export const PART_B_KINDS = ['table', 'html', 'markdown', 'notebook', 'audio', 'video']; // rendered as a row labelled 'preview coming' (outputs B)

// tqdm and \r progress: each line keeps only its last non-empty carriage-return state.
export const collapseCR = text => String(text ?? '').split('\n').map(line => {
  const parts = line.split('\r');
  return parts.findLast(part => part !== '') ?? '';
}).join('\n');

export const shortHash = sha => String(sha || '').slice(0, 8);

// ---- metric series --------------------------------------------------------------------------------------------------------------

// Thin a series to at most `max` points, keeping the first and the last.
export function downsample(points, max = CHART_POINTS) {
  if (!Array.isArray(points) || points.length <= max) return points || [];
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * (points.length - 1) / (max - 1))]);
  return out;
}

// The rehearsal's curve for a series, as a straight reference line from its first to its last value (cells.json expected.metrics: only first and last are recorded).
// null when the cell recorded neither value or the series is empty.
export function referenceCurve(expected, series) {
  const metrics = expected?.metrics || [];
  const m = metrics.find(x => x.name === series?.name) || (metrics.length === 1 ? metrics[0] : null);
  if (!m || !Number.isFinite(m.first) || !Number.isFinite(m.last) || !series?.points?.length) return null;
  return { name: m.name, points: [[series.points[0][0], m.first], [series.points.at(-1)[0], m.last]] };
}

const nice = n => (Math.abs(n) >= 100 ? String(Math.round(n)) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2));
// The drawing of one series: SVG paths in a w x h box with `pad` on every side, plus the labelled first and last points. line / ref are `M x y L x y ...` strings.
export function chartShape(series, reference, { w = 320, h = 120, pad = 12, labelRoom = 36 } = {}) {
  const pts = downsample(series?.points || []), ref = reference?.points || [];
  const all = [...pts, ...ref].filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!all.length) return null;
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = x => pad + (x1 === x0 ? 0 : (x - x0) / (x1 - x0)) * (w - 2 * pad - labelRoom);
  const sy = y => (y1 === y0 ? h / 2 : h - pad - (y - y0) / (y1 - y0) * (h - 2 * pad));
  const path = list => list.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join(' ');
  const end = pts.at(-1), start = pts[0];
  return {
    line: pts.length ? path(pts) : '', ref: ref.length ? path(ref) : '', w, h,
    first: start ? { x: sx(start[0]), y: sy(start[1]), label: nice(start[1]) } : null,
    last: end && pts.length > 1 ? { x: sx(end[0]), y: sy(end[1]), label: nice(end[1]) } : null,
    xRange: [x0, x1], yRange: [y0, y1],
  };
}

// ---- classification -------------------------------------------------------------------------------------------------------------

// A previewed image: a produced file of kind image that was fetched. Binaries and files beyond the cap are never fetched, so they are rows.
export const imageFiles = status => (status?.producedFiles || []).filter(f => f.kind === 'image' && f.fetched);
export const rowFiles = status => (status?.producedFiles || []).filter(f => !(f.kind === 'image' && f.fetched));
export const fileNote = file => (file.kind === 'binary' ? 'produced by this run' : PART_B_KINDS.includes(file.kind) ? 'preview coming' : file.kind === 'image' ? 'too large to preview' : 'produced by this run');

// stdout that parses as JSON (stdoutKind json) as a value to draw, else undefined (the text stays). A tail cut mid-document does not parse and stays text.
export function jsonValue(status) {
  if (status?.stdoutKind !== 'json') return undefined;
  try { return JSON.parse(String(status.stdoutTail || '')); } catch { return undefined; }
}

// The output blocks of a run, in the order they are drawn: kinds for the History row's icons are the same list.
export function kindsOf(status) {
  const kinds = ['text'];
  if ((status?.metrics || []).some(m => (m.points || []).length)) kinds.push('chart');
  if (jsonValue(status) !== undefined) kinds.push('json');
  for (const kind of ['image', 'table', 'html', 'markdown', 'notebook', 'audio', 'video', 'binary']) if ((status?.producedFiles || []).some(f => f.kind === kind)) kinds.push(kind);
  return kinds;
}

// The produced files a History row keeps (run-card-state.json history.files: path, bytes, sha256, kind; never bytes), at most 50.
export const storedFiles = status => (status?.producedFiles || []).slice(0, 50).map(f => ({ path: f.path, bytes: f.bytes, ...(f.sha256 ? { sha256: f.sha256 } : {}), kind: f.kind }));

// GET /api/learn/run?action=file&app=&board=&sessionId=&runId=&path= (RUN_CARD.md): the query for one produced file.
export const fileQuery = ({ app, board, routeId, sessionId, runId, path }) => new URLSearchParams({ action: 'file', app, board, ...(routeId ? { routeId } : {}), sessionId, runId, path }).toString();

// ---- the SVG sanitizer ----------------------------------------------------------------------------------------------------------
// An SVG a run produced is shown through <img> of a Blob (a browser runs no script and loads no outside file for an image), and is also cleaned here first: only drawing elements
// stay, no event attribute, no link that leaves the document, no javascript: or data: value, no url() to another place, no style that imports. null when nothing drawable is left.
const KEEP = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'marker', 'symbol', 'title', 'desc']);
const DROP_WITH_CONTENT = new Set(['script', 'foreignobject', 'style', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas', 'animate', 'set', 'animatetransform', 'animatemotion', 'handler', 'listener']);
const TAG = /<(\/?)([A-Za-z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const ATTR = /([^\s=/"'<>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
const decode = text => text.replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff))).replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff))).replace(/&(colon|tab|newline);?/gi, m => (/colon/i.test(m) ? ':' : ' '));
// A value is unsafe when, once entities, control characters and spaces are removed, it names a script or data scheme, a url() to anywhere but this document, or an import.
const unsafeValue = raw => { const v = decode(raw).replace(/[\u0000- \u007f-\u009f]+/g, '').toLowerCase(); return /javascript:|vbscript:|data:|@import|expression\(/.test(v) || /url\((?!['"]?#)/.test(v) || /^(https?:)?\/\//.test(v); };
const cleanAttrs = rest => {
  const out = [];
  for (const m of rest.matchAll(ATTR)) {
    const name = m[1], lower = name.toLowerCase(), raw = m[2] ?? '', value = raw.replace(/^["']|["']$/g, '');
    if (lower.startsWith('xmlns')) { if (/^http:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink)$/.test(value)) out.push(`${name}="${value}"`); continue; }
    if (lower.startsWith('on')) continue;
    if ((lower === 'href' || lower === 'xlink:href' || lower === 'src') && !/^\s*#/.test(decode(value))) continue;
    if (unsafeValue(value)) continue;
    out.push(m[2] === undefined ? name : `${name}="${value.replace(/"/g, '&quot;')}"`);
  }
  return out.join(' ');
};
export function sanitizeSvg(text) {
  const source = String(text ?? '').replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[\s\S]*?(\[[\s\S]*?\])?\s*>|<\?[\s\S]*?\?>/gi, '');
  let out = '', last = 0, skip = null, depth = 0, svgOpen = false;
  for (const m of source.matchAll(TAG)) {
    const between = source.slice(last, m.index);
    last = m.index + m[0].length;
    const closing = m[1] === '/', name = m[2].toLowerCase(), selfClosing = /\/\s*$/.test(m[3]);
    if (skip) { // inside a dropped element: its text and children go with it
      if (name === skip && !closing && !selfClosing) depth++;
      else if (name === skip && closing && --depth === 0) skip = null;
      continue;
    }
    out += between.replace(/[<>]/g, '');
    if (DROP_WITH_CONTENT.has(name)) { if (!closing && !selfClosing) { skip = name; depth = 1; } continue; }
    if (!KEEP.has(name)) continue;
    if (name === 'svg' && !closing) svgOpen = true;
    const attrs = closing ? '' : cleanAttrs(m[3].replace(/\/\s*$/, ''));
    out += closing ? `</${m[2]}>` : `<${m[2]}${attrs ? ` ${attrs}` : ''}${selfClosing ? '/' : ''}>`;
  }
  if (!svgOpen || skip) return null;
  if (!/xmlns=/.test(out.slice(0, 400))) out = out.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return out;
}
