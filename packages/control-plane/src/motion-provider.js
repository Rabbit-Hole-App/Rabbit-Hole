// The Motion render service already holds the finished Remotion render, so this provider
// never POSTs source: submit only checks the render exists, poll fetches its final.mp4.
// Same asynchronous contract as ManimProvider: submit -> ticket, poll -> null while
// rendering, a final error on failure, or the bytes.
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

// M7A, DEVELOPMENT ONLY: a /motion request that the development orchestrator
// (packages/learn-render/motion/orchestrator.mjs) plans, reviews and renders. The orchestrator holds
// the model key; this Worker only starts the job, polls it, fetches the validated final MP4 into
// LEARN_MEDIA, and can stop it. The card carries the learner's /motion line and the canvas concept
// it was typed on, nothing else. MOTION_ORCHESTRATOR_URL is set only on the local Motion stack.
const MOTION_LINE = /^\/motion\s+\S/;
// A refusal the orchestrator answered: nothing started, so the job stays retryable.
const definite = message => Object.assign(new Error(message), { definite: true });

export function validateMotionRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('motion_request: an object is required');
  const extra = Object.keys(value).find(key => !['op', 'request', 'location'].includes(key));
  if (extra) throw new Error(`motion_request: unknown field ${extra}`);
  if (value.op !== 'motion_request') throw new Error('motion_request: op must be motion_request');
  if (typeof value.request !== 'string' || !MOTION_LINE.test(value.request.trim()) || value.request.length > 500) throw new Error('motion_request: request must be a /motion line of at most 500 characters');
  const location = value.location ?? {};
  if (!location || typeof location !== 'object' || Array.isArray(location) || Object.keys(location).some(key => key !== 'concept')) throw new Error('motion_request: location is {concept}');
  const concept = location.concept ?? null;
  if (concept !== null && (typeof concept !== 'string' || concept.length > 100)) throw new Error('motion_request: concept must be a string of at most 100 characters');
  return { op: 'motion_request', request: value.request.trim(), location: { concept: concept?.trim() || null } };
}

export async function motionRequestCacheKey(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`motion-request|${input.request}|${input.location.concept ?? ''}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export class MotionRequestProvider {
  constructor(env, transport = fetch) {
    this.url = env.MOTION_ORCHESTRATOR_URL;
    this.token = env.MOTION_ORCHESTRATOR_TOKEN;
    this.transport = transport;
    this.version = 'motion-orchestrator';
  }
  async request(path, { method = 'GET', body } = {}) {
    if (!this.url || !this.token) throw definite('Motion is not configured here (development only)');
    const base = new URL(this.url);
    if (base.protocol !== 'https:') throw definite('The Motion orchestrator requires HTTPS');
    const transport = this.transport;
    return transport(new URL(path, base), { method, headers: { Authorization: `Bearer ${this.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: AbortSignal.timeout(20000) });
  }
  async submit(input) {
    const response = await this.request('/jobs', { method: 'POST', body: { request: input.request, location: input.location.concept ? { concept: input.location.concept } : {} } });
    const body = await response.json().catch(() => ({}));
    if (response.status === 202 && /^[0-9a-f]{32}$/.test(body.job_id || '')) return { id: body.job_id };
    throw definite(`The Motion harness did not start the job${body.detail ? `: ${body.detail}` : body.error ? ` (${body.error})` : ` (HTTP ${response.status})`}`);
  }
  async poll(ticket) {
    const response = await this.request(`/jobs/${ticket.id}`);
    if (response.status === 404) throw final('The Motion job is gone (the development orchestrator restarted); generate it again');
    if (!response.ok) throw new Error(`Motion orchestrator HTTP ${response.status}`);
    const job = await response.json();
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
