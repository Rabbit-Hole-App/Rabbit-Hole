// The Motion render service already holds the finished Remotion render, so this provider
// never POSTs source: submit only checks the render exists, poll fetches its final.mp4.
// Same asynchronous contract as ManimProvider: submit -> ticket, poll -> null while
// rendering, a final error on failure, or the bytes.
import { validateMotionContext } from './motion-context.js';

const MAX_ASSET = 25 * 1024 * 1024;
const RENDER_ID = /^[0-9a-f]{32}$/;
const final = message => Object.assign(new Error(message), { final: true });

// Exactly { op: 'motion_render', render_id }: the card carries a reference, never a spec.
export function validateMotionRender(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('motion_render: an object is required');
  const extra = Object.keys(value).find(key => key !== 'op' && key !== 'render_id');
  if (extra) throw new Error(`motion_render: unknown field ${extra}`);
  if (value.op !== 'motion_render') throw new Error('motion_render: op must be motion_render');
  if (typeof value.render_id !== 'string' || !RENDER_ID.test(value.render_id)) throw new Error('motion_render: render_id must be 32 lowercase hex characters');
  return { op: 'motion_render', render_id: value.render_id };
}

export async function motionCacheKey(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`motion-render|${input.render_id}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export class MotionProvider {
  constructor(env, transport = fetch) {
    this.url = env.MOTION_RENDERER_URL;
    this.token = env.MOTION_RENDERER_TOKEN;
    this.transport = transport;
    this.version = 'motion-renderer';
  }
  async request(path) {
    if (!this.url || !this.token) throw new Error('Motion rendering is not configured');
    const base = new URL(this.url);
    if (base.protocol !== 'https:') throw new Error('The Motion renderer requires HTTPS');
    const transport = this.transport;
    return transport(new URL(path, base), { method: 'GET', headers: { Authorization: `Bearer ${this.token}` }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  }
  async status(id) {
    const response = await this.request(`/render/${id}`);
    // Unknown or expired: polling again cannot bring it back.
    if (response.status === 404) throw final('The Motion render was not found or has expired; render it again');
    if (!response.ok) throw new Error(`Motion renderer HTTP ${response.status}`);
    const render = await response.json();
    if (render.status === 'failed' || render.status === 'invalid') throw final(`The Motion render failed${render.error ? ` (${render.error})` : ''}`);
    return render;
  }
  async submit(input) {
    await this.status(input.render_id);
    return { id: input.render_id };
  }
  async poll(ticket) {
    const render = await this.status(ticket.id);
    if (render.status !== 'ready') return null;
    const asset = await this.request(`/render/${ticket.id}/artifacts/final.mp4`);
    if (!asset.ok || !asset.headers.get('content-type')?.startsWith('video/mp4')) throw new Error('The Motion render was unavailable');
    const bytes = new Uint8Array(await asset.arrayBuffer());
    // Final: the same render is the same size next time, so do not poll it for 30 minutes.
    if (bytes.byteLength > MAX_ASSET) throw final('The Motion render is too large');
    return { bytes, provider: 'motion', generationId: ticket.id };
  }
}

// A /motion request that the Motion orchestrator (packages/learn-render/motion/orchestrator.mjs) plans, reviews and
// renders. The orchestrator holds the model key; this Worker admits the job's hold against the learner's allowance
// (learn-video.js), sends it as a signed grant, polls the job, fetches the validated final MP4 into LEARN_MEDIA, and
// can stop it. The card carries the learner's /motion line, the canvas concept it was typed on and, optionally, the
// selected card (context, motion-context.js), never composition source.
// MOTION_ORCHESTRATOR_URL is set only where an orchestrator runs (today the local Motion stack).
const MOTION_LINE = /^\/motion\s+\S/;
// A refusal the orchestrator answered: nothing started, so the job stays retryable.
const definite = (message, code = null) => Object.assign(new Error(message), { definite: true, code });
// The only answers that are the orchestrator's own refusals before anything started (orchestrator.mjs POST /jobs). Anything else,
// a 500, a proxy's 502, a malformed success or no answer at all, may follow a job it accepted (MOT-07): never a no-start.
const NO_START = { 400: ['invalid_request'], 401: ['unauthorized'], 403: ['grant_refused'], 429: ['busy'], 503: ['renderer_unavailable', 'not_configured'] };
const BOOT = /^[0-9a-f]{32}$/;
// A request timeout on setTimeout rather than AbortSignal.timeout, so tests can run admission on a mocked clock (no real waits).
const timeoutSignal = ms => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), Math.max(0, ms));
  id?.unref?.();
  return controller.signal;
};

export function validateMotionRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('motion_request: an object is required');
  const extra = Object.keys(value).find(key => !['op', 'request', 'location', 'context'].includes(key));
  if (extra) throw new Error(`motion_request: unknown field ${extra}`);
  if (value.op !== 'motion_request') throw new Error('motion_request: op must be motion_request');
  if (typeof value.request !== 'string' || !MOTION_LINE.test(value.request.trim()) || value.request.length > 500) throw new Error('motion_request: request must be a /motion line of at most 500 characters');
  const location = value.location ?? {};
  if (!location || typeof location !== 'object' || Array.isArray(location) || Object.keys(location).some(key => key !== 'concept')) throw new Error('motion_request: location is {concept}');
  const concept = location.concept ?? null;
  if (concept !== null && (typeof concept !== 'string' || concept.length > 100)) throw new Error('motion_request: concept must be a string of at most 100 characters');
  const context = validateMotionContext(value.context);
  return { op: 'motion_request', request: value.request.trim(), location: { concept: concept?.trim() || null }, ...(context ? { context } : {}) };
}

// A different selected card is a different video; a request with no context keeps the key it always had.
export async function motionRequestCacheKey(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`motion-request|${input.request}|${input.location.concept ?? ''}${input.context ? `|${JSON.stringify(input.context)}` : ''}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// The per-job hold (owner items 1 and 6, 2026-10-21): MOTION_JOB_RESERVATION_USD, a decimal above 0 and at most 25, in
// integer micro-USD. Missing or invalid is null, and null starts nothing: never unlimited.
const DECIMAL = /^\d+(\.\d{1,6})?$/;
export function motionReservationMicros(env) {
  const text = String(env?.MOTION_JOB_RESERVATION_USD ?? '').trim();
  if (!DECIMAL.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const micros = Number(whole) * 1e6 + Number(fraction.padEnd(6, '0'));
  return micros > 0 && micros <= 25e6 ? micros : null;
}

// The grant the orchestrator verifies (orchestrator.mjs signGrant): the hold for one idempotency key, for the orchestrator
// process whose boot id the worker read (MOT-08), HMAC-SHA256 with the shared orchestrator token.
export async function motionGrant(token, key, micros, issuedAt, boot) {
  const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(`motion-grant|${key}|${micros}|${issuedAt}|${boot}`)));
  return { micros, issued_at: issuedAt, boot, sig: [...sig].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}

export class MotionRequestProvider {
  constructor(env, transport = fetch) {
    this.url = env.MOTION_ORCHESTRATOR_URL;
    this.token = env.MOTION_ORCHESTRATOR_TOKEN;
    this.transport = transport;
    this.version = 'motion-orchestrator';
  }
  // Why nothing can start here, answered before any admission or call; null when an orchestrator is configured.
  unavailable() {
    // A dev clone, preview or production has no orchestrator (only the local Motion stack sets one): nothing starts or is charged.
    if (!this.url || !this.token) return 'Motion is not available in this environment yet. Nothing was started.';
    if (new URL(this.url).protocol !== 'https:') return 'The Motion orchestrator requires HTTPS';
    return null;
  }
  // timeoutMs: boot() and submit() get what is left of the admission deadline (learn-video.js startMotion); polls get 20 s.
  async request(path, { method = 'GET', body, timeoutMs = 20000 } = {}) {
    const refused = this.unavailable();
    if (refused) throw definite(refused);
    const transport = this.transport;
    return transport(new URL(path, new URL(this.url)), { method, headers: { Authorization: `Bearer ${this.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: timeoutSignal(timeoutMs) });
  }
  // spend: the admitted hold ({opId, grant}); opId is the idempotency key, so a resend finds the job it started.
  // repository: the canvas's repository as the worker's records say (learn-video.js canvasRepository), or null.
  // recover {mode, checkpoint, seal}: a recovery attempt (POST /recover) from the sealed checkpoint the worker saved; it is
  // admitted, answered and reconciled exactly as a new job is.
  async submit(input, spend, repository = null, timeoutMs = 20000, recover = null) {
    const response = await this.request(recover ? '/recover' : '/jobs', { method: 'POST', timeoutMs, body: recover
      ? { idempotency_key: spend.opId, grant: spend.grant, mode: recover.mode, checkpoint: recover.checkpoint, seal: recover.seal }
      : { request: input.request, location: input.location.concept ? { concept: input.location.concept } : {}, ...(input.context ? { context: input.context } : {}), ...(repository ? { repository } : {}), idempotency_key: spend.opId, grant: spend.grant } });
    const body = await response.json().catch(() => ({}));
    if (response.status === 202 && /^[0-9a-f]{32}$/.test(body.job_id || '')) return { id: body.job_id };
    if (NO_START[response.status]?.includes(body.error)) throw definite(`The Motion harness did not start the job${body.detail ? `: ${body.detail}` : ` (${body.error})`}`, body.error);
    throw new Error(`The Motion harness did not confirm the start (HTTP ${response.status})`);
  }
  // The orchestrator process that answers now, read before a grant is signed for it (MOT-08). An idle one boots for this read.
  // Nothing has been sent yet, so any failure is a definite no-start.
  async boot(timeoutMs = 20000) {
    let body = null;
    try { const response = await this.request('/health', { timeoutMs }); body = response.ok ? await response.json() : null; } catch (error) { if (error.definite) throw error; }
    if (!BOOT.test(body?.boot || '')) throw definite('The Motion service did not answer. Nothing was started.', 'unavailable');
    return body.boot;
  }
  // Reconciles a submission whose answer was lost (MOT-07, MOT-09), never resending it: the job its key started, or the key closed
  // so no job can start under it ({job_id: null, closed, boot}); null while it is still being admitted.
  async close(key) {
    const response = await this.request(`/keys/${encodeURIComponent(key)}/close`, { method: 'POST' });
    if (response.status === 409) return null;
    const body = response.ok ? await response.json().catch(() => null) : null;
    if (!BOOT.test(body?.boot || '') || !(body.closed === true || /^[0-9a-f]{32}$/.test(body.job_id || ''))) throw new Error(`Motion orchestrator HTTP ${response.status}`);
    return body;
  }
  // The job as the orchestrator reports it (status, spend, renders), or null when it no longer knows it.
  async job(ticket) {
    const response = await this.request(`/jobs/${ticket.id}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Motion orchestrator HTTP ${response.status}`);
    return response.json();
  }
  // The job's recovery artifacts (orchestrator GET /jobs/<id>/artifacts): its sealed checkpoint, cause, actions, findings and
  // keyframes. Read while it runs (each new checkpoint) and once it ends, before its record can go.
  async artifacts(ticket) {
    const response = await this.request(`/jobs/${ticket.id}/artifacts`);
    if (!response.ok) throw new Error(`Motion orchestrator HTTP ${response.status}`);
    return response.json();
  }
  async poll(ticket, view) {
    const job = view === undefined ? await this.job(ticket) : view;
    if (!job) throw final('The Motion job is no longer known to the Motion service (it restarted); generate it again');
    if (job.status === 'running') return null;
    if (job.status === 'needs_clarification') throw final(`Motion needs one clarification: ${job.clarification?.question || 'name what to explain'}`);
    if (job.status === 'cancelled') throw final('Stopped.');
    if (job.status !== 'ready') throw final(`The Motion job failed: ${job.failure_reason || 'unknown reason'}`);
    const asset = await this.request(`/jobs/${ticket.id}/final.mp4`);
    if (!asset.ok || !asset.headers.get('content-type')?.startsWith('video/mp4')) throw new Error('The Motion render was unavailable');
    const bytes = new Uint8Array(await asset.arrayBuffer());
    if (bytes.byteLength > MAX_ASSET) throw final('The Motion render is too large');
    // The provenance the card shows once ready: the brief's title and the block's motion record.
    return { bytes, provider: 'motion', generationId: job.render_id, motion: { title: job.title, ...job.motion } };
  }
  async cancel(ticket) {
    const response = await this.request(`/jobs/${ticket.id}/cancel`, { method: 'POST' });
    if (!response.ok) throw new Error(`Motion orchestrator HTTP ${response.status}`);
  }
}
