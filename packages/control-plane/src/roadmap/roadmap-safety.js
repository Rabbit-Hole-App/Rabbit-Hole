// R4.09 contextual text safety (v1.4 6.4, D29, D43; contracts/planning.md 12). Probabilistic classification, deterministic enforcement.
// The classifier is INJECTED: classify({ role, text }) -> { scores: {category: 0..1}, uncertainty, coverage:{complete, chars, chunks} }
// (the Lead wires it to JEV with the independent per-category SAFETY_QUESTIONS; tests pass a double). Anything malformed, late,
// incomplete or unsure is `unknown`: held, never counted as prohibited, never publishable. One bounded retry, then at most one
// adjudication, all inside the overall checking deadline; continued uncertainty terminates the affected delivery (refund rule).
import { validateToolInput } from '../learn-validation.js';
import { CHECK_PROMPTS, ADJUDICATE_TOOL, SAFETY_POLICY_VERSION, SAFETY_QUESTIONS } from '../agents/roadmap-check.js';
import { ROADMAP_LIMITS, safetyScreenMs } from './roadmap-policy.js';
import { sha256 } from './roadmap-source.js';

export const CATEGORIES = Object.freeze(Object.keys(SAFETY_QUESTIONS));
// Proposed thresholds, to be measured on the held-out corpus (not an approval): below `allow` is allow, at or above `block` is block;
// between them a category with `mid: 'restrain'` restrains (analysis of violence/hate is allowed with a limitation), any other is unknown.
export const THRESHOLDS = Object.freeze({
  sexual_explicit: { allow: 0.3, block: 0.7 }, sexual_minors: { allow: 0.05, block: 0.3 }, nonconsensual_intimate: { allow: 0.1, block: 0.5 },
  violence: { allow: 0.5, block: 0.9, mid: 'restrain' }, hate_extremism: { allow: 0.5, block: 0.9, mid: 'restrain' },
  private_data: { allow: 0.3, block: 0.7 }, self_harm_personal: { allow: 0.3, block: Infinity, mid: 'support' },
});
export const MAX_UNCERTAINTY = 0.4;

// A part's role decides what it can mean: a self-harm signal counts as personal danger only in the learner's own words.
export const PART_ROLES = Object.freeze(['learner', 'source', 'output']);

const valid = c => c && typeof c === 'object' && c.scores && typeof c.scores === 'object' && CATEGORIES.every(k => Number.isFinite(c.scores[k]) && c.scores[k] >= 0 && c.scores[k] <= 1)
  && Number.isFinite(c.uncertainty) && c.uncertainty >= 0 && c.uncertainty <= 1 && c.coverage && typeof c.coverage.complete === 'boolean';

// One classified part -> { decision, categories, personalRisk, why }
export function enforcePart(role, c) {
  if (!valid(c)) return { decision: 'unknown', why: 'malformed' };
  if (!c.coverage.complete) return { decision: 'unknown', why: 'incomplete_coverage' };
  if (c.uncertainty > MAX_UNCERTAINTY) return { decision: 'unknown', why: 'uncertain' };
  let decision = 'allow', personalRisk = false, why = null;
  const rank = { allow: 0, restrain: 1, unknown: 2, block: 3 };
  const raise = (d, w) => { if (rank[d] > rank[decision]) { decision = d; why = w; } };
  for (const k of CATEGORIES) {
    const s = c.scores[k], t = THRESHOLDS[k];
    if (k === 'self_harm_personal') { if (role === 'learner' && s >= t.allow) { personalRisk = true; raise('restrain', k); } continue; } // quoted self-harm in a source is analysis, not danger
    if (s >= t.block) raise('block', k); else if (s >= t.allow) raise(t.mid === 'restrain' ? 'restrain' : 'unknown', k);
  }
  return { decision, categories: c.scores, personalRisk, why };
}

// Across parts: any block wins; otherwise any unknown holds; otherwise any restrain restrains.
function combine(parts) {
  const rank = { allow: 0, restrain: 1, unknown: 2, block: 3 };
  const worst = parts.reduce((w, p) => (rank[p.decision] > rank[w.decision] ? p : w), { decision: 'allow' });
  const categories = Object.fromEntries(CATEGORIES.map(k => [k, Math.max(0, ...parts.map(p => p.categories?.[k] ?? 0))]));
  return { decision: worst.decision, why: worst.why ?? null, categories, personalRisk: parts.some(p => p.personalRisk) };
}

const ACTION = { allow: 'continue', restrain: 'limit', block: 'refuse', unknown: 'hold' };

// screenText(parts, { classify, adjudicate, now, limits }) -> { decision, publishable, action, retried, adjudicated, terminal, ... }
//   parts = [{ role: 'learner'|'source'|'output', text }]  (intent, quoted passage and the output are judged together)
//   adjudicate({ parts, classification }) -> { decision, reason } | throws; it can resolve a hold, never override a block
export async function screenText(parts, { classify, adjudicate, now = Date.now, limits = ROADMAP_LIMITS } = {}) {
  const started = now(), deadline = started + limits.deadlineMs.checking, left = () => deadline - now();
  const inputHash = await sha256(JSON.stringify([SAFETY_POLICY_VERSION, parts.map(p => [p.role, p.text])]));
  const meta = { policy_version: SAFETY_POLICY_VERSION, input_hash: inputHash };
  const settle = (r, extra = {}) => ({ ...meta, ...r, action: r.personalRisk ? 'pause_support' : ACTION[r.decision], publishable: !r.personalRisk && (r.decision === 'allow' || r.decision === 'restrain'), counted_as_prohibited: r.decision === 'block',
    terminal: false, retried: false, adjudicated: false, ...extra });
  if (!parts.length || parts.some(p => !PART_ROLES.includes(p.role) || typeof p.text !== 'string')) return settle({ decision: 'unknown', why: 'bad_input' }, { terminal: true, action: 'terminate' });
  if (typeof classify !== 'function') return settle({ decision: 'unknown', why: 'no_classifier' }, { terminal: true, action: 'terminate' });
  const screen = async () => {
    // A screen costs up to safetyScreenMs (a fetch plus its admitted 429/529 retry); do not start one that cannot finish.
    if (left() < safetyScreenMs(limits)) return { decision: 'unknown', why: 'deadline' };
    const results = await Promise.all(parts.map(async p => { try { return enforcePart(p.role, await classify({ role: p.role, text: p.text })); } catch { return { decision: 'unknown', why: 'transport_error' }; } }));
    return combine(results);
  };
  let result = await screen(), retried = false;
  if (result.decision === 'unknown' && result.why !== 'deadline') { retried = true; result = await screen(); }
  let adjudicated = false;
  if (result.decision === 'unknown' && limits.calls.adjudicationsPerResult > 0 && typeof adjudicate === 'function' && left() >= limits.deadlineMs.adjudication) {
    adjudicated = true;
    try {
      const verdict = await adjudicate({ parts, classification: result });
      if (verdict && ['allow', 'restrain', 'block'].includes(verdict.decision)) result = { ...result, decision: verdict.decision, why: `adjudicated:${String(verdict.reason || '').slice(0, 120)}` };
    } catch { /* still unknown */ }
  }
  const terminal = result.decision === 'unknown'; // continued uncertainty ends this delivery (refund rule), it is never publication
  return settle(result, { retried, adjudicated, terminal, ...(terminal ? { action: 'terminate' } : {}) });
}

// The Opus adjudication as a ready-made `adjudicate` over an injected callModel(role, body).
export const modelAdjudicator = ({ callModel, limits = ROADMAP_LIMITS }) => async ({ parts, classification }) => {
  const { system, tools } = CHECK_PROMPTS.roadmap_safety_adjudicate;
  const user = `Screen result: ${JSON.stringify({ why: classification.why, categories: classification.categories })}\n\n` + parts.map(p => `<${p.role}>\n${p.text}\n</${p.role}>`).join('\n');
  const message = await callModel('roadmap_safety_adjudicate', { max_tokens: limits.maxTokens.roadmap_safety_adjudicate, system, tools, tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: user }] });
  const used = (message?.content || []).filter(p => p.type === 'tool_use');
  if (used.length !== 1 || used[0].name !== ADJUDICATE_TOOL.name) return { decision: 'unknown', reason: 'invalid_turn' };
  validateToolInput(used[0].input, ADJUDICATE_TOOL.input_schema, 'submit_adjudication');
  return used[0].input;
};
