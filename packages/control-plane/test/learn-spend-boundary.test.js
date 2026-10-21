import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { admitSpend, settleSpend, requestSpendBound, spendTransport } from '../src/learn-spend.js';
import { tutorRoute } from '../src/learn-tutor-routes.js';
import { anthropic, planModel, aiCacheDrop } from '../src/ask.js';
import { loggedModel } from '../src/learn-models.js';
import { withSystemUsage } from '../src/learn-usage.js';

// These tests are the platform daily guard's: their calls are explicitly platform-funded system work (withSystemUsage), the
// one kind of call admitted without a session payer since monthly allowance enforcement (owner L12 2026-10-20). The
// allowance itself is tested in learn-allowance.test.js.
const platform = env => withSystemUsage(env);

function ledger(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../learn-migrations/0016-usage-operations.sql', import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const LEARN_DB = { prepare: sql => ({ bind: (...args) => ({
    first: async () => sqlite.prepare(sql).get(...args),
    run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }),
  }) }) };
  return { sqlite, LEARN_DB };
}

test('an admitted dev Tutor request reaches transport and a second affordable request remains usable', async t => {
  const { LEARN_DB } = ledger(t);
  const original = globalThis.fetch;
  let calls = 0;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'https://api.anthropic.com/v1/messages');
    calls++;
    return Response.json({ model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 20 }, stop_reason: 'tool_use',
      content: [{ type: 'tool_use', name: 'tutor_response', input: { constraints_add: [], strategy: 'none', actions: [{ type: 'respond_text', text: 'Synthetic answer.' }] } }] });
  };
  const env = platform({ SMALL_ENV: 'dev', LEARN_DB, ANTHROPIC_API_KEY: 'synthetic-not-a-credential', USAGE_PLATFORM_DAY_USD: '1', TUTOR_PLANNER_FAST_MODEL: 'off' });
  const path = '/api/learn/tutor/plan';
  for (let i = 0; i < 2; i++) {
    const request = new Request(`https://synthetic.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app: 'synthetic', context: { input: 'Explain this synthetic note.', allowed_actions: ['respond_text'] } }) });
    const response = await tutorRoute(path, request, env, { authorize: async () => ({ user_id: 'synthetic', email: 'synthetic@example.test', org: 'synthetic' }) });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(calls, i + 1, 'the default provider path reached only mocked transport');
  }
});

test('a positive settlement does not consume the entire daily cap', async t => {
  const { LEARN_DB } = ledger(t);
  const env = platform({ USAGE_PLATFORM_DAY_USD: '1' });
  const args = opId => ({ opId, userId: 'synthetic', org: 'synthetic', category: 'tutor_plan', reservedUsd: 0.1 });
  assert.equal((await admitSpend(LEARN_DB, env, args('first'))).refused, false);
  await settleSpend(LEARN_DB, 'first', { costUsd: 0.01, calls: 1 });
  assert.equal((await admitSpend(LEARN_DB, env, args('second'))).refused, false, '99 cents remain for the next operation');
});

test('direct provider calls cannot spend beyond the shared daily cap', async t => {
  const { LEARN_DB } = ledger(t);
  const original = globalThis.fetch;
  let calls = 0;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 200 }, content: [{ type: 'text', text: 'Synthetic answer.' }] });
  };
  const env = platform({ SMALL_ENV: 'dev', LEARN_DB, ANTHROPIC_API_KEY: 'synthetic-not-a-credential', USAGE_PLATFORM_DAY_USD: '0.006' });
  const body = { max_tokens: 200, messages: [{ role: 'user', content: 'Synthetic question.' }] };
  // Original .006 reproduction is preserved verbatim in shared evidence. The request's
  // conservative upper liability is already above .006: refuse before either paid call.
  assert.equal((await anthropic(env, body, 'claude-opus-5-5', null)).status, 429);
  assert.equal(calls, 0);
  env.USAGE_PLATFORM_DAY_USD = String(requestSpendBound(body, 'claude-opus-5-5') + 0.002);
  assert.equal((await anthropic(env, body, 'claude-opus-5-5', null)).status, 200);
  assert.equal((await anthropic(env, body, 'claude-opus-5-5', null)).status, 429);
  assert.equal(calls, 1, 'only the affordable mocked transport is admitted');
});


test('concurrent calls cannot both reserve the last affordable slot', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const body = { max_tokens: 200, messages: [{ role: 'user', content: 'Synthetic question.' }] };
  const bound = requestSpendBound(body, 'claude-opus-5-5');
  const env = platform({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: String(bound * 1.5) });
  let release, calls = 0;
  const held = new Promise(resolve => { release = resolve; });
  const transport = async () => { calls++; await held; return Response.json({ model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 20 } }); };
  const first = spendTransport(env, body, 'claude-opus-5-5', 'synthetic', transport);
  await new Promise(resolve => setImmediate(resolve));
  const second = await spendTransport(env, body, 'claude-opus-5-5', 'synthetic', transport);
  assert.equal(second.status, 429);
  assert.equal(calls, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM usage_operations').get().n, 1);
  release();
  assert.equal((await first).status, 200);
  assert.equal((await spendTransport(env, body, 'claude-opus-5-5', 'synthetic', transport)).status, 200, 'positive settlement releases only unused liability');
});

test('unknown usage and transport failures retain their reserved liability', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const body = { max_tokens: 200, messages: [{ role: 'user', content: 'Synthetic question.' }] };
  const bound = requestSpendBound(body, 'claude-opus-5-5');
  const env = platform({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: String(bound * 3) });
  await spendTransport(env, body, 'claude-opus-5-5', 'synthetic', async () => Response.json({ model: 'unknown', usage: { input_tokens: 100, output_tokens: 20 } }));
  await assert.rejects(spendTransport(env, body, 'claude-opus-5-5', 'synthetic', async () => { throw new Error('synthetic disconnect'); }), /synthetic disconnect/);
  const rows = sqlite.prepare('SELECT status,cost_usd FROM usage_operations').all();
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.cost_usd === bound));
  assert.equal(rows[1].status, 'failed');
});

test('an unknown request price or unset cap cannot reach mocked transport even with test-key', async t => {
  const { LEARN_DB } = ledger(t);
  let calls = 0;
  const transport = async () => { calls++; return Response.json({}); };
  const env = platform({ SMALL_ENV: 'production', ANTHROPIC_API_KEY: 'test-key', LEARN_DB });
  const body = { max_tokens: 200, messages: [{ role: 'user', content: 'Synthetic question.' }] };
  assert.equal((await spendTransport(env, body, 'claude-opus-5-5', 'synthetic', transport)).status, 429);
  env.USAGE_PLATFORM_DAY_USD = '1';
  assert.equal((await spendTransport(env, body, 'unpriced', 'synthetic', transport)).status, 429);
  assert.equal((await spendTransport(env, { messages: body.messages }, 'claude-opus-5-5', 'synthetic', transport)).status, 429);
  assert.equal(calls, 0);
});

test('a measured bound violation is charged and stops subsequent admission', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const body = { max_tokens: 20, messages: [{ role: 'user', content: 'Synthetic question.' }] };
  const env = platform({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '10' });
  await spendTransport(env, body, 'claude-opus-5-5', 'synthetic', async () => Response.json({ model: 'claude-opus-5-5', usage: { input_tokens: 10000, output_tokens: 20 } }));
  assert.equal(sqlite.prepare('SELECT error FROM usage_operations').get().error, 'spend_bound_exceeded');
  let calls = 0;
  const response = await spendTransport(env, body, 'claude-opus-5-5', 'synthetic', async () => { calls++; return Response.json({}); });
  assert.equal(response.status, 429);
  assert.equal(calls, 0);
});

const sse = value => `data: ${JSON.stringify(value)}\n\n`;
test('streaming transport settles only after complete usage without buffering the reply', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const body = { max_tokens: 200, stream: true, messages: [{ role: 'user', content: 'Synthetic question.' }] };
  const env = platform({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '1' });
  let source;
  const stream = new ReadableStream({ start(controller) { source = controller; } });
  const response = await spendTransport(env, body, 'claude-opus-5-5', 'synthetic', async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
  assert.equal(sqlite.prepare('SELECT status FROM usage_operations').get().status, 'admitted');
  const reader = response.body.getReader(), encoder = new TextEncoder();
  const first = sse({ type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 0 } } });
  source.enqueue(encoder.encode(first));
  assert.equal(new TextDecoder().decode((await reader.read()).value), first);
  assert.equal(sqlite.prepare('SELECT status FROM usage_operations').get().status, 'admitted');
  source.enqueue(encoder.encode(sse({ type: 'message_delta', usage: { output_tokens: 20 } }) + sse({ type: 'message_stop' })));
  source.close();
  while (!(await reader.read()).done) {}
  const row = sqlite.prepare('SELECT status,cost_usd FROM usage_operations').get();
  assert.equal(row.status, 'settled');
  assert.equal(row.cost_usd, 0.0008);
});

test('a cancelled stream retains its liability and cancels its reader', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const body = { max_tokens: 200, stream: true, messages: [{ role: 'user', content: 'Synthetic question.' }] };
  const env = platform({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '1' });
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const response = await spendTransport(env, body, 'claude-opus-5-5', 'synthetic', async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
  await response.body.cancel('synthetic stop');
  assert.equal(cancelled, true);
  const row = sqlite.prepare('SELECT status,cost_usd FROM usage_operations').get();
  assert.equal(row.status, 'failed');
  assert.equal(row.cost_usd, requestSpendBound(body, 'claude-opus-5-5'));
});

test('aged in-flight liabilities and unknown legacy rows do not vanish from admission', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const env = platform({ USAGE_PLATFORM_DAY_USD: '1' });
  const args = opId => ({ opId, userId: 'synthetic', org: 'synthetic', category: 'tutor_plan', reservedUsd: 0.6 });
  assert.equal((await admitSpend(LEARN_DB, env, { ...args('old'), now: 1 })).refused, false);
  assert.equal((await admitSpend(LEARN_DB, env, { ...args('overlap'), now: 90000 })).refused, true);
  await settleSpend(LEARN_DB, 'old', { status: 'failed', calls: 1, now: 90001 });
  assert.equal((await admitSpend(LEARN_DB, env, { ...args('after-timeout'), now: 90002 })).refused, true);
  sqlite.prepare('UPDATE usage_operations SET cost_usd = NULL').run();
  assert.equal((await admitSpend(LEARN_DB, env, { ...args('unknown'), reservedUsd: 0.1, now: 90003 })).refused, true);
});

test('bounds include complete request bytes, cache-write and fast costs, and refuse unsupported media/tools', () => {
  const body = { max_tokens: 200, messages: [{ role: 'user', content: 'Synthetic question.' }] };
  const normal = requestSpendBound(body, 'claude-opus-5-5');
  assert.ok(requestSpendBound({ ...body, system: 'x'.repeat(4000) }, 'claude-opus-5-5') > normal);
  assert.ok(requestSpendBound({ ...body, speed: 'fast' }, 'claude-opus-5-5') >= normal * 2);
  assert.ok(requestSpendBound({ ...body, system: [{ type: 'text', text: 'cache', cache_control: { type: 'ephemeral', ttl: '1h' } }] }, 'claude-opus-5-5') > normal);
  assert.ok(requestSpendBound({ ...body, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } }] }] }, 'claude-opus-5-5') > normal);
  assert.equal(requestSpendBound({ ...body, tools: [{ type: 'web_search_20250305', name: 'web_search' }] }, 'claude-opus-5-5'), null);
});

// These are production-shaped calls with only the network boundary replaced.
test('undefined SMALL_ENV is fail-closed like the deployed app, not an offline bypass', async t => {
  const { LEARN_DB } = ledger(t);
  const original = globalThis.fetch; let calls = 0;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  const body = { max_tokens: 20, messages: [{ role: 'user', content: 'Synthetic' }] };
  const response = await anthropic({ LEARN_DB, ANTHROPIC_API_KEY: 'test-key' }, body, 'claude-opus-5-5', null);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).reason, 'cap_unset');
  assert.equal(calls, 0);
});

test('supported image, text document and PDF context retain their content and can be admitted', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const original = globalThis.fetch; const sent = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return Response.json({ model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'text', text: 'Synthetic' }] });
  };
  const env = platform({ LEARN_DB, ANTHROPIC_API_KEY: 'synthetic', USAGE_PLATFORM_DAY_USD: '10' });
  const blocks = [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } },
    { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'Synthetic document' } },
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' } },
  ];
  for (const block of blocks) {
    const body = { max_tokens: 20, messages: [{ role: 'user', content: [block] }] };
    assert.equal((await anthropic(env, body, 'claude-opus-5-5', null)).status, 200);
    assert.deepEqual(sent.at(-1).messages[0].content, [block], 'accounting never rewrites attachment content');
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM usage_operations').get().n, 3);
  assert.ok(requestSpendBound({ max_tokens: 20, messages: [{ role: 'user', content: [blocks[2]] }] }, 'claude-opus-5-5') >= 4);
});

test('existing explicit Opus 5 and Sonnet 5 requests keep their model identities', async t => {
  const { LEARN_DB } = ledger(t);
  const original = globalThis.fetch; const sent = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body); sent.push(payload);
    return Response.json({ model: payload.model, usage: { input_tokens: 100, output_tokens: 20 } });
  };
  const env = platform({ LEARN_DB, ANTHROPIC_API_KEY: 'synthetic', USAGE_PLATFORM_DAY_USD: '1' });
  for (const model of ['claude-opus-5', 'claude-sonnet-5']) {
    assert.equal((await anthropic(env, { max_tokens: 20, messages: [{ role: 'user', content: 'Synthetic' }] }, model, null)).status, 200);
    assert.equal(sent.at(-1).model, model);
    assert.equal(sent.at(-1).fallbacks, undefined);
  }
});

// Owner decision, 2026-10-12: Auto keeps its pinned Opus model and drops only the unpriceable server-side fallback.
test('default Auto is sent as exactly claude-opus-5 without a fallback, admitted, settled and logged under that id', async t => {
  const { sqlite, LEARN_DB } = ledger(t);
  const original = globalThis.fetch; const sent = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, options) => {
    sent.push({ body: JSON.parse(options.body), beta: options.headers['anthropic-beta'] ?? null });
    return Response.json({ model: 'claude-opus-5', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'text', text: 'Synthetic.' }], stop_reason: 'end_turn' });
  };
  const lines = [], log = console.log;
  t.after(() => { console.log = log; });
  console.log = (...args) => lines.push(args.join(' '));
  const env = platform({ SMALL_ENV: 'dev', LEARN_DB, ANTHROPIC_API_KEY: 'synthetic-not-a-credential', USAGE_PLATFORM_DAY_USD: '1' });
  const call = loggedModel('chat', anthropic);
  for (let i = 0; i < 2; i++) {
    const response = await call(env, { max_tokens: 20, messages: [{ role: 'user', content: 'Synthetic' }] }, null, null);
    assert.equal(response.status, 200, 'successive affordable Auto calls are admitted');
  }
  assert.deepEqual(sent.map(({ body, beta }) => ({ model: body.model, fallbacks: body.fallbacks, beta })),
    [0, 1].map(() => ({ model: 'claude-opus-5', fallbacks: undefined, beta: null })));
  const rows = sqlite.prepare('SELECT status, model, cost_usd FROM usage_operations ORDER BY admitted_at').all();
  assert.deepEqual(rows.map(row => [row.status, row.model]), [['settled', 'claude-opus-5'], ['settled', 'claude-opus-5']]);
  assert.ok(rows.every(row => row.cost_usd > 0 && row.cost_usd < 0.01), 'each row settles at its measured cost');
  const logged = lines.filter(line => line.includes('"learn_model"')).map(line => JSON.parse(line));
  assert.deepEqual(logged.map(({ requested, source, fallback, served }) => ({ requested, source, fallback, served })),
    [0, 1].map(() => ({ requested: 'claude-opus-5', source: 'auto', fallback: 'none', served: 'claude-opus-5' })));
});

test('an explicit test environment keeps Auto unchanged: the server-side fallback, no spend admission', async t => {
  const original = globalThis.fetch; const sent = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, options) => {
    sent.push({ body: JSON.parse(options.body), beta: options.headers['anthropic-beta'] ?? null });
    return Response.json({ model: 'claude-opus-5', content: [{ type: 'text', text: 'Synthetic.' }], stop_reason: 'end_turn' });
  };
  const env = platform({ SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'synthetic-not-a-credential' });
  assert.equal((await anthropic(env, { max_tokens: 20, messages: [{ role: 'user', content: 'Synthetic' }] }, null, null)).status, 200);
  assert.deepEqual(sent.map(({ body, beta }) => ({ model: body.model, fallbacks: body.fallbacks, beta })),
    [{ model: 'claude-opus-5', fallbacks: 'default', beta: 'server-side-fallback-2026-07-01' }]);
});

test('private admission cannot be reused for a larger mutated request', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const body = { max_tokens: 20, messages: [{ role: 'user', content: 'Synthetic' }] };
  const bound = requestSpendBound(body, 'claude-opus-5-5');
  const env = platform({ LEARN_DB, USAGE_PLATFORM_DAY_USD: String(bound * 1.1) });
  let calls = 0;
  const response = await spendTransport(env, body, 'claude-opus-5-5', 'synthetic', scoped => {
    body.max_tokens = 10000;
    return spendTransport(scoped, body, 'claude-opus-5-5', 'synthetic', async () => { calls++; return Response.json({}); });
  });
  assert.equal(response.status, 429);
  assert.equal(calls, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM usage_operations').get().n, 1);
});

test('configured OpenAI uses its own priced identity and settles its actual usage', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const original = globalThis.fetch; const hosts = [];
  t.after(() => { globalThis.fetch = original; aiCacheDrop('synthetic-openai'); });
  globalThis.fetch = async (url, options) => {
    hosts.push(new URL(url).host);
    assert.equal(JSON.parse(options.body).model, 'gpt-4.1-mini');
    return Response.json({ model: 'gpt-4.1-mini-2025-04-14', usage: { prompt_tokens: 100, completion_tokens: 20 }, choices: [{ message: { content: 'Synthetic' }, finish_reason: 'stop' }] });
  };
  const body = { max_tokens: 20, messages: [{ role: 'user', content: 'Synthetic' }] };
  const env = platform({ LEARN_DB, OPENAI_API_KEY: 'synthetic', LEARN_PLAN_MODEL: 'gpt-4.1-mini', USAGE_PLATFORM_DAY_USD: '1' });
  assert.equal((await planModel(env, body, null, null)).status, 200);
  env.DB = { prepare: () => ({ bind: () => ({ first: async () => ({ provider: 'openai', model: 'gpt-4.1-mini', openai_base_url: 'https://api.openai.com/v1', openai_api_key: 'synthetic' }) }) }) };
  assert.equal((await anthropic(env, body, null, 'synthetic-openai')).status, 200);
  assert.deepEqual(hosts, ['api.openai.com', 'api.openai.com']);
  const rows = sqlite.prepare('SELECT provider, cost_usd FROM usage_operations').all();
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.provider === 'openai' && row.cost_usd === 0.000072));
});

test('configured priced Bedrock keeps AWS transport and does not fall back to Anthropic', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const original = globalThis.fetch; const hosts = [];
  t.after(() => { globalThis.fetch = original; aiCacheDrop('synthetic-bedrock'); });
  globalThis.fetch = async (url, options) => {
    const host = new URL(url).host; hosts.push(host);
    if (host === 'sts.us-east-1.amazonaws.com') return new Response('<AssumeRoleResponse><Credentials><AccessKeyId>synthetic</AccessKeyId><SecretAccessKey>synthetic</SecretAccessKey><SessionToken>synthetic</SessionToken><Expiration>2099-01-01T00:00:00Z</Expiration></Credentials></AssumeRoleResponse>');
    assert.equal(host, 'bedrock-runtime.us-east-1.amazonaws.com');
    assert.match(String(url), /global.anthropic.claude-opus-5-5/);
    assert.equal(JSON.parse(options.body).max_tokens, 20);
    return Response.json({ model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'text', text: 'Synthetic' }] });
  };
  const env = platform({ LEARN_DB, USAGE_PLATFORM_DAY_USD: '1', AWS_ACCESS_KEY_ID: 'synthetic', AWS_SECRET_ACCESS_KEY: 'synthetic',
    DB: { prepare: () => ({ bind: () => ({ first: async () => ({ provider: 'bedrock', model: 'global.anthropic.claude-opus-5-5', bedrock_role_arn: 'arn:aws:iam::000000000000:role/synthetic', bedrock_region: 'us-east-1' }) }) }) } });
  const response = await anthropic(env, { max_tokens: 20, messages: [{ role: 'user', content: 'Synthetic' }] }, null, 'synthetic-bedrock');
  assert.equal(response.status, 200);
  assert.deepEqual(hosts, ['sts.us-east-1.amazonaws.com', 'bedrock-runtime.us-east-1.amazonaws.com']);
  const row = sqlite.prepare('SELECT provider,cost_usd FROM usage_operations').get();
  assert.equal(row.provider, 'bedrock');
  assert.equal(row.cost_usd, 0.0008);
});

// Jev is an independent evaluator, but its paid transport shares runtime admission.
import { askJev, JEV_TRANSPORTS, protocolFingerprint, GRADER_PROTOCOL_FINGERPRINT } from '../src/learn-grade-jev.js';
const jevRequestFixture = transport => ({ model: JEV_TRANSPORTS[transport].model, state: 'Synthetic answer', questions: { good: { type: 'noul', instructions: 'Is it correct?' } } });
const jevBound = Math.ceil(65536 * 0.042) / 1e6;
for (const transport of ['direct', 'gateway']) {
  test(`Jev ${transport} refuses unset/null cap and reached cap before transport`, async t => {
    const { LEARN_DB } = ledger(t);
    let calls = 0;
    const fetchImpl = async () => { calls++; return Response.json({}); };
    for (const cap of [undefined, null, '0']) {
      await assert.rejects(askJev({ LEARN_DB, USAGE_PLATFORM_DAY_USD: cap }, jevRequestFixture(transport), { transport, fetchImpl }), { code: 'cap_unset' });
    }
    const env = platform({ LEARN_DB, USAGE_PLATFORM_DAY_USD: String(jevBound) });
    await admitSpend(LEARN_DB, env, { opId: 'prior', userId: 'test', org: 'platform', category: 'jev', reservedUsd: jevBound });
    await assert.rejects(askJev(env, jevRequestFixture(transport), { transport, fetchImpl }), { code: 'daily_cap_reached' });
    assert.equal(calls, 0);
  });

  test(`Jev ${transport} positive settlement permits affordable reuse and preserves protocol`, async t => {
    const { LEARN_DB, sqlite } = ledger(t);
    const env = platform({ LEARN_DB, USAGE_PLATFORM_DAY_USD: String(jevBound + 0.001) });
    let calls = 0;
    const fetchImpl = async () => { calls++; return Response.json({ model: transport === 'direct' ? 'jev-1.13.0' : 'typesafe-ai/jev', usage: { input_tokens: 100 }, provider_metadata: { gateway: { cost: '0.0000042' } } }); };
    for (let i = 0; i < 2; i++) await askJev(env, jevRequestFixture(transport), { transport, fetchImpl });
    assert.equal(calls, 2);
    const rows = sqlite.prepare('SELECT cost_usd, status FROM usage_operations').all();
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.status === 'settled' && row.cost_usd > 0 && row.cost_usd < jevBound));
    assert.equal(await protocolFingerprint(), GRADER_PROTOCOL_FINGERPRINT);
  });
}

test('Jev unknown usage and failed retry retain separate attempt liability', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const env = platform({ LEARN_DB, USAGE_PLATFORM_DAY_USD: String(jevBound * 2) });
  let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json(calls === 1 ? {} : { model: 'unpriced-future-jev', usage: { input_tokens: 1 } }, { status: calls === 1 ? 429 : 200 }); };
  await askJev(env, jevRequestFixture('direct'), { transport: 'direct', fetchImpl, sleep: async () => {} });
  assert.equal(calls, 2);
  assert.equal(sqlite.prepare('SELECT SUM(cost_usd) AS cost FROM usage_operations').get().cost, jevBound * 2);
  await assert.rejects(askJev(env, jevRequestFixture('direct'), { transport: 'direct', fetchImpl }), { code: 'daily_cap_reached' });
  assert.equal(calls, 2);
});

test('overlapping Jev admission cannot reserve the same remaining dollars', async t => {
  const { LEARN_DB } = ledger(t);
  const env = platform({ LEARN_DB, USAGE_PLATFORM_DAY_USD: String(jevBound) });
  let finish;
  const waiting = new Promise(resolve => { finish = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const first = askJev(env, jevRequestFixture('direct'), { transport: 'direct', fetchImpl: async () => { entered(); await waiting; return Response.json({}); } });
  await started;
  await assert.rejects(askJev(env, jevRequestFixture('direct'), { transport: 'direct', fetchImpl: async () => assert.fail('must not send') }), { code: 'daily_cap_reached' });
  finish(); await first;
});

test('Jev null usage and disconnected attempts retain their full admitted liability', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const env = platform({ LEARN_DB, USAGE_PLATFORM_DAY_USD: String(jevBound * 2) });
  await askJev(env, jevRequestFixture('direct'), { transport: 'direct', fetchImpl: async () => Response.json({ model: 'jev-1.13.0', usage: { input_tokens: null } }) });
  await assert.rejects(askJev(env, jevRequestFixture('direct'), { transport: 'direct', fetchImpl: async () => { throw new Error('synthetic disconnect'); } }), { code: 'network' });
  const rows = sqlite.prepare('SELECT status, cost_usd FROM usage_operations ORDER BY rowid').all();
  assert.equal(rows[0].cost_usd, jevBound);
  assert.equal(rows[1].cost_usd, jevBound);
  assert.equal(rows[1].status, 'failed');
});

import { voiceSpeech } from '../src/learn-voice-tts.js';
import { scribeToken } from '../src/learn-voice-scribe.js';
import { FalSeedanceProvider } from '../src/video-provider.js';

for (const reached of [false, true]) test(`active media submissions refuse ${reached ? 'reached' : 'unset'} cap without provider calls`, async t => {
  const { LEARN_DB } = ledger(t);
  const env = platform({ LEARN_DB, FISH_AUDIO_API_KEY: 'fixture', ELEVENLABS_API_KEY: 'fixture', FAL_API_KEY: 'fixture', MATH_WORKER_URL: 'https://synthetic.test', MATH_WORKER_TOKEN: 'fixture', SCENE_WORKER_URL: 'https://synthetic.test', SCENE_WORKER_TOKEN: 'fixture' });
  if (reached) {
    env.USAGE_PLATFORM_DAY_USD = '1';
    await admitSpend(LEARN_DB, env, { opId: 'full', userId: 'fixture', org: 'platform', category: 'fixture', reservedUsd: 1 });
  }
  let calls = 0;
  const transport = async () => { calls++; return Response.json({ token: 'fixture', request_id: 'id', status_url: 'https://queue.fal.run/status', response_url: 'https://queue.fal.run/result' }); };
  const original = globalThis.fetch; globalThis.fetch = transport; t.after(() => { globalThis.fetch = original; });
  const reason = reached ? 'daily_cap_reached' : 'cap_unset';
  for (const response of [await voiceSpeech(env, { text: 'Hello.' }, { fetch: transport }), await scribeToken(env, { fetch: transport })]) {
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, reason);
  }
  await assert.rejects(new FalSeedanceProvider(env, transport).submit({ prompt: 'x', referenceImages: [], duration: 5 }), { code: reason });
  assert.equal(calls, 0);
});

test('Fish speech reserves UTF-8 bytes atomically and retains failed liability', async t => {
  const { LEARN_DB, sqlite } = ledger(t);
  const text = '??';
  const cost = new TextEncoder().encode(text).length * 15 / 1e6;
  const env = platform({ LEARN_DB, FISH_AUDIO_API_KEY: 'fixture', USAGE_PLATFORM_DAY_USD: String(cost) });
  let calls = 0;
  const transport = async () => { calls++; throw new Error('synthetic disconnect'); };
  assert.equal((await voiceSpeech(env, { text }, { fetch: transport })).status, 502);
  const row = sqlite.prepare('SELECT cost_usd, status FROM usage_operations').get();
  assert.equal(row.cost_usd, cost);
  assert.equal(row.status, 'failed');
  assert.equal((await voiceSpeech(env, { text }, { fetch: transport })).status, 503);
  assert.equal(calls, 1);
});

test('unconfigured Voice errors and provider status reads survive unset cap', async t => {
  assert.match((await (await scribeToken({})).json()).error, /not configured/);
  assert.match((await (await voiceSpeech({}, { text: 'x' })).json()).error, /not configured/);
  let calls = 0;
  const fetch = async () => { calls++; return Response.json({ status: 'rendering' }); };
  const env = platform({ MATH_WORKER_URL: 'https://synthetic.test', MATH_WORKER_TOKEN: 'fixture', FAL_API_KEY: 'fixture' });
  await new FalSeedanceProvider(env, fetch).request('https://queue.fal.run/known');
  assert.equal(calls, 1);
});

import { paidSubmissionRefusal, fishSpendTransport, isPaidSpendReply } from '../src/learn-paid-transport.js';
import { paidRefusal } from '../src/learn-paid.js';

// Execute the actual inline route branches with injected auth/fetch; the full Worker imports build-only assets.
const inlineWorker = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
function inlinePaidRoute(path) {
  const end = { '/api/learn/image': "    if (path === '/api/learn/scene')", '/api/learn/tts': '    // The learner can speak', '/api/learn/transcribe': '    // Voice Mode:' }[path];
  const start = inlineWorker.indexOf(`    if (path === '${path}' && req.method === 'POST')`);
  assert.ok(start >= 0);
  const code = inlineWorker.slice(start, inlineWorker.indexOf(end, start));
  return new (Object.getPrototypeOf(async function () {}).constructor)('req', 'env', 'path', 'authorizedBoardApp', 'paidRefusal', 'paidSubmissionRefusal', 'fishSpendTransport', 'isPaidSpendReply', 'fetch', code);
}
for (const path of ['/api/learn/image', '/api/learn/tts', '/api/learn/transcribe']) test(`${path} actual route refuses caps after authorization/configuration`, async t => {
  const { LEARN_DB } = ledger(t);
  const env = platform({ LEARN_DB, OPENAI_API_KEY: 'fixture', FISH_AUDIO_API_KEY: 'fixture' });
  let calls = 0;
  const transport = async () => { calls++; return Response.json({}); };
  const invoke = (settings, auth = async () => ({ email: 'fixture' })) => {
    const body = path.endsWith('/transcribe') ? new FormData() : JSON.stringify({ app: 'fixture', prompt: 'Synthetic image', text: 'Synthetic text', confirmed: true });
    if (body instanceof FormData) { body.set('audio', new Blob(['fixture'], { type: 'audio/webm' }), 'fixture.webm'); body.set('app', 'fixture'); }
    return inlinePaidRoute(path)(new Request(`https://synthetic.test${path}`, { method: 'POST', body }), settings, path, auth, paidRefusal, paidSubmissionRefusal, fishSpendTransport, isPaidSpendReply, transport);
  };
  assert.equal((await invoke(env, async () => new Response('Denied', { status: 403 }))).status, 403);
  const missing = await invoke({ ...env, OPENAI_API_KEY: '', FISH_AUDIO_API_KEY: '' });
  assert.match((await missing.json()).error, /not configured/);
  assert.equal((await (await invoke(env)).json()).code, 'cap_unset');
  env.USAGE_PLATFORM_DAY_USD = '1';
  await admitSpend(LEARN_DB, env, { opId: 'full', userId: 'fixture', org: 'platform', category: 'fixture', reservedUsd: 1 });
  assert.equal((await (await invoke(env)).json()).code, 'daily_cap_reached');
  assert.equal(calls, 0);
});

test('a configured cap never authorizes unbounded delegated or FAL submissions', async t => {
  const { LEARN_DB } = ledger(t);
  const env = platform({ LEARN_DB, USAGE_PLATFORM_DAY_USD: '10', ELEVENLABS_API_KEY: 'fixture', FAL_API_KEY: 'fixture', MATH_WORKER_URL: 'https://synthetic.test', MATH_WORKER_TOKEN: 'fixture', SCENE_WORKER_URL: 'https://synthetic.test', SCENE_WORKER_TOKEN: 'fixture' });
  let calls = 0;
  const transport = async () => { calls++; assert.fail('unbounded transport'); };
  const original = globalThis.fetch; globalThis.fetch = transport; t.after(() => { globalThis.fetch = original; });
  const response = await scribeToken(env, { fetch: transport });
  assert.equal((await response.json()).code, 'spend_bound_unavailable');
  await assert.rejects(new FalSeedanceProvider(env, transport).submit({ referenceImages: [] }), { code: 'spend_bound_unavailable' });
  assert.equal(calls, 0);
});

test('concurrent Fish requests reserve one affordable call and preserve streamed audio', async t => {
  const { LEARN_DB } = ledger(t);
  const text = 'Hello';
  const env = platform({ LEARN_DB, FISH_AUDIO_API_KEY: 'fixture', USAGE_PLATFORM_DAY_USD: String(text.length * 15 / 1e6) });
  let finish, entered;
  const waiting = new Promise(resolve => { finish = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const first = voiceSpeech(env, { text }, { fetch: async () => { entered(); await waiting; return new Response('synthetic audio'); } });
  await started;
  const second = await voiceSpeech(env, { text }, { fetch: async () => assert.fail('double admitted') });
  assert.equal((await second.json()).code, 'daily_cap_reached');
  finish();
  const audio = await first;
  assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
  assert.equal(await audio.text(), 'synthetic audio');
});
