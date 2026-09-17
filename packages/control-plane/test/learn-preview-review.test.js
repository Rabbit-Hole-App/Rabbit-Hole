import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealPreview, openPreview, previewImages } from '../src/learn-preview-review.js';
import { sign, sha256 } from '../src/token.js';
import { generateBoardPlan } from '../src/learn-board.js';

const access = { email: 'owner@example.test', org: 'example' }, secret = 'test-preview-secret';
const paper = { id: '1506.02640v5', title: 'Example paper', pdfUrl: 'https://arxiv.org/pdf/1506.02640v5' };
const plan = { summary: 'A diagram', needsClarification: false, blocks: [{ kind: 'paper_figure', text: 'Figure', fromObjectId: null, citation: { paperId: paper.id, page: 1, label: 'Figure 1' }, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }] };
const input = { app: 'example', question: 'Explain the diagram', answer: 'Prior answer', snapshot: { target: null, relatedObjects: [] }, paperIds: [paper.id] };
const ready = { verdict: 'ready', checks: { relevance: true, factual_support: true, asset_correspondence: true, clarity: true }, findings: [] };
const reject = { ...ready, verdict: 'revise', checks: { ...ready.checks, asset_correspondence: false }, findings: [{ criterion: 'asset_correspondence', blockIndex: 0, problem: 'Label clipped', requiredChange: 'Include the full label' }] };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const previews = [{ blockIndex: 0, src: image }];
const tool = (name, input) => Response.json({ content: [{ type: 'tool_use', id: 'call', name, input }] });

test('preview continuations bind state, user, workspace, app and expiry', async () => {
  const state = { input, plan, pass: 1 };
  const c = await sealPreview(state, access, secret);
  assert.deepEqual(await openPreview(c, access, 'example', secret), state);
  for (const [continuation, user, app] of [[{ ...c, state: { ...state, pass: 2 } }, access, 'example'], [c, { ...access, email: 'other@example.test' }, 'example'], [c, { ...access, org: 'other' }, 'example'], [c, access, 'other']]) await assert.rejects(openPreview(continuation, user, app, secret));
  const expired = await sign({ purpose: 'learn-figure-review', ...access, app: 'example', hash: await sha256(JSON.stringify(state)), exp: 1 }, secret);
  await assert.rejects(openPreview({ state, token: expired }, access, 'example', secret));
});

test('each preview is bounded PNG pixels for exactly the requested figure', () => {
  assert.equal(previewImages(previews, plan)[1].source.media_type, 'image/png');
  assert.throws(() => previewImages([], plan));
  assert.throws(() => previewImages([{ blockIndex: 2, src: image }], plan));
  assert.throws(() => previewImages([{ blockIndex: 0, src: 'https://example.test/image.png' }], plan));
  assert.throws(() => previewImages([{ blockIndex: 0, src: 'data:image/png;base64,YWJj' }], plan));
});

test('draft pauses before review; each revision requires fresh pixels; review count survives continuation', async () => {
  const calls = [];
  let reviews = 0;
  const callModel = async (_, body) => {
    const name = body.tool_choice.name || 'explain_on_canvas'; calls.push(name);
    if (name === 'plan_explanation') return tool(name, { depth: 'quick', assumedKnowledge: [], representations: ['equation'], tools: [], reason: 'Answer the narrow clarification using supplied evidence.', objective: 'Explain', outline: ['Diagram'], assets: ['Paper'] });
    if (name === 'review_explanation') {
      reviews++;
      assert.ok(body.messages[0].content.some(c => c.type === 'image' && c.source.type === 'base64'));
      assert.ok(body.messages[0].content.some(c => c.type === 'document'));
      return tool(name, reviews === 1 ? reject : ready);
    }
    return tool(name, plan);
  };
  const options = { renderPreviews: true, readPaper: async () => paper, callModel };
  const first = await generateBoardPlan({}, input, options);
  assert.ok(first.previewPlan); assert.equal(reviews, 0);
  const second = await generateBoardPlan({}, input, { ...options, continuation: first.state, previews });
  assert.ok(second.previewPlan); assert.equal(second.state.pass, 2); assert.equal(reviews, 1);
  const final = await generateBoardPlan({}, input, { ...options, continuation: second.state, previews });
  assert.equal(final.review.passes, 2); assert.equal(reviews, 2);
  assert.equal(calls.filter(c => c === 'plan_explanation').length, 1);
});
