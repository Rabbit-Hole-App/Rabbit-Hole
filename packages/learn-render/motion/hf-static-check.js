// The HyperFrames composition contract (M7B), checked before any render: one self-contained
// index.html whose animation is CSS only, so it is seekable by the HyperFrames runtime and carries
// no code at all. The Remotion Author's rules hold with the same words (author-check.js
// textContractErrors); only the medium differs.
//
//   <!doctype html><html><head>
//     <meta charset="UTF-8">
//     <meta name="motion-timeline" content='{"B1":[0,120],...}'>   beat frames [from, to), exactly
//     <style>...</style>                                            CSS: layout, @keyframes, animation
//   </head><body>
//     <div id="root" data-composition-id="<id>" data-start="0" data-duration="<s>"
//          data-width="1920" data-height="1080" data-no-timeline>
//       ...one element per storyboard object, data-object="<id>"...
//     </div>
//   </body></html>
//
// The harness adds the CSP, the bundled @font-face rules and nothing else at render time
// (hyperframes-renderer.mjs). No <script>, no external file, no URL, no media, no timed clips: CSS
// @keyframes with a finite iteration count are the only motion, and every text is a DOM text node
// (the probe and the text contract see all of it).
//   checkHyperFramesComposition(source, { compositionId, durationSeconds }) -> errors (safety)
//   checkHyperFramesSource(source, brief, storyboard) -> { errors, mapping } (Author contract)
// ponytail: an animation's end time is checked at run time (document.getAnimations, the renderer's
// prepare step), not parsed from the animation shorthand here.
import { parseHTML } from 'linkedom';
import postcss from 'postcss';
import { STAGE } from './contracts.js';
import { textContractErrors, timelineFrames } from './author-check.js';
import { FONT_FAMILIES, SOURCE_MAX_BYTES } from './static-check.js';

export const HF_ELEMENTS = new Set([
  'html', 'head', 'meta', 'style', 'title', 'body',
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'header', 'footer', 'main', 'article', 'aside', 'figure', 'figcaption',
  'ul', 'ol', 'li', 'pre', 'code', 'b', 'strong', 'i', 'em', 'small', 'sub', 'sup', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'lineargradient', 'radialgradient', 'stop', 'marker', 'clippath',
]);
// Properties that are not a pure function of the seeked time, or that fetch, or that write text.
const BANNED_PROPS = /^(transition(-\w+)?|animation-play-state|animation-timeline|animation-range(-\w+)?|scroll-timeline(-\w+)?|view-timeline(-\w+)?|timeline-scope|font|content-visibility|behavior|-moz-binding)$/;
const ALLOWED_AT = new Set(['keyframes', 'property', 'media', 'supports']);
const URLISH = /(?:https?:|ftp:|wss?:|file:|blob:|data:|javascript:)|(?:^|[\s"'(=])\/\/[A-Za-z0-9]/i;
const SVG_PRESENTATION_URL = /url\(\s*['"]?#[A-Za-z][\w-]*['"]?\s*\)/g;

const squash = s => String(s).replace(/\s+/g, ' ').trim();

function cssErrors(css, where, e) {
  let root;
  try { root = postcss.parse(css); } catch (error) { e.push(`${where}: CSS does not parse: ${error.reason || error.message}`); return; }
  root.walkAtRules(a => { if (!ALLOWED_AT.has(a.name.toLowerCase())) e.push(`${where}: @${a.name} is not allowed (fonts, imports and external sheets are the harness's)`); });
  root.walkDecls(d => {
    const prop = d.prop.toLowerCase(), value = d.value;
    if (BANNED_PROPS.test(prop)) e.push(`${where}: ${prop} is not allowed${prop === 'font' ? ' (use font-family, font-size, font-weight)' : prop.startsWith('transition') ? ' (transitions are not seekable: use @keyframes)' : ''}`);
    if (/url\(/i.test(value.replace(SVG_PRESENTATION_URL, ''))) e.push(`${where}: ${prop} uses url(): only url(#id) to an SVG definition in this file`);
    if (/\b(image-set|element|src|attr)\s*\(/i.test(value)) e.push(`${where}: ${prop} uses a function that loads or reads content`);
    if (prop === 'content' && !/^(none|normal|""|''|\s*)$/i.test(value.trim())) e.push(`${where}: content is "" or none (every text is a DOM text node)`);
    if (prop === 'font-family') for (const fam of value.split(',').map(x => x.trim().replace(/^['"]|['"]$/g, ''))) if (!FONT_FAMILIES.includes(fam)) e.push(`${where}: font-family "${fam}" is not a bundled font (${FONT_FAMILIES.map(f => `'${f}'`).join(', ')}; no fallbacks)`);
    if ((prop === 'animation' || prop === 'animation-iteration-count') && /\binfinite\b/i.test(value)) e.push(`${where}: ${prop} is infinite: every animation ends within the duration`);
    if (prop === 'animation-direction' || prop === 'animation') { /* any direction is seekable */ }
  });
}

// Safety and the HyperFrames root: what may run at all.
export function checkHyperFramesComposition(source, { compositionId, durationSeconds }) {
  const e = [];
  if (typeof source !== 'string' || !source.trim()) return ['source: required'];
  if (Buffer.byteLength(source) > SOURCE_MAX_BYTES) e.push(`source: ${Buffer.byteLength(source)} bytes, at most ${SOURCE_MAX_BYTES}`);
  if (URLISH.test(source)) e.push(`source: contains a URL or URL scheme (${source.match(URLISH)[0].trim()}): nothing loads from anywhere`);
  if (/<!--/.test(source)) e.push('source: no HTML comments');
  const { document } = parseHTML(source);
  for (const el of document.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase();
    if (!HF_ELEMENTS.has(tag)) { e.push(`<${tag}>: not allowed (no script, link, media, frames, forms, SVG <image>/<use>/<foreignObject> or SMIL)`); continue; }
    for (const { name, value } of el.attributes) {
      const n = name.toLowerCase();
      if (n.startsWith('on')) e.push(`<${tag} ${n}>: event handlers are not allowed`);
      if (/^(href|xlink:href|src|srcset|srcdoc|action|formaction|poster|background|ping|data-composition-src|data-start|data-duration|data-track-index|data-media-start|data-playback-start|data-variable-values|data-composition-variables)$/.test(n) && !(el.hasAttribute('data-composition-id') && /^data-(start|duration)$/.test(n))) e.push(`<${tag} ${n}>: not allowed (no loads, no timed clips: animate with CSS)`);
      if (n === 'style') cssErrors(`x{${value}}`, `<${tag} style>`, e);
      else if (/url\(/i.test(String(value).replace(SVG_PRESENTATION_URL, ''))) e.push(`<${tag} ${n}>: url() only to an SVG definition (url(#id))`);
    }
    if (tag === 'meta') {
      const name = el.getAttribute('name');
      if (!(el.hasAttribute('charset') || name === 'viewport' || name === 'motion-timeline')) e.push('<meta>: only charset, viewport and motion-timeline');
    }
    if (tag === 'style') cssErrors(el.textContent || '', '<style>', e);
  }
  const roots = [...document.querySelectorAll('[data-composition-id]')];
  if (roots.length !== 1) e.push(`root: exactly one element with data-composition-id (found ${roots.length}); no nested compositions`);
  else {
    const r = roots[0], want = { 'data-composition-id': compositionId, 'data-start': '0', 'data-duration': String(durationSeconds), 'data-width': String(STAGE.width), 'data-height': String(STAGE.height) };
    for (const [k, v] of Object.entries(want)) if (r.getAttribute(k) !== v) e.push(`root: ${k}="${v}"${r.hasAttribute(k) ? ` (got "${r.getAttribute(k)}")` : ''}`);
    if (!r.hasAttribute('data-no-timeline')) e.push('root: data-no-timeline (CSS animation only; no script registers a timeline)');
    if (r.parentElement?.tagName?.toLowerCase() !== 'body') e.push('root: a direct child of <body>');
  }
  return [...new Set(e)];
}

// Visible text: every text node outside <style>, keyed by a stable path for messages. Whitespace
// collapses as the browser collapses it, except inside <pre>, where each line stays a line.
export function textNodes(document) {
  const out = {};
  let i = 0;
  const visit = node => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) {
        const raw = c.textContent || '';
        const v = c.parentElement?.closest?.('pre') ? raw.split('\n').map(l => l.trim()).filter(Boolean).join('\n') : squash(raw);
        if (v) out[`${node.getAttribute?.('data-object') || node.tagName?.toLowerCase() || 'text'}#${++i}`] = v;
      } else if (c.nodeType === 1 && !['style', 'head', 'title'].includes(c.tagName.toLowerCase())) visit(c);
    }
  };
  visit(document.body || document);
  return out;
}

// The Author contract on top of safety: the beat timeline, one element per storyboard object, and
// every learner-visible string under the same rules as the Remotion Author's TEXT.
export function checkHyperFramesSource(source, brief, storyboard) {
  const e = [];
  const { document } = parseHTML(source);
  const want = timelineFrames(storyboard);
  const meta = document.querySelector('meta[name="motion-timeline"]');
  let got = null;
  try { got = meta ? JSON.parse(meta.getAttribute('content')) : null; } catch { got = 'unparseable'; }
  if (!got || typeof got !== 'object') e.push(`timeline: <meta name="motion-timeline" content='${JSON.stringify(want)}'>${got === 'unparseable' ? ' (content is not JSON)' : ''}`);
  else {
    for (const [id, frames] of Object.entries(want)) if (JSON.stringify(got[id]) !== JSON.stringify(frames)) e.push(`timeline.${id}: must be [${frames.join(', ')}] (storyboard ${storyboard.beats.find(b => b.id === id).start_time}-${storyboard.beats.find(b => b.id === id).end_time}s at ${STAGE.fps} fps)${got[id] ? `, got ${JSON.stringify(got[id])}` : ''}`);
    for (const id of Object.keys(got)) if (!(id in want)) e.push(`timeline.${id}: not a storyboard beat`);
  }
  const ids = new Set(storyboard.beats.flatMap(b => b.visible_objects.map(o => o.id)));
  const count = {};
  for (const el of document.querySelectorAll('[data-object]')) {
    const id = el.getAttribute('data-object');
    if (!ids.has(id)) e.push(`data-object "${id}" is not a storyboard object`);
    count[id] = (count[id] || 0) + 1;
  }
  for (const id of ids) {
    if (!count[id]) e.push(`data-object "${id}": no element carries this storyboard object`);
    else if (count[id] > 1) e.push(`data-object "${id}": ${count[id]} elements; one element keeps the object's identity across beats`);
  }
  const TEXT = textNodes(document);
  e.push(...textContractErrors(TEXT, brief, storyboard, 'text'));
  return { errors: [...new Set(e)], mapping: { timeline: got, objects: Object.fromEntries(Object.keys(count).map(k => [k, `[data-object="${k}"]`])), text: TEXT } };
}
