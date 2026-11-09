// E2 (docs/features/explain.md section 5 "Approved interaction contract"): the browser side of a written Explanation's interaction layer.
// PURE: no React. It consumes the server envelope `block.interactions` (control-plane/src/explanation-interactions.js, the lead's contract) and owns
// (1) the revision check, (2) the mapping between a rendered field's DOM text and the field's canonical display text (code points, Markdown syntax removed,
// whitespace collapsed), (3) selection anchors and highlight records, (4) the wrap/unwrap of term pills and highlights over the rendered DOM,
// (5) suggestion consumption. Offsets are Unicode code points into `fieldText(block, field)`, end exclusive; DOM offsets (UTF-16) never reach storage.
//
// Why not import the control-plane file: it also imports the spend ledger through sha256Hex, ~0.8 MB the browser must not carry. fieldText comes from
// learn-primitives.js (already in the web bundle); the three small pure helpers below are copied, and explanation-interactions.test.mjs asserts parity
// with the control-plane module (the same revision for the same card, the same field text).
import { explanationFieldText } from '../../control-plane/src/learn-primitives.js';

export const INTERACTIONS_VERSION = 1;
export const DISPLAY_TEXT_VERSION = 1;
const FIELD = /^(?:body|more\[[0-2]\]\.text)$/;
const CONTEXT = 24; // code points of prefix/suffix kept with a selection anchor

// ---- revision ----
export const contentRevisionInput = block => JSON.stringify({ v: DISPLAY_TEXT_VERSION, title: block?.title ?? '', body: block?.body ?? '', more: (block?.more || []).map(s => ({ label: s?.label ?? '', text: s?.text ?? '' })) });
export async function contentRevision(block) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contentRevisionInput(block)));
  return `r${DISPLAY_TEXT_VERSION}-${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16)}`;
}
export const interactionsCurrent = (block, revision) => !!block?.interactions && block.interactions.version === INTERACTIONS_VERSION && block.interactions.displayTextVersion === DISPLAY_TEXT_VERSION && block.interactions.contentRevision === revision;

// -> the field's canonical display text, or null when the card has no such field.
export function fieldText(block, field) {
  if (field === 'body') return explanationFieldText(block?.body);
  const m = /^more\[([0-2])\]\.text$/.exec(field);
  return m && block?.more?.[Number(m[1])] ? explanationFieldText(block.more[Number(m[1])].text) : null;
}
export const fieldsOf = block => ['body', ...(block?.more || []).slice(0, 3).map((_, index) => `more[${index}].text`)];

// ---- code points ----
const cps = text => Array.from(String(text ?? ''));
const isSpace = ch => /\s/u.test(ch);
// The non-whitespace code points of a text and where each sits in it: whitespace is collapsed differently by the Markdown source, the DOM and the
// canonical text, so alignment ignores it and the canonical offsets are recovered from `at`.
export function squeeze(text) {
  const chars = [], at = [];
  cps(text).forEach((ch, index) => { if (!isSpace(ch)) { chars.push(ch); at.push(index); } });
  return { chars, at };
}
const lowerBound = (list, value) => { let lo = 0, hi = list.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid] < value) lo = mid + 1; else hi = mid; } return lo; };

// ---- DOM text of one rendered field ----
// Elements whose text is chrome, not content: the code block's language label and Copy button, anything a caller marks.
const SKIP = '[data-code-lang],[data-code-copy],[data-explanation-skip],[data-explanation-ui],script,style,title,desc';
// A TutorDiagram is an island: its words are in the canonical text (tutorDiagramVisibleText) as one run, but in the drawing's own order, so it is matched by
// the multiset of its characters and never decorated or selected into.
// Typeset maths (MathText.jsx, [data-chat-math]) is an island too: the canonical text holds its LaTeX source (learn-primitives mathText keeps what is between the
// dollars) but the DOM holds KaTeX glyphs, so it is matched by the source KaTeX keeps in its annotation (a formula KaTeX refused shows its source as text).
// A formula in a diagram label ([data-tutor-tex], tutor-diagrams/primitives.js) counts as the source written in the label, delimiters included.
const MATH = '[data-chat-math]';
// [data-tutor-visible]: a diagram's wrapper (Md.jsx) carrying tutorDiagramVisibleText, the words the card's canonical text holds for it. The drawing's own text (axis ticks, graph badges, legends of the
// newer kinds) is not those words, so it must never be compared with the canonical text: the wrapper is the island and its words are what align (owner 2026-11-08: pills and Highlight were dead on every card with a plot, histogram or graph).
const ISLAND = `[data-tutor-visible],[data-tutor-diagram],[data-tutor-tex],${MATH}`;
const TEXT = 3, ELEMENT = 1;
const texOf = node => node.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent ?? node.textContent;
function walkItems(node, out) {
  for (const child of Array.from(node.childNodes || [])) {
    if (child.nodeType === TEXT) out.push({ text: child });
    else if (child.nodeType === ELEMENT && child.matches?.(ISLAND)) out.push({ island: child });
    else if (child.nodeType === ELEMENT && !child.matches?.(SKIP)) walkItems(child, out);
  }
  return out;
}
const nonSpace = text => Array.from(String(text ?? '')).filter(ch => !isSpace(ch));
const islandChars = node => node.hasAttribute?.('data-tutor-visible') ? nonSpace(node.getAttribute('data-tutor-visible')) : node.hasAttribute?.('data-tutor-tex') ? nonSpace(node.getAttribute('data-tutor-tex')) : walkItems(node, []).flatMap(item => (item.text ? nonSpace(item.text.data) : item.island ? islandChars(item.island) : []));
const inIsland = node => !!(node?.nodeType === ELEMENT ? node : node?.parentNode)?.closest?.(ISLAND);

// The aligned field: `root`'s rendered text against the canonical text. null when they disagree (anything rendered that the canonical
// mapping does not contain): the caller then decorates nothing in that field and offers no highlight over it.
// domToCan[i]: the squeezed canonical index of the i-th rendered character (they differ only after a diagram or maths island).
export function alignField(root, canonical) {
  const can = squeeze(canonical), nodes = [], chars = [], where = [], domToCan = [], first = new Map();
  let at = 0;
  for (const item of walkItems(root, [])) {
    if (item.island?.matches?.(MATH)) {
      const tex = nonSpace(texOf(item.island));
      // \( \) and \[ \] are typeset by the card but kept, delimiters and all, by the canonical text.
      const wrapped = ['\\(', '\\['].includes(can.chars.slice(at, at + 2).join('')), from = at + (wrapped ? 2 : 0);
      if (can.chars.slice(from, from + tex.length).join('') !== tex.join('')) return null;
      at = from + tex.length + (wrapped ? 2 : 0);
      continue;
    }
    if (item.island) {
      const inside = islandChars(item.island), run = can.chars.slice(at, at + inside.length);
      if (run.length !== inside.length || [...run].sort().join('') !== [...inside].sort().join('')) return null;
      at += inside.length;
      continue;
    }
    const node = item.text;
    nodes.push(node);
    first.set(node, chars.length);
    let offset = 0;
    for (const ch of String(node.data ?? '')) {
      if (!isSpace(ch)) {
        if (can.chars[at] !== ch) return null;
        chars.push(ch); where.push({ node, from: offset, to: offset + ch.length }); domToCan.push(at); at += 1;
      }
      offset += ch.length;
    }
  }
  if (at !== can.chars.length) return null;
  return { root, nodes, chars, where, first, can, domToCan };
}

// Canonical [start, end) -> the range [lo, hi) of rendered characters it covers (empty -> null).
export function squeezedRange(aligned, start, end) {
  const lo = lowerBound(aligned.domToCan, lowerBound(aligned.can.at, start)), hi = lowerBound(aligned.domToCan, lowerBound(aligned.can.at, end));
  return hi > lo ? [lo, hi] : null;
}
// Document order by hand (linkedom, the Node test DOM, answers compareDocumentPosition wrongly across siblings): paths of child indices from the document.
const path = node => { const out = []; for (let n = node; n?.parentNode; n = n.parentNode) out.unshift(Array.prototype.indexOf.call(n.parentNode.childNodes, n)); return out; };
const order = (a, b) => { const x = path(a), y = path(b); for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return Math.sign(x.length - y.length); };
const childIndexHolding = (container, node) => { let n = node; while (n.parentNode && n.parentNode !== container) n = n.parentNode; return Array.prototype.indexOf.call(container.childNodes, n); };
// Where the boundary (container, offset) lies against `node`: -1 before it, 0 inside it, 1 after it.
export function boundaryVs(node, container, offset) {
  if (node === container || node.contains(container)) return 0;
  if (container.contains(node)) return offset <= childIndexHolding(container, node) ? -1 : 1;
  return order(container, node) < 0 ? -1 : 1;
}
// A DOM boundary (container, offset) -> how many non-whitespace characters of the field precede it.
export function charsBefore(aligned, container, offset) {
  const { nodes, first, where } = aligned;
  if (first.has(container)) {
    let index = first.get(container);
    while (index < where.length && where[index].node === container && where[index].from < offset) index += 1;
    return index;
  }
  // An element boundary: the characters of every text node that lies wholly before it.
  let count = 0;
  for (const node of nodes) if (boundaryVs(node, container, offset) === 1) count = first.get(node) + whereCount(aligned, node);
  return count;
}
const whereCount = (aligned, node) => { let n = 0; for (let i = aligned.first.get(node); i < aligned.where.length && aligned.where[i].node === node; i += 1) n += 1; return n; };

// ---- selection anchors ----
// range: { startContainer, startOffset, endContainer, endOffset } (a DOM Range or a plain object). fields: [{ field, root, aligned, canonical }] in reading order.
// -> the ordered field segments the range covers, each { field, start, end, quote, prefix, suffix, contentRevision }; [] when nothing in any aligned field is covered.
export function anchorsFromRange(range, fields, revision) {
  const out = [];
  for (const { field, root, aligned, canonical } of fields) {
    if (!aligned) continue;
    if (inIsland(range.startContainer) || inIsland(range.endContainer)) continue; // a selection that starts or ends inside a drawing is refused
    const startAt = boundaryVs(root, range.startContainer, range.startOffset), endAt = boundaryVs(root, range.endContainer, range.endOffset);
    if (startAt === 1 || endAt === -1) continue; // the range begins after this field or ends before it
    const startIn = startAt === 0, endIn = endAt === 0;
    const from = startIn ? charsBefore(aligned, range.startContainer, range.startOffset) : 0;
    const to = endIn ? charsBefore(aligned, range.endContainer, range.endOffset) : aligned.chars.length;
    if (to <= from) continue;
    const start = aligned.can.at[aligned.domToCan[from]], end = aligned.can.at[aligned.domToCan[to - 1]] + 1, all = cps(canonical);
    out.push({ field, start, end, quote: all.slice(start, end).join(''), prefix: all.slice(Math.max(0, start - CONTEXT), start).join(''), suffix: all.slice(end, end + CONTEXT).join(''), contentRevision: revision });
  }
  return out;
}
export const quoteOf = segments => segments.map(segment => segment.quote).join(' ').trim();
// Create note (owner 2026-11-08): the Sticky note's own words start with the selected text in italics, then an empty line for the learner's note
// (learn-rich-text.js: `text` stays the plain string, `runs` carry the italics). -> { text, runs }
export const quotedNote = quote => ({ text: `${quote}\n\n`, runs: [{ t: quote, i: true }, { t: '\n\n' }] });

// A stored segment still belongs to this text: the field exists and its slice is the quote.
export const segmentHolds = (block, segment) => {
  const text = fieldText(block, segment?.field);
  return text != null && Number.isInteger(segment.start) && Number.isInteger(segment.end) && segment.start >= 0 && segment.end > segment.start && cps(text).slice(segment.start, segment.end).join('') === segment.quote;
};

// ---- highlights on the card (block.highlights) ----
// A highlight is { id, contentRevision, segments }. Current ones decorate; ones from another revision are omitted from the text (their quotes stay in the card data).
export const highlightsFor = (block, revision) => (Array.isArray(block?.highlights) ? block.highlights : []).filter(h => h?.contentRevision === revision && Array.isArray(h.segments) && h.segments.length && h.segments.every(segment => segment.contentRevision === revision && segmentHolds(block, segment)));
export const withHighlight = (block, id, segments, revision) => ({ ...block, highlights: [...(block.highlights || []), { id, contentRevision: revision, segments }] });
export const withoutHighlight = (block, id) => ({ ...block, highlights: (block.highlights || []).filter(h => h.id !== id) });

// ---- suggestions ----
// The three questions the card shows now: the envelope is current and this revision's set has not been consumed (state is per user, card and revision).
export function suggestionsFor(block, revision) {
  if (!interactionsCurrent(block, revision)) return [];
  const state = block.interactionState;
  if (state?.contentRevision === revision && state.consumed) return [];
  return Array.isArray(block.interactions.questions) ? block.interactions.questions.filter(q => q?.id && q.text).slice(0, 3) : [];
}
export const withConsumed = (block, revision, action) => ({ ...block, interactionState: { contentRevision: revision, consumed: true, action } });

// ---- terms ----
// The terms that decorate now: current envelope only, anchors that still point at their quote (a stale or edited anchor is dropped, never moved).
export function termsFor(block, revision) {
  if (!interactionsCurrent(block, revision)) return [];
  return (Array.isArray(block.interactions.terms) ? block.interactions.terms : []).filter(term => term?.id && term.label && term.definition && segmentHolds(block, { ...term.anchor, quote: term.anchor?.quote }));
}

// ---- decoration ----
// Wrap the aligned field's marked characters: terms (pill buttons) and highlights. marks: [{ start, end, kind: 'term'|'highlight', id }] in canonical code points.
// Splits text nodes (the original node stays the first piece, so a later unwrap restores it) and wraps each run; returns nothing. undecorate() reverses it.
const MARK = 'data-explanation-mark';
// Text.splitText by hand (linkedom, the Node test DOM, has none): the node keeps the head, the returned node holds the tail.
function split(node, at, doc) {
  const tail = doc.createTextNode(node.data.slice(at));
  node.data = node.data.slice(0, at);
  node.parentNode.insertBefore(tail, node.nextSibling);
  return tail;
}
export function decorate(aligned, marks, doc) {
  const labels = aligned.chars.map(() => ({ term: null, highlights: [] }));
  for (const mark of marks) {
    const range = squeezedRange(aligned, mark.start, mark.end);
    if (!range) continue;
    for (let i = range[0]; i < range[1]; i += 1) { if (mark.kind === 'term') labels[i].term = labels[i].term || mark.id; else labels[i].highlights.push(mark.id); }
  }
  const same = (a, b) => a.term === b.term && a.highlights.join() === b.highlights.join();
  const runs = [];
  for (let i = 0; i < labels.length; i += 1) {
    if (!labels[i].term && !labels[i].highlights.length) continue;
    const last = runs.at(-1), here = aligned.where[i];
    if (last && last.end === i && last.node === here.node && same(last.label, labels[i])) { last.end = i + 1; last.to = here.to; }
    else runs.push({ node: here.node, label: labels[i], start: i, end: i + 1, from: here.from, to: here.to });
  }
  // Runs that touch (no marked character between them) and share a highlight, or a term, also cover the whitespace between them: one band, not words with gaps.
  for (let i = 1; i < runs.length; i += 1) {
    const r = runs[i - 1], s = runs[i];
    if (r.end !== s.start) continue;
    const shared = r.label.highlights.some(id => s.label.highlights.includes(id)) || (!!r.label.term && r.label.term === s.label.term);
    if (!shared) continue;
    if (r.node === s.node) r.to = s.from;
    else { r.to = String(r.node.data).length; s.from = 0; }
  }
  const seen = new Set();
  for (const run of runs.reverse()) {
    let target = run.node;
    if (run.from > 0) target = split(target, run.from, doc);
    if (run.to - run.from < target.data.length) split(target, run.to - run.from, doc);
    const parent = target.parentNode, span = doc.createElement('span');
    parent.insertBefore(span, target);
    span.appendChild(target);
    span.setAttribute(MARK, run.label.term ? 'term' : 'highlight');
    if (run.label.term) {
      span.setAttribute('data-term-id', run.label.term);
      if (!seen.has(run.label.term)) { seen.add(run.label.term); span.setAttribute('data-term-first', ''); }
    }
    if (run.label.highlights.length) span.setAttribute('data-highlight-ids', run.label.highlights.join(' '));
  }
  // Runs were wrapped last-first, so the first piece of a term is the one marked last: mark it by document order instead.
  const pieces = Array.from(aligned.root.querySelectorAll?.(`[${MARK}][data-term-id]`) || []);
  const firstOf = new Set();
  for (const piece of pieces) { piece.removeAttribute('data-term-first'); const id = piece.getAttribute('data-term-id'); if (!firstOf.has(id)) { firstOf.add(id); piece.setAttribute('data-term-first', ''); } }
}
export function undecorate(root) {
  for (const span of Array.from(root.querySelectorAll?.(`[${MARK}]`) || [])) {
    const parent = span.parentNode;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  }
  root.normalize?.();
}
