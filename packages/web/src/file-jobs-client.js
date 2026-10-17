// The browser side of durable file jobs (docs/features/canvas-file-imports.md section 5; server:
// control-plane/src/file-jobs.js). The browser submits once with an idempotency key derived from the card, and after a
// reload only reads status: reopening a canvas reconnects each card to its job and never starts a second import. Status
// reads never advance a job; the server's Durable Object does. Pure module: the caller passes fetch and applies updates.

// The stage a card shows. No percentage: a conversion's progress is its stage (owner spec section 8).
export const JOB_STAGE_LABELS = {
  queued: 'Queued', validating: 'Validating', converting: 'Converting', preparing_preview: 'Preparing preview',
  ready: 'Ready', ready_with_limitations: 'Ready with limitations', failed: 'Failed', cancelled: 'Cancelled',
};
export const TERMINAL_STATES = ['ready', 'ready_with_limitations', 'failed', 'cancelled'];
export const isTerminal = job => TERMINAL_STATES.includes(job?.state);
export const stageLabel = job => (job?.cancelRequested && !isTerminal(job) ? 'Cancelling' : JOB_STAGE_LABELS[job?.state] || 'Queued');

// One key per (card, converter, source revision): a repeated submit (double click, retry of a lost response, reload
// mid-request) returns the same job.
export const jobIdempotencyKey = ({ cardId, converter, sourceRev }) =>
  `card:${String(cardId).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64)}:${converter}:${String(sourceRev).slice(0, 16)}`;

export async function submitFileJob(fetchImpl, { sourceId, sourceRev, cardId, converter, options = {}, app, board = 'main' }) {
  const r = await fetchImpl(`/api/learn/files/${sourceId}/jobs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ converter, options, card: cardId, app, board, idempotency_key: jobIdempotencyKey({ cardId, converter, sourceRev }) }),
  });
  const body = await r.json().catch(() => ({}));
  if (!body.job) throw new Error(body.error || 'The conversion could not be started.');
  return body.job;
}

// The cards on a board that point at a job: { cardId, jobId, sourceId }. Only cards still on the board are watched, so a
// result for a removed card is never applied (the job itself never writes the board).
export const jobCards = blocks => (blocks || []).filter(b => b?.fileRef?.job && b.fileRef.source?.id)
  .map(b => ({ cardId: b.id, jobId: b.fileRef.job, sourceId: b.fileRef.source.id }));

// Watch every job the board's cards reference until each settles. `onJob(cardId, job)` gets every status read whose
// card is still on the board. `update(blocks)` re-reads the board (a card removed or undone stops being watched);
// `stop()` ends it all. `share` reads through a share link (contract 4.1). Polling backs off to `maxMs`.
export function watchFileJobs({ blocks, fetchImpl, onJob, share = null, intervalMs = 2_000, maxMs = 15_000, timers = globalThis }) {
  let cards = jobCards(blocks), stopped = false;
  const timersById = new Map(), delays = new Map();
  const live = jobId => !stopped && cards.some(c => c.jobId === jobId);
  const schedule = (jobId, ms) => { timers.clearTimeout(timersById.get(jobId)); timersById.set(jobId, timers.setTimeout(() => read(jobId), ms)); };
  async function read(jobId) {
    if (!live(jobId)) return;
    let job = null;
    try {
      const r = await fetchImpl(`/api/learn/files/jobs/${jobId}${share ? `?share=${encodeURIComponent(share)}` : ''}`);
      if (r.status === 404) { timersById.delete(jobId); return; } // gone or no longer readable: stop, never resubmit
      job = (await r.json()).job;
    } catch { /* offline: try again later */ }
    if (!live(jobId)) return;
    if (job) for (const c of cards) if (c.jobId === jobId) onJob(c.cardId, job);
    if (job && isTerminal(job)) { timersById.delete(jobId); return; }
    const next = Math.min((delays.get(jobId) || intervalMs) * 1.5, maxMs);
    delays.set(jobId, next);
    schedule(jobId, next);
  }
  const start = () => { for (const jobId of new Set(cards.map(c => c.jobId))) if (!timersById.has(jobId)) { timersById.set(jobId, null); read(jobId); } };
  start();
  return {
    update(nextBlocks) {
      cards = jobCards(nextBlocks);
      for (const [jobId, t] of timersById) if (!live(jobId)) { timers.clearTimeout(t); timersById.delete(jobId); }
      start();
    },
    stop() { stopped = true; for (const t of timersById.values()) timers.clearTimeout(t); timersById.clear(); },
  };
}

// A card's results without its job (lead ruling 2026-10-16): a forked or shared card finds the ready derivatives of its
// source revision for its family's converter and options. None yet: the card shows FORK_PENDING_LABEL, never a new job.
export const FORK_PENDING_LABEL = 'Converting in the original canvas';
// The same hash the server stores as file_derivatives.options_hash (file-jobs.js optionsHash).
export async function jobOptionsHash(options = {}) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(options, Object.keys(options).sort())));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function fetchDerivatives(fetchImpl, { sourceId, rev, converter, options = {}, app = null, board = 'main', share = null }) {
  const q = new URLSearchParams({ sha: rev, converter, options: await jobOptionsHash(options) });
  if (share) q.set('share', share); else if (app) { q.set('app', app); q.set('board', board); }
  const r = await fetchImpl(`/api/learn/files/sources/${sourceId}/derivatives?${q}`);
  if (!r.ok) return null; // not readable from here: the card keeps its fallback, never retries as an import
  return (await r.json()).derivatives;
}
