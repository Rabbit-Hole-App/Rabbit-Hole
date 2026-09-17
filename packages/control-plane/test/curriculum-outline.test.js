import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createCurriculumApi } from '../../../scripts/curriculum-api.mjs';
import { validateOutline } from '../src/curriculum-outline.js';
import { OUTLINE_EXAMPLES } from '../src/curriculum-outline-examples.js';
import { REVIEW_CRITERIA } from '../src/curriculum-evaluator.js';

// Different subject from the real image-model experiment; fixtures test the API contract.
const input = { brief: { audience: 'Beginners', goal: 'Understand scheduling methods', knowledge: 'None', duration: '20 minutes' },
  app: { name: 'shift-planner', evidence: 'Uses an optimization library to allocate shifts.' } };
const plan = { title: 'Scheduling foundations', modules: [
  { title: 'Modeling', lessons: [{ title: 'Constraints', topics: ['Decision variables', 'Feasible schedules'] }] },
  { title: 'Optimization', lessons: [{ title: 'Choosing a schedule', topics: ['Objective functions', 'Trade-offs'] }] },
], prerequisites: [], scopeNotes: [], duration: { fit: 'needs-more-time', explanation: 'Twenty minutes permits an overview.' }, ownerQuestions: [] };
const token = 'test-local-curriculum-api-token';
const acceptedReview = () => ({ evaluation: {
    verdict: 'ready', checks: REVIEW_CRITERIA.map(criterion => ({ criterion, result: 'pass', findingIds: [] })),
    findings: [], resolvedFindingIds: [], ownerDecisions: [],
} });
async function api(t, generate, evaluate = async () => acceptedReview()) {
  const server = createCurriculumApi({ token, generate, evaluate });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); server.closeAllConnections(); });
  return (body = input, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/curriculum`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}

test('API rejects unauthorized, browser-origin, and incomplete requests before generating', async t => {
  let calls = 0;
  const post = await api(t, async () => { calls++; return { curriculum: plan }; });
  assert.equal((await post(input, { Authorization: 'bad' })).status, 403);
  assert.equal((await post(input, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await post({ app: input.app })).status, 400);
  assert.equal((await post({ ...input, app: { ...input.app, evidence: 'x'.repeat(91000) } })).status, 413);
  assert.equal(calls, 0);
});

test('API returns hierarchical subjects and duration conflict without forcing the old time budget', async t => {
  const post = await api(t, async request => {
    assert.deepEqual(request.brief, input.brief);
    assert.equal(request.app.evidence, input.app.evidence);
    return { curriculum: plan, model: 'test-model', usage: { output_tokens: 100 } };
  });
  const response = await post(); assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.curriculum, plan);
  assert.equal(body.generation.model, 'test-model');
});

test('API recovers after provider or invalid-output failures', async t => {
  let calls = 0;
  const post = await api(t, async () => {
    if (++calls === 1) throw new Error('secret provider internals');
    return { curriculum: calls === 2 ? { ...plan, modules: [] } : plan };
  });
  const first = await post(); assert.equal(first.status, 502);
  assert.doesNotMatch(await first.text(), /secret provider internals/);
  assert.equal((await post()).status, 502);
  assert.equal((await post()).status, 200);
});

test('API admits one model call at a time', async t => {
  let release, started;
  const running = new Promise(r => { started = r; });
  const waiting = new Promise(r => { release = r; });
  const post = await api(t, async () => { started(); await waiting; return { curriculum: plan }; });
  const first = post(); await running;
  try { assert.equal((await post()).status, 429); } finally { release(); }
  assert.equal((await first).status, 200);
});

test('outline rejects lesson-delivery payloads', () => {
  const malformed = structuredClone(plan);
  malformed.modules[0].lessons[0].pages = ['An animation'];
  assert.throws(() => validateOutline(malformed), /not lesson content/);
});

test('a small bullet-count overrun does not discard an otherwise usable proposal', () => {
  const candidate = structuredClone(plan);
  candidate.modules[0].lessons[0].topics = ['Variables', 'Constraints', 'Feasibility', 'Objectives', 'Trade-offs'];
  candidate.scopeNotes = ['Note one', 'Note two', 'Note three', 'Note four'];
  assert.equal(validateOutline(candidate).modules[0].lessons[0].topics.length, 5);
});

test('illustrative example responses satisfy the actual API output contract', () => {
  for (const example of OUTLINE_EXAMPLES) {
    assert.deepEqual(validateOutline(example.output), example.output, example.output.title);
  }
});

test('HTTP success exposes exhaustion and unresolved findings rather than approval', async t => {
  const post = await api(t, async () => ({ curriculum: plan }), async () => {
    const { evaluation } = acceptedReview();
    evaluation.verdict = 'revise';
    evaluation.checks[0].result = 'fail'; evaluation.checks[0].findingIds = ['F1'];
    evaluation.findings = [{ id: 'F1', severity: 'blocking', location: 'Module 1', problem: 'Missing required subject',
      basis: 'The stated goal requires it', requiredChange: 'Cover the required subject' }];
    return { evaluation };
  });
  const response = await post(); assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.workflow.status, 'exhausted'); assert.equal(result.workflow.history.length, 3);
  assert.equal(result.generation.calls.length, 6);
  assert.equal(result.workflow.history[2].evaluation.findings[0].severity, 'blocking');
});

test('invalid evaluator output returns an error and releases the API for a new request', async t => {
  let calls = 0;
  const post = await api(t, async () => ({ curriculum: plan }), async () => {
    if (++calls === 1) return { evaluation: { verdict: 'ready' } };
    return acceptedReview();
  });
  const failed = await post(); assert.equal(failed.status, 502);
  assert.equal((await failed.json()).workflow, undefined);
  const recovered = await post(); assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).workflow.status, 'ready');
  assert.equal(calls, 2);
});
