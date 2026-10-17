import test from 'node:test';
import assert from 'node:assert/strict';
import { cadModelEnvironment, cadModelRequest, runCadModel } from '../src/cad-model.js';

const job = () => ({ calls: 1, reservedUsd: 0.1, limits: {calls: 2, usd: 0.2},
  operationKey: 'credential-test', modelPhase: 'review', owner: {org: 'credential-test', email: 'owner@example.test'},
  brief: {title: 'Fixture plate'}, manifest: {validation: {baselinePassed: true}} });
const env = () => ({ SMALL_ENV: 'test', CAD_MODEL_ENABLED: 'true',
  CAD_MODEL_API_KEY: 'fixture-cad-key', CAD_MODEL_WORKSPACE_ID: 'fixture-cad-workspace',
  ANTHROPIC_API_KEY: 'fixture-general-key', ANTHROPIC_WORKSPACE_ID: 'fixture-general-workspace' });
const prepared = value => cadModelRequest(value, {review: true});
async function intercept(fn, response = () => Response.json({content: [{type: 'text', text: '{"accepted":true,"problems":[]}'}]})) {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => { calls.push({url, options}); return response(); };
  try { await fn(calls); } finally { globalThis.fetch = original; }
}

test('dedicated CAD transport sends its exact key and workspace without mutating general inference credentials', async () => {
  const configuration = env(), original = structuredClone(configuration), current = job();
  await intercept(async calls => {
    assert.equal((await runCadModel(configuration, current, prepared(current))).accepted, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
    const headers = new Headers(calls[0].options.headers);
    assert.equal(headers.get('x-api-key'), 'fixture-cad-key');
    assert.equal(headers.get('anthropic-workspace-id'), 'fixture-cad-workspace');
    assert.equal(JSON.parse(calls[0].options.body).model, 'claude-sonnet-5-5');
    assert.deepEqual(configuration, original);
  });
});

for (const missing of ['CAD_MODEL_API_KEY', 'CAD_MODEL_WORKSPACE_ID']) {
  test(`dedicated credentials fail closed when ${missing} is missing, despite general credentials`, async () => {
    const configuration = env(); delete configuration[missing]; const current = job();
    await intercept(async calls => {
      await assert.rejects(runCadModel(configuration, current, prepared(current)), /requires CAD_MODEL_API_KEY and CAD_MODEL_WORKSPACE_ID together/);
      assert.equal(calls.length, 0);
    });
  });
}

test('an empty dedicated value cannot fall back to the general workspace/key', () => {
  for (const key of ['CAD_MODEL_API_KEY', 'CAD_MODEL_WORKSPACE_ID']) assert.throws(() => cadModelEnvironment({...env(), [key]: ' '}), /requires/);
});

test('dedicated credentials cannot silently switch to subscription transport', async () => {
  const current = job();
  await intercept(async calls => {
    await assert.rejects(runCadModel({...env(), SUBSCRIPTION_ONLY: 'true'}, current, prepared(current)), /conflict with SUBSCRIPTION_ONLY/);
    assert.equal(calls.length, 0);
  });
});

test('an organization BYOK route cannot redirect dedicated CAD traffic', async () => {
  const current = job(); current.owner.org = 'cad-byok-conflict';
  const configuration = {...env(), DB: {prepare: () => ({bind: () => ({first: async () => ({provider: 'openai', model: 'other-model', openai_base_url: 'https://example.invalid/v1', openai_api_key: 'fixture-byok'})})})}};
  await intercept(async calls => {
    await assert.rejects(runCadModel(configuration, current, prepared(current)), /other providers are not authorized/);
    assert.equal(calls.length, 0);
  });
});

test('provider failure makes one request and never retries or falls back', async () => {
  const current = job();
  await intercept(async calls => {
    await assert.rejects(runCadModel(env(), current, prepared(current)), /fixture refusal/);
    assert.equal(calls.length, 1);
    assert.equal(new Headers(calls[0].options.headers).get('anthropic-workspace-id'), 'fixture-cad-workspace');
  }, () => Response.json({error: {message: 'fixture refusal'}}, {status: 503}));
});

test('without dedicated CAD settings the existing general or subscription configuration is preserved', () => {
  for (const configuration of [{ANTHROPIC_API_KEY: 'general', ANTHROPIC_WORKSPACE_ID: 'general-workspace'}, {SUBSCRIPTION_ONLY: 'true'}]) {
    assert.equal(cadModelEnvironment(configuration), configuration);
  }
});

test('production dedicated-route requirement refuses missing secrets instead of spending general credits', async () => {
  const current = job();
  const configuration = { SMALL_ENV: 'test', CAD_MODEL_ENABLED: 'true', CAD_MODEL_REQUIRE_DEDICATED: 'true',
    ANTHROPIC_API_KEY: 'fixture-general-key', ANTHROPIC_WORKSPACE_ID: 'fixture-general-workspace' };
  await intercept(async calls => {
    await assert.rejects(runCadModel(configuration, current, prepared(current)), /requires CAD_MODEL_API_KEY and CAD_MODEL_WORKSPACE_ID together/);
    assert.equal(calls.length, 0);
  });
});
