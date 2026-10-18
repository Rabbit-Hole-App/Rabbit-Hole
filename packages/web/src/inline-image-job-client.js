// Transport only: ready is not Accept. Caller owns persisted ticket scope and
// current canvas/revision checks before presenting or applying the proposal.
const ROOT = '/api/learn/files/image-edits';
const ID = /^ij_[a-f0-9]{32}$/, SOURCE = /^fs_[a-f0-9]{24}$/, HASH = /^[a-f0-9]{64}$/;
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const PHASES = new Set(['queued', 'admitting', 'started', 'publishing', 'ready', 'cancelled', 'refused', 'unknown']);
const TERMINAL = new Set(['ready', 'cancelled', 'refused', 'unknown']);
const fault = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
function bindingOf(input) {
  if (!input || !matches(SOURCE, input.sourceId) || !matches(HASH, input.sourceSha256) ||
      ['app', 'board', 'cardId'].some(key => typeof input[key] !== 'string' || !input[key] || input[key].length > 200) ||
      !['remove_background', 'edit_image'].includes(input.operation) || !matches(/^[A-Za-z0-9_.:-]{8,128}$/, input.idempotencyKey)) {
    throw fault('invalid_binding', 'A saved source and exact canvas scope are required.');
  }
  return Object.freeze(Object.fromEntries(['sourceId', 'sourceSha256', 'app', 'board', 'cardId', 'operation', 'idempotencyKey'].map(key => [key, input[key]])));
}
function ticketOf(raw) {
  if (raw?.version !== 1 || !matches(ID, raw.id)) throw fault('invalid_ticket', 'Invalid image job ticket.');
  return Object.freeze({ version: 1, id: raw.id, binding: bindingOf(raw.binding) });
}
function validateJob(job, ticket) {
  if (!job || !matches(ID, job.id) || ticket.id && job.id !== ticket.id || job.sourceSha256 !== ticket.binding.sourceSha256 ||
      !PHASES.has(job.phase) || job.phase === 'ready' && !matches(SOURCE, job.artifactId)) {
    throw fault('invalid_response', 'The image job does not match this source.');
  }
  return Object.freeze({ id: job.id, phase: job.phase, cancelRequested: !!job.cancelRequested,
    artifactId: job.phase === 'ready' ? job.artifactId : null, sourceSha256: job.sourceSha256,
    reservation: typeof job.reservation === 'string' ? job.reservation : null,
    reason: typeof job.reason === 'string' ? job.reason : null });
}
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export function createImageJobClient({ fetchImpl = globalThis.fetch, headers = {}, pollMs = 1000 } = {}) {
  if (!Number.isFinite(pollMs) || pollMs < 0 || pollMs > 30000) throw fault('invalid_poll', 'Invalid polling interval.');
  async function request(path, method, body, signal) {
    signal?.throwIfAborted();
    const response = await fetchImpl(path, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal });
    if (!response.ok) throw fault('http_error', 'Image job request failed.', { status: response.status });
    return (await response.json()).job;
  }
  const status = async (raw, { signal } = {}) => {
    const ticket = ticketOf(raw);
    return validateJob(await request(`${ROOT}/${ticket.id}`, 'GET', null, signal), ticket);
  };
  return {
    async submit(input, { signal } = {}) {
      const binding = bindingOf(input);
      if (input.paidConfirmation !== true) throw fault('confirmation_required', 'Confirm the image operation before submitting.');
      if (signal?.aborted) throw fault('wait_aborted', 'No image request was submitted.', { submissionStarted: false });
      const payload = { ...binding, paidConfirmation: true };
      delete payload.sourceSha256; // Server independently binds the saved immutable revision.
      if (binding.operation === 'edit_image') {
        if (!matches(SOURCE, input.maskSourceId) || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 2000) throw fault('invalid_input', 'Regional editing requires a mask and prompt.');
        payload.maskSourceId = input.maskSourceId;
        payload.prompt = input.prompt;
      } else if (input.maskSourceId != null || input.prompt != null) throw fault('invalid_input', 'Background removal does not accept a mask or prompt.');
      let job;
      try { job = validateJob(await request(ROOT, 'POST', payload, signal), { binding }); }
      catch (cause) { throw fault('submission_unknown', 'Submission was not confirmed. Do not automatically resubmit.', { binding, status: cause.status, submissionStarted: true }); }
      return ticketOf({ version: 1, id: job.id, binding });
    },
    status,
    async cancel(raw, { signal } = {}) {
      const ticket = ticketOf(raw);
      return validateJob(await request(`${ROOT}/${ticket.id}/cancel`, 'POST', {}, signal), ticket);
    },
    async resume(raw, { signal, onProgress, timeoutMs = 180000 } = {}) {
      const ticket = ticketOf(raw);
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 600000) throw fault('invalid_timeout', 'Invalid wait duration.');
      const timeout = AbortSignal.timeout(timeoutMs);
      const waiting = signal ? AbortSignal.any([signal, timeout]) : timeout;
      try {
        for (;;) {
          const job = await status(ticket, { signal: waiting });
          waiting.throwIfAborted();
          onProgress?.(job);
          waiting.throwIfAborted();
          if (TERMINAL.has(job.phase)) {
            const proposal = job.phase === 'ready' && !job.cancelRequested ? Object.freeze({ kind: 'image_job_ready', jobId: ticket.id,
              artifactId: job.artifactId, binding: ticket.binding, requiresExplicitAccept: true }) : null;
            return Object.freeze({ job, proposal });
          }
          await pause(pollMs, waiting);
        }
      } catch (cause) {
        if (signal?.aborted) throw fault('wait_aborted', 'Stopped waiting; remote cancellation is not confirmed.', { ticket });
        if (timeout.aborted) throw fault('wait_timeout', 'The job may still be running. Resume this ticket later.', { ticket });
        throw cause;
      }
    },
  };
}
