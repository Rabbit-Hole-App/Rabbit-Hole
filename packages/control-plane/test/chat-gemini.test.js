// Chat answers (Ask, Auto, Tutor) run on Gemini 3.5 Flash Lite at medium reasoning (owner 2026-11-08): the routing, the wire shape, the settlement identity, the PDF and
// no-key edges, and the switch back (CHAT_MODEL_PROFILE=anthropic, pinned in learn-models.test.js). Every request goes through the real askStream / anthropic to a recording fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askStream, anthropic, toOpenAI, fromOpenAI } from '../src/ask.js';
import { CHAT_GEMINI, CHAT_GEMINI_URL, CHAT_REASONING, ASK_MODELS, LEARN_TASKS, askModel, chatModel } from '../src/learn-models.js';
import { CHAIN_ENDPOINTS } from '../src/explanation-fast-chain.js';
import { requestSpendBound } from '../src/learn-spend.js';
import { SEARCH_ARXIV_TOOL } from '../src/arxiv.js';

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const env = { SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' };
const usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 150 };

// A stream:true request is answered as Gemini streams (two chunks, then the usage chunk); any other as one JSON answer.
const streamed = chunks => new Response(chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const okAnswer = body => (body.stream ? streamed([{ model: CHAT_GEMINI, choices: [{ delta: { role: 'assistant', content: 'ok from gemini' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }, { choices: [], usage }])
  : Response.json({ model: CHAT_GEMINI, choices: [{ finish_reason: 'stop', message: { content: 'ok from gemini' } }], usage }));
function recordFetch(t, { gemini = okAnswer } = {}) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const host = new URL(url).host, body = JSON.parse(options.body);
    calls.push({ host, body, headers: options.headers || {} });
    if (host === GEMINI_HOST) return gemini(body);
    return Response.json({ model: body.model, content: [{ type: 'text', text: 'ok from anthropic' }], stop_reason: 'end_turn' });
  };
  return calls;
}
const chat = async (e, model, { research = { papers: [] } } = {}) => askStream(e, 'context', [], 'What is a sigmoid?', async () => {}, {}, [], null, model, null, 'system', research).text();

test('chat on Auto, with no pick and with the old Opus pick, is one Gemini call at medium reasoning with the key as a bearer token and no Anthropic request', async t => {
  for (const pick of [askModel('auto'), null, askModel('opus-5'), askModel('not-a-key')]) {
    const calls = recordFetch(t), events = await chat(env, pick);
    assert.match(events, /ok from gemini/);
    assert.deepEqual(calls.map(c => c.host), [GEMINI_HOST], String(pick));
    assert.equal(calls[0].body.model, CHAT_GEMINI);
    assert.equal(calls[0].body.reasoning_effort, CHAT_REASONING);
    assert.equal(CHAT_REASONING, 'medium');
    assert.equal(calls[0].body.max_tokens, LEARN_TASKS.chat.maxTokens);
    assert.equal(calls[0].headers.Authorization, 'Bearer g');
  }
});

test('the tool-less Tutor path streams from Gemini and the tools path both ride Gemini (plain stream request streamed token by token, tools call non-streamed)', async t => {
  let calls = recordFetch(t);
  const plain = await askStream(env, 'context', [], 'q', async () => {}, {}, [], null, null, null, 'system', null).text();
  assert.match(plain, /ok from gemini/);
  assert.deepEqual(calls.map(c => c.host), [GEMINI_HOST]);
  assert.equal(calls[0].body.stream, true);
  assert.deepEqual(calls[0].body.stream_options, { include_usage: true });
  calls = recordFetch(t);
  const withTools = await askStream(env, 'context', [], 'q', async () => {}, {}, [], { tools: [{ name: 'run', description: 'd', input_schema: { type: 'object', properties: { app: { type: 'string' } }, required: ['app'] } }], onProposal: async () => ({}) }, null, null, 'system', null).text();
  assert.match(withTools, /ok from gemini/);
  assert.deepEqual(calls.map(c => c.host), [GEMINI_HOST]);
  assert.equal('stream' in calls[0].body, false);
});

test('a Sonnet or Haiku pick still runs on Anthropic, and CHAT_MODEL_PROFILE=anthropic puts Auto back on Opus', async t => {
  let calls = recordFetch(t);
  await chat(env, askModel('sonnet-5'));
  assert.deepEqual(calls.map(c => [c.host, c.body.model]), [['api.anthropic.com', 'claude-sonnet-5']]);
  calls = recordFetch(t);
  await chat({ ...env, CHAT_MODEL_PROFILE: 'anthropic' }, askModel('auto'));
  assert.deepEqual(calls.map(c => [c.host, c.body.model]), [['api.anthropic.com', 'claude-opus-5']]);
  assert.equal(chatModel({}, null), CHAT_GEMINI);
  assert.equal(chatModel({ CHAT_MODEL_PROFILE: 'anthropic' }, null), null);
  assert.equal(ASK_MODELS.auto, 'claude-opus-5'); // cards, the whiteboard and grading read this and stay on Opus
  assert.equal(LEARN_TASKS.artifact.model, 'claude-opus-5');
  assert.equal(LEARN_TASKS.board.model, 'claude-opus-5');
});

test('no Gemini key: the not-configured answer, nothing sent, no Opus fallback; a Gemini error is shown and nothing else is tried', async t => {
  let calls = recordFetch(t);
  const none = await chat({ ...env, GEMINI_API_KEY: undefined }, null);
  assert.deepEqual(calls, []);
  assert.match(none, /event: error/);
  calls = recordFetch(t, { gemini: () => new Response('{"error":{"message":"busy"}}', { status: 503 }) });
  const failed = await chat(env, null);
  assert.deepEqual(calls.map(c => c.host), [GEMINI_HOST]);
  assert.match(failed, /event: error/);
});

test('a call carrying a PDF (an attachment, or a paper the research tool read) is served by Sonnet 5, never sent to Gemini as text', async t => {
  const calls = recordFetch(t);
  const body = { max_tokens: 100, messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'AAAA' } }, { type: 'text', text: 'summarise' }] }] };
  await anthropic(env, body, CHAT_GEMINI, null);
  assert.deepEqual(calls.map(c => [c.host, c.body.model]), [['api.anthropic.com', 'claude-sonnet-5']]);
});

test('tools: the last research step offers none (tool_choice none stays none), Gemini gets the tool schema as written (real calls: all 14 chat tools are accepted with additionalProperties), thought signatures ride back, and a system block list is joined', async t => {
  const calls = recordFetch(t, { gemini: () => Response.json({ model: CHAT_GEMINI, choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'c1', function: { name: 'search_arxiv', arguments: '{"query":"x"}' }, extra_content: { google: { thought_signature: 'sig' } } }] } }], usage }) });
  const response = await anthropic(env, { max_tokens: 100, system: [{ type: 'text', text: 'one' }, { type: 'text', text: 'two' }], tools: [SEARCH_ARXIV_TOOL], tool_choice: { type: 'none' }, messages: [{ role: 'user', content: 'find it' }] }, CHAT_GEMINI, null);
  const sent = calls[0].body;
  assert.equal(sent.tool_choice, 'none');
  assert.equal(sent.messages[0].content, 'one\ntwo');
  assert.equal(sent.tools[0].function.parameters.additionalProperties, SEARCH_ARXIV_TOOL.input_schema.additionalProperties);
  assert.equal(sent.tools[0].function.parameters.required[0], 'query');
  const message = await response.json();
  assert.equal(message.stop_reason, 'tool_use');
  const back = toOpenAI({ messages: [{ role: 'assistant', content: message.content }] }, CHAT_GEMINI);
  assert.deepEqual(back.messages[0].tool_calls[0].extra_content, { google: { thought_signature: 'sig' } });
  assert.deepEqual(fromOpenAI({ choices: [{ message: { tool_calls: [{ id: 'x', function: { name: 'n', arguments: '{}' } }] } }] }).content[0].extra_content, undefined);
});

test('settlement: Anthropic-shaped usage (output = the larger of completion and total - prompt), the served model named, and an admission bound from the google price row', async t => {
  recordFetch(t);
  const message = await (await anthropic(env, { max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] }, CHAT_GEMINI, null)).json();
  assert.deepEqual(message.usage, { input_tokens: 100, output_tokens: 50 });
  assert.equal(message.model, CHAT_GEMINI);
  const bound = requestSpendBound({ max_tokens: LEARN_TASKS.chat.maxTokens, messages: [{ role: 'user', content: 'hi' }] }, CHAT_GEMINI, 'google');
  assert.ok(bound > 0 && bound < 0.05, String(bound));
});

test('the endpoint is the explanation chain\'s own', () => assert.equal(CHAT_GEMINI_URL, CHAIN_ENDPOINTS.google.url));

test('the learner sees the API reason on a Gemini 4xx/5xx (its error body is an array), the not-configured sentence without a key, and nothing is retried on another model', async t => {
  for (const [status, body, shown] of [[400, '[{"error":{"code":400,"message":"bad schema"}}]', 'Learn answer unavailable (model HTTP 400: bad schema)'], [503, '{"error":{"message":"busy"}}', 'Learn answer unavailable (model HTTP 503: busy)'], [500, 'not json', 'Learn answer unavailable (model HTTP 500)']]) {
    const calls = recordFetch(t, { gemini: () => new Response(body, { status }) });
    const events = await chat(env, null);
    assert.ok(events.includes(shown), events);
    assert.deepEqual(calls.map(c => c.host), [GEMINI_HOST]);
  }
  const calls = recordFetch(t);
  assert.ok((await chat({ ...env, GEMINI_API_KEY: undefined }, null)).includes('AI answers aren\u2019t configured on this preview.'));
  assert.deepEqual(calls, []);
});

test('a tool loop on Gemini: the second call carries the assistant tool_use block with its thought signature and the tool_result as a tool message (real call: without the signature Gemini answers 400)', async t => {
  const calls = recordFetch(t, { gemini: () => Response.json({ model: CHAT_GEMINI, choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'c1', function: { name: 'search_arxiv', arguments: '{"query":"attention"}' }, extra_content: { google: { thought_signature: 'sig' } } }] } }], usage }) });
  const first = await (await anthropic(env, { max_tokens: 100, tools: [SEARCH_ARXIV_TOOL], messages: [{ role: 'user', content: 'find it' }] }, CHAT_GEMINI, null)).json();
  await anthropic(env, { max_tokens: 100, tools: [SEARCH_ARXIV_TOOL], messages: [{ role: 'user', content: 'find it' }, { role: 'assistant', content: first.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'Result 1' }] }] }, CHAT_GEMINI, null);
  const second = calls[1].body.messages;
  assert.deepEqual(second.at(-2).tool_calls[0].extra_content, { google: { thought_signature: 'sig' } });
  assert.deepEqual(second.at(-1), { role: 'tool', tool_call_id: 'c1', content: 'Result 1' });
});

test('an image attachment goes to Gemini as an image_url data part beside the text (real call: accepted, described), a PDF still goes to Sonnet 5', async t => {
  const { attachmentBlocks } = await import('../src/ask.js');
  const png = new File([Uint8Array.from([137, 80, 78, 71])], 'dot.png', { type: 'image/png' });
  const { blocks } = await attachmentBlocks(png);
  assert.equal(blocks[0].type, 'image');
  const calls = recordFetch(t);
  await anthropic(env, { max_tokens: 100, messages: [{ role: 'user', content: [...blocks, { type: 'text', text: 'What is in this picture?' }] }] }, CHAT_GEMINI, null);
  assert.deepEqual(calls.map(c => c.host), [GEMINI_HOST]);
  const user = calls[0].body.messages.at(-1);
  assert.equal(user.content[0].type, 'image_url');
  assert.match(user.content[0].image_url.url, /^data:image\/png;base64,/);
  assert.deepEqual(user.content[1], { type: 'text', text: 'What is in this picture?' });
});
