// Conversion jobs for lane 2's converter formats (DOC previews, PPTX slide images), against the job contract in
// docs/features/canvas-file-imports.md sections 4.2 and 5 and the converter API (canvas-file-converter.md section 1). The
// browser only submits and reads: it never advances a job, and a late result shows only on a card that still names the job.
// ponytail: awaiting converter. The /api/learn/files routes and the runner are lane 1 / JOBS; nothing here runs until a card
// holds a fileRef with a job id.

// What lane 2 asks a converter for, and what it expects back (derivative kinds, converter API 1.6).
export const DOC_JOBS = {
  doc: { converter: 'office-pdf', options: { poster: true }, expects: ['preview', 'text', 'poster'] },
  pptx: { converter: 'slides', options: { width: 1280 }, expects: ['preview', 'slide', 'text'] },
};
// The request for a source: a slide range (1-based, inclusive, converter 1.3) narrows the slide images; the PDF holds every slide.
export function jobRequest(format, { from = null, to = null } = {}) {
  const job = DOC_JOBS[format];
  if (!job) return null;
  const options = { ...job.options, ...(format === 'pptx' && from && to ? { from, to } : {}) };
  return { converter: job.converter, options };
}
// One key per card, source revision, converter and options: a retry or a second tab submits the same job, never a new one.
export const idempotencyKey = ({ card, rev, converter, options }) => `${card}:${rev}:${converter}:${JSON.stringify(options, Object.keys(options).sort())}`;

// The card's line for a job state (contract 5.1). No invented percentage: a stage is named, not measured.
const STATES = {
  queued: { label: 'Queued', tone: 'wait' },
  validating: { label: 'Checking the file', tone: 'wait' },
  converting: { label: 'Converting', tone: 'wait' },
  preparing_preview: { label: 'Preparing the preview', tone: 'wait' },
  ready: { label: 'Ready', tone: 'done' },
  ready_with_limitations: { label: 'Ready with limitations', tone: 'done' },
  failed: { label: 'Failed', tone: 'error' },
  cancelled: { label: 'Cancelled', tone: 'error' },
};
export function jobView(job) {
  const state = STATES[job?.state] || { label: 'Unknown state', tone: 'error' };
  const terminal = ['ready', 'ready_with_limitations', 'failed', 'cancelled'].includes(job?.state);
  return {
    ...state, terminal,
    canCancel: !terminal && !job?.cancel_requested,
    canRetry: job?.state === 'failed' || job?.state === 'cancelled',
    limitations: Array.isArray(job?.limitations) ? job.limitations : [],
    error: job?.state === 'failed' ? String(job.error || 'The conversion failed.') : null,
  };
}

// The routes (contract 4.2), through the page's api() so a session error is the page's own.
export const submitJob = (api, sourceId, body) => api(`/api/learn/files/${encodeURIComponent(sourceId)}/jobs`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
export const readJob = (api, jobId) => api(`/api/learn/files/jobs/${encodeURIComponent(jobId)}`);
export const cancelJob = (api, sourceId, jobId) => api(`/api/learn/files/${encodeURIComponent(sourceId)}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
export const retryJob = (api, sourceId, jobId) => api(`/api/learn/files/${encodeURIComponent(sourceId)}/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
// Poll spacing: quick while a job is new, slower while it runs long; nothing polls a terminal job.
export const pollDelay = attempt => Math.min(15000, 1500 * 2 ** Math.min(attempt, 4));
