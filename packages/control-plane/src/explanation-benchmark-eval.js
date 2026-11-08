// EXP-09-C05 / EXP-11-C07 (docs/features/explain.md): the deterministic, OFFLINE evaluator and the derived summary / report for the written /explain benchmark.
// The evaluator checks a saved card against a frozen rubric (expected facts, number tolerances, forbidden claims, required visuals). It is a text-pattern check:
// it can prove a seeded defect is caught, not that arbitrary prose is true. Disputed or open-ended facts still need independent or human review (rubric.reviewRequired).
// A model-based evaluator is only a stub that refuses to run without an evaluator profile and a concrete paid cap. A leaf: no env, no fetch, no fs.
import { explanationText } from './learn-primitives.js';
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';

export class EvaluatorRefusedError extends Error { constructor(message) { super(message); this.name = 'EvaluatorRefusedError'; } }
export const DETERMINISTIC_EVALUATOR = Object.freeze({ id: 'deterministic-offline-v1', kind: 'deterministic', modelCalls: 0, profile: null });
const re = source => new RegExp(source, 'i');
const NUMBER = /-?\d*\.?\d+/g;

function diagramsOf(block) {
  return [block?.body, ...(block?.more || []).map(s => s?.text)].flatMap(md => [...String(md ?? '').matchAll(/```\s*rh-diagram\s*\n([\s\S]*?)\n```/gi)].map(m => { try { return parseTutorDiagram(m[1]).diagram; } catch { return null; } })).filter(Boolean);
}
const tableText = block => [block?.body, ...(block?.more || []).map(s => s?.text)].flatMap(md => String(md ?? '').split('\n').filter(l => /^\s*\|.*\|\s*$/.test(l))).join(' ').toLowerCase();

function visualCheck(spec, block) {
  if (spec.kind === 'table') {
    const text = tableText(block);
    const missing = (spec.mustMention || []).filter(word => !text.includes(word.toLowerCase()));
    return { id: `visual:table`, pass: !!text && !missing.length, detail: !text ? 'no table rows in the card' : missing.length ? `table lacks ${missing.join(', ')}` : 'table found' };
  }
  const flow = diagramsOf(block).find(d => d.kind === 'flow');
  if (!flow) return { id: 'visual:flow', pass: false, detail: 'no valid flow diagram in the card' };
  const labels = new Set(flow.edges.map(e => String(e.label || '').trim().toLowerCase()));
  const lacking = (spec.edgeLabels || []).filter(l => !labels.has(l));
  const label = id => String(flow.nodes.find(n => n.id === id)?.label ?? '');
  const path = flow.highlightPath || [];
  const trace = spec.trace;
  const traced = !trace || (path.length >= 2 && re(trace.first).test(label(path[0])) && re(trace.last).test(label(path.at(-1))) && (trace.through || []).every(t => path.some(id => re(t).test(label(id)))));
  return { id: 'visual:flow', pass: !lacking.length && traced, detail: lacking.length ? `edges lack ${lacking.join(', ')}` : traced ? 'flow with the expected branches and trace' : 'the highlighted route is not the expected trace' };
}

// -> { checks:[{id,kind,severity,pass,detail}], factualPass, requiredOutputPass, majorErrors, minorErrors, omissions, flags:[...] }
export function evaluateCard(block, rubric) {
  const text = explanationText(block);
  const checks = [];
  for (const f of rubric.facts || []) checks.push({ id: `fact_missing:${f.id}`, kind: 'fact', severity: f.severity, pass: f.patterns.some(p => re(p).test(text)), detail: f.description });
  for (const f of rubric.forbidden || []) checks.push({ id: `forbidden:${f.id}`, kind: 'forbidden', severity: f.severity, pass: !re(f.pattern).test(text), detail: f.description });
  for (const c of rubric.calculations || []) {
    const cue = new RegExp(c.cue, 'gi'); let ok = false, m;
    while (!ok && (m = cue.exec(text))) ok = (text.slice(m.index, m.index + (c.window || 140)).match(NUMBER) || []).some(n => Math.abs(Number(n) - c.expected) <= c.tolerance);
    checks.push({ id: `calc_failed:${c.id}`, kind: 'calculation', severity: c.severity, pass: ok, detail: `${c.description} (expected ${c.expected} +/- ${c.tolerance})` });
  }
  for (const v of rubric.visuals || []) checks.push({ ...visualCheck(v, block), kind: 'visual', severity: 'major' });
  const failed = checks.filter(c => !c.pass);
  const content = c => c.kind !== 'visual';
  return { checks, factualPass: !failed.some(c => content(c) && c.severity === 'major'), requiredOutputPass: !failed.some(c => c.kind === 'visual'),
    majorErrors: failed.filter(c => c.severity === 'major').length, minorErrors: failed.filter(c => c.severity !== 'major').length, omissions: failed.filter(c => c.kind === 'fact').length, flags: failed.map(c => c.id) };
}
// A failed attempt delivered no card: it is a factual and required-output failure, never silently excluded. flags carry the production validator's own stable codes.
export const validatorCodes = text => [...new Set(String(text ?? '').match(/\b(?:explanation|required_visual)_[a-z_]+\b/g) || [])];
export function evaluateFailure(reason) {
  return { checks: [], factualPass: false, requiredOutputPass: false, majorErrors: 0, minorErrors: 0, omissions: 0, flags: ['no_card', ...validatorCodes(reason)] };
}

// The deterministic evaluator's single call record (an offline check makes no provider call: cost is a true known zero, distinct from a model evaluator's unknown).
export const deterministicEvaluator = {
  ...DETERMINISTIC_EVALUATOR,
  async evaluate({ block, rubric, failureReason }) {
    const evaluation = block ? evaluateCard(block, rubric) : evaluateFailure(failureReason);
    return { evaluation: { evaluator: DETERMINISTIC_EVALUATOR.id, ...evaluation }, calls: [{ role: 'evaluator', category: 'evaluation', kind: 'deterministic', providerCall: false, requested: null, usage: { input: null, output: null, cache: null, reasoning: null }, cost: { usd: 0, known: true } }] };
  },
};
// ponytail: a model-based evaluator (independent factual review, blinded provider labels) needs a verified evaluator profile and a paid cap; none is authorized, so this refuses.
export const modelEvaluatorStub = {
  id: 'model-evaluator-stub', kind: 'model', modelCalls: null, profile: null,
  async evaluate() { throw new EvaluatorRefusedError('A model-based evaluator needs its own evaluator profile and a concrete paid cap, and none is configured, so it did not run.'); },
};

// Seeded-defect check: does the harness flag this calibration attempt as the rubric expects, and does it leave the clean control unflagged?
export function calibrationVerdict(flags, calibration) {
  const signal = calibration.signal ? new RegExp(calibration.signal) : null;
  const matched = signal ? flags.filter(f => signal.test(f)) : [];
  if (!calibration.expectFlag) return { expectFlag: false, flagged: flags.length > 0, ok: flags.length === 0, matched };
  return { expectFlag: true, flagged: flags.length > 0, ok: matched.length > 0, matched };
}

// ---- derived summary ---------------------------------------------------------------------------------------------------------------------------------
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
const median = values => (values.length ? (v => (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2))([...values].sort((a, b) => a - b)) : null);
export const SUMMARY_COLUMNS = ['profile', 'profile_hash', 'stratum', 'total', 'success', 'failed', 'factual_pass_rate', 'major_errors', 'required_output_pass_rate', 'usable_ms_median', 'usable_ms_p95', 'usable_n', 'repair_attempts', 'repair_ms_median', 'repair_n', 'known_cost_usd', 'unknown_cost_count', 'evaluator_known_cost_usd', 'evaluator_unknown_cost_count'];
const rate = (n, d) => (d ? Number((n / d).toFixed(4)) : null);
const sumKnown = items => Number(items.filter(c => c?.known).reduce((n, c) => n + c.usd, 0).toFixed(6));

// Failures stay in every denominator. Latency statistics cover delivered cards only and carry their sample count. Calibration attempts are not profile results.
export function summarize(rows) {
  const real = rows.filter(r => r.kind === 'benchmark');
  const profiles = [...new Map(real.map(r => [r.profile.id, r.profile])).values()];
  const out = [];
  for (const profile of profiles) {
    const mine = real.filter(r => r.profile.id === profile.id);
    const strata = [['all', () => true], ...['depth', 'entry', 'cache'].flatMap(key => [...new Set(mine.map(r => r[key]))].sort().map(v => [`${key}=${v}`, r => r[key] === v]))];
    for (const [stratum, pick] of strata) {
      const set = mine.filter(pick), delivered = set.filter(r => r.status === 'success'), repaired = set.filter(r => r.repaired);
      const times = delivered.map(r => r.timings.usableCardMs).filter(Number.isFinite), fixes = repaired.map(r => r.timings.repairMs).filter(Number.isFinite);
      out.push({ profile: profile.id, profile_hash: profile.hash, stratum, total: set.length, success: delivered.length, failed: set.length - delivered.length,
        factual_pass_rate: rate(set.filter(r => r.factualPass).length, set.length), major_errors: set.reduce((n, r) => n + r.majorErrors, 0), required_output_pass_rate: rate(set.filter(r => r.requiredOutputPass).length, set.length),
        usable_ms_median: median(times), usable_ms_p95: percentile(times, 0.95), usable_n: times.length, repair_attempts: repaired.length, repair_ms_median: median(fixes), repair_n: fixes.length,
        known_cost_usd: sumKnown(set.map(r => r.cost)), unknown_cost_count: set.filter(r => !r.cost.known).length,
        evaluator_known_cost_usd: sumKnown(set.map(r => r.evaluatorCost)), evaluator_unknown_cost_count: set.filter(r => !r.evaluatorCost.known).length });
    }
  }
  return out;
}
const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const summaryCsv = summary => `${SUMMARY_COLUMNS.join(',')}\n${summary.map(r => SUMMARY_COLUMNS.map(c => cell(r[c])).join(',')).join('\n')}${summary.length ? '\n' : ''}`;

export const calibrationSummary = rows => {
  const cal = rows.filter(r => r.kind === 'calibration');
  const seeded = cal.filter(r => r.calibration?.expectFlag), controls = cal.filter(r => r.calibration && !r.calibration.expectFlag);
  return { seeded: seeded.length, detected: seeded.filter(r => r.calibration.ok).length, missed: seeded.filter(r => !r.calibration.ok).map(r => r.caseId), controls: controls.length, falsePositives: controls.filter(r => !r.calibration.ok).map(r => r.caseId) };
};

const BANNERS = {
  fixture: 'FIXTURE RUN. Every model reply was a scripted offline provider double. No model generated any card and no provider was contacted. This proves the harness wiring, the production validator path and the evaluator only. It is NOT live evidence and must never be compared with, or presented as, live generation.',
  dry: 'DRY RUN. This is a plan: nothing was generated, no provider was contacted, no card exists. It is NOT live evidence.',
  live: 'LIVE RUN.',
};
// ponytail: no winner is ever inferred here. Live ranking against thresholds.json needs paired confirmation and held-out evidence that no authorized run has produced; add it with the first live run.
export const noWinner = type => ({ winner: null, reason: type === 'live' ? 'Live ranking is not implemented in this harness version, so no profile is recommended.' : `A ${type} run cannot select a model: ${type === 'fixture' ? 'its replies are scripted' : 'it generated nothing'}. No winner.` });

const f = v => (v == null ? 'n/a' : v);
export function reportMarkdown({ manifest, summary, rows, plan, calibration }) {
  const lines = [`# Explain benchmark report: ${manifest.runId}`, '', `> ${BANNERS[manifest.type]}`, '',
    `- Run type: **${manifest.type}**; status: ${manifest.status}; code SHA: \`${manifest.codeSha}\`${manifest.codeDirty ? ' (working tree had uncommitted changes)' : ''}`,
    `- Corpus: ${manifest.corpus.id} v${manifest.corpus.version}, hash \`${manifest.corpus.hash.slice(0, 16)}\`; expected facts hash \`${manifest.expectedFactsHash.slice(0, 16)}\``,
    `- Evaluator: ${manifest.evaluator.id} (${manifest.evaluator.kind}); authorized paid cap: ${manifest.authorizedCapUsd == null ? 'none (no paid call is possible)' : manifest.authorizedCapUsd}`, ''];
  if (plan) lines.push('## Plan', '', `${plan.attemptCount} benchmark attempts and ${plan.calibrationCount} calibration attempts planned across ${plan.profiles.length} profiles.`, '',
    '| Profile | Author | Repair | Max provider calls per attempt | Output token ceiling per attempt | Cost bound |', '| --- | --- | --- | --- | --- | --- |',
    ...plan.profiles.map(p => `| ${p.id} | ${p.author} | ${p.repair} | ${p.ceilings.maxProviderCallsPerAttempt} | ${p.ceilings.outputTokenCeilingPerAttempt} | ${p.costBound} |`), '');
  if (manifest.type !== 'dry') {
    lines.push('## Factuality versus speed (all cases)', '', 'Failures, invalid output and timeouts stay in every denominator. Latency covers delivered cards only and shows its sample count.', '',
      '| Profile | Attempts | Delivered | Factual pass | Required output pass | Major errors | Usable ms median | p95 | n | Repairs | Known cost USD | Unknown-cost attempts |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...summary.filter(r => r.stratum === 'all').map(r => `| ${r.profile} | ${r.total} | ${r.success} | ${f(r.factual_pass_rate)} | ${f(r.required_output_pass_rate)} | ${r.major_errors} | ${f(r.usable_ms_median)} | ${f(r.usable_ms_p95)} | ${r.usable_n} | ${r.repair_attempts} | ${r.known_cost_usd} | ${r.unknown_cost_count} |`), '');
  }
  const verdict = noWinner(manifest.type);
  lines.push('## Recommendation', '', `**No winner.** ${verdict.reason}`, '', 'Promotion to a production profile is an explicit reviewed configuration change with a rollback profile, never a benchmark side effect.', '');
  if (calibration && (calibration.seeded || calibration.controls)) {
    lines.push('## Evaluator checks (seeded defects)', '', `Seeded defects flagged: ${calibration.detected} of ${calibration.seeded}${calibration.missed.length ? ` (missed: ${calibration.missed.join(', ')})` : ''}. Clean controls flagged: ${calibration.falsePositives.length} of ${calibration.controls}${calibration.falsePositives.length ? ` (${calibration.falsePositives.join(', ')})` : ''}.`, '',
      '| Calibration case | Expected | Flags | Result |', '| --- | --- | --- | --- |',
      ...rows.filter(r => r.kind === 'calibration').map(r => `| ${r.caseId} | ${r.calibration.expectFlag ? 'flagged' : 'clean'} | ${r.flags.join(', ') || 'none'} | ${r.calibration.ok ? 'ok' : 'WRONG'} |`), '');
  }
  const bad = rows.filter(r => r.kind === 'benchmark' && (r.status !== 'success' || !r.factualPass || !r.requiredOutputPass));
  if (rows.length) {
    lines.push('## Attempts that failed or did not pass the checks', '', bad.length ? '| Attempt | Case | Profile | Status | Stage | Reason / flags | Artifacts |\n| --- | --- | --- | --- | --- | --- | --- |' : 'None.');
    for (const r of bad) lines.push(`| ${r.attemptId} | ${r.caseId} | ${r.profile.id} | ${r.status} | ${r.failureStage ?? 'none'} | ${(r.failureReason ?? r.flags.join(', ')).replace(/\|/g, '/').slice(0, 140)} | [attempt](${r.artifactRef}) |`);
    lines.push('', '## All attempts (source rows)', '', 'One row per attempt in `results.jsonl`; open the linked directory for the request snapshot, outputs, validation and `evaluation.json`.', '', '| Attempt | Case | Depth | Profile | Status | Delivered ms | Link |', '| --- | --- | --- | --- | --- | --- | --- |',
      ...rows.map(r => `| ${r.attemptId} | ${r.caseId} | ${r.depth} | ${r.profile.id} | ${r.status} | ${f(r.timings.usableCardMs)} | [attempt](${r.artifactRef}) |`), '');
  }
  lines.push('## Limitations', '', ...manifest.limitations.map(l => `- ${l}`), '');
  return lines.join('\n');
}
