// Comment anchor targets (docs/features/canvas-comments.md section 15, Comments v2 item 5): a thread on a card can name WHAT in
// the card it is about - a quoted text, a code range, a PDF page (and region), a video time. The anchor stays the object anchor
// of section 8 (so a deleted card still hides its threads, and Ungroup, pins and counts are untouched) and gains `v: 2` and a
// `target`. The server records a fingerprint of the card's content when the thread starts and compares it on every read:
// 'ok' (unchanged), 'outdated' (the card changed, the quoted text is still there) or 'detached' (the quoted text is gone).
// Pure but for sha256; no database.
import { sha256Hex } from './learn-grade-jev.js';

const QUOTE_MAX = 300;
const SKIP = new Set(['id', 'groupId', 'type', 'kind']);
const PLACES = new Set(['page', 'start', 'end', 'from', 'to', 'line', 'time']);
const norm = text => String(text).replace(/\s+/g, ' ').trim();
const quoteOf = value => (typeof value === 'string' && norm(value) ? norm(value).slice(0, QUOTE_MAX) : null);
const round = n => Math.round(n * 10) / 10;
const unit = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

// The target a client sent, normalized: undefined when there is none, null when there is one and it is not valid.
export function targetOf(raw) {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') return null;
  if (raw.kind === 'text' || raw.kind === 'code') { const quote = quoteOf(raw.quote); return quote ? { kind: raw.kind, quote } : null; }
  if (raw.kind === 'pdf') {
    if (!Number.isInteger(raw.page) || raw.page < 1 || raw.page > 10000) return null;
    const quote = quoteOf(raw.quote), r = raw.region;
    if (r !== undefined && !(r && unit(r.x) && unit(r.y) && unit(r.w) && unit(r.h))) return null;
    return { kind: 'pdf', page: raw.page, ...(quote ? { quote } : {}), ...(r ? { region: { x: round(r.x * 1000) / 1000, y: round(r.y * 1000) / 1000, w: round(r.w * 1000) / 1000, h: round(r.h * 1000) / 1000 } } : {}) };
  }
  if (raw.kind === 'video') return typeof raw.t === 'number' && Number.isFinite(raw.t) && raw.t >= 0 && raw.t <= 86400 ? { kind: 'video', t: round(raw.t) } : null;
  return null;
}

// Every text a card holds, in field order (its own words and the places it points to, not its identifiers or its layout), bounded.
export function entryStrings(entry, depth = 0, out = [], budget = { left: 50_000 }) {
  if (budget.left <= 0 || depth > 5) return out;
  if (typeof entry === 'string') { out.push(entry.slice(0, budget.left)); budget.left -= entry.length; return out; }
  if (Array.isArray(entry)) { for (const item of entry) entryStrings(item, depth + 1, out, budget); return out; }
  if (entry && typeof entry === 'object') for (const [key, value] of Object.entries(entry)) {
    if (SKIP.has(key)) continue;
    if (typeof value === 'number' && PLACES.has(key)) out.push(`${key}=${value}`); // where in a PDF or a video a card points; never its layout
    else entryStrings(value, depth + 1, out, budget);
  }
  return out;
}
export const fingerprint = entry => sha256Hex(norm(entryStrings(entry).join('\n')));

// Where a quote sits in a code card, as 1-based lines of the field that holds it; null when the card does not hold it verbatim.
export function locate(entry, quote) {
  for (const text of entryStrings(entry)) {
    const at = text.indexOf(quote);
    if (at < 0) continue;
    const from = text.slice(0, at).split('\n').length;
    return { line_from: from, line_to: from + quote.split('\n').length - 1 };
  }
  return null;
}

export const holdsQuote = (entry, quote) => norm(entryStrings(entry).join('\n')).includes(norm(quote));

// 'ok' | 'outdated' | 'detached' for a stored target against the card as it is now.
export async function stateOf(target, entry) {
  if ((target.kind === 'text' || target.kind === 'code') && !holdsQuote(entry, target.quote)) return 'detached';
  return target.hash && target.hash === await fingerprint(entry) ? 'ok' : 'outdated';
}
