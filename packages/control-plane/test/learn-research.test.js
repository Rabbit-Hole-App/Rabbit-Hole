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
test('research stops after eight retrieval calls and cannot execute app tools', async () => {
  let calls = 0, searches = 0;
  const result = await researchAnswer({}, [], 'Tutor', null, {
    callModel: async (_, body) => {
      calls++;
      assert.deepEqual(body.tools.map(t => t.name), ['search_arxiv', 'read_arxiv_paper']);
      return body.tool_choice.type === 'none' ? text('Insufficient evidence.') : tool('search_arxiv', { query: 'topic' });
    }, findPapers: async () => { searches++; return []; },
  });
  assert.equal(calls, 9); assert.equal(searches, 8); assert.equal(result.papers.length, 0);
});
test('dev routes plain Learn questions locally rather than requiring canvas context', async () => {
  const source = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf("if (['/api/learn/selection'"), source.indexOf("if (path === '/api/learn/paper')"));
  assert.doesNotMatch(block, /if \(body\.lesson_snapshot/);
  assert.match(block, /authorizedBoardApp/); assert.match(block, /return apiAsk/);
});

// Putting a paper in front of the learner. The tool only exists once a paper has
// been read, so the page it opens on comes from a real document.
test('show_paper is not offered until a paper has been read', async () => {
  let offered = null;
  await researchAnswer({}, [], 'Tutor', null, {
    callModel: async (_, body) => { offered = body.tools.map(t => t.name); return text('No paper needed.'); },
  });
  assert.ok(!offered.includes('show_paper'), offered.join(','));
});

test('after reading, the agent can open that paper at a page', async () => {
  let calls = 0, offered = null;
  const result = await researchAnswer({}, [{ role: 'user', content: 'Show me figure 2' }], 'Tutor', null, {
    callModel: async (_, body) => {
      offered = body.tools.map(t => t.name);
      if (!calls++) return tool('read_arxiv_paper', { id: paper.id });
      if (calls === 2) return tool('show_paper', { id: paper.id, page: 4 });
      return text('Figure 2 is on the page now open.');
    },
    readPaper: async () => paper,
  });
  assert.ok(offered.includes('show_paper'), 'offered once a paper is read');
  assert.deepEqual(result.shown, { id: paper.id, page: 4, title: paper.title, pdfUrl: paper.pdfUrl });
  assert.equal(result.answer, 'Figure 2 is on the page now open.');
});

test('a paper it never read cannot be opened, and the refusal goes back to the model', async () => {
  let calls = 0;
  const result = await researchAnswer({}, [], 'Tutor', null, {
    callModel: async (_, body) => {
      if (!calls++) return tool('read_arxiv_paper', { id: paper.id });
      if (calls === 2) return tool('show_paper', { id: '1706.03762', page: 1 });
      const back = body.messages.at(-1).content[0];
      assert.equal(back.is_error, true);
      assert.match(back.content[0].text, /Read the paper/);
      return text('I will read it first.');
    },
    readPaper: async () => paper,
  });
  assert.equal(result.shown, null, 'nothing is opened');
});

test('nothing is shown when the tool is never called', async () => {
  const result = await researchAnswer({}, [], 'Tutor', null, { callModel: async () => text('Plain answer.') });
  assert.equal(result.shown, null);
});
test('a model HTTP failure names the status and the API reason, cut to 160 characters', async () => {
  await assert.rejects(researchAnswer({}, [], 'Tutor', null, { callModel: async () => Response.json({ error: { message: 'overloaded' } }, { status: 529 }) }),
    { message: 'Learn answer unavailable (model HTTP 529: overloaded)' });
  await assert.rejects(researchAnswer({}, [], 'Tutor', null, { callModel: async () => new Response('down', { status: 503 }) }),
    { message: 'Learn answer unavailable (model HTTP 503)' });
});

// docs/features/canvas-skeleton-cards.md: a show tool that validated says which card is coming, so the page
// holds its place; a refused show and every other step carry no card.
test('a validated show reports its card on progress; a refused one never does', async () => {
  const stages = [];
  let calls = 0, videos = 0;
  const runTool = async name => { if (name === 'show_video' && videos++) throw new Error('One video per answer'); return { opened: true }; };
  const tools = ['search_wikipedia', 'show_wikipedia', 'show_video'].map(name => ({ name }));
  await researchAnswer({}, [], 'Tutor', null, {
    tools, runTool, readPaper: async () => paper,
    onProgress: async (stage, card) => stages.push(card ? [stage, card] : [stage]),
    callModel: async () => [
      tool('read_arxiv_paper', { id: paper.id }), tool('show_paper', { id: paper.id, page: 2 }), tool('search_wikipedia', { query: 'x' }),
      tool('show_wikipedia', { title: 'X' }), tool('show_video', { videoId: 'v' }), tool('show_video', { videoId: 'w' }), text('Done.'),
    ][calls++],
  });
  assert.deepEqual(stages.filter(entry => entry[1]), [['Opening YOLO...', 'paper'], ['show wikipedia...', 'wiki'], ['show video...', 'video']]);
  assert.ok(stages.some(([stage]) => stage === 'search wikipedia...'), 'other tools still report before they run');
  assert.ok(stages.some(([stage, card]) => /^Retrieval failed: One video/.test(stage) && !card), 'the refused second video has no card');
});
test('the ask stream forwards a progress card and leaves other progress events as they were', () => {
  const source = readFileSync(new URL('../src/ask.js', import.meta.url), 'utf8');
  assert.match(source, /onProgress: \(stage, card\) => send\('progress', card \? \{ stage, card \} : \{ stage \}\)/);
});

// Task 11c-A ruling 3: arxiv: false (the Tutor repository_context handoff) offers only the caller's tools and no research
// system text; every other caller keeps the default, which is pinned here beside the shared-canvas and prompt tests.
test('the default keeps the paper tools and the research system text for every existing caller', async () => {
  let sent;
  await researchAnswer({}, [], 'Tutor', null, { tools: [{ name: 'read_source' }], runTool: async () => ({}), callModel: async (_, body) => { sent = body; return text('ok'); } });
  assert.deepEqual(sent.tools.map(t => t.name), ['read_source', 'search_arxiv', 'read_arxiv_paper']);
  assert.ok(sent.system.includes('search_arxiv'), 'LEARN_RESEARCH_SYSTEM rides by default');
});
test('arxiv: false sends only the caller tools and Tutor system text, and never runs a paper tool the model names anyway', async () => {
  const sent = [], ran = [];
  const result = await researchAnswer({}, [], 'Tutor', null, {
    arxiv: false, tools: [{ name: 'read_source' }], runTool: async () => ({ ok: true }),
    callModel: async (_, body) => { sent.push(body); return sent.length === 1 ? tool('search_arxiv', { query: 'topic' }) : text('From the source only.'); },
    findPapers: async () => { ran.push('search'); return []; }, readPaper: async () => { ran.push('read'); return paper; },
  });
  assert.equal(result.answer, 'From the source only.');
  for (const body of sent) { assert.deepEqual(body.tools.map(t => t.name), ['read_source']); assert.equal(body.system, 'Tutor'); }
  assert.deepEqual(ran, [], 'no paper tool ran');
  const refused = sent[1].messages.at(-1).content[0];
  assert.deepEqual([refused.is_error, refused.content[0].text], [true, 'Unknown Learn tool'], 'an unoffered paper tool is refused as unknown');
});
