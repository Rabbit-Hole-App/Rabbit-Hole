// loggedModel (learn-models.js), telemetry brief Task 5: streaming is passed through at once, and every terminal outcome is
// recorded. Synthetic transports only: no provider is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loggedModel } from '../src/learn-models.js';
import { telemetryDb } from './telemetry-fixture.js';

const encoder = new TextEncoder();
const sse = (type, data) => encoder.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
const START = sse('message_start', { message: { id: 'msg_1', model: 'claude-opus-5-5', content: [], usage: { input_tokens: 40, cache_read_input_tokens: 2048, output_tokens: 1 } } });
const DELTA = sse('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'The private answer text' } });
const END = [sse('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 25 } }), sse('message_stop', {})];

// A provider stream the test drives by hand: nothing after the first chunk is sent until the test says so.
function controlledStream() {
  let controller;
  const body = new ReadableStream({ start(c) { controller = c; } });
  return { body, push: chunk => controller.enqueue(chunk), close: () => controller.close(), fail: error => controller.error(error),
    response: () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_011synthetic' } }) };
}
function capture(t) {
  const lines = [];
  t.mock.method(console, 'log', (...args) => lines.push(args.join(' ')));
  t.mock.method(console, 'warn', () => {});
  return () => lines.filter(l => l.includes('"learn_model"')).map(l => JSON.parse(l));
}
const env = (extra = {}) => ({ SMALL_ENV: 'test', ...extra });
const body = { system: 'You are a private system prompt', stream: true, max_tokens: 100, messages: [{ role: 'user', content: 'private question' }] };
const events = sqlite => sqlite.prepare('SELECT event_name, outcome, error_code, body FROM telemetry_events ORDER BY occurred_at, event_name DESC').all()
  .map(row => ({ name: row.event_name, outcome: row.outcome, error: row.error_code, payload: JSON.parse(row.body).payload }));

test('the first chunk reaches the consumer before the provider stream has finished', async t => {
  const logged = capture(t), provider = controlledStream();
  const response = await loggedModel('chat', async () => provider.response())(env(), body, null, null);
  provider.push(START);
  const reader = response.body.getReader();
  const first = await Promise.race([reader.read(), new Promise(resolve => setTimeout(() => resolve('blocked'), 1000))]);
  assert.notEqual(first, 'blocked', 'the response was handed over while the provider stream was still open');
  assert.deepEqual(first.value, START);
  assert.equal(logged().length, 0, 'no terminal line before the stream ends');
  provider.push(DELTA); for (const chunk of END) provider.push(chunk); provider.close();
  while (!(await reader.read()).done);
  const [line] = logged();
  assert.deepEqual([line.outcome, line.error, line.served, line.stopReason, line.status], ['completed', null, 'claude-opus-5-5', 'end_turn', 200]);
});

test('a completed stream records timings, the request id and the allowlisted usage; never the content or the prompt', async t => {
  capture(t);
  const { sqlite, db } = telemetryDb(t);
  const provider = controlledStream();
  const call = loggedModel('chat', async () => provider.response());
  const response = await call(env({ TELEMETRY_DB: db }), body, 'claude-opus-5-5', null);
  provider.push(START); provider.push(DELTA); for (const chunk of END) provider.push(chunk); provider.close();
  assert.match(await response.text(), /private answer text/, 'the consumer gets every byte unchanged');
  const [started, finished] = events(sqlite);
  assert.deepEqual([started.name, started.outcome, started.payload.stream], ['model_call.started', 'started', true]);
  assert.deepEqual([finished.name, finished.outcome, finished.error], ['model_call.finished', 'completed', null]);
  assert.deepEqual(finished.payload.usage, { input_tokens: 40, cache_read_input_tokens: 2048, output_tokens: 25 });
  assert.equal(finished.payload.request_id, 'req_011synthetic');
  assert.equal(finished.payload.chunks, 4);
  for (const key of ['response_ms', 'first_chunk_ms', 'duration_ms']) assert.ok(Number.isSafeInteger(finished.payload[key]), key);
  const stored = JSON.stringify(sqlite.prepare('SELECT * FROM telemetry_events').all());
  for (const secret of ['private answer', 'private system prompt', 'private question']) assert.equal(stored.includes(secret), false, secret);
});

test('a stream that ends without message_stop is unknown, a failed stream is unknown, a cancelled one is cancelled', async t => {
  const logged = capture(t);
  const call = provider => loggedModel('chat', async () => provider.response())(env(), body, null, null);
  const partial = controlledStream(), partialResponse = await call(partial);
  partial.push(START); partial.close();
  await partialResponse.text();
  const failing = controlledStream(), failingResponse = await call(failing);
  failing.push(START); failing.fail(new Error('connection reset'));
  await assert.rejects(failingResponse.text(), /connection reset/, 'the consumer sees the original stream error');
  const cancelled = controlledStream(), cancelledResponse = await call(cancelled);
  cancelled.push(START);
  const reader = cancelledResponse.body.getReader();
  await reader.read();
  await reader.cancel('the learner pressed Stop');
  assert.deepEqual(logged().map(l => [l.outcome, l.error]), [['unknown', 'stream_incomplete'], ['unknown', 'stream_failed'], ['cancelled', 'stream_cancelled']]);
});

test('a thrown transport is logged and rethrown; a non-2xx reply is failed and returned untouched', async t => {
  const logged = capture(t);
  const boom = Object.assign(new Error('fetch failed'), { cause: 'ECONNRESET' });
  await assert.rejects(loggedModel('chat', async () => { throw boom; })(env(), body, null, null), error => error === boom);
  const refused = Response.json({ type: 'error', error: { type: 'overloaded_error' } }, { status: 529 });
  const response = await loggedModel('grading', async () => refused)(env(), { ...body, stream: false }, null, null);
  assert.equal(response, refused);
  assert.deepEqual((await response.json()).error.type, 'overloaded_error', 'the body is still readable by the caller');
  assert.deepEqual(logged().map(l => [l.task, l.outcome, l.error, l.status]), [['chat', 'unknown', 'transport_thrown', null], ['grading', 'failed', 'http_error', 529]]);
});

test('a broken telemetry database or logger never breaks the answer', async t => {
  capture(t);
  const down = telemetryDb(t, { fail: () => true });
  const provider = controlledStream();
  const response = await loggedModel('chat', async () => provider.response())(env({ TELEMETRY_DB: down.db }), body, null, null);
  provider.push(START); provider.push(DELTA); for (const chunk of END) provider.push(chunk); provider.close();
  assert.match(await response.text(), /private answer text/);
  t.mock.method(console, 'log', () => { throw new Error('log sink full'); });
  const json = await loggedModel('chat', async () => Response.json({ model: 'claude-opus-5-5', content: [], stop_reason: 'end_turn' }))(env(), { ...body, stream: false }, null, null);
  assert.equal((await json.json()).stop_reason, 'end_turn');
});

test('with TELEMETRY_DB down, a streamed answer through the real spend transport still settles its ledger rows', async t => {
  capture(t);
  const { DatabaseSync } = await import('node:sqlite');
  const { d1, migration } = await import('./telemetry-fixture.js');
  const { anthropic } = await import('../src/ask.js');
  const { withSystemUsage } = await import('../src/learn-usage.js');
  const ledger = new DatabaseSync(':memory:');
  t.after(() => ledger.close());
  for (const file of ['0016-usage-operations.sql', '0022-usage-accounting.sql']) ledger.exec(migration(`learn-migrations/${file}`));
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response(new ReadableStream({ start(c) { for (const chunk of [START, DELTA, ...END]) c.enqueue(chunk); c.close(); } }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const down = telemetryDb(t, { fail: () => true });
  const scoped = withSystemUsage({ SMALL_ENV: 'dev', TELEMETRY_ENVIRONMENT: 'dev', TELEMETRY_DB: down.db, LEARN_DB: d1(ledger), ANTHROPIC_API_KEY: 'synthetic-not-a-credential', USAGE_PLATFORM_DAY_USD: '1' });
  const response = await loggedModel('chat', anthropic)(scoped, body, 'claude-opus-5-5', null);
  assert.match(await response.text(), /private answer text/);
  const [operation] = ledger.prepare('SELECT status, model, cost_usd FROM usage_operations').all();
  assert.deepEqual([operation.status, operation.model], ['settled', 'claude-opus-5-5']);
  assert.ok(operation.cost_usd > 0, 'the measured cost is recorded');
  assert.deepEqual(ledger.prepare('SELECT status, cost_state FROM usage_attempts').all().map(row => ({ ...row })), [{ status: 'settled', cost_state: 'settled' }]);
});
