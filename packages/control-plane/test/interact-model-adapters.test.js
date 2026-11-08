// INT-07A-C03 to C06: the Anthropic and OpenAI-compatible adapters, result normalization and the exclusive oneOf rewrite.
// Every transport here is a deterministic fake; a tripwire on globalThis.fetch proves no test makes a network call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InteractModelError, canonical, createAnthropicAdapter, createOpenAICompatibleAdapter, exclusiveOneOfToAnyOf, normalizeStructured, schemaProblems, usesOneOf } from '../src/interact-model-adapters.js';

const PLAN = { type: 'object', additionalProperties: false, required: ['title', 'n'], properties: { title: { type: 'string', minLength: 1 }, n: { type: 'integer', minimum: 0 } } };
const png = { media_type: 'image/png', data: 'iVBORw0KGgo=' };
const opus = { role: 'design_author', task: 'interact_design_author', provider: 'anthropic', model: 'claude-opus-5-5', adapter: 'anthropic', credentialRef: 'ANTHROPIC_API_KEY', maxOutputTokens: 12000, maxInputBytes: 60000, maxImages: 4, timeoutMs: 120000, settings: {} };
const candidate = (extra = {}) => ({ role: 'design_review', task: 'interact_design_review', provider: 'celeris', model: 'celeris-x', adapter: 'openai-compatible', credentialRef: 'CELERIS_API_KEY', endpoint: 'https://inference.celeris.ai/v1/', maxOutputTokens: 6000, maxInputBytes: 60000, maxImages: 4, timeoutMs: 120000, settings: { temperature: 0.2 }, capabilities: { vision: true, structuredOutput: 'json_schema', oneOf: 'native', settings: ['temperature'] }, ...extra });

test.beforeEach(t => {
  const original = globalThis.fetch, log = console.log;
  globalThis.fetch = () => { throw new Error('network call in a fixture test'); };
  console.log = () => {};
  t.after(() => { globalThis.fetch = original; console.log = log; });
});

const message = (content, extra = {}) => ({ model: 'claude-opus-5-5-20260101', stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 20 }, content, ...extra });
const toolUse = (input, name = 'return_result') => ({ type: 'tool_use', id: 't1', name, input });
const anthropicWith = (reply, record = []) => createAnthropicAdapter({ env: {}, callModel: async (env, body, model, org) => { record.push({ env, body, model, org }); return reply instanceof Response ? reply : Response.json(reply); } });

// ---- schema subset ----
test('schemaProblems enforces the supported keywords and refuses ones it cannot enforce', () => {
  assert.deepEqual(schemaProblems(PLAN, { title: 'a', n: 1 }), []);
  assert.deepEqual(schemaProblems(PLAN, { title: '', n: -1, extra: 1 }), ['$.title: shorter than 1', '$.n: below 0', '$.extra: not an allowed field']);
  assert.deepEqual(schemaProblems(PLAN, { title: 'a' }), ['$.n: required']);
  const either = { anyOf: [{ type: 'string' }, { type: 'integer' }] };
  assert.deepEqual(schemaProblems(either, 3), []);
  assert.deepEqual(schemaProblems(either, true), ['$: matches none of the alternatives']);
  assert.throws(() => schemaProblems({ $ref: '#/x' }, {}), { code: 'unsupported_schema' });
  assert.throws(() => schemaProblems({ allOf: [] }, {}), { code: 'unsupported_schema' });
});

// ---- C06 exclusive oneOf ----
const kind = (value, extra = {}) => ({ type: 'object', required: ['kind'], properties: { kind: { const: value }, ...extra } });
test('a discriminated oneOf becomes anyOf, nested, and the original schema is untouched', () => {
  const original = { type: 'object', properties: { body: { oneOf: [kind('a', { x: { type: 'number' } }), kind('b')] }, list: { type: 'array', items: { oneOf: [kind('c'), kind('d')] } } } };
  const before = canonical(original), sent = exclusiveOneOfToAnyOf(original);
  assert.equal(canonical(original), before);
  assert.equal(usesOneOf(sent), false);
  assert.equal(usesOneOf(original), true);
  assert.equal(sent.properties.body.anyOf.length, 2);
  assert.equal(sent.properties.list.items.anyOf.length, 2);
});

test('a nonexclusive union is refused, never weakened to anyOf', () => {
  const cases = {
    'no shared const': { oneOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { type: 'object', properties: { b: { type: 'string' } } }] },
    'same const twice': { oneOf: [kind('a'), kind('a', { y: { type: 'string' } })] },
    'const not required': { oneOf: [{ type: 'object', properties: { kind: { const: 'a' } } }, { type: 'object', properties: { kind: { const: 'b' } } }] },
    'one alternative': { oneOf: [kind('a')] },
    'primitive overlap': { oneOf: [{ type: 'number' }, { type: 'integer' }] },
  };
  for (const [name, schema] of Object.entries(cases)) assert.throws(() => exclusiveOneOfToAnyOf({ type: 'object', properties: { v: schema } }), { code: 'schema_not_exclusive' }, name);
});

test('a property that is merely NAMED oneOf is not a union', () => {
  const schema = { type: 'object', properties: { oneOf: { type: 'string' } } };
  assert.equal(usesOneOf(schema), false);
  assert.deepEqual(exclusiveOneOfToAnyOf(schema), schema);
});

test('exclusive oneOf is enforced on the returned data against the ORIGINAL schema', () => {
  const schema = { type: 'object', required: ['v'], properties: { v: { oneOf: [kind('a'), kind('b')] } } };
  assert.deepEqual(schemaProblems(schema, { v: { kind: 'a' } }), []);
  assert.deepEqual(schemaProblems(schema, { v: { kind: 'z' } }), ['$.v: matches 0 of the exclusive alternatives, not exactly one']);
});

// ---- C05 normalization ----
test('normalizeStructured returns one validated object and records why it refuses anything else', () => {
  const ok = { title: 'T', n: 2 }, run = (candidates, extra = {}) => normalizeStructured({ candidates, schema: PLAN, ...extra });
  assert.deepEqual(run([{ source: 'message', text: ` ${JSON.stringify(ok)}\n` }]), ok);
  assert.deepEqual(run([{ source: 'tool call', value: ok }, { source: 'message', text: JSON.stringify({ n: 2, title: 'T' }) }]), ok, 'the same result twice (key order aside) is one result');
  const reason = (candidates, extra) => { try { run(candidates, extra); } catch (e) { assert.ok(e instanceof InteractModelError); assert.equal(e.sent, true); return e.code; } return null; };
  assert.equal(reason([{ source: 'message', text: '```json\n{"title":"T","n":2}\n```' }]), 'fenced_json');
  assert.equal(reason([{ source: 'message', text: 'Here you go: {"title":"T","n":2}' }]), 'malformed_json');
  assert.equal(reason([{ source: 'message', text: '{"title":"T","n":2,}' }]), 'malformed_json');
  assert.equal(reason([{ source: 'message', text: '{"title":"T","n":2' }]), 'malformed_json');
  assert.equal(reason([{ source: 'tool call', value: ok }, { source: 'tool call', value: { title: 'Other', n: 3 } }]), 'conflicting_results');
  assert.equal(reason([]), 'no_result');
  assert.equal(reason([{ source: 'tool call', value: ok }], { truncated: true }), 'truncated');
  assert.equal(reason([{ source: 'tool call', value: ok }], { refused: true }), 'refused');
  assert.equal(reason([{ source: 'tool call', value: [1] }]), 'not_object');
  assert.equal(reason([{ source: 'tool call', value: { title: 'T' } }]), 'schema_mismatch');
  assert.equal(reason([{ source: 'tool call', value: { title: 'T', n: '2' } }]), 'schema_mismatch', 'no coercion: "2" is not 2');
});

test('a result nested under one undefined key is unwrapped only when the inner value satisfies the schema in full', () => {
  const ok = { title: 'T', n: 2 }, run = value => normalizeStructured({ candidates: [{ source: 'tool call', value }], schema: PLAN });
  assert.deepEqual(run({ plan: ok }), ok, 'the {"plan": {...}} slip seen in real runs');
  assert.deepEqual(run({ whatever: { title: 'T', n: 2 } }), ok);
  assert.throws(() => run({ plan: { title: 'T' } }), error => error.code === 'schema_mismatch', 'an invalid inner value is still refused');
  assert.throws(() => run({ plan: ok, extra: 1 }), error => error.code === 'schema_mismatch', 'two keys are never unwrapped');
  assert.throws(() => run({ plan: { plan: ok } }), error => error.code === 'schema_mismatch', 'one level only');
});

// ---- C03 Anthropic ----
test('the Anthropic adapter sends one tool on auto with the config limits and parses exactly one tool call', async () => {
  const record = [], adapter = anthropicWith(message([toolUse({ title: 'T', n: 1 })]), record);
  const result = await adapter.call({ config: opus, system: 'Be exact.', schema: PLAN, input: { ask: 'x' }, images: [png] });
  assert.deepEqual(result.output, { title: 'T', n: 1 });
  const { body, model, org } = record[0];
  assert.equal(model, 'claude-opus-5-5');
  assert.equal(org, null);
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'system', 'tool_choice', 'tools']);
  assert.equal(body.max_tokens, 12000);
  assert.deepEqual(body.tool_choice, { type: 'auto' });
  assert.equal(body.tools.length, 1);
  assert.deepEqual(body.tools[0].input_schema, PLAN);
  assert.deepEqual(body.system, [{ type: 'text', text: 'Be exact.', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(body.messages[0].content[1], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.data } });
  assert.deepEqual(result.requested, { provider: 'anthropic', model: 'claude-opus-5-5' });
  assert.deepEqual(result.served, { provider: 'anthropic', model: 'claude-opus-5-5-20260101' });
  assert.deepEqual(result.usage.quantities, { input: 100, output: 50, cache_read: 10, cache_write_5m: 20, cache_write_1h: 0 });
  assert.equal(result.stopReason, 'complete');
  assert.equal(typeof result.timing.ms, 'number');
});

test('the Anthropic adapter sends no effort or fallback unless the config names one', async () => {
  const record = [], adapter = anthropicWith(message([toolUse({ title: 'T', n: 1 })]), record);
  await adapter.call({ config: { ...opus, settings: { effort: 'low' } }, system: 's', schema: PLAN, input: 'x' });
  assert.deepEqual(record[0].body.output_config, { effort: 'low' });
  assert.ok(!('thinking' in record[0].body) && !('fallbacks' in record[0].body) && !('betas' in record[0].body));
});

test('the Anthropic adapter rejects truncated, absent, duplicate-conflicting and wrong-tool replies, keeping the billed usage', async () => {
  const run = async content_ => { try { await anthropicWith(content_).call({ config: opus, system: 's', schema: PLAN, input: 'x' }); } catch (e) { return e; } };
  const ok = toolUse({ title: 'T', n: 1 });
  const truncated = await run(message([ok], { stop_reason: 'max_tokens' }));
  assert.equal(truncated.code, 'truncated');
  assert.deepEqual(truncated.usage.quantities.output, 50, 'a truncated reply was still billed');
  assert.equal((await run(message([]))).code, 'no_result');
  assert.equal((await run(message([ok, toolUse({ title: 'U', n: 2 })]))).code, 'conflicting_results');
  assert.equal(await run(message([ok, ok])), undefined, 'an identical duplicate is one result');
  assert.equal((await run(message([toolUse({ title: 'T', n: 1 }, 'other')]))).code, 'unexpected_tool');
  assert.equal((await run(message([toolUse({ title: 'T' })]))).code, 'schema_mismatch');
  assert.equal((await run(message([ok], { stop_reason: 'refusal' }))).code, 'refused');
});

test('the Anthropic adapter keeps the existing response and error semantics', async () => {
  const fail = async response => { try { await anthropicWith(response).call({ config: opus, system: 's', schema: PLAN, input: 'x' }); } catch (e) { return e; } };
  const spend = await fail(Response.json({ code: 'spend_limited', error: 'AI is paused.', reason: 'cap_unset' }, { status: 429 }));
  assert.deepEqual([spend.code, spend.sent], ['spend_refused', false]);
  const overloaded = await fail(new Response('{}', { status: 529 }));
  assert.deepEqual([overloaded.code, overloaded.refusedByProvider], ['provider_unavailable', true]);
  assert.equal((await fail(Response.json({ error: { type: 'not_found_error' } }, { status: 404 }))).code, 'model_unavailable');
  const http = await fail(Response.json({ error: { message: 'bad' } }, { status: 400 }));
  assert.deepEqual([http.code, http.sent, http.providerStatus], ['http_error', true, 400]);
  await assert.rejects(() => createAnthropicAdapter({ env: {} }).call({ config: opus, system: 's', schema: PLAN, input: 'x' }), { code: 'no_transport', sent: false });
  await assert.rejects(() => anthropicWith({}).call({ config: opus, system: 's', schema: PLAN, input: 'x', images: [{ media_type: 'image/svg+xml', data: 'x' }] }), { code: 'image_unsupported', sent: false });
});

test('an abort rejects a pending Anthropic call at once', async () => {
  const controller = new AbortController(), adapter = createAnthropicAdapter({ env: {}, callModel: () => new Promise(() => {}) });
  const pending = adapter.call({ config: opus, system: 's', schema: PLAN, input: 'x', signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { aborted: true });
});

// ---- C04 OpenAI-compatible ----
const completion = (message_, extra = {}) => ({ model: 'celeris-x', choices: [{ message: message_, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 400 }, completion_tokens_details: { reasoning_tokens: 50 } }, ...extra });
const compat = (reply, record = [], env = { CELERIS_API_KEY: 'k' }) => createOpenAICompatibleAdapter({ env, fetch: async (url, init) => { record.push({ url, init, body: JSON.parse(init.body) }); return reply instanceof Response ? reply : Response.json(reply); } });

test('the OpenAI-compatible adapter sends a strict json_schema request to the allowlisted endpoint with the env credential', async () => {
  const record = [], json = JSON.stringify({ title: 'T', n: 1 });
  const result = await compat(completion({ content: json }), record).call({ config: candidate(), system: 'sys', schema: PLAN, input: 'in', images: [png] });
  assert.deepEqual(result.output, { title: 'T', n: 1 });
  const { url, init, body } = record[0];
  assert.equal(url, 'https://inference.celeris.ai/v1/chat/completions');
  assert.equal(init.headers.Authorization, 'Bearer k');
  assert.equal(body.model, 'celeris-x');
  assert.equal(body.stream, false);
  assert.equal(body.max_tokens, 6000);
  assert.equal(body.temperature, 0.2);
  assert.deepEqual(body.response_format, { type: 'json_schema', json_schema: { name: 'return_result', strict: true, schema: PLAN } });
  assert.deepEqual(body.messages[0], { role: 'system', content: 'sys' });
  assert.deepEqual(body.messages[1].content[1], { type: 'image_url', image_url: { url: `data:image/png;base64,${png.data}` } });
  assert.ok(!JSON.stringify(body).includes('make_explanation') && !/650/.test(JSON.stringify(body)), 'no written-card instruction or schema is inherited');
  assert.deepEqual(result.served, { provider: 'celeris', model: 'celeris-x' });
  assert.deepEqual(result.usage, { quantities: { input: 600, output: 200, cache_read: 400 }, reasoningTokens: 50, raw: completion({}).usage });
  assert.equal(result.stopReason, 'complete');
});

test('a tool-call reply and a JSON-content reply normalize to the same output', async () => {
  const ok = { title: 'T', n: 1 };
  const viaTool = await compat(completion({ tool_calls: [{ function: { name: 'x', arguments: JSON.stringify(ok) } }] })).call({ config: candidate(), system: 's', schema: PLAN, input: 'x' });
  const viaContent = await compat(completion({ content: JSON.stringify(ok) })).call({ config: candidate(), system: 's', schema: PLAN, input: 'x' });
  assert.deepEqual(viaTool.output, viaContent.output);
});

test('the OpenAI-compatible adapter records why it rejects a reply and keeps unknown usage unknown', async () => {
  const run = async (reply, config = candidate()) => { try { await compat(reply).call({ config, system: 's', schema: PLAN, input: 'x' }); } catch (e) { return e; } };
  const json = JSON.stringify({ title: 'T', n: 1 });
  assert.equal((await run(completion({ content: json }, { choices: [{ message: { content: json }, finish_reason: 'length' }] }))).code, 'truncated');
  assert.equal((await run(completion({ content: `\`\`\`json\n${json}\n\`\`\`` }))).code, 'fenced_json');
  assert.equal((await run(completion({ content: `Sure! ${json}` }))).code, 'malformed_json');
  assert.equal((await run(completion({ content: json, tool_calls: [{ function: { arguments: JSON.stringify({ title: 'Z', n: 9 }) } }] }))).code, 'conflicting_results');
  assert.equal((await run(completion({ content: null }))).code, 'no_result');
  assert.equal((await run(completion({ content: null, refusal: 'no' }))).code, 'refused');
  const noUsage = await run(completion({ content: '{"title":"T"}' }, { usage: undefined }));
  assert.equal(noUsage.code, 'schema_mismatch');
  assert.equal(noUsage.usage.quantities, null, 'absent usage is null, not zero');
});

test('the OpenAI-compatible adapter refuses before any request when the credential, schema or capability is missing', async () => {
  const record = [], oneOf = { type: 'object', properties: { v: { oneOf: [{ type: 'number' }, { type: 'integer' }] } } };
  const ask = (config, env, schema = PLAN) => compat(completion({ content: '{}' }), record, env).call({ config, system: 's', schema, input: 'x' });
  await assert.rejects(() => ask(candidate(), {}), { code: 'credential_missing', sent: false });
  await assert.rejects(() => ask(candidate({ capabilities: { vision: true, structuredOutput: 'json_schema', oneOf: 'anyOf', settings: ['temperature'] } }), { CELERIS_API_KEY: 'k' }, oneOf), { code: 'schema_not_exclusive', sent: false });
  await assert.rejects(() => ask(candidate({ capabilities: { vision: true, structuredOutput: 'json_schema', oneOf: 'none', settings: ['temperature'] } }), { CELERIS_API_KEY: 'k' }, oneOf), { code: 'capability_schema', sent: false });
  await assert.rejects(() => createOpenAICompatibleAdapter({ env: { CELERIS_API_KEY: 'k' } }).call({ config: candidate(), system: 's', schema: PLAN, input: 'x' }), { code: 'no_transport' });
  assert.equal(record.length, 0, 'none of these sent a request');
});

test('a provider that needs anyOf receives the rewritten schema and the data is checked against the original', async () => {
  const schema = { type: 'object', required: ['v'], properties: { v: { oneOf: [kind('a'), kind('b')] } } };
  const config = candidate({ capabilities: { vision: false, structuredOutput: 'json_schema', oneOf: 'anyOf', settings: ['temperature'] } });
  const record = [];
  const good = await compat(completion({ content: JSON.stringify({ v: { kind: 'a' } }) }), record).call({ config, system: 's', schema, input: 'x' });
  assert.deepEqual(good.output, { v: { kind: 'a' } });
  assert.equal(usesOneOf(record[0].body.response_format.json_schema.schema), false);
  await assert.rejects(() => compat(completion({ content: JSON.stringify({ v: { kind: 'zzz' } }) })).call({ config, system: 's', schema, input: 'x' }), { code: 'schema_mismatch' });
});

test('HTTP failures are explicit and never retried on another model', async () => {
  const record = [], run = async response => { try { await compat(response, record).call({ config: candidate(), system: 's', schema: PLAN, input: 'x' }); } catch (e) { return e; } };
  assert.equal((await run(new Response('{}', { status: 429 }))).code, 'provider_unavailable');
  assert.equal((await run(Response.json({ error: { message: 'x' } }, { status: 500 }))).code, 'http_error');
  assert.equal(record.length, 2, 'one request each');
});
