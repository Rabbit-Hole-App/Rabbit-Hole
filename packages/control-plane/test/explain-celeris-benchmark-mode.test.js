import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celerisExplainOn, celerisExplainRoute } from '../src/explain-celeris-dev.js';
import { generateArtifact } from '../src/learn-artifact.js';

// Benchmark mode: EXPLAIN_DEV_MODEL 'anthropic' sends the SAME request the app sends, through the real plan-model transport, and only measures it.
const base = { SMALL_ENV: 'test', EXPLAIN_CELERIS_DEV: 'true', EXPLAIN_DEV_MODEL: 'anthropic' };

test('it needs the Anthropic key, not the Celeris key, and production never takes it', () => {
  assert.equal(celerisExplainOn(base, 'explanation'), false, 'no Anthropic key: off');
  assert.equal(celerisExplainOn({ ...base, ANTHROPIC_API_KEY: 'k' }, 'explanation'), true);
  assert.equal(celerisExplainOn({ ...base, CELERIS_API_KEY: 'k' }, 'explanation'), false, 'the Celeris key does not turn it on');
  assert.equal(celerisExplainOn({ ...base, ANTHROPIC_API_KEY: 'k', SMALL_ENV: 'production' }, 'explanation'), false);
  assert.equal(celerisExplainOn({ ...base, ANTHROPIC_API_KEY: 'k' }, 'interactive'), false, 'written /explain only');
});

test('the plan model is called with the app\'s own tool request; tokens and the diagram status are recorded', async () => {
  const diagram = JSON.stringify({ version: 1, diagram: { kind: 'flow', title: 'x', nodes: [{ id: 'a', label: 'Read', role: 'process' }, { id: 'b', label: 'Done', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] } });
  const body = 'Short read.\n\n```rh-diagram\n' + diagram + '\n```\n\nDone.'; // EXP-13, owner 2026-11-08: prose before and after the visual
  const requests = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({ model: 'claude-opus-5', stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 40 }, content: [{ type: 'tool_use', id: 't1', name: 'make_explanation', input: { title: 'T', body } }] });
  };
  try {
    const route = celerisExplainRoute({ ...base, ANTHROPIC_API_KEY: 'k' }, 'explanation');
    const out = await generateArtifact({}, { command: 'explanation', args: 'How does DNS work?', selection: null, context: null }, route.options);
    assert.equal(out.result, 'artifact');
    assert.match(requests[0].url, /api\.anthropic\.com/);
    assert.ok(requests[0].body.tools.some(tool => tool.name === 'make_explanation'), 'the same tool-call request the app sends');
    assert.deepEqual(route.served(), { requested: 'anthropic (plan model)', models: ['claude-opus-5'], calls: 1, inTokens: 100, outTokens: 40, attempts: [{ required: false, diagram: 'valid', chars: 'T'.length + body.length }] });
  } finally { globalThis.fetch = realFetch; }
});
