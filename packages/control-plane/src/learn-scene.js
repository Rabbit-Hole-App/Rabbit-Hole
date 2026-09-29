import { privateLessonAssetFetch } from './learn-video.js';
import { sceneCacheKey, validateScene } from './learn-scene-schema.js';
import { validateToolInput } from './learn-validation.js';
import { THREE_D_SCHEMA } from './learn-three-d-schema.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const WAIT_MS = 15 * 60 * 1000; // Includes worker startup and queue waits; compilation itself is capped at 90 seconds.
const MAX_ASSET = 20 * 1024 * 1024;
export const sceneFetch = (req, env) => privateLessonAssetFetch(req, env, env.LEARN_SCENES);
export async function workerRequest(env, path, body) {
  if (!env.SCENE_WORKER_URL || !env.SCENE_WORKER_TOKEN) throw new Error('The scene worker is not configured');
  const base = new URL(env.SCENE_WORKER_URL);
  if (base.protocol !== 'https:') throw new Error('Scene worker requires HTTPS');
  return fetch(new URL(path, base), { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${env.SCENE_WORKER_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: AbortSignal.timeout(20000) });
}
async function assetBytes(response) {
  if (Number(response.headers.get('content-length')) > MAX_ASSET) throw new Error('Scene exceeds 20 MB');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_ASSET) { await reader.cancel(); throw new Error('Scene exceeds 20 MB'); } chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  if (size < 20 || new DataView(bytes.buffer).getUint32(0, true) !== 0x46546c67) throw new Error('Worker did not produce a GLB');
  return bytes;
}
export class LearnScenes {
  constructor(state, env) { this.state = state; this.env = env; }
  async list() {
    const placements = await this.state.storage.list({ prefix: 'placement:' }), jobs = await this.state.storage.list({ prefix: 'job:' });
    return { scenes: [...placements.values()].map(p => { const job = jobs.get(`job:${p.key}`); return { ...p, status: job?.status || 'queued', error: job?.error, retryable: true, version: job?.version }; }) };
  }
  async fetch(req) {
    if (req.method === 'GET') {
      const key = new URL(req.url).searchParams.get('asset');
      if (!key) return json(await this.list());
      if (!/^[a-f0-9]{64}$/.test(key)) return json({ error: 'Invalid scene asset' }, 400);
      const job = await this.state.storage.get(`job:${key}`);
      if (job?.status !== 'ready') return json({ error: 'Scene not ready' }, 404);
      const asset = await this.env.RUNS.get(job.storageKey);
      if (!asset) return json({ error: 'Scene asset unavailable' }, 404);
      return new Response(asset.body, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(asset.size), 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
    }
    return this.state.blockConcurrencyWhile(async () => {
      try {
        const text = await req.text(); if (text.length > 64000) return json({ error: 'Scene request too large' }, 413);
        const body = JSON.parse(text);
        if (body.action === 'place') {
          const p = await this.state.storage.get(`placement:${body.id}`); if (!p) return json({ error: 'Placement not found' }, 404);
          const pos = body.position;
          if (!pos || ['x', 'y', 'w', 'h'].some(k => !Number.isFinite(pos[k]) || Math.abs(pos[k]) > 100000) || pos.w < 20 || pos.h < 20) throw new Error('Invalid scene placement');
          const view = body.viewState || {};
          if (Object.keys(view).some(k => !['camera', 'animation', 'animationTime', 'autoRotate'].includes(k))) throw new Error('Invalid scene view state');
          if (view.camera) validateToolInput(view.camera, THREE_D_SCHEMA.properties.camera);
          if (view.animation) validateToolInput(view.animation, THREE_D_SCHEMA.properties.animation);
          if (view.autoRotate !== undefined && typeof view.autoRotate !== 'boolean' || view.animationTime !== undefined && (!Number.isFinite(view.animationTime) || view.animationTime < 0 || view.animationTime > 100)) throw new Error('Invalid animation state');
          await this.state.storage.put(`placement:${body.id}`, { ...p, position: { x: pos.x, y: pos.y, w: pos.w, h: pos.h }, viewState: view, hidden: body.hidden === true });
          return json({ saved: true });
        }
        // A paid job starts only from the learner's explicit confirmation
        // (docs/features/learn-artifact-generation.md): no confirmed flag, no job.
        if (body.confirmed !== true) return json({ error: 'This uses paid generation. Confirm it first.', needsConfirm: true }, 428);
        const input = validateScene(body.operation);
        if (typeof body.lessonId !== 'string' || body.lessonId.length > 150 || typeof body.page !== 'string' || body.page.length > 150) throw new Error('Lesson and page required');
        const health = await workerRequest(this.env, '/health'); if (!health.ok) throw new Error('Scene worker is unavailable');
        const { version } = await health.json(); if (typeof version !== 'string' || version.length > 100) throw new Error('Invalid worker version');
        const key = await sceneCacheKey(input, version); let job = await this.state.storage.get(`job:${key}`);
        if (!job || body.retry === true && job.status === 'failed') {
          const jobs = await this.state.storage.list({ prefix: 'job:' });
          if ([...jobs.values()].some(j => ['queued', 'rendering'].includes(j.status))) return json({ error: 'A scene is already generating. Wait for it to finish.' }, 409);
          if (!job && jobs.size >= 100) throw new Error('Saved scene preview limit reached');
          const attempt = (job?.attempt || 0) + 1;
          job = { key, input, version, attempt, workerKey: await sceneCacheKey(input, `${version}:${key}:${attempt}`), status: 'queued', startedAt: Date.now() };
          await this.state.storage.put(`job:${key}`, job); await this.state.storage.setAlarm(Date.now() + 100);
        }
        const id = await sceneCacheKey({ ...input, scene: { lessonId: body.lessonId, page: body.page, id: input.id } }, key);
        const previous = await this.state.storage.get(`placement:${id}`);
        await this.state.storage.put(`placement:${id}`, previous || { id, key, operation: input, lessonId: body.lessonId, page: body.page, position: null, viewState: {} });
        return json({ ...await this.list(), placementId: id }, 202);
      } catch (e) { return json({ error: e.message }, 400); }
    });
  }
  async alarm() {
    for (const [key, job] of await this.state.storage.list({ prefix: 'job:' })) {
      if (!['queued', 'rendering'].includes(job.status)) continue;
      try {
        if (Date.now() - job.startedAt > WAIT_MS) throw new Error('Scene generation timed out. Retry this scene.');
        if (job.status === 'queued') {
          const r = await workerRequest(this.env, '/jobs', { key: job.workerKey, operation: job.input, version: job.version });
          if (r.ok) job.status = 'rendering';
          else if ([400, 409].includes(r.status)) throw new Error('Worker rejected this scene or its version changed. Retry this scene.');
        } else {
          const r = await workerRequest(this.env, `/jobs/${job.workerKey}`);
          if (r.status === 404) job.status = 'queued'; // Restart lost transient work; repeat uses the same deterministic key.
          else if (r.ok) {
            const status = await r.json();
            if (status.status === 'failed') throw new Error(status.error || 'Scene export failed');
            if (status.status === 'ready') {
              const output = await workerRequest(this.env, `/jobs/${job.workerKey}/asset`);
              if (!output.ok) throw new Error('Scene download unavailable');
              const bytes = await assetBytes(output); job.storageKey = `learn-scene-dev/${this.state.id}/${job.key}.glb`;
              await this.env.RUNS.put(job.storageKey, bytes, { httpMetadata: { contentType: 'model/gltf-binary' } }); job.status = 'ready';
            }
          }
        }
      } catch (error) {
        if (Date.now() - job.startedAt > WAIT_MS || !/fetch|network|timeout|connection/i.test(error.message)) { job.status = 'failed'; job.error = error.message; }
      }
      await this.state.storage.put(key, job);
    }
    if ([...(await this.state.storage.list({ prefix: 'job:' })).values()].some(j => ['queued', 'rendering'].includes(j.status))) await this.state.storage.setAlarm(Date.now() + 5000);
  }
}
