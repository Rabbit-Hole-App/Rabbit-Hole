// An uploaded SVG made safe to show (owner spec section 7, Images and SVG). The card never puts uploaded markup in the
// app's DOM: it shows this function's output as an <img> from a blob URL, where browsers run no script and fetch no
// external resource. This rebuild is the second wall, so a viewer-side quirk alone cannot run anything: it parses the
// XML itself (no DOM, so the tests run in Node), keeps an allowlist of drawing elements, drops every event handler,
// script, foreignObject, link and non-fragment reference, and re-serializes what is left. Anything it cannot parse as
// well-formed XML is refused with a reason rather than guessed at.

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'switch', 'title', 'desc',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker', 'image', 'style',
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
  'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting',
  'feSpotLight', 'feTile', 'feTurbulence',
  'animate', 'animateTransform', 'animateMotion', 'mpath',
]);
// Unwrapped (children kept, element dropped): a link would navigate.
const UNWRAP = new Set(['a']);
const SVG_NS = 'http://www.w3.org/2000/svg', XLINK_NS = 'http://www.w3.org/1999/xlink';
const RASTER = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]*$/i;

export class SvgRefused extends Error {}
const refuse = reason => { throw new SvgRefused(reason); };

// ---- parse ------------------------------------------------------------------------------------------------------------

const NAME = /[A-Za-z_][\w.:-]*/y;
const nameAt = (text, at) => { NAME.lastIndex = at; return NAME.exec(text); };
const PREDEFINED = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(text, entities) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[A-Za-z_][\w.-]*);?/gi, (whole, ref) => {
    if (!whole.endsWith(';')) refuse('The SVG has a bare "&" (not well-formed XML).');
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!(code > 0 && code <= 0x10ffff)) refuse('The SVG has an invalid character reference.');
      return String.fromCodePoint(code);
    }
    if (ref in PREDEFINED) return PREDEFINED[ref];
    if (entities.has(ref)) return entities.get(ref);
    return refuse(`The SVG uses an entity (&${ref};) this viewer does not expand.`);
  });
}

// A DOCTYPE's internal subset may declare plain text entities (Illustrator writes &ns_svg; and friends). Only literal
// values are kept, one level deep and bounded, so no expansion can grow (no "billion laughs"); parameter and external
// entities are never followed.
function doctype(text, at, entities) {
  let i = at + 9, depth = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === '>' && depth <= 0) break;
    else if (c === '"' || c === "'") { const close = text.indexOf(c, i + 1); if (close === -1) refuse('The SVG DOCTYPE is not closed.'); i = close; }
  }
  if (i >= text.length) refuse('The SVG DOCTYPE is not closed.');
  const body = text.slice(at, i);
  for (const m of body.matchAll(/<!ENTITY\s+(%\s*)?([A-Za-z_][\w.-]*)\s+(SYSTEM|PUBLIC)?\s*("([^"]*)"|'([^']*)')/g)) {
    if (m[1] || m[3]) continue; // parameter or external entity: never expanded (a reference to it is refused later)
    const value = m[5] ?? m[6];
    if (value.length > 1024 || /[&<%]/.test(value) || entities.size >= 32) continue;
    entities.set(m[2], value);
  }
  return i + 1;
}

function parse(text, limits) {
  const entities = new Map();
  const root = { name: '#root', attrs: [], children: [] };
  const stack = [root];
  let count = 0, i = 0;
  const top = () => stack[stack.length - 1];
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) { top().children.push({ text: decode(text.slice(i), entities) }); break; }
    if (lt > i) top().children.push({ text: decode(text.slice(i, lt), entities) });
    if (text.startsWith('<!--', lt)) { const end = text.indexOf('-->', lt + 4); if (end === -1) refuse('The SVG has an unclosed comment.'); i = end + 3; continue; }
    if (text.startsWith('<![CDATA[', lt)) { const end = text.indexOf(']]>', lt + 9); if (end === -1) refuse('The SVG has an unclosed CDATA section.'); top().children.push({ text: text.slice(lt + 9, end) }); i = end + 3; continue; }
    if (text.startsWith('<?', lt)) { const end = text.indexOf('?>', lt + 2); if (end === -1) refuse('The SVG has an unclosed processing instruction.'); i = end + 2; continue; }
    if (/^<!DOCTYPE/i.test(text.slice(lt, lt + 9))) { if (stack.length > 1) refuse('The SVG has a DOCTYPE inside an element.'); i = doctype(text, lt, entities); continue; }
    if (text[lt + 1] === '/') {
      const m = nameAt(text, lt + 2);
      const close = text.indexOf('>', lt);
      if (!m || close === -1) refuse('The SVG has a broken end tag.');
      const open = stack.pop();
      if (open === root || open.name !== m[0]) refuse(`The SVG is not well-formed XML (</${m[0]}> closes <${open.name}>).`);
      i = close + 1;
      continue;
    }
    const m = nameAt(text, lt + 1);
    if (!m) refuse('The SVG has a "<" that starts no tag (not well-formed XML).');
    const element = { name: m[0], attrs: [], children: [] };
    let j = lt + 1 + m[0].length;
    for (;;) {
      while (/\s/.test(text[j] || '')) j++;
      if (text[j] === '>' || text.startsWith('/>', j)) break;
      const a = nameAt(text, j);
      if (!a) refuse(`The SVG has a broken attribute on <${element.name}>.`);
      j += a[0].length;
      while (/\s/.test(text[j] || '')) j++;
      if (text[j] !== '=') refuse(`The SVG attribute ${a[0]} has no value.`);
      j++;
      while (/\s/.test(text[j] || '')) j++;
      const quote = text[j];
      if (quote !== '"' && quote !== "'") refuse(`The SVG attribute ${a[0]} is not quoted.`);
      const end = text.indexOf(quote, j + 1);
      if (end === -1) refuse(`The SVG attribute ${a[0]} is not closed.`);
      const raw = text.slice(j + 1, end);
      if (raw.includes('<')) refuse(`The SVG attribute ${a[0]} contains "<".`);
      element.attrs.push([a[0], decode(raw, entities)]);
      j = end + 1;
    }
    if (++count > limits.elements) refuse(`The SVG has more than ${limits.elements.toLocaleString('en-US')} elements.`);
    top().children.push(element);
    if (text[j] === '/') { i = j + 2; continue; }
    if (stack.length > limits.depth) refuse(`The SVG nests deeper than ${limits.depth} levels.`);
    stack.push(element);
    i = j + 1;
  }
  if (stack.length > 1) refuse(`The SVG is not well-formed XML (<${top().name}> is never closed).`);
  const elements = root.children.filter(child => child.name);
  if (elements.length !== 1 || root.children.some(child => child.text != null && child.text.trim())) refuse('The file has no single <svg> root element.');
  if (elements[0].name !== 'svg') refuse(`The file's root element is <${elements[0].name}>, not <svg>.`);
  return elements[0];
}

// ---- clean ------------------------------------------------------------------------------------------------------------

const fragment = value => /^\s*#[\w.:-]*\s*$/.test(value);
// url(...) is allowed only for a same-document fragment; anything else (http, data, file, a relative path) is a fetch.
const cleanUrls = value => value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole, q, target) => (fragment(target) ? whole : 'none'));
function cleanCss(css, removed) {
  let out = css.replace(/@import[^;]*;?/gi, () => { removed.add('CSS @import'); return ''; });
  out = out.replace(/@font-face\s*\{[^}]*\}/gi, () => { removed.add('CSS @font-face'); return ''; });
  out = out.replace(/expression\s*\(|-moz-binding|behavior\s*:/gi, () => { removed.add('CSS active content'); return ''; });
  const urls = cleanUrls(out);
  if (urls !== out) removed.add('external url() reference');
  return urls;
}

function cleanAttrs(element, removed, used) {
  const out = [];
  for (const [name, value] of element.attrs) {
    const lower = name.toLowerCase();
    if (lower.startsWith('on')) { removed.add('event handler'); continue; }
    if (lower === 'xmlns' || lower.startsWith('xmlns:')) { if (lower === 'xmlns:xlink') used.xlink = true; continue; } // re-added on the root
    if (name.includes(':') && !['xlink:href', 'xml:space', 'xml:lang'].includes(name)) { removed.add('editor attribute'); continue; }
    if (lower === 'href' || lower === 'xlink:href') {
      if (fragment(value)) { out.push([name, value.trim()]); if (name === 'xlink:href') used.xlink = true; continue; }
      if (element.name === 'image' && RASTER.test(value)) { out.push([name, value.replace(/\s+/g, '')]); if (name === 'xlink:href') used.xlink = true; continue; }
      removed.add('external link or resource'); continue;
    }
    if (lower === 'attributename' && /href|^on/i.test(value)) return null; // an animation that rewrites a link or handler
    if (lower === 'style') { const css = cleanCss(value, removed); if (css.trim()) out.push([name, css]); continue; }
    const cleaned = cleanUrls(value);
    if (cleaned !== value) removed.add('external url() reference');
    out.push([name, cleaned]);
  }
  return out;
}

function clean(element, removed, used) {
  const name = element.name;
  if (name.includes(':')) { removed.add('editor metadata'); return []; }
  if (UNWRAP.has(name)) { removed.add('link'); return element.children.flatMap(child => (child.name ? clean(child, removed, used) : [child])); }
  if (!ELEMENTS.has(name)) { removed.add(name === 'script' ? 'script' : name === 'foreignObject' ? 'foreignObject' : `<${name}>`); return []; }
  const attrs = cleanAttrs(element, removed, used);
  if (!attrs) { removed.add('link-rewriting animation'); return []; }
  if (name === 'image' && !attrs.some(([key]) => /href$/i.test(key))) { return []; }
  if (name === 'use' && !attrs.some(([key]) => /href$/i.test(key))) { return []; }
  const children = name === 'style'
    ? [{ text: cleanCss(element.children.map(child => child.text ?? '').join(''), removed) }]
    : element.children.flatMap(child => (child.name ? clean(child, removed, used) : [child]));
  return [{ name, attrs, children }];
}

const escapeText = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = text => escapeText(text).replace(/"/g, '&quot;');
function serialize(node) {
  if (node.text != null) return escapeText(node.text);
  const attrs = node.attrs.map(([key, value]) => ` ${key}="${escapeAttr(value)}"`).join('');
  return node.children.length ? `<${node.name}${attrs}>${node.children.map(serialize).join('')}</${node.name}>` : `<${node.name}${attrs}/>`;
}

// CSS lengths to px for the aspect ratio; a percentage or unknown unit says nothing about the drawing's own shape.
const UNITS = { '': 1, px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };
const length = value => { const m = /^\s*([\d.]+(?:e[-+]?\d+)?)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(value || ''); return m && m[2] !== '%' ? Number(m[1]) * UNITS[(m[2] || '').toLowerCase()] : null; };

export const SVG_LIMITS = { bytes: 2 * 1024 * 1024, elements: 20000, depth: 128 };

// text in, { svg, width, height, removed } out; throws SvgRefused with a one-line reason. width/height are the drawing's
// aspect in CSS px (viewBox first, then width/height, else the 300 x 150 default every browser uses).
export function sanitizeSvg(input, limits = SVG_LIMITS) {
  const text = String(input).replace(/^﻿/, '');
  if (text.length > limits.bytes) refuse(`The SVG is over ${Math.round(limits.bytes / 1024 / 1024)} MiB.`);
  const removed = new Set(), used = { xlink: false };
  const root = parse(text, limits);
  const [svg] = clean(root, removed, used);
  const attr = key => svg.attrs.find(([name]) => name === key)?.[1];
  const box = (attr('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  let width = length(attr('width')), height = length(attr('height'));
  if (box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0) {
    if (!(width && height)) { width = width || (height ? (height * box[2]) / box[3] : box[2]); height = height || (width * box[3]) / box[2]; }
  }
  if (!(width > 0 && height > 0)) { width = 300; height = 150; }
  svg.attrs = svg.attrs.filter(([name]) => name !== 'width' && name !== 'height');
  // Explicit px size on the root, so the <img> has the drawing's own aspect ratio wherever it is shown.
  svg.attrs.unshift(['xmlns', SVG_NS], ...(used.xlink ? [['xmlns:xlink', XLINK_NS]] : []), ['width', String(+width.toFixed(3))], ['height', String(+height.toFixed(3))]);
  return { svg: serialize(svg), width, height, removed: [...removed] };
}

// The first bytes look like SVG text: an optional BOM, XML declaration, comments or DOCTYPE, then <svg. Gzip (.svgz)
// is not text and is refused by the caller with its own reason.
export function looksLikeSvg(head) {
  const text = String(head).replace(/^﻿/, '').replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, '').trimStart();
  return /^<svg[\s>/]/.test(text);
}
