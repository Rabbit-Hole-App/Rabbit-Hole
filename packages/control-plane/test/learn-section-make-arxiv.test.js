import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/learn-section-make/arxiv.js';
import { parseArxiv } from '../src/arxiv.js';

// ctx.turn.papers as read_arxiv_paper records them: the page count from the arXiv comment, no page text (Reviewer 10:50: no PDF parsing in the Worker).
const ctx = { item: { id: 'i6' }, turn: { papers: { '1706.03762v7': { title: 'Attention', pageCount: 3 } } } };

test('C §6e.3: a page beyond the arXiv page count is refused; a quote is passed on with highlight unverified for the browser to find', async () => {
  const ok = await validate({ id: '1706.03762', pages: [{ page: 1, quote: 'The dominant sequence transduction models are based on recurrent networks' }] }, ctx);
  assert.deepEqual(ok.perform, { op: 'paper', id: '1706.03762', pages: [{ page: 1, quote: 'The dominant sequence transduction models are based on recurrent networks' }] });
  assert.deepEqual(ok.record, { highlight: 'unverified' });
  const beyond = await validate({ id: '1706.03762', pages: [{ page: 4, quote: 'Section three text' }] }, ctx);
  assert.match(beyond.error, /beyond the paper's 3 pages/);
  assert.match((await validate({ id: '2001.00001', pages: [{ page: 1, quote: 'x' }] }, ctx)).error, /Read 2001.00001 with read_arxiv_paper/);
});

test('parseArxiv: the page count comes from the comment, null without one', () => {
  const entry = comment => `<feed><entry><id>http://arxiv.org/abs/1706.03762v7</id><title>Attention</title><summary>s</summary>${comment}</entry></feed>`;
  assert.equal(parseArxiv(entry('<arxiv:comment xmlns:arxiv="http://arxiv.org/schemas/atom">15 pages, 5 figures</arxiv:comment>'))[0].pageCount, 15);
  assert.equal(parseArxiv(entry(''))[0].pageCount, null);
});
