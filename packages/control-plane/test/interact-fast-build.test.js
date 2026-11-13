// Item 4: fast build profiles (google-low, fireworks-low). Every provider reply is a recorded, Gemini- or Fireworks-shaped OpenAI-compatible completion
// returned by a fake fetch; nothing leaves the process (a tripwire on globalThis.fetch proves it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHash } from '../../web/src/interact-plan.js';
import { fixtureDraft } from '../../web/src/interact-build-fixtures.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { CHAIN_ENDPOINTS } from '../src/explanation-fast-chain.js';
import { CHAIN_STEPS } from '../src/explanation-models.js';
import { INTERACT_REGISTRY, INTERACT_ROLE_IDS, InteractModelError, interactAdapters, interactProfileFor, interactReservation, resolveInteractProfile, roleBoundMicros, verifyServed } from '../src/interact-models.js';
import { buildScene, buildSchema, cleanBuildReply } from '../src/interact-build.js';

const { capabilities, plans } = await interactFixtures();
const job = async () => ({ id: 'job-standard', plan: structuredClone(plans.standard), planHash: await planHash(plans.standard), capabilities });
const ENV = { INTERACT_SCENE_PLAN_ENABLED: 'true', GEMINI_API_KEY: 'g-test', FIREWORKS_API_KEY: 'f-test' };
const scene = () => ({ kind: 'scene', ...fixtureDraft('standard') });

let fetches;
test.beforeEach(t => {
  const original = globalThis.fetch, log = console.log;
  fetches = 0; globalThis.fetch = () => { fetches++; throw new Error('network call in a fixture test'); }; console.log = () => {};
  t.after(() => { globalThis.fetch = original; console.log = log; assert.equal(fetches, 0, 'no real network'); });
});

// Recorded reply shapes. Gemini: dated served id, usage with thinking inside completion_tokens. Fireworks: the accounts/ path, reasoning tokens counted in completion_tokens.
const completion = (content, model, extra = {}) => ({ id: 'c1', model, choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(content) }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 9000, completion_tokens: 4200, total_tokens: 13200, completion_tokens_details: { reasoning_tokens: 600 } }, ...extra });
const gemini = content => completion(content, 'gemini-3.5-flash-lite-20260601');
const fireworks = content => completion(content, CHAIN_STEPS.fireworks.model);
const busy = () => Response.json({ error: { message: 'rate limited' } }, { status: 429 });

// replies: one per call, in order (a function, a Response or a JSON value); a function may return a never-settling promise.
function rig(replies, { profile = 'google-low', env = ENV, registry } = {}) {
  const requests = [], admitted = [], settled = [];
  const fetch = async (url, init) => { requests.push({ url, init, body: JSON.parse(init.body) }); const next = replies[requests.length - 1]; const r = typeof next === 'function' ? await next(init) : next; return r instanceof Response ? r : Response.json(r); };
  const ctx = { env, profile: resolveInteractProfile(profile, registry), adapters: interactAdapters({ env, fetch }), admit: async info => { admitted.push(info.config.provider); }, settle: async s => { settled.push(s); } };
  return { ctx, requests, admitted, settled };
}
const walk = (v, f) => { f(v); if (v && typeof v === 'object') Object.values(v).forEach(x => walk(x, f)); };
const keysOf = v => { const found = new Set(); walk(v, n => { if (n && typeof n === 'object') Object.keys(n).forEach(k => found.add(k)); }); return found; };

test('profiles resolve with the /explain model ids, per-provider deadlines and sampling; design and review stay on Opus; unknown and foreign profiles are refused', () => {
  for (const id of ['google-low', 'fireworks-low']) {
    const p = resolveInteractProfile(id);
    for (const role of ['design_author', 'design_review', 'design_revise', 'build_review']) assert.equal(p.roles[role].provider, 'anthropic', `${id} ${role}`);
    for (const role of ['build_author', 'build_repair']) {
      const c = p.roles[role], [fb] = c.fallbacks;
      assert.equal(c.model, CHAIN_STEPS[id.split('-')[0]].model); assert.equal(c.credentialRef, CHAIN_STEPS[c.provider].credentialRef);
      assert.equal(c.timeoutMs, CHAIN_ENDPOINTS[c.provider].deadlineMs); assert.equal(fb.timeoutMs, CHAIN_ENDPOINTS[fb.provider].deadlineMs);
      assert.equal(c.capabilities.oneOf, 'anyOf'); assert.equal(c.settings.reasoning_effort, 'low'); assert.ok(c.maxOutputTokens > 16000 * 0.5);
    }
  }
  const g = resolveInteractProfile('google-low').roles, f = resolveInteractProfile('fireworks-low').roles;
  assert.equal(g.build_author.model, 'gemini-3.5-flash-lite'); assert.equal(g.build_author.timeoutMs, 12000); assert.equal(g.build_author.fallbacks[0].model, 'accounts/fireworks/models/gpt-oss-120b');
  assert.equal(f.build_author.timeoutMs, 8000); assert.equal(f.build_author.fallbacks[0].provider, 'google');
  assert.deepEqual(g.build_author.settings, { reasoning_effort: 'low' }, 'Gemini: no temperature, no seed'); assert.equal(g.build_author.capabilities.stripBounds, true);
  assert.deepEqual(f.build_author.settings, { reasoning_effort: 'low', temperature: 0, seed: 7 }); assert.ok(!f.build_author.capabilities.stripBounds);
  assert.deepEqual(g.build_repair.settings, { reasoning_effort: 'low', temperature: 0.3 }); assert.deepEqual(f.build_repair.settings, { reasoning_effort: 'low', temperature: 0.3 }, 'repair 0.3 on every provider, no seed');
  assert.deepEqual(g.build_author.fallbacks[0].settings, { reasoning_effort: 'low', temperature: 0, seed: 7 }, 'the fallback step samples as its own provider');
  assert.throws(() => resolveInteractProfile('google-high'), { code: 'unknown_profile' });
  const role = structuredClone(g.build_author);
  const withRole = patch => ({ ...INTERACT_REGISTRY, profiles: { ...INTERACT_REGISTRY.profiles, x: { version: 1, extends: 'opus-baseline', roles: { build_author: { ...role, ...patch } } } } });
  assert.throws(() => resolveInteractProfile('x', withRole({ fallbacks: [{ ...role.fallbacks[0], endpoint: 'https://evil.example/v1' }] })), { code: 'endpoint_not_allowed' });
  assert.throws(() => resolveInteractProfile('x', withRole({ fallbacks: [{ ...role.fallbacks[0], fallbacks: [] }] })), { code: 'invalid_profile' });
  assert.throws(() => resolveInteractProfile('x', withRole({ settings: { reasoning_effort: 'low', seed: 7 } })), { code: 'invalid_profile' }, 'a Gemini role cannot carry a seed');
});

test('INTERACT_BUILD_PROFILE picks the profile; the default stays opus-baseline', () => {
  assert.equal(interactProfileFor({}).id, 'opus-baseline');
  assert.equal(interactProfileFor({ INTERACT_BUILD_PROFILE: 'fireworks-low' }).id, 'fireworks-low');
  assert.equal(interactProfileFor({ INTERACT_MODEL_PROFILE: 'opus-baseline', INTERACT_BUILD_PROFILE: 'fireworks-low' }).id, 'opus-baseline');
  assert.throws(() => interactProfileFor({ INTERACT_BUILD_PROFILE: 'gemini-low' }), { code: 'unknown_profile' });
});

test('every role of both fast profiles is priced from the existing registry (a null bound would refuse the profile before spend)', () => {
  for (const id of ['google-low', 'fireworks-low']) {
    const p = resolveInteractProfile(id);
    for (const role of INTERACT_ROLE_IDS) assert.ok(roleBoundMicros(p.roles[role]) > 0, `${id} ${role}`);
    for (const role of ['build_author', 'build_repair']) for (const fb of p.roles[role].fallbacks) assert.ok(roleBoundMicros(fb) > 0, `${id} ${role} fallback`);
    const r = interactReservation(p); assert.deepEqual(r.unknownRoles, []); assert.ok(r.generationMicros > 0 && r.preparationMicros > 0);
  }
});

test('the served model check accepts the dated Gemini id and the Fireworks accounts path, and still refuses another model', () => {
  const g = resolveInteractProfile('google-low').roles.build_author, f = resolveInteractProfile('fireworks-low').roles.build_author;
  assert.equal(verifyServed(g, 'gemini-3.5-flash-lite-20260601').verified, true); assert.equal(verifyServed(g, 'gemini-3.5-flash-lite').verified, true);
  assert.equal(verifyServed(f, 'accounts/fireworks/models/gpt-oss-120b').verified, true);
  assert.throws(() => verifyServed(g, 'gemini-3.5-pro'), { code: 'model_substituted' }); assert.throws(() => verifyServed(f, 'accounts/fireworks/models/llama'), { code: 'model_substituted' });
});

test('build_author on Gemini goes to a sealed artifact: Google endpoint, no temperature or seed, bounds stripped from the sent schema only, undeclared keys and double-escaped breaks cleaned', async () => {
  const reply = scene(); reply.main.layers = [1]; reply.main.program.manifest.summary = `One paragraph.\\nTwo paragraph.`;
  const { ctx, requests, settled } = rig([gemini(reply)]);
  const result = await buildScene(await job(), ctx);
  assert.ok(result.artifacts && result.composition, JSON.stringify(result.problems));
  assert.equal(requests.length, 1);
  const [{ url, init, body }] = requests;
  assert.equal(url, CHAIN_ENDPOINTS.google.url); assert.equal(init.headers.Authorization, 'Bearer g-test'); assert.equal(body.model, 'gemini-3.5-flash-lite');
  assert.equal(body.reasoning_effort, 'low'); assert.ok(!('temperature' in body) && !('seed' in body)); assert.equal(body.stream, false); assert.equal(body.max_tokens, ctx.profile.roles.build_author.maxOutputTokens);
  const sent = keysOf(body.response_format.json_schema.schema);
  for (const k of ['minItems', 'maxItems', 'minimum', 'maximum', 'oneOf']) assert.ok(!sent.has(k), `${k} is not sent to Gemini`);
  assert.ok(keysOf(buildSchema((await job()).plan)).has('maxItems'), 'the full schema still has its bounds (the validator enforces them)');
  const manifest = result.artifacts.main.program.manifest;
  assert.ok(manifest.summary.includes('One paragraph.\nTwo paragraph.') && !manifest.summary.includes('\\n'), 'double-escaped line break fixed server-side');
  assert.equal(result.call.fallbackFired, false); assert.equal(result.call.requested.model, 'gemini-3.5-flash-lite'); assert.equal(result.call.served.model, 'gemini-3.5-flash-lite-20260601'); assert.equal(result.call.served.verified, true);
  assert.equal(settled.length, 1); assert.equal(settled[0].status, 'settled'); assert.ok(settled[0].costMicros > 0, 'priced from the existing registry');
});

test('build_author on Fireworks: its endpoint, temperature 0 and seed 7, bounds kept, and the schema bundle is byte-identical across requests', async () => {
  const a = rig([fireworks(scene())], { profile: 'fireworks-low' }), b = rig([fireworks(scene())], { profile: 'fireworks-low' });
  const result = await buildScene(await job(), a.ctx); await buildScene(await job(), b.ctx);
  assert.ok(result.artifacts && result.composition, JSON.stringify(result.problems));
  const { url, init, body } = a.requests[0];
  assert.equal(url, CHAIN_ENDPOINTS.fireworks.url); assert.equal(init.headers.Authorization, 'Bearer f-test'); assert.equal(body.model, 'accounts/fireworks/models/gpt-oss-120b');
  assert.equal(body.temperature, 0); assert.equal(body.seed, 7); assert.equal(body.reasoning_effort, 'low');
  assert.ok(keysOf(body.response_format.json_schema.schema).has('maxItems')); assert.ok(!keysOf(body.response_format.json_schema.schema).has('oneOf'));
  assert.equal(JSON.stringify(a.requests[0].body.response_format), JSON.stringify(b.requests[0].body.response_format), 'the schema bundle is fixed, never built per request');
  assert.equal(result.call.served.model, 'accounts/fireworks/models/gpt-oss-120b'); assert.equal(result.call.fallbackFired, false);
});

test('a first step that answers 429 moves the same request to the next step, and the call record says so', async () => {
  const { ctx, requests, admitted, settled } = rig([busy, fireworks(scene())]);
  const result = await buildScene(await job(), ctx);
  assert.ok(result.artifacts, JSON.stringify(result.problems));
  assert.deepEqual(requests.map(r => r.url), [CHAIN_ENDPOINTS.google.url, CHAIN_ENDPOINTS.fireworks.url]); assert.deepEqual(admitted, ['google', 'fireworks'], 'each step is its own admitted call');
  assert.deepEqual(requests[1].body.messages, requests[0].body.messages, 'the SAME request');
  assert.equal(requests[1].body.temperature, 0); assert.equal(requests[1].body.seed, 7, 'the fallback samples as Fireworks');
  assert.equal(result.call.fallbackFired, true); assert.equal(result.call.requested.model, 'accounts/fireworks/models/gpt-oss-120b');
  assert.deepEqual(settled.map(s => s.status), ['refused', 'settled']);
});

test('a 5xx, a 400 and a refusal: 5xx falls back, 400 and a quota refusal do not', async () => {
  const five = rig([() => new Response('oops', { status: 503 }), fireworks(scene())]);
  assert.equal((await buildScene(await job(), five.ctx)).call.fallbackFired, true);
  const bad = rig([() => Response.json({ error: { message: 'invalid argument' } }, { status: 400 }), fireworks(scene())]);
  await assert.rejects(buildScene(await job(), bad.ctx), { code: 'http_error' }); assert.equal(bad.requests.length, 1);
});

test('INTERACT_FALLBACK=off runs the role\'s own provider only and its failure stands', async () => {
  const { ctx, requests } = rig([busy, fireworks(scene())], { env: { ...ENV, INTERACT_FALLBACK: 'off' } });
  await assert.rejects(buildScene(await job(), ctx), { code: 'provider_unavailable', providerStatus: 429, step: 0 }); assert.equal(requests.length, 1);
});

test('a timed-out step keeps its reservation (unknown outcome, cost null, never 0) and the next step answers', async () => {
  const slow = { ...structuredClone(INTERACT_REGISTRY.profiles['google-low'].roles.build_author), timeoutMs: 20 };
  const registry = { ...INTERACT_REGISTRY, profiles: { ...INTERACT_REGISTRY.profiles, 'google-fast-timeout': { version: 1, extends: 'opus-baseline', roles: { build_author: slow } } } };
  const { ctx, requests, settled } = rig([() => new Promise(() => {}), fireworks(scene())], { profile: 'google-fast-timeout', registry });
  const result = await buildScene(await job(), ctx);
  assert.equal(requests.length, 2); assert.equal(settled[0].status, 'unknown'); assert.equal(settled[0].costMicros, null); assert.equal(settled[0].error.cause, 'timeout');
  assert.equal(result.call.fallbackFired, true);
});

test('a step with no credential is skipped; no credential at all is refused before any call or admission', async () => {
  const only = rig([fireworks(scene())], { env: { INTERACT_SCENE_PLAN_ENABLED: 'true', FIREWORKS_API_KEY: 'f-test' } });
  const result = await buildScene(await job(), only.ctx);
  assert.deepEqual(only.requests.map(r => r.url), [CHAIN_ENDPOINTS.fireworks.url]); assert.equal(result.call.requested.provider, 'fireworks');
  const none = rig([], { env: { INTERACT_SCENE_PLAN_ENABLED: 'true' } });
  await assert.rejects(buildScene(await job(), none.ctx), error => error instanceof InteractModelError && error.code === 'credential_missing' && error.sent === false);
  assert.equal(none.requests.length, 0); assert.equal(none.admitted.length, 0); assert.equal(none.settled.length, 0);
});

test('a schema-invalid answer still invalid after its correction moves the same request to the next step', async () => {
  const wrong = { kind: 'nonsense' };
  const { ctx, requests } = rig([gemini(wrong), gemini(wrong), fireworks(scene())]);
  const result = await buildScene(await job(), ctx);
  assert.ok(result.artifacts, JSON.stringify(result.problems));
  assert.deepEqual(requests.map(r => r.url.includes('fireworks')), [false, false, true]);
  assert.match(requests[1].body.messages[1].content, /correction/); assert.ok(!/correction/.test(requests[2].body.messages[1].content), 'the next step gets the original request, not the correction');
  assert.equal(result.call.fallbackFired, true);
});

test('the default profile has no fallback chain', async () => {
  const profile = resolveInteractProfile('opus-baseline');
  for (const role of INTERACT_ROLE_IDS) assert.equal(profile.roles[role].fallbacks, undefined);
});

test('cleanBuildReply leaves a valid reply exactly as it is and never touches program source', () => {
  const plan = plans.standard, valid = scene(), schema = buildSchema(plan);
  assert.deepEqual(cleanBuildReply(structuredClone(valid), schema), valid);
  const withEscapes = structuredClone(valid); withEscapes.main.program.source = `${withEscapes.main.program.source}\nconst s = 'a\\nB';`;
  assert.equal(cleanBuildReply(withEscapes, schema).main.program.source, withEscapes.main.program.source);
});
