// INT-07A-C01, C02, C07 to C10: profiles, role overrides, capability and credential preflight, served-model checks, budget admission,
// unknown outcomes and zero paid calls in fixture mode. Every transport is a deterministic fake; a tripwire on globalThis.fetch proves it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEARN_TASKS } from '../src/learn-models.js';
import { EXPLAIN_ROLES } from '../src/explain-policy.js';
import { INTERACT_LIMITS, INTERACT_REGISTRY, INTERACT_ROLES, INTERACT_ROLE_IDS, InteractModelError, callInteractRole, interactAdapters, interactCallKind, interactCostMicros,
  interactFlowEnabled, interactPhase, interactProfileFor, interactProfileHash, interactReservation, resolveInteractProfile, roleBoundMicros, verifyServed } from '../src/interact-models.js';

const PLAN = { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string', minLength: 1 } } };
const png = { media_type: 'image/png', data: 'iVBORw0KGgo=' };
const ON = { INTERACT_SCENE_PLAN_ENABLED: 'true', ANTHROPIC_API_KEY: 'test-key' };

let fetches;
test.beforeEach(t => {
  const original = globalThis.fetch, log = console.log;
  fetches = 0;
  globalThis.fetch = () => { fetches++; throw new Error('network call in a fixture test'); };
  console.log = () => {};
  t.after(() => { globalThis.fetch = original; console.log = log; });
});

const candidateRole = (extra = {}) => ({ provider: 'celeris', model: 'celeris-x', adapter: 'openai-compatible', credentialRef: 'CELERIS_API_KEY', endpoint: 'https://inference.celeris.ai/celeris-1/v1',
  maxOutputTokens: 6000, maxInputBytes: 60000, maxImages: 0, timeoutMs: 120000, settings: {}, pricingKey: { provider: 'celeris', model: 'celeris-x', tier: 'standard' },
  capabilities: { vision: false, structuredOutput: 'json_schema', oneOf: 'native', settings: [] }, servedModelAliases: ['celeris-x-2026'], servedMatch: 'exact', ...extra });
const registryWith = profiles => ({ ...INTERACT_REGISTRY, profiles: { ...INTERACT_REGISTRY.profiles, ...profiles } });
const MIXED = registryWith({ mixed: { version: 1, extends: 'opus-baseline', roles: { design_review: candidateRole() } } });

const anthropicReply = (input, extra = {}) => ({ model: 'claude-opus-5-5-20260101', stop_reason: 'tool_use', usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 2000, cache_creation_input_tokens: 100 },
  content: [{ type: 'tool_use', id: 't', name: 'return_result', input }], ...extra });
// A ctx whose Anthropic transport is a recording fake.
function context({ profile = resolveInteractProfile('opus-baseline'), reply = () => anthropicReply({ title: 'T' }), env = ON, ...rest } = {}) {
  const calls = [], settles = [];
  const callModel = async (e, body, model) => { calls.push({ body, model }); const r = reply(body); return r instanceof Response ? r : Response.json(r); };
  return { calls, settles, ctx: { env, profile, adapters: interactAdapters({ env, callModel }), settle: s => settles.push(s), ...rest } };
}
const ask = (ctx, role = 'design_author', extra = {}) => callInteractRole(ctx, role, { system: 'You design.', schema: PLAN, input: { prompt: 'x' }, ...extra });

// ---- C02 task registration, C01 profiles ----
test('the three design roles are registered and nothing else in the task list changed shape', () => {
  for (const [task, maxTokens] of [['interact_design_author', 12000], ['interact_design_review', 10000], ['interact_design_revise', 14000]]) {
    assert.ok(Object.isFrozen(LEARN_TASKS[task]), task);
    assert.deepEqual({ ...LEARN_TASKS[task] }, { provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (exactly one tool call)', maxTokens });
  }
  // The build roles reuse the existing ids and keep their legacy limits for legacy jobs.
  assert.deepEqual(['explain_author', 'explain_review', 'explain_repair'].map(t => LEARN_TASKS[t].maxTokens), [10000, 3000, 6000]);
  assert.deepEqual(Object.values(EXPLAIN_ROLES).map(r => r.task), ['explain_brief', 'explain_author', 'explain_review', 'explain_repair']);
});

test('opus-baseline is the default all-Opus profile with the section 5 limits per role', () => {
  const profile = resolveInteractProfile('opus-baseline');
  assert.deepEqual([profile.id, profile.version], ['opus-baseline', 1]);
  assert.ok(Object.isFrozen(profile) && Object.isFrozen(profile.roles) && Object.isFrozen(profile.roles.design_author.settings));
  const expected = { design_author: [12000, 60000, 4], design_review: [10000, 60000, 4], design_revise: [14000, 60000, 4], build_author: [16000, 80000, 4], build_review: [10000, 80000, 6], build_repair: [16000, 80000, 2] };
  assert.deepEqual(Object.keys(profile.roles), INTERACT_ROLE_IDS);
  for (const [role, [out, input, images]] of Object.entries(expected)) {
    const c = profile.roles[role];
    assert.deepEqual([c.provider, c.model, c.adapter, c.credentialRef, c.maxOutputTokens, c.maxInputBytes, c.maxImages, c.timeoutMs], ['anthropic', 'claude-opus-5-5', 'anthropic', 'ANTHROPIC_API_KEY', out, input, images, 300000], role);
    assert.deepEqual(c.settings, {}, 'no hidden thinking or effort');
    assert.deepEqual(c.pricingKey, { provider: 'anthropic', model: 'claude-opus-5-5', tier: 'standard' });
    assert.equal(c.task, INTERACT_ROLES[role].task);
  }
  assert.deepEqual(['build_author', 'build_review', 'build_repair'].map(r => profile.roles[r].task), ['explain_author', 'explain_review', 'explain_repair']);
  assert.equal(interactProfileFor({}).id, 'opus-baseline');
  assert.equal(interactProfileFor({ INTERACT_MODEL_PROFILE: '' }).id, 'opus-baseline');
});

test('an unknown profile is an error, never a silent fall back to Opus', () => {
  for (const id of ['nope', '', undefined, null, 'constructor', '__proto__', 7]) assert.throws(() => resolveInteractProfile(id), { code: 'unknown_profile' }, String(id));
  assert.throws(() => interactProfileFor({ INTERACT_MODEL_PROFILE: 'opus-basline' }), { code: 'unknown_profile' });
});

test('a single-role override changes only that role and the profile hash with it', async () => {
  const mixed = resolveInteractProfile('mixed', MIXED), base = resolveInteractProfile('opus-baseline');
  assert.equal(mixed.roles.design_review.provider, 'celeris');
  assert.equal(mixed.roles.design_review.endpoint, 'https://inference.celeris.ai/celeris-1/v1');
  assert.equal(mixed.roles.design_review.role, 'design_review');
  for (const role of INTERACT_ROLE_IDS.filter(r => r !== 'design_review')) assert.deepEqual(mixed.roles[role], base.roles[role], role);
  assert.notEqual(await interactProfileHash(mixed), await interactProfileHash(base));
  assert.equal(await interactProfileHash(base), await interactProfileHash(resolveInteractProfile('opus-baseline')));
});

test('the registry refuses configs a server profile must not contain', () => {
  const bad = (role, extra, code) => assert.throws(() => resolveInteractProfile('x', registryWith({ x: { version: 1, extends: 'opus-baseline', roles: { [role]: candidateRole(extra) } } })), { code }, JSON.stringify(extra));
  bad('design_review', { credentialRef: 'sk-live-abc123' }, 'invalid_profile'); // a secret value, not an env NAME
  bad('design_review', { credentialRef: 'ANTHROPIC_API_KEY' }, 'credential_mismatch'); // another provider's key at a foreign endpoint
  bad('design_review', { endpoint: 'http://inference.celeris.ai/v1' }, 'endpoint_not_allowed');
  bad('design_review', { endpoint: 'https://evil.example/v1' }, 'endpoint_not_allowed');
  bad('design_review', { endpoint: 'https://user:pw@inference.celeris.ai/v1' }, 'endpoint_not_allowed');
  bad('design_review', { settings: { temperature: 0.1 } }, 'invalid_profile'); // not a listed supported setting
  bad('design_review', { maxImages: 5 }, 'invalid_profile'); // above the design image cap
  bad('build_repair', { maxImages: 3 }, 'invalid_profile'); // above the repairer's 2
  bad('design_review', { timeoutMs: 300001 }, 'invalid_profile');
  bad('design_review', { adapter: 'anthropic', endpoint: undefined }, 'invalid_profile'); // json_schema output on the tool-call adapter
  bad('design_review', { capabilities: { vision: false, structuredOutput: 'tool_call', oneOf: 'native', settings: [] } }, 'invalid_profile'); // tool_call on the json adapter
  assert.throws(() => resolveInteractProfile('x', registryWith({ x: { version: 1, extends: 'opus-baseline', roles: { not_a_role: {} } } })), { code: 'unknown_role' });
});

// ---- C01 preflight: capabilities, credentials, no learner override ----
test('the new flow is off unless its server switch is on', async () => {
  assert.equal(interactFlowEnabled({}), false);
  assert.equal(interactFlowEnabled(ON), true);
  const { ctx, calls } = context({ env: { ANTHROPIC_API_KEY: 'k' } });
  await assert.rejects(() => ask(ctx), { code: 'flow_disabled', sent: false });
  assert.equal(calls.length, 0);
});

test('a learner request can never choose the provider, model, URL or credential', async () => {
  const { ctx, calls } = context();
  for (const key of ['model', 'provider', 'url', 'endpoint', 'credentialRef', 'apiKey', 'profile', 'adapter']) await assert.rejects(() => ask(ctx, 'design_author', { [key]: 'x' }), { code: 'request_override' }, key);
  await assert.rejects(() => callInteractRole(ctx, 'not_a_role', { system: 's', schema: PLAN, input: 'x' }), { code: 'unknown_role' });
  assert.equal(calls.length, 0);
});

test('unsupported vision and structured-output capabilities fail before any call, naming what was refused', async () => {
  const text = candidateRole(), noJson = candidateRole({ capabilities: { vision: false, structuredOutput: null, oneOf: 'native', settings: [] } });
  const registry = registryWith({ m: { version: 1, extends: 'opus-baseline', roles: { design_review: text, design_revise: noJson, build_review: candidateRole({ maxImages: 0, capabilities: { vision: false, structuredOutput: 'json_schema', oneOf: 'none', settings: [] } }) } } });
  const { ctx, calls } = context({ profile: resolveInteractProfile('m', registry) });
  await assert.rejects(() => ask(ctx, 'design_review', { images: [png] }), { code: 'capability_vision', sent: false });
  await assert.rejects(() => ask(ctx, 'design_revise'), { code: 'capability_structured_output', sent: false });
  await assert.rejects(() => ask(ctx, 'build_review', { schema: { type: 'object', properties: { v: { oneOf: [{ type: 'string' }, { type: 'number' }] } } } }), { code: 'capability_schema', sent: false });
  await assert.rejects(() => ask(ctx, 'build_repair', { images: [png, png, png] }), { code: 'images', sent: false });
  await assert.rejects(() => ask(ctx, 'design_author', { system: 'x'.repeat(60001) }), { code: 'input_too_large', sent: false });
  assert.equal(calls.length, 0);
  assert.equal(fetches, 0);
});

test('absent credentials stop the call before anything is sent; fixture mode needs none', async () => {
  const noKey = { INTERACT_SCENE_PLAN_ENABLED: 'true' }, { ctx, calls } = context({ env: noKey });
  await assert.rejects(() => ask(ctx), { code: 'credential_missing', sent: false });
  assert.equal(calls.length, 0);
  const subscription = context({ env: { ...noKey, SUBSCRIPTION_ONLY: 'true' } });
  assert.equal((await ask(subscription.ctx)).output.title, 'T', 'the subscription bridge needs no key');
  const fixture = context({ env: {}, fixture: true });
  assert.equal((await ask(fixture.ctx)).output.title, 'T');
  // A candidate credential is never satisfied by Opus's key.
  const mixed = context({ profile: resolveInteractProfile('mixed', MIXED), env: ON });
  mixed.ctx.adapters = interactAdapters({ env: ON, callModel: async () => new Response('{}'), fetch: async () => { throw new Error('should not send'); } });
  await assert.rejects(() => ask(mixed.ctx, 'design_review'), { code: 'credential_missing', sent: false });
  // A candidate transport without an admission hook is refused outside fixture mode.
  const keyed = { ...ON, CELERIS_API_KEY: 'k' };
  await assert.rejects(() => ask({ ...mixed.ctx, env: keyed }, 'design_review'), { code: 'no_admission', sent: false });
  assert.equal(fetches, 0);
});

// ---- C07 served model ----
test('served-model verification follows the role profile; missing identity is unknown, a mismatch fails', async () => {
  const base = resolveInteractProfile('opus-baseline').roles.design_author, cand = resolveInteractProfile('mixed', MIXED).roles.design_review;
  assert.deepEqual(verifyServed(base, 'claude-opus-5-5'), { model: 'claude-opus-5-5', verified: true, approvedAlias: false });
  assert.deepEqual(verifyServed(base, 'claude-opus-5-5-20260101'), { model: 'claude-opus-5-5-20260101', verified: true, approvedAlias: false });
  assert.deepEqual(verifyServed(base, null), { model: null, verified: null, approvedAlias: false });
  for (const served of ['claude-opus-5-5-fast', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-opus-5-5-2026']) assert.throws(() => verifyServed(base, served), { code: 'model_substituted', requested: 'claude-opus-5-5', served }, served);
  assert.deepEqual(verifyServed(cand, 'celeris-x-2026'), { model: 'celeris-x-2026', verified: true, approvedAlias: true });
  assert.throws(() => verifyServed(cand, 'celeris-x-20260101'), { code: 'model_substituted' }, 'an exact-match profile has no snapshot rule');

  const { ctx, settles } = context({ reply: () => anthropicReply({ title: 'T' }, { model: undefined }) });
  const done = await ask(ctx);
  assert.deepEqual([done.served.model, done.served.verified], [null, null], 'unknown stays unknown, not assumed to match');
  assert.equal(done.requested.model, 'claude-opus-5-5');
  assert.equal(settles.length, 1);

  const wrong = context({ reply: () => anthropicReply({ title: 'T' }, { model: 'claude-sonnet-5-5' }) });
  await assert.rejects(() => ask(wrong.ctx), { code: 'model_substituted', served: 'claude-sonnet-5-5', requested: 'claude-opus-5-5' });
  assert.equal(wrong.settles.length, 1);
  assert.equal(wrong.settles[0].costMicros, null, 'a substituted model cannot be priced as the requested one');
  assert.deepEqual(wrong.settles[0].requested.model, 'claude-opus-5-5');
  assert.deepEqual(wrong.settles[0].served.model, 'claude-sonnet-5-5', 'requested and served are logged separately');
});

// ---- a working all-Opus call ----
test('callInteractRole runs a design and a build role on the all-Opus profile and settles the booked cost', async () => {
  const { ctx, calls, settles } = context();
  const done = await ask(ctx, 'design_author', { images: [png] });
  assert.deepEqual(done.output, { title: 'T' });
  assert.deepEqual(done.requested, { role: 'design_author', task: 'interact_design_author', provider: 'anthropic', model: 'claude-opus-5-5', profileId: 'opus-baseline', profileVersion: 1 });
  assert.deepEqual(done.served, { provider: 'anthropic', model: 'claude-opus-5-5-20260101', verified: true, approvedAlias: false });
  // 1000 input at $4, 500 output at $20, 2000 cache read at $0.20, 100 cache write at $5 per MTok = 4000 + 10000 + 400 + 500 micro-USD.
  assert.equal(done.costMicros, 14900);
  assert.equal(done.priceKnown, true);
  assert.equal(done.stopReason, 'complete');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'claude-opus-5-5');
  assert.equal(calls[0].body.max_tokens, 12000);
  assert.equal(calls[0].body.messages[0].content.length, 2, 'text plus the one image');
  const build = await ask(ctx, 'build_author');
  assert.equal(calls[1].body.max_tokens, 16000, 'the new-flow builder limit, not the legacy 10,000');
  assert.equal(build.requested.task, 'explain_author');
  assert.equal(settles.length, 2);
  assert.deepEqual(settles.map(s => [s.role, s.status, s.sent]), [['design_author', 'settled', true], ['build_author', 'settled', true]]);
});

// ---- C08 and C09 budgets ----
test('role bounds and phase reservations come from the profile, with design in preparation and build in generation', () => {
  const profile = resolveInteractProfile('opus-baseline'), bound = role => roleBoundMicros(profile.roles[role]);
  // (input bytes + images x 4,784) x $5 (the 5-minute cache write) + max output x $20, per MTok.
  assert.deepEqual(INTERACT_ROLE_IDS.map(bound), [635680, 595680, 675680, 815680, 743520, 767840]);
  const r = interactReservation(profile);
  assert.deepEqual([r.preparationMicros, r.generationMicros, r.unknownRoles], [2 * 635680 + 4 * 595680 + 3 * 675680, 2 * 815680 + 5 * 743520 + 4 * 767840, []]);
  assert.deepEqual(Object.values(INTERACT_LIMITS.calls), [2, 4, 3, 2, 5, 4]); // the second author call is the one correction of a refused plan; the build roles get one correction each (build_author 1+1, build_review 1+3+1, build_repair 3+1)
  assert.deepEqual(INTERACT_LIMITS.deadlines, { callMs: 300000, preparationMs: 600000, jobMs: 1200000 });
  for (const role of ['design_author', 'design_review', 'design_revise']) assert.equal(interactPhase(role), 'preparation', role);
  for (const role of ['build_author', 'build_review', 'build_repair']) assert.equal(interactPhase(role), 'generation', role);
  assert.deepEqual(INTERACT_ROLE_IDS.map(interactCallKind), ['generation', 'evaluation', 'generation', 'generation', 'evaluation', 'repair']);
  assert.throws(() => interactPhase('brief'), { code: 'unknown_role' });
});

test('an unknown price is unknown, never zero', async () => {
  const unpriced = registryWith({ u: { version: 1, extends: 'opus-baseline', roles: { design_review: candidateRole() } } });
  const profile = resolveInteractProfile('u', unpriced), cfg = profile.roles.design_review;
  assert.equal(roleBoundMicros(cfg), null);
  const r = interactReservation(profile);
  assert.deepEqual([r.preparationMicros, r.unknownRoles], [null, ['design_review']], 'the phase is unknown, not a smaller number');
  assert.equal(r.generationMicros, 8420320, 'a phase of fully priced roles still has its number');
  assert.equal(interactCostMicros(cfg, { quantities: { input: 100, output: 100 } }), null);
  assert.equal(interactCostMicros(profile.roles.design_author, { quantities: null }), null, 'absent usage is unknown');
  // Through a call: the adapter answered, the price is unknown.
  const env = { ...ON, CELERIS_API_KEY: 'k' }, settles = [];
  const fetch = async () => Response.json({ model: 'celeris-x', choices: [{ message: { content: '{"title":"T"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  const done = await callInteractRole({ env, profile, adapters: interactAdapters({ env, callModel: async () => new Response('{}'), fetch }), admit: async () => {}, settle: s => settles.push(s) }, 'design_review', { system: 's', schema: PLAN, input: 'x' });
  assert.deepEqual([done.costMicros, done.priceKnown, done.served.model], [null, false, 'celeris-x']);
  assert.equal(settles[0].costMicros, null);
});

test('admission denies a call before it is sent, and a denied call is not a sent call', async () => {
  const seen = [], { ctx, calls, settles } = context({ admit: async a => { seen.push(a); throw Object.assign(new InteractModelError('spend_refused', 'Allowance reached.'), {}); } });
  await assert.rejects(() => ask(ctx, 'build_review'), { code: 'spend_refused', sent: false });
  assert.equal(calls.length, 0);
  assert.deepEqual([seen[0].role, seen[0].phase, seen[0].boundMicros, seen[0].images], ['build_review', 'generation', 743520, 0]);
  assert.deepEqual([settles[0].status, settles[0].sent, settles[0].costMicros], ['refused', false, 0]);
});

// ---- unknown outcomes ----
test('an unknown outcome is not resent and is not booked as zero', async () => {
  let sent = 0;
  const { ctx, settles } = context();
  ctx.adapters = { anthropic: { call: async () => { sent++; throw new TypeError('network connection lost'); } } };
  await assert.rejects(() => ask(ctx), e => e.code === 'unknown_outcome' && e.sent === true && e.resend === false && e.costMicros === null && e.cause === 'transport');
  assert.equal(sent, 1, 'one request, no automatic retry');
  assert.deepEqual([settles[0].status, settles[0].costMicros], ['unknown', null]);
  assert.equal(settles.length, 1);
});

test('a timeout or cancellation after sending is an unknown outcome with its cause', async () => {
  const quick = registryWith({ q: { version: 1, extends: 'opus-baseline', roles: { design_author: { timeoutMs: 15 } } } });
  const waits = signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const timeout = context({ profile: resolveInteractProfile('q', quick) });
  timeout.ctx.adapters = { anthropic: { call: ({ signal }) => waits(signal) } };
  await assert.rejects(() => ask(timeout.ctx), { code: 'unknown_outcome', cause: 'timeout', costMicros: null });
  const controller = new AbortController(), cancelled = context({ signal: controller.signal });
  cancelled.ctx.adapters = { anthropic: { call: ({ signal }) => { setTimeout(() => controller.abort(), 5); return waits(signal); } } };
  await assert.rejects(() => ask(cancelled.ctx), { code: 'unknown_outcome', cause: 'cancelled', costMicros: null });
  assert.deepEqual([timeout.settles[0].status, cancelled.settles[0].status], ['unknown', 'unknown']);
});

test('a reply that cannot be used is still billed from its usage, and a provider refusal books nothing', async () => {
  const truncated = context({ reply: () => anthropicReply({ title: 'T' }, { stop_reason: 'max_tokens' }) });
  await assert.rejects(() => ask(truncated.ctx), e => e.code === 'truncated' && e.costMicros === 14900);
  assert.deepEqual([truncated.settles[0].status, truncated.settles[0].costMicros], ['invalid_output', 14900]);
  const overloaded = context({ reply: () => new Response('{}', { status: 529 }) });
  await assert.rejects(() => ask(overloaded.ctx), { code: 'provider_unavailable' });
  assert.deepEqual([overloaded.settles[0].status, overloaded.settles[0].costMicros], ['refused', 0]);
  const http = context({ reply: () => Response.json({ error: { message: 'bad request' } }, { status: 400 }) });
  await assert.rejects(() => ask(http.ctx), { code: 'http_error' });
  assert.deepEqual([http.settles[0].status, http.settles[0].costMicros], ['failed', null], 'a failed request has an unknown cost, not zero');
});

// ---- fixture mode ----
test('fixture mode makes zero paid calls across every role and both adapters', async () => {
  const env = { INTERACT_SCENE_PLAN_ENABLED: 'true' }, fake = { calls: 0 };
  const callModel = async () => { fake.calls++; return Response.json(anthropicReply({ title: 'T' })); };
  const compat = async () => { fake.calls++; return Response.json({ model: 'celeris-x', choices: [{ message: { content: '{"title":"T"}' }, finish_reason: 'stop' }] }); };
  const profiles = [resolveInteractProfile('opus-baseline'), resolveInteractProfile('mixed', MIXED)];
  for (const profile of profiles) {
    const ctx = { env, fixture: true, profile, adapters: interactAdapters({ env: { ...env, CELERIS_API_KEY: 'fixture' }, callModel, fetch: compat }) };
    for (const role of INTERACT_ROLE_IDS) assert.equal((await ask(ctx, role)).output.title, 'T', `${profile.id} ${role}`);
  }
  assert.equal(fake.calls, INTERACT_ROLE_IDS.length * 2);
  assert.equal(fetches, 0, 'the real fetch was never touched');
});
