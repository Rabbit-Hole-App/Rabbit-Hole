// Real token streaming for chat on Gemini (owner 2026-11-08, after C.1's replay): Gemini's OpenAI-compatible SSE becomes the Anthropic-style SSE the chat reads, event by event.
// Offline: an injected fetch streams the chunks; the settlement tests run the real spendTransport on an in-memory ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { anthropicStreamFromOpenAI } from '../src/gemini-stream.js';
import { messageFromStream } from '../src/anthropic-stream.js';
import { anthropic } from '../src/ask.js';
import { CHAT_GEMINI } from '../src/learn-models.js';
import { withSystemUsage } from '../src/learn-usage.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const data = value => enc.encode(`data: ${JSON.stringify(value)}\n\n`);
const usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 150 };
const events = text => text.split('\n\n').filter(Boolean).map(block => JSON.parse(block.split('\n').find(l => l.startsWith('data:')).slice(5)));
const drain = async stream => { const reader = stream.getReader(); let out = ''; for (;;) { const { done, value } = await reader.read(); if (done) return out; out += dec.decode(value); } };

test('text deltas go out as the chunks arrive: the first text event is readable before the upstream stream has ended', async () => {
  let source; const upstream = new ReadableStream({ start(c) { source = c; } });
  const reader = anthropicStreamFromOpenAI(upstream, CHAT_GEMINI).getReader();
  const seen = [];
  const next = async () => { const { value } = await reader.read(); return events(dec.decode(value)); };
  seen.push(...await next()); // message_start comes at once
  source.enqueue(data({ choices: [{ delta: { role: 'assistant', content: 'Hel' } }] }));
  seen.push(...await next(), ...await next());
  assert.deepEqual(seen.map(e => e.type), ['message_start', 'content_block_start', 'content_block_delta']);
  assert.equal(seen[2].delta.text, 'Hel');
  source.enqueue(data({ choices: [{ delta: { content: 'lo' } }] }));
  assert.equal((await next())[0].delta.text, 'lo');
  source.enqueue(data({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
  source.enqueue(data({ choices: [], usage }));
  source.enqueue(enc.encode('data: [DONE]\n\n'));
  source.close();
  const rest = []; for (;;) { const { done, value } = await reader.read(); if (done) break; rest.push(...events(dec.decode(value))); }
  assert.deepEqual(rest.map(e => e.type), ['content_block_stop', 'message_delta', 'message_stop']);
  assert.deepEqual(rest[1].usage, { input_tokens: 100, output_tokens: 50 }, 'output = the larger of completion and total - prompt (thinking may sit outside completion)');
  assert.equal(rest[1].delta.stop_reason, 'end_turn');
});

test('a tool call streamed in pieces is one tool_use block: its arguments assemble into one input and the thought signature rides on the block', async () => {
  const signature = { google: { thought_signature: 'sig-1' } };
  const upstream = new ReadableStream({ start(c) {
    c.enqueue(data({ choices: [{ delta: { role: 'assistant', content: 'Looking.' } }] }));
    c.enqueue(data({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'search_arxiv', arguments: '{"query":"atten' }, extra_content: signature }] } }] }));
    c.enqueue(data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'tion"}' } }] }, finish_reason: 'tool_calls' }], usage }));
    c.close();
  } });
  const message = await messageFromStream(anthropicStreamFromOpenAI(upstream, CHAT_GEMINI));
  assert.deepEqual(message.content.map(b => b.type), ['text', 'tool_use']);
  assert.equal(message.content[0].text, 'Looking.');
  assert.deepEqual({ id: message.content[1].id, name: message.content[1].name, input: message.content[1].input, extra_content: message.content[1].extra_content },
    { id: 'call_1', name: 'search_arxiv', input: { query: 'attention' }, extra_content: signature });
  assert.equal(message.stop_reason, 'tool_use');
  // Gemini sends a whole call per chunk with no index: two calls with two ids are two blocks
  const two = new ReadableStream({ start(c) {
    c.enqueue(data({ choices: [{ delta: { tool_calls: [{ id: 'a', function: { name: 'x', arguments: '{}' } }] } }] }));
    c.enqueue(data({ choices: [{ delta: { tool_calls: [{ id: 'b', function: { name: 'y', arguments: '{"k":1}' } }] }, finish_reason: 'stop' }] }));
    c.close();
  } });
  assert.deepEqual((await messageFromStream(anthropicStreamFromOpenAI(two, CHAT_GEMINI))).content.map(b => [b.id, b.name, b.input]), [['a', 'x', {}], ['b', 'y', { k: 1 }]]);
});

test('an error in the upstream stream errors the output stream (the chat reader throws and shows its one-line error), also an [{ error }] body', async () => {
  for (const body of [{ error: { message: 'model overloaded' } }, [{ error: { message: 'model overloaded' } }]]) {
    const upstream = new ReadableStream({ start(c) { c.enqueue(data({ choices: [{ delta: { content: 'Par' } }] })); c.enqueue(data(body)); c.close(); } });
    const reader = anthropicStreamFromOpenAI(upstream, CHAT_GEMINI).getReader();
    let text = '';
    await assert.rejects(async () => { for (;;) { const { done, value } = await reader.read(); if (done) return; text += dec.decode(value); } }, /model overloaded/);
    assert.match(text, /Par/, 'what arrived before the error was delivered');
    assert.doesNotMatch(text, /message_stop/);
  }
});

function ledger(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../learn-migrations/0016-usage-operations.sql', import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const LEARN_DB = { prepare: sql => ({ bind: (...args) => ({ first: async () => sqlite.prepare(sql).get(...args), run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }) }) }) };
  return { sqlite, LEARN_DB };
}
const body = { max_tokens: 200, stream: true, messages: [{ role: 'user', content: 'Explain a sigmoid in one paragraph.' }] };
const spendEnv = LEARN_DB => withSystemUsage({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '1', GEMINI_API_KEY: 'g' });
const mockGemini = (t, make) => { const calls = [], original = globalThis.fetch; t.after(() => { globalThis.fetch = original; }); globalThis.fetch = async (url, options) => { calls.push(JSON.parse(options.body)); return make(JSON.parse(options.body), calls.length); }; return calls; };
const sseResponse = stream => new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

test('the spend ledger settles once, from the final usage chunk, after the whole stream has been read', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  let source; const calls = mockGemini(t, () => sseResponse(new ReadableStream({ start(c) { source = c; } })));
  const response = await anthropic(spendEnv(LEARN_DB), body, CHAT_GEMINI, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].stream, true);
  assert.deepEqual(calls[0].stream_options, { include_usage: true });
  assert.equal(sqlite.prepare('SELECT status FROM usage_operations').get().status, 'admitted');
  const reader = response.body.getReader();
  source.enqueue(data({ choices: [{ delta: { content: 'A sigmoid' } }] }));
  const first = await reader.read(); // message_start, then the delta: not buffered until the end
  assert.match(dec.decode(first.value), /message_start/);
  assert.equal(sqlite.prepare('SELECT status FROM usage_operations').get().status, 'admitted', 'not settled mid-stream');
  source.enqueue(data({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
  source.enqueue(data({ choices: [], usage }));
  source.close();
  while (!(await reader.read()).done) { /* drain */ }
  const rows = sqlite.prepare('SELECT status,cost_usd,model,provider FROM usage_operations').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'settled');
  assert.equal(rows[0].provider, 'google');
  assert.ok(rows[0].cost_usd > 0 && rows[0].cost_usd < 0.001, `priced from 100 in / 50 out: ${rows[0].cost_usd}`);
});

test('a cancelled chat stream cancels the upstream read and settles once as cancelled (the reservation is kept)', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  let cancelled = false;
  mockGemini(t, () => sseResponse(new ReadableStream({ start(c) { c.enqueue(data({ choices: [{ delta: { content: 'Par' } }] })); }, cancel() { cancelled = true; } })));
  const response = await anthropic(spendEnv(LEARN_DB), body, CHAT_GEMINI, null);
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel('the learner stopped');
  assert.equal(cancelled, true);
  const rows = sqlite.prepare('SELECT status FROM usage_operations').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'failed');
});

test('an error in the middle of the stream errors the response and settles once as failed', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  mockGemini(t, () => sseResponse(new ReadableStream({ start(c) { c.enqueue(data({ choices: [{ delta: { content: 'Par' } }] })); c.enqueue(data([{ error: { message: 'busy' } }])); c.close(); } })));
  const response = await anthropic(spendEnv(LEARN_DB), body, CHAT_GEMINI, null);
  await assert.rejects(drain(response.body), /busy/);
  const rows = sqlite.prepare('SELECT status FROM usage_operations').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'failed');
});

test('a stream that cannot be established (an error status) falls back to one whole call replayed as SSE, with one admission and one settlement', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const calls = mockGemini(t, (request, n) => (n === 1 ? new Response('upstream said no', { status: 503 })
    : Response.json({ model: CHAT_GEMINI, choices: [{ finish_reason: 'stop', message: { content: 'whole answer' } }], usage })));
  const response = await anthropic(spendEnv(LEARN_DB), body, CHAT_GEMINI, null);
  const text = await drain(response.body);
  assert.deepEqual(calls.map(c => Boolean(c.stream)), [true, false]);
  assert.match(text, /whole answer/);
  const rows = sqlite.prepare('SELECT status FROM usage_operations').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'settled');
});
