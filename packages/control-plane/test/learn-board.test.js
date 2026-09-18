import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardFetch, validateBoardPlan, generateBoardPlan } from '../src/learn-board.js';
import { strictTool, REVIEW_TOOL, validateBoardReview } from '../src/learn-board-review.js';
import { searchPexels, inspectImage } from '../src/pexels.js';
import { connector } from '../../web/src/learn-board-layout.js';
import { answerBlocks } from '../../web/src/answer-blocks.js';

const object = { objectId: 'equation', lessonId: 'sigmoid-demo', runId: 'test-run', author: 'script', kind: 'equation', originalText: 'σ(x) = 1 / (1 + exp(-x))', relatedObjectIds: [], shapeIds: ['shape:eq'], renderStatus: 'complete', shapes: [{ shapeId: 'shape:eq', pageBounds: { x: 0, y: 0, w: 300, h: 30 } }] };
const snapshot = { lessonId: 'sigmoid-demo', runId: 'test-run', method: 'lesson', target: null, relatedObjects: [object], lessonContext: { topic: 'Sigmoid', currentStage: 'sigmoid', recentExplanations: ['The midpoint is 0.5.'] } };
const plan = { summary: 'Substitute zero.', needsClarification: false, blocks: [{ kind: 'equation', text: 'σ(0) = 1 / (1 + 1) = 0.5', fromObjectId: 'equation' }] };
const request = body => new Request('https://small-dev.example/api/learn/board', { method: 'POST', headers: { cookie: 'test-session', 'x-small-workspace': 'test-workspace' }, body: JSON.stringify({ app: 'demo', question: 'Why 0.5?', answer: 'exp(0) = 1', snapshot, ...body }) });

test('board plans reject invented references, mutation actions, oversized text and malformed clarification', () => {
  assert.equal(validateBoardPlan(plan, snapshot), plan);
  for (const invalid of [
    { ...plan, blocks: [{ ...plan.blocks[0], fromObjectId: 'other' }] },
    { ...plan, blocks: [{ ...plan.blocks[0], kind: 'delete' }] },
    { ...plan, blocks: [{ ...plan.blocks[0], text: 'x'.repeat(801) }] },
    { ...plan, deleteIds: ['shape:eq'] }, { ...plan, needsClarification: true },
  ]) assert.throws(() => validateBoardPlan(invalid, snapshot));
});

test('board endpoint checks real app access with the same workspace before model generation', async () => {
  let calls = 0;
  const generate = async () => { calls++; return plan; };
  const env = { CONTROL_PLANE: { fetch: async req => {
    assert.equal(new URL(req.url).pathname, '/api/apps/demo');
    assert.equal(req.headers.get('cookie'), 'test-session');
    assert.equal(req.headers.get('x-small-workspace'), 'test-workspace');
    return Response.json({ error: 'no access' }, { status: 403 });
  } } };
  assert.equal((await boardFetch(request(), env, generate)).status, 403);
  assert.equal(calls, 0);
  env.CONTROL_PLANE.fetch = async () => Response.json({ name: 'demo' });
  assert.deepEqual(await (await boardFetch(request(), env, generate)).json(), { plan });
  assert.equal(calls, 1);
  assert.equal((await boardFetch(request({ snapshot: {} }), env, generate)).status, 400);
  assert.equal(calls, 1);
  env.CONTROL_PLANE.fetch = async () => new Response('login', { status: 302 });
  assert.equal((await boardFetch(request(), env, generate)).status, 401);
  assert.equal(calls, 1);
});

test('model errors fail without returning drawing instructions', async () => {
  const env = { CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo' }) } };
  const response = await boardFetch(request(), env, async () => { throw new Error('Try again'); });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Try again' });
});

test('diagrams validate node references and equations cannot wrap', () => {
  const diagram = { kind: 'diagram', text: 'Flow', fromObjectId: null, nodes: [{ id: 'a', label: 'Input' }, { id: 'b', label: 'Output' }], edges: [{ from: 'a', to: 'b' }] };
  assert.equal(validateBoardPlan({ ...plan, blocks: [diagram] }, snapshot).blocks[0], diagram);
  // Stray references and decorated edges sanitize away instead of failing the plan.
  assert.deepEqual(validateBoardPlan({ ...plan, blocks: [{ ...diagram, edges: [{ from: 'a', to: 'invented' }, { from: 'a', to: 'b', label: 'x' }] }] }, snapshot).blocks[0].edges, [{ from: 'a', to: 'b' }]);
  assert.throws(() => validateBoardPlan({ ...plan, blocks: [{ ...plan.blocks[0], text: 'a =\nb' }] }, snapshot));
});

test('connectors avoid crossing obstacles and long diagonal arrows', () => {
  const source = { x: 0, y: 0, w: 50, h: 50 }, target = { x: 150, y: 0, w: 100, h: 60 };
  assert.ok(connector(source, target, []));
  assert.equal(connector(source, target, [{ x: 95, y: 20, w: 3, h: 10 }]), null);
  assert.equal(connector(source, { ...target, x: 700 }, []), null);
});

test('answer blocks derive from prose and keep code and math together', () => {
  assert.deepEqual(answerBlocks('Step one\n\n$$x=1$$\n\nStep two\n\n```py\nx=2\n\nprint(x)\n```'), ['Step one\n\n$$x=1$$', 'Step two\n\n```py\nx=2\n\nprint(x)\n```']);
});

test('Pexels uses server authorization and rejects untrusted image URLs', async () => {
  const photos = await searchPexels({ PEXELS_API_KEY: 'test-secret' }, 'dog', async (url, options) => {
    assert.equal(url.hostname, 'api.pexels.com');
    assert.equal(options.headers.Authorization, 'test-secret');
    return Response.json({ photos: [
      { id: 1, width: 1200, height: 800, src: { medium: 'https://images.pexels.com/photos/1/photo.jpeg' }, url: 'https://www.pexels.com/photo/1/', photographer: 'Example', alt: 'A dog' },
      { id: 2, width: 1200, height: 800, src: { medium: 'https://evil.example/photo.jpeg' }, url: 'https://www.pexels.com/photo/2/' },
    ] });
  });
  assert.equal(photos.length, 1);
  assert.equal(photos[0].photographer, 'Example');
  assert.equal(JSON.stringify(photos).includes('test-secret'), false);
  await assert.rejects(searchPexels({ PEXELS_API_KEY: 'test' }, 'dog', async () => new Response('', { status: 429 })), /429/);
});

test('image inspection accepts only retrieved photos and supplies vision content', () => {
  const photos = new Map([[1, { id: 1, src: 'https://images.pexels.com/photo.jpg' }]]);
  assert.equal(inspectImage(photos, 1)[1].source.url, photos.get(1).src);
  assert.throws(() => inspectImage(photos, 2), /returned/);
});

test('context-selected image annotations validate bounds and reject invalid paths', () => {
  const image = { kind: 'image', text: 'Illustrative object box', fromObjectId: null, photoId: 1, annotations: [
    { kind: 'box', x: 0.1, y: 0.2, w: 0.5, h: 0.6 },
    { kind: 'path', x: 0, y: 0, points: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.7 }] },
  ] };
  assert.equal(validateBoardPlan({ ...plan, blocks: [image] }, snapshot).blocks[0], image);
  for (const annotation of [{ kind: 'box', x: 0.8, y: 0, w: 0.5, h: 0.2 }, { kind: 'path', x: 0, y: 0, points: [{ x: -1, y: 0 }, { x: 1, y: 1 }] }]) {
    assert.throws(() => validateBoardPlan({ ...plan, blocks: [{ ...image, annotations: [annotation] }] }, snapshot));
  }
});

const teachingPlan = { depth: 'quick', assumedKnowledge: [], representations: ['equation'], tools: [], reason: 'Answer the narrow clarification using supplied evidence.', objective: 'Explain the midpoint', outline: ['Substitute zero', 'Simplify'], assets: ['Existing equation'] };
const readyReview = { verdict: 'ready', checks: { relevance: true, factual_support: true, asset_correspondence: true, clarity: true }, findings: [] };
const rejectedReview = { verdict: 'revise', checks: { ...readyReview.checks, factual_support: false }, findings: [{ criterion: 'factual_support', blockIndex: 0, problem: 'Unsupported quantity', requiredChange: 'Use evidence from the supplied equation.' }] };
const toolReply = (name, input) => Response.json({ content: [{ type: 'tool_use', id: crypto.randomUUID(), name, input }] });
const boardInput = { snapshot, question: 'Why is this 0.5?', answer: 'Substitute zero', model: 'sonnet-5' };

test('invalid teaching-plan length receives exact feedback once, then still undergoes factual review', async () => {
  let planning = 0, reviews = 0;
  const stages = [];
  const result = await generateBoardPlan({}, boardInput, { onProgress: stage => stages.push(stage), callModel: async (_, body) => {
    const name = body.tool_choice.name || 'explain_on_canvas';
    if (name === 'plan_explanation') {
      planning++;
      if (planning === 1) return toolReply(name, { ...teachingPlan, objective: 'x'.repeat(301) });
      assert.match(JSON.stringify(body.messages.at(-1)), /teachingPlan.objective: maximum 300 characters; received 301/);
      return toolReply(name, teachingPlan);
    }
    if (name === 'review_explanation') { reviews++; return toolReply(name, readyReview); }
    return toolReply(name, plan);
  } });
  assert.equal(planning, 2); assert.equal(reviews, 1); assert.equal(result.review.passes, 1);
  assert.ok(stages.some(stage => stage.includes('teachingPlan.objective')));
});

test('format correction is bounded across the whole workflow, not repeated for each stage', async () => {
  const calls = [];
  await assert.rejects(generateBoardPlan({}, boardInput, { callModel: async (_, body) => {
    const name = body.tool_choice.name || 'explain_on_canvas'; calls.push(name);
    if (calls.length === 1) return toolReply(name, { ...teachingPlan, outline: [] });
    if (name === 'plan_explanation') return toolReply(name, teachingPlan);
    return toolReply(name, { ...plan, blocks: [{ ...plan.blocks[0], fromObjectId: 'invented' }] });
  } }), /canvas.blocks\[0\].fromObjectId/);
  assert.deepEqual(calls, ['plan_explanation', 'plan_explanation', 'explain_on_canvas']);
});

test('a failed format repair stops before drawing or factual review', async () => {
  let calls = 0;
  await assert.rejects(generateBoardPlan({}, boardInput, { callModel: async (_, body) => {
    calls++; return toolReply(body.tool_choice.name, { ...teachingPlan, outline: [] });
  } }), /teachingPlan.outline: requires at least 1 items; received 0/);
  assert.equal(calls, 2);
});

test('truncated planning output gets one correction with enough output budget', async () => {
  let planning = 0;
  const stages = [];
  await generateBoardPlan({}, boardInput, { onProgress: stage => stages.push(stage), callModel: async (_, body) => {
    const name = body.tool_choice.name || 'explain_on_canvas';
    if (name === 'plan_explanation') {
      if (++planning === 1) return Response.json({ stop_reason: 'max_tokens', content: [{ type: 'tool_use', id: 'truncated', name, input: { objective: 'Incomplete' } }] });
      assert.equal(body.max_tokens, 2400);
      return toolReply(name, teachingPlan);
    }
    return toolReply(name, name === 'review_explanation' ? readyReview : plan);
  } });
  assert.equal(planning, 2);
  assert.ok(stages.some(s => s.includes('1200-token limit')));
});

test('review accepts the first candidate without a revision', async () => {
  const calls = [], stages = [];
  const result = await generateBoardPlan({}, boardInput, { onProgress: s => stages.push(s), callModel: async (_, body) => {
    const name = body.tool_choice.name || 'explain_on_canvas'; calls.push(name);
    return toolReply(name, name === 'plan_explanation' ? teachingPlan : name === 'review_explanation' ? readyReview : plan);
  } });
  assert.deepEqual(calls, ['plan_explanation', 'explain_on_canvas', 'review_explanation']);
  assert.equal(result.review.passes, 1);
  assert.ok(stages.includes('Reviewing explanation (1/2)...'));
});

test('review provides feedback to exactly one revision and verifies it', async () => {
  let reviews = 0, drafts = 0;
  const result = await generateBoardPlan({}, boardInput, { callModel: async (_, body) => {
    const name = body.tool_choice.name || 'explain_on_canvas';
    if (name === 'plan_explanation') return toolReply(name, teachingPlan);
    if (name === 'review_explanation') {
      reviews++;
      const context = JSON.parse(body.messages[0].content[0].text);
      if (reviews === 2) assert.deepEqual(context.previousReview, rejectedReview);
      return toolReply(name, reviews === 1 ? rejectedReview : readyReview);
    }
    drafts++;
    if (drafts === 2) {
      assert.equal(body.messages.length, 1);
      const correction = JSON.parse(body.messages[0].content[0].text);
      assert.deepEqual(correction.review, rejectedReview);
      assert.deepEqual(correction.rejectedPlan, plan);
      assert.equal(correction.answer, undefined);
      assert.match(correction.instruction, /every affected block/);
    }
    return toolReply(name, plan);
  } });
  assert.equal(result.review.passes, 2); assert.equal(drafts, 2); assert.equal(reviews, 2);
});

test('a second rejection stops without returning a drawing, and evaluator failure fails closed', async () => {
  let reviews = 0, drafts = 0;
  await assert.rejects(generateBoardPlan({}, boardInput, { callModel: async (_, body) => {
    const name = body.tool_choice.name || 'explain_on_canvas';
    if (name === 'plan_explanation') return toolReply(name, teachingPlan);
    if (name === 'review_explanation') { reviews++; return toolReply(name, rejectedReview); }
    drafts++; return toolReply(name, plan);
  } }), /did not pass review/);
  assert.equal(reviews, 2); assert.equal(drafts, 2);
  await assert.rejects(generateBoardPlan({}, boardInput, { callModel: async (_, body) => {
    const name = body.tool_choice.name || 'explain_on_canvas';
    return toolReply(name, name === 'plan_explanation' ? teachingPlan : name === 'review_explanation' ? { ...readyReview, checks: {} } : plan);
  } }), /Invalid explanation review/);
});

test('the evaluator receives inspected photo pixels and actual annotations', async () => {
  let step = 0;
  const photo = { id: 1, width: 1200, height: 800, src: 'https://images.pexels.com/example.jpg', url: 'https://www.pexels.com/photo/1/', alt: 'Example', photographer: 'Example' };
  const imagePlan = { ...plan, blocks: [{ kind: 'image', text: 'Example', fromObjectId: null, photoId: 1, annotations: [{ kind: 'box', x: 0.1, y: 0.2, w: 0.5, h: 0.6 }] }] };
  const responses = [['plan_explanation', teachingPlan], ['search_pexels', { query: 'example' }], ['inspect_image', { photoId: 1 }], ['explain_on_canvas', imagePlan], ['review_explanation', readyReview]];
  const result = await generateBoardPlan({ PEXELS_API_KEY: 'test' }, boardInput, { searchPhotos: async () => [photo], callModel: async (_, body) => {
    if (step === 4) {
      assert.ok(body.messages[0].content.some(c => c.type === 'image' && c.source.url === photo.src));
      assert.match(body.messages[0].content[0].text, /annotations/);
    }
    return toolReply(...responses[step++]);
  } });
  assert.equal(result.blocks[0].photo.id, 1); assert.equal(step, 5);
});

test('streamed workflow exposes stages and emits a plan only after success', async () => {
  const env = { CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo' }) } };
  const req = request(); req.headers.set('accept', 'text/event-stream');
  const response = await boardFetch(req, env, async (_, __, { onProgress }) => { onProgress('Reviewing explanation (1/2)...'); return plan; });
  const text = await response.text();
  assert.ok(text.indexOf('event: progress') < text.indexOf('event: plan'));
  const bad = request(); bad.headers.set('accept', 'text/event-stream');
  const failure = await boardFetch(bad, env, async () => { throw new Error('Review failed'); });
  const failureText = await failure.text();
  assert.match(failureText, /event: error/); assert.doesNotMatch(failureText, /event: plan/);
});

test('strict review schemas require verdict/checks while retaining local limit validation', () => {
  const tool = strictTool(REVIEW_TOOL);
  assert.equal(tool.strict, true);
  assert.deepEqual(tool.input_schema.required, ['verdict', 'checks', 'findings']);
  assert.equal(tool.input_schema.properties.findings.maxItems, undefined);
  assert.match(tool.input_schema.properties.findings.description, /maxItems: 6/);
});

test('concrete review findings override a contradictory pass checkbox', () => {
  const result = validateBoardReview({ ...rejectedReview, verdict: 'ready', checks: { ...readyReview.checks } }, 1);
  assert.equal(result.verdict, 'revise'); assert.equal(result.checks.factual_support, false);
});
