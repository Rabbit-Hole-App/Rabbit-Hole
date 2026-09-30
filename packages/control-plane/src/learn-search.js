// The canvas search bar: one natural-language query, one source at a time,
// the five best results with a one-line "why this" each. Exa does the finding
// for all three sources - measured against the sources' own APIs, it is the
// only one that finds "Attention Is All You Need" by its title AND answers
// "I want to understand backpropagation" with the right pages.
//
// A pasted arXiv id or link, Wikipedia link, or YouTube link is not a search:
// it resolves to that exact item without an Exa call.
import { arxivId, readArxivPaper } from './arxiv.js';
import { wikiTitle, searchWikipediaTitles } from './learn-wiki.js';
import { videoIdFrom } from './learn-youtube.js';

export const SEARCH_SOURCES = {
  youtube: { domain: 'youtube.com', noun: 'YouTube videos' },
  arxiv: { domain: 'arxiv.org', noun: 'arXiv papers' },
  wikipedia: { domain: 'en.wikipedia.org', noun: 'Wikipedia articles' },
};
export const RESULT_LIMIT = 5;
// Exa returns a few more than we show: pdf/html/abs duplicates of one paper,
// and redirect twins on Wikipedia, collapse into one row each.
const FETCH_LIMIT = 8;

// "arxiv.org/abs/1706.03762", ".../pdf/1706.03762v2", ".../html/1706.03762v7",
// ar5iv and export mirrors - all name the same paper.
export function arxivIdFromUrl(url) {
  const match = String(url || '').match(/arxiv\.org\/(?:abs|pdf|html)\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}))(?:v\d+)?/i);
  return match ? match[1] : null;
}

export function wikiKeyFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^(en\.)?(m\.)?wikipedia\.org$/i.test(parsed.hostname)) return null;
    const match = decodeURIComponent(parsed.pathname).match(/^\/wiki\/(.+)$/);
    if (!match) return null;
    // wikiTitle refuses Category:, File:, Talk: and the rest - not articles.
    wikiTitle(match[1]);
    return match[1].replace(/ /g, '_');
  } catch { return null; }
}

const why = hit => String(hit?.summary || '').replace(/\s+/g, ' ').trim().slice(0, 240) || null;

// Exa hits -> result rows for one source, deduplicated, at most `limit`.
export function resultsFromExa(source, payload, limit = RESULT_LIMIT) {
  const rows = [];
  const seen = new Set();
  for (const hit of payload?.results || []) {
    if (rows.length >= limit) break;
    if (source === 'youtube') {
      const videoId = videoIdFrom(hit?.url);
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);
      const title = String(hit.title || '').replace(/\s*[-|]\s*YouTube\s*$/i, '').trim().slice(0, 200) || videoId;
      const channel = String(hit.author || '').trim().slice(0, 120) || null;
      rows.push({ key: videoId, title, subtitle: channel, why: why(hit), thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, item: { videoId, title, channel } });
    } else if (source === 'arxiv') {
      const id = arxivIdFromUrl(hit?.url);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      // Exa's title for a pdf hit is often empty; the arXiv metadata pass
      // below fills it in. "[1706.03762] Title - arXiv" is trimmed to Title.
      const title = String(hit.title || '').replace(/^\[[^\]]+\]\s*/, '').replace(/\s*-\s*arXiv\s*$/i, '').trim().slice(0, 300);
      rows.push({ key: id, title, subtitle: `arXiv:${id}`, why: why(hit), thumbnail: null, item: { id, title, pdfUrl: `https://arxiv.org/pdf/${id}` } });
    } else {
      const key = wikiKeyFromUrl(hit?.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const title = key.replace(/_/g, ' ');
      rows.push({ key, title, subtitle: 'Wikipedia', why: why(hit), thumbnail: null, item: { title: key } });
    }
  }
  return rows;
}

// Paper titles and authors from arXiv itself, one batched call, so a pdf hit
// with no Exa title still reads as a paper. Best effort: rows keep what Exa
// gave them if arXiv is slow or down.
async function enrichPapers(rows, fetcher) {
  if (!rows.length) return rows;
  try {
    const url = new URL('https://export.arxiv.org/api/query');
    url.searchParams.set('id_list', rows.map(row => row.key).join(','));
    url.searchParams.set('max_results', String(rows.length));
    const response = await fetcher(url.toString(), { headers: { 'User-Agent': 'SmallLearn/1.0' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return rows;
    const xml = await response.text();
    const papers = new Map();
    for (const [, entry] of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
      const id = arxivIdFromUrl(entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]);
      if (!id) continue;
      papers.set(id, {
        title: (entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '').replace(/\s+/g, ' ').trim(),
        authors: [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(match => match[1].trim()),
      });
    }
    return rows.map(row => {
      const paper = papers.get(row.key);
      if (!paper) return row;
      const title = paper.title || row.title || `arXiv ${row.key}`;
      const authors = paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' et al.' : '');
      return { ...row, title, subtitle: [authors, `arXiv:${row.key}`].filter(Boolean).join(' · '), item: { ...row.item, title, authors: paper.authors.slice(0, 10) } };
    });
  } catch { return rows; }
}

// A pasted id or link names one item exactly; no search, no Exa spend.
// Returns null when the query is not such a reference.
export async function directResult(source, query, { readPaper = readArxivPaper, wikiTitles = searchWikipediaTitles } = {}) {
  const text = query.trim();
  if (source === 'arxiv') {
    let id;
    try { id = arxivId(text); } catch { return null; }
    const paper = await readPaper(id);
    return { key: paper.id, title: paper.title, subtitle: `arXiv:${paper.id}`, why: 'Exactly the paper you pasted.', exact: true, thumbnail: null, item: { id: paper.id, title: paper.title, authors: paper.authors, pdfUrl: paper.pdfUrl } };
  }
  if (!/^https?:\/\//i.test(text)) return null;
  if (source === 'youtube') {
    const videoId = videoIdFrom(text);
    if (!videoId) return null;
    return { key: videoId, title: 'The video you linked', subtitle: null, why: 'Exactly the video you pasted.', exact: true, thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, item: { videoId, title: null, channel: null } };
  }
  let named;
  try { named = wikiTitle(text); } catch { return null; }
  // Confirm the article exists before offering it - a dead link should fail
  // here, visibly, not later inside an empty card.
  const spaced = named.title.replace(/_/g, ' ');
  const pages = await wikiTitles(spaced);
  const page = pages.find(entry => entry.displayTitle.toLowerCase() === spaced.toLowerCase());
  if (!page) throw new Error(`No English Wikipedia article at that link (${spaced}).`);
  return { key: page.title, title: page.displayTitle, subtitle: 'Wikipedia', why: page.description || 'Exactly the article you pasted.', exact: true, thumbnail: page.thumbnail, item: { title: page.title } };
}

// Results are cached for an hour per source and query: the same search twice
// in a session costs one Exa call, not two.
export async function searchCanvasSource(source, query, env, { fetcher = fetch, direct = directResult } = {}) {
  if (!SEARCH_SOURCES[source]) throw new Error('Choose YouTube, arXiv, or Wikipedia');
  if (typeof query !== 'string' || !query.trim() || query.length > 300) throw new Error('Type what you are looking for (up to 300 characters)');
  const exact = await direct(source, query);
  if (exact) return { results: [exact], exact: true };
  if (!env?.EXA_API_KEY) throw new Error('Search is not connected on this deployment.');
  const cache = globalThis.caches?.default;
  const cacheKey = `https://search-cache.small.internal/${source}?q=${encodeURIComponent(query.trim().toLowerCase())}`;
  try { const hit = await cache?.match(cacheKey); if (hit) return await hit.json(); } catch { /* search live */ }
  let response;
  try {
    response = await fetcher('https://api.exa.ai/search', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.EXA_API_KEY },
      body: JSON.stringify({
        query: query.trim(), type: 'auto', numResults: FETCH_LIMIT,
        includeDomains: [SEARCH_SOURCES[source].domain],
        // The "why this": a sentence written for THIS query, per result.
        contents: { summary: { query: `In one sentence: why is this a good pick for someone looking for "${query.trim().slice(0, 200)}"?` } },
      }),
    });
  } catch (error) { throw new Error(error?.name === 'TimeoutError' ? 'Search did not answer in time. Try again.' : 'Search is unavailable right now. Try again.'); }
  if (response.status === 401 || response.status === 403) throw new Error('The search key was refused.');
  if (response.status === 429) throw new Error('Too many searches right now. Wait a moment and try again.');
  if (!response.ok) throw new Error(`Search is unavailable right now (${response.status}). Try again.`);
  let results = resultsFromExa(source, await response.json());
  if (source === 'arxiv') results = await enrichPapers(results, fetcher);
  const body = { results, exact: false };
  if (cache && results.length) {
    try { await cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } })); }
    catch { /* caching is best effort */ }
  }
  return body;
}
