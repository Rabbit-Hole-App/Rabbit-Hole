// Wikipedia as a lesson source. See docs/features/wikipedia.md.
//
// Two speeds, and they are not the same request. The learner's card fetches a
// whole article and scrolls it; the model reads one section, because the full
// HTML of Machine learning is 978,697 bytes and one section of it is 16,927.
//
// Everything goes through the worker. Wikimedia returns 403 to any request
// without a User-Agent, which a browser cannot set, and the only endpoint that
// returns a single section sends no CORS header at all.

const NAMESPACES = ['talk', 'user', 'wikipedia', 'file', 'mediawiki', 'template', 'help', 'category', 'portal', 'draft', 'special', 'module', 'timedtext'];
// Only English for now. The field exists so that adding a language later is a
// new value rather than a migration of every stored source id.
export const WIKI_LANG = 'en';
const SECTION_TEXT_LIMIT = 6000;
const ARTICLE_LIMIT = 4 * 1024 * 1024;

// Accepts what a model or a learner actually types: a wiki key, a display
// title with spaces, or a wikipedia.org URL with or without a #fragment.
// Returns the key plus whatever section the URL named, so a pasted deep link
// opens where it pointed.
export function wikiTitle(value) {
  let title = String(value || '').trim();
  let section = null;
  if (/^https?:/i.test(title)) {
    const url = new URL(title);
    // English only, so another language's URL is refused rather than silently
    // answered from a different article on en.wikipedia.
    if (!/^(en\.)?(m\.)?wikipedia\.org$/i.test(url.hostname) || url.username || url.password || url.port) throw new Error('Use an English wikipedia.org article URL');
    const path = decodeURIComponent(url.pathname);
    const match = path.match(/^\/(?:wiki\/|[a-z]{2,3}(?:-[a-z]+)?\/wiki\/)?(.+)$/i);
    if (!match) throw new Error('Use a wikipedia.org article URL');
    title = match[1];
    if (url.hash) section = decodeURIComponent(url.hash.slice(1)).replace(/_/g, ' ');
  }
  title = title.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!title) throw new Error('Name a Wikipedia article');
  if (title.length > 255) throw new Error('That is not a Wikipedia article title');
  // A colon is legal in an article title (Dune: Part Two), so only a known
  // namespace prefix is refused - not every colon.
  const prefix = title.split(':')[0].trim().toLowerCase();
  if (title.includes(':') && NAMESPACES.includes(prefix)) throw new Error(`${title.split(':')[0]} pages are not lesson sources - name an article`);
  // Wikipedia capitalises the first letter of every article title itself, so
  // "machine learning" and "Machine learning" are the same page.
  return { title: (title[0].toUpperCase() + title.slice(1)).replace(/ /g, '_'), section };
}

export const articleUrl = title => `https://${WIKI_LANG}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
const restUrl = path => `https://${WIKI_LANG}.wikipedia.org/w/rest.php/v1/${path}`;
const actionUrl = params => {
  const url = new URL(`https://${WIKI_LANG}.wikipedia.org/w/api.php`);
  // redirects=1 or "ML" reads the one-line redirect stub, not Machine learning.
  for (const [key, value] of Object.entries({ format: 'json', formatversion: '2', redirects: '1', ...params })) url.searchParams.set(key, value);
  return url.toString();
};

// No inter-request spacing, unlike arxivFetch. Wikimedia publishes a per-minute
// allowance (200 with a real User-Agent, 10 without), not a per-request one,
// and a learner clicking links must never queue behind a background read.
async function wikiFetch(url) {
  const cache = globalThis.caches?.default;
  const cached = await cache?.match(url);
  if (cached) return cached;
  let response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
      headers: { 'User-Agent': 'RabbitHole/1.0 (https://digrabbithole.com)', 'Accept-Encoding': 'gzip' },
    });
  } catch (error) {
    // A timeout is a DOMException whose message says nothing a learner can act on.
    throw new Error(error?.name === 'TimeoutError' ? 'Wikipedia did not answer in time. Try again.' : 'Wikipedia is unavailable');
  }
  if (response.ok && cache) {
    const stored = new Response(response.clone().body, response);
    stored.headers.set('Cache-Control', 'public, max-age=3600');
    await cache.put(url, stored);
  }
  return response;
}

// Wikimedia says what went wrong in a header the learner cannot see, so turn
// the ones that mean something into a sentence naming the next step.
function checkResponse(response, what) {
  if (response.ok) return;
  if (response.status === 404) throw new Error(`No Wikipedia article called ${what}`);
  if (response.status === 429) throw new Error('Wikipedia is rate-limiting these requests. Wait a minute and try again.');
  throw new Error(`Wikipedia is unavailable (${response.status})`);
}

// Navigation chrome the model should not read as article text - the same
// set the card drops. Removed with its whole element: these are nested tables
// and divs, so the end is found by counting same-name tags, not by regex.
const CHROME = /\b(?:hatnote|dablink|sidebar|vertical-navbox|navbox|ambox|metadata|shortdescription|sistersitebox|side-box)\b/;
export function stripChrome(html) {
  let text = String(html || '');
  const opener = /<(table|div|span)\b[^>]*\b(?:class="([^"]*)"|role="navigation")[^>]*>/gi;
  for (let guard = 0; guard < 200; guard++) {
    opener.lastIndex = 0;
    let match, found = null;
    while ((match = opener.exec(text))) {
      if (match[2] === undefined || CHROME.test(match[2])) { found = match; break; }
    }
    if (!found) break;
    const tag = found[1].toLowerCase();
    const scan = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
    scan.lastIndex = found.index + found[0].length;
    let depth = 1, end = text.length, step;
    while (depth && (step = scan.exec(text))) {
      depth += step[1] ? -1 : 1;
      if (!depth) end = step.index + step[0].length;
    }
    text = text.slice(0, found.index) + text.slice(end);
  }
  return text;
}

const htmlToText = html => String(html)
  .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
  // Citation markers are "[12]" to a reader and noise to a model quoting a
  // sentence. Parsoid marks them mw-ref, the action API marks them reference.
  .replace(/<sup[^>]*\bclass="[^"]*\b(?:reference|mw-ref)\b[^"]*"[\s\S]*?<\/sup>/gi, '')
  .replace(/<[^>]+>/g, ' ')
  // Numeric entities decode properly or the model reads "don t" for "don't".
  // Unknown named ones are left alone rather than blanked: Parsoid emits real
  // UTF-8, so anything still written as an entity is rare and better shown as
  // itself than as a hole in the middle of a word.
  .replace(/&#(\d{1,7});/g, (whole, code) => (Number(code) > 0 && Number(code) <= 0x10ffff ? String.fromCodePoint(Number(code)) : whole))
  .replace(/&#x([0-9a-f]{1,6});/gi, (whole, code) => (parseInt(code, 16) > 0 && parseInt(code, 16) <= 0x10ffff ? String.fromCodePoint(parseInt(code, 16)) : whole))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity.toLowerCase()])
  .replace(/\s+/g, ' ')
  .trim();

// The article's own contents list. `index` is what the section endpoint takes
// and what the rendered HTML carries as data-mw-section-id, so one number
// addresses a section for both the model and the browser.
export function tocFrom(payload) {
  const sections = payload?.parse?.tocdata?.sections;
  if (!Array.isArray(sections)) return [];
  return sections.map(entry => ({
    index: Number(entry.index),
    level: Number(entry.tocLevel ?? entry.toclevel) || 1,
    title: htmlToText(entry.line || '').slice(0, 200),
    anchor: String(entry.anchor || ''),
  })).filter(entry => Number.isInteger(entry.index) && entry.title);
}

// A model names a section the way a reader would - by its heading - but may
// also pass the number it saw in the contents list. Both resolve here, and an
// unknown one is null rather than a guess at the nearest match.
export function sectionIndex(toc, reference) {
  if (reference == null || reference === '') return 0;
  const wanted = String(reference).trim();
  if (/^\d+$/.test(wanted)) {
    const index = Number(wanted);
    return index === 0 || toc.some(entry => entry.index === index) ? index : null;
  }
  const loose = wanted.replace(/[_\s]+/g, ' ').toLowerCase();
  const hit = toc.find(entry => entry.title.toLowerCase() === loose || entry.anchor.replace(/_/g, ' ').toLowerCase() === loose)
    || toc.find(entry => entry.title.toLowerCase().startsWith(loose));
  return hit ? hit.index : null;
}

// Naming the sections an article does have is the difference between a dead
// end and a next step, for the model and for the learner reading the failure.
const sectionMiss = (wanted, article) =>
  `No section ${JSON.stringify(String(wanted ?? '').slice(0, 60))} in ${article.displayTitle}. Its sections are: ${(article.toc || []).map(entry => entry.title).join(', ') || 'none'}`;

export async function searchWikipedia(query, fetcher = wikiFetch) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('Invalid article search');
  const response = await fetcher(restUrl(`search/page?q=${encodeURIComponent(query.trim())}&limit=5`));
  checkResponse(response, JSON.stringify(query.slice(0, 60)));
  const data = await response.json();
  return (data?.pages || []).map(page => ({
    title: String(page.key || ''),
    displayTitle: String(page.title || ''),
    description: htmlToText(page.description || '').slice(0, 300),
    thumbnail: page.thumbnail?.url ? `https:${page.thumbnail.url}`.replace(/^https:https:/, 'https:') : null,
    url: articleUrl(String(page.key || '')),
  })).filter(page => page.title);
}

// Titles for the picker: prefix search, so typing "einst" offers Einstein
// before the learner has finished the word. Full-text search is what the model
// gets, because it searches by topic rather than by the title it already knows.
export async function searchWikipediaTitles(query, fetcher = wikiFetch) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('Invalid article search');
  const response = await fetcher(restUrl(`search/title?q=${encodeURIComponent(query.trim())}&limit=10`));
  checkResponse(response, JSON.stringify(query.slice(0, 60)));
  const data = await response.json();
  return (data?.pages || []).map(page => ({
    title: String(page.key || ''),
    displayTitle: String(page.title || ''),
    description: htmlToText(page.description || '').slice(0, 300),
    thumbnail: page.thumbnail?.url ? `https:${page.thumbnail.url}`.replace(/^https:https:/, 'https:') : null,
  })).filter(page => page.title);
}

export async function articleContents(title, fetcher = wikiFetch) {
  const response = await fetcher(actionUrl({ action: 'parse', page: title, prop: 'tocdata' }));
  checkResponse(response, title.replace(/_/g, ' '));
  const data = await response.json();
  if (data?.error?.code === 'missingtitle') throw new Error(`No Wikipedia article called ${title.replace(/_/g, ' ')}`);
  if (data?.error) throw new Error(`Wikipedia could not read ${title.replace(/_/g, ' ')}`);
  return { title: String(data?.parse?.title || title).replace(/ /g, '_'), displayTitle: String(data?.parse?.title || title), toc: tocFrom(data) };
}

// One section as plain text. The model never receives a whole article: the
// section endpoint is 200x smaller and is the unit the tutor actually cites.
export async function readWikipedia(value, reference, fetcher = wikiFetch) {
  const { title, section: fromUrl } = wikiTitle(value);
  const article = await articleContents(title, fetcher);
  const wanted = reference ?? fromUrl;
  const index = sectionIndex(article.toc, wanted);
  if (index === null) throw new Error(sectionMiss(wanted, article));
  const response = await fetcher(actionUrl({ action: 'parse', page: title, prop: 'text', section: String(index), disableeditsection: '1' }));
  checkResponse(response, article.displayTitle);
  const data = await response.json();
  if (data?.error?.code === 'nosuchsection') throw new Error(`No section ${index} in ${article.displayTitle}`);
  if (data?.error) throw new Error(`Wikipedia could not read ${article.displayTitle}`);
  const text = htmlToText(stripChrome(data?.parse?.text || ''));
  const heading = article.toc.find(entry => entry.index === index);
  return {
    title: article.title,
    displayTitle: article.displayTitle,
    section: index,
    sectionTitle: heading?.title || 'Introduction',
    toc: article.toc,
    text: text.slice(0, SECTION_TEXT_LIMIT),
    truncated: text.length > SECTION_TEXT_LIMIT,
    url: articleUrl(article.title),
  };
}

// The whole article, for the learner's card. Licence metadata comes with it:
// CC BY-SA requires the notice to be visible beside the content, so the card
// cannot render until it knows what to say.
export async function fetchWikipediaArticle(value, fetcher = wikiFetch) {
  const { title } = wikiTitle(value);
  const [page, meta] = await Promise.all([
    fetcher(restUrl(`page/${encodeURIComponent(title)}/html`)),
    // A licence lookup that throws must not take the article down with it: the
    // notice has a compliant default, the article does not.
    fetcher(restUrl(`page/${encodeURIComponent(title)}/bare`)).catch(() => null),
  ]);
  checkResponse(page, title.replace(/_/g, ' '));
  const length = Number(page.headers.get('content-length'));
  if (length > ARTICLE_LIMIT) throw new Error('That article is too large to open');
  const html = await page.text();
  if (html.length > ARTICLE_LIMIT) throw new Error('That article is too large to open');
  const bare = meta?.ok ? await meta.json().catch(() => null) : null;
  return {
    title,
    displayTitle: String(bare?.title || title.replace(/_/g, ' ')),
    html,
    url: articleUrl(title),
    licence: { title: String(bare?.license?.title || 'Creative Commons Attribution-Share Alike 4.0'), url: String(bare?.license?.url || 'https://creativecommons.org/licenses/by-sa/4.0/deed.en') },
  };
}

export const SEARCH_WIKIPEDIA_TOOL = { name: 'search_wikipedia', description: 'Find Wikipedia articles by topic or title. Returns titles and one-line descriptions, not article contents. Read an article before citing it.', input_schema: {
  type: 'object', additionalProperties: false, required: ['query'], properties: { query: { type: 'string', minLength: 1, maxLength: 200 } },
} };

export const READ_WIKIPEDIA_TOOL = { name: 'read_wikipedia', description: 'Read one section of a Wikipedia article as text, and get the article\'s list of sections. Omit the section to read the introduction and see what else the article covers, then read the section you need. Supply an article title or a wikipedia.org URL.', input_schema: {
  type: 'object', additionalProperties: false, required: ['title'], properties: {
    title: { type: 'string', minLength: 1, maxLength: 255 },
    section: { type: 'string', maxLength: 200, description: 'A section heading from this article, or its number from the contents. Omit for the introduction.' },
  },
} };

// The same bargain show_paper strikes: the worker cannot open a reader, so the
// call is recorded and travels back over SSE. No Apply gate - opening a reader
// destroys nothing, and detaching the source is the undo.
export const SHOW_WIKIPEDIA_TOOL = { name: 'show_wikipedia', description: 'Open a Wikipedia article in the learner\'s reader, scrolled to a section. Use it when pointing at something they should read, and say in your reply what to look for. Read the article first so the section is real.', input_schema: {
  type: 'object', additionalProperties: false, required: ['title'], properties: {
    title: { type: 'string', minLength: 1, maxLength: 255, description: 'An article you have read in this answer.' },
    section: { type: 'string', maxLength: 200, description: 'A section heading from that article, or its number. Omit to open at the top.' },
  },
} };

export { WIKI_SYSTEM } from './agents/learn-chat.js';

// `read` is what this turn actually read, so the tutor can only display an
// article it has opened and a section that exists in it.
export function validateShowWikipedia(input, read) {
  const { title } = wikiTitle(input?.title);
  const article = read.find(entry => entry.title === title);
  if (!article) throw new Error('Read the article before showing it');
  const index = sectionIndex(article.toc || [], input?.section);
  if (index === null) throw new Error(sectionMiss(input?.section, article));
  const heading = (article.toc || []).find(entry => entry.index === index);
  return {
    lang: WIKI_LANG,
    title,
    displayTitle: article.displayTitle,
    section: index,
    sectionTitle: heading?.title || null,
    url: articleUrl(title),
  };
}
