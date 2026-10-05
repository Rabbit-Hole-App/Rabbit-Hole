// M7A development orchestrator: the HTTP face of pipeline.mjs that the LearnVideos Durable Object's
// motion_request provider (control-plane motion-provider.js) talks to. It holds the model key and
// drives the render service; the Worker never sees a key. DEVELOPMENT ONLY: started by hand
// (scripts/motion-orchestrator.mjs) on the authoring host, never deployed.
//
//   POST /jobs {request: "/motion ...", location?: {concept}}  -> 202 {job_id} | 429 busy | 400
//   GET  /jobs/<id>                                             -> status, stage, provenance, cost
//   GET  /jobs/<id>/final.mp4                                   -> the validated final render, once ready
//   POST /jobs/<id>/cancel                                      -> 202; Stop at the next stage boundary
//
// One job at a time, and none while the render service is still busy (a stopped job's render may
// still be finishing). Bearer token on every route. Nothing in a URL becomes a path but a 32-hex id.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runMotionRequest } from './pipeline.mjs';
import { MotionCancelled } from './review-job.mjs';

const ID = /^[0-9a-f]{32}$/;
const send = (res, status, body, type = 'application/json') => {
  const data = type === 'application/json' ? Buffer.from(JSON.stringify(body)) : body;
  res.writeHead(status, { 'content-type': type, 'content-length': data.length, 'cache-control': 'no-store' });
  res.end(data);
};
const readJson = req => new Promise((done, fail) => {
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > 8192) { fail(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { done(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { fail(Object.assign(new Error('the body is not JSON'), { status: 400 })); } });
});

// Exactly {request, location?}: a /motion line and, optionally, the canvas concept it was typed on.
export function validateJobRequest(body) {
  const e = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['body: an object is required'];
  for (const k of Object.keys(body)) if (!['request', 'location'].includes(k)) e.push(`${k}: not a field`);
  if (typeof body.request !== 'string' || !/^\/motion\s+\S/.test(body.request) || body.request.length > 500) e.push('request: "/motion <what to explain>", at most 500 characters');
  const l = body.location;
  if (l !== undefined && (!l || typeof l !== 'object' || Array.isArray(l) || Object.keys(l).some(k => k !== 'concept') || (l.concept !== undefined && l.concept !== null && (typeof l.concept !== 'string' || l.concept.length > 100)))) e.push('location: {concept?: string of at most 100 characters}');
  return e;
}

// The job as the provider polls it: no prompt, no key, no source text beyond the block provenance.
const view = j => ({
  job_id: j.id, status: j.status, stage: j.stage, created_at: j.created_at, finished_at: j.finished_at ?? null,
  ...(j.result ? {
    failure_reason: j.result.failure_reason ?? null, clarification: j.result.clarification ?? null,
    title: j.result.brief?.title ?? null, motion: j.result.block?.motion ?? null, render_id: j.result.render?.render_id ?? null,
    repair_count: j.result.job?.repair_count ?? null, cost_usd: j.result.cost_usd ?? null, model_latency_s: j.result.model_latency_s ?? null, timings: j.result.timings ?? null,
  } : {}),
});

export function motionOrchestrator({ token, service, call, env = {}, outDir, run = runMotionRequest, maxCalls = 16, log = () => {} }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('motionOrchestrator: a token of at least 32 characters is required');
  const jobs = new Map();
  let active = null;
  const authorized = req => {
    const got = Buffer.from(String(req.headers.authorization || '')), want = Buffer.from(`Bearer ${token}`);
    return got.length === want.length && timingSafeEqual(got, want);
  };

  function start(body) {
    const id = randomBytes(16).toString('hex');
    const controller = new AbortController();
    const job = { id, status: 'running', stage: 'queued', request: body.request, location: body.location ?? {}, created_at: new Date().toISOString(), controller, calls: 0 };
    jobs.set(id, job);
    active = job;
    // Stop also abandons a model call in flight (its response is discarded) and every call is capped.
    const guarded = (...args) => {
      if (controller.signal.aborted) return Promise.reject(new MotionCancelled());
      if (++job.calls > maxCalls) return Promise.resolve(new Response(`refused locally: the ${maxCalls}-call budget for this job is spent`, { status: 429 }));
      return Promise.race([call(...args), new Promise((_, fail) => controller.signal.addEventListener('abort', () => fail(new MotionCancelled()), { once: true }))]);
    };
    log(`job ${id}: ${body.request}`);
    run({ message: body.request, location: job.location, call: guarded, env, service, dir: join(outDir, id), signal: controller.signal, onStage: stage => { job.stage = stage; } })
      .then(result => { job.result = result; job.status = result.status; })
      .catch(error => { job.result = { status: 'failed', failure_reason: `the pipeline crashed: ${String(error?.message || error).split('\n')[0]}` }; job.status = 'failed'; })
      .finally(() => { job.finished_at = new Date().toISOString(); if (active === job) active = null; log(`job ${id}: ${job.status}${job.result?.failure_reason ? ` (${job.result.failure_reason})` : ''}`); });
    return job;
  }

  async function handle(req, res) {
    try {
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
      const path = req.url.split('?')[0];
      if (path === '/jobs') {
        if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
        const body = await readJson(req);
        const errors = validateJobRequest(body);
        if (errors.length) return send(res, 400, { error: 'invalid_request', errors });
        if (active) return send(res, 429, { error: 'busy', detail: 'one Motion job at a time', job_id: active.id });
        if ((await service.health().catch(() => null))?.busy) return send(res, 429, { error: 'busy', detail: 'the render service is still finishing a render' });
        const job = start(body);
        return send(res, 202, { job_id: job.id, status: job.status });
      }
      const m = path.match(/^\/jobs\/([0-9a-f]{32})(\/final\.mp4|\/cancel)?$/);
      if (!m || !ID.test(m[1])) return send(res, 404, { error: 'not_found' });
      const job = jobs.get(m[1]);
      if (!job) return send(res, 404, { error: 'not_found', detail: 'unknown job' });
      if (m[2] === '/cancel') {
        if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
        if (job.status === 'running') { job.controller.abort(); log(`job ${job.id}: stop requested during ${job.stage}`); }
        return send(res, 202, { job_id: job.id, status: job.status === 'running' ? 'stopping' : job.status });
      }
      if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
      if (!m[2]) return send(res, 200, view(job));
      const file = join(outDir, job.id, 'final', 'final.mp4');
      if (job.status !== 'ready' || !existsSync(file)) return send(res, 409, { error: 'not_ready', status: job.status });
      return send(res, 200, readFileSync(file), 'video/mp4');
    } catch (error) {
      return send(res, error.status || 500, { error: error.status ? 'invalid_request' : 'orchestrator_failure', detail: error.message });
    }
  }
  return { handle, jobs, get active() { return active; } };
}
