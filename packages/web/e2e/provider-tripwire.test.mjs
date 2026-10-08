// e2e/provider-tripwire.js: the only provider request answered is the Next Steps hook planner, with the keyless journey
// stack's fixture, counted apart from hits; every other provider request is a 599 hit; nothing else is touched.
// Run: node --test e2e/provider-tripwire.test.mjs (a gate stage; it changes globalThis.fetch, so not in the web unit run).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const passed = [];
globalThis.fetch = async (input) => { passed.push(String(input?.url ?? input)); return new Response('ok'); };
const { tripwired, FIXTURE_TOOLS } = await import('./provider-tripwire.js');
const planner = (tool, input = { goal: 'Why bread rises' }) => ({ method: 'POST', body: JSON.stringify({ tools: [{ name: tool }], messages: [{ role: 'user', content: `input = ${JSON.stringify(input)}` }] }) });
const counts = async () => (await tripwired({ fetch: () => new Response('app') }).fetch(new Request('http://127.0.0.1:8878/__provider-tripwire'), {})).json();

test('only the hook planner is answered at the boundary, with a valid fixture tool call, and counted as a fixture', async () => {
  assert.deepEqual(FIXTURE_TOOLS, ['suggest_next_steps']);
  const reply = await fetch('https://api.anthropic.com/v1/messages', planner('suggest_next_steps'));
  assert.equal(reply.status, 200);
  const { content: [call] } = await reply.json();
  assert.equal(call.type, 'tool_use'); assert.equal(call.name, 'suggest_next_steps');
  assert.equal(call.input.options.length, 3, 'three hooks, as the real planner returns');
  const now = await counts();
  assert.equal(now.fixtures.length, 1); assert.equal(now.fixtures[0].tool, 'suggest_next_steps'); assert.equal(now.hits.length, 0);
});

test('every other provider request is a 599 hit, never answered and never sent', async () => {
  for (const [url, init] of [['https://api.anthropic.com/v1/messages', planner('tutor_response')], ['https://api.openai.com/v1/images/generations', { method: 'POST', body: '{}' }], ['https://api.exa.ai/search', undefined]]) {
    assert.equal((await fetch(url, init)).status, 599, url);
  }
  const now = await counts();
  assert.deepEqual(now.hits.map(hit => [hit.host, hit.tool]), [['api.anthropic.com', 'tutor_response'], ['api.openai.com', null], ['api.exa.ai', null]]);
  assert.equal(now.fixtures.length, 1);
  assert.deepEqual(passed, [], 'no provider request reached the real fetch');
});

test('a non-provider request passes through untouched', async () => {
  assert.equal(await (await fetch('http://127.0.0.1:8879/api/me')).text(), 'ok');
  assert.deepEqual(passed, ['http://127.0.0.1:8879/api/me']);
});

test('the worker logs each hook request it receives by basis (owned) or share and origin (shared)', async () => {
  const worker = tripwired({ fetch: () => new Response('app') });
  await worker.fetch(new Request('http://127.0.0.1:8878/api/learn/tutor/next-steps', { method: 'POST', body: JSON.stringify({ input: { basis: 'nb_0011aabb' } }) }), {});
  await worker.fetch(new Request('http://127.0.0.1:8878/api/learn/boards/shared/TOKEN123456/next-steps', { method: 'POST', body: JSON.stringify({ input: { origin: { block_id: 'b2' } } }) }), {});
  await worker.fetch(new Request('http://127.0.0.1:8878/api/learn/tutor/plan', { method: 'POST', body: '{}' }), {});
  assert.deepEqual((await counts()).hooks.map(hook => hook.key), ['owned:nb_0011aabb', 'shared:TOKEN123:{"block_id":"b2"}:anon']);
});
