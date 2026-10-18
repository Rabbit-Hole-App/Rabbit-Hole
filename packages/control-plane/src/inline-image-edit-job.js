// Unexposed durable one-attempt coordinator. Caller owns permissions, scheduling and board Accept.
// Spend wrappers must be bound to trusted user/org and the existing rolling 24h ledger, not CAD/monthly budgets.
// storage.transaction must serialize durable get/put. Never pass image bytes or secrets in create().
const error = (code, message) => Object.assign(new Error(message), { code });
const keyOf = id => `image-edit:${id}`;
const idOK = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);
const hashOK = hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash);
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const clone = value => structuredClone(value);

export function createImageEditJobCoordinator({ storage, admitSpend, settleSpend, edit, publish, now = Date.now }) {
  if (!storage?.transaction || ![admitSpend, settleSpend, edit, publish].every(fn => typeof fn === 'function')) throw error('invalid_configuration', 'Durable storage and bound job dependencies are required.');
  const active = new Map(), controllers = new Map();
  const change = (id, fn) => storage.transaction(async tx => {
    const key = keyOf(id), job = await tx.get(key);
    const next = await fn(job);
    if (next) await tx.put(key, next);
    return clone(next || job);
  });
  const get = async id => {
    if (!idOK(id)) throw error('invalid_input', 'Invalid image job ID.');
    return clone(await storage.get(keyOf(id)) || null);
  };
  async function hold(id, reason) {
    return change(id, job => job && ({ ...job, phase: 'unknown', reservation: 'held', reason, updatedAt: now() }));
  }
  async function execute(id, bytes) {
    // Snapshot before hashing/admission so caller mutation cannot change the authorized upload.
    if (bytes && typeof bytes === 'object') bytes = { ...bytes, image: bytes.image instanceof Uint8Array && bytes.image.byteLength <= 5 * 1024 * 1024 ? bytes.image.slice() : bytes.image, ...(bytes.mask instanceof Uint8Array && bytes.mask.byteLength < 4 * 1024 * 1024 ? { mask: bytes.mask.slice() } : {}) };
    const original = await get(id);
    if (!original) throw error('not_found', 'Image job not found.');
    if (['ready', 'cancelled', 'unknown', 'refused'].includes(original.phase)) return original;
    if (original.phase !== 'queued') return hold(id, 'recovered_incomplete_attempt');
    if (!(bytes?.image instanceof Uint8Array) || bytes.image.byteLength > 5 * 1024 * 1024 || await digest(bytes.image) !== original.request.sourceSha256) throw error('source_mismatch', 'Original image bytes do not match the immutable job.');
    if (original.request.maskSha256) {
      if (!(bytes.mask instanceof Uint8Array) || bytes.mask.byteLength >= 4 * 1024 * 1024 || await digest(bytes.mask) !== original.request.maskSha256) throw error('source_mismatch', 'Mask bytes do not match the immutable job.');
    } else if (bytes.mask != null) throw error('source_mismatch', 'This job has no authorized mask.');
    if (bytes.prompt != null || Object.keys(bytes).some(key => !['image', 'mask', 'signal'].includes(key))) throw error('invalid_input', 'Run accepts only bound image bytes, mask bytes and cancellation signal.');
    if (bytes.signal?.aborted) return cancel(id);
    const claim = crypto.randomUUID();
    const claimed = await change(id, job => job?.phase === 'queued' && !job.cancelRequested ? { ...job, phase: 'admitting', claim, reservation: 'uncertain', updatedAt: now() } : job);
    if (claimed.claim !== claim || claimed.phase !== 'admitting') return claimed;
    let admission;
    try {
      admission = await admitSpend({ opId: claimed.operationId, category: 'image_edit', reservedUsd: claimed.request.reservedUsd, now: Math.floor(now() / 1000), deadlineAt: Math.floor(now() / 1000) + 120 });
    } catch { return hold(id, 'admission_outcome_unknown'); }
    if (!admission || admission.refused !== false) {
      // The ledger turns uncertain database failures into a refusal. That does not
      // establish that INSERT failed, so never assert no reservation for that case.
      if (!['cap_unset', 'spend_identity_unavailable', 'spend_bound_unavailable', 'daily_cap_reached'].includes(admission?.reason)) return hold(id, 'admission_outcome_unknown');
      // A definite refusal is terminal; no duplicate INSERT or provider retry under this ID.
      return change(id, job => ({ ...job, phase: job.cancelRequested ? 'cancelled' : 'refused', reservation: 'not_admitted', reason: 'admission_refused', updatedAt: now() }));
    }
    const started = await change(id, job => {
      if (job.cancelRequested || job.phase !== 'admitting' || job.claim !== claim) return { ...job, reservation: 'held' };
      return { ...job, phase: 'started', reservation: 'held', startedAt: now(), updatedAt: now() };
    });
    if (started.phase !== 'started' || started.cancelRequested) {
      // Only this live invocation knows admission succeeded and no request was dispatched.
      if (started.cancelRequested) {
        try { await settleSpend(started.operationId, { status: 'cancelled', calls: 0, costUsd: 0, error: 'cancelled_before_dispatch' }); }
        catch { return hold(id, 'cancel_settlement_unknown'); }
        return change(id, job => ({ ...job, phase: 'cancelled', reservation: 'released', updatedAt: now() }));
      }
      return hold(id, 'dispatch_fence_changed');
    }
    const controller = new AbortController();
    controllers.set(id, controller);
    const signal = bytes.signal ? AbortSignal.any([bytes.signal, controller.signal]) : controller.signal;
    try {
      // started is durable BEFORE entering the provider adapter, including its preflight.
      const result = await edit({ operation: started.request.operation, image: bytes.image, ...(bytes.mask ? { mask: bytes.mask } : {}), ...(started.request.prompt ? { prompt: started.request.prompt } : {}), signal });
      if (signal.aborted || (await get(id)).cancelRequested) return hold(id, 'cancelled_after_start');
      if (!(result?.bytes instanceof Uint8Array) || !result.bytes.length || result.bytes.length > 10 * 1024 * 1024 || result.mimeType !== 'image/png' || result.validation !== 'png-pixels') return hold(id, 'unvalidated_output');
      const outputSha256 = await digest(result.bytes);
      const publishing = await change(id, job => job.phase === 'started' && !job.cancelRequested ? { ...job, phase: 'publishing', outputSha256, usage: result.usage || null, updatedAt: now() } : job);
      if (publishing.phase !== 'publishing' || publishing.cancelRequested) return hold(id, 'publication_fence_changed');
      const artifact = await publish({ jobId: id, operationId: started.operationId, sha256: outputSha256, result });
      if (typeof artifact?.id !== 'string' || !/^[A-Za-z0-9_.-]{1,200}$/.test(artifact.id)) return hold(id, 'publication_outcome_unknown');
      const ready = await change(id, job => {
        // Publication stores an immutable asset only. Cancellation must win the ready race.
        if (job.cancelRequested || job.phase !== 'publishing') return { ...job, phase: 'unknown', artifactId: artifact.id, reason: 'cancelled_or_changed_during_publication', reservation: 'held', updatedAt: now() };
        return { ...job, phase: 'ready', artifactId: artifact.id, updatedAt: now() };
      });
      if (ready.phase !== 'ready') return ready;
      try {
        // Missing verified price never becomes zero. Existing ledger retains its reserved bound.
        await settleSpend(ready.operationId, { status: 'settled', calls: 1, costUsd: null, provider: 'openai', model: 'gpt-image-2.5-sunburst-2026-09-08' });
        return change(id, job => ({ ...job, reservation: 'settled_at_reserved_bound', updatedAt: now() }));
      } catch { return ready; } // Reconciliation may settle accounting later; never re-run generation.
    } catch {
      return hold(id, signal.aborted ? 'cancelled_after_start' : 'attempt_outcome_unknown');
    } finally { controllers.delete(id); }
  }
  async function cancel(id) {
    if (!idOK(id)) throw error('invalid_input', 'Invalid image job ID.');
    const job = await change(id, current => {
      if (!current || current.phase === 'ready') return current;
      return { ...current, cancelRequested: true, phase: ['queued', 'refused'].includes(current.phase) ? 'cancelled' : current.phase, updatedAt: now() };
    });
    controllers.get(id)?.abort();
    return job;
  }
  return {
    get, cancel,
    async create(input) {
      const { id, operation, prompt, sourceSha256, maskSha256, reservedUsd } = input || {};
      if (!idOK(id) || !['remove_background', 'edit_image'].includes(operation) || !hashOK(sourceSha256) || !Number.isFinite(reservedUsd) || reservedUsd <= 0) throw error('invalid_input', 'A bounded immutable image job is required.');
      if (operation === 'edit_image' ? !hashOK(maskSha256) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000 : maskSha256 != null || prompt != null) throw error('invalid_input', 'Regional editing requires a bound prompt and mask; removal does not accept them.');
      const request = { operation, sourceSha256, reservedUsd, ...(maskSha256 ? { maskSha256, prompt } : {}) };
      return change(id, existing => {
        if (existing) {
          if (JSON.stringify(existing.request) !== JSON.stringify(request)) throw error('conflict', 'Job ID is already bound to another request.');
          return existing;
        }
        return { id, operationId: `image_edit:${id}`, request, phase: 'queued', cancelRequested: false, reservation: 'none', createdAt: now(), updatedAt: now() };
      });
    },
    run(id, input) {
      if (active.has(id)) return active.get(id);
      const pending = execute(id, input).finally(() => active.delete(id));
      active.set(id, pending);
      return pending;
    },
  };
}
