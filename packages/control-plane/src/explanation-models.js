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
// shortcut: only the plan transport is an admitted adapter in E0/E1; a profile naming another adapter fails before any spend. Add one here
// when its adapter, exact model id, access and price are verified (explain.md EXP-11-C03).
export const EXPLANATION_ADAPTERS = Object.freeze(['plan']);
export const EXPLANATION_CANDIDATES = Object.freeze({
  opus: { status: 'supported', via: 'plan', note: 'the repository MODEL through ask.js planModel (LEARN_TASKS.artifact)' },
  celeris: { status: 'dev_route_only', via: 'explain-celeris-dev.js celerisExplainRoute', note: 'EXPLAIN_CELERIS_DEV on a dev or test Worker; not a profile adapter yet' },
  cerebras: { status: 'unsupported', via: null, note: 'a Cerebras-served model needs a verified adapter and exact served model id; none is registered' },
  'gemini-flash': { status: 'unsupported', via: null, note: 'a Gemini adapter and exact model id are not verified; none is registered' },
});

const deepFreeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(deepFreeze); } return v; };
const refuse = (code, message) => new ExplanationProfileError(code, message);
const stable = v => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v));

// The existing default transport, read from LEARN_TASKS.artifact so the pin and the request can never drift apart.
const planRole = role => ({ role, task: 'artifact', provider: 'plan', model: LEARN_TASKS.artifact.model, adapter: 'plan', credentialRef: 'ANTHROPIC_API_KEY',
  maxOutputTokens: LEARN_TASKS.artifact.maxTokens, toolChoice: LEARN_TASKS.artifact.toolChoice, settings: {} });

// profiles: { version, extends?, roles } where roles override single roles; a profile without a repair role repairs with its author's config.
export const EXPLANATION_REGISTRY = deepFreeze({
  defaultProfile: 'plan-default',
  profiles: { 'plan-default': { version: 1, roles: { author: planRole('author') } } },
});

const posInt = v => Number.isSafeInteger(v) && v > 0;
function checkRole(role, c) {
  const bad = message => refuse('invalid_profile', `Role ${role}: ${message}`);
  if (!c.provider || !c.model || typeof c.provider !== 'string' || typeof c.model !== 'string') throw bad('provider and model are required.');
  if (!EXPLANATION_ADAPTERS.includes(c.adapter)) throw refuse('adapter_unsupported', `Role ${role}: adapter ${String(c.adapter).slice(0, 40)} is not wired, so nothing was sent. Supported: ${EXPLANATION_ADAPTERS.join(', ')}.`);
  if (typeof c.credentialRef !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(c.credentialRef)) throw bad('credentialRef must be an environment variable NAME.');
  if (!posInt(c.maxOutputTokens)) throw bad('maxOutputTokens is a positive integer.');
  if (c.endpoint !== undefined || c.url !== undefined) throw bad('the plan adapter has no endpoint; a URL is never configurable here.');
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
  const repair = def.roles?.repair ? { ...(base.repair ?? {}), ...def.roles.repair, role: 'repair' } : { ...(base.repair ?? author), role: 'repair' };
  const roles = { author, repair };
  for (const role of EXPLANATION_ROLES) checkRole(role, roles[role]);
  return deepFreeze({ id: profileId, version: def.version, roles: structuredClone(roles) });
}
export const explanationProfileFor = (env, registry = EXPLANATION_REGISTRY) => resolveExplanationProfile(env?.[EXPLANATION_PROFILE_SETTING] || registry.defaultProfile, registry);
// Id, version and hash are what a quote, an accepted request and a saved job bind, so a changed default cannot be adopted by an old request.
export const explanationProfileHash = async profile => (await sha256Hex(stable({ id: profile.id, version: profile.version, roles: profile.roles }))).slice(0, 16);
export const explanationProfileBinding = async profile => ({ id: profile.id, version: profile.version, hash: await explanationProfileHash(profile) });
