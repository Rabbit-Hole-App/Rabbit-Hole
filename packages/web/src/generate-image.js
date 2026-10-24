// IMG-01: Generate on a generate-image proposal card (docs/features/image-jobs.md, generation-review-contract.md section 10). Pure and
// testable with a fake api. One press posts the signed proposal under a generation id that is a function of the proposal, so a reload
// or a second press reaches the same job (the server consumes the proposal once); the job is then polled, and when it is ready the
// stored image is placed as the existing file image card. Nothing here resubmits: a failed or unknown job is said in words, and a new
// attempt is a new proposal. Behind the web flag (IMAGE_GENERATION in agent/slash.js, off; VITE_IMAGE_GENERATION for a review build).
import { IMAGE_GENERATION } from './agent/slash.js';
import { canvasFamilyOf, fileCardFromSource, sameFileCard } from './file-to-canvas.js';
import { withPrompt } from './card-prompt.js';

export const imageGenerationOn = (env = import.meta.env) => IMAGE_GENERATION || env?.VITE_IMAGE_GENERATION === 'true';
export const imageGenerationId = proposal => `img-${proposal.proposal_id}`;

const POLL_MS = 2000, STUCK_MS = 30000, GIVE_UP_MS = 10 * 60 * 1000, LOST_POLLS = 5;
const WORKING = new Set(['queued', 'admitting', 'admitted', 'submitting']), SAVING = new Set(['stored', 'recorded']);
// Failures where no request left the server: nothing was charged. Any other failure may have been billed by the provider.
const NOT_SENT = new Set(['not_configured', 'invalid_input', 'reference_changed', 'provider_not_started', 'ledger_state_unexpected']);

// -> { tone: 'working' | 'ready' | 'failed', text, retry } for a job as GET /api/learn/image-jobs/:id returns it (a failure that left
// no request is said to cost nothing; job.cost, its state string, is unknown for the rest). stuck: saving has gone on for a while, so the person may retry the save.
export function imageStatus(job, { stuck = false } = {}) {
  const billed = ' It may have been charged.';
  if (job.stage === 'ready') return { tone: 'ready', text: 'Added to the canvas.', retry: false };
  if (SAVING.has(job.stage)) return stuck ? { tone: 'working', text: 'Your image was made but saving it is taking longer than expected.', retry: true } : { tone: 'working', text: 'Saving your image.', retry: false };
  if (WORKING.has(job.stage)) return { tone: 'working', text: 'Making your image.', retry: false };
  if (job.stage === 'refused') return { tone: 'failed', text: job.message || 'This image was not started.', retry: false };
  if (job.stage === 'cancelled') return { tone: 'failed', text: 'Image generation was switched off before this started. Nothing was charged.', retry: false };
  if (job.stage === 'unknown') return { tone: 'failed', text: `We could not confirm whether this image was made.${billed} It was not tried again. Ask for a new image.`, retry: false };
  return { tone: 'failed', text: NOT_SENT.has(job.reason) ? 'The image could not be started. Nothing was charged. Ask for a new image.' : `The image could not be made.${billed} It was not tried again. Ask for a new image.`, retry: false };
}

// The generated image as the existing image card (a stored file source, nothing uploaded again), with the prompt row.
export function imageCard(job, proposal) {
  const a = job.artifact;
  if (!a) return null;
  const name = `generated-image.${a.mimeType === 'image/jpeg' ? 'jpg' : a.mimeType.split('/')[1]}`;
  const fam = canvasFamilyOf({ kind: 'file', sourceId: `file:${a.sourceId}@${a.sha256}`, name });
  const card = fam && fileCardFromSource({ id: a.sourceId, rev: a.sha256, name, type: a.mimeType, size: a.bytes }, fam, {});
  return card && withPrompt(card, proposal.input?.request);
}

export const retryImageSave = (api, jobId) => api(`/api/learn/image-jobs/${jobId}/retry-save`, { method: 'POST' });

// Generate. api: web api.js. ops: the canvas ops (insertCard). onStatus(status) is called with each imageStatus. wait(ms) is injectable.
// -> the final job (a ready one carries cardId, the card placed or revealed). Throws the server's refusal from the POST (api's Error with status and data: generation-review-client problemOf).
export async function runImageJob({ api, proposal, app, ops, onStatus = () => {}, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now }) {
  const generationId = imageGenerationId(proposal);
  let { job } = await api('/api/learn/image-jobs', { method: 'POST', body: JSON.stringify({ generationId, proposal, app }) });
  let stage = null, since = now(), lost = 0;
  const started = now();
  for (;;) {
    if (job.stage !== stage) { stage = job.stage; since = now(); }
    const status = imageStatus(job, { stuck: job.saveRetryable && now() - since > STUCK_MS });
    onStatus(status);
    if (job.stage === 'ready') {
      const card = imageCard(job, proposal);
      if (!card || !ops?.insertCard) throw Object.assign(new Error('The image was made but cannot be placed on this canvas.'), { job });
      const placed = ops.insertCard(card, { same: sameFileCard(job.artifact.sourceId, job.artifact.sha256) });
      return { ...job, cardId: placed?.id ?? null };
    }
    if (['refused', 'cancelled', 'failed', 'unknown'].includes(job.stage)) return job;
    if (now() - started > GIVE_UP_MS) throw Object.assign(new Error('This is taking much longer than expected. The image may still be made; reload to check.'), { job });
    await wait(POLL_MS);
    try { job = (await api(`/api/learn/image-jobs/${generationId}`)).job; lost = 0; }
    catch (error) { if (error?.status === 404 || ++lost >= LOST_POLLS) throw Object.assign(new Error('Lost contact with the image. It may still be made; reload to check.'), { job }); }
  }
}
