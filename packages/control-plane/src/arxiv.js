export const SEARCH_ARXIV_TOOL = { name: 'search_arxiv', description: 'Find research papers by public topic or title. Returns arXiv metadata, not full paper contents. Read a paper before citing its figures or details.', input_schema: {
  type: 'object', additionalProperties: false, required: ['query'], properties: { query: { type: 'string', minLength: 1, maxLength: 200 } },
} };
export const READ_ARXIV_TOOL = { name: 'read_arxiv_paper', description: 'Read a specific arXiv paper, including its PDF text and figures. Supply an arXiv ID or arxiv.org abs/pdf URL. Use PDF page numbers (1-based) for citations and figure crops.', input_schema: {
  type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 150 } },
} };

export function arxivId(value) {
  let id = String(value || '').trim();
  if (/^https?:/i.test(id)) {
    const url = new URL(id);
    if (!['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Use an arxiv.org paper URL');
    id = url.pathname.replace(/^\/(abs|pdf)\//, '').replace(/\.pdf$/, '');
  }
  // Models write IDs as "arXiv:1706.03762", "abs/1706.03762" or with trailing
  // punctuation; normalize those instead of failing the whole tool call.
  id = id.replace(/^arxiv:\s*/i, '').replace(/^(abs|pdf)\//, '').replace(/[.,;:)\]]+$/, '');
  if (!/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v[1-9]\d*)?$/.test(id)) throw new Error(`Invalid arXiv paper ID: ${JSON.stringify(String(value).slice(0, 60))}. Use a form like 1706.03762 or an arxiv.org abs URL.`);
  return id;
}
const decode = text => text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(?:amp|lt|gt|quot|apos);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity]).replace(/\s+/g, ' ').trim();
export function parseArxiv(xml) {
  return [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].slice(0, 3).map(([, entry]) => {
    const field = name => decode(entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`))?.[1] || '');
    let id; try { id = arxivId(field('id')); } catch { return null; }
    return { id, title: field('title').slice(0, 500), abstract: field('summary').slice(0, 2500), authors: [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => decode(m[1])).slice(0, 10), url: `https://arxiv.org/abs/${id}`, pdfUrl: `https://arxiv.org/pdf/${id}` };
  }).filter(p => p?.title);
}

// Small on-demand requests: cache public responses, space upstream requests by 3s
// within a worker isolate. This is not a bulk crawler or a global rate limiter.
let queue = Promise.resolve(), lastRequest = 0;
async function arxivFetch(url) {
  const cache = globalThis.caches?.default;
  const cached = await cache?.match(url);
  if (cached) return cached;
  const task = queue.then(async () => {
    const delay = Math.max(0, lastRequest + 3000 - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastRequest = Date.now();
    return fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'manual', headers: { 'User-Agent': 'RabbitHole/1.0 (https://digrabbithole.com)' } });
  });
  queue = task.then(() => {}, () => {});
  const response = await task;
  if (response.ok && cache) {
    const cachedResponse = new Response(response.clone().body, response);
    cachedResponse.headers.set('Cache-Control', 'public, max-age=3600');
    await cache.put(url, cachedResponse);
  }
  return response;
}
async function metadata(params, fetcher) {
  const url = new URL('https://export.arxiv.org/api/query');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetcher(url.toString());
  if (!response.ok) throw new Error(`arXiv metadata unavailable (${response.status})`);
  const xml = await response.text();
  if (xml.length > 100000) throw new Error('arXiv response too large');
  return parseArxiv(xml);
}
export async function searchArxiv(query, fetcher = arxivFetch) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('Invalid paper search');
  return metadata({ search_query: query, max_results: '3' }, fetcher);
}
export async function readArxivPaper(value, fetcher = arxivFetch) {
  const id = arxivId(value);
  const papers = await metadata({ id_list: id, max_results: '1' }, fetcher);
  const paper = papers.find(p => p.id === id || (!/v\d+$/.test(id) && p.id.replace(/v\d+$/, '') === id));
  if (!paper) throw new Error('Paper not found on arXiv');
  return paper;
}
export function paperDocument(paper) {
  return { type: 'document', title: `${paper.title} (arXiv:${paper.id})`, source: { type: 'url', url: paper.pdfUrl } };
}
export async function fetchArxivPdf(value, fetcher = arxivFetch) {
  const id = arxivId(value);
  const response = await fetcher(`https://arxiv.org/pdf/${id}`);
  if (!response.ok) throw new Error(`Paper PDF unavailable (${response.status})`);
  // Limit buffering/rendering to a small paper, not a thesis or archive.
  const limit = 12 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Paper PDF exceeds 12 MB');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > limit) throw new Error('Paper PDF exceeds 12 MB'); chunks.push(value); } }
  finally { await reader.cancel(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('arXiv did not return a PDF');
  return bytes;
}

// Putting a paper in front of the learner. The agent can already read a paper;
// this is how it says "look at this one, at this page" instead of leaving a
// link in its answer for the learner to find and click.
//
// The worker cannot open a reader - that is browser state - so the call is
// recorded and travels back over SSE, the same road the outline proposal takes.
// Unlike that one it needs no Apply: opening a reader destroys nothing, and a
// tutor asking permission to show you the figure it is describing is worse than
// one that just shows you.
export const SHOW_PAPER_TOOL = {
  name: 'show_paper',
  description: 'Open a paper in the learner\'s reader, at a specific page. Use it when pointing at a figure, equation or passage they should look at, and say in your reply what to look for. Read the paper first so the page number is real. Only for a paper the learner asked about or you are citing in this answer.',
  input_schema: {
    type: 'object',
    required: ['id', 'page'],
    properties: {
      id: { type: 'string', description: 'The arXiv id of a paper you have read.' },
      page: { type: 'integer', minimum: 1, description: 'The PDF page to open, 1-based.' },
    },
  },
};

// `read` is the papers already read this turn: the agent may only display one it
// has actually opened, so the page number comes from the document rather than
// from a guess.
export function validateShowPaper(input, read) {
  const id = arxivId(input?.id);
  if (!read.some(paper => paper.id === id)) throw new Error('Read the paper before showing it');
  if (!Number.isInteger(input?.page) || input.page < 1 || input.page > 100) throw new Error('Page must be between 1 and 100');
  const paper = read.find(entry => entry.id === id);
  return { id, page: input.page, title: paper.title, pdfUrl: paper.pdfUrl };
}
