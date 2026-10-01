// Tutor architecture v2, Decision 6 (owner, 2026-10-01): winner selection for the planner benchmark.
// Reads the per-turn rows (corpus-<mode>-<stage>.jsonl from tutor-corpus-run.mjs) of every repetition of
// every arm and applies, in this order: hard gates, quality gates (against the Opus reference arm),
// reliability gates, cost (against the baseline arm), then latency. No model call; free to run.
// A candidate is eligible only if it passes every gate; the winner is the fastest eligible arm on BOTH
// p50 and p95 of the first validated speakable sentence. If no single arm is best on both, it reports
// the split for the owner instead of picking one. Groups are never collapsed into one average.
// Usage: node e2e/tutor-bench-gates.mjs --arm A=a1.jsonl,a2.jsonl --arm B=b1.jsonl,... [--reference A] [--baseline A] [--out gates.json]
import { readFileSync, writeFileSync } from 'node:fs';

// Thresholds, owner decision 6.
export const GATES = { quality_pp: 2, invalid_plan_rate: 0.02, routine_escalation_rate: 0.2 };
const GROUPS = ['routine', 'evidence', 'structural'];

const pct = (list, q) => { if (!list.length) return null; const s = [...list].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };
const stats = list => list.length ? { n: list.length, p50: pct(list, 0.5), p95: pct(list, 0.95), mean: Math.round(list.reduce((a, b) => a + b, 0) / list.length), max: Math.max(...list) } : { n: 0 };
const ratio = (num, den) => ({ num, den, rate: den ? +(num / den).toFixed(4) : null });
const sum = (rows, key) => rows.reduce((n, row) => n + (key(row) || 0), 0);

export function measure(rows) {
  const ok = rows.filter(row => !row.error);
  const dim = name => ratio(rows.filter(row => row.checks?.[name] === true).length, rows.filter(row => row.checks && name in row.checks).length);
  // Golden traces: a trace passes only if every one of its turns passed in every repetition.
  const golden = [...new Set(rows.filter(row => row.golden).map(row => row.trace))];
  const goldenPassed = golden.filter(id => rows.filter(row => row.trace === id).every(row => row.pass));
  const fastTurns = rows.filter(row => row.planner_tier === 'fast');
  const latency = list => ({ first_validated_sentence_ms: stats(list.map(row => row.to_first_safe_sentence).filter(v => v != null)), full_plan_ms: stats(list.map(row => row.planner_ms ?? row.to_planner_ready).filter(v => v != null)) });
  const categories = [...new Set(ok.map(row => row.category))].sort();
  const off = rows.filter(row => row.critical_path && !row.critical_path.blocking);
  return {
    turns: rows.length, errored: rows.length - ok.length,
    // A run stopped on a refusal (never retried): the arm is unavailable.
    unavailable: rows.find(row => row.run_aborted)?.run_aborted ?? null,
    // Owner answer A: late evidence and the dependent actions it dropped (no second planner call).
    late_evidence: { off_path_turns: off.length, with_evidence: off.filter(row => row.late_evidence_events > 0).length, route_changed: off.filter(row => row.critical_path.miss).length, dependent_actions_dropped: sum(rows, row => row.evidence_dropped) },
    hard: {
      golden: { passed: goldenPassed.length, total: golden.length, failed: golden.filter(id => !goldenPassed.includes(id)) },
      consent_violations: sum(rows, row => row.audit?.consent), policy_violations: sum(rows, row => row.audit?.policy),
      nonexistent_resource_actions: sum(rows, row => row.audit?.resource),
      spoken_then_replaced: rows.filter(row => row.spoken && !row.spoken.consistent).length,
      evidence_corruption: sum(rows, row => row.evidence_corruption),
    },
    quality: { actions: dim('actions'), evidence: dim('evidence'), route: dim('route') },
    reliability: {
      invalid_plans: ratio(sum(rows, row => row.planner_invalid), sum(rows, row => row.planner_calls + (row.fast_tokens ? 1 : 0))),
      routine_fast_escalation: ratio(fastTurns.filter(row => row.planner_escalated).length, fastTurns.length),
    },
    cost_per_turn_usd: rows.length ? +(sum(rows, row => row.cost_usd) / rows.length).toFixed(5) : null,
    // N, mean, p50, p95 and max everywhere; the N says how much a percentile can carry.
    latency: { all: latency(ok), ...Object.fromEntries(GROUPS.map(group => [group, latency(ok.filter(row => row.group === group))])) },
    latency_by_category: Object.fromEntries(categories.map(category => [category, latency(ok.filter(row => row.category === category))])),
  };
}

export function judge(results, reference = 'A', baseline = 'A') {
  const ref = results[reference], base = results[baseline];
  const verdicts = {};
  for (const [arm, m] of Object.entries(results)) {
    const failed = [];
    if (m.unavailable) failed.push(`unavailable: ${m.unavailable}`);
    const h = m.hard;
    if (h.golden.passed !== h.golden.total) failed.push(`golden ${h.golden.passed}/${h.golden.total}`);
    for (const key of ['consent_violations', 'policy_violations', 'nonexistent_resource_actions', 'spoken_then_replaced', 'evidence_corruption']) if (h[key]) failed.push(`${key} ${h[key]}`);
    if (m.errored) failed.push(`errored turns ${m.errored}`);
    for (const dim of ['actions', 'evidence', 'route']) {
      const gap = +((ref.quality[dim].rate - m.quality[dim].rate) * 100).toFixed(6);
      if (gap > GATES.quality_pp) failed.push(`${dim} ${m.quality[dim].num}/${m.quality[dim].den} is ${gap.toFixed(1)} pp below ${reference} (${ref.quality[dim].num}/${ref.quality[dim].den})`);
    }
    if (m.reliability.invalid_plans.rate >= GATES.invalid_plan_rate) failed.push(`invalid plans ${m.reliability.invalid_plans.num}/${m.reliability.invalid_plans.den}`);
    if (m.reliability.routine_fast_escalation.den && m.reliability.routine_fast_escalation.rate >= GATES.routine_escalation_rate) failed.push(`routine escalation ${m.reliability.routine_fast_escalation.num}/${m.reliability.routine_fast_escalation.den}`);
    if (m.cost_per_turn_usd > base.cost_per_turn_usd) failed.push(`cost/turn ${m.cost_per_turn_usd} > ${baseline} ${base.cost_per_turn_usd} (eligible only on an explicit owner decision)`);
    verdicts[arm] = { eligible: !failed.length, failed };
  }
  const eligible = Object.keys(results).filter(arm => verdicts[arm].eligible);
  const by = key => [...eligible].sort((a, b) => results[a].latency.all.first_validated_sentence_ms[key] - results[b].latency.all.first_validated_sentence_ms[key])[0] ?? null;
  const p50 = by('p50'), p95 = by('p95');
  const winner = !eligible.length ? { arm: null, note: 'no candidate passes every gate: no fast tier ships' }
    : p50 === p95 ? { arm: p50, note: 'fastest eligible arm on both p50 and p95 of the first validated sentence' }
    : { arm: null, note: `owner decision: ${p50} has the best p50, ${p95} the best p95` };
  return { verdicts, winner };
}

if (process.argv[1]?.endsWith('tutor-bench-gates.mjs')) {
  const args = process.argv.slice(2), arms = {};
  for (let i = 0; i < args.length; i++) if (args[i] === '--arm') { const [name, files] = args[++i].split('='); arms[name] = files.split(','); }
  const flag = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : fallback; };
  const reference = flag('reference', 'A'), baseline = flag('baseline', 'A'), out = flag('out', null);
  if (!arms[reference] || !arms[baseline]) throw Error(`--arm ${reference}=... and --arm ${baseline}=... are required (the Opus reference and the cost baseline)`);
  const results = Object.fromEntries(Object.entries(arms).map(([arm, files]) => [arm, measure(files.flatMap(file => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))))]));
  const report = { reference, baseline, gates: GATES, results, ...judge(results, reference, baseline) };
  if (out) writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
