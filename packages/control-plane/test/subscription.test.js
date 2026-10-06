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
test('inline image bytes reach the CLI as image blocks, never as text; long runs opt into a deadline and an output cap', async () => {
  const png = Buffer.from('fake-png').toString('base64');
  const blocks = await prepareMessages([{ role: 'user', content: [{ type: 'text', text: 'frame 0' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }] }]);
  assert.equal(blocks[0].type, 'text');
  assert.ok(!blocks[0].text.includes(png), 'the bytes are not inlined into the JSON text');
  assert.deepEqual(blocks.slice(1), [{ type: 'text', text: 'Asset 1: inline image' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }]);
  await assert.rejects(prepareMessages([{ type: 'image', source: { type: 'base64', media_type: 'text/html', data: png } }]), /Invalid inline asset/);
  const seen = [];
  const run = async (args, input, timeout, extraEnv) => { seen.push([timeout, extraEnv]); return { result: '{"type":"text","text":"ok"}' }; };
  await subscriptionMessage({ messages: [{ role: 'user', content: 'x' }] }, { identify: async () => ({}), prepare: async () => [], run });
  await subscriptionMessage({ messages: [{ role: 'user', content: 'x' }] }, { identify: async () => ({}), prepare: async () => [], run, timeout: 900000, maxOutputTokens: 64000 });
  assert.deepEqual(seen, [[180000, {}], [900000, { CLAUDE_CODE_MAX_OUTPUT_TOKENS: '64000' }]], 'Learn keeps its defaults');
  let prompt = '';
  await subscriptionMessage({ system: [{ type: 'text', text: 'You are the Motion Director.', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'x' }] }, { identify: async () => ({}), prepare: async () => [], run: async args => { prompt = args[args.indexOf('--system-prompt') + 1]; return { result: '{"type":"text","text":"ok"}' }; } });
  assert.ok(prompt.startsWith('You are the Motion Director.'), 'block system prompts arrive as text, not [object Object]');
});
