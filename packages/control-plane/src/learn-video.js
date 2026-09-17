import { authorizedBoardApp } from './learn-board.js';
import { validateVideo, videoCacheKey } from './learn-video-schema.js';
import { videoProvider } from './video-provider.js';

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const POLL_MS = 10000; // Clips take minutes; background polling does not depend on an open browser.
const MAX_WAIT_MS = 30 * 60 * 1000;
export async function videoFetch(req, env) {
  return privateLessonAssetFetch(req, env, env.LEARN_VIDEOS);
}
export async function privateLessonAssetFetch(req, env, binding) {
  const url = new URL(req.url);
  if (url.searchParams.has('workspace')) {
    const headers = new Headers(req.headers); headers.set('x-small-workspace', url.searchParams.get('workspace'));
    req = new Request(req, { headers });
  }
  const app = await authorizedBoardApp(req, env, url.searchParams.get('app'));
  if (app instanceof Response) return app;
  if (!app.email || !app.org) return json({ error: 'Sign in first' }, 401);
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'GET or POST required' }, 405);
  if (req.method === 'POST' && req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  // Cache and placements are private to this learner in this app/workspace.
  const id = binding.idFromName(JSON.stringify([app.org, app.name, app.email]));
  return binding.get(id).fetch(req);
}

export class LearnVideos {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(req) {
    if (req.method === 'GET') {
      const key = new URL(req.url).searchParams.get('asset');
      if (key) {
        if (!/^[a-f0-9]{64}$/.test(key)) return json({ error: 'Invalid asset' }, 400);
        const job = await this.state.storage.get(`job:${key}`);
        if (job?.status !== 'ready') return json({ error: 'Video not ready' }, 404);
        const object = await this.env.RUNS.get(job.storageKey, { range: req.headers });
        if (!object) return json({ error: 'Video unavailable' }, 404);
        const headers = new Headers({ 'Content-Type': 'video/mp4', 'Cache-Control': 'private, max-age=3600', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' });
        headers.set('Content-Length', String(object.range?.length ?? object.size));
        if (object.range) headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
        return new Response(object.body, { status: object.range ? 206 : 200, headers });
      }
      return json(await this.list());
    }
    // Serialize concurrent duplicate submissions, including the external POST.
    return this.state.blockConcurrencyWhile(async () => {
      try {
        const raw = await req.text();
        if (raw.length > 15000) return json({ error: 'Video request too large' }, 413);
        const body = JSON.parse(raw);
        if (body.action === 'place') {
          const p = await this.state.storage.get(`placement:${body.id}`);
          if (!p) return json({ error: 'Video placement not found' }, 404);
          if (!body.position || ['x', 'y', 'w', 'h'].some(k => !Number.isFinite(body.position[k]) || Math.abs(body.position[k]) > 100000) || body.position.w < 20 || body.position.h < 20) throw new Error('Invalid video position');
          await this.state.storage.put(`placement:${body.id}`, { ...p, position: body.position, hidden: body.hidden === true });
          return json({ saved: true });
        }
        const provider = videoProvider(this.env);
        const input = validateVideo(body.operation);
        if (typeof body.lessonId !== 'string' || body.lessonId.length > 150 || typeof body.page !== 'string' || body.page.length > 150) throw new Error('Lesson and page are required');
        const key = await videoCacheKey(input, provider.version);
        let job = await this.state.storage.get(`job:${key}`);
        if (!job || (body.retry === true && job.status === 'failed' && !job.uncertain)) {
          const all = await this.state.storage.list({ prefix: 'job:' });
          if ([...all.values()].some(j => j.status === 'generating')) return json({ error: 'One video is already generating. Wait for it before requesting another.' }, 409);
          if (all.size >= 100 && !job) throw new Error('This preview has reached its saved video limit');
          job = { key, input, status: 'generating', startedAt: Date.now(), version: provider.version, provider: this.env.LEARN_VIDEO_PROVIDER };
          // Persist before submitting. Never automatically repeat a potentially charged POST.
          await this.state.storage.put(`job:${key}`, job);
          await this.state.storage.setAlarm(Date.now() + POLL_MS);
          try { job.ticket = await provider.submit(input); }
          catch { job.status = 'failed'; job.uncertain = true; job.error = 'Submission could not be confirmed. Check the provider request history before generating again.'; }
          await this.state.storage.put(`job:${key}`, job);
        } else if (body.retry === true && job.uncertain) {
          return json({ error: job.error }, 409);
        }
        const placementId = await videoCacheKey({ ...input, prompt: JSON.stringify([body.lessonId, body.page, input.id]) }, key);
        const previous = await this.state.storage.get(`placement:${placementId}`);
        await this.state.storage.put(`placement:${placementId}`, previous || { id: placementId, key, lessonId: body.lessonId, page: body.page, operation: input, position: null });
        return json({ ...await this.list(), placementId }, 202);
      } catch (error) { return json({ error: error.message }, 400); }
    });
  }
  async list() {
    const placements = await this.state.storage.list({ prefix: 'placement:' });
    const jobs = await this.state.storage.list({ prefix: 'job:' });
    return { videos: [...placements.values()].map(p => {
      const j = jobs.get(`job:${p.key}`);
      return { ...p, status: j?.status || 'idle', error: j?.error, retryable: !j?.uncertain, duration: j?.input.duration, provider: j?.result?.provider, generationId: j?.result?.generationId };
    }) };
  }
  async alarm() {
    const jobs = await this.state.storage.list({ prefix: 'job:' });
    for (const [key, job] of jobs) {
      if (job.status !== 'generating') continue;
      // A crash after POST but before storing its ticket cannot safely be retried.
      if (!job.ticket) { job.status = 'failed'; job.uncertain = true; job.error = 'Submission status is unknown. Check provider history before generating again.'; }
      else {
        try {
          const result = await videoProvider({ ...this.env, LEARN_VIDEO_PROVIDER: job.provider }).poll(job.ticket);
          if (result) {
            const response = await fetch(result.videoUrl, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
            if (!response.ok || !response.headers.get('content-type')?.startsWith('video/')) throw new Error('Video download unavailable');
            // Short preview clips are bounded to protect Worker memory and storage.
            const chunks = [], reader = response.body.getReader(); let length = 0;
            for (;;) {
              const { done, value } = await reader.read(); if (done) break;
              length += value.byteLength;
              if (length > 40 * 1024 * 1024) { await reader.cancel(); throw new Error('Generated clip is too large'); }
              chunks.push(value);
            }
            const bytes = new Uint8Array(length); let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            job.storageKey = `learn-video-dev/${this.state.id}/${job.key}.mp4`;
            await this.env.RUNS.put(job.storageKey, bytes, { httpMetadata: { contentType: 'video/mp4' } });
            job.result = { ...result, videoUrl: undefined, duration: job.input.duration };
            job.status = 'ready';
          }
          if (Date.now() - job.startedAt > MAX_WAIT_MS && job.status !== 'ready') { job.uncertain = true; throw new Error('Generation has not completed within 30 minutes. Check provider history before generating again.'); }
        } catch (error) {
          // Transient polling/storage errors keep the existing ticket: no paid resubmission.
          if (Date.now() - job.startedAt > MAX_WAIT_MS || /could not generate|returned no video|Invalid generated/.test(error.message)) { job.status = 'failed'; job.error = error.message; }
        }
      }
      await this.state.storage.put(key, job);
    }
    if ([...(await this.state.storage.list({ prefix: 'job:' })).values()].some(j => j.status === 'generating')) await this.state.storage.setAlarm(Date.now() + POLL_MS);
  }
}
