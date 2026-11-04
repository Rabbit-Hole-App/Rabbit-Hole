// AN-17 (MVP2b, owner decisions 12 to 17 and 20.5 of 3 Nov 2026; FX-AN-041, FX-AN-044): the animation author and repair answer as a stream and are
// put back together as the one message a non-streaming call returns, with an abort deadline; a gateway timeout is the provider not answering,
// retried once in the same job. Fake transports only: no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { messageFromStream, streamedMessage } from '../src/anthropic-stream.js';
import { anthropic } from '../src/ask.js';
import { ANIMATION_LIMITS, animationStreaming, callAnimationRole } from '../src/animation-policy.js';
import { OWNER, TASKS, animationStack, chunked, rows, sseOf } from './animation-fixture.js';

const tool = { name: 'animation_out', description: 'Output.', input_schema: { type: 'object' } };
const sseResponse = (text, size = 7, status = 200) => new Response(chunked(text, size), { status, headers: { 'Content-Type': 'text/event-stream', 'request-id': 'req_abc' } });
const events = list => list.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const start = { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 1 } } };

// The same message a non-streaming call returns: thinking, text and one tool call, with multi-byte characters and escapes in them.
const MESSAGE = { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [
  { type: 'thinking', thinking: 'Plan: é≈ the beam, 𝒙 twice.', signature: 'sig-1' },
  { type: 'text', text: 'Returning the artifact.' },
  { type: 'tool_use', id: 'toolu_1', name: 'animation_out', input: { operation: 'artifact', artifact: { title: 'Ünïcode "quoted" \\ \n tab', nodes: [1, 2, { a: [] }] } } },
], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1200, cache_creation_input_tokens: 10, cache_read_input_tokens: 0, output_tokens: 777 } };

test('a streamed message is the message a non-streaming call returns, whatever the chunking', async () => {
  for (const size of [1, 3, 7, 64, 100000]) {
    const message = await messageFromStream(chunked(sseOf(MESSAGE), size));
    assert.deepEqual(message, MESSAGE, `chunks of ${size} bytes`);
  }
});

test('the usage of the start and the end are merged, and an answer without a tool call has an empty content', async () => {
  const text = events([start, { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 42, cache_read_input_tokens: 3 } }, { type: 'message_stop' }]);
  const message = await messageFromStream(chunked(text, 11));
  assert.deepEqual([message.content, message.stop_reason, message.usage], [[], 'end_turn', { input_tokens: 5, output_tokens: 42, cache_read_input_tokens: 3 }]);
});

test('tool input arrives in pieces: an empty input is {}, a cut-off input stays as the text received (and is an output limit, with that text as the diagnostic)', async () => {
  const block = (input, stop) => events([start, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: tool.name, input: {} } },
    ...input.map(partial_json => ({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json } })), { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 9 } }, { type: 'message_stop' }]);
  assert.deepEqual((await messageFromStream(chunked(block([], 'tool_use'), 9))).content, [{ type: 'tool_use', id: 't', name: tool.name, input: {} }]);
  const cut = ['{"operation":"art', 'ifact","artifact":{"title":"Half a', ' scene'];
  const message = await messageFromStream(chunked(block(cut, 'max_tokens'), 9));
  assert.equal(message.content[0].input, cut.join(''));
  await assert.rejects(callAnimationRole({}, 'author', { system: 's', tool, content: 'x' }, { callModel: async () => Response.json(message), tasks: TASKS }),
    error => error.code === 'output_limit' && error.reply.partialTool === cut.join('') && error.reply.stopReason === 'max_tokens');
});

test('an error event is the provider\'s own failure with the status that kind of error has; a stream that ends early is a bad gateway', async () => {
  const cutOff = events([start, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }]);
  const overloaded = events([start, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]);
  const broken = events([start, { type: 'error', error: { type: 'api_error', message: 'Internal server error' } }]);
  const answer = async text => streamedMessage(async () => sseResponse(text), { deadlineMs: 10000 });
  const [a, b, c] = await Promise.all([answer(overloaded), answer(broken), answer(cutOff)]);
  assert.deepEqual([a.status, (await a.json()).error.type, b.status, c.status, (await c.json()).error.type], [529, 'overloaded_error', 500, 502, 'api_error']);
  const call = text => callAnimationRole({}, 'author', { system: 's', tool, content: 'x' }, { callModel: async () => answer(text), tasks: TASKS });
  await assert.rejects(call(overloaded), { code: 'provider_unavailable' });
  await assert.rejects(call(cutOff), { code: 'provider_unavailable', providerStatus: 502 });
  await assert.rejects(call(broken), { code: 'model_http_500' });
});

test('a stream that stalls is aborted at the deadline, after the headers or before them, and its timer does not outlive the call', async () => {
  const stalled = signal => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(events([start])));
    signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
  const begun = Date.now();
  const late = await streamedMessage(async signal => stalled(signal), { deadlineMs: 40 });
  assert.deepEqual([late.status, (await late.json()).error.type], [504, 'timeout_error']);
  assert.ok(Date.now() - begun >= 35 && Date.now() - begun < 3000, 'aborted at the deadline, not before and not never');
  const silent = await streamedMessage(signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))), { deadlineMs: 40 });
  assert.equal(silent.status, 504);
  await assert.rejects(callAnimationRole({}, 'author', { system: 's', tool, content: 'x' }, { callModel: async () => streamedMessage(async signal => stalled(signal), { deadlineMs: 20 }), tasks: TASKS }), { code: 'provider_unavailable', providerStatus: 504 });
  // A finished stream leaves no timer: with a 10-minute deadline this test would otherwise hang until the runner gave up.
  assert.equal((await streamedMessage(async () => sseResponse(sseOf(MESSAGE)), { deadlineMs: 600000 })).status, 200);
});

test('a non-streaming role keeps its single request under the deadline, and a failure answer or a non-stream answer passes through as it came', async () => {
  const seen = [];
  const send = (signal, streaming) => { seen.push([signal instanceof AbortSignal, streaming]); return Promise.resolve(Response.json(MESSAGE)); };
  assert.deepEqual(await (await streamedMessage(send, { stream: false, deadlineMs: 600000 })).json(), MESSAGE);
  assert.deepEqual(await (await streamedMessage(send, { stream: true, deadlineMs: 600000 })).json(), MESSAGE, 'a JSON answer to a stream request is returned as it is');
  const refused = await streamedMessage(async () => Response.json({ type: 'error', error: { type: 'overloaded_error' } }, { status: 529 }), { stream: true, deadlineMs: 600000 });
  assert.equal(refused.status, 529);
  assert.deepEqual(seen, [[true, false], [true, true]]);
  const gateway = await streamedMessage(async () => new Response('timeout', { status: 524 }), { stream: true, deadlineMs: 600000 });
  assert.deepEqual([gateway.status, await gateway.text()], [524, 'timeout']);
});

// ask.js: the single chokepoint. A call that asks for nothing is sent exactly as before; the animation roles ask through env.MODEL_STREAM.
async function viaAnthropic(env, body, answer) {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return answer(init); };
  try { return { calls, response: await anthropic({ SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'k', ...env }, body, 'claude-opus-5-5', null) }; } finally { globalThis.fetch = original; }
}
const BODY = { max_tokens: 100, system: [{ type: 'text', text: 's' }], tools: [tool], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: 'x' }] };

test('a call from anywhere else (Explain, CAD, chat) is sent byte-for-byte as before: no stream, no deadline, the CAD signal untouched', async () => {
  const { calls, response } = await viaAnthropic({}, BODY, () => Response.json(MESSAGE));
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.deepEqual(Object.keys(init), ['method', 'signal', 'headers', 'body']);
  assert.deepEqual([init.method, init.signal, init.body], ['POST', undefined, JSON.stringify({ ...BODY, model: 'claude-opus-5-5' })]);
  assert.deepEqual(init.headers, { 'x-api-key': 'k', 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' });
  assert.deepEqual(await response.json(), MESSAGE);
  const cad = AbortSignal.timeout(60000);
  assert.equal((await viaAnthropic({ CAD_MODEL_ABORT_SIGNAL: cad }, BODY, () => Response.json(MESSAGE))).calls[0].init.signal, cad);
  // The only thing that turns the stream on is the animation transport's own key; a body that says stream:true is still the caller's own business.
  assert.equal(JSON.parse((await viaAnthropic({}, { ...BODY, stream: true }, () => sseResponse(sseOf(MESSAGE)))).calls[0].init.body).stream, true);
});

test('with MODEL_STREAM the request streams under an abort signal and the answer is the whole message, served as JSON with its request id', async () => {
  const { calls, response } = await viaAnthropic({ MODEL_STREAM: { stream: true, deadlineMs: 600000 } }, BODY, () => sseResponse(sseOf(MESSAGE)));
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual([sent.stream, sent.model, sent.max_tokens, calls[0].init.signal instanceof AbortSignal], [true, 'claude-opus-5-5', 100, true]);
  assert.deepEqual(await response.clone().json(), MESSAGE);
  assert.deepEqual([response.status, response.headers.get('content-type'), response.headers.get('request-id')], [200, 'application/json', 'req_abc']);
  const plain = await viaAnthropic({ MODEL_STREAM: { stream: false, deadlineMs: 600000 } }, BODY, () => Response.json(MESSAGE));
  assert.deepEqual(['stream' in JSON.parse(plain.calls[0].init.body), plain.calls[0].init.signal instanceof AbortSignal], [false, true]);
  const stalled = await viaAnthropic({ MODEL_STREAM: { stream: true, deadlineMs: 30 } }, BODY, init => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  assert.equal(stalled.response.status, 504);
});

test('the transport options of a role: author and repair stream for up to 300 s, brief and review stay one request for 120 s, and false turns it all off', () => {
  assert.deepEqual(ANIMATION_LIMITS.deadlines.callMs, 120000);
  assert.deepEqual(ANIMATION_LIMITS.deadlines.authorCallMs, 300000);
  assert.deepEqual(['author', 'repair', 'brief', 'review'].map(role => animationStreaming({}, role)), [
    { stream: true, deadlineMs: 300000 }, { stream: true, deadlineMs: 300000 }, { stream: false, deadlineMs: 120000 }, { stream: false, deadlineMs: 120000 }]);
  assert.equal(animationStreaming({ ANIMATION_STREAMING: 'false' }, 'author'), null);
  assert.deepEqual(animationStreaming({ ANIMATION_STREAMING: 'true' }, 'author'), { stream: true, deadlineMs: 300000 });
});

// The whole job on the real object and ledger, with the provider answering as a stream: the transport is the job's own.
const PAIDLESS = { reply: role => (role === 'review' ? { accepted: true } : {}) };
const credits = s => rows(s.sqlite, 'usage_attempts').reduce((total, r) => total + (r.cost_micros || 0), 0);

test('a job streams its author and repair and settles the same as one that does not; ANIMATION_STREAMING=false is the old single request, with no signal', async t => {
  const on = animationStack(t, PAIDLESS), onDone = (await on.generated()).done;
  assert.equal(onDone.stage, 'ready');
  const byRole = Object.fromEntries(on.model.calls.map(c => [c.role, [c.stream, c.signal]]));
  assert.deepEqual(byRole, { brief: [false, true], author: [true, true], review: [false, true] });
  assert.deepEqual(onDone.calls.map(c => [c.role, c.status, c.inputTokens, c.outputTokens]), [['brief', 'settled', 1000, 500], ['author', 'settled', 1000, 500], ['review', 'settled', 1000, 500]]);
  assert.deepEqual(onDone.calls.map(c => [c.role, c.streamed]), [['brief', false], ['author', true], ['review', false]], 'each call record says whether it streamed (diagnostics: what the focused smoke reads)');
  const off = animationStack(t, { ...PAIDLESS, env: { ANIMATION_STREAMING: 'false' } }), offDone = (await off.generated()).done;
  assert.equal(offDone.stage, 'ready');
  assert.deepEqual(offDone.calls.map(c => c.streamed), [false, false, false]);
  assert.deepEqual(off.model.calls.map(c => [c.role, c.stream, c.signal]), [['brief', false, false], ['author', false, false], ['review', false, false]]);
  assert.equal(credits(on), credits(off), 'the learner is charged the same either way');
});

// FX-AN-041: the author's answer that never comes (524 after 126 s in acceptance sequence 3) is the provider not answering. One more try, in the
// same job, after the pause; it costs nothing and does not use the author's one call.
for (const code of [524, 502, 503, 504]) {
  test(`an author call answered ${code} is tried once more in the same job and the build goes on (the ceiling is not used)`, async t => {
    const s = animationStack(t, { ...PAIDLESS, status: (role, n) => (role === 'author' && n === 1 ? code : 200) });
    const { done } = await s.generated();
    assert.equal(done.stage, 'ready');
    assert.deepEqual(s.model.calls.map(c => c.role), ['brief', 'author', 'author', 'review']);
    assert.deepEqual(done.calls.filter(c => c.role === 'author').map(c => [c.status, c.costMicros > 0]), [['refused', false], ['settled', true]]);
    assert.deepEqual([done.counts.author, done.autoRetried, done.waited, done.failure], [1, 1, 1, null]);
    assert.ok(done.findings.some(f => f.autoRetry && f.error === 'provider_unavailable'));
  });
}

test('a second timeout ends the job honestly: provider_unavailable, not internal; nothing charged for the build; Try again is offered, not only Revise plan', async t => {
  const s = animationStack(t, { ...PAIDLESS, status: role => (role === 'author' ? 524 : 200) });
  const { id, done } = await s.generated();
  assert.deepEqual([done.stage, done.stopReason, done.failure.category, done.failure.retryable], ['failed', 'provider_unavailable', 'provider_unavailable', true]);
  assert.equal(done.counts.author, 0, 'both refused calls gave their count back');
  const { job } = await s.job(id);
  assert.ok(job.recovery.includes('new_attempt'), job.recovery.join());
  assert.notDeepEqual(job.recovery.filter(a => a !== 'edit_request'), ['revise_plan']);
  assert.match(job.failure.message, /The AI service was busy\. You have not been charged\. It was retried automatically\. Try again continues from where it stopped, using up to \d+ AI credits\./);
  assert.doesNotMatch(job.failure.message, /interrupted|stopped unexpectedly/);
  // Only the plan the learner received stays charged (the build's calls, if any had settled, would come back with the refund).
  const plan = s.sqlite.prepare("SELECT COALESCE(SUM(t.cost_micros), 0) AS cost FROM usage_actions a JOIN usage_attempts t ON t.action_id = a.action_id WHERE a.user_id = ? AND a.client_key = ?").get(OWNER.userId, done.prepKey).cost;
  assert.equal(credits(s), plan);
});

test('a provider failure other than a gateway one is not retried here: a 500 stays a model failure', async t => {
  const s = animationStack(t, { ...PAIDLESS, status: role => (role === 'author' ? 500 : 200) });
  const { done } = await s.generated();
  assert.deepEqual([done.stage, done.failure.code, done.autoRetried ?? null], ['failed', 'model_http_500', null]);
});
