// Learn sections C §10: a webpage item. A page the source links to, or one this turn's web search returned and read; quoted passages
// (at most 80 words each) that the browser anchors and highlights once its capture is ready. A recency beat dates the page in the lead.
// ponytail: C §10f.4 (a failed capture drops the item and re-runs compose) is the browser's and compose's path, not this validator's.
import { flat } from './arxiv.js';

const MAX_CARDS = 2, MAX_QUOTE_WORDS = 80;

export const fields = {
  url: { type: 'string', maxLength: 2000, description: 'The page: the source\'s own link when it has one, else a search result you read.' },
  quotes: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', maxLength: 800 }, description: 'The sentences to read, verbatim, at most 80 words each.' },
  pageDate: { type: 'string', maxLength: 40, description: 'The page\'s own date as written on it; required for a recency beat, and the lead says "as of" it.' },
};
export const required = ['url', 'quotes'];
export const tools = ['search_web'];

// Public http(s) only: no credentials, no local or private hosts.
export function publicUrl(value) {
  let url; try { url = new URL(String(value)); } catch { return null; }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/.test(host) || host.includes(':')) return null;
  return url;
}
const same = (a, b) => a.replace(/\/$/, '') === b.replace(/\/$/, '');

export async function validate(input, ctx) {
  if ((ctx.earlier ?? []).filter(e => e.perform?.op === 'webpage').length >= MAX_CARDS) return { error: `At most ${MAX_CARDS} web pages in a section` };
  const url = publicUrl(input.url);
  if (!url) return { error: 'Point at a public http or https page' };
  // The source's own link needs no search (C §10b); otherwise the page is one this turn's search returned.
  const linked = Object.values(ctx.snapshot?.files ?? {}).some(text => text.includes(url.href) || text.includes(String(input.url)));
  const found = (ctx.turn?.web ?? []).find(page => page?.url && same(page.url, url.href));
  if (!linked && !found) return { error: 'Use a page the source links to, or one your web search returned this turn' };
  const quotes = (input.quotes ?? []).map(q => String(q).trim()).filter(Boolean);
  if (!quotes.length) return { error: 'Quote the sentences to read, verbatim' };
  const long = quotes.find(q => q.split(/\s+/).length > MAX_QUOTE_WORDS);
  if (long) return { error: `Each quote is at most ${MAX_QUOTE_WORDS} words; "${long.slice(0, 60)}" is longer` };
  if (ctx.beat?.material?.reason === 'recency') {
    const date = String(input.pageDate ?? '').trim();
    if (!date) return { error: 'This beat is about something recent: read the page\'s date and give it as pageDate' };
    if (!String(input.lead ?? '').includes(date)) return { error: `Say in the lead that this is as of ${date}, the page's date` };
  }
  // A page whose text was read this turn: a quote not in it is dropped and recorded; the browser locates the others in its capture.
  const text = typeof found?.text === 'string' ? flat(found.text) : null;
  const missing = text == null ? [] : quotes.filter(q => !text.includes(flat(q)));
  return {
    perform: { op: 'webpage', url: url.href, quotes: quotes.filter(q => !missing.includes(q)) },
    record: { source: linked ? 'linked' : 'search', ...(input.pageDate ? { pageDate: String(input.pageDate).trim() } : {}), ...(missing.length ? { highlight: 'not_found', notFound: missing } : {}) },
  };
}
