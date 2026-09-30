// Which model each Learn task actually calls (C4, models-1 in
// docs/features/learn-cleanup.md). Every request goes through the real
// dispatchers (anthropic, planModel) to a recording fetch, so the provider,
// model id and fallback mode are what the wire would carry, not what a stub
// was told. The repository chat row lives in repositories.test.js and the
// apiAsk key resolution in learn-chat.test.js, beside their fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askStream, planModel } from '../src/ask.js';
import { generateArtifact } from '../src/learn-artifact.js';
import { generateBoardPlan } from '../src/learn-board.js';
import { assessAnswer } from '../src/learn-grade-routes.js';
import { LEARN_TASKS, askModel, MESSAGE_LIMIT, MENTION_LIMIT, HISTORY_TURNS, PAPERS_PER_ANSWER, RESEARCH_STEPS, ARTIFACT_REPAIRS, BOARD_DRAFT_TURNS, BOARD_REVIEW_PASSES } from '../src/learn-models.js';

const object = { objectId: 'equation', lessonId: 'sigmoid-demo', runId: 'test-run', author: 'script', kind: 'equation', originalText: 'σ(x) = 1 / (1 + exp(-x))', relatedObjectIds: [], shapeIds: ['shape:eq'], renderStatus: 'complete', shapes: [{ shapeId: 'shape:eq', pageBounds: { x: 0, y: 0, w: 300, h: 30 } }] };
const snapshot = { lessonId: 'sigmoid-demo', runId: 'test-run', method: 'lesson', target: null, relatedObjects: [object], lessonContext: { topic: 'Sigmoid', currentStage: 'sigmoid', recentExplanations: ['The midpoint is 0.5.'] } };
const inputs = {
  plan_explanation: { depth: 'quick', assumedKnowledge: [], representations: ['equation'], tools: [], reason: 'Answer the narrow clarification using supplied evidence.', objective: 'Explain the midpoint', outline: ['Substitute zero', 'Simplify'], assets: ['Existing equation'] },
  explain_on_canvas: { summary: 'Substitute zero.', needsClarification: false, blocks: [{ kind: 'equation', text: 'σ(0) = 1 / (1 + 1) = 0.5', fromObjectId: 'equation' }] },
  review_explanation: { verdict: 'ready', checks: { relevance: true, factual_support: true, asset_correspondence: true, clarity: true }, findings: [] },
  make_quiz: { question: 'What does softmax output sum to?', options: [{ text: '1', correct: true }, { text: '0', correct: false }], why: 'It normalises.' },
};

// Records every model request and answers it in the provider's own shape: the
// forced tool when one is forced, the task's tool for `any`, text otherwise.
function recordFetch(t) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body);
    const headers = options.headers || {};
    const host = new URL(url).host;
    calls.push({ host, model: body.model, fallbacks: body.fallbacks, beta: headers['anthropic-beta'] || null, maxTokens: body.max_tokens, body });
    const choice = body.tool_choice;
    const offered = (body.tools || []).map(tool => tool.name || tool.function?.name);
    const name = choice?.name || choice?.function?.name || ((choice?.type === 'any' || choice === 'required') ? offered.find(n => inputs[n]) : null);
    if (host === 'bridge.test') return Response.json({ billing: 'claude-subscription', content: name ? [{ type: 'tool_use', id: `c${calls.length}`, name, input: inputs[name] }] : [{ type: 'text', text: 'ok' }], stop_reason: name ? 'tool_use' : 'end_turn' });
    if (host === 'api.openai.com') return Response.json({ choices: [{ finish_reason: name ? 'tool_calls' : 'stop', message: name ? { tool_calls: [{ id: `c${calls.length}`, function: { name, arguments: JSON.stringify(inputs[name]) } }] } : { content: 'ok' } }] });
    return Response.json({ model: body.model || 'claude-opus-5', content: name ? [{ type: 'tool_use', id: `c${calls.length}`, name, input: inputs[name] }] : [{ type: 'text', text: 'ok' }], stop_reason: name ? 'tool_use' : 'end_turn' });
  };
  return calls;
}
// Production-shaped DB: records every statement; Learn tasks pass org null,
// so no org_ai row may be read (models-14).
const recordingDb = () => { const sql = []; return { sql, prepare: text => { sql.push(text); return { bind: () => ({ first: async () => ({ provider: 'bedrock', model: 'x', bedrock_role_arn: 'arn' }) }) }; } }; };

const chat = async (env, model) => {
  const response = askStream(env, 'context', [], 'What is a sigmoid?', async () => {}, {}, [], null, model, null, 'system', { papers: [] });
  const events = await response.text();
  assert.match(events, /event: chunk/);
};
const artifact = async env => assert.equal((await generateArtifact(env, { command: 'practice', args: 'multiple choice' })).result, 'artifact');
const board = async (env, extra = {}) => assert.equal((await generateBoardPlan(env, { snapshot, question: 'Why is this 0.5?', answer: 'Substitute zero', ...extra })).review.passes, 1);
const shape = calls => calls.map(({ host, model, fallbacks, beta }) => ({ host, model, fallbacks, beta }));
const auto = { host: 'api.anthropic.com', model: 'claude-opus-5', fallbacks: 'default', beta: 'server-side-fallback-2026-07-01' };
const pinned = model => ({ host: 'api.anthropic.com', model, fallbacks: undefined, beta: null });
const openai = model => ({ host: 'api.openai.com', model, fallbacks: undefined, beta: null });

test('chat and grading on Auto run claude-opus-5 with the server-side fallback, with or without an OpenAI key', async t => {
  for (const env of [{ ANTHROPIC_API_KEY: 'a' }, { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', LEARN_PLAN_MODEL: 'gpt-4.1-mini' }]) {
    const calls = recordFetch(t), DB = recordingDb();
    await chat({ ...env, DB }, null);
    assert.deepEqual(shape(calls), [auto]);
    assert.equal(calls[0].maxTokens, 2400);
    assert.deepEqual(DB.sql, []);
  }
  // The grader posts only the block's fields to /api/learn/assess, which has no model key.
  const grade = readFileSync(new URL('../../web/src/learn-grade.js', import.meta.url), 'utf8');
  assert.match(grade, /fetch\('\/api\/learn\/assess'[^]*body: JSON\.stringify\(\{ app, \.\.\.assessBody\(block, answer\) \}\)/);
  for (const env of [{ ANTHROPIC_API_KEY: 'a' }, { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', LEARN_PLAN_MODEL: 'gpt-4.1-mini' }]) {
    const calls = recordFetch(t), DB = recordingDb();
    const graded = await assessAnswer(new Request('https://dev.test/api/learn/assess', { method: 'POST', body: JSON.stringify({ app: 'demo-app', mode: 'challenge', prompt: 'Why?', expects: [], answer: 'Because.' }) }),
      { ...env, DB, CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo-app' }) } });
    assert.match(await graded.text(), /event: chunk/);
    assert.deepEqual(shape(calls), [auto]);
    assert.equal(calls[0].maxTokens, 2400);
    assert.deepEqual(DB.sql, []);
  }
});

test('chat with an explicit pick sends that id and no fallback', async t => {
  const calls = recordFetch(t);
  await chat({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' }, 'claude-sonnet-5');
  assert.deepEqual(shape(calls), [pinned('claude-sonnet-5')]);
});

test('cards and the whiteboard run claude-opus-5 without fallback when no OpenAI key is set', async t => {
  let calls = recordFetch(t);
  await artifact({ ANTHROPIC_API_KEY: 'a' });
  assert.deepEqual(shape(calls), [pinned('claude-opus-5')]);
  assert.equal(calls[0].maxTokens, 4000);
  calls = recordFetch(t);
  await board({ ANTHROPIC_API_KEY: 'a' });
  assert.deepEqual(shape(calls), [pinned('claude-opus-5'), pinned('claude-opus-5'), pinned('claude-opus-5')]);
  assert.deepEqual(calls.map(c => c.maxTokens), [1200, 3000, 1800]);
});

test('an OpenAI key with LEARN_PLAN_MODEL runs cards and the whiteboard on that OpenAI model', async t => {
  const env = { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', LEARN_PLAN_MODEL: 'gpt-4.1-mini' };
  let calls = recordFetch(t);
  await artifact(env);
  assert.deepEqual(shape(calls), [openai('gpt-4.1-mini')]);
  calls = recordFetch(t);
  await board(env);
  assert.deepEqual(shape(calls), [openai('gpt-4.1-mini'), openai('gpt-4.1-mini'), openai('gpt-4.1-mini')]);
});

// Owner decision 4: OpenAI only on an explicit LEARN_PLAN_MODEL. The key alone
// also gates image generation and transcription, so it no longer flips these.
test('an OpenAI key alone leaves cards and the whiteboard on claude-opus-5 (models-2)', async t => {
  const env = { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' };
  let calls = recordFetch(t);
  await artifact(env);
  assert.deepEqual(shape(calls), [pinned('claude-opus-5')]);
  calls = recordFetch(t);
  await board(env);
  assert.deepEqual(shape(calls), [pinned('claude-opus-5'), pinned('claude-opus-5'), pinned('claude-opus-5')]);
});

// coaching.md: SUBSCRIPTION_ONLY routes canvas generation and reviews only
// through the subscription bridge, never to a paid API.
test('SUBSCRIPTION_ONLY sends cards and the whiteboard to the subscription bridge even with OpenAI configured (models-3)', async t => {
  const env = { SUBSCRIPTION_ONLY: 'true', SUBSCRIPTION_BRIDGE_URL: 'https://bridge.test', SUBSCRIPTION_BRIDGE_TOKEN: 't', OPENAI_API_KEY: 'o', LEARN_PLAN_MODEL: 'gpt-4.1-mini' };
  let calls = recordFetch(t);
  await planModel(env, { max_tokens: 10, messages: [] }, 'claude-opus-5', null);
  assert.deepEqual(calls.map(c => c.host), ['bridge.test']);
  calls = recordFetch(t);
  await artifact(env);
  await board(env);
  assert.deepEqual([...new Set(calls.map(c => c.host))], ['bridge.test']);
});

test('the whiteboard still honours a crafted model key when no OpenAI key is set (models-7, kept)', async t => {
  const calls = recordFetch(t);
  await board({ ANTHROPIC_API_KEY: 'a' }, { model: 'haiku-4.5' });
  assert.deepEqual(shape(calls).map(c => c.model), ['claude-haiku-4-5-20251001', 'claude-haiku-4-5-20251001', 'claude-haiku-4-5-20251001']);
});

test('no Learn task sets thinking, effort or temperature: the model defaults apply (models-10)', async t => {
  const calls = recordFetch(t);
  await chat({ ANTHROPIC_API_KEY: 'a' }, null);
  await artifact({ ANTHROPIC_API_KEY: 'a' });
  await board({ ANTHROPIC_API_KEY: 'a' });
  for (const { body } of calls) for (const key of ['thinking', 'output_config', 'temperature']) assert.equal(key in body, false, key);
});

test('the task configuration states what the requests above carry, and the limits keep their values', () => {
  const pick = ({ provider, model, maxTokens }) => ({ provider, model, maxTokens });
  assert.deepEqual(pick(LEARN_TASKS.chat), { provider: 'anthropic', model: null, maxTokens: 2400 });
  assert.deepEqual(pick(LEARN_TASKS.grading), { provider: 'anthropic', model: null, maxTokens: 2400 });
  assert.deepEqual(pick(LEARN_TASKS.artifact), { provider: 'plan', model: 'claude-opus-5', maxTokens: 4000 });
  assert.deepEqual(pick(LEARN_TASKS.board), { provider: 'plan', model: 'claude-opus-5', maxTokens: { plan: 1200, draft: 3000, review: 1800 } });
  assert.equal(LEARN_TASKS.chat.picker, true);
  for (const task of ['grading', 'artifact', 'board']) assert.equal(LEARN_TASKS[task].picker, false, task);
  assert.deepEqual([MESSAGE_LIMIT, MENTION_LIMIT, HISTORY_TURNS, PAPERS_PER_ANSWER], [4000, 3, 10, 2]);
  assert.deepEqual([RESEARCH_STEPS, ARTIFACT_REPAIRS, BOARD_DRAFT_TURNS, BOARD_REVIEW_PASSES], [8, 1, 7, 2]);
});

test('askModel maps a picker key to its id and anything else to the fallback', () => {
  assert.equal(askModel('opus-5'), 'claude-opus-5');
  assert.equal(askModel('haiku-4.5'), 'claude-haiku-4-5-20251001');
  assert.equal(askModel(undefined), null);
  assert.equal(askModel('gpt-5'), null);
  assert.equal(askModel('gpt-5', 'claude-opus-5'), 'claude-opus-5');
  // models-8: Object.prototype keys are not picker keys.
  for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(askModel(key), null, key);
    assert.equal(askModel(key, 'claude-opus-5'), 'claude-opus-5', key);
  }
});

// models-11: one sanitized line per Learn model call. It names the task, the
// provider, what was asked for and what actually served it, and never carries
// the learner's words, the context, tool input or a key.
const captureLog = t => {
  const lines = [], original = console.log;
  t.after(() => { console.log = original; });
  console.log = (...args) => { lines.push(args.join(' ')); };
  return () => lines.filter(line => line.includes('"learn_model"')).map(line => JSON.parse(line));
};
test('each Learn model call logs one sanitized learn_model line with the served model and fallback use', async t => {
  const logged = captureLog(t), original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => Response.json({ model: 'claude-opus-4-8', usage: { iterations: [{ type: 'message' }, { type: 'fallback_message' }] }, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' });
  await chat({ ANTHROPIC_API_KEY: 'secret-anthropic-key' }, null);
  const [line] = logged();
  assert.equal(logged().length, 1);
  assert.deepEqual({ ...line, prompt: typeof line.prompt }, { event: 'learn_model', task: 'chat', provider: 'anthropic', requested: 'auto', source: 'auto', fallback: 'default', served: 'claude-opus-4-8', fellBack: true, prompt: 'string', status: 200, stopReason: 'end_turn' });
  assert.equal(line.prompt.length, 12);
  const text = JSON.stringify(logged());
  for (const secret of ['What is a sigmoid?', 'context', 'secret-anthropic-key']) assert.equal(text.includes(secret), false, secret);
});
test('cards, the whiteboard and a picked chat model log their task, source and provider', async t => {
  const logged = captureLog(t);
  recordFetch(t);
  await chat({ ANTHROPIC_API_KEY: 'a' }, 'claude-sonnet-5');
  await artifact({ ANTHROPIC_API_KEY: 'a' });
  await board({ ANTHROPIC_API_KEY: 'a' });
  await artifact({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'secret-openai-key', LEARN_PLAN_MODEL: 'gpt-4.1-mini' });
  const pick = ({ task, provider, requested, source, fallback, fellBack }) => ({ task, provider, requested, source, fallback, fellBack });
  const task = { provider: 'anthropic', requested: 'claude-opus-5', source: 'task', fallback: 'none', fellBack: false };
  assert.deepEqual(logged().map(pick), [
    { task: 'chat', provider: 'anthropic', requested: 'claude-sonnet-5', source: 'request', fallback: 'none', fellBack: false },
    { task: 'artifact', ...task },
    { task: 'board', ...task }, { task: 'board', ...task }, { task: 'board', ...task },
    { task: 'artifact', provider: 'openai', requested: 'gpt-4.1-mini', source: 'LEARN_PLAN_MODEL', fallback: 'none', fellBack: false },
  ]);
  const text = JSON.stringify(logged());
  for (const secret of ['secret-openai-key', 'Why is this 0.5?', 'multiple choice', 'softmax']) assert.equal(text.includes(secret), false, secret);
});
