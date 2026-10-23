// The worst-case provider spend of one Motion job, as a pure function of the job's call limits and the models it will
// call (owner 2026-10-23: the per-job hold is backed by a conservative bound on what the provider can bill, not only by
// an internal credit reservation). No I/O, no clock.
//
// Per call: input tokens x input price x 1.25 (the system prompt is cached, so the cache-write premium is charged on all
// input) + max_tokens x output price. Input tokens are bounded the way learn-spend.js requestSpendBound bounds them:
// request bytes + 1000 framing tokens + 4784 per image. Extended thinking is billed as output and must fit inside
// max_tokens (Motion sends adaptive thinking, no separate budget), so max_tokens already covers it. Tool calls: Motion
// sends only custom (schema) tools, billed as the tokens they use; a provider-priced server tool (web search, code
// execution) makes requestSpendBound return null, so the orchestrator refuses the call before sending. A rule may still
// declare tool_micros (a per-call tool price) and it is added per call. Prices: MODEL_PRICES (control-plane
// learn-models.js), the same table that prices the calls the orchestrator sends.
// The sum counts every allowed call, repairs and re-asks included: the policy's `calls` is the maximum, so a repair is a
// call. The hard guard (orchestrator.mjs guarded) keeps the real total inside the job ceiling even when this sum is larger.
import { MODEL_PRICES } from '../../control-plane/src/learn-models.js';
import { resolveRole } from './model-config.js';

export const FRAMING_TOKENS = 1000;
export const IMAGE_TOKENS = 4784;
export const CACHE_WRITE_PREMIUM = 1.25;

// One call at its caps, in micro-USD (price: [input, output] in USD per million tokens = micro-USD per token).
export const callBoundMicros = (rule, [input, output]) =>
  Math.ceil((rule.bytes + FRAMING_TOKENS + rule.images * IMAGE_TOKENS) * input * CACHE_WRITE_PREMIUM + rule.max_tokens * output) + (rule.tool_micros || 0);

// The model(s) each policy tool kind calls. Brief and storyboards are the Director, the composition the Author, the review
// calls either reviewer; a kind with two roles is priced at the dearer of them.
const KIND_ROLES = Object.freeze({
  motion_brief: ['MOTION_DIRECTOR_MODEL'], motion_storyboard: ['MOTION_DIRECTOR_MODEL'], motion_composition: ['MOTION_AUTHOR_MODEL'],
  motion_review: ['MOTION_VISUAL_REVIEW_MODEL', 'MOTION_PEDAGOGICAL_REVIEW_MODEL'],
});
export const modelsFor = (env = {}) => Object.fromEntries(Object.entries(KIND_ROLES).map(([kind, roles]) => [kind, roles.map(role => resolveRole(role, env))]));

// models: kind -> model id or ids (the dearest is used), or a single id for every kind. A kind whose model has no price
// has no bound: the result is {micros: null, unpriced: [...]}, never a guess.
export function jobWorstCase(policy, models = 'claude-opus-5-5', prices = MODEL_PRICES) {
  const lines = [], unpriced = [];
  for (const [kind, rule] of Object.entries(policy)) {
    const ids = [].concat(typeof models === 'string' ? models : models[kind] ?? []);
    const costs = ids.map(id => (prices[id] ? callBoundMicros(rule, prices[id]) : null));
    if (!costs.length || costs.includes(null)) { unpriced.push(kind); continue; }
    lines.push({ kind, calls: rule.calls, per_call_micros: Math.max(...costs), micros: rule.calls * Math.max(...costs) });
  }
  return { micros: unpriced.length ? null : lines.reduce((s, l) => s + l.micros, 0), lines, unpriced };
}

// The sum against a hold: whether every call the policy allows could be paid for, and what the guard can still reach when it
// cannot (calls run in `order`, each spending its full bound, and one that does not fit what is left is refused).
export function holdCoverage(policy, hold, models, prices, order = ['motion_brief', 'motion_storyboard', 'motion_composition', 'motion_review', 'motion_storyboard', 'motion_composition', 'motion_review']) {
  const worst = jobWorstCase(policy, models, prices);
  if (worst.micros == null) return { ...worst, hold, fits: false, reachable_micros: null };
  const per = Object.fromEntries(worst.lines.map(l => [l.kind, l.per_call_micros])), used = {};
  let reachable = 0;
  for (const kind of order) for (let i = 0; i < (kind === 'motion_review' ? 2 : 1); i++) {
    if ((used[kind] || 0) >= policy[kind].calls || reachable + per[kind] > hold) continue;
    used[kind] = (used[kind] || 0) + 1; reachable += per[kind];
  }
  return { ...worst, hold, fits: worst.micros <= hold, reachable_micros: reachable };
}
