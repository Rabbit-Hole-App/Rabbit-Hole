// Provider-neutral asynchronous contract: submit(input) -> durable ticket;
// poll(ticket) -> null while pending, or GeneratedVideo when complete.
// No model/provider parameters cross the lesson-operation boundary.
export function videoProvider(env, transport = fetch) {
  if (env.LEARN_VIDEO_PROVIDER !== 'fal-seedance-lite') throw new Error('Video generation is not configured');
  if (!env.FAL_API_KEY) throw new Error('Video generation is not configured');
  return new FalSeedanceProvider(env, transport);
}

export class FalSeedanceProvider {
  constructor(env, transport = fetch) {
    this.key = env.FAL_API_KEY;
    this.transport = transport;
    this.model = 'fal-ai/bytedance/seedance/v1/lite';
    this.resolution = env.LEARN_VIDEO_RESOLUTION || '480p';
    this.version = `${this.model}:${this.resolution}:adapter-2`;
  }
  async request(url, init = {}) {
    if (!this.key) throw new Error('Video generation is not configured');
    const parsed = new URL(url);
    if (parsed.origin !== 'https://queue.fal.run') throw new Error('Invalid provider queue URL');
    const transport = this.transport; // Worker fetch requires the global receiver, not this adapter.
    const response = await transport(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { Authorization: `Key ${this.key}`, 'Content-Type': 'application/json' } });
    if (!response.ok) throw new Error(`Video provider HTTP ${response.status}`);
    return response.json();
  }
  async submit(input) {
    const reference = input.referenceImages.length > 0;
    const ticket = await this.request(`https://queue.fal.run/${this.model}/${reference ? 'reference-to-video' : 'text-to-video'}`, { method: 'POST', body: JSON.stringify({
      prompt: [input.prompt, input.style].filter(Boolean).join('\nStyle: '), duration: String(input.duration), aspect_ratio: input.aspectRatio, resolution: this.resolution,
      enable_safety_checker: true, ...(reference ? { reference_image_urls: input.referenceImages } : {}),
    }) });
    if (!ticket.request_id || !ticket.status_url || !ticket.response_url) throw new Error('Provider did not return a generation ticket');
    return { id: ticket.request_id, statusUrl: ticket.status_url, resultUrl: ticket.response_url, version: this.version };
  }
  async poll(ticket) {
    const status = await this.request(ticket.statusUrl);
    if (status.error) throw new Error('The video provider could not generate this clip');
    if (status.status !== 'COMPLETED') return null;
    const result = await this.request(ticket.resultUrl);
    if (!result.video?.url) throw new Error('The video provider returned no video');
    const url = new URL(result.video.url);
    if (url.protocol !== 'https:' || !(url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media'))) throw new Error('Invalid generated asset host');
    return { videoUrl: url.href, provider: 'fal-seedance-lite', generationId: ticket.id };
  }
}
