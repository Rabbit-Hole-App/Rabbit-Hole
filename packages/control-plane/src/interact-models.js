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

export { InteractModelError, interactAdapters } from './interact-model-adapters.js';

export const INTERACT_POLICY_VERSION = 1;
export const INTERACT_PROFILE_SETTING = 'INTERACT_MODEL_PROFILE'; // the server setting; unset or empty means the registry default
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

const ADAPTERS = ['anthropic', 'openai-compatible'];
// The all-Opus role config: the existing automatic-tool approach (one tool on auto), no thinking, effort or fallback setting of its own.
const opusRole = role => ({
  role, task: INTERACT_ROLES[role].task, provider: 'anthropic', model: INTERACT_ROLES[role].model ?? 'claude-opus-5-5', adapter: 'anthropic', credentialRef: 'ANTHROPIC_API_KEY',
  maxOutputTokens: INTERACT_ROLES[role].maxOutputTokens, maxInputBytes: INTERACT_ROLES[role].maxInputBytes, maxImages: INTERACT_ROLES[role].maxImages,
  timeoutMs: 300000, settings: {}, pricingKey: { provider: 'anthropic', model: INTERACT_ROLES[role].model ?? 'claude-opus-5-5', tier: 'standard' },
  // imageTokens: the per-image reservation of requestSpendBound for Opus (learn-spend.js), so reservation and admission agree.
  capabilities: { vision: true, structuredOutput: 'tool_call', oneOf: 'native', cache: true, settings: [], imageTokens: 4784 },
  // servedMatch 'snapshot': claude-opus-5-5-YYYYMMDD is the same model. servedModelAliases: other approved served ids, exact.
  servedModelAliases: [], servedMatch: 'snapshot',
});

// The server-owned registry. providers: the exact credential ENV NAME per provider (only names already read in this repo: ANTHROPIC_API_KEY and
// explain-celeris-dev.js's CELERIS_API_KEY; add a provider here when its adapter and key are verified, a key reader needs review
// (openai-key-install-effects.test.js)); a role of that provider must use it, and no other provider may borrow it. endpointAllowlist: https origins a
// candidate adapter may call. A profile is { version, extends?, roles } where roles override single roles of the profile it extends.
// Candidate profiles (Celeris, Cerebras-served, Gemini Flash) are added here once their adapter, exact model id, access and price are verified:
// none is guessed. ponytail: no non-Opus profile is registered in I0.
export const INTERACT_REGISTRY = deepFreeze({
  defaultProfile: 'opus-baseline',
  providers: { anthropic: { credentialRef: 'ANTHROPIC_API_KEY' }, celeris: { credentialRef: 'CELERIS_API_KEY' } },
  endpointAllowlist: ['https://inference.celeris.ai'],
  profiles: { 'opus-baseline': { version: 1, roles: Object.fromEntries(INTERACT_ROLE_IDS.map(role => [role, opusRole(role)])) } },
});

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const posInt = v => Number.isSafeInteger(v) && v > 0;
function checkRole(role, c, registry) {
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
export const interactProfileFor = (env, registry = INTERACT_REGISTRY) => resolveInteractProfile(env?.[INTERACT_PROFILE_SETTING] || registry.defaultProfile, registry);
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
export async function callInteractRole(ctx, role, args = {}) {
  const spec = interactRoleSpec(role), clock = ctx.clock ?? Date.now;
  if (!interactFlowEnabled(ctx.env) && !ctx.fixture) throw refuse('flow_disabled', 'The /interact scene-plan flow is off.');
  for (const key of FORBIDDEN_ARGS) if (key in args) throw refuse('request_override', `A call cannot choose its ${key}; the server profile does.`);
  const config = ctx.profile?.roles?.[role];
  if (!config) throw refuse('no_profile', 'No resolved /interact profile for this call.');
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
    await ctx.settle?.({ role, requested, ...fields }); };
  try { await ctx.admit?.({ role, config, boundMicros, images: images.length, phase: spec.phase }); }
  catch (error) { await settle({ status: 'refused', sent: false, costMicros: 0, error }); throw Object.assign(error, { sent: false }); }

  const controller = new AbortController(), startedAt = clock();
  const onAbort = () => controller.abort(ctx.signal.reason);
  if (ctx.signal?.aborted) controller.abort(ctx.signal.reason); else ctx.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('timeout')), config.timeoutMs);
  const timing = fields => ({ startedAt, endedAt: clock(), ms: clock() - startedAt, ...fields });
  try {
    let result;
    try { result = await adapter.call({ config, system, schema, input, images, signal: controller.signal, name, description }); }
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
