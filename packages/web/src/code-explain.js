// The code-explain card's pure rules (code-explain-card-spec.md sections 2, 3 steps 5-8 and 6; data contract: packages/control-plane/src/code-explain-contract.js).
// CodeExplainCard.jsx, CodeCard.jsx (a satellite's ranges) and the insertion (code-explain-insert.js) read it. No React, no network.
import { codeRef } from './chat-sources.js';
import { repositoryUrl } from './card-sources.js';

export const DEPTHS = [['brief', 'Brief'], ['standard', 'Standard'], ['detailed', 'Detailed']];
export { CODE_EXPLAIN_SIZE } from './code-explain-text.js'; // the card's opening size; the learner resizes it like any card
// Lines kept around the highlighted ones when the whole file is not shown, and the longest gap between two ranges shown in full: a longer gap keeps its first and last
// GAP_KEEP lines (dimmed) with a "N lines not shown" row between, so a range at line 5 and another at line 400 do not make a 400-line card.
export const CONTEXT_LINES = 2, GAP_COLLAPSE = 12, GAP_KEEP = 3;

// Sentences: the renderer splits the prose after . ! or ? (and a closing quote, bracket or backtick) followed by white space. Anchors name a sentence by this index, so the
// control plane's handler counts with the same rule (a "." inside a name such as model.py has no white space after it, so it never splits).
const SENTENCE_BREAK = /(?<=[.!?]["')\]`]*)\s+/;
export function splitSentences(prose) {
  const text = String(prose ?? '').trim();
  return text ? text.split(SENTENCE_BREAK) : [];
}

// Every range and mention of the card by id: where it is (path, lines), which card holds its file (files[0] is 'self'; a mention has none).
export function targetsOf(card) {
  const map = new Map();
  (card?.files || []).forEach((file, index) => (file.ranges || []).forEach(range => map.set(range.id, { id: range.id, path: file.path, start: range.start, end: range.end, cardId: file.cardId ?? null, file: index })));
  (card?.mentioned || []).forEach(mention => map.set(mention.id, { id: mention.id, path: mention.path, start: mention.start, end: mention.end, cardId: null, file: null }));
  return map;
}

// Where an anchor's target is shown now. place: 'self' (the primary's own pane), 'card' (a satellite still on the board: `present(cardId)`), or 'link' (a mention, or a satellite
// that was deleted: a file:line link that opens Files, spec 2d: anchors are never dropped). null for an id the card does not hold.
export function resolveTarget(card, id, present = () => true) {
  const target = targetsOf(card).get(id);
  if (!target) return null;
  const place = target.file === 0 ? 'self' : target.file != null && target.cardId && present(target.cardId) ? 'card' : 'link';
  return { ...target, place };
}

// The prose at a depth as sentences: [{ index, text, targets: [range ids] }].
export function sentencesOf(card, depth) {
  const body = card?.depths?.[depth];
  if (!body) return [];
  const byIndex = new Map();
  for (const anchor of body.anchors || []) byIndex.set(anchor.sentence, [...(byIndex.get(anchor.sentence) || []), anchor.target]);
  return splitSentences(body.prose).map((text, index) => ({ index, text, targets: byIndex.get(index) || [] }));
}

// The first sentence at this depth anchored to a range (a click on that range scrolls the prose to it), or -1 when this depth does not anchor it.
export const sentenceOfRange = (card, depth, rangeId) => sentencesOf(card, depth).findIndex(sentence => sentence.targets.includes(rangeId));

// The ranges as sorted spans where overlapping or touching ranges become one, each keeping the ids it covers: [{ start, end, ids }].
export function spansOf(ranges) {
  const sorted = [...(ranges || [])].filter(r => Number.isInteger(r?.start) && Number.isInteger(r?.end) && r.start <= r.end).sort((a, b) => a.start - b.start || a.end - b.end);
  const spans = [];
  for (const range of sorted) {
    const last = spans.at(-1);
    if (last && range.start <= last.end + 1) { last.end = Math.max(last.end, range.end); last.ids.push(range.id); } else spans.push({ start: range.start, end: range.end, ids: [range.id] });
  }
  return spans;
}
// The lines a file's ranges cover as one range (a chat ref's range, the satellite's stored lines): { start, end } or null.
export const hullOf = ranges => { const spans = spansOf(ranges); return spans.length ? { start: spans[0].start, end: spans.at(-1).end } : null; };

// What a code pane draws. lines: [{ n, text }] the file (or a satellite's stored lines); ranges: the highlighted ones. Rows are { kind: 'line', n, text, ids, dim } and
// { kind: 'gap', hidden } (the "N lines not shown" row). whole (Show whole file): every line, dimming off, highlight kept. No ranges: every line, nothing dimmed.
export function codeRows(lines, ranges, { whole = false } = {}) {
  const spans = spansOf(ranges), all = lines || [];
  const idsAt = n => spans.find(span => n >= span.start && n <= span.end)?.ids ?? [];
  const row = line => ({ kind: 'line', n: line.n, text: line.text, ids: idsAt(line.n), dim: false });
  if (!spans.length || whole) return all.map(row);
  const from = spans[0].start - CONTEXT_LINES, to = spans.at(-1).end + CONTEXT_LINES;
  const rows = [];
  let hidden = 0;
  const flush = () => { if (hidden) { rows.push({ kind: 'gap', hidden }); hidden = 0; } };
  for (const line of all) {
    if (line.n < from || line.n > to) continue;
    const ids = idsAt(line.n);
    if (ids.length) { flush(); rows.push({ ...row(line), dim: false }); continue; }
    // A gap line: beyond GAP_COLLAPSE lines between two ranges only the first and last GAP_KEEP lines of the gap stay.
    const before = spans.findLast(span => span.end < line.n), after = spans.find(span => span.start > line.n);
    const gapStart = before ? before.end + 1 : from, gapEnd = after ? after.start - 1 : to;
    const long = before && after && gapEnd - gapStart + 1 > GAP_COLLAPSE;
    if (long && line.n >= gapStart + GAP_KEEP && line.n <= gapEnd - GAP_KEEP) { hidden += 1; continue; }
    flush();
    rows.push({ ...row(line), dim: true });
  }
  flush();
  return rows;
}

// Files at a range (the Files panel's small:open-code event: TutorCodebase.jsx openFiles, learn-runbook.js openRunbookLink): the repository canvas answers it by repository
// (sameRepo), so a card made before the app name was known, or at another commit than the snapshot's, still opens the file the snapshot has.
export const openDetail = (card, target, app = card?.app) => ({ ...(app ? { app } : {}), repo: card.repo, commit: card.commit, sameRepo: true, path: target.path, start: target.start, end: target.end });
// Dispatch it; when nothing answers (another canvas or revision, a read-only page) open GitHub at that commit. dispatch and open are the seams the unit test passes.
export function openCode(detail, { dispatch = event => window.dispatchEvent(event), open = url => window.open(url, '_blank', 'noopener') } = {}) {
  const event = new CustomEvent('small:open-code', { detail, cancelable: true });
  if (dispatch(event) !== false && !event.defaultPrevented) { open(repositoryUrl({ repo: detail.repo, commit: detail.commit, path: detail.path, line: detail.start, lineEnd: detail.end })); return 'github'; }
  return 'files';
}

// The card as chat context (a suggestion's question is asked about the same code): one code ref per file, over the lines its ranges cover (chat-sources.js codeRef; the same
// ref the Files reader's Add in chat makes), and the mentioned files are left out because the card did not read them.
export const codeRefsOf = card => (card?.files || []).map(file => ({ file, hull: hullOf(file.ranges) })).filter(({ hull }) => hull)
  .map(({ file, hull }) => codeRef({ repo: card.repo, commit: card.commit, path: file.path, start: hull.start, end: hull.end }));
