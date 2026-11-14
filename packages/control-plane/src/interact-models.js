// /interact model roles, profiles and bounded calls (INT-07A, docs/features/interact.md section 5 and "Swappable models").
// resolveInteractProfile(profileId, registry) -> a frozen Profile of six per-role configs; callInteractRole(ctx, role, args) is the one
// bounded call: capability and credential preflight, admission hook, adapter call, served-model check, cost, settlement hook.
// Only the SERVER-owned registry below chooses a provider, model, URL or credential name; a learner request, prompt or tool result cannot.
// New flow only (INTERACT_SCENE_PLAN_ENABLED, off by default): /animation, written /explain, Chat and every legacy limit are untouched.
// Nothing here has a default transport: the job injects admitted adapters (interact-model-adapters.js interactAdapters).
import { LEARN_TASKS } from './learn-models.js';
import { priceUsage, rateOf } from './pricing-registry.js';
import { sha256Hex } from './learn-grade-jev.js';
import { InteractModelError, canonical, usesOneOf } from './interact-model-adapters.js';
import { AUTHOR_SEED, AUTHOR_TEMPERATURE, CHAIN_ENDPOINTS, REPAIR_TEMPERATURE, withoutBounds } from './explanation-fast-chain.js';
import { CHAIN_STEPS } from './explanation-models.js';
import { CONTRACT_LIMITS } from '../../web/src/explain-program/contract.js';

export { InteractModelError, interactAdapters } from './interact-model-adapters.js';

export const INTERACT_POLICY_VERSION = 1;
export const INTERACT_PROFILE_SETTING = 'INTERACT_MODEL_PROFILE'; // the server setting; unset or empty means the registry default
export const INTERACT_BUILD_PROFILE_SETTING = 'INTERACT_BUILD_PROFILE'; // the same choice for the build half (google-low, fireworks-low); INTERACT_MODEL_PROFILE wins when both are set
export const INTERACT_FALLBACK_SETTING = 'INTERACT_FALLBACK'; // 'off' (benchmarks: a fallback is a failure) runs a role's own provider only, like EXPLANATION_FALLBACK=off
export const interactFlowEnabled = env => env?.INTERACT_SCENE_PLAN_ENABLED === 'true';

const deepFreeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(deepFreeze); } return v; };
const refuse = (code, message, extra) => new InteractModelError(code, message, { sent: false, ...extra });

// Per logical role: the LEARN_TASKS id (design roles are new; build roles reuse the existing explain_* ids), the usage phase (design in
// preparation, build in generation), the spend-ledger kind, the per-plan-attempt call ceiling and the per-call input and image ceilings.
// maxOutputTokens: the design roles' come from their LEARN_TASKS entry, the build roles' are the new-flow values (the legacy explain_*
// limits of 10,000/3,000/6,000 stay for legacy jobs). Section 5: 12,000 / 6,000 / 14,000 / 16,000 / 6,000 / 16,000; build_review is raised to 10,000 below.
// calls: a refused answer (schema_mismatch and friends) gets ONE correction call that names the problems, like the design Author: build_author 1 + 1; build_repair three rounds + 1;
// build_review 1 + three re-reviews after repairs + 1 (interact-build.js callWithCorrection). A correction is counted and bounded like any call.
// build_review 10,000: a review writes a verdict and up to several findings (about 150 to 250 tokens each, a message is no longer cut before it is read) for each of up to 6 captures,
// and the design reviewer already needed more than 6,000 for one plan. A reply cut off at the cap is a lost review (stopReason truncated), so the cap is generous.
const NEW_FLOW_BUILD_TOKENS = { build_author: 16000, build_review: 10000, build_repair: 16000 };
export const INTERACT_ROLES = deepFreeze({
  design_author: { task: 'interact_design_author', phase: 'preparation', kind: 'generation', calls: 2, maxInputBytes: 60000, maxImages: 4, maxOutputTokens: LEARN_TASKS.interact_design_author.maxTokens },
  design_review: { task: 'interact_design_review', phase: 'preparation', kind: 'evaluation', calls: 4, maxInputBytes: 60000, maxImages: 4, maxOutputTokens: LEARN_TASKS.interact_design_review.maxTokens },
  design_revise: { task: 'interact_design_revise', phase: 'preparation', kind: 'generation', calls: 3, maxInputBytes: 60000, maxImages: 4, maxOutputTokens: LEARN_TASKS.interact_design_revise.maxTokens },
  build_author: { task: 'explain_author', phase: 'generation', kind: 'generation', calls: 2, maxInputBytes: 80000, maxImages: 4, maxOutputTokens: NEW_FLOW_BUILD_TOKENS.build_author },
  build_review: { task: 'explain_review', phase: 'generation', kind: 'evaluation', calls: 5, maxInputBytes: 80000, maxImages: 6, maxOutputTokens: NEW_FLOW_BUILD_TOKENS.build_review },
  build_repair: { task: 'explain_repair', phase: 'generation', kind: 'repair', calls: 4, maxInputBytes: 80000, maxImages: 2, maxOutputTokens: NEW_FLOW_BUILD_TOKENS.build_repair },
  // The bench lane's blind judge (interact-bench.js), after a card is delivered with INTERACT_REVIEW=shadow: claude-sonnet-5-5, never Opus; a phase of its own, so it is in neither
  // reservation (interactReservation) and is paid by the platform (explain-job.js benchTransport), never from the learner's allowance. Text only: maxImages 0.
  bench_judge: { task: 'interact_bench_judge', phase: 'bench', kind: 'evaluation', calls: 1, maxInputBytes: 80000, maxImages: 0, maxOutputTokens: 4000, model: 'claude-sonnet-5-5' },
});
export const INTERACT_ROLE_IDS = Object.freeze(Object.keys(INTERACT_ROLES));
export const INTERACT_LIMITS = deepFreeze({ calls: Object.fromEntries(INTERACT_ROLE_IDS.map(r => [r, INTERACT_ROLES[r].calls])), refinements: 5, correctionRounds: 3,
  deadlines: { callMs: 300000, preparationMs: 600000, jobMs: 1200000 } });
// The job's call-kind map and usage-phase selection (C10): design roles use the preparation usage action, build roles the generation one.
export const interactCallKind = role => interactRoleSpec(role).kind;
export const interactPhase = role => interactRoleSpec(role).phase;
function interactRoleSpec(role) {
  if (!Object.hasOwn(INTERACT_ROLES, role)) throw refuse('unknown_role', `No /interact role ${role}.`);
  return INTERACT_ROLES[role];
}

// ---- Fast build profiles (item 4; /explain's fast chain, explanation-fast-chain.js and explanation-models.js CHAIN_STEPS) ----
// build_author and build_repair on Gemini (google-low) or Fireworks gpt-oss-120b (fireworks-low), each falling back to the other; design and review roles stay on Opus.
// Provider, model id and credential NAME come from CHAIN_STEPS, endpoint and deadline from CHAIN_ENDPOINTS (google 12 s, fireworks 8 s: per PROVIDER, not per role); none is written here.
// Sampling as /explain: author temperature 0 + seed 7 on Fireworks only, Gemini gets neither; repair 0.3 on every provider. reasoning_effort low.
// max_tokens counts reasoning: three programs (main + two supports) at the contract's source + manifest bytes, ~3.4 characters a token (explanation-models.js), plus ~650 reasoning tokens at low.
const FAST_BUILD_TOKENS = Math.ceil(3 * (CONTRACT_LIMITS.sourceBytes + CONTRACT_LIMITS.manifestBytes) / 3.4) + 650;
const fastStep = (role, provider, repair, fallbacks) => {
  const { model, credentialRef } = CHAIN_STEPS[provider], settings = { reasoning_effort: 'low', ...(repair ? { temperature: REPAIR_TEMPERATURE } : provider === 'fireworks' ? { temperature: AUTHOR_TEMPERATURE, seed: AUTHOR_SEED } : {}) };
  return { role, task: INTERACT_ROLES[role].task, provider, model, adapter: 'openai-compatible', endpoint: CHAIN_ENDPOINTS[provider].url.replace(/\/chat\/completions$/, ''), credentialRef,
    maxOutputTokens: FAST_BUILD_TOKENS, maxInputBytes: INTERACT_ROLES[role].maxInputBytes, maxImages: 0, timeoutMs: CHAIN_ENDPOINTS[provider].deadlineMs, settings, pricingKey: { provider, model, tier: 'standard' },
    capabilities: { vision: false, structuredOutput: 'json_schema', oneOf: 'anyOf', settings: Object.keys(settings), stripBounds: provider === 'google', sanitize: true },
    servedModelAliases: [], servedMatch: 'snapshot', ...(fallbacks ? { fallbacks } : {}) }; // snapshot: the id plus -YYYYMMDD; a differing served id is added to servedModelAliases once seen
};
const fastProfile = primary => ({ version: 1, extends: 'opus-baseline', roles: Object.fromEntries(['build_author', 'build_repair'].map(role => [role,
  fastStep(role, primary, role === 'build_repair', [fastStep(role, primary === 'google' ? 'fireworks' : 'google', role === 'build_repair')])])) });

const ADAPTERS = ['anthropic', 'openai-compatible'];
// The all-Opus role config: the existing automatic-tool approach (one tool on auto), no thinking, effort or fallback setting of its own.
const opusRole = role => ({
  role, task: INTERACT_ROLES[role].task, provider: 'anthropic', model: INTERACT_ROLES[role].model ?? 'claude-opus-5-5', adapter: 'anthropic', credentialRef: 'ANTHROPIC_API_KEY',
  maxOutputTokens: INTERACT_ROLES[role].maxOutputTokens, maxInputBytes: INTERACT_ROLES[role].maxInputBytes, maxImages: INTERACT_ROLES[role].maxImages,
  // The bench judge runs at low effort like /explain's judge (scripts/explain-bench/judge.mjs: output_config effort low); the Anthropic adapter passes settings.effort through. No other role sets it.
  timeoutMs: 300000, settings: role === 'bench_judge' ? { effort: 'low' } : {}, pricingKey: { provider: 'anthropic', model: INTERACT_ROLES[role].model ?? 'claude-opus-5-5', tier: 'standard' },
  // imageTokens: the per-image reservation of requestSpendBound for Opus (learn-spend.js), so reservation and admission agree.
  capabilities: { vision: true, structuredOutput: 'tool_call', oneOf: 'native', cache: true, settings: role === 'bench_judge' ? ['effort'] : [], imageTokens: 4784 },
  // servedMatch 'snapshot': claude-opus-5-5-YYYYMMDD is the same model. servedModelAliases: other approved served ids, exact.
  servedModelAliases: [], servedMatch: 'snapshot',
});

// The server-owned registry. providers: the exact credential ENV NAME per provider (only names already read in this repo: ANTHROPIC_API_KEY and
// explain-celeris-dev.js's CELERIS_API_KEY; add a provider here when its adapter and key are verified, a key reader needs review
// (openai-key-install-effects.test.js)); a role of that provider must use it, and no other provider may borrow it. endpointAllowlist: https origins a
// candidate adapter may call. A profile is { version, extends?, roles } where roles override single roles of the profile it extends.
// Candidate profiles (Celeris, Cerebras-served, Gemini Flash) are added here once their adapter, exact model id, access and price are verified:
// none is guessed. The only non-Opus profiles are the fast build profiles above (google-low, fireworks-low).
export const INTERACT_REGISTRY = deepFreeze({
  defaultProfile: 'opus-baseline',
  providers: { anthropic: { credentialRef: 'ANTHROPIC_API_KEY' }, celeris: { credentialRef: 'CELERIS_API_KEY' }, google: { credentialRef: CHAIN_STEPS.google.credentialRef }, fireworks: { credentialRef: CHAIN_STEPS.fireworks.credentialRef } },
  endpointAllowlist: ['https://inference.celeris.ai', ...['google', 'fireworks'].map(p => new URL(CHAIN_ENDPOINTS[p].url).origin)],
  profiles: { 'opus-baseline': { version: 1, roles: Object.fromEntries(INTERACT_ROLE_IDS.map(role => [role, opusRole(role)])) }, 'google-low': fastProfile('google'), 'fireworks-low': fastProfile('fireworks'),
    // DEV-ONLY: opus-baseline's roles, but the build roles are answered by interact-scripted.js with no model call; refused unless scriptedBuildAllowed(env) (never in production).
    scripted: { version: 1, extends: 'opus-baseline', roles: {} } },
});

// BENCH ONLY (owner brief 2026-11-13 14:20, scripts/interact/bench-author.mjs): the build_author role of one candidate model, the fast profile's settings as they are today (reasoning low; Fireworks temperature 0, seed 7;
// Gemini neither) and Sonnet at effort low with no thinking. It is NOT in INTERACT_REGISTRY.profiles, so no profile id names it and no deploy can select it (deploy-clone.mjs refuses any profile the registry does not list).
export const BENCH_TIMEOUT_MS = 120000;
export const BENCH_MODELS = Object.freeze(['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'accounts/fireworks/models/gpt-oss-120b', 'claude-sonnet-5-5']);
export function benchRole(model) {
  if (!BENCH_MODELS.includes(model)) throw refuse('unknown_bench_model', `No bench model ${String(model).slice(0, 80)}; the bench runs ${BENCH_MODELS.join(', ')}.`);
  if (model === 'claude-sonnet-5-5') {
    const c = opusRole('build_author');
    return { ...c, model, timeoutMs: BENCH_TIMEOUT_MS, pricingKey: { ...c.pricingKey, model }, settings: { effort: 'low' }, capabilities: { ...c.capabilities, settings: ['effort'], vision: false }, maxImages: 0 };
  }
  const step = fastStep('build_author', model.startsWith('accounts/fireworks/') ? 'fireworks' : 'google', false);
  return { ...step, model, timeoutMs: BENCH_TIMEOUT_MS, pricingKey: { ...step.pricingKey, model } }; // the profile's own deadline (google 12 s, fireworks 8 s) is recorded per row, not enforced: a timeout says nothing about correctness
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const posInt = v => Number.isSafeInteger(v) && v > 0;
function checkRole(role, c, registry, nested = false) {
  const spec = INTERACT_ROLES[role], bad = message => refuse('invalid_profile', `Role ${role}: ${message}`);
  if (!c.provider || typeof c.provider !== 'string' || !c.model || typeof c.model !== 'string') throw bad('provider and model are required.');
  if (!ADAPTERS.includes(c.adapter)) throw bad(`adapter must be one of ${ADAPTERS.join(', ')}.`);
  if (typeof c.credentialRef !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(c.credentialRef)) throw bad('credentialRef must be an environment variable NAME.');
  for (const [name, p] of Object.entries(registry.providers || {})) {
    if (name === c.provider && c.credentialRef !== p.credentialRef) throw bad(`provider ${name} uses ${p.credentialRef}.`);
    if (name !== c.provider && c.credentialRef === p.credentialRef) throw refuse('credential_mismatch', `Role ${role}: ${c.credentialRef} belongs to ${name}, not ${c.provider}.`);
  }
  if (!posInt(c.maxOutputTokens) || !posInt(c.maxInputBytes) || !posInt(c.timeoutMs)) throw bad('maxOutputTokens, maxInputBytes and timeoutMs are positive integers.');
  if (c.timeoutMs > INTERACT_LIMITS.deadlines.callMs) throw bad(`timeoutMs is at most ${INTERACT_LIMITS.deadlines.callMs}.`);
  if (!Number.isSafeInteger(c.maxImages) || c.maxImages < 0 || c.maxImages > spec.maxImages) throw bad(`maxImages is 0 to ${spec.maxImages}.`);
  const caps = c.capabilities;
  if (!isObject(caps) || typeof caps.vision !== 'boolean' || ![null, 'tool_call', 'json_schema'].includes(caps.structuredOutput) || !['native', 'anyOf', 'none'].includes(caps.oneOf) || !Array.isArray(caps.settings)) throw bad('capabilities are { vision, structuredOutput, oneOf, settings }.');
  if (c.adapter === 'anthropic' && caps.structuredOutput !== 'tool_call') throw bad('the anthropic adapter returns structured output as one tool call.');
  if (c.adapter === 'openai-compatible' && caps.structuredOutput === 'tool_call') throw bad('the openai-compatible adapter returns structured output as JSON schema.');
  if (!isObject(c.settings) || Object.keys(c.settings).some(k => !caps.settings.includes(k))) throw bad('settings may only hold keys the capabilities list as supported; nothing is inherited from another provider.');
  const price = c.pricingKey;
  if (!isObject(price) || !price.provider || !price.model || !price.tier) throw bad('pricingKey is { provider, model, tier }.');
  if (!Array.isArray(c.servedModelAliases) || c.servedModelAliases.some(a => typeof a !== 'string') || !['exact', 'snapshot'].includes(c.servedMatch)) throw bad('servedModelAliases is a list of ids and servedMatch is exact or snapshot.');
  if (c.adapter === 'openai-compatible') {
    let origin = null; try { const url = new URL(c.endpoint); origin = url.protocol === 'https:' && !url.username && !url.password ? url.origin : null; } catch { /* not a URL */ }
    if (!origin || !(registry.endpointAllowlist || []).includes(origin)) throw refuse('endpoint_not_allowed', `Role ${role}: the endpoint is not an allowlisted https origin.`);
  } else if (c.endpoint !== undefined) throw bad('only the openai-compatible adapter has an endpoint.');
  if (c.fallbacks !== undefined) { // later steps of the same role, tried in order (callInteractRole); each is a full role config, none has fallbacks of its own
    if (nested || !Array.isArray(c.fallbacks)) throw bad('fallbacks is one list of role configs, not nested.');
    for (const step of c.fallbacks) checkRole(role, { ...step, role }, registry, true);
  }
}

// -> a frozen Profile { id, version, roles }. An unknown id is an error, never the default (a misspelled setting must not silently run Opus).
export function resolveInteractProfile(profileId, registry = INTERACT_REGISTRY, depth = 0) {
  if (typeof profileId !== 'string' || !Object.hasOwn(registry?.profiles ?? {}, profileId)) throw refuse('unknown_profile', `No /interact model profile ${String(profileId).slice(0, 60)}.`);
  const def = registry.profiles[profileId];
  if (depth > 2) throw refuse('invalid_profile', 'Profiles extend at most two levels.');
  const base = def.extends ? resolveInteractProfile(def.extends, registry, depth + 1).roles : {};
  for (const role of Object.keys(def.roles || {})) interactRoleSpec(role);
  // A role override replaces whole nested objects (settings, capabilities, pricingKey): a different provider inherits none of the old one's.
  const roles = Object.fromEntries(INTERACT_ROLE_IDS.map(role => {
    const config = { ...(def.roles?.[role] ? { ...base[role], ...def.roles[role], role, task: INTERACT_ROLES[role].task } : base[role] ?? def.roles?.[role]) };
    if (!config.provider) throw refuse('invalid_profile', `Profile ${profileId} has no ${role} role.`);
    checkRole(role, config, registry);
    return [role, config];
  }));
  return deepFreeze({ id: profileId, version: def.version, roles: structuredClone(roles) });
}
// The server setting INTERACT_MODEL_PROFILE, default opus-baseline.
export const interactProfileFor = (env, registry = INTERACT_REGISTRY) => resolveInteractProfile(env?.[INTERACT_PROFILE_SETTING] || env?.[INTERACT_BUILD_PROFILE_SETTING] || registry.defaultProfile, registry);
// Profile ID, version and hash are stored on each job and cannot change halfway through a run.
export const interactProfileHash = async profile => (await sha256Hex(canonical({ id: profile.id, version: profile.version, roles: profile.roles }))).slice(0, 16);

// ---- Prices and bounds (C08, C09) ----
// Worst case of one call in integer micro-USD, from the role's own pricingKey: (input bytes counted as tokens + images) at the cache-write
// price when the role caches, plus max output at the output price. null when ANY needed rate is missing: unknown, never zero.
export function roleBoundMicros(config) {
  const p = config.pricingKey, rate = category => rateOf(p.provider, p.model, category, p.tier);
  const input = rate(config.capabilities.cache ? 'cache_write_5m' : 'input'), output = rate('output');
  const imageTokens = config.maxImages ? config.capabilities.imageTokens : 0;
  if (!input || !output || imageTokens == null) return null;
  return Math.ceil((config.maxInputBytes + config.maxImages * imageTokens) * input.usd + config.maxOutputTokens * output.usd);
}
// Preparation (design roles) and generation (build roles) reservations at the profile's call ceilings. A phase with any unpriced role is
// null and names the roles; it is never a smaller number.
export function interactReservation(profile) {
  const perRole = Object.fromEntries(INTERACT_ROLE_IDS.filter(role => INTERACT_ROLES[role].phase !== 'bench').map(role => [role, { calls: INTERACT_ROLES[role].calls, boundMicros: roleBoundMicros(profile.roles[role]) }]));
  const phase = name => { const roles = INTERACT_ROLE_IDS.filter(r => INTERACT_ROLES[r].phase === name); return roles.some(r => perRole[r].boundMicros == null) ? null : roles.reduce((t, r) => t + perRole[r].calls * perRole[r].boundMicros, 0); };
  return { version: INTERACT_POLICY_VERSION, profile: { id: profile.id, version: profile.version }, preparationMicros: phase('preparation'), generationMicros: phase('generation'),
    unknownRoles: Object.keys(perRole).filter(r => perRole[r].boundMicros == null), perRole };
}
// Actual cost in micro-USD from normalized usage (cache read and write as the adapter supplied them), or null when usage or any rate is unknown.
export function interactCostMicros(config, usage) {
  if (!usage?.quantities) return null;
  const p = config.pricingKey;
  return priceUsage({ provider: p.provider, model: p.model, tier: p.tier, quantities: usage.quantities })?.micros ?? null;
}

// ---- Served model (C07) ----
// Depends on the role: the exact requested id, an approved alias, or (servedMatch 'snapshot') the requested id plus a -YYYYMMDD date.
// A missing id stays unknown (verified: null), never assumed; an explicit mismatch fails.
export function verifyServed(config, servedModel) {
  const requested = config.model;
  if (servedModel == null) return { model: null, verified: null, approvedAlias: false };
  if (servedModel === requested) return { model: servedModel, verified: true, approvedAlias: false };
  if (config.servedModelAliases.includes(servedModel)) return { model: servedModel, verified: true, approvedAlias: true };
  if (config.servedMatch === 'snapshot' && servedModel.startsWith(`${requested}-`) && /^\d{8}$/.test(servedModel.slice(requested.length + 1))) return { model: servedModel, verified: true, approvedAlias: false };
  throw new InteractModelError('model_substituted', `${config.role} was answered by ${servedModel}, not ${requested}.`, { sent: true, requested, served: servedModel });
}

// ---- Preflight (C01) ----
// Images and structured output the role cannot supply fail explicitly, before any call: captures are never dropped, a schema never weakened.
export function interactPreflight(config, { images = 0, schema } = {}) {
  const caps = config.capabilities;
  if (images > 0 && !caps.vision) throw refuse('capability_vision', `${config.provider} ${config.model} cannot take images for ${config.role}.`);
  if (images > config.maxImages) throw refuse('images', `${config.role} sends at most ${config.maxImages} images.`, { images });
  if (!caps.structuredOutput) throw refuse('capability_structured_output', `${config.provider} ${config.model} cannot return structured output for ${config.role}.`);
  if (usesOneOf(schema) && caps.oneOf === 'none') throw refuse('capability_schema', `${config.provider} ${config.model} cannot take a oneOf schema for ${config.role}.`);
}
const credentialPresent = (ctx, config) => !!ctx.env?.[config.credentialRef] || (config.provider === 'anthropic' && ctx.env?.SUBSCRIPTION_ONLY === 'true');
const bytes = text => new TextEncoder().encode(text).length;
const FORBIDDEN_ARGS = ['model', 'provider', 'url', 'endpoint', 'baseUrl', 'credential', 'credentialRef', 'apiKey', 'profile', 'adapter'];

// One bounded role call. ctx: { env, profile, adapters, fixture?, admit?, settle?, log?, clock?, signal? }.
//   admit({ role, config, boundMicros, images, phase }) runs before anything is sent; if it throws, nothing was sent (a denied call is not a sent call).
//   settle({ role, status, sent, costMicros, requested, served, usage, stopReason, error, timing }) runs exactly once: status is settled | invalid_output |
//   failed | refused | unknown. An UNKNOWN outcome (timeout, abort, transport failure after sending) is never resent here and carries costMicros null, not 0.
// -> { output, requested, served, usage, costMicros, timing, stopReason }.
// Fallback (item 4, as /explain's chain): a role with `fallbacks` runs its own step, and on a provider failure (HTTP 429 or 5xx, provider unavailable, a timeout) the SAME request on the next step.
// A step whose credential is unset is skipped; no step with a credential is refused before any call. Each step is a whole bounded call (admitted, settled), so a timed-out step keeps its reservation.
// INTERACT_FALLBACK=off runs the role's own step only and its failure stands (a fallback is a failure in a benchmark). { step } starts at that index (a correction that failed twice moves on).
// -> the call result plus { step, fallbackFired (the answering step is not the role's first), attempts }; a thrown error carries { step, attempts }.
const providerFailure = e => e instanceof InteractModelError && ((e.code === 'http_error' && (e.providerStatus === 429 || e.providerStatus >= 500)) || e.code === 'provider_unavailable' || (e.code === 'unknown_outcome' && e.cause === 'timeout'));
export async function callInteractRole(ctx, role, args = {}, { step: from = 0 } = {}) {
  interactRoleSpec(role);
  if (!interactFlowEnabled(ctx.env) && !ctx.fixture) throw refuse('flow_disabled', 'The /interact scene-plan flow is off.');
  for (const key of FORBIDDEN_ARGS) if (key in args) throw refuse('request_override', `A call cannot choose its ${key}; the server profile does.`);
  const first = ctx.profile?.roles?.[role];
  if (!first) throw refuse('no_profile', 'No resolved /interact profile for this call.');
  const chain = [first, ...(first.fallbacks ?? [])].map((config, index) => ({ config, index })), off = ctx.env?.[INTERACT_FALLBACK_SETTING] === 'off';
  const wanted = off ? chain.slice(0, 1) : chain.slice(from), usable = ctx.fixture ? wanted : wanted.filter(({ config }) => credentialPresent(ctx, config));
  const attempts = [];
  for (const [i, { config, index }] of (usable.length ? usable : wanted.slice(0, 1)).entries()) {
    try { return { ...await callStep(ctx, role, args, config, index), step: index, fallbackFired: index > 0, attempts: [...attempts, { provider: config.provider, model: config.model, outcome: 'answered' }] }; }
    catch (error) {
      attempts.push({ provider: config.provider, model: config.model, outcome: error.code });
      if (i === usable.length - 1 || !providerFailure(error)) throw Object.assign(error, { step: index, attempts });
    }
  }
}
// step: the index of this step in the role's chain (0 = the role's own). Each step has its own call ceiling (the job's admit hook counts it per step), so a fallback step is a whole call + correction.
async function callStep(ctx, role, args, config, step = 0) {
  const spec = interactRoleSpec(role), clock = ctx.clock ?? Date.now;
  const { system, schema, input, images = [], name, description } = args;
  interactPreflight(config, { images: images.length, schema });
  if (bytes(String(system ?? '')) + bytes(typeof input === 'string' ? input : JSON.stringify(input ?? '')) > config.maxInputBytes) throw refuse('input_too_large', `This ${role} request is larger than its ${config.maxInputBytes}-byte limit.`);
  if (!ctx.fixture && !credentialPresent(ctx, config)) throw refuse('credential_missing', `${config.credentialRef} is not set; nothing was sent.`);
  const adapter = ctx.adapters?.[config.adapter];
  if (!adapter) throw refuse('adapter_unavailable', `No ${config.adapter} adapter is wired for ${role}.`);
  // Only the anthropic adapter's transport is admitted by the job's spend ledger itself; a candidate transport needs the job's admit hook.
  if (!ctx.fixture && config.adapter !== 'anthropic' && typeof ctx.admit !== 'function') throw refuse('no_admission', `${config.adapter} calls need an admission hook; nothing was sent.`);
  const requested = { role, task: spec.task, provider: config.provider, model: config.model, profileId: ctx.profile.id, profileVersion: ctx.profile.version };
  const boundMicros = roleBoundMicros(config);
  let settled = false;
  const settle = async fields => { if (settled) return; settled = true; const line = { event: 'interact_model', requested, ...fields, error: fields.error?.code ?? null };
    try { ctx.log?.(line); } catch { /* a log line is never worth a failed call */ }
    await ctx.settle?.({ role, step, requested, ...fields }); };
  try { await ctx.admit?.({ role, step, config, boundMicros, images: images.length, phase: spec.phase }); }
  catch (error) { await settle({ status: 'refused', sent: false, costMicros: 0, error }); throw Object.assign(error, { sent: false }); }

  const controller = new AbortController(), startedAt = clock();
  const onAbort = () => controller.abort(ctx.signal.reason);
  if (ctx.signal?.aborted) controller.abort(ctx.signal.reason); else ctx.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('timeout')), config.timeoutMs);
  const timing = fields => ({ startedAt, endedAt: clock(), ms: clock() - startedAt, ...fields });
  try {
    let result;
    try { result = await adapter.call({ config, system, schema, input, images, signal: controller.signal, name, description,
      ...(config.capabilities.stripBounds ? { wireSchema: withoutBounds(schema) } : {}), ...(config.capabilities.sanitize && typeof args.sanitize === 'function' ? { sanitize: args.sanitize } : {}) }); }
    catch (error) {
      const known = error instanceof InteractModelError;
      if (known && error.sent === false) { await settle({ status: 'refused', sent: false, costMicros: 0, error, timing: timing() }); throw error; }
      if (known && (error.refusedByProvider || error.code === 'spend_refused')) { await settle({ status: 'refused', sent: error.code !== 'spend_refused', costMicros: 0, error, timing: timing() }); throw error; }
      if (known && error.usage?.quantities !== undefined) { // the provider answered but the answer is unusable: its usage is still billed
        const costMicros = interactCostMicros(config, error.usage);
        await settle({ status: 'invalid_output', sent: true, costMicros, usage: error.usage, served: { provider: config.provider, model: error.served?.model ?? null }, stopReason: error.stopRaw ?? null, error, timing: timing() });
        throw Object.assign(error, { costMicros });
      }
      if (known) { await settle({ status: 'failed', sent: true, costMicros: null, error, timing: timing() }); throw Object.assign(error, { costMicros: null }); }
      const cause = controller.signal.aborted ? (ctx.signal?.aborted ? 'cancelled' : 'timeout') : 'transport';
      const unknown = new InteractModelError('unknown_outcome', `The ${role} call ended without a known outcome (${cause}). It is not resent and its cost is unknown.`, { sent: true, resend: false, costMicros: null, cause });
      await settle({ status: 'unknown', sent: true, costMicros: null, error: unknown, timing: timing() });
      throw unknown;
    }
    const costMicros = interactCostMicros(config, result.usage);
    let served;
    try { served = { provider: result.served?.provider ?? config.provider, ...verifyServed(config, result.served?.model ?? null) }; }
    catch (error) { await settle({ status: 'settled', sent: true, costMicros: null, usage: result.usage, served: result.served, stopReason: result.stopReason, error, timing: timing() }); throw Object.assign(error, { usage: result.usage, costMicros: null }); }
    const done = { output: result.output, requested, served, usage: result.usage, costMicros, priceKnown: costMicros != null, timing: timing(result.timing), stopReason: result.stopReason };
    await settle({ status: 'settled', sent: true, costMicros, usage: result.usage, served, stopReason: result.stopReason, timing: done.timing });
    return done;
  } finally { clearTimeout(timer); ctx.signal?.removeEventListener('abort', onAbort); }
}
