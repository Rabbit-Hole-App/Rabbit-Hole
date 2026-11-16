// Learn sections C §6 with DECISIONS S: a paper item, one card per page of a paper read this turn, each with the passage to read.
// The Worker reads no PDF (Reviewer 10:50): the page is bounded by the arXiv comment's page count, and the browser finds and paints the quote on open (DECISIONS S).
import { arxivId } from '../arxiv.js';

const MAX_PAGES = 4, MAX_QUOTE_WORDS = 60, PAGE_BOUND = 100; // 100: show_paper's page bound when the count is unknown

export const fields = {
  id: { type: 'string', maxLength: 150, description: 'The arXiv id of a paper you read this turn.' },
  pages: {
    type: 'array', minItems: 1, maxItems: MAX_PAGES, description: 'One card per page, in reading order.',
    items: {
      type: 'object', additionalProperties: false, required: ['page', 'quote'], properties: {
        page: { type: 'integer', minimum: 1 },
        quote: { type: 'string', maxLength: 600, description: 'The passage to read on that page, verbatim, at most 60 words.' },
        figure: { type: 'boolean', description: 'True when a figure on the page is the point.' },
      },
    },
  },
};
export const required = ['id', 'pages'];
export const tools = ['read_arxiv_paper', 'search_arxiv'];

// Words only, lower case: PDF text breaks lines, hyphenates and spaces ligatures differently from a typed quote.
export const flat = text => String(text ?? '').replace(/-\s*\n\s*/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const base = id => id.replace(/v\d+$/, '');

export async function validate(input, ctx) {
  let id;
  try { id = arxivId(input.id); } catch (error) { return { error: error.message }; }
  const read = Object.entries(ctx.turn?.papers ?? {}).find(([key]) => key === id || base(key) === base(id))?.[1];
  if (!read) return { error: `Read ${id} with read_arxiv_paper in this turn before pointing at its pages` };
  const pages = input.pages ?? [];
  if (!pages.length || pages.length > MAX_PAGES) return { error: `Point at 1 to ${MAX_PAGES} pages of a paper` };
  const count = read.pageCount ?? null;
  for (const { page, quote } of pages) {
    if (!Number.isInteger(page) || page < 1 || page > (count ?? PAGE_BOUND)) return { error: `Page ${page} is beyond the paper's ${count ?? PAGE_BOUND} pages` };
    const words = String(quote ?? '').trim().split(/\s+/).filter(Boolean).length;
    if (!words || words > MAX_QUOTE_WORDS) return { error: `Quote 1 to ${MAX_QUOTE_WORDS} words verbatim from page ${page}` };
  }
  return {
    perform: { op: 'paper', id, pages: pages.map(({ page, quote, figure }) => ({ page, quote: quote.trim(), ...(figure ? { figure: true } : {}) })) },
    record: { highlight: 'unverified' }, // the browser records found / not_found on open (S)
  };
}
