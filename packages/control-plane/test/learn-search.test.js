import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arxivIdFromUrl, wikiKeyFromUrl, resultsFromExa, directResult, searchCanvasSource, RESULT_LIMIT } from '../src/learn-search.js';

// Shapes copied from a live Exa response (2026-09-23) for the same queries.
const ARXIV_HITS = { results: [
  { url: 'https://arxiv.org/abs/1706.03762', title: '[1706.03762] Attention Is All You Need - arXiv', summary: 'The transformer paper.' },
  { url: 'https://arxiv.org/html/1706.03762v7', title: 'Attention Is All You Need - arXiv' },
  { url: 'https://arxiv.org/pdf/1706.03762v2/__stdout.txt', title: 'Attention Is All You Need' },
  { url: 'https://ar5iv.labs.arxiv.org/html/2301.09977', title: '[2301.09977] The Backpropagation algorithm for a math student' },
  { url: 'https://export.arxiv.org/pdf/2107.09384', title: '' },
  { url: 'https://arxiv.org/list/cs.LG/recent', title: 'Not a paper' },
] };

test('every arXiv url shape names its paper, versions and mirrors collapse', () => {
  assert.equal(arxivIdFromUrl('https://arxiv.org/abs/1706.03762'), '1706.03762');
  assert.equal(arxivIdFromUrl('https://arxiv.org/pdf/1706.03762v2/__stdout.txt'), '1706.03762');
  assert.equal(arxivIdFromUrl('https://ar5iv.labs.arxiv.org/html/2301.09977'), '2301.09977');
  assert.equal(arxivIdFromUrl('https://arxiv.org/pdf/cs/0308031'), 'cs/0308031');
  assert.equal(arxivIdFromUrl('https://arxiv.org/list/cs.LG/recent'), null);
  const rows = resultsFromExa('arxiv', ARXIV_HITS);
  assert.deepEqual(rows.map(row => row.key), ['1706.03762', '2301.09977', '2107.09384'], 'three distinct papers, the listing page dropped');
  assert.equal(rows[0].title, 'Attention Is All You Need', 'the "[id] ... - arXiv" wrapper is trimmed');
  assert.equal(rows[0].why, 'The transformer paper.');
  assert.equal(rows[0].item.pdfUrl, 'https://arxiv.org/pdf/1706.03762');
});

test('wikipedia keys come from article urls only', () => {
  assert.equal(wikiKeyFromUrl('https://en.wikipedia.org/wiki/Chain_rule?wprov=sfla1'), 'Chain_rule');
  assert.equal(wikiKeyFromUrl('https://en.wikipedia.org/wiki/Neural_network_(machine_learning)'), 'Neural_network_(machine_learning)');
  assert.equal(wikiKeyFromUrl('https://en.wikipedia.org/wiki/Category:Machine_learning'), null, 'namespaces are not articles');
  assert.equal(wikiKeyFromUrl('https://de.wikipedia.org/wiki/Backpropagation'), null, 'English only');
  assert.equal(wikiKeyFromUrl('not a url'), null);
});

test('youtube rows carry the id, channel, and a thumbnail; the cap is five', () => {
  const hits = { results: Array.from({ length: 8 }, (_, at) => ({ url: `https://www.youtube.com/watch?v=Ilg3gGewQ5${'ABCDEFGH'[at]}`, title: `Video ${at} - YouTube`, author: '3Blue1Brown', summary: 'Why.' })) };
  const rows = resultsFromExa('youtube', hits);
  assert.equal(rows.length, RESULT_LIMIT);
  assert.equal(rows[0].title, 'Video 0', 'the " - YouTube" suffix is the site, not the video');
  assert.equal(rows[0].subtitle, '3Blue1Brown');
  assert.match(rows[0].thumbnail, /i\.ytimg\.com\/vi\/Ilg3gGewQ5A\//);
});

test('a pasted arXiv id or link is the exact paper, no search', async () => {
  const paper = { id: '1706.03762v7', title: 'Attention Is All You Need', authors: ['Vaswani'], pdfUrl: 'https://arxiv.org/pdf/1706.03762v7' };
  for (const pasted of ['1706.03762', 'https://arxiv.org/abs/1706.03762', 'arXiv:1706.03762']) {
    const hit = await directResult('arxiv', pasted, { readPaper: async () => paper });
    assert.equal(hit.exact, true, pasted);
    assert.equal(hit.item.id, paper.id);
  }
  assert.equal(await directResult('arxiv', 'attention is all you need', { readPaper: async () => assert.fail('not an id') }), null);
});

test('an 11-letter word is never mistaken for a video id', async () => {
  assert.equal(await directResult('youtube', 'transformer'), null);
  assert.equal((await directResult('youtube', 'https://www.youtube.com/watch?v=Ilg3gGewQ5U')).item.videoId, 'Ilg3gGewQ5U');
});

test('a wikipedia link is checked before it is offered', async () => {
  const titles = async () => [{ title: 'Gradient_descent', displayTitle: 'Gradient descent', description: 'Optimization algorithm', thumbnail: null }];
  const hit = await directResult('wikipedia', 'https://en.wikipedia.org/wiki/Gradient_descent', { wikiTitles: titles });
  assert.equal(hit.item.title, 'Gradient_descent');
  await assert.rejects(() => directResult('wikipedia', 'https://en.wikipedia.org/wiki/No_such_page_xyz', { wikiTitles: async () => [] }), /No English Wikipedia article at that link/);
});

test('search sends the query to Exa scoped to the source, with a why-summary', async () => {
  let sent = null;
  const fetcher = async (url, init) => {
    if (String(url).includes('export.arxiv.org')) return new Response('<feed></feed>');
    sent = JSON.parse(init.body);
    return Response.json({ results: [{ url: 'https://en.wikipedia.org/wiki/Backpropagation', title: 'Backpropagation', summary: 'The algorithm itself.' }] });
  };
  const body = await searchCanvasSource('wikipedia', 'I want to understand backpropagation', { EXA_API_KEY: 'k' }, { fetcher, direct: async () => null });
  assert.deepEqual(sent.includeDomains, ['en.wikipedia.org']);
  assert.match(sent.contents.summary.query, /I want to understand backpropagation/);
  assert.equal(body.results[0].title, 'Backpropagation');
  assert.equal(body.results[0].why, 'The algorithm itself.');
});

test('failures say what happened, in words a learner can act on', async () => {
  const env = { EXA_API_KEY: 'k' };
  const direct = async () => null;
  await assert.rejects(() => searchCanvasSource('reddit', 'x', env, { direct }), /Choose YouTube, arXiv, or Wikipedia/);
  await assert.rejects(() => searchCanvasSource('youtube', '   ', env, { direct }), /Type what you are looking for/);
  await assert.rejects(() => searchCanvasSource('youtube', 'x', {}, { direct }), /not connected/);
  await assert.rejects(() => searchCanvasSource('youtube', 'x', env, { direct, fetcher: async () => new Response('', { status: 429 }) }), /Too many searches/);
  await assert.rejects(() => searchCanvasSource('youtube', 'x', env, { direct, fetcher: async () => new Response('', { status: 500 }) }), /unavailable right now \(500\)/);
});
