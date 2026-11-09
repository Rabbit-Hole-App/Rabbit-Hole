// E0 (docs/features/explain.md EXP-11-C02 / EXP-12-C01): the written /explain model profile. Offline: no provider is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPLANATION_ADAPTERS, EXPLANATION_CANDIDATES, EXPLANATION_REGISTRY, EXPLANATION_PROFILE_SETTING, ExplanationProfileError, explanationProfileBinding, explanationProfileFor, resolveExplanationProfile } from '../src/explanation-models.js';
import { generateArtifact, prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { LEARN_TASKS } from '../src/learn-models.js';
import { generateRoadmapCard, quoteRoadmapCard } from '../src/roadmap/roadmap-generate.js';
import { withVisual } from './explanation-layout-fixture.js';

const explanation = { title: 'Why coffee cools', body: withVisual('A hot cup loses heat faster because the gap to the room is larger.') }; // EXP-13, owner 2026-11-08: a new card has a visual
const scripted = (...inputs) => { const seen = []; return { seen, callModel: async (env, body, model) => { seen.push({ body, model }); return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name: 'make_explanation', input: inputs[seen.length - 1] ?? inputs.at(-1) }] }); } }; };
const registryWith = profiles => ({ ...EXPLANATION_REGISTRY, profiles: { ...EXPLANATION_REGISTRY.profiles, ...profiles } });

test('the default profile pins today\'s transport and is frozen', () => {
  const profile = explanationProfileFor({});
  assert.equal(profile.id, 'plan-default');
  assert.equal(profile.roles.author.model, LEARN_TASKS.artifact.model);
  assert.equal(profile.roles.author.maxOutputTokens, LEARN_TASKS.artifact.maxTokens);
  assert.deepEqual([profile.roles.author.adapter, profile.roles.author.provider], ['plan', 'plan']);
  assert.deepEqual({ ...profile.roles.repair, role: 'author' }, profile.roles.author, 'a profile without a repair role repairs with its author config');
  assert.throws(() => { profile.roles.author.model = 'other'; }, TypeError);
  assert.equal(explanationProfileFor({ [EXPLANATION_PROFILE_SETTING]: '' }).id, 'plan-default', 'an empty setting is the default');
});

test('the default request is byte-identical to the request built without a profile layer', () => {
  const input = { command: 'explanation', args: 'Why does coffee cool faster at first?' };
  const prepared = prepareArtifactAuthorRequest({}, input);
  assert.equal(prepared.model, LEARN_TASKS.artifact.model);
  assert.equal(prepared.body.max_tokens, LEARN_TASKS.artifact.maxTokens);
  assert.deepEqual(prepared.body.tool_choice, { type: 'any', disable_parallel_tool_use: true });
  assert.equal(prepared.profile.id, 'plan-default');
  // The same request with the profile passed explicitly is the same body, so a quote and a dispatch cannot differ.
  assert.deepEqual(prepareArtifactAuthorRequest({}, input, { profile: explanationProfileFor({}) }).body, prepared.body);
  // The playable /interactive command and other cards offer more than the Explanation card: no profile applies.
  assert.equal(prepareArtifactAuthorRequest({}, { command: 'explain', args: 'a heap' }).profile, null);
});

test('an unknown or unsupported profile is refused before any call, never replaced by the default', async () => {
  assert.throws(() => resolveExplanationProfile('opus-typo'), e => e instanceof ExplanationProfileError && e.code === 'unknown_profile');
  for (const bad of ['__proto__', 'constructor', null, 7]) assert.throws(() => resolveExplanationProfile(bad), e => e.code === 'unknown_profile');
  const registry = registryWith({ cerebras: { version: 1, roles: { author: { ...EXPLANATION_REGISTRY.profiles['plan-default'].roles.author, provider: 'cerebras', model: 'x', adapter: 'openai-compatible' } } } });
  assert.throws(() => resolveExplanationProfile('cerebras', registry), e => e.code === 'adapter_unsupported');
  assert.throws(() => resolveExplanationProfile('plan-default', registryWith({ 'plan-default': { version: 1, roles: { author: { ...EXPLANATION_REGISTRY.profiles['plan-default'].roles.author, endpoint: 'https://evil.example' } } } })), e => e.code === 'invalid_profile');
  assert.throws(() => resolveExplanationProfile('plan-default', registryWith({ 'plan-default': { version: 1, roles: { reviewer: {} } } })), e => e.code === 'unknown_role');
  // Through the real request builder: a refused plan with a message, and the model never called.
  const { callModel, seen } = scripted(explanation);
  const out = await generateArtifact({ [EXPLANATION_PROFILE_SETTING]: 'opus-typo' }, { command: 'explanation', args: 'q' }, { callModel });
  assert.equal(out.result, 'unsupported');
  assert.match(out.message, /No written \/explain model profile/);
  assert.equal(seen.length, 0);
  // The candidate inventory states what is and is not wired.
  assert.deepEqual(EXPLANATION_ADAPTERS, ['plan', 'fast-chain']);
  assert.deepEqual(Object.entries(EXPLANATION_CANDIDATES).map(([k, v]) => [k, v.status]), [['opus', 'supported'], ['celeris', 'dev_route_only'], ['cerebras', 'supported'], ['gemini-flash', 'supported']]);
});

test('a one-role override changes only that role: the repair role may pin another plan model within the one repair ceiling', async () => {
  const author = EXPLANATION_REGISTRY.profiles['plan-default'].roles.author;
  const registry = registryWith({ 'repair-sonnet': { version: 2, extends: 'plan-default', roles: { repair: { ...author, model: 'claude-sonnet-5' } } } });
  const profile = resolveExplanationProfile('repair-sonnet', registry);
  assert.equal(profile.roles.author.model, author.model);
  assert.equal(profile.roles.repair.model, 'claude-sonnet-5');
  assert.notEqual((await explanationProfileBinding(profile)).hash, (await explanationProfileBinding(explanationProfileFor({}))).hash);
  const over = { title: 'T', body: withVisual('x'.repeat(2000)) }; // over the 700 prose limit: forces the one repair
  const { callModel, seen } = scripted(over, explanation);
  const out = await generateArtifact({}, { command: 'explanation', args: 'q' }, { callModel, profile });
  assert.equal(out.result, 'artifact');
  assert.equal(out.repaired, true);
  assert.deepEqual(seen.map(s => s.model), [author.model, 'claude-sonnet-5'], 'author call on the author model, the one repair on the repair model');
  assert.equal(seen.length, 2, 'the existing one-repair ceiling is unchanged');
  assert.deepEqual(out.profile, await explanationProfileBinding(profile), 'the result carries the profile that made it');
});

test('a quote carries the profile binding, and an accepted record that kept a binding dispatches only while the registry still matches it', async () => {
  const access = { org: 'o', actorUserId: 'u1', actorEmail: 'a@x.test', boardId: 'b1', boardOwnerEmail: 'a@x.test', role: 'owner', payerUserId: 'u1' };
  const ref = { authorizationId: 'auth_00000001', resultId: 'res_00000001', resultVersion: 1 };
  const rec = { cardId: 'card_0000001', stepId: 'step_0000001', proposalId: 'prop_0000001', proposalVersion: 1, format: 'explanation', stepTitle: 'Slopes', stepGoal: 'Read the slope.', passageText: 'The gradient points uphill.', language: 'en', depth: 'standard', retry: 0 };
  const quote = await quoteRoadmapCard({}, rec);
  assert.equal(quote.outcome, 'quoted');
  assert.deepEqual(quote.profile, await explanationProfileBinding(explanationProfileFor({})));
  const run = async accepted => { const m = scripted({ title: 'Slopes', body: withVisual('The gradient points uphill.') }); const out = await generateRoadmapCard({}, access, ref, { loadAccepted: async () => accepted, withProviderCall: async e => e, callModel: m.callModel }); return { out, calls: m.seen.length }; };
  const same = await run({ ...rec, profile: quote.profile });
  assert.deepEqual([same.out.outcome, same.calls], ['ok', 1]);
  const stale = await run({ ...rec, profile: { ...quote.profile, hash: '0000000000000000' } });
  assert.deepEqual([stale.out.outcome, stale.out.code, stale.calls], ['failed', 'profile_changed', 0], 'a changed profile sends nothing');
  const unknown = await run({ ...rec, profile: { id: 'gone', version: 1, hash: quote.profile.hash } });
  assert.deepEqual([unknown.out.code, unknown.calls], ['profile_changed', 0]);
});

test('a profile that extends another and overrides only the author repairs with that author, unless a repair role is named anywhere in the chain', () => {
  const base = EXPLANATION_REGISTRY.profiles['plan-default'].roles.author;
  const registry = registryWith({ 'author-sonnet': { version: 1, extends: 'plan-default', roles: { author: { ...base, model: 'claude-sonnet-5' } } },
    'repair-pinned': { version: 1, extends: 'plan-default', roles: { repair: { ...base, model: 'claude-haiku-4-5-20251001' } } },
    'pinned-then-author': { version: 1, extends: 'repair-pinned', roles: { author: { ...base, model: 'claude-sonnet-5' } } } });
  assert.equal(resolveExplanationProfile('author-sonnet', registry).roles.repair.model, 'claude-sonnet-5');
  assert.equal(resolveExplanationProfile('repair-pinned', registry).roles.repair.model, 'claude-haiku-4-5-20251001');
  assert.deepEqual(['claude-sonnet-5', 'claude-haiku-4-5-20251001'], [resolveExplanationProfile('pinned-then-author', registry).roles.author.model, resolveExplanationProfile('pinned-then-author', registry).roles.repair.model]);
});

// Owner 2026-11-08 (model decision): Gemini 3.5 Flash Lite first, gpt-oss on Fireworks as the fallback.
test('google-low: Gemini first with the Fireworks gpt-oss fallback, same effort on both steps', async () => {
  const { EXPLANATION_REGISTRY, CHAIN_STEPS, chainSteps } = await import('../src/explanation-models.js');
  const author = EXPLANATION_REGISTRY.profiles['google-low'].roles.author;
  assert.deepEqual(chainSteps(author).map(s => [s.provider, s.model]), [['google', CHAIN_STEPS.google.model], ['fireworks', CHAIN_STEPS.fireworks.model]]);
  assert.equal(author.settings.reasoning_effort, 'low'); assert.equal(author.adapter, 'fast-chain');
  assert.deepEqual(chainSteps(EXPLANATION_REGISTRY.profiles['fireworks-low'].roles.author).map(s => s.provider), ['fireworks', 'google'], 'the fireworks-low profile is unchanged');
});
