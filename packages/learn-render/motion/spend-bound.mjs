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

// The least any bound of this call can be: its output cap alone, priced (the input only adds to it). A strict lower bound, so a
// check built on it refuses only what cannot possibly fit (failed production job 61f70171, 2026-10-25).
export const floorMicros = (rule, [, output]) => Math.ceil(rule.max_tokens * output);

// The calls a job cannot reach a video without, in pipeline order: the Director's brief, the storyboard, the Author's composition and
// the two fresh reviewers. Repairs are not here: they are the bounded extra allowance the per-call guard checks one call at a time.
export const MANDATORY_PATH = Object.freeze([['motion_brief', 1], ['motion_storyboard', 1], ['motion_composition', 1], ['motion_review', 2]]);
// What follows a call of this kind, for the reserve-ahead check: the required calls still to come after it.
export const AHEAD = Object.freeze({
  motion_brief: Object.freeze([['motion_storyboard', 1], ['motion_composition', 1], ['motion_review', 2]]),
  motion_storyboard: Object.freeze([['motion_composition', 1], ['motion_review', 2]]),
  motion_composition: Object.freeze([['motion_review', 2]]),
  motion_review: Object.freeze([]),
});

// The conservative least a list of required [kind, count] calls can add up to under `policy`, and what stops it being known:
// a kind the policy does not allow (or allows fewer times), a kind whose model has no price. -> {micros|null, calls, lines, missing, unpriced}
export function pathFloor(path, policy, models = 'claude-opus-5-5', prices = MODEL_PRICES, rules = {}) {
  const lines = [], missing = [], unpriced = [];
  let calls = 0;
  for (const [kind, count] of path) {
    calls += count;
    const rule = rules[kind] ?? policy?.[kind];
    if (!rule || !((policy?.[kind]?.calls ?? 0) >= count)) { missing.push(kind); continue; }
    const ids = [].concat(typeof models === 'string' ? models : models[kind] ?? []);
    const floors = ids.map(id => (prices[id] ? floorMicros(rule, prices[id]) : null));
    if (!floors.length || floors.includes(null)) { unpriced.push(kind); continue; }
    lines.push({ kind, calls: count, per_call_micros: Math.max(...floors), micros: count * Math.max(...floors) });
  }
  return { micros: missing.length || unpriced.length ? null : lines.reduce((s, l) => s + l.micros, 0), calls, lines, missing, unpriced };
}

// The conservative worst case of a list of required [kind, count] calls: each at the policy rule's caps (callBoundMicros), so it is
// never below what the guard will bound the real call at. `rules` replaces a kind's rule (the Author's repair is a patch, capped lower).
export function pathBound(path, policy, models = 'claude-opus-5-5', prices = MODEL_PRICES, rules = {}) {
  const lines = [], missing = [], unpriced = [];
  let calls = 0;
  for (const [kind, count] of path) {
    calls += count;
    const rule = rules[kind] ?? policy?.[kind];
    if (!rule || !((policy?.[kind]?.calls ?? 0) >= count)) { missing.push(kind); continue; }
    const ids = [].concat(typeof models === 'string' ? models : models[kind] ?? []);
    const costs = ids.map(id => (prices[id] ? callBoundMicros(rule, prices[id]) : null));
    if (!costs.length || costs.includes(null)) { unpriced.push(kind); continue; }
    lines.push({ kind, calls: count, per_call_micros: Math.max(...costs), micros: count * Math.max(...costs) });
  }
  return { micros: missing.length || unpriced.length ? null : lines.reduce((s, l) => s + l.micros, 0), calls, lines, missing, unpriced };
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

// ---- The route budget: what a ceiling must be able to carry for the routes the policy OFFERS (owner lane 2026-10-26, after job 3c46c4d2) ----
// The guard refuses a call unless committed + its bound + the floor of the calls that must follow it fit the ceiling. The hold (8.96) is the
// policy-cap bound of all 9 calls; no ceiling below it PROVES a route. What a ceiling can honestly be asked is whether the guard lets the offered
// routes run when every call is within the declared SUPPORTED_ENVELOPE (request sizes of the largest supported job: 30 s, 8 beats, 18 review
// frames) and every finished call cost no more than the envelope's `actual`. A ceiling below that is refused before any spend. Not a promise that
// a job succeeds: a job outside the envelope (an Author at its 64000-token cap in both rounds) is still stopped by the guard, at zero credits.
// Every number is pinned by spend-bound.test.mjs against the recorded requests and the guard itself. ponytail: the envelope is declared, not measured per job.
const shape = (kind, bytes, images, actual, max_tokens) => Object.freeze({ kind, bytes, images, actual, ...(max_tokens ? { max_tokens } : {}) });
export const SUPPORTED_ENVELOPE = Object.freeze({
  brief: shape('motion_brief', 16000, 0, 70_000),
  storyboard: shape('motion_storyboard', 24000, 0, 250_000),
  revision: shape('motion_storyboard', 40000, 0, 250_000),
  author: shape('motion_composition', 32000, 0, 1_200_000),
  author_whole: shape('motion_composition', 72000, 0, 1_200_000), // after a Director revision the Author rewrites the whole source
  author_patch: shape('motion_composition', 72000, 0, 150_000, 24000), // 24000 = AUTHOR_REPAIR_CAP (author.js), pinned by the test
  review: shape('motion_review', 16000, 18, 85_000), // each of the two reviewers; 18 = the 17 contact frames of an 8-beat storyboard (the most it can have) + one Director keyframe
});
const PAIR = ['review', 'review'];
// The four routes the pipeline can take (review-job.mjs): the first pass, the Author patch, a Director revision before the Author, a Director
// revision after a blocking review. Each is the full call sequence in order.
export const ROUTES = Object.freeze({
  first_pass: ['brief', 'storyboard', 'author', ...PAIR],
  author_patch: ['brief', 'storyboard', 'author', ...PAIR, 'author_patch', ...PAIR],
  pre_author_revision: ['brief', 'storyboard', 'revision', 'author', ...PAIR, 'author_patch', ...PAIR],
  post_review_revision: ['brief', 'storyboard', 'author', ...PAIR, 'revision', 'author_whole', ...PAIR],
});
// The guard's sum at every call of a route (orchestrator.mjs guarded): committed (finished calls at the envelope's cost, the first reviewer of a pair
// still in flight at its bound) + this call's bound + the floor of what must follow (AHEAD; the first reviewer holds a place for the second).
// -> {micros, call (1-based), kind, name, rows} for the largest, or {micros: null, unpriced|missing} when a kind has no price or no rule.
export function routePeak(names, policy, models = 'claude-opus-5-5', prices = MODEL_PRICES, envelope = SUPPORTED_ENVELOPE) {
  const rows = [], issued = {};
  let committed = 0, firstReviewerBound = 0;
  for (const [i, name] of names.entries()) {
    const e = envelope[name], base = policy?.[e.kind];
    if (!base) return { micros: null, missing: [e.kind] };
    const ids = [].concat(typeof models === 'string' ? models : models[e.kind] ?? []);
    if (!ids.length || ids.some(id => !prices[id])) return { micros: null, unpriced: [e.kind] };
    const bound = Math.max(...ids.map(id => callBoundMicros({ ...base, bytes: e.bytes, images: e.images, max_tokens: e.max_tokens ?? base.max_tokens }, prices[id])));
    const count = issued[e.kind] || 0;
    const path = e.kind === 'motion_review' ? (count % 2 === 0 ? [['motion_review', 1]] : []) : (AHEAD[e.kind] ?? []);
    const ahead = pathFloor(path, policy, models, prices).micros ?? 0;
    const inFlight = e.kind === 'motion_review' && count % 2 === 1 ? firstReviewerBound : 0; // the second reviewer sees the first at its bound
    rows.push({ call: i + 1, kind: e.kind, name, bound, committed: committed + inFlight, ahead, peak: committed + inFlight + bound + ahead });
    issued[e.kind] = count + 1;
    if (e.kind !== 'motion_review') committed += e.actual;
    else if (count % 2 === 0) firstReviewerBound = bound;
    else committed += 2 * e.actual; // the pair has landed: both at cost
  }
  const top = rows.reduce((a, b) => (b.peak > a.peak ? b : a));
  return { micros: top.peak, call: top.call, kind: top.kind, name: top.name, rows };
}
// The least a ceiling may be for a NEW job: the largest guard sum over the offered routes. -> {micros, route, call, kind, routes: {name: micros}} | {micros: null, unpriced|missing}
export function routeBudget(policy, models = 'claude-opus-5-5', prices = MODEL_PRICES, envelope = SUPPORTED_ENVELOPE) {
  const routes = {};
  for (const [name, names] of Object.entries(ROUTES)) {
    const p = routePeak(names, policy, models, prices, envelope);
    if (p.micros == null) return { micros: null, unpriced: p.unpriced ?? [], missing: p.missing ?? [] };
    routes[name] = p;
  }
  const [route, top] = Object.entries(routes).reduce((a, b) => (b[1].micros > a[1].micros ? b : a));
  return { micros: top.micros, route, call: top.call, kind: top.kind, routes: Object.fromEntries(Object.entries(routes).map(([k, v]) => [k, v.micros])) };
}
