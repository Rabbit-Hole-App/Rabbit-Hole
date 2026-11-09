// Written /explain model profile (EXP-11-C02, docs/features/explain.md "Swappable models"): a server-owned, versioned, immutable mapping from the
// written Explanation's LLM roles (author; repair, within the one existing repair ceiling) to provider, exact model, adapter, credential NAME and limits.
// resolveExplanationProfile(profileId, registry) -> a frozen profile used by learn-artifact.js prepareArtifactAuthorRequest / generateArtifact.
// The server setting EXPLANATION_MODEL_PROFILE picks one; unset or empty is the registry default. The default profile pins today's transport
// (LEARN_TASKS.artifact through the plan transport) so the request it builds is byte-identical to the one sent before profiles existed.
// Only the SERVER registry chooses a model; a request, prompt or tool result cannot. A leaf: no provider call is made here.
import { LEARN_TASKS } from './learn-models.js';
import { sha256Hex } from './learn-grade-jev.js';

export const EXPLANATION_POLICY_VERSION = 1;
export const EXPLANATION_PROFILE_SETTING = 'EXPLANATION_MODEL_PROFILE';
export const EXPLANATION_ROLES = Object.freeze(['author', 'repair']);
export class ExplanationProfileError extends Error {
  constructor(code, message) { super(message); this.name = 'ExplanationProfileError'; this.code = code; }
}

// Adapters that exist today. Candidate providers (E7 lane) are listed with their honest status; none is guessed into a profile.
// A profile naming another adapter fails before any spend. 'fast-chain' is explanation-fast-chain.js (owner 2026-11-08): one OpenAI-compatible json_schema
// author call per step, the profile's provider first, then its listed fallbacks in order, never the plan model. Endpoints and deadlines are fixed
// in that module per provider; a profile names only provider, model and credential.
export const EXPLANATION_ADAPTERS = Object.freeze(['plan', 'fast-chain']);
export const CHAIN_PROVIDERS = Object.freeze(['cerebras', 'fireworks', 'google']);
export const EXPLANATION_CANDIDATES = Object.freeze({
  opus: { status: 'supported', via: 'plan', note: 'the repository MODEL through ask.js planModel (LEARN_TASKS.artifact)' },
  celeris: { status: 'dev_route_only', via: 'explain-celeris-dev.js celerisExplainRoute', note: 'EXPLAIN_CELERIS_DEV on a dev or test Worker; not a profile adapter yet' },
  cerebras: { status: 'supported', via: 'fast-chain', note: 'gpt-oss-120b on Cerebras or Fireworks: profiles fireworks-low|medium|high and cerebras-low|medium|high (explanation-fast-chain.js)' },
  'gemini-flash': { status: 'supported', via: 'fast-chain', note: 'gemini-3.5-flash-lite, the last fallback step of the fireworks-* and cerebras-* profiles (OpenAI-compatible endpoint)' },
});

const deepFreeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(deepFreeze); } return v; };
const refuse = (code, message) => new ExplanationProfileError(code, message);
const stable = v => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v));

// The existing default transport, read from LEARN_TASKS.artifact so the pin and the request can never drift apart.
const planRole = role => ({ role, task: 'artifact', provider: 'plan', model: LEARN_TASKS.artifact.model, adapter: 'plan', credentialRef: 'ANTHROPIC_API_KEY',
  maxOutputTokens: LEARN_TASKS.artifact.maxTokens, toolChoice: LEARN_TASKS.artifact.toolChoice, settings: {} });

export const CEREBRAS_MODEL = 'gpt-oss-120b';
export const REASONING_EFFORTS = Object.freeze(['low', 'medium', 'high']);
// One step per provider; model ids as the coordinator verified them in each account's models list (2026-11-08). Every step gets the profile's effort:
// gpt-oss takes reasoning_effort low|medium|high on Cerebras (https://inference-docs.cerebras.ai/models/openai-oss) and on Fireworks, which documents
// "Accepts only 'low', 'medium', or 'high'" for Harmony models (GPT-OSS 120B/20B) (https://docs.fireworks.ai/api-reference/post-chatcompletions); Gemini's
// OpenAI-compatible endpoint maps low|medium|high to its thinking levels (https://aistudio.google.com/docs/openai). All read 2026-11-08.
export const CHAIN_STEPS = Object.freeze({
  fireworks: { provider: 'fireworks', model: 'accounts/fireworks/models/gpt-oss-120b', credentialRef: 'FIREWORKS_API_KEY' },
  cerebras: { provider: 'cerebras', model: CEREBRAS_MODEL, credentialRef: 'CEREBRAS_API_KEY' },
  google: { provider: 'google', model: 'gemini-3.5-flash-lite', credentialRef: 'GEMINI_API_KEY' },
});
// Owner order 2026-11-08 (revised the same day): a fireworks-* profile is Fireworks gpt-oss-120b, then Gemini; Cerebras is never a fallback step. A
// cerebras-* profile stays selectable on its own (Cerebras, then Fireworks, then Gemini). Production uses fireworks-low. Never the plan model.
// Output cap per effort (owner review 2026-11-08: output tokens are latency, so the model must not run long). Measured 2026-11-08 on Fireworks gpt-oss-120b
// (C:/s/spec/benchmarks/explain-gpt-oss-2026-11-08): the largest delivered card is 2,395 JSON characters (title, body, questions, terms; about 700 tokens at
// ~3.4 characters a token), and output including reasoning averaged 643 tokens a call at low (56,604 over 88 calls) and 1,356 at medium (44,740 over 33).
// Low 3,000 is about twice the largest card plus low's mean reasoning; medium 5,000 the same with medium's; high keeps 8,000 (only 1 of 40 high calls
// finished inside the 8 s deadline, so there is no measurement to tighten it). Reasoning counts in the cap: a truncated answer is a max_tokens failure.
// Re-derived for three visuals (owner 2026-11-08): the prose budget is unchanged, and the largest third visual the guidance asks for, a 4-column comparison
// of 5 short items each, is about 900 JSON characters (~265 tokens), so the largest card grows to ~3,300 characters (~970 tokens). Low: 2 x 970 + 643 =
// 2,583, inside 3,000; medium: 2 x 970 + 1,356 = 3,296, inside 5,000. The caps stay; unmeasured with a real three-visual card.
export const CHAIN_MAX_TOKENS = Object.freeze({ low: 3000, medium: 5000, high: 8000 });
const chainRole = (primary, effort) => ({ role: 'author', task: 'artifact', ...CHAIN_STEPS[primary], adapter: 'fast-chain', maxOutputTokens: CHAIN_MAX_TOKENS[effort], settings: { reasoning_effort: effort },
  fallbacks: (primary === 'fireworks' ? [CHAIN_STEPS.google] : primary === 'google' ? [CHAIN_STEPS.fireworks] : [CHAIN_STEPS.fireworks, CHAIN_STEPS.google]).map(step => ({ ...step })) });
// The steps of a fast-chain role, primary first.
export const chainSteps = c => [{ provider: c.provider, model: c.model, credentialRef: c.credentialRef }, ...(c.fallbacks || [])];

// profiles: { version, extends?, roles } where roles override single roles; a profile without a repair role repairs with its author's config.
export const EXPLANATION_REGISTRY = deepFreeze({
  defaultProfile: 'plan-default',
  profiles: {
    'plan-default': { version: 1, roles: { author: planRole('author') } },
    ...Object.fromEntries(['fireworks', 'cerebras', 'google'].flatMap(primary => REASONING_EFFORTS.map(effort => [`${primary}-${effort}`, { version: 1, roles: { author: chainRole(primary, effort) } }]))),
    // BENCH ONLY (owner 2026-11-09, arm D): the google-low author role with Gemini 3.5 Flash instead of Flash-Lite. Never in the candidate or the production config.
    'google-flash-detailed': { version: 1, roles: { author: { ...chainRole('google', 'low'), model: 'gemini-3.5-flash' } } },
  },
});

const posInt = v => Number.isSafeInteger(v) && v > 0;
function checkRole(role, c) {
  const bad = message => refuse('invalid_profile', `Role ${role}: ${message}`);
  if (!c.provider || !c.model || typeof c.provider !== 'string' || typeof c.model !== 'string') throw bad('provider and model are required.');
  if (!EXPLANATION_ADAPTERS.includes(c.adapter)) throw refuse('adapter_unsupported', `Role ${role}: adapter ${String(c.adapter).slice(0, 40)} is not wired, so nothing was sent. Supported: ${EXPLANATION_ADAPTERS.join(', ')}.`);
  if (typeof c.credentialRef !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(c.credentialRef)) throw bad('credentialRef must be an environment variable NAME.');
  if (!posInt(c.maxOutputTokens)) throw bad('maxOutputTokens is a positive integer.');
  if (c.endpoint !== undefined || c.url !== undefined) throw bad('an endpoint is fixed in its adapter; a URL is never configurable here.');
  if (c.adapter !== 'fast-chain') return;
  if (!REASONING_EFFORTS.includes(c.settings?.reasoning_effort)) throw bad(`settings.reasoning_effort is one of ${REASONING_EFFORTS.join(', ')}.`);
  if (c.fallbacks !== undefined && !Array.isArray(c.fallbacks)) throw bad('fallbacks is a list of steps.');
  for (const step of chainSteps(c)) {
    if (!CHAIN_PROVIDERS.includes(step.provider) || typeof step.model !== 'string' || !step.model) throw bad(`a step needs one of ${CHAIN_PROVIDERS.join(', ')} and a model.`);
    if (typeof step.credentialRef !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(step.credentialRef)) throw bad('a step credentialRef must be an environment variable NAME.');
    if (Object.keys(step).some(k => !['provider', 'model', 'credentialRef'].includes(k))) throw bad('a step names only provider, model and credentialRef; its endpoint is fixed in code.');
  }
}

// -> a frozen profile { id, version, roles: { author, repair } }. An unknown id is an error, never the default (a misspelled setting must not silently
// run another model).
export function resolveExplanationProfile(profileId, registry = EXPLANATION_REGISTRY, depth = 0) {
  if (typeof profileId !== 'string' || !Object.hasOwn(registry?.profiles ?? {}, profileId)) throw refuse('unknown_profile', `No written /explain model profile ${String(profileId).slice(0, 60)}.`);
  if (depth > 2) throw refuse('invalid_profile', 'Profiles extend at most two levels.');
  const def = registry.profiles[profileId];
  const base = def.extends ? resolveExplanationProfile(def.extends, registry, depth + 1).roles : {};
  for (const role of Object.keys(def.roles || {})) if (!EXPLANATION_ROLES.includes(role)) throw refuse('unknown_role', `No written /explain role ${role}.`);
  const author = { ...(base.author ?? {}), ...(def.roles?.author ?? {}), role: 'author' };
  // A repair role follows the author unless this profile, or one it extends, names a repair role itself.
  const explicitRepair = d => !!d && (!!d.roles?.repair || explicitRepair(d.extends ? registry.profiles[d.extends] : null));
  const repair = def.roles?.repair ? { ...(base.repair ?? {}), ...def.roles.repair, role: 'repair' } : { ...(explicitRepair(def) ? base.repair : author), role: 'repair' };
  const roles = { author, repair };
  for (const role of EXPLANATION_ROLES) checkRole(role, roles[role]);
  // The chain runs its own repair on each step, so its repair role is its author role.
  if ([author.adapter, repair.adapter].includes('fast-chain') && stable({ ...repair, role: 'author' }) !== stable(author)) throw refuse('invalid_profile', 'A fast-chain profile repairs with its author steps; it cannot pin another repair role.');
  return deepFreeze({ id: profileId, version: def.version, roles: structuredClone(roles) });
}
// A fast-chain step whose credential is not set is skipped when the card runs; a chain with no usable step is refused here, before any spend (the plan
// transport keeps its own not-configured reply).
export function explanationProfileFor(env, registry = EXPLANATION_REGISTRY) {
  const profile = resolveExplanationProfile(env?.[EXPLANATION_PROFILE_SETTING] || registry.defaultProfile, registry);
  const author = profile.roles.author;
  if (author.adapter === 'fast-chain' && !chainSteps(author).some(step => env?.[step.credentialRef])) {
    throw Object.assign(refuse('credential_missing', 'Explanations are not set up on this server yet, so nothing was sent or charged.'), { credentialRefs: chainSteps(author).map(step => step.credentialRef) });
  }
  return profile;
}
// Id, version and hash are what a quote, an accepted request and a saved job bind, so a changed default cannot be adopted by an old request.
export const explanationProfileHash = async profile => (await sha256Hex(stable({ id: profile.id, version: profile.version, roles: profile.roles }))).slice(0, 16);
export const explanationProfileBinding = async profile => ({ id: profile.id, version: profile.version, hash: await explanationProfileHash(profile) });
