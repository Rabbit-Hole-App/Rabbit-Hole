// Motion's server-side rules that are not the schema's (owner decisions 2026-10-23). The FIELDS (duration 5 to 60 in fives, the nine
// aspect ratios, audio) are declared once, in web/src/generation-confirmation-schema.js; this file holds what only the server may decide:
//   motionQuoteInputs      the ONE function from a proposal's settings to everything that can change its price or its readiness.
//   motionReadiness        whether a combination may be GENERATED now: an allowlist of MEASURED combinations (ratio, duration bucket,
//                          scene-complexity classes) with a policy version, for one renderer configuration. Default: empty, nothing ready.
//   motionQuote            the versioned price for those inputs (measured buckets; the flat MOTION_ESTIMATE_USD when none is configured).
//   motionBinding          what is SIGNED into a proposal (input.binding): the inputs, the price version and quote, the policy version
//                          and the renderer configuration the card was made for.
//   motionGenerationCheck  what Generate (and Retry) asks, and motionExecutionCheck what runs again immediately before paid work.
// Every option stays visible and selectable. Readiness is a conservative gate, not a promise: a ready combination can still fail, and
// nothing here or in the copy may say it will succeed. Pure: no I/O.
import { settingsOf, validateSettings } from '../../web/src/generation-confirmation-schema.js';
import { DURATION, durationDecision } from '../../learn-render/motion/duration.js';
import { COMPLEXITY_CLASSES } from '../../learn-render/motion/composition-limits.js';
import { MOTION_DEFAULT_RATIO, MOTION_RATIOS, MOTION_STAGE_SIZES } from '../../learn-render/motion/stage-sizes.js';

export { MOTION_DEFAULT_RATIO, MOTION_RATIOS, MOTION_STAGE_SIZES };
export const MOTION_NOT_READY = 'motion_not_ready';
export const MOTION_SETTINGS_INVALID = 'motion_settings_invalid';
export const MOTION_QUOTE_STALE = 'motion_quote_stale';
export const MOTION_RENDERER_CHANGED = 'motion_renderer_changed';
export const FLAT_PRICE_VERSION = 'flat';

// Everything that affects what a Motion video costs or whether it may run, from its settings; a missing ratio is the original 16:9.
export const motionQuoteInputs = settings => ({ duration_seconds: settings?.duration_seconds, aspect_ratio: settings?.aspect_ratio ?? MOTION_DEFAULT_RATIO });

const parse = text => { try { return JSON.parse(String(text ?? '').trim() || 'null'); } catch { return null; } };
const credits = usd => (Number.isFinite(usd) && usd > 0 ? Math.ceil(Number((usd * 100).toFixed(6))) : null);
const spanOk = r => r && Number.isInteger(r.min_seconds) && Number.isInteger(r.max_seconds) && r.min_seconds <= r.max_seconds && [r.aspect_ratio].flat().length > 0 && [r.aspect_ratio].flat().every(x => MOTION_RATIOS.includes(x));
const inBucket = (r, inputs) => [r.aspect_ratio].flat().includes(inputs.aspect_ratio) && inputs.duration_seconds >= r.min_seconds && inputs.duration_seconds <= r.max_seconds;

// The live renderer configuration id (MOTION_RENDERER_CONFIG, set with each renderer deploy): what the readiness policy was measured on.
export const liveRendererConfig = env => String(env?.MOTION_RENDERER_CONFIG ?? '').trim() || null;

// MOTION_READY_POLICY (a worker variable, default unset = nothing is ready):
//   {"version": "p1", "renderer_config": "r1", "entries": [{"aspect_ratio": "16:9" | ["1:1"], "min_seconds": 5, "max_seconds": 30, "complexity": ["simple", "standard"]}]}
// An entry is a measured combination: its ratios, its inclusive duration bucket and the scene-complexity classes the evidence covers.
// Malformed entries are ignored; a policy with no version, or measured on another renderer configuration than the live one, is empty.
export function readyPolicy(env) {
  const p = parse(env?.MOTION_READY_POLICY), live = liveRendererConfig(env);
  if (!p || typeof p !== 'object' || typeof p.version !== 'string' || !p.version || typeof p.renderer_config !== 'string' || !Array.isArray(p.entries)) return { version: null, renderer_config: live, entries: [] };
  const entries = p.entries.flatMap(r => (spanOk(r) && Array.isArray(r.complexity) && r.complexity.length && r.complexity.every(c => COMPLEXITY_CLASSES.includes(c))
    ? [{ ratios: [r.aspect_ratio].flat(), min: r.min_seconds, max: r.max_seconds, complexity: [...new Set(r.complexity)] }] : []));
  return { version: p.version, renderer_config: p.renderer_config, entries: live && p.renderer_config === live ? entries : [] };
}
// -> { ready: true, complexity: [classes], policy_version } or { ready: false, code, message, policy_version }. The message is the one
// line the card shows before confirmation; it promises nothing about the outcome.
export function motionReadiness(env, inputs) {
  const policy = readyPolicy(env), hit = policy.entries.filter(r => r.ratios.includes(inputs.aspect_ratio) && inputs.duration_seconds >= r.min && inputs.duration_seconds <= r.max);
  if (hit.length) return { ready: true, complexity: COMPLEXITY_CLASSES.filter(c => hit.some(r => r.complexity.includes(c))), policy_version: policy.version };
  return { ready: false, code: MOTION_NOT_READY, message: `A ${inputs.duration_seconds} second ${inputs.aspect_ratio} video is not ready to generate yet. Pick other settings or try again later.`, policy_version: policy.version };
}

// MOTION_PRICE_TABLE: {"version": "b1", "buckets": [{"aspect_ratio": [...], "min_seconds": 5, "max_seconds": 30, "estimate_usd": 1.2}]}, measured
// buckets. Unset: the flat MOTION_ESTIMATE_USD under the version "flat" (today's price). The hold (MOTION_JOB_RESERVATION_USD) is not priced here.
// -> { price_version, estimate_credits }; estimate_credits is null when no price is known.
export function motionQuote(env, inputs) {
  const t = parse(env?.MOTION_PRICE_TABLE);
  if (t && typeof t.version === 'string' && t.version && Array.isArray(t.buckets)) {
    const b = t.buckets.find(r => spanOk(r) && inBucket(r, inputs) && Number.isFinite(r.estimate_usd));
    return { price_version: t.version, estimate_credits: b ? credits(b.estimate_usd) : null };
  }
  return { price_version: FLAT_PRICE_VERSION, estimate_credits: credits(Number(String(env?.MOTION_ESTIMATE_USD ?? '').trim() || NaN)) };
}

// What a Motion proposal signs (input.binding): the settings' inputs, the quote and its version, the readiness policy version and the
// renderer configuration. Recomputed at Generate and compared.
export function motionBinding(env, settings) {
  const inputs = motionQuoteInputs(settings), quote = motionQuote(env, inputs);
  return { inputs, price_version: quote.price_version, estimate_credits: quote.estimate_credits, policy_version: readyPolicy(env).version, renderer_config: liveRendererConfig(env) };
}

// A proposal saved before the 5-second steps (for example 12 seconds) is still readable and still executable through this path: the
// schema refuses its duration, so it is judged by the renderer's own limits (a whole number of seconds, 5 to 60) and a known ratio.
export function legacyMotionSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  const { duration_seconds: d, aspect_ratio: r, audio, ...rest } = settings;
  return !Object.keys(rest).length && Number.isInteger(d) && d >= DURATION.min && d <= DURATION.max && (r === undefined || MOTION_RATIOS.includes(r)) && (audio === undefined || audio === false);
}

const creditsText = n => (n == null ? 'a price that is not available yet' : `About ${Number(n).toLocaleString('en-US')} credits`);
// Generate / Retry: the proposal (or, for a request with none, what its words ask for) against the schema, the compatibility path, the
// signed binding and the readiness policy. -> null to go on, or { error, code, quote? } to refuse before anything is consumed, reserved
// or sent. A stale quote answers with the UPDATED quote: the person confirms it explicitly, nothing is charged at a different amount.
export function motionGenerationCheck(env, input) {
  let inputs, bound = null;
  if (input.proposal) {
    const settings = input.proposal.settings;
    if (validateSettings('motion', settings).error && !legacyMotionSettings(settings)) return { error: 'These video settings are not valid. Change them on the card.', code: MOTION_SETTINGS_INVALID };
    inputs = motionQuoteInputs(settings);
    bound = input.proposal.input?.binding ?? null;
  } else inputs = { duration_seconds: durationDecision(input.request).duration.seconds, aspect_ratio: MOTION_DEFAULT_RATIO };
  if (bound) {
    const now = motionBinding(env, input.proposal.settings);
    // The renderer configuration the card was made for must be the live one (also checked by the orchestrator before it spends).
    if (bound.renderer_config !== now.renderer_config) return { error: 'The video renderer was updated since this card was made. Ask for it again in chat.', code: MOTION_RENDERER_CHANGED };
    if (JSON.stringify(bound.inputs) !== JSON.stringify(now.inputs) || bound.price_version !== now.price_version || bound.estimate_credits !== now.estimate_credits) {
      return { error: `The price changed to ${creditsText(now.estimate_credits)}. Review it and press Generate again to confirm.`, code: MOTION_QUOTE_STALE, quote: { price_version: now.price_version, estimate_credits: now.estimate_credits, inputs: now.inputs } };
    }
  }
  const ready = motionReadiness(env, inputs);
  return ready.ready ? null : { error: ready.message, code: ready.code };
}
// Immediately before paid execution (after the hold, before the grant and the one POST): the same checks again, so a policy or a
// renderer change between the press and the start stops here with the hold released.
export const motionExecutionCheck = motionGenerationCheck;
// What the orchestrator is told besides the proposal's own fields: the live renderer configuration (it refuses a different one before
// any model call) and the complexity classes the evidence covers for this combination (the composition is checked against them before it renders).
export function motionExecutionTerms(env, settings) {
  const ready = motionReadiness(env, motionQuoteInputs(settings));
  return { ...(liveRendererConfig(env) ? { renderer_config: liveRendererConfig(env) } : {}), ...(ready.ready ? { allowed_complexity: ready.complexity } : {}) };
}
// The seconds the schema offers, for the model-facing tool text.
export const motionSeconds = () => settingsOf('motion').find(f => f.key === 'duration_seconds').options.map(o => o.value);
