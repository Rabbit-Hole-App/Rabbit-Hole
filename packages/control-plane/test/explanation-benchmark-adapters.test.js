// EXP-11-C03 (docs/features/explain.md), offline: the response-shape normalization contract for Opus (Anthropic tool_use), Celeris/Cerebras-style OpenAI-compatible json_schema
// and Gemini generateContent. Every id in the fixtures is a synthetic placeholder: these tests prove the mapping, not that any real provider answers this way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NORMALIZED_ERROR_CLASSES, PROVIDER_SHAPES, normalizeProviderResult } from '../src/explanation-benchmark-adapters.js';
import { EXPLANATION_ADAPTERS, EXPLANATION_REGISTRY } from '../src/explanation-models.js';
import { artifactBlock } from '../src/learn-primitives.js';

const fixtures = JSON.parse(await readFile(new URL('../../../benchmarks/explain/adapter-fixtures/v1.json', import.meta.url), 'utf8'));
const KEYS = ['attempt', 'error', 'output', 'requested', 'served', 'stop', 'timing', 'usage'];

test('every fixture maps to the one normalized shape with the declared error class, stop, identity and usage', () => {
  assert.ok(fixtures.cases.length >= 40);
  for (const f of fixtures.cases) {
    const n = normalizeProviderResult(f.shape, f.raw, f.ctx);
    assert.deepEqual(Object.keys(n).sort(), KEYS, f.name);
    assert.deepEqual(Object.keys(n.usage).sort(), ['cache', 'input', 'output', 'reasoning'], f.name);
    assert.deepEqual(n.requested, { provider: f.ctx.provider, model: f.ctx.model }, f.name);
    assert.equal(n.attempt, f.ctx.attempt);
    assert.equal(n.error?.class ?? null, f.expect.error, f.name);
    if (n.error) assert.ok(NORMALIZED_ERROR_CLASSES.includes(n.error.class), f.name);
    assert.equal(n.stop, f.expect.stop, f.name);
    if (f.expect.noOutput) assert.equal(n.output, null, `${f.name}: no output is passed on`);
    else { assert.equal(n.output.title, f.expect.title, f.name); assert.equal(n.served.model, f.expect.served, f.name); }
    if (f.expect.usage) assert.deepEqual(n.usage, f.expect.usage, f.name);
    if (f.expect.durationMs) assert.equal(n.timing.durationMs, f.expect.durationMs, f.name);
  }
});

test('all three requested shapes and every required case class are covered', () => {
  const classes = new Set(fixtures.cases.map(f => f.expect.error));
  for (const c of ['truncated_output', 'malformed_output', 'schema_incompatible', 'served_model_mismatch', 'missing_identity', 'unsupported_images', 'missing_credentials', 'timeout', 'http_error', 'refusal']) assert.ok(classes.has(c), c);
  assert.ok(classes.has(null), 'valid output');
  for (const shape of PROVIDER_SHAPES) {
    const mine = fixtures.cases.filter(f => f.shape === shape);
    assert.ok(mine.length >= 12, shape);
    for (const c of ['truncated_output', 'malformed_output', 'schema_incompatible', 'served_model_mismatch', 'missing_identity', 'unsupported_images']) assert.ok(mine.some(f => f.expect.error === c), `${shape}: ${c}`);
    assert.ok(mine.some(f => f.name.includes('unknown usage')), `${shape}: unknown usage`);
  }
});

test('unknown usage is null, never zero, in every shape; reported usage keeps its cache and reasoning fields', () => {
  for (const f of fixtures.cases.filter(f => f.name.includes('unknown usage stays null'))) {
    const n = normalizeProviderResult(f.shape, f.raw, f.ctx);
    assert.deepEqual(n.usage, { input: null, output: null, cache: null, reasoning: null }, f.name);
  }
  const openai = fixtures.cases.find(f => f.shape === 'openai-compatible' && f.name.endsWith('valid output'));
  assert.deepEqual(normalizeProviderResult(openai.shape, openai.raw, openai.ctx).usage, { input: 100, output: 50, cache: 20, reasoning: 12 });
  const anthropic = fixtures.cases.find(f => f.shape === 'anthropic' && f.name.endsWith('valid output'));
  assert.equal(normalizeProviderResult(anthropic.shape, anthropic.raw, anthropic.ctx).usage.reasoning, null, 'a field the provider does not report is null');
  // A reported zero is a real zero, not unknown.
  const zero = structuredClone(anthropic); zero.raw.usage = { input_tokens: 0, output_tokens: 0 };
  assert.deepEqual(normalizeProviderResult(zero.shape, zero.raw, zero.ctx).usage, { input: 0, output: 0, cache: null, reasoning: null });
});

test('a valid normalized output goes through the same production card validation as any other, and nothing is substituted', () => {
  for (const f of fixtures.cases.filter(f => f.expect.error === null)) {
    const n = normalizeProviderResult(f.shape, f.raw, f.ctx);
    assert.doesNotThrow(() => artifactBlock('explanation', n.output), f.name);
    assert.equal(n.served.model, f.expect.served, 'the served model is what the response said, never the requested one by default');
  }
  // Schema-incompatible and truncated answers never reach the validator as if they were fine.
  for (const f of fixtures.cases.filter(f => ['schema_incompatible', 'truncated_output', 'malformed_output'].includes(f.expect.error))) assert.equal(normalizeProviderResult(f.shape, f.raw, f.ctx).output, null, f.name);
});

test('capability and credential preflight happen before any parsing, so nothing is dropped or weakened to continue', () => {
  const valid = fixtures.cases.find(f => f.shape === 'gemini' && f.name.endsWith('valid output'));
  const images = normalizeProviderResult('gemini', valid.raw, { ...valid.ctx, hasImages: true, capabilities: { images: false } });
  assert.equal(images.error.class, 'unsupported_images'); assert.equal(images.output, null);
  assert.equal(normalizeProviderResult('gemini', valid.raw, { ...valid.ctx, hasImages: true, capabilities: { images: true } }).error, null, 'a candidate that supports images is not blocked');
  assert.equal(normalizeProviderResult('gemini', valid.raw, { ...valid.ctx, credentialPresent: false }).error.class, 'missing_credentials');
  assert.equal(normalizeProviderResult('gemini', valid.raw, { ...valid.ctx, timedOut: true }).error.class, 'timeout');
  assert.throws(() => normalizeProviderResult('mystery', {}, {}), /Unknown provider response shape/);
});

test('fixtures name only synthetic ids, and the product registers only the plan transport and the fast chain', () => {
  const ids = fixtures.cases.flatMap(f => [f.ctx.model, f.ctx.provider]);
  assert.ok(ids.every(id => id.startsWith('synthetic-')));
  assert.match(fixtures.note, /SYNTHETIC/); assert.match(fixtures.note, /NOT verified/);
  assert.deepEqual(EXPLANATION_ADAPTERS, ['plan', 'fast-chain'], 'the product wires the plan transport and the fast chain (explanation-fast-chain.js)');
  assert.deepEqual(Object.keys(EXPLANATION_REGISTRY.profiles), ['plan-default', 'fireworks-low', 'fireworks-medium', 'fireworks-high', 'cerebras-low', 'cerebras-medium', 'cerebras-high', 'google-low', 'google-medium', 'google-high']);
});
