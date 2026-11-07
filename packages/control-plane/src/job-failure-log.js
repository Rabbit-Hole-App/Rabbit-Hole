// One structured log line per terminal generation-job failure (explain, animation, whiteboard, cad), readable in Cloudflare Workers
// Logs (observability is enabled in wrangler.jsonc): search for event = job_failed. A leaf module: no imports, never throws.
// Only ids, tokens and numbers: no prompt, brief, message, provider text, email or user id (docs/features/telemetry.md, "Job failure log line").
const token = value => (typeof value === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(value) ? value.toLowerCase() : null);
const count = value => (Number.isSafeInteger(value) && value >= 0 ? value : null);

// kind: explain | animation | whiteboard | cad. job: the saved job record, already failed. extra:
//   windowMs      the length of the deadline window, so elapsed_ms counts from when the window started (deadline - windowMs);
//                 without it elapsed_ms counts from createdAt
//   interrupted   true when a restart or eviction ended an in-flight call
//   stopReason, stage, category, retryable   override what the record says (whiteboard and cad keep theirs elsewhere)
export function logJobFailure(kind, job, extra = {}) {
  try {
    const now = Date.now(), failure = job?.failure || {};
    const stageMs = {};
    for (const entry of job?.timing?.stages || []) {
      const name = token(entry?.stage);
      if (name && Number.isFinite(entry.startedAt)) stageMs[name] = (stageMs[name] || 0) + Math.max(0, (entry.endedAt ?? now) - entry.startedAt);
    }
    const calls = {};
    for (const call of job?.calls || []) { const role = token(call?.role); if (role) calls[role] = (calls[role] || 0) + 1; }
    const start = Number.isFinite(job?.deadline) && Number.isFinite(extra.windowMs) ? job.deadline - extra.windowMs : job?.createdAt;
    console.log(JSON.stringify({
      event: 'job_failed', kind,
      job_id: typeof job?.id === 'string' ? job.id.slice(0, 80) : null,
      stage: token(extra.stage ?? failure.stage), stop_reason: token(extra.stopReason ?? job?.stopReason),
      category: token(extra.category ?? failure.category), retryable: typeof (extra.retryable ?? failure.retryable) === 'boolean' ? (extra.retryable ?? failure.retryable) : null,
      attempt: count(job?.attempt), elapsed_ms: Number.isFinite(start) ? Math.max(0, now - start) : null,
      stage_ms: stageMs, calls, interrupted: extra.interrupted === true,
    }));
  } catch { /* a log line must never change what a job does */ }
}
