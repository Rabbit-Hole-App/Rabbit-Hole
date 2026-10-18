// Background removal controller. No UI, automatic consent, upload, or canvas mutation.
// prepareRevision must be the existing prepareImageRevision implementation.
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => structuredClone(value);
const fail = (code, message) => Object.assign(new Error(message), { code });
export function createBackgroundRemovalController(options) { return createImageController({ ...options, edit: null }); }
export function createRegionalImageEditController(options) {
  const edit = options.edit;
  if (!edit || typeof edit.prompt !== 'string' || !edit.prompt.trim() || edit.prompt.length > 2000 ||
      !edit.region || ['x', 'y', 'width', 'height'].some(key => !Number.isInteger(edit.region[key]) || edit.region[key] < (key === 'x' || key === 'y' ? 0 : 1)) ||
      edit.region.x + edit.region.width > 8192 || edit.region.y + edit.region.height > 8192) throw fail('invalid_region', 'Choose an explicit region and describe its edit.');
  return createImageController({ ...options, edit: clone(edit) });
}
function createImageController({ block, scope, ownerKey, current, jobClient, edit, prepareMask,
  prepareRevision, persistTicket, fetchImpl = globalThis.fetch, headers = {}, objectURLs = URL }) {
  const before = clone(block), at = clone(scope), lifetime = new AbortController();
  const operation = edit ? 'edit_image' : 'remove_background';
  let attempted = false, saved = null, revision = null, disposed = false;
  if (typeof ownerKey !== 'string' || !ownerKey || typeof prepareRevision !== 'function' || typeof persistTicket !== 'function') throw fail('unavailable', 'Image editing setup is incomplete.');
  const source = before?.fileRef?.source;
  if (!(before?.type === 'image' || before?.type === 'file' && before.kind === 'image') || typeof source?.id !== 'string' || !/^fs_[a-f0-9]{24}$/.test(source.id) || typeof source?.rev !== 'string' || !/^[a-f0-9]{64}$/.test(source.rev) || before.locked || before.sources?.length || before.citations?.length || before.references?.length) throw fail('ineligible', 'Save an editable PNG image source before removing its background.');
  function check() {
    const now = current();
    if (disposed || lifetime.signal.aborted || now.ownerKey !== ownerKey || !at?.app || !at?.board || at.share || at.member || !equal(now.scope, at) || !equal(now.block, before) || now.readOnly || now.locked) throw fail('stale', 'The image, canvas, or access changed.');
  }
  async function remember(value) { await persistTicket(clone(value)); saved = clone(value); }
  async function prepare(proposal) {
    check();
    if (typeof proposal.artifactId !== 'string' || !/^fs_[a-f0-9]{24}$/.test(proposal.artifactId) || proposal.jobId !== saved?.ticket?.id || !equal(proposal.binding, saved.ticket.binding)) throw fail('invalid_artifact', 'The ready revision does not match the saved job.');
    const response = await fetchImpl(`/api/learn/files/${encodeURIComponent(proposal.artifactId)}`, { headers, signal: lifetime.signal, cache: 'no-store' });
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/png') throw fail('artifact_unavailable', 'The saved image revision is unavailable.');
    const rev = response.headers.get('x-source-rev');
    if (!/^[a-f0-9]{64}$/.test(rev || '')) throw fail('invalid_artifact', 'The saved image revision has no valid identity.');
    const reader = response.body.getReader(), chunks = []; let length = 0;
    try {
      for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 10 * 1024 * 1024) { await reader.cancel(); throw fail('invalid_artifact', 'The image revision is too large.'); } chunks.push(part.value); }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    const signature = [137,80,78,71,13,10,26,10];
    if (digest !== rev || bytes.length < 24 || signature.some((n,i)=>bytes[i]!==n)) throw fail('invalid_artifact', 'The image revision bytes do not match its identity.');
    const view = new DataView(bytes.buffer), width = view.getUint32(16), height = view.getUint32(20);
    if (width !== 1024 || height !== 1024) throw fail('invalid_artifact', 'Unexpected image revision dimensions.');
    check();
    const blob = new Blob([bytes], { type: 'image/png' });
    const result = await prepareRevision({ block: clone(before), scope: clone(at), signal: lifetime.signal,
      current: () => { check(); return current(); }, headers, fetchImpl, objectURLs,
      transform: async () => ({ ok: true, blob, width, height }),
      upload: async () => ({ source: { id: proposal.artifactId, rev, name: edit ? 'region-edited.png' : 'background-removed.png', type: 'image/png', size: length } }) });
    try { check(); } catch (error) { result.dispose(); throw error; }
    revision?.dispose(); revision = result;
    return revision;
  }
  async function resume(envelope, { onProgress } = {}) {
    check();
    if (envelope?.version !== 1 || envelope.ownerKey !== ownerKey || !equal(envelope.scope, at) || !equal(envelope.before, before) || edit && !equal(envelope.edit, edit)) throw fail('stale_ticket', 'This saved job belongs to a different image or owner.');
    attempted = true; saved = clone(envelope);
    if (!saved.ticket) throw fail('submission_unknown', 'The earlier submission was not confirmed. Do not start another automatically.');
    const binding = saved.ticket.binding;
    if (binding?.operation !== operation || edit && (binding.prompt !== edit.prompt || binding.maskSourceId !== saved.mask?.maskSourceId || binding.maskSha256 !== saved.mask?.maskSha256) || binding.sourceId !== source.id || binding.sourceSha256 !== source.rev || binding.app !== at.app || binding.board !== at.board || binding.cardId !== before.id) throw fail('stale_ticket', 'The saved job does not match this image.');
    const result = await jobClient.resume(saved.ticket, { signal: lifetime.signal, onProgress });
    check();
    await remember({ ...saved, state: result.job.phase });
    if (!result.proposal) return { job: result.job, revision: null };
    return { job: result.job, revision: await prepare(result.proposal) };
  }
  return {
    async quote() { check(); const quote = await jobClient.quote({ signal: lifetime.signal }); check(); return quote; },
    async start({ consent, idempotencyKey, onProgress }) {
      check();
      if (attempted) throw fail('already_started', 'Resume the existing job instead of starting another.');
      if (consent?.approved !== true || typeof consent.maxReservedUsd !== 'number' || !Number.isFinite(consent.maxReservedUsd) || consent.maxReservedUsd <= 0) throw fail('consent_required', 'Approve the displayed maximum reservation before starting.');
      if (edit && typeof prepareMask !== 'function') throw fail('unavailable', 'Mask preparation is unavailable. Resume a saved job instead.');
      attempted = true;
      await remember({ version: 1, ownerKey, scope: at, before, state: 'submission_pending', ticket: null, idempotencyKey, maxReservedUsd: consent.maxReservedUsd, ...(edit ? { edit } : {}) });
      check();
      let mask = null;
      if (edit) {
        const prepared = await prepareMask({ edit: clone(edit), block: clone(before), scope: clone(at), signal: lifetime.signal });
        check();
        if (typeof prepared?.maskSourceId !== 'string' || !/^fs_[a-f0-9]{24}$/.test(prepared.maskSourceId) || typeof prepared.maskSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(prepared.maskSha256)) throw fail('invalid_mask', 'The saved mask has no valid immutable identity.');
        mask = { maskSourceId: prepared.maskSourceId, maskSha256: prepared.maskSha256 };
        await remember({ ...saved, mask });
        check();
      }
      const ticket = await jobClient.submit({ operation, ...(edit ? { ...mask, prompt: edit.prompt } : {}), app: at.app, board: at.board, cardId: before.id,
        sourceId: source.id, sourceSha256: source.rev, idempotencyKey, paidConfirmation: true, maxReservedUsd: consent.maxReservedUsd }, { signal: lifetime.signal });
      await remember({ ...saved, state: 'queued', ticket });
      return resume(saved, { onProgress });
    },
    resume,
    async cancel() { lifetime.abort(); revision?.dispose(); if (!saved?.ticket) return { phase: 'unknown', reason: 'submission_not_confirmed' }; return jobClient.cancel(saved.ticket); },
    async accept() { check(); if (!revision) throw fail('not_ready', 'Wait for a saved image preview.'); return revision.accept(); },
    dispose() { disposed = true; lifetime.abort(); revision?.dispose(); },
  };
}
