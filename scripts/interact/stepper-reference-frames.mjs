// Independent documentation-to-Frame lowering for the first stepper proof.
// Reads the approved HTML, never the production parts or their geometry. SDK-8
// cannot express arbitrary font/radius/stroke fields: this is a declared legal
// role projection, not a claim of browser pixel equality.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { packValue } from '../../packages/web/src/interact-stepper-data.js';

const reference = new URL('../../docs/features/interact/references/overview-stepper-merge-sort.html', import.meta.url);
const attributes = text => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
const points = text => text.trim().split(/\s+/).map(point => point.split(',').map(Number));
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const unescapeText = text => text.replace(/&(?:amp|lt|gt|quot);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"' })[entity]);
const roleFor = (id, active) => active.includes(id.split('.').at(-1)) ? 'input' : 'neutral';

function mount(html) {
  const nodes = new Map();
  for (const match of html.slice(0, html.indexOf('<script')).matchAll(/<([a-z][a-z0-9-]*)\b([^<>]*\bid="[^"]+"[^<>]*)>/gi)) {
    const attrs = attributes(match[2]);
    nodes.set(attrs.id, { attributes: attrs, value: attrs.value ?? '', innerHTML: '', textContent: '', listeners: {},
      setAttribute(key, value) { this.attributes[key] = String(value); },
      addEventListener(key, handler) { this.listeners[key] = handler; } });
  }
  const script = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
  const context = { document: { getElementById: id => nodes.get(id) } };
  runInNewContext(`${script('scene-model')}\n${script('scene-view')}`, context);
  return { scene: JSON.parse(JSON.stringify(runInNewContext('Scene', context))),
    select(index) { nodes.get('step').listeners.input({ target: { value: index } }); return nodes.get('objects').innerHTML; },
    height: Number(nodes.get('drawing').attributes.height) };
}

function svgLinks(svg, active) {
  return [...svg.matchAll(/<g\b([^>]*\bid="link\.[^"]+"[^>]*)>([\s\S]*?)<\/g>/g)].map(match => {
    const id = attributes(match[1]).id, line = attributes(/<polyline\b([^>]*)>/.exec(match[2])[1]);
    return { id, points: points(line.points), role: roleFor(id, active), opacity: 1 };
  });
}

// The reference's two outgoing links per layer meet at a first or last shaft
// point. Joining them retraces existing paint only. A mixed-emphasis fork stays
// separate; identical convergent arrowheads are drawn once.
function lowerLinks(links) {
  const arrows = [], shafts = [], byArrow = new Map();
  for (const link of links) {
    const path = link.points, from = path.at(-2), to = path.at(-1);
    const key = JSON.stringify([link.role, link.opacity, from, to]);
    const duplicate = byArrow.has(key);
    if (!duplicate) {
      const arrow = { kind: 'arrow', id: link.id, from: { x: from[0], y: from[1] }, to: { x: to[0], y: to[1] }, role: link.role, opacity: link.opacity };
      byArrow.set(key, arrow); arrows.push(arrow);
    }
    shafts.push({ kind: 'polyline', id: duplicate ? link.id : `${link.id}.shaft`, points: path.slice(0, -1), role: link.role, opacity: link.opacity, duplicate });
  }
  const out = [], used = new Set();
  for (let i = 0; i < shafts.length; i++) {
    if (used.has(i)) continue;
    const a = shafts[i]; let packed = null;
    for (let j = i + 1; j < shafts.length; j++) {
      const b = shafts[j];
      if (used.has(j) || a.role !== b.role || a.opacity !== b.opacity) continue;
      let joined;
      if (same(a.points[0], b.points[0])) joined = [...a.points].reverse().concat(b.points.slice(1));
      else if (same(a.points.at(-1), b.points.at(-1))) joined = a.points.concat([...b.points].reverse().slice(1));
      else continue;
      packed = { kind: 'polyline', id: b.duplicate ? b.id : a.id, points: joined, role: a.role, opacity: a.opacity };
      used.add(j); break;
    }
    if (packed) out.push(packed);
    else { const { duplicate, ...shaft } = a; out.push(shaft); }
  }
  return [...out, ...arrows];
}

function lower(svg, scene, index, height) {
  const admittedTags = new Set(['g', 'title', 'rect', 'text', 'polyline', 'polygon']);
  for (const tag of svg.matchAll(/<([a-z][a-z0-9-]*)\b/gi)) assert.ok(admittedTags.has(tag[1]), `unhandled reference primitive ${tag[1]}`);
  const state = scene.variants[0].states[index], objects = [];
  const links = lowerLinks(svgLinks(svg, state.active));
  let linked = false;
  for (const match of svg.matchAll(/<(rect|text|polyline|polygon)\b([^>]*)(?:>([^<]*)<\/text>)?/g)) {
    const [, kind, source, rawText] = match, attrs = attributes(source), id = attrs.id;
    if (kind === 'polygon') continue;
    if (id?.startsWith('link.')) { if (!linked) { objects.push(...links); linked = true; } continue; }
    if (!id) continue;
    if (!linked && !id.startsWith('rail.')) { objects.push(...links); linked = true; }
    const region = id.startsWith('part.') ? id.split('.')[1] : id.startsWith('single.divider.') ? 'singles' : null;
    const opacity = region ? state.active.includes(region) ? 1 : 0.4 : 1;
    if (kind === 'rect') {
      const mapped = id.startsWith('part.') ? `${id}.l0` : id === 'callout.active.box' ? 'callout.active.l0' : id;
      const role = id.startsWith('rail.') ? attrs['data-state'] === state.id ? 'input' : 'neutral'
        : region === 'output' ? 'output' : 'input';
      objects.push({ kind: 'box', id: mapped, x: Number(attrs.x), y: Number(attrs.y), w: Number(attrs.width), h: Number(attrs.height), role, opacity });
    } else if (kind === 'text') {
      objects.push({ kind: 'text', id, x: Number(attrs.x), y: Number(attrs.y), text: unescapeText(rawText ?? ''),
        align: attrs['text-anchor'] === 'middle' ? 'middle' : 'start', role: id === 'callout.active.title' ? 'input' : 'neutral', opacity });
    } else {
      const path = points(attrs.points), role = id === 'callout.anchor' ? 'input' : 'neutral';
      objects.push(path.length === 2
        ? { kind: 'line', id, from: { x: path[0][0], y: path[0][1] }, to: { x: path[1][0], y: path[1][1] }, role, opacity }
        : { kind: 'polyline', id, points: path, role, opacity });
    }
  }
  return { width: 640, height, objects, readouts: [] };
}

export function deriveBriefMergeCases() {
  const ui = mount(readFileSync(reference, 'utf8'));
  return ui.scene.variants[0].states.map((state, index) => {
    const svg = ui.select(index);
    return { svg, active: state.active, frame: lower(svg, ui.scene, index, ui.height) };
  });
}
export const deriveBriefMergeFrames = () => deriveBriefMergeCases().map(value => value.frame);

function intervalUnion(paths) {
  const lines = new Map();
  for (const { points: path, role, opacity } of paths) for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    if (same(a, b)) continue;
    assert.ok(a[0] === b[0] || a[1] === b[1], 'axis-aligned reference shaft');
    const axis = a[0] === b[0] ? 1 : 0, key = JSON.stringify([role, opacity, axis, a[1 - axis]]);
    const line = lines.get(key) ?? []; line.push([Math.min(a[axis], b[axis]), Math.max(a[axis], b[axis])]); lines.set(key, line);
  }
  return [...lines].sort(([a], [b]) => a.localeCompare(b)).map(([key, ranges]) => {
    ranges.sort(([a], [b]) => a - b); const merged = [];
    for (const [lo, hi] of ranges) {
      const previous = merged.at(-1);
      if (previous && lo <= previous[1]) previous[1] = Math.max(previous[1], hi);
      else merged.push([lo, hi]);
    }
    return [key, merged];
  });
}

export function compareLinkGeometry(svg, frame, active) {
  const expected = intervalUnion(svgLinks(svg, active));
  const actual = intervalUnion(frame.objects.filter(object => object.id.startsWith('link.')).map(object => ({
    ...object, points: object.kind === 'arrow' ? [[object.from.x, object.from.y], [object.to.x, object.to.y]] : object.points,
  })));
  return JSON.stringify(expected) === JSON.stringify(actual) ? [] : [{ expected, actual }];
}

// The fixture program uses precomputed, independently lowered reference frames;
// its evaluator has no production template/part import. Rebuild bytes explicitly.
export function referenceModuleSource() {
  const packet = packValue(deriveBriefMergeFrames());
  return `// Generated by scripts/interact/stepper-reference-frames.mjs from the approved HTML.\n` +
    `// This is an independent scripted reference, never a production drawing implementation.\n` +
    `import { compositionDecoderSource } from './interact-stepper-data.js';\n` +
    `const PACKET = ${JSON.stringify(packet)};\n` +
    `export function stepperReferenceSource(subject = 'merge-sort', depth = 'brief') {\n` +
    `  if (subject !== 'merge-sort' || depth !== 'brief') throw new RangeError('This proof covers merge-sort Brief only');\n` +
    '  return `const frames=(${compositionDecoderSource})(${JSON.stringify(PACKET)});\n' +
    'export function evaluate({inputs}){const i=inputs.step===undefined?0:inputs.step;if(!Number.isInteger(i)||i<0||i>=frames.length)throw new RangeError("step outside reference");return {frame:frames[i],quantities:{}};}`;\n' +
    `}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(new URL('../../packages/web/src/interact-stepper-programs.js', import.meta.url), referenceModuleSource());
}
