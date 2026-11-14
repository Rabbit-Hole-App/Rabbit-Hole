// CHAT.02: the tools an ordinary Chat reply may call (chat-tools.js) and the flag that turns them on (CHAT_ANSWER_TOOLS). Pure: doubles only.
// Live model quality (does the real answer model pick the right tool) is not tested here and is UNVERIFIED; these tests prove definitions,
// validation, availability, fit and that nothing downstream runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_TOOLS_POLICY, FIT, alternativesFor, chatToolDefs, checkToolCall, directTools, fitProblem, toolNameOf } from '../src/chat-tools.js';
import { answerToolsOn, decideChat } from '../src/chat-capability-route.js';
import { CHAT_CAPABILITIES } from '../../web/src/inline-ai-route.js';

const MOTION_ENV = { MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: 'm'.repeat(48) };
const untouchable = new Proxy({}, { get: (_, key) => { throw new Error(`touched ${String(key)}`); } });
const ENV = { INLINE_DECISION_KEY: 'k'.repeat(40), VERCEL_TYPESAFE_API_KEY: 'test-only', LEARN_DB: untouchable, DB: untouchable, LEARN_VIDEOS: untouchable, ...MOTION_ENV };
const EMAIL = 'owner@example.test';
const names = defs => defs.map(tool => tool.name);

test('the tool list comes from the registry: direct commands only, explicit and guarded ones excluded unless enabled, R12-held commands never offered', () => {
  const base = names(chatToolDefs(ENV, EMAIL));
  assert.deepEqual([...base].sort(), ['diagram', 'graph', 'code', 'flashcards', 'quiz', 'youtube', 'wikipedia', 'arxiv', 'image', '3d'].map(toolNameOf).sort());
  for (const id of ['diagram', 'graph', 'code', 'flashcards', 'quiz', 'youtube', 'wikipedia', 'arxiv', 'image', '3d']) assert.ok(base.includes(toolNameOf(id)), id);
  for (const id of ['goal', 'motion', 'explain', 'generate-image', 'whiteboard', 'whiteboard-video', 'animation', 'cad', 'practice']) assert.ok(!base.includes(toolNameOf(id)), `${id} is not offered by default`);
  assert.ok(names(chatToolDefs({ ...ENV, EXPLAIN_V2_ENABLED: 'true' }, EMAIL)).includes('run_explain'), 'explain where the server enables it');
  assert.ok(names(chatToolDefs({ ...ENV, IMAGE_GENERATE_ENABLED: 'true' }, EMAIL)).includes('run_generate_image'), 'image generation where the server allows this caller');
  assert.ok(directTools(ENV, EMAIL).every(tool => CHAT_CAPABILITIES[tool.command].flow === 'direct'));
});

test('every definition has a description with the output, the limits and the do-not-call rule, and a valid closed input schema', () => {
  for (const tool of chatToolDefs({ ...ENV, EXPLAIN_V2_ENABLED: 'true', IMAGE_GENERATE_ENABLED: 'true' }, EMAIL)) {
    assert.match(tool.name, /^run_[a-z0-9_]+$/);
    assert.match(tool.description, /Limits: /);
    assert.match(tool.description, /Do not call it to answer a question about the tool/);
    const schema = tool.input_schema;
    assert.deepEqual([schema.type, schema.additionalProperties, schema.required], ['object', false, ['request']]);
    assert.deepEqual([schema.properties.request.type, schema.properties.request.maxLength], ['string', 2000]);
    assert.equal(schema.properties.requirements.additionalProperties, false);
    assert.deepEqual(Object.keys(schema.properties.requirements.properties).sort(), ['interactive', 'narration']);
    assert.ok(Object.values(schema.properties.requirements.properties).every(p => p.type === 'boolean' && p.description));
    JSON.stringify(tool);
  }
  assert.match(CHAT_TOOLS_POLICY, /ONE focused question/);
  assert.match(CHAT_TOOLS_POLICY, /Never say something was created/);
  assert.doesNotMatch(CHAT_TOOLS_POLICY, /make me a video|find me a video/i, 'example phrases live in the fixtures, not the prompt');
});

test('fit: narration disqualifies every tool that cannot narrate, interactivity disqualifies static ones; unknown or search never blocks', () => {
  assert.match(fitProblem('motion', { narration: true }), /Animated explainer cannot provide narration/);
  assert.match(fitProblem('diagram', { interactive: true }), /not interactive/);
  assert.equal(fitProblem('graph', { interactive: true }), null);
  assert.equal(fitProblem('explain', { narration: true }), null, 'unknown narration is not a refusal');
  assert.equal(fitProblem('youtube', { narration: true, interactive: true }), null);
  assert.equal(fitProblem('motion', undefined), null);
  assert.equal(fitProblem('motion', { narration: false }), null);
  assert.deepEqual(Object.keys(FIT).filter(id => FIT[id].narration === true), [], 'no tool in the existing enabled set narrates');
});

test('checkToolCall: a valid call is surfaced, never executed; invalid, unavailable, repeated and unfit calls answer the model with why', () => {
  const ok = checkToolCall(ENV, EMAIL, { name: 'run_diagram', input: { request: '  the  steps of binary search ' } });
  assert.deepEqual(ok, { request: { command: 'diagram', args: 'the steps of binary search' } });
  assert.match(checkToolCall(ENV, EMAIL, { name: 'run_whiteboard', input: { request: 'x' } }).error, /not available/);
  assert.match(checkToolCall(ENV, EMAIL, { name: 'run_generate_image', input: { request: 'x' } }).error, /not available/, 'image generation is off for this caller');
  assert.match(checkToolCall(ENV, EMAIL, { name: 'run_diagram', input: { request: 'x' } }, { taken: true }).error, /One tool request per answer/);
  assert.match(checkToolCall(ENV, EMAIL, { name: 'run_diagram', input: {} }).error, /1 to 2000/);
  assert.match(checkToolCall(ENV, EMAIL, { name: 'run_diagram', input: { request: 'x', mode: 'fast' } }).error, /mode is not a field/);
  assert.match(checkToolCall(ENV, EMAIL, { name: 'run_diagram', input: { request: 'x', requirements: { narration: 'yes' } } }).error, /true or false/);
  assert.match(checkToolCall(ENV, EMAIL, { name: 'run_diagram', input: { request: 'x'.repeat(2001) } }).error, /1 to 2000/);
  // Unfit: narration is required and no existing tool narrates -> help in Chat; interactivity has real alternatives.
  const narrated = checkToolCall(ENV, EMAIL, { name: 'run_diagram', input: { request: 'x', requirements: { narration: true } } });
  assert.match(narrated.error, /cannot provide narration/);
  assert.match(narrated.error, /No available tool fits these requirements/);
  const interactive = checkToolCall(ENV, EMAIL, { name: 'run_diagram', input: { request: 'x', requirements: { interactive: true } } });
  assert.match(interactive.error, /Tools that fit these requirements: .*Graph/);
  assert.ok(!/Wikipedia|YouTube|arXiv/.test(interactive.error), 'a search is never offered as a substitute for making something');
  assert.deepEqual(alternativesFor(ENV, EMAIL, { narration: true }), []);
});

test('the flag: unset is off for every mode; listed modes are on; all means ask and auto; the Contents (wire tutor) conversation never is', () => {
  assert.deepEqual(['ask', 'auto', 'tutor'].map(mode => answerToolsOn({}, mode)), [false, false, false]);
  assert.deepEqual(['ask', 'auto', 'tutor'].map(mode => answerToolsOn({ CHAT_ANSWER_TOOLS: 'auto' }, mode)), [false, true, false]);
  assert.deepEqual(['ask', 'auto', 'tutor'].map(mode => answerToolsOn({ CHAT_ANSWER_TOOLS: ' Ask , AUTO ' }, mode)), [true, true, false]);
  assert.deepEqual(['ask', 'auto', 'tutor'].map(mode => answerToolsOn({ CHAT_ANSWER_TOOLS: 'all' }, mode)), [true, true, false]);
  assert.deepEqual(['ask', 'auto', 'tutor'].map(mode => answerToolsOn({ CHAT_ANSWER_TOOLS: 'tutor' }, mode)), [false, false, false]);
  assert.equal(answerToolsOn({ CHAT_ANSWER_TOOLS: '' }, 'auto'), false);
});

test('with the flag listing the mode an ordinary message makes zero classifier calls; unset keeps the JEV preflight; commands, greetings and Tutor mode are unchanged', async () => {
  const jev = { body: { model: 'jev-1.13.0', answers: { route: { type: 'choice', choice: 'answer', confidence: 0.9, probabilities: { answer: 0.9 } } } }, ms: 5, model: 'jev-1.13.0', inputTokens: 100, cost: 0 };
  const run = async (env, text, over = {}, capability = null) => {
    const ask = async () => { ask.calls += 1; return jev; };
    ask.calls = 0;
    const decision = await decideChat(env, { email: EMAIL, app: 'canvas-0a1b2c3d', requestId: 'req-00000001', fields: { app: 'canvas-0a1b2c3d', text, mode: 'auto', selection: null, source_refs: null, motion: null, ...over }, capability }, { ask });
    return { decision, calls: ask.calls };
  };
  const on = { ...ENV, CHAT_ANSWER_TOOLS: 'auto' };
  const asked = await run(on, 'why is the sky blue');
  assert.deepEqual([asked.decision.route, asked.decision.via, asked.decision.token, asked.calls], ['answer', 'model', null, 0]);
  const off = await run(ENV, 'why is the sky blue');
  assert.deepEqual([off.decision.via, off.calls], ['jev', 1], 'unset: the existing JEV preflight, unchanged');
  assert.equal((await run(on, 'why is the sky blue', { mode: 'ask' })).calls, 1, 'a mode that is not listed keeps JEV');
  assert.equal((await run({ ...ENV, CHAT_ANSWER_TOOLS: 'ask' }, 'why is the sky blue', { mode: 'ask' })).calls, 0);
  assert.equal((await run(on, 'why is the sky blue', { mode: 'tutor' })).decision.via, 'mode', 'wire tutor keeps its own path');
  assert.equal((await run(on, 'hi')).decision.via, 'default', 'a greeting is still decided without the model');
  const typed = await run(on, '/motion explain softmax');
  assert.deepEqual([typed.decision.route, typed.decision.flow, typeof typed.decision.token, typed.calls], ['capability:motion', 'proposal', 'string', 0], 'a typed command keeps its signed review');
  const picked = await run(on, 'softmax', {}, 'youtube');
  assert.deepEqual([picked.decision.route, picked.decision.via], ['capability:youtube', 'capability']);
});
