import { test } from 'node:test';
import assert from 'node:assert/strict';
import { researchAnswer } from '../src/learn-research.js';
import { readFileSync } from 'node:fs';

const paper = { id: '1506.02640v5', title: 'YOLO', pdfUrl: 'https://arxiv.org/pdf/1506.02640v5' };
const text = value => Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: value }] });
const tool = (name, input) => Response.json({ content: [{ type: 'tool_use', name, input, id: 'call-1' }] });
test('ordinary questions can answer without any paper tools', async () => {
  const result = await researchAnswer({}, [], 'Tutor', null, { callModel: async () => text('One half.'), readPaper: () => assert.fail('Unnecessary retrieval') });
  assert.equal(result.answer, 'One half.'); assert.deepEqual(result.papers, []);
});
test('exact paper request reads the actual PDF before answering and returns provenance', async () => {
  let calls = 0;
  const result = await researchAnswer({}, [{ role: 'user', content: 'Explain arXiv:1506.02640 Figure 1' }], 'Tutor', null, {
    callModel: async (_, body) => {
      if (!calls++) return tool('read_arxiv_paper', { id: '1506.02640' });
      const blocks = body.messages.at(-1).content[0].content;
      assert.equal(blocks.find(b => b.type === 'document').source.url, paper.pdfUrl);
      return text('Figure 1, PDF page 1: resize, network, detections.');
    }, readPaper: async id => { assert.equal(id, '1506.02640'); return paper; },
  });
  assert.equal(calls, 2); assert.deepEqual(result.papers, [paper]);
});
test('search is metadata only; failed reading returns an error to the model, not a fabricated source', async () => {
  let calls = 0;
  const result = await researchAnswer({}, [], 'Tutor', null, {
    callModel: async (_, body) => {
      if (!calls++) return tool('search_arxiv', { query: 'public paper title' });
      if (calls === 2) { assert.equal(body.messages.at(-1).content[0].content.length, 1); return tool('read_arxiv_paper', { id: paper.id }); }
      assert.equal(body.messages.at(-1).content[0].is_error, true);
      return text('Paper retrieval failed.');
    }, findPapers: async () => [paper], readPaper: async () => { throw new Error('Unavailable'); },
  });
  assert.deepEqual(result.papers, []);
});
test('research stops after six retrieval calls and cannot execute app tools', async () => {
  let calls = 0, searches = 0;
  const result = await researchAnswer({}, [], 'Tutor', null, {
    callModel: async (_, body) => {
      calls++;
      assert.deepEqual(body.tools.map(t => t.name), ['search_arxiv', 'read_arxiv_paper']);
      return body.tool_choice.type === 'none' ? text('Insufficient evidence.') : tool('search_arxiv', { query: 'topic' });
    }, findPapers: async () => { searches++; return []; },
  });
  assert.equal(calls, 7); assert.equal(searches, 6); assert.equal(result.papers.length, 0);
});
test('dev routes plain Learn questions locally rather than requiring canvas context', async () => {
  const source = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf("if (['/api/learn/selection'"), source.indexOf("if (path === '/api/learn/paper')"));
  assert.doesNotMatch(block, /if \(body\.lesson_snapshot/);
  assert.match(block, /authorizedBoardApp/); assert.match(block, /return apiAsk/);
});
