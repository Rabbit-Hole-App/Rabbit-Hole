import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celerisExplainOn, celerisExplainRoute } from '../src/explain-celeris-dev.js';
import { generateArtifact } from '../src/learn-artifact.js';

const ON = { SMALL_ENV: 'dev', EXPLAIN_CELERIS_DEV: 'true', CELERIS_API_KEY: 'k' };

test('the dev Celeris route is off unless a dev or test Worker turns it on, for /explain only', () => {
  assert.equal(celerisExplainOn(ON, 'explanation'), true);
  assert.equal(celerisExplainOn({ ...ON, SMALL_ENV: 'test' }, 'explanation'), true);
  assert.equal(celerisExplainOn({ ...ON, SMALL_ENV: 'production' }, 'explanation'), false, 'production never');
  assert.equal(celerisExplainOn({ ...ON, SMALL_ENV: undefined }, 'explanation'), false);
  assert.equal(celerisExplainOn({ ...ON, EXPLAIN_CELERIS_DEV: undefined }, 'explanation'), false);
  assert.equal(celerisExplainOn({ ...ON, CELERIS_API_KEY: '' }, 'explanation'), false);
  for (const command of ['explain', 'practice', 'quiz', 'table', 'interact', 'dive']) assert.equal(celerisExplainOn(ON, command), false, command);
  assert.equal(celerisExplainRoute({ SMALL_ENV: 'production', EXPLAIN_CELERIS_DEV: 'true', CELERIS_API_KEY: 'k' }, 'explanation'), null);
});

test('one Celeris call carries the explanation and the rh-diagram, through the same validation; the served model is reported', async () => {
  const diagram = { version: 1, diagram: { kind: 'flow', title: 'Cache', nodes: [{ id: 'a', label: 'Read cache', role: 'process' }, { id: 'b', label: 'Return value', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] } };
  const requests = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    return Response.json({ model: 'celeris-1-served', choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 't1', type: 'function', function: { name: 'make_explanation', arguments: JSON.stringify({ title: 'How a cache answers', body: 'A cache keeps recent answers so a repeat request skips the slow source.\n\n```rh-diagram\n' + JSON.stringify(diagram) + '\n```' }) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  };
  try {
    const route = celerisExplainRoute(ON, 'explanation');
    const out = await generateArtifact({}, { command: 'explanation', args: 'How does a cache work?', selection: null, context: null }, route.options);
    assert.equal(out.result, 'artifact');
    assert.match(out.block.body, /```rh-diagram/);
    assert.equal(requests.length, 1, 'one call');
    assert.match(requests[0].url, /celeris\.ai.*\/chat\/completions$/);
    assert.equal(requests[0].body.model, 'celeris-1');
    assert.equal(requests[0].body.stream, false);
    assert.ok(requests[0].body.tools.some(tool => tool.function.name === 'make_explanation'));
    assert.deepEqual(route.served(), { requested: 'celeris-1', models: ['celeris-1-served'], calls: 1, inTokens: 10, outTokens: 5 });
  } finally { globalThis.fetch = realFetch; }
});
