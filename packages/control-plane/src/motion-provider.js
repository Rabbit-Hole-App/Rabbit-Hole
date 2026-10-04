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
