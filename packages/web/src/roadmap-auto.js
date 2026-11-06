// R6.03: measuring the automatic next proposal from the learner's side, and the quick follow-up reads after a delivery. Pure and clock-injected, so it is
// tested with a fake clock. The server decides whether a proposal appears (Auto-suggest, mode, Cancel, End); this only times it and never predicts it.
// A sample is delivery acknowledged -> the pending proposal first applied from a server view. The 1-2 second goal is reported from these samples, never assumed.

export const FOLLOW_UP_MS = Object.freeze([1000, 3000]); // two extra reads after an acknowledged delivery, then the normal poll cadence

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}
export const summarize = samples => ({ n: samples.length, p50: percentile(samples.map(s => s.ackToVisibleMs), 50), p95: percentile(samples.map(s => s.ackToVisibleMs), 95) });

export function createAutoMeter({ now = () => Date.now() } = {}) {
  let ackedAt = null, shown = null;
  const samples = [];
  return {
    // The server accepted a delivery acknowledgment: the clock starts.
    ack() { ackedAt = now(); },
    // The learner asked for the next step themselves (Propose next step): that proposal is not automatic, so it is not a sample.
    manual() { ackedAt = null; },
    // Every view the client applied. The first time a pending proposal id/version appears after an acknowledgment it closes one sample.
    observe(view) {
      const p = view?.proposal;
      const key = p && p.state === 'pending' ? `${p.id}:${p.version}` : null;
      if (key && key !== shown) { shown = key; if (ackedAt != null) { samples.push({ ackToVisibleMs: now() - ackedAt }); ackedAt = null; } }
      if (!key) shown = null;
    },
    samples: () => samples.map(s => ({ ...s })),
    summary: () => summarize(samples),
  };
}
