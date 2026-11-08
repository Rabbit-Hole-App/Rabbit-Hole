import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celerisExplainRoute, withFlowRules, FLOW_RULES } from '../src/explain-celeris-dev.js';
import { generateArtifact, artifactFetch } from '../src/learn-artifact.js';
import { EXPLANATION_GUIDANCE } from '../src/learn-primitives.js';

// Diagnostics (EXPLAIN_DEV_CAPTURE) and the flow-rules retest arm (EXPLAIN_DEV_FLOW_RULES) of the dev Celeris route. Neither changes validation, repair or the drop.
const KEY = 'sk-test-secret-123';
const ON = { SMALL_ENV: 'test', EXPLAIN_CELERIS_DEV: 'true', CELERIS_API_KEY: KEY };
const GOOD = { version: 1, diagram: { kind: 'flow', title: 'Cache', nodes: [{ id: 'a', label: 'Read cache', role: 'process' }, { id: 'b', label: 'Return value', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] } };
const BAD = { version: 1, diagram: { kind: 'flow', title: 'Cache', nodes: [{ id: 'a', label: 'Read cache', role: 'process' }, { id: 'b', label: 'Return value', role: 'outcome' }], edges: [{ from: 'a', to: 'zzz' }] } };
const reply = card => Response.json({ model: 'celeris-1', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(card) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
const withFetch = async (replies, run) => {
  const requests = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { requests.push({ url: String(url), body: JSON.parse(init.body) }); return (replies.length > 1 ? replies.shift() : replies[0])(); }; // the last reply answers any further call (an EXP-13 layout repair)
  try { return await run(requests); } finally { globalThis.fetch = realFetch; }
};
const ask = (route, args) => generateArtifact({}, { command: 'explanation', args, selection: null, context: null }, route.options);
const card = diagram => ({ title: 'How a cache answers', body: 'A cache keeps recent answers.\n\nSo a repeat request skips the slow source.' /* EXP-13: two paragraphs, the route puts the diagram between them */, diagram });

test('capture is off by default: the served report has no capture field', async () => {
  await withFetch([() => reply(card(GOOD))], async () => {
    const route = celerisExplainRoute(ON, 'explanation');
    await ask(route, 'How does a cache work?');
    assert.equal('capture' in route.served(), false);
  });
});

test('capture keeps each attempt\'s raw answer, the parser\'s exact errors and the repair feedback, and never the key', async () => {
  await withFetch([() => reply(card(BAD)), () => reply(card(GOOD))], async requests => {
    const route = celerisExplainRoute({ ...ON, EXPLAIN_DEV_CAPTURE: 'true' }, 'explanation');
    const out = await ask(route, 'How does a cache work?');
    assert.deepEqual([out.result, out.repaired], ['artifact', true], 'the repair behaves exactly as without capture');
    const served = route.served();
    assert.equal(served.capture.length, 2);
    assert.equal(served.capture[0].attempt, 1);
    assert.equal(served.capture[0].feedback, null);
    assert.match(served.capture[0].raw, /"to":"zzz"/);
    assert.deepEqual(served.capture[0].diagramParseErrors, [{ path: 'diagram.edges.0', message: 'Edge refers to an unknown node' }]);
    assert.match(served.capture[1].feedback, /rh-diagram spec is not valid.*Edge refers to an unknown node/, 'the validator\'s own words sent for the repair');
    assert.equal(served.capture[1].diagramParseErrors, null);
    assert.equal(requests[1].body.messages.at(-1).content.startsWith(served.capture[1].feedback), true, 'the kept feedback is what the provider received');
    assert.equal(JSON.stringify(served).includes(KEY), false);
  });
});

test('a refused request keeps the provider\'s status and body with the key scrubbed, and the repair path is untouched', async () => {
  await withFetch([() => new Response(`{"error":"schema rejected for ${KEY}","auth":"Bearer ${KEY}"}`, { status: 400 })], async () => {
    const route = celerisExplainRoute({ ...ON, EXPLAIN_DEV_CAPTURE: 'true' }, 'explanation');
    await assert.rejects(ask(route, 'How does DNS resolve a domain name?'), /model HTTP 400/);
    const [entry] = route.served().capture;
    assert.equal(entry.providerStatus, 400);
    assert.match(entry.providerBody, /schema rejected for \[key\]/);
    assert.equal(JSON.stringify(route.served()).includes(KEY), false);
  });
});

test('the artifact route reports what the dev route saw even when the model request fails (502), and nothing extra when the route is off', async () => {
  const env = { ...ON, EXPLAIN_DEV_CAPTURE: 'true', CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo' }) } };
  const post = (over, replies) => withFetch(replies, () => artifactFetch(new Request('https://dev.test/api/learn/artifact', { method: 'POST', body: JSON.stringify({ app: 'demo', command: 'explanation', args: 'How does DNS resolve a domain name?' }) }), over, generateArtifact, { identity: { org: 'o', user_id: 'u' } }));
  const refused = await post(env, [() => new Response('{"error":"bad"}', { status: 400 })]);
  assert.equal(refused.status, 502);
  const body = await refused.json();
  assert.match(body.error, /model HTTP 400/);
  assert.equal(body.devModel?.capture?.[0]?.providerStatus, 400);
  const off = await post({ ...env, EXPLAIN_CELERIS_DEV: undefined, ANTHROPIC_API_KEY: 'k' }, [() => new Response('{}', { status: 400 })]);
  assert.equal((await off.json()).devModel, undefined, 'route off: the error body is exactly what it was');
});

test('flow-rules arm: only the flow clause of the guidance changes; off, the guidance is byte for byte the plan model\'s', async () => {
  const swapped = withFlowRules(EXPLANATION_GUIDANCE);
  assert.notEqual(swapped, EXPLANATION_GUIDANCE);
  assert.ok(swapped.includes(FLOW_RULES));
  const [before, after] = EXPLANATION_GUIDANCE.split('Kinds: flow for a process with decisions (');
  assert.equal(swapped.startsWith(before), true, 'everything before the clause is unchanged');
  assert.equal(swapped.endsWith(EXPLANATION_GUIDANCE.slice(EXPLANATION_GUIDANCE.indexOf('use cycle or relationship for a loop') + 'use cycle or relationship for a loop'.length)), true, 'everything after it is unchanged');
  assert.throws(() => withFlowRules('a guidance with no flow clause'), /flow clause is not in the guidance/);
  const sent = async env => withFetch([() => reply(card(GOOD))], async requests => { await ask(celerisExplainRoute(env, 'explanation'), 'How does a cache work?'); return requests[0].body.messages[0].content; });
  const control = await sent(ON), arm = await sent({ ...ON, EXPLAIN_DEV_FLOW_RULES: 'true' });
  assert.equal(control.includes(FLOW_RULES), false);
  assert.equal(arm.includes(FLOW_RULES), true);
  assert.equal(arm.replace(FLOW_RULES, '').length < control.length, true, 'the rewritten clause replaces the old one, nothing is appended');
});
