import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arxivId, parseArxiv, searchArxiv, readArxivPaper, fetchArxivPdf } from '../src/arxiv.js';
import { paperFetch, validateBoardPlan, generateBoardPlan } from '../src/learn-board.js';
const xml = '<feed><entry><id>http://arxiv.org/abs/1506.02640v5</id><title>Example &amp; Paper</title><summary>Example abstract</summary><author><name>A. Researcher</name></author></entry></feed>';
test('arXiv IDs and retrieved references cannot redirect to arbitrary hosts', () => {
  assert.equal(arxivId('https://arxiv.org/pdf/1506.02640v5.pdf'), '1506.02640v5');
  assert.equal(arxivId('hep-th/9901001'), 'hep-th/9901001');
  for (const id of ['https://evil.example/pdf/1506.02640', '../../private', 'https://arxiv.org@evil.example/pdf/1506.02640', '1506.02640?other=1']) assert.throws(() => arxivId(id));
  const [paper] = parseArxiv(xml); assert.equal(paper.title, 'Example & Paper'); assert.equal(paper.pdfUrl, 'https://arxiv.org/pdf/1506.02640v5');
});
test('search and direct read use arXiv metadata; failed requests do not invent papers', async () => {
  const fetcher = async url => { assert.equal(new URL(url).hostname, 'export.arxiv.org'); return new Response(xml); };
  assert.equal((await searchArxiv('ti:Example', fetcher)).length, 1);
  assert.equal((await readArxivPaper('1506.02640', fetcher)).id, '1506.02640v5');
  await assert.rejects(readArxivPaper('1506.02640v1', fetcher), /not found/);
  await assert.rejects(searchArxiv('test', async () => new Response('', { status: 429 })), /429/);
});
test('PDF transport checks authentication, PDF signature, and size', async () => {
  assert.equal(new TextDecoder().decode(await fetchArxivPdf('1506.02640', async () => new Response('%PDF-test'))), '%PDF-test');
  await assert.rejects(fetchArxivPdf('1506.02640', async () => new Response('<html>error</html>')), /not return a PDF/);
  await assert.rejects(fetchArxivPdf('1506.02640', async () => new Response('', { headers: { 'Content-Length': '99999999' } })), /12 MB/);
  const response = await paperFetch(new Request('https://dev.example/api/learn/paper?app=demo&id=1506.02640'), { CONTROL_PLANE: { fetch: async () => new Response('', { status: 403 }) } });
  assert.equal(response.status, 403);
});
test('paper figures require a page and valid crop; unread citations are rejected', async () => {
  const snapshot = { target: null, relatedObjects: [] };
  const block = { kind: 'paper_figure', text: 'A figure', fromObjectId: null, citation: { paperId: '1506.02640v5', page: 1, label: 'Figure 1' }, crop: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 } };
  const plan = { summary: 'Figure', needsClarification: false, blocks: [block] };
  assert.equal(validateBoardPlan(plan, snapshot), plan);
  assert.throws(() => validateBoardPlan({ ...plan, blocks: [{ ...block, crop: { ...block.crop, w: 1 } }] }, snapshot));
  await assert.rejects(generateBoardPlan({}, { snapshot, question: 'Example', answer: 'Example' }, { callModel: async (_, body) => Response.json({ content: [{ type: 'tool_use', id: 'test', name: body.tool_choice.name || 'explain_on_canvas', input: body.tool_choice.name === 'plan_explanation' ? { depth: 'conceptual', assumedKnowledge: [], representations: ['text'], tools: ['read_arxiv_paper'], reason: 'Read the requested paper to ground the explanation', objective: 'Example', outline: ['Figure'], assets: ['Paper'] } : plan }] }) }), /unread paper/);
});

test('paper review sees the PDF and references resolve only from papers actually read', async () => {
  const paper = parseArxiv(xml)[0];
  const snapshot = { target: null, relatedObjects: [] };
  const plan = { summary: 'Paper explanation', needsClarification: false, blocks: [{ kind: 'text', text: 'A cited explanation', fromObjectId: null, citation: { paperId: paper.id, page: 1, label: 'Introduction' } }] };
  const review = { verdict: 'ready', checks: { relevance: true, factual_support: true, asset_correspondence: true, clarity: true }, findings: [] };
  let step = 0;
  const responses = [['plan_explanation', { depth: 'conceptual', assumedKnowledge: [], representations: ['text'], tools: ['read_arxiv_paper'], reason: 'Read the requested paper to ground the explanation', objective: 'Explain paper', outline: ['Main result'], assets: ['Paper'] }], ['read_arxiv_paper', { id: paper.id }], ['explain_on_canvas', plan], ['review_explanation', review]];
  const result = await generateBoardPlan({}, { snapshot, question: 'Explain paper', answer: 'Read the source' }, { readPaper: async () => paper, callModel: async (_, body) => {
    if (step === 3) assert.ok(body.messages[0].content.some(c => c.type === 'document' && c.source.url === paper.pdfUrl));
    const [name, input] = responses[step++];
    return Response.json({ content: [{ type: 'tool_use', id: `call-${step}`, name, input }] });
  } });
  assert.equal(result.blocks[0].paper.title, paper.title); assert.equal(step, 4);
});


test('papers carried from chat are read before planning and available to review', async () => {
  const paper = parseArxiv(xml)[0];
  const snapshot = { target: null, relatedObjects: [] };
  const plan = { summary: 'Cited explanation', needsClarification: false, blocks: [{ kind: 'text', text: 'Paper result', fromObjectId: null, citation: { paperId: paper.id, page: 1, label: 'Introduction' } }] };
  let reads = 0;
  const result = await generateBoardPlan({}, { snapshot, question: 'Explain it', answer: 'Paper answer', paperIds: [paper.id] }, {
    readPaper: async id => { reads++; assert.equal(id, paper.id); return paper; },
    callModel: async (_, body) => {
      assert.ok(body.messages[0].content.some(block => block.type === 'document' && block.source.url === paper.pdfUrl));
      const name = body.tool_choice.name || 'explain_on_canvas';
      const input = name === 'plan_explanation' ? { depth: 'conceptual', assumedKnowledge: [], representations: ['text'], tools: ['read_arxiv_paper'], reason: 'Read the requested paper to ground the explanation', objective: 'Explain', outline: ['Result'], assets: ['Supplied paper'] } : name === 'review_explanation' ? { verdict: 'ready', checks: { relevance: true, factual_support: true, asset_correspondence: true, clarity: true }, findings: [] } : plan;
      return Response.json({ content: [{ type: 'tool_use', id: name, name, input }] });
    },
  });
  assert.equal(reads, 1); assert.equal(result.blocks[0].paper.id, paper.id);
});


test('arXiv fetch uses the Cloudflare-supported manual redirect mode and rejects redirects', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, 'manual');
    return new Response('', { status: 302, headers: { Location: 'https://elsewhere.invalid/' } });
  };
  try { await assert.rejects(searchArxiv('redirect transport test'), /302/); }
  finally { globalThis.fetch = original; }
});
