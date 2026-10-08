// Cost / API usage (docs/features/tutor-decision-eval.md §Cost): versioned pricing, one priced cost line per provider
// call, and cost metrics attributed to call, decision, material, modality, model, provider, session, canvas, user x
// canvas, journey and section. A cost is the provider's own report, else computed from usage with the price version in
// force on the call's date, else unknown - never invented. Unknown costs are counted, never summed as $0.
import { readFileSync } from 'node:fs';
import { evidenceDelta, round, stats, sum, tally } from './events.mjs';

export const PRICING = JSON.parse(readFileSync(new URL('pricing.json', import.meta.url), 'utf8'));
export const COST_STATUSES = ['provider_reported', 'computed', 'partial', 'unknown'];
const usd6 = x => round(x, 6);
const known = value => value ?? 0; // for adding: an unknown part is reported in unknown_cost_calls, not as dollars

// The price version in force on an ISO date: the latest effective_date not after it.
export const pricingFor = (date, pricing = PRICING) => pricing.versions.filter(version => version.effective_date <= date).sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0] ?? null;

// Provider usage -> the telemetry's names (Anthropic reports cache_read_input_tokens / cache_creation_input_tokens).
// thinking_tokens only when a provider exposes it; Anthropic bills thinking inside output_tokens, so it is never added.
export const normalizeUsage = (usage) => (usage ??= {}, {
  input_tokens: usage.input_tokens ?? null,
  output_tokens: usage.output_tokens ?? null,
  cache_read_tokens: usage.cache_read_tokens ?? usage.cache_read_input_tokens ?? 0,
  cache_write_tokens: usage.cache_write_tokens ?? usage.cache_creation_input_tokens ?? 0,
  thinking_tokens: usage.thinking_tokens ?? null,
});

// One call's cost. provider_reported wins; else computed from usage when the model has a price on that date; a known
// input with an unknown output (a stream that died) is a partial lower bound; otherwise unknown.
// prompt_cache_saved_usd: cache reads at the input price minus what they cost, less the cache-write premium.
export function priceCall({ model_id, usage, provider_reported_cost_usd = null, speed = null, date = new Date().toISOString().slice(0, 10) }, pricing = PRICING) {
  const version = pricingFor(date, pricing);
  const price = version?.models[model_id] ?? null;
  const u = normalizeUsage(usage);
  const multiplier = speed === 'fast' ? price?.fast_multiplier ?? null : 1;
  let computed = null, saved = null;
  if (price && multiplier != null && u.input_tokens != null) {
    computed = multiplier * (u.input_tokens * price.input + (u.output_tokens ?? 0) * price.output + u.cache_read_tokens * price.cache_read + u.cache_write_tokens * price.cache_write) / 1e6;
    saved = multiplier * (u.cache_read_tokens * (price.input - price.cache_read) - u.cache_write_tokens * (price.cache_write - price.input)) / 1e6;
  }
  const reported = Number.isFinite(provider_reported_cost_usd) ? provider_reported_cost_usd : null;
  const status = reported != null ? 'provider_reported' : computed == null ? 'unknown' : u.output_tokens == null ? 'partial' : 'computed';
  return {
    usage: u, provider_reported_cost_usd: reported, computed_cost_usd: usd6(computed), cost_usd: usd6(reported ?? computed), cost_status: status,
    pricing_version: computed != null ? version.pricing_version : null, pricing_effective_date: computed != null ? version.effective_date : null,
    prompt_cache_saved_usd: usd6(saved),
  };
}

// ---------- Metrics over folded calls ----------

// Cost categories come from the role table (fixtures/cost-roles.provisional.json): the product's own task names.
export const categoryOf = (roles, call) => roles.roles?.[call.model_role] ?? 'unclassified';
const MODEL = ['planning', 'hooks', 'journey', 'unclassified'];
const MATERIAL = ['material_generation', 'material_review'];

// Known dollars plus how many calls had no cost: an unknown cost is counted, never a fake $0.
export function money(calls) {
  const known = calls.filter(call => call.cost_usd != null);
  const statuses = new Set(calls.map(call => call.cost_status));
  const status = !calls.length ? 'none' : !known.length ? 'unknown' : known.length < calls.length || statuses.has('partial') ? 'partial' : statuses.size === 1 && statuses.has('provider_reported') ? 'provider_reported' : 'computed';
  // No calls costs $0; calls whose costs are all unknown cost null, never a fake $0.
  return { usd: calls.length && !known.length ? null : usd6(sum(known.map(call => call.cost_usd))), calls: calls.length, unknown_cost_calls: calls.length - known.length, cost_status: status, lower_bound: status === 'partial' || status === 'unknown' };
}
const by = (calls, keyOf) => Object.fromEntries(Object.entries(Object.groupBy(calls.filter(call => keyOf(call) != null), keyOf)).map(([key, list]) => [key, money(list)]));

// A wasted call: it failed, its output was rejected (an invalid Author draft, a plan that failed validation), or
// the material it was for failed. Its cost still counts in the attempted total.
export const isWasted = (call, failedMaterials = new Set()) => call.outcome !== 'ok' || call.output_accepted === false || failedMaterials.has(call.material_id);

// The decision's own cost: its SHARED cost (calls not tied to one material: planning, hooks, evidence) and the
// direct cost of its materials. Shared cost belongs to the decision; it is never part of a material's direct cost.
export function decisionCost(step, roles) {
  const calls = (step.calls || []).filter(call => categoryOf(roles, call) !== 'eval_only');
  const shared = calls.filter(call => !call.material_id), material = calls.filter(call => call.material_id);
  return {
    decision_shared_cost_usd: known(money(shared).usd), decision_evaluation_cost_usd: money(shared.filter(call => categoryOf(roles, call) === 'evidence_evaluation')).usd,
    decision_material_cost_usd: known(money(material).usd), decision_total_cost_usd: known(money(calls).usd), unknown_cost_calls: money(calls).unknown_cost_calls,
  };
}

// A material's cost. Direct: its own calls by category. The decision's shared cost (planning, hooks, evidence) stays the
// decision's; for "roughly what did this card cost?" an ALLOCATED share is reported beside it, labelled with its method.
//   material_attributed_total_cost_usd = direct_material_cost_usd + allocated_shared_cost_usd
// Totals (session, canvas, user x canvas, global) always sum cost lines, never these allocations, so nothing is
// counted twice; across one decision's materials the attributed totals add up to the decision's total.
export function materialCost(step, material, roles) {
  const calls = (step.calls || []).filter(call => categoryOf(roles, call) !== 'eval_only');
  const own = calls.filter(call => call.material_id === material.material_id);
  const materials = Math.max(1, (step.materials || []).length);
  const shared = known(money(calls.filter(call => !call.material_id)).usd);
  const of = cats => known(money(own.filter(call => cats.includes(categoryOf(roles, call)))).usd);
  const generation = of(['material_generation']), review = of(['material_review']), downstream = of(['downstream_provider']), compute = of(['compute']);
  const direct = known(money(own).usd);
  const fresh = material.fresh_generation_cost_usd ?? null;
  return {
    direct_material_cost_usd: usd6(direct), generation_model_cost_usd: generation, evaluation_cost_usd: review, downstream_provider_cost_usd: downstream, compute_cost_usd: compute,
    decision_shared_cost_usd: usd6(shared), allocated_shared_cost_usd: usd6(shared / materials), allocation_method: 'equal_split', materials_in_decision: materials,
    material_attributed_total_cost_usd: usd6(direct + shared / materials), unknown_cost_calls: money(own).unknown_cost_calls,
    wasted_cost_usd: known(money(own.filter(call => isWasted(call) || material.status === 'failed')).usd),
    fresh_generation_cost_usd: fresh, actual_generation_cost_usd: usd6(direct),
    estimated_cost_saved_usd: material.cache_status === 'hit' && fresh != null ? usd6(Math.max(0, fresh - direct)) : null,
  };
}

// segments: lists of folded steps (session-level segments also carry .session_calls); records: material records
// (materials.mjs); active: is a step an active-learning step. Product cost excludes the eval's own calls (learner
// simulator, reviewer), which are reported apart.
export function costMetrics(segments, roles, records = [], active = () => false) {
  const steps = segments.flat();
  const all = [...steps.flatMap(step => step.calls || []), ...segments.flatMap(segment => segment.session_calls || [])];
  const category = call => categoryOf(roles, call);
  const calls = all.filter(call => category(call) !== 'eval_only');
  const failedMaterials = new Set(records.filter(record => record.status === 'failed').map(record => record.material_id));
  const wasted = calls.filter(call => isWasted(call, failedMaterials));
  const total = money(calls);
  const ofCategory = cats => known(money(calls.filter(call => cats.includes(category(call)))).usd);
  const learning = sum(steps.map(step => step.estimated_learning_seconds || 0));
  const activeLearning = sum(steps.filter(active).map(step => step.estimated_learning_seconds || 0));
  const decisions = steps.map(step => ({ session_id: step.session_id, step: step.step, decision_id: step.decision_id, action_type: step.tutor_decision?.action_type ?? 'unknown', ...decisionCost(step, roles) }));
  const perMaterial = list => {
    // Direct cost is the material's own; attributed adds its equal-split share of the decision's shared cost.
    const direct = list.map(record => record.cost.direct_material_cost_usd), attributed = list.map(record => record.cost.material_attributed_total_cost_usd);
    const successful = list.filter(record => record.successful);
    return {
      count: list.length, successful_count: successful.length, direct_cost_usd: usd6(sum(direct)), attributed_total_cost_usd: usd6(sum(attributed)), allocation_method: 'equal_split',
      direct_cost_per_material: stats(direct), attributed_cost_per_material: stats(attributed),
      cost_per_successful_material: successful.length ? usd6(sum(attributed) / successful.length) : null,
    };
  };
  const per = (value, n) => (n ? usd6(value / n) : null);
  const byModel = Object.fromEntries(Object.entries(Object.groupBy(calls, call => call.model_id)).map(([model, list]) => {
    const decisionIds = new Set(list.map(call => call.decision_id).filter(Boolean));
    const influenced = records.filter(record => decisionIds.has(record.decision_id)).length;
    const tokens = key => sum(list.map(call => call.usage?.[key] || 0));
    return [model, {
      ...money(list), providers: [...new Set(list.map(call => call.provider))], roles: tally(list.map(call => call.model_role)),
      failed: list.filter(call => call.outcome !== 'ok').length, escalations: list.filter(call => call.escalation).length, fallbacks: list.filter(call => call.fallback).length,
      input_tokens: tokens('input_tokens'), output_tokens: tokens('output_tokens'), cache_read_tokens: tokens('cache_read_tokens'), cache_write_tokens: tokens('cache_write_tokens'),
      latency_ms: stats(list.map(call => call.latency_ms)), materials_influenced: influenced, cost_per_material: money(list).usd == null ? null : per(money(list).usd, influenced),
    }];
  }));
  const top = (list, key) => list.reduce((best, item) => (item[key] != null && item[key] > (best?.[key] ?? -1) ? item : best), null);
  const improved = steps.filter(step => evidenceDelta(step.evidence_before, step.evidence_after).improved.length).length;
  return {
    total_usd: total.usd, cost_status: total.cost_status, lower_bound: total.lower_bound, calls: calls.length, unknown_cost_calls: total.unknown_cost_calls,
    model_cost_usd: ofCategory(MODEL), evaluator_cost_usd: ofCategory(['evidence_evaluation']), material_generation_cost_usd: ofCategory(MATERIAL),
    downstream_provider_cost_usd: ofCategory(['downstream_provider']), compute_cost_usd: ofCategory(['compute']),
    eval_only_cost_usd: known(money(all.filter(call => category(call) === 'eval_only')).usd),
    by_category: by(calls, category), by_model: byModel, by_model_role: by(calls, call => call.model_role), by_provider: by(calls, call => call.provider),
    by_session: by(calls, call => call.session_id), by_canvas: by(calls, call => call.canvas_id), by_user_canvas: by(calls, call => `${call.user_id}|${call.canvas_id}`),
    by_journey: by(calls, call => call.journey_id), by_section: by(calls, call => (call.section_id ? `${call.journey_id ?? ''}|${call.section_id}` : null)),
    by_action_type: Object.fromEntries(Object.entries(Object.groupBy(decisions, decision => decision.action_type)).map(([key, list]) => [key, { decisions: list.length, total_cost_usd: usd6(sum(list.map(entry => entry.decision_total_cost_usd))) }])),
    by_modality: Object.fromEntries(Object.entries(Object.groupBy(records, record => record.modality ?? 'unknown')).map(([key, list]) => [key, perMaterial(list)])),
    by_material_type: Object.fromEntries(Object.entries(Object.groupBy(records, record => record.material_type ?? 'unknown')).map(([key, list]) => [key, perMaterial(list)])),
    decisions: steps.length, materials: records.length,
    mean_cost_per_decision: per(total.usd, steps.length), cost_per_tutor_decision: per(total.usd, steps.length),
    // Per-material figures use the attributed totals (direct + equal-split shared), labelled; totals above never do.
    mean_cost_per_material: records.length ? usd6(sum(records.map(record => record.cost.material_attributed_total_cost_usd)) / records.length) : null,
    mean_direct_cost_per_material: records.length ? usd6(sum(records.map(record => record.cost.direct_material_cost_usd)) / records.length) : null,
    per_material_allocation_method: 'equal_split',
    cost_per_successful_material: per(sum(records.map(record => record.cost.material_attributed_total_cost_usd)), records.filter(record => record.successful).length),
    cost_per_completed_material: per(sum(records.map(record => record.cost.material_attributed_total_cost_usd)), records.filter(record => record.was_completed).length),
    cost_per_learning_minute: per(total.usd, learning / 60), cost_per_active_learning_minute: per(total.usd, activeLearning / 60),
    attempted_cost_usd: total.usd, wasted_cost_usd: known(money(wasted).usd), successful_output_cost_usd: usd6(known(total.usd) - known(money(wasted).usd)),
    cache_savings_usd: {
      materials: usd6(sum(records.map(record => record.cost.estimated_cost_saved_usd || 0))),
      prompt_cache: usd6(sum(calls.map(call => call.prompt_cache_saved_usd || 0))),
      material_cache_hits: records.filter(record => record.cache_status === 'hit').length,
    },
    decision_costs: decisions,
    highest_cost_decision: top(decisions, 'decision_total_cost_usd'),
    highest_cost_material: top(records.map(record => ({ material_id: record.material_id, decision_id: record.decision_id, modality: record.modality, material_type: record.material_type, direct_material_cost_usd: record.cost.direct_material_cost_usd, material_attributed_total_cost_usd: record.cost.material_attributed_total_cost_usd, allocation_method: 'equal_split' })), 'material_attributed_total_cost_usd'),
    // Descriptive only, never causal: dollars per observed outcome.
    descriptive: {
      cost_per_evidence_improvement: per(total.usd, improved),
      cost_per_misconception_repaired: per(total.usd, records.filter(record => record.misconception_repaired).length),
      cost_per_active_learning_event: per(total.usd, steps.filter(active).length),
      cost_per_completed_section: null, // ponytail: no section-completion signal in the event stream yet
    },
  };
}
