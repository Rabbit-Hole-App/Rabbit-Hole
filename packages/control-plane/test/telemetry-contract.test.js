import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, LIMITS, SCHEMA_VERSION, makeEvent, retentionConfig, routeTemplate, telemetryEnvironment, usageSnapshot, validateBatch, validateEvent } from '../src/telemetry-contract.js';

const producer = { environment: 'dev', service: 'app_worker', now: 1_760_000_000_000 };
const finished = (fields = {}, payload = {}) => makeEvent('model_call.finished', { outcome: 'completed', feature: 'ask', action_id: 'act-1', attempt_id: 'chat-1',
  payload: { task: 'chat', provider: 'anthropic', served_model: 'claude-opus-5-5', status_code: 200, duration_ms: 812, usage: { input_tokens: 10, output_tokens: 4 }, ...payload }, ...fields }, producer);
const codes = result => result.errors.map(({ code, field }) => field ? `${code}:${field}` : code);

test('a well-formed event validates and keeps every field it was given', () => {
  const event = finished();
  const result = validateEvent(event);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.event.schema_version, SCHEMA_VERSION);
  assert.match(result.event.event_id, /^ev-/);
  assert.deepEqual(result.event.payload.usage, { input_tokens: 10, output_tokens: 4 });
});

test('unknown events, unknown fields and missing required fields are refused, never trimmed', () => {
  assert.deepEqual(codes(validateEvent({ ...finished(), event_name: 'model_call.whatever' })), ['unknown_event:event_name']);
  assert.deepEqual(codes(validateEvent({ ...finished(), prompt: 'What is a sigmoid?' })), ['unknown_field:prompt']);
  assert.deepEqual(codes(validateEvent(finished({}, { answer: 'x' }))), ['unknown_field:payload.answer']);
  const { environment, ...noEnvironment } = finished();
  assert.deepEqual(codes(validateEvent(noEnvironment)), ['missing_field:environment']);
  assert.deepEqual(codes(validateEvent(makeEvent('model_call.finished', { payload: { provider: 'anthropic' } }, producer))), ['missing_field:payload.task']);
  assert.deepEqual(codes(validateEvent(null)), ['not_an_object']);
  assert.deepEqual(codes(validateEvent([])), ['not_an_object']);
});

test('identifiers and tokens refuse emails, sentences, URLs and query strings', () => {
  for (const user_ref of ['person@example.com', 'two words', 'a?b=c', 'x'.repeat(129), '']) {
    assert.deepEqual(codes(validateEvent(finished({ user_ref }))), ['invalid_field:user_ref'], user_ref);
  }
  assert.deepEqual(codes(validateEvent(finished({}, { served_model: 'https://evil.example/x' }))), ['invalid_field:payload.served_model']);
  assert.deepEqual(codes(validateEvent(finished({ environment: 'staging' }))), ['invalid_field:environment']);
  assert.deepEqual(codes(validateEvent(finished({ outcome: 'great' }))), ['invalid_field:outcome']);
  assert.deepEqual(codes(validateEvent(finished({}, { duration_ms: -1 }))), ['invalid_field:payload.duration_ms']);
  assert.deepEqual(codes(validateEvent(finished({}, { duration_ms: 1.5 }))), ['invalid_field:payload.duration_ms']);
  assert.deepEqual(codes(validateEvent(finished({ schema_version: 2 }))), ['invalid_field:schema_version']);
  assert.deepEqual(codes(validateEvent(finished({ versions: { prompt: 'abc123', secret: 'x' } }))), ['invalid_field:versions']);
  assert.deepEqual(codes(validateEvent(finished({}, { usage: { input_tokens: 1, text: 'hello' } }))), ['invalid_field:payload.usage']);
});

test('oversized payloads and events are refused', () => {
  const many = Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`k${i}`, 1]));
  assert.deepEqual(codes(validateEvent(finished({}, many))), ['too_large:payload']);
  assert.deepEqual(codes(validateEvent({ ...finished(), padding: 'x'.repeat(LIMITS.eventBytes) })), ['too_large']);
  const cyclic = finished(); cyclic.payload.self = cyclic;
  assert.equal(validateEvent(cyclic).ok, false, 'an unserialisable event is refused, not thrown');
});

test('a browser batch keeps its valid events, counts the refused ones and refuses a flood whole', () => {
  const good = makeEvent('client.error', { payload: { kind: 'uncaught', fingerprint: 'ab12cd34', route: '/apps/:id' } }, { ...producer, service: 'web' });
  const result = validateBatch([good, { ...good, payload: { ...good.payload, message: 'TypeError: x' } }]);
  assert.equal(result.ok, true);
  assert.equal(result.events.length, 1);
  assert.equal(result.rejected, 1);
  assert.deepEqual(codes(validateBatch(Array.from({ length: LIMITS.batchEvents + 1 }, () => good))), ['too_large']);
  assert.deepEqual(codes(validateBatch('nope')), ['not_an_object']);
});

test('usageSnapshot keeps allowlisted provider fields, flattens one level and never fabricates zeros', () => {
  // Anthropic, with a 1-hour cache write and a web search.
  assert.deepEqual(usageSnapshot({ input_tokens: 12, output_tokens: 30, cache_creation_input_tokens: 2048, cache_read_input_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 2048 }, server_tool_use: { web_search_requests: 1 }, service_tier: 'standard',
    iterations: [{ type: 'message' }] }), { input_tokens: 12, output_tokens: 30, cache_creation_input_tokens: 2048, cache_read_input_tokens: 0,
    'cache_creation.ephemeral_5m_input_tokens': 0, 'cache_creation.ephemeral_1h_input_tokens': 2048, 'server_tool_use.web_search_requests': 1, service_tier: 'standard' });
  // OpenAI chat: cached and reasoning tokens kept as reported, totals not recomputed.
  assert.deepEqual(usageSnapshot({ prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 64 }, completion_tokens_details: { reasoning_tokens: 8 } }),
    { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, 'prompt_tokens_details.cached_tokens': 64, 'completion_tokens_details.reasoning_tokens': 8 });
  // A message_start usage with only input: output stays absent, not 0.
  assert.deepEqual(usageSnapshot({ input_tokens: 5 }), { input_tokens: 5 });
  assert.equal(usageSnapshot({ text: 'x', input_tokens: -3 }), null);
  assert.equal(usageSnapshot(null), null);
});

test('route templates drop tokens, ids, slugs, handles and queries', () => {
  assert.equal(routeTemplate('/b/AbCdEfGhIjKlMnOpQrStUv?x=1#frag'), '/b/:token');
  assert.equal(routeTemplate('/apps/repo-secret-project'), '/apps/:id');
  assert.equal(routeTemplate('/apps/canvas-1a2b3c4d/runs/42'), '/apps/:id/runs/:id');
  assert.equal(routeTemplate('/c/0f8fad5b-d9cb-469f-a165-70867728950e'), '/c/:id');
  assert.equal(routeTemplate('/@someone'), '/:handle');
  assert.equal(routeTemplate('/owner/telemetry'), '/owner/telemetry');
  assert.equal(routeTemplate(''), '/');
});

test('the environment is explicit: unset writes nowhere, test is always test', () => {
  assert.equal(telemetryEnvironment({}), null);
  assert.equal(telemetryEnvironment({ TELEMETRY_ENVIRONMENT: 'staging' }), null);
  assert.equal(telemetryEnvironment({ TELEMETRY_ENVIRONMENT: 'production' }), 'production');
  assert.equal(telemetryEnvironment({ SMALL_ENV: 'test', TELEMETRY_ENVIRONMENT: 'production' }), 'test');
});

test('retention defaults are the brief starting values and overrides are bounded', () => {
  assert.deepEqual(retentionConfig({}), { eventsDays: 30, archiveDays: 90, aggregatesDays: 395 });
  assert.deepEqual(retentionConfig({ TELEMETRY_EVENTS_RETENTION_DAYS: '14', TELEMETRY_ARCHIVE_RETENTION_DAYS: '-1', TELEMETRY_AGGREGATES_RETENTION_DAYS: '99999' }),
    { eventsDays: 14, archiveDays: 90, aggregatesDays: 395 });
});

test('every registered event has a payload allowlist with only known field shapes', () => {
  for (const [name, rules] of Object.entries(EVENTS)) {
    assert.match(name, /^[a-z_]+\.[a-z_]+$/, name);
    for (const [field, rule] of Object.entries(rules)) assert.ok(rule.check || ['id', 'token', 'hex', 'route', 'int', 'ms', 'bool', 'rate', 'usage'].includes(rule.type), `${name}.${field}`);
  }
});
