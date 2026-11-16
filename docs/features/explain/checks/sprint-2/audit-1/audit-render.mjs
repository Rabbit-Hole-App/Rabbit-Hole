// AUDIT-1: render every snapshot id at 408 from the tree this file sits in (packages/web/scripts/) and measure the SVG. Output: argv[2] (json: { id: { svg, w, h, m } }).
import { writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { diagramReferences } from '../src/tutor-diagrams/reference-library.js';
import kindGallery from '../src/tutor-diagrams/kind-gallery.json' with { type: 'json' };
import { renderTutorDiagram } from '../src/tutor-diagrams/TutorDiagram.js';
import { textWidth } from '../src/tutor-diagrams/primitives.js';
import { illustrationCases, illustrationSpecs } from './illustration-previews.mjs';

const WIDTH = 408;
const out = process.argv[2];

function cases() {
  const gallery = kindGallery.map(spec => ({ id: `shape-${spec.diagram.kind}`, spec }));
  const illustrated = new Set([...illustrationSpecs()].map(({ id }) => id));
  const specs = new Map();
  for (const { id, spec } of [...diagramReferences, ...gallery]) {
    if (illustrated.has(id) || specs.has(id)) continue;
    specs.set(id, spec);
  }
  const list = [...specs].map(([id, spec]) => ({ id, spec, set: id.startsWith('shape-') ? 'kind-gallery shape' : 'reference' }));
  for (const c of illustrationCases()) if (c.key.endsWith(`/${WIDTH}`)) list.push({ id: c.key.replace(/\/\d+$/, ''), spec: c.spec, set: 'illustration case' });
  return list;
}

const num = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="(-?[\\d.]+(?:e-?\\d+)?)"`)); return m ? Number(m[1]) : null; };
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

function measure(svg, width) {
  const m = { elements: (svg.match(/<[a-zA-Z]/g) ?? []).length };
  // paths: smooth (cubic C) versus straight, closed all-line paths
  let pathsWithC = 0, cmdC = 0, closedLinePaths = 0, paths = 0;
  for (const tag of svg.match(/<path\b[^>]*>/g) ?? []) {
    const d = attr(tag, 'd') ?? ''; paths++;
    const c = (d.match(/C/g) ?? []).length;
    if (c) { pathsWithC++; cmdC += c; }
    if (/[Zz]\s*$/.test(d.trim()) && !/[CQAS]/i.test(d.replace(/[Zz]/g, ''))) closedLinePaths++;
    else if (!/[CQAcqas]/.test(d)) { const nums = d.match(/-?[\d.]+(?:e-?\d+)?/g)?.map(Number) ?? []; if (nums.length >= 8 && nums[0] === nums.at(-2) && nums[1] === nums.at(-1) && /L/.test(d)) closedLinePaths++; }
  }
  m.paths = paths; m.pathsWithC = pathsWithC; m.cmdC = cmdC;
  // polygons: arrowheads are 3-point polygons carrying data-tutor-arrowhead; others are shapes (diamonds when 4 points)
  let polygons = 0, diamonds = 0;
  for (const tag of svg.match(/<polygon\b[^>]*>/g) ?? []) {
    const pts = (attr(tag, 'points') ?? '').trim().split(/\s+/).filter(Boolean);
    if (/data-tutor-arrowhead/.test(tag) || pts.length <= 3) continue;
    const xy = pts.map(p => p.split(',').map(Number)), xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
    if (pts.length === 4 && Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) <= 16) { diamonds++; continue; } // a diamond marker, not a closed shape
    polygons++;
  }
  m.closedPolygons = polygons + closedLinePaths; m.polygonElements = polygons; m.closedLinePaths = closedLinePaths; m.diamonds = diamonds;
  // markers: small circles / small squares
  let markers = 0, circlesBig = 0, squares = 0;
  const circles = [];
  for (const tag of svg.match(/<circle\b[^>]*>/g) ?? []) { const r = num(tag, 'r'); circles.push({ cx: num(tag, 'cx'), cy: num(tag, 'cy'), r }); if (r != null && r <= 8) markers++; else circlesBig++; }
  for (const tag of svg.match(/<rect\b[^>]*>/g) ?? []) { const w = num(tag, 'width'), h = num(tag, 'height'); if (w && h && w === h && w <= 14) squares++; }
  m.circles = circles.length; m.markers = markers; m.bigCircles = circlesBig; m.squares = squares;
  // numbered badges: a circle (r 6..14) immediately followed by a text of 1-2 digits at its centre
  const badgeNumbers = [];
  const badgeRe = /<circle\b([^>]*)>(?:<\/circle>)?<text\b([^>]*)>(?:<tspan\b[^>]*>)?(\d{1,2})(?:<\/tspan>)?<\/text>/g;
  for (const b of svg.matchAll(badgeRe)) {
    const r = num(' ' + b[1], 'r'), cx = num(' ' + b[1], 'cx'), cy = num(' ' + b[1], 'cy'), tx = num(' ' + b[2], 'x'), ty = num(' ' + b[2], 'y');
    if (r != null && r >= 6 && r <= 14 && Math.abs(cx - tx) < 2 && Math.abs(cy - ty) < 2) badgeNumbers.push(Number(b[3]));
  }
  m.badges = badgeNumbers.length;
  // all text strings (svg text/tspan and html foreignObject text)
  const texts = [...svg.matchAll(/>([^<>]+)</g)].map(x => decode(x[1]).trim()).filter(Boolean);
  const listNumbers = new Set(texts.map(t => t.match(/^(\d{1,2})[.)]\s+\S/)?.[1]).filter(Boolean).map(Number));
  m.listLines = listNumbers.size;
  m.badgesWithoutKey = badgeNumbers.filter(n => !listNumbers.has(n)).length;
  // text wider than the box that holds it (estimate with the renderer's own textWidth, 1 px tolerance; weight is not in textWidth)
  const rects = [];
  for (const tag of svg.match(/<rect\b[^>]*>/g) ?? []) {
    const x = num(tag, 'x') ?? 0, y = num(tag, 'y') ?? 0, w = num(tag, 'width'), h = num(tag, 'height');
    if (w == null || h == null || w >= width - 2 || h <= 0) continue;
    if (attr(tag, 'fill') === 'none' && !attr(tag, 'stroke')) continue;
    rects.push({ x, y, w, h });
  }
  const overflows = [];
  const groups = [];
  for (const g of svg.matchAll(/<g data-tutor-node="[^"]*">([\s\S]*?)<\/g>/g)) {
    const r = g[1].match(/<rect\b[^>]*>/); if (!r) continue;
    const rw = num(r[0], 'width'); if (rw == null) continue;
    groups.push({ start: g.index, end: g.index + g[0].length, rect: { x: num(r[0], 'x') ?? 0, y: num(r[0], 'y') ?? 0, w: rw, h: num(r[0], 'height') ?? 0 } });
  }
  const textRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  for (const t of svg.matchAll(textRe)) {
    if (svg.lastIndexOf('<g transform="rotate(', t.index) > svg.lastIndexOf('</g>', t.index)) continue; // a rotated axis title
    if (/rotate\(/.test(attr(' ' + t[1], 'transform') ?? '') ) continue;
    const x = num(' ' + t[1], 'x'), y = num(' ' + t[1], 'y'), size = num(' ' + t[1], 'font-size') ?? 15, anchor = attr(' ' + t[1], 'text-anchor') ?? 'start';
    if (x == null || y == null) continue;
    const lines = [...t[2].matchAll(/<tspan\b[^>]*>([^<]*)<\/tspan>/g)].map(l => decode(l[1])).filter(Boolean);
    const content = lines.length ? lines : [decode(t[2].replace(/<[^>]+>/g, ''))];
    const w = Math.max(...content.map(l => textWidth(l, size)));
    if (!Number.isFinite(w) || w <= 0) continue;
    const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x, right = left + w;
    // 1. outside the figure
    if (left < -1 || right > width + 1) overflows.push({ kind: 'canvas', text: content[0].slice(0, 40), w: Math.round(w), left: Math.round(left), right: Math.round(right) });
    // 2. outside the smallest rect that contains the anchor point
    const hit = groups.find(g => t.index > g.start && t.index < g.end)?.rect; // the node box that holds this text (data-tutor-node group, its first rect)
    if (hit && (left < hit.x - 1 || right > hit.x + hit.w + 1)) overflows.push({ kind: 'box', text: content[0].slice(0, 40), w: Math.round(w), box: Math.round(hit.w), by: Math.round(Math.max(hit.x - left, right - (hit.x + hit.w))) });
  }
  m.overflows = overflows;
  return m;
}

const result = {};
for (const c of cases()) {
  try {
    const { element, width, height } = renderTutorDiagram(c.spec, WIDTH);
    const svg = renderToStaticMarkup(element);
    result[c.id] = { svg, w: width, h: height, set: c.set, m: measure(svg, width) };
  } catch (error) { result[c.id] = { error: String(error.message).slice(0, 120), set: c.set }; }
}
writeFileSync(out, JSON.stringify(result));
console.log(`${out}: ${Object.keys(result).length} ids, ${Object.values(result).filter(r => r.error).length} errors`);
