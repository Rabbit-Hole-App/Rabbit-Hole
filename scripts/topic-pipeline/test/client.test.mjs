import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '../agents/client.mjs';

const schema = { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } };
const system = 'Return the requested JSON.';
const options = { schema, system };
const configFixture = () => ({
  anthropic: { apiKey: 'test-anthropic-key', endpoint: 'https://anthropic.invalid/messages', apiVersion: '2026-10-21',
    reviewerModel: 'claude-fable-5-1', judgeModel: 'claude-sonnet-5-5', effort: 'high' },
  openai: { apiKey: 'test-openai-key', endpoint: 'https://openai.invalid/responses',
    authorModel: 'gpt-6.1-sol', reasoningEffort: 'max', api: 'responses' },
  limits: { authorRounds: 3, verifyRounds: 2, regenerateOnce: true, perLessonUsd: 100 },
  prices: {
    'claude-fable-5-1': { inputPerMillionUsd: 10, outputPerMillionUsd: 50 },
    'claude-sonnet-5-5': { inputPerMillionUsd: 2, outputPerMillionUsd: 10 },
    'gpt-6.1-sol': { inputPerMillionUsd: 2, outputPerMillionUsd: 10 },
    'jev-latest': { inputPerMillionUsd: 1, outputPerMillionUsd: 0 },
  },
});
const openaiBody = (text = '{"ok":true}', usage = {}) => ({
  object: 'response', status: 'completed', error: null, incomplete_details: null,
  output: [{ type: 'reasoning', summary: [] }, { type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }] }],
  usage: { input_tokens: 200, output_tokens: 100, output_tokens_details: { reasoning_tokens: 60 }, ...usage },
});
const anthropicBody = (text = '{"ok":true}', usage = {}) => ({
  type: 'message', role: 'assistant', stop_reason: 'end_turn', stop_sequence: null,
  content: [{ type: 'thinking', thinking: 'not persisted', signature: 'signature' }, { type: 'text', text }],
  usage: { input_tokens: 100, output_tokens: 50, output_tokens_details: { thinking_tokens: 30 }, ...usage },
});
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function setup(t, fetchImpl, configure = () => {}, initial = {}) {
  const topicDir = await mkdtemp(join(tmpdir(), 'topic-client-'));
  t.after(() => rm(topicDir, { recursive: true, force: true }));
  const config = configFixture(); configure(config);
  const state = { version: 1, topic: 'decision-trees', calls: [], stages: {}, spendUsd: 0, ...initial };
  return { client: createClient({ config, state, topicDir, fetchImpl }), config, state,
    saved: async () => JSON.parse(await readFile(join(topicDir, 'state.json'), 'utf8')) };
}

test('author runs in background mode and polls the stored response until it completes', async t => {
  const requests = [];
  const { client, state } = await setup(t, async (url, init) => {
    requests.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    if (requests.length === 1) return response({ id: 'resp_1', object: 'response', status: 'queued' });
    if (requests.length === 2) return response({ id: 'resp_1', object: 'response', status: 'in_progress' });
    return response({ id: 'resp_1', ...openaiBody() });
  }, config => { config.openai.pollMs = 1; });
  assert.deepEqual(await client.call('author', { lesson: 'text' }, options), { ok: true });
  assert.equal(requests[0].body.background, true);
  assert.equal(requests[0].body.store, true);
  assert.deepEqual(requests.slice(1).map(request => [request.method, request.url]), [
    ['GET', 'https://openai.invalid/responses/resp_1'], ['GET', 'https://openai.invalid/responses/resp_1']]);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].usd, 0.0014);
});

test('a background poll that times out records unknown usage with the response id', async t => {
  const { client, state } = await setup(t, async () => response({ id: 'resp_2', object: 'response', status: 'in_progress' }),
    config => { config.openai.pollMs = 1; config.openai.pollTimeoutMs = 5; });
  await assert.rejects(client.call('author', { lesson: 'text' }, options), /transport failed/);
  assert.equal(state.calls[0].usageKnown, false);
  assert.equal(state.calls[0].responseId, 'resp_2');
});

test('author serializes Responses structured JSON and charges reasoning within output once', async t => {
  let request;
  const { client, state, saved } = await setup(t, async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return response(openaiBody());
  });
  assert.deepEqual(await client.call('author', { lesson: 'text' }, options), { ok: true });
  assert.equal(request.url, 'https://openai.invalid/responses');
  assert.equal(request.init.headers.Authorization, 'Bearer test-openai-key');
  assert.equal(request.body.model, 'gpt-6.1-sol');
  assert.deepEqual(request.body.reasoning, { effort: 'max' });
  assert.deepEqual(request.body.text.format, { type: 'json_schema', name: 'author', schema, strict: true });
  assert.equal(request.body.instructions, system);
  assert.equal(request.body.max_output_tokens, 40000);
  assert.deepEqual(request.body.tools, []);
  assert.equal(request.body.tool_choice, 'none');
  assert.equal(request.body.temperature, undefined);
  assert.equal(request.body.stream, false);
  assert.ok(JSON.stringify(request.body.input).includes('lesson'));
  assert.equal(state.calls[0].inputTokens, 200);
  assert.equal(state.calls[0].outputTokens, 100);
  assert.equal(state.calls[0].reasoningTokens, 60);
  assert.equal(state.calls[0].usd, 0.0014);
  assert.equal((await saved()).spendUsd, 0.0014);
  assert.equal(JSON.stringify(await saved()).includes('not persisted'), false);
});

test('reviewer sends PNG and JPEG vision blocks through Messages with configured effort and version', async t => {
  let request;
  const { client } = await setup(t, async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return response(anthropicBody());
  });
  const images = [{ data: 'cG5n', mediaType: 'image/png' }, { data: 'anBlZw==', mediaType: 'image/jpeg' }];
  assert.deepEqual(await client.call('verifier', { numbers: [1] }, { ...options, images }), { ok: true });
  assert.equal(request.url, 'https://anthropic.invalid/messages');
  assert.equal(request.init.headers['x-api-key'], 'test-anthropic-key');
  assert.equal(request.init.headers['anthropic-version'], '2026-10-21');
  assert.equal(request.body.model, 'claude-fable-5-1');
  assert.equal(request.body.max_tokens, 20000);
  assert.equal(request.body.max_output_tokens, undefined);
  assert.equal(request.body.system, system);
  assert.equal(request.body.output_config.effort, 'high');
  assert.deepEqual(request.body.output_config.format, { type: 'json_schema', schema });
  assert.deepEqual(request.body.messages[0].content.filter(block => block.type === 'image'), [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'cG5n' } },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'anBlZw==' } },
  ]);
  assert.equal(request.body.temperature, undefined);
});

test('judge uses the smaller configured model and each agent keeps its output ceiling', async t => {
  const requests = [];
  const { client } = await setup(t, async (_url, init) => {
    const body = JSON.parse(init.body); requests.push(body);
    return response(body.reasoning ? openaiBody() : anthropicBody());
  });
  for (const agent of ['prompt-writer', 'coverage-judge', 'author', 'verifier', 'auditor']) await client.call(agent, {}, options);
  assert.deepEqual(requests.map(body => [body.model, body.max_tokens ?? body.max_output_tokens]), [
    ['claude-fable-5-1', 20000], ['claude-sonnet-5-5', 200], ['gpt-6.1-sol', 40000],
    ['claude-fable-5-1', 20000], ['claude-fable-5-1', 20000],
  ]);
});

test('model and effort flags select only config overrides and their configured prices', async t => {
  const requests = [];
  const { client, state } = await setup(t, async (_url, init) => {
    const body = JSON.parse(init.body); requests.push(body);
    return response(body.reasoning ? openaiBody() : anthropicBody());
  }, config => {
    config.overrides = { 'author-model': 'author-test', 'author-effort': 'high', 'reviewer-model': 'reviewer-test',
      'reviewer-effort': 'medium', 'judge-model': 'judge-test' };
    for (const model of ['author-test', 'reviewer-test', 'judge-test']) config.prices[model] = { inputPerMillionUsd: 1, outputPerMillionUsd: 2 };
  });
  await client.call('author', {}, options);
  await client.call('verifier', {}, options);
  await client.call('coverage-judge', {}, options);
  assert.deepEqual(requests.map(body => [body.model, body.reasoning?.effort ?? body.output_config.effort]), [
    ['author-test', 'high'], ['reviewer-test', 'medium'], ['judge-test', 'medium'],
  ]);
  assert.equal(state.calls[0].usd, 0.0004);
});

test('malformed JSON is charged before one reask with validation feedback', async t => {
  const requests = [];
  const { client, state, saved } = await setup(t, async (_url, init) => {
    const body = JSON.parse(init.body); requests.push(body);
    return response(openaiBody(requests.length === 1 ? 'broken-json' : '{"ok":true}'));
  });
  assert.deepEqual(await client.call('author', {}, options), { ok: true });
  assert.equal(requests.length, 2);
  assert.match(JSON.stringify(requests[1].input), /valid JSON|validation/i);
  assert.equal(state.calls.length, 2);
  assert.equal(state.spendUsd, 0.0028);
  assert.equal((await saved()).calls.length, 2);
});

test('schema failure stops after two paid attempts without leaking response content', async t => {
  let count = 0;
  const { client, state, saved } = await setup(t, async () => {
    count++;
    return response(anthropicBody('{"ok":"private-response-text"}'));
  });
  await assert.rejects(client.call('prompt-writer', {}, options), error => {
    assert.match(error.message, /schema|validation/i);
    assert.equal(error.message.includes('private-response-text'), false);
    return true;
  });
  assert.equal(count, 2);
  assert.equal(state.calls.length, 2);
  assert.equal((await saved()).spendUsd, 0.007);
});

test('working custom validation errors are included in the single reask', async t => {
  const requests = [];
  let validations = 0;
  const { client } = await setup(t, async (_url, init) => {
    requests.push(JSON.parse(init.body)); return response(anthropicBody());
  });
  const validate = value => { if (++validations === 1) throw new Error('Expected twelve unique teaching points'); return value; };
  await client.call('prompt-writer', {}, { ...options, validate });
  assert.equal(requests.length, 2);
  assert.match(JSON.stringify(requests[1].messages), /Expected twelve unique teaching points/);
});

test('Anthropic transport schema drops unsupported constraints while local validation retains them', async t => {
  const constrained = { type: 'object', additionalProperties: false, required: ['count', 'labels'], properties: {
    count: { type: 'integer', minimum: 2, maximum: 3 },
    labels: { type: 'array', minItems: 2, maxItems: 2, uniqueItems: true, items: { type: 'string', minLength: 3, maxLength: 10 } },
  } };
  const requests = [];
  const { client } = await setup(t, async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return response(anthropicBody(JSON.stringify({ count: requests.length, labels: ['one', 'two'] })));
  });
  assert.deepEqual(await client.call('verifier', {}, { system, schema: constrained }), { count: 2, labels: ['one', 'two'] });
  const sent = requests[0].output_config.format.schema;
  assert.equal(sent.properties.count.minimum, undefined);
  assert.equal(sent.properties.labels.maxItems, undefined);
  assert.equal(sent.properties.labels.uniqueItems, undefined);
  assert.equal(sent.properties.labels.items.minLength, undefined);
  assert.match(sent.properties.count.description, /minimum.*2/);
  assert.match(JSON.stringify(requests[1].messages), /minimum|>= 2/);
  assert.equal(constrained.properties.count.minimum, 2);
});

test('text and image estimates reject an over-ceiling request before any provider call', async t => {
  let count = 0;
  const { client, state } = await setup(t, async () => { count++; return response(anthropicBody()); });
  const image = { data: 'cG5n', mediaType: 'image/png' };
  await assert.rejects(client.call('auditor', {}, { ...options, images: Array(13).fill(image) }), /input.*ceiling|ceiling.*input/i);
  await assert.rejects(client.call('coverage-judge', { text: 'learning '.repeat(3000) }, options), /input.*ceiling|ceiling.*input/i);
  assert.equal(count, 0);
  assert.equal(state.calls.length, 0);
});

test('preflight spend limit refuses provider calls and actual overrun still saves paid usage', async t => {
  let count = 0;
  const { client } = await setup(t, async () => { count++; return response(openaiBody()); }, config => config.limits.perLessonUsd = 0.01);
  await assert.rejects(client.call('author', {}, options), /estimate|preflight/i);
  assert.equal(count, 0);
  const overrun = await setup(t, async () => { count++; return response(openaiBody('broken-json')); }, () => {}, { estimateUsd: 0.001 });
  await assert.rejects(overrun.client.call('author', {}, options), /spend|estimate/i);
  assert.equal(count, 1);
  assert.equal((await overrun.saved()).spendUsd, 0.0014);
  assert.equal((await overrun.saved()).calls.length, 1);
});

test('HTTP and transport failures never retry or expose keys, endpoints or response bodies', async t => {
  for (const mode of ['http', 'transport']) {
    let count = 0;
    const { client, config, saved } = await setup(t, async () => {
      count++;
      if (mode === 'transport') throw new Error('test-openai-key https://openai.invalid/responses private-transport-text');
      return response({ error: { message: 'test-openai-key private-provider-text' }, usage: openaiBody().usage }, 429);
    });
    await assert.rejects(client.call('author', {}, options), error => {
      for (const privateText of ['test-openai-key', 'openai.invalid', 'private-transport-text', 'private-provider-text']) assert.equal(error.message.includes(privateText), false);
      return true;
    });
    assert.equal(count, 1);
    const state = await saved();
    assert.equal(state.calls.length, 1);
    assert.equal(state.calls[0].usageKnown, mode === 'http');
    assert.equal(state.spendUsd, mode === 'http' ? 0.0014 : 0);
    if (mode === 'transport') {
      await assert.rejects(client.call('author', {}, options), /reconcil|unknown.*usage/i);
      const resumed = createClient({ config, state, topicDir: 'unused', fetchImpl: async () => { count++; } });
      await assert.rejects(resumed.call('author', {}, options), /reconcil|unknown.*usage/i);
      assert.equal(count, 1);
    }
  }
});

test('missing config credentials cannot fall back to environment or default endpoints', async t => {
  let count = 0;
  const { client } = await setup(t, async () => { count++; return response(openaiBody()); }, config => {
    delete config.openai.apiKey; delete config.openai.endpoint;
  });
  await assert.rejects(client.call('author', {}, options), /config|credential|endpoint/i);
  assert.equal(count, 0);
});

test('selected model must be configured and explicit author temperature is honored', async t => {
  let request;
  const { client } = await setup(t, async (_url, init) => { request = JSON.parse(init.body); return response(openaiBody()); }, config => {
    delete config.openai.authorModel;
  });
  await assert.rejects(client.call('author', {}, options), /config|model/i);
  assert.equal(request, undefined);
  const configured = await setup(t, async (_url, init) => { request = JSON.parse(init.body); return response(openaiBody()); }, config => {
    config.openai.temperature = 0.3;
  });
  await configured.client.call('author', {}, options);
  assert.equal(request.temperature, 0.3);
});
