// Learner highlights on a Wikipedia card, stored as text quotes - the words
// plus a little text either side - never as DOM positions. The article is
// re-fetched and re-rendered freely, so a quote is the only anchor that
// survives; the neighbouring text picks the right one when the same words
// occur twice. Stored per article title, so a card that navigated elsewhere
// keeps each article's highlights apart - and in a shape a tutor tool can
// read or write later.

const CONTEXT = 32;

// A selection inside `root` -> { exact, prefix, suffix }, or null.
export function quoteFromRange(root, range) {
  if (!root || !range || range.collapsed || !root.contains(range.commonAncestorContainer)) return null;
  const exact = range.toString();
  if (!exact.trim()) return null;
  const before = document.createRange();
  before.setStart(root, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const text = root.textContent;
  return { exact, prefix: text.slice(Math.max(0, start - CONTEXT), start), suffix: text.slice(start + exact.length, start + exact.length + CONTEXT) };
}

// Where a quote sits in `text`: the occurrence whose surroundings match best.
// Pure, so it is tested without a DOM.
export function locateQuote(text, quote) {
  if (!quote?.exact) return null;
  let best = null, bestScore = -1;
  for (let at = text.indexOf(quote.exact); at !== -1; at = text.indexOf(quote.exact, at + 1)) {
    const prefix = text.slice(Math.max(0, at - quote.prefix.length), at);
    const suffix = text.slice(at + quote.exact.length, at + quote.exact.length + quote.suffix.length);
    const score = (prefix === quote.prefix ? 2 : 0) + (suffix === quote.suffix ? 2 : 0) + (prefix.endsWith(quote.prefix.slice(-8)) ? 1 : 0) + (suffix.startsWith(quote.suffix.slice(0, 8)) ? 1 : 0);
    if (score > bestScore) { best = at; bestScore = score; }
  }
  return best === null ? null : { start: best, end: best + quote.exact.length };
}

// Character offsets in root.textContent -> a live DOM Range.
export function rangeFromOffsets(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let seen = 0, begun = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.data.length;
    if (!begun && start <= seen + length) { range.setStart(node, start - seen); begun = true; }
    if (begun && end <= seen + length) { range.setEnd(node, end - seen); return range; }
    seen += length;
  }
  return null;
}

// Whether a caret offset falls inside a located quote - a click on a
// highlight in highlighter mode removes it.
export const containsOffset = (span, offset) => !!span && offset >= span.start && offset <= span.end;

// One shared paint registry for every card on the page: CSS highlights are
// named globally, so each card registers its ranges under its own key and the
// one `wiki-highlight` is rebuilt from all of them.
const painted = new Map();
export function paintHighlights(key, ranges) {
  if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return; // ponytail: no fallback for browsers without the Highlight API (pre-2023)
  if (ranges?.length) painted.set(key, ranges); else painted.delete(key);
  CSS.highlights.set('wiki-highlight', new Highlight(...[...painted.values()].flat()));
}

// Learn sections (learn-section-make-spec.md sections 6b, 7b; DECISIONS S): a quote the Tutor stored on a card is an ordinary highlight entry that also carries
// `learn: { sectionId, itemId }`. It is resolved once, when the card shows the text it belongs to: found, it becomes a plain highlight in the text's own words (so it paints as
// any other); not found, it is dropped and its item is told (LEARN_HIGHLIGHT_EVENT, which the Tutor's flow records through learn_section_made as highlight 'not_found').
export const LEARN_HIGHLIGHT_EVENT = 'rh:learn-section-highlight';
// shortcut: whitespace is ignored entirely (a PDF text layer drops the space at a line end), so a quote matches across line breaks; ligatures and hyphenation are not undone.
export function locateLoose(text, exact) {
  const needle = String(exact || '').replace(/\s+/g, '');
  if (!needle) return null;
  const at = [], kept = [];
  for (let i = 0; i < text.length; i += 1) if (!/\s/.test(text[i])) { at.push(i); kept.push(text[i]); }
  const found = kept.join('').indexOf(needle);
  return found === -1 ? null : { start: at[found], end: at[found + needle.length - 1] + 1 };
}
// entries: the card's highlights; text: what it shows now; belongs(entry): the entry is for this text (its page, its article). -> { next, missed: [learn] }, or null when none waits.
export function resolveLearnQuotes(entries, text, belongs) {
  if (!(entries || []).some(entry => entry?.learn && belongs(entry))) return null;
  const missed = [];
  const next = entries.flatMap(entry => {
    if (!entry?.learn || !belongs(entry)) return [entry];
    const { learn, ...rest } = entry;
    const span = locateQuote(text, { prefix: '', suffix: '', ...rest }) || locateLoose(text, rest.exact);
    if (!span) { missed.push(learn); return []; }
    return [{ ...rest, exact: text.slice(span.start, span.end), prefix: text.slice(Math.max(0, span.start - CONTEXT), span.start), suffix: text.slice(span.end, span.end + CONTEXT) }];
  });
  return { next, missed };
}
export const reportLearnHighlight = (learn, highlight, cardId = null) => window.dispatchEvent(new CustomEvent(LEARN_HIGHLIGHT_EVENT, { detail: { ...learn, highlight, ...(cardId ? { cardId } : {}) } }));
