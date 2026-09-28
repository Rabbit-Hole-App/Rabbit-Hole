// packages/control-plane/src/learn-grade-report.js
// The side-by-side report over real canvas rows (docs/features/jev-grading.md).
// Counts and rates only - never prompt, idea or answer text. A row is
// eligible once it is 15 minutes old (longer than the 10-minute baseline cap)
// and of the current grader protocol; other rows count in `total` only.
import { GRADER_PROTOCOL_VERSION, THRESHOLDS, verdictFrom } from './learn-grade-jev.js';

export const rate = (k, n) => ({ k, n, pct: n ? Math.round((k / n) * 1000) / 10 : null });

export function percentile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

const mean = values => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

function section(rows, thresholds) {
  const eligible = rows.filter(row => row.eligible);
  const n = eligible.length;
  const where = test => eligible.filter(test).length;
  const done = eligible.filter(row => row.status === 'done');
  const verdictOf = row => verdictFrom(JSON.parse(row.jev), thresholds);
  const compared = done.filter(row => row.baseline_verdict === 'good' || row.baseline_verdict === 'partial');
  const table = { good: { good: 0, partial: 0 }, partial: { good: 0, partial: 0 }, unsure: { good: 0, partial: 0 } };
  let agree = 0;
  for (const row of compared) {
    const jev = verdictOf(row);
    table[jev][row.baseline_verdict] += 1;
    if (jev === row.baseline_verdict) agree += 1;
  }
  const parsed = where(row => row.baseline_verdict != null);
  const failedOrIncomplete = where(row => row.status === 'failed' || row.status === 'incomplete');
  const reasons = [];
  if (!n) reasons.push('no eligible rows');
  else {
    if (parsed / n < 0.95) reasons.push(`baseline parsed ${parsed}/${n} < 95%`);
    if (failedOrIncomplete / n > 0.05) reasons.push(`Jev failed+incomplete ${failedOrIncomplete}/${n} > 5%`);
  }
  if (compared.length < 50) reasons.push(`agreement N ${compared.length} < 50`);
  const jevMs = done.map(row => row.jev_ms).filter(Number.isFinite);
  const costs = done.map(row => row.jev_cost).filter(Number.isFinite);
  const baselineMs = eligible.filter(row => row.baseline_ms != null).map(row => row.baseline_ms);
  return {
    total: rows.length,
    eligible: n,
    jev: { done: rate(done.length, n), failed: rate(where(row => row.status === 'failed'), n), incomplete: rate(where(row => row.status === 'incomplete'), n) },
    baseline: {
      captured: rate(where(row => row.baseline_ms != null), n),
      missing: rate(where(row => row.baseline_ms == null), n),
      unparsed: rate(where(row => row.baseline_ms != null && row.baseline_verdict == null), n),
      parsed: rate(parsed, n),
    },
    // Grades where Jev returned nothing, so Opus's verdict stood alone.
    fallback: rate(failedOrIncomplete, n),
    agreement: rate(agree, compared.length),
    table,
    unsure: rate(done.filter(row => verdictOf(row) === 'unsure').length, done.length),
    jev_ms: { p50: percentile(jevMs, 0.5), p95: percentile(jevMs, 0.95), n: jevMs.length },
    jev_cost_per_grade: { mean: mean(costs), n: costs.length },
    baseline_ms: { p50: percentile(baselineMs, 0.5), p95: percentile(baselineMs, 0.95), n: baselineMs.length },
    decision_grade: reasons.length === 0,
    notice: reasons.length ? `agreement not decision-grade: ${reasons.join('; ')}` : null,
  };
}

export function reportFrom(rows, { protocol = GRADER_PROTOCOL_VERSION, thresholds = THRESHOLDS } = {}) {
  const marked = rows.map(row => ({ ...row, eligible: !!row.old_enough && row.grader_protocol_version === protocol }));
  return {
    grader_protocol_version: protocol,
    thresholds: { ...thresholds },
    overall: section(marked, thresholds),
    by_mode: {
      challenge: section(marked.filter(row => row.mode === 'challenge'), thresholds),
      explain_back: section(marked.filter(row => row.mode === 'explain_back'), thresholds),
    },
  };
}
