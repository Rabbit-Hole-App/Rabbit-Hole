// The manim worker is a private service, not a public asset host, so this
// provider returns the rendered bytes rather than a URL the caller downloads.
// Same asynchronous contract as the video providers: submit -> ticket,
// poll -> null while rendering, or a finished clip.
const MAX_ASSET = 25 * 1024 * 1024;

export class ManimProvider {
  constructor(env, transport = fetch) {
    this.url = env.MATH_WORKER_URL;
    this.token = env.MATH_WORKER_TOKEN;
    this.transport = transport;
    this.version = 'manim-worker';
  }
  async request(path, body) {
    if (!this.url || !this.token) throw new Error('Math animation is not configured');
    const base = new URL(this.url);
    if (base.protocol !== 'https:') throw new Error('The math worker requires HTTPS');
    const transport = this.transport;
    return transport(new URL(path, base), {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${this.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });
  }
  // The worker refuses a key submitted against a different compiler version,
  // so its own version is read first and travels with the job.
  async workerVersion() {
    const response = await this.request('/health');
    if (!response.ok) throw new Error('The math worker is unavailable');
    const health = await response.json();
    if (!health.version) throw new Error('The math worker did not report a version');
    return health.version;
  }
  async submit(input) {
    const version = await this.workerVersion();
    const key = await cacheKey(input.spec, version);
    const response = await this.request('/jobs', { key, operation: input.spec, version });
    if (response.status === 429) throw new Error('The math worker is busy; try again shortly');
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.error || `Math worker HTTP ${response.status}`);
    }
    return { id: key, version };
  }
  async poll(ticket) {
    const response = await this.request(`/jobs/${ticket.id}`);
    // A restarted worker forgets its jobs; the caller resubmits the same key.
    if (response.status === 404) throw new Error('The render was lost; generate it again');
    if (!response.ok) throw new Error(`Math worker HTTP ${response.status}`);
    const job = await response.json();
    if (job.status === 'failed') throw new Error(job.error || 'The animation could not be rendered');
    if (job.status !== 'ready') return null;
    const asset = await this.request(`/jobs/${ticket.id}/asset`);
    if (!asset.ok || !asset.headers.get('content-type')?.startsWith('video/')) throw new Error('The rendered animation was unavailable');
    const bytes = new Uint8Array(await asset.arrayBuffer());
    if (bytes.byteLength > MAX_ASSET) throw new Error('The rendered animation is too large');
    return { bytes, provider: 'manim', generationId: ticket.id };
  }
}

// Identical specifications reuse an existing render; captions and display ids
// are presentation, so they do not invalidate the asset. Keys are sorted at
// every level so two equal scenes written in a different order share a render.
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  : value;

export async function cacheKey(spec, version) {
  const content = canonical({ scene: spec.scene, quality: spec.quality || 'low', version });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
