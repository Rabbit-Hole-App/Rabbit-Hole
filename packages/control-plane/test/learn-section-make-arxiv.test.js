import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/learn-section-make/arxiv.js';

// ctx.turn.papers as read_arxiv_paper (pages: true) returns them: the PDF's text per page.
const ctx = { item: { id: 'i6' }, turn: { papers: { '1706.03762v7': { pageCount: 3, pages: [{ page: 1, text: 'Abstract. The dominant sequence trans-\nduction models are based on recurrent networks.' }, { page: 2, text: 'Section two text.' }, { page: 3, text: 'Section three text.' }] } } } };

test('C §6e.3: a planted quote that is not on its page is re-asked; a page beyond the count is refused', async () => {
  const ok = await validate({ id: '1706.03762', pages: [{ page: 1, quote: 'The dominant sequence transduction models are based on recurrent networks' }] }, ctx);
  assert.deepEqual(ok.perform, { op: 'paper', id: '1706.03762', pages: [{ page: 1, quote: 'The dominant sequence transduction models are based on recurrent networks' }] });
  const planted = await validate({ id: '1706.03762', pages: [{ page: 2, quote: 'The dominant sequence transduction models' }] }, ctx);
  assert.match(planted.error, /is not on page 2/);
  const beyond = await validate({ id: '1706.03762', pages: [{ page: 4, quote: 'Section three text' }] }, ctx);
  assert.match(beyond.error, /beyond the paper's 3 pages/);
});
