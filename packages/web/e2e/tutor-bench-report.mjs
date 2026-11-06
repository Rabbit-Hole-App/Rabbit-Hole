// Builds the owner's benchmark tables (report.md, gates.json) from a live results directory: the decision-6
// gates per arm, the six timings per group, quality, reliability, v2 metrics, calls and cost. Free: reads
// files only. Usage: node e2e/tutor-bench-report.mjs <results dir>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { measure, judge } from './tutor-bench-gates.mjs';

const OUT = process.argv[2];
if (!OUT) throw Error('usage: node e2e/tutor-bench-report.mjs <results dir>');
const files = readdirSync(OUT).filter(name => /^corpus-live-.*\.jsonl$/.test(name));
const rowsOf = name => readFileSync(`${OUT}/${name}`, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
const ARMS = ['A', 'B', 'C', 'D', 'E', 'F'];
const byArm = Object.fromEntries(ARMS.map(arm => [arm, files.filter(name => name.startsWith(`corpus-live-${arm}-`)).flatMap(rowsOf)]).filter(([, rows]) => rows.length));
const results = Object.fromEntries(Object.entries(byArm).map(([arm, rows]) => [arm, measure(rows)]));
const verdict = judge(results, 'A', 'A');
// Second reading of the golden hard gate: the unit golden traces (code-level, 11/11 for every arm since
// every arm runs the same code) instead of the live corpus golden traces. Shown separately, never merged.
const unitReading = judge(Object.fromEntries(Object.entries(results).map(([arm, m]) => [arm, { ...m, hard: { ...m.hard, golden: { ...m.hard.golden, passed: m.hard.golden.total } } }])), 'A', 'A');
const lines = [];
const fmt = s => (s && s.n ? `${s.n} / ${s.mean} / ${s.p50} / ${s.p95} / ${s.max}` : 'n/a');
const METRICS = [['evidence_ready_ms', 'evidence ready'], ['first_planner_output_ms', 'first planner output'], ['first_validated_sentence_ms', 'first validated sentence'], ['full_plan_ms', 'full planner'], ['first_evidence_action_ms', 'first evidence-dependent action'], ['total_turn_ms', 'total turn']];
for (const group of ['routine', 'evidence', 'structural', 'all']) {
  lines.push(`\n### ${group} (ms; N / mean / p50 / p95 / max)\n`, `| metric | ${Object.keys(results).join(' | ')} |`, `|---|${Object.keys(results).map(() => '---').join('|')}|`);
  for (const [key, label] of METRICS) lines.push(`| ${label} | ${Object.values(results).map(m => fmt(m.latency[group]?.[key])).join(' | ')} |`);
}
const r = (x) => (x && x.den != null ? `${x.num}/${x.den}${x.rate != null ? ` (${(x.rate * 100).toFixed(1)}%)` : ''}` : 'n/a');
lines.push('\n### quality and reliability\n', `| | ${Object.keys(results).join(' | ')} |`, `|---|${Object.keys(results).map(() => '---').join('|')}|`);
const rowsQ = [
  ['turns', m => m.turns], ['errored turns', m => m.errored], ['unavailable', m => m.unavailable ? 'yes' : 'no'],
  ['corpus golden traces (all reps)', m => `${m.hard.golden.passed}/${m.hard.golden.total}`],
  ['consent violations', m => m.hard.consent_violations], ['policy violations', m => m.hard.policy_violations], ['nonexistent resources', m => m.hard.nonexistent_resource_actions],
  ['spoken then replaced', m => m.hard.spoken_then_replaced], ['evidence corruption', m => m.hard.evidence_corruption],
  ['actions', m => r(m.quality.actions)], ['evidence', m => r(m.quality.evidence)], ['route', m => r(m.quality.route)],
  ['selection', m => r(m.quality_detail.selection)], ['evaluation ladder', m => r(m.quality_detail.evaluation)],
  ['authored card', m => r(m.quality_detail.authored_card)], ['Rabbit Hole turns', m => r(m.quality_detail.rabbit_hole)], ['return context', m => r(m.quality_detail.return_context)],
  ['invalid structured plans', m => r(m.reliability.invalid_plans)], ['routine fast-tier escalation', m => r(m.reliability.routine_fast_escalation)],
  ['cost / turn USD', m => m.cost_per_turn_usd], ['cost total USD', m => m.cost_total_usd],
  ['planner in tokens (mean / p95)', m => `${m.tokens.planner_in.mean} / ${m.tokens.planner_in.p95}`], ['planner out tokens (mean / p95)', m => `${m.tokens.planner_out.mean} / ${m.tokens.planner_out.p95}`],
  ['cache writes / reads (calls)', m => `${m.tokens.cache_writes} / ${m.tokens.cache_reads}`], ['cache read tokens', m => m.tokens.cache_read_tokens],
  ['JEV checks / call', m => m.v2.jev_checks_per_call], ['JEV checks / turn', m => m.v2.jev_checks_per_turn], ['JEV timeouts', m => r(m.v2.jev_timeouts)], ['JEV errors', m => r(m.v2.jev_errors)],
  ['JEV ms (N / mean / p50 / p95 / max)', m => fmt(m.v2.jev_ms)], ['larger-evaluator escalation', m => r(m.v2.larger_escalation)], ['larger ms', m => fmt(m.v2.larger_ms)],
  ['late evidence (off-path / landed / route changed / dropped)', m => `${m.late_evidence.off_path_turns} / ${m.late_evidence.with_evidence} / ${m.late_evidence.route_changed} / ${m.late_evidence.dependent_actions_dropped}`],
  ['early sentence', m => r(m.v2.early_sentence)], ['early question', m => r(m.v2.early_question)],
  ['fast-tier escalation reasons', m => JSON.stringify(m.v2.fast_tier_validation_failures)], ['calls by model', m => JSON.stringify(m.tokens.calls)],
];
for (const [label, get] of rowsQ) lines.push(`| ${label} | ${Object.values(results).map(get).join(' | ')} |`);
lines.push('\n### verdicts (live corpus golden traces as the golden gate)\n', '```', JSON.stringify(verdict, null, 1), '```', '\n### verdicts (unit golden traces as the golden gate)\n', '```', JSON.stringify(unitReading, null, 1), '```');
const all = Object.values(byArm).flat();
const calls = { jev: all.reduce((n, row) => n + (row.jev_calls || 0), 0), larger: all.reduce((n, row) => n + (row.larger_calls || 0), 0), planner_attempts: all.reduce((n, row) => n + (row.planner_calls || 0), 0) };
lines.push(`\nall corpus rows ${all.length}; JEV calls ${calls.jev}; larger-evaluator calls ${calls.larger}; planner attempts ${calls.planner_attempts}; corpus cost $${all.reduce((n, row) => n + (row.cost_usd || 0), 0).toFixed(2)}`);
writeFileSync(`${OUT}/report.md`, lines.join('\n') + '\n');
writeFileSync(`${OUT}/gates.json`, JSON.stringify({ results, ...verdict, unit_golden_reading: unitReading }, null, 2) + '\n');
console.log(lines.join('\n'));
