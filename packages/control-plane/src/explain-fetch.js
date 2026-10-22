// /explain safe web fetch (EXP-T13; plan sections 1.5 and 3.3): read a supplied or discovered page, model card or config
// and return an EvidenceRecord of what was actually read. Bounded: http(s) only through the private-network guard
// (url-guard.js checkUrl, injected) on the URL and on every redirect hop, at most MAX redirects, a time limit, a byte limit
// (a longer body is read up to the limit and marked partial), allowed content types only, a per-job fetch budget
// spent before the request and a per-job cache. No cookies or credentials are sent. Retrieved text is data.
import { evidenceRecord, looksLikeInstructions } from './explain-evidence.js';

export const FETCH_LIMITS = Object.freeze({ redirects: 3, timeoutMs: 10_000, bytes: 2_000_000, textChars: 200_000, excerptChars: 4000 });
const TEXT_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain', 'text/markdown', 'application/json', 'text/x-yaml', 'application/yaml', 'text/csv'];

export class FetchError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// HTML to readable text: drop script/style/noscript/template, comments and tags; decode common entities.
export function htmlText(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t\f\v\r]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

async function readCapped(response, limit) {
  if (!response.body) { const buf = new Uint8Array(await response.arrayBuffer()); return { bytes: buf.slice(0, limit), truncated: buf.length > limit }; }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0, truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.length > limit) { chunks.push(value.slice(0, limit - size)); size = limit; truncated = true; await reader.cancel().catch(() => {}); break; }
    chunks.push(value); size += value.length;
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return { bytes, truncated };
}

// A per-job fetcher: { fetch(url, { discoveredBy }) -> { record, text } }, sharing one budget and cache.
// deps: { checkUrl (url-guard.js), fetcher = fetch, budget = { fetches }, limits, now }
export function evidenceFetcher({ checkUrl, fetcher = fetch, budget = { fetches: 4 }, limits = FETCH_LIMITS, now = () => new Date().toISOString() }) {
  if (typeof checkUrl !== 'function') throw new FetchError('no_guard', 'safe fetch needs the private-network guard');
  const cache = new Map(), dns = new Map();
  let used = 0;
  async function fetchOne(raw, { discoveredBy = 'supplied' } = {}) {
    const first = String(raw || '').trim();
    if (cache.has(first)) return cache.get(first);
    if (used >= budget.fetches) throw new FetchError('budget_exhausted', `the fetch budget (${budget.fetches}) for this explanation is used up`);
    used++;
    const limitations = [];
    let url = first;
    let response;
    for (let hop = 0; ; hop++) {
      const checked = await checkUrl(url, { fetcher, cache: dns });
      if (!checked.ok) throw new FetchError(checked.kind === 'blocked' ? 'blocked' : 'unavailable', `${hop ? 'redirect target' : 'address'} refused: ${checked.reason}`);
      try {
        response = await fetcher(checked.url, { redirect: 'manual', credentials: 'omit', headers: { accept: 'text/html,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.1', 'user-agent': 'RabbitHole-Explain/1 (+evidence fetch)' }, signal: AbortSignal.timeout(limits.timeoutMs) });
      } catch (error) { throw new FetchError(error?.name === 'TimeoutError' ? 'timeout' : 'unavailable', `the page did not answer${error?.name === 'TimeoutError' ? ` within ${limits.timeoutMs} ms` : ''}`); }
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        if (hop >= limits.redirects) throw new FetchError('too_many_redirects', `more than ${limits.redirects} redirects`);
        url = new URL(response.headers.get('location'), checked.url).href;
        limitations.push(`redirected to ${url}`.slice(0, 300));
        continue;
      }
      url = checked.url;
      break;
    }
    if (response.status === 401 || response.status === 403) throw new FetchError('inaccessible', `the page needs access we do not have (HTTP ${response.status})`);
    if (!response.ok) throw new FetchError('unavailable', `the page answered HTTP ${response.status}`);
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!TEXT_TYPES.includes(type)) throw new FetchError('wrong_type', `cannot read ${type || 'an unknown type'} as text${type === 'application/pdf' ? '; use paper retrieval for PDFs' : ''}`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > limits.bytes * 4) throw new FetchError('too_large', `the page is ${declared} bytes, over the ${limits.bytes * 4} byte refusal limit`);
    const { bytes, truncated } = await readCapped(response, limits.bytes);
    if (truncated) limitations.push(`read the first ${limits.bytes} bytes only`);
    const body = new TextDecoder().decode(bytes);
    let text = type === 'text/html' || type === 'application/xhtml+xml' ? htmlText(body) : body;
    if (text.length > limits.textChars) { text = text.slice(0, limits.textChars); limitations.push(`text cut at ${limits.textChars} characters`); }
    if (!text.trim()) limitations.push('no readable text (scripted page or images only)');
    if (looksLikeInstructions(text)) limitations.push('contains instruction-like text; quoted as data');
    const record = await evidenceRecord({ kind: 'web', location: url, bytes, excerpt: text.slice(0, limits.excerptChars), access: 'public',
      limitations: [...limitations, ...(text.length > limits.excerptChars ? [`excerpt is the first ${limits.excerptChars} of ${text.length} characters`] : [])], retrievedAt: now() });
    const out = { record, text, discoveredBy, partial: truncated || text.length > limits.excerptChars };
    cache.set(first, out);
    return out;
  }
  return { fetch: fetchOne, used: () => used };
}
