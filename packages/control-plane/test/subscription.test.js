import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionEnvironment, subscriptionIdentity, subscriptionMessage, createSubscriptionBridge, prepareMessages } from '../../../scripts/learn-subscription-bridge.mjs';
import { subscriptionTransport } from '../src/subscription-transport.js';

test('subscription environment strips API credentials and third-party providers', () => {
  assert.deepEqual(subscriptionEnvironment({ PATH: 'bin', ANTHROPIC_API_KEY: 'paid', ANTHROPIC_AUTH_TOKEN: 'paid', ANTHROPIC_BASE_URL: 'other', CLAUDE_CODE_OAUTH_TOKEN: 'override', CLAUDE_CODE_USE_BEDROCK: '1' }), { PATH: 'bin' });
});
test('API login fails before any model call; Max login is accepted', async () => {
  await assert.rejects(subscriptionIdentity(async () => ({ loggedIn: true, authMethod: 'api_key' })), /not accepted/);
  assert.equal((await subscriptionIdentity(async () => ({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max', email: 'owner@example.test' }))).plan, 'max');
  let called = false;
  await assert.rejects(subscriptionMessage({}, { identify: async () => { throw new Error('No subscription'); }, run: async () => { called = true; } }), /No subscription/);
  assert.equal(called, false);
});
test('CLI output becomes only an allowed application tool; no native tools enabled', async () => {
  const body = { messages: [{ role: 'user', content: 'Read paper' }], tools: [{ name: 'read_arxiv_paper' }], tool_choice: { type: 'tool', name: 'read_arxiv_paper' } };
  const result = await subscriptionMessage(body, { identify: async () => ({}), prepare: async () => [], run: async args => {
    assert.equal(args[args.indexOf('--tools') + 1], '');
    return { result: JSON.stringify({ type: 'tool_use', name: 'read_arxiv_paper', input: { id: '1506.02640' } }) };
  } });
  assert.equal(result.billing, 'claude-subscription');
  await assert.rejects(subscriptionMessage(body, { identify: async () => ({}), prepare: async () => [], run: async () => ({ result: '{"type":"tool_use","name":"Bash","input":{}}' }) }), /Invalid subscription tool/);
});
test('the 5.5 model ids reach the CLI as their own family alias: opus and sonnet', async () => {
  const seen = [];
  for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5']) {
    await subscriptionMessage({ model, messages: [{ role: 'user', content: 'x' }], tools: [{ name: 'journey_path' }] }, { identify: async () => ({}), prepare: async () => [], run: async args => {
      seen.push(args[args.indexOf('--model') + 1]);
      return { result: JSON.stringify({ type: 'tool_use', name: 'journey_path', input: {} }) };
    } });
  }
  assert.deepEqual(seen, ['opus', 'sonnet']);
});
test('offline or unverified subscription transport never reaches an API endpoint', async () => {
  let calls = 0; const original = globalThis.fetch;
  globalThis.fetch = async url => { calls++; assert.equal(url.hostname, 'bridge.example'); return Response.json({ content: [] }); };
  try {
    await assert.rejects(subscriptionTransport({ ANTHROPIC_API_KEY: 'exists-but-forbidden' }, {}, null), /fallback is disabled/);
    assert.equal(calls, 0);
    await assert.rejects(subscriptionTransport({ SUBSCRIPTION_BRIDGE_URL: 'https://bridge.example', SUBSCRIPTION_BRIDGE_TOKEN: 'test' }, {}, null), /Unverified/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test('native PDF input contains verified bytes, rejects arbitrary asset hosts', async () => {
  const blocks = await prepareMessages([{ type: 'document', source: { type: 'url', url: 'https://arxiv.org/pdf/1506.02640' } }], async () => new Response('%PDF-test'));
  assert.equal(blocks.find(b => b.type === 'document').source.type, 'base64');
  await assert.rejects(prepareMessages([{ type: 'document', source: { type: 'url', url: 'https://evil.example/file' } }]), /Unsupported/);
});
test('bridge rejects unauthenticated requests without invoking Claude', async t => {
  let calls = 0;
  const server = createSubscriptionBridge({ token: 't'.repeat(40), generate: async () => { calls++; return {}; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/messages`, { method: 'POST', body: '{}' });
  assert.equal(response.status, 401); assert.equal(calls, 0);
});
// A CLI reply that does not parse keeps its evidence: the 503 carries the diagnostic (raw text, parser error, the caller's
// stage), never the token; SMALL_SUBSCRIPTION_DIAG_FILE also gets the line.
test('an unparseable CLI reply answers 503 with a diagnostic and no credential; the diagnostic file gets one line', async t => {
  const token = 'k'.repeat(40), text = 'Here is the revised path you asked for, s3 is now skipped.';
  const run = async () => ({ type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: text });
  const stub = { identify: async () => ({}), prepare: async () => [], run };
  const server = createSubscriptionBridge({ token, generate: (body, options) => subscriptionMessage(body, { ...options, ...stub, diagFile: null }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/messages`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Corpus-Run': '2026-10-06T02-34-50-790Z', 'X-Corpus-Stage': 'adapt_edit', 'X-Corpus-Role': 'journey_adapt<script>' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', system: 'SYSTEM PROMPT', messages: [{ role: 'user', content: 'input = {}' }], tools: [{ name: 'journey_adapt' }] }) });
  const raw = await response.text(), body = JSON.parse(raw);
  assert.equal(response.status, 503);
  assert.equal(body.error, 'Invalid subscription model response');
  assert.equal(body.diagnostic.raw_text, text);
  assert.match(body.diagnostic.parser_error, /JSON/);
  assert.deepEqual([body.diagnostic.run_id, body.diagnostic.stage, body.diagnostic.role, body.diagnostic.model_alias], ['2026-10-06T02-34-50-790Z', 'adapt_edit', 'journey_adaptscript', 'sonnet']);
  assert.deepEqual(body.diagnostic.termination, { subtype: 'success', stop_reason: 'end_turn', is_error: false });
  assert.ok(!raw.includes(token) && !raw.includes('SYSTEM PROMPT') && !raw.includes('input = {}'), 'no token, system prompt or request body in the reply');
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs'), { tmpdir } = await import('node:os'), { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'bridge-diag-')), file = join(dir, 'diag.jsonl'), saved = process.env.SMALL_SUBSCRIPTION_DIAG_FILE;
  t.after(() => { if (saved === undefined) delete process.env.SMALL_SUBSCRIPTION_DIAG_FILE; else process.env.SMALL_SUBSCRIPTION_DIAG_FILE = saved; rmSync(dir, { recursive: true, force: true }); });
  process.env.SMALL_SUBSCRIPTION_DIAG_FILE = file;
  await assert.rejects(subscriptionMessage({ messages: [{ role: 'user', content: 'x' }], tools: [{ name: 'journey_adapt' }] }, stub), /Invalid subscription model response/);
  const lines = readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].raw_text, text);
});

// models-3: every course action that calls a model is refused in subscription
// mode; revise_section used to fall through to live small-cp's paid API.
test('subscription mode refuses the course model actions, including revise_section, and the dev worker asks the helper', async () => {
  const { subscriptionCourseRefusal } = await import('../src/subscription-transport.js');
  for (const action of ['draft', 'generate', 'revise_section']) {
    const refused = subscriptionCourseRefusal({ SUBSCRIPTION_ONLY: 'true' }, action);
    assert.equal(refused?.status, 503, action);
    assert.equal(subscriptionCourseRefusal({ SUBSCRIPTION_ONLY: 'false' }, action), null, action);
  }
  for (const action of ['brief', 'save', 'approve', 'delete', undefined]) assert.equal(subscriptionCourseRefusal({ SUBSCRIPTION_ONLY: 'true' }, action), null, String(action));
  const { readFileSync } = await import('node:fs');
  const worker = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  const gate = worker.slice(worker.indexOf('(await req.clone().json()).action'));
  assert.ok(gate.indexOf('subscriptionCourseRefusal(env, action)') > 0 && gate.indexOf('subscriptionCourseRefusal(env, action)') < gate.indexOf("['/api/learn/ask', '/api/learn/selection']"));
});
