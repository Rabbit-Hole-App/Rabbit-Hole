// The /whiteboard routes (roadmap v1 section 6.2), served by server.mjs beside Motion's after the same bearer check, and sharing its one render
// slot, sandboxed child, limits, deadline, idempotency keys and finished-render memory (motionRenderService passes them in as `svc`):
//
//   POST   /whiteboard/render                      a whiteboard-render/1 request (at most 16 MiB) -> 202 {render_id, poll}
//                                                  optional Idempotency-Key header, as POST /render: the same key and body never render twice
//   GET    /whiteboard/<render_id>                 status and metadata (+ artifact paths when ready)
//   GET    /whiteboard/<render_id>/artifacts/<n>   final.mp4 | poster.png | contact-sheet.png
//   DELETE /whiteboard/<render_id>                 stop a running render
//
// The body is gated (whiteboard/contracts.mjs) before anything is written. The job directory gets job.json {type: 'whiteboard', manifest, ...}
// and public/audio/bNN.mp3 (one per narrated timing beat); the child adds the pinned fonts and renders (whiteboard/render.mjs).
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { audioName } from '../../src/whiteboard/timeline.js';
import { FPS, LIMITS, RENDER_SCHEMA, validateRenderRequest } from '../../whiteboard/contracts.mjs';

export const WHITEBOARD_ARTIFACTS = Object.freeze(['final.mp4', 'poster.png', 'contact-sheet.png']);

export function whiteboardRoutes(svc) {
  const { send, readBody, state, renders, keys, remember, counters, cancels, jobsDir, jobStore, run, prune, view, keyFile, storeDir, prepareLimits, jobTimeoutMs, canonical, keyPattern, contentTypes, settings, boot_id, log } = svc;
  const poll = id => `/whiteboard/${id}`;
  const wbView = record => {
    const v = view(record);
    if (v.artifacts) v.artifacts = Object.fromEntries(Object.entries(v.artifacts).map(([k, p]) => [k, p.replace('/render/', '/whiteboard/')]));
    return v;
  };

  async function post(req, res) {
    counters.posts++;
    const key = req.headers['idempotency-key'];
    if (key !== undefined && !keyPattern.test(key)) return send(res, 400, { error: 'invalid_idempotency_key', detail: 'Idempotency-Key is 1 to 128 of letters, digits . _ : -' });
    let body;
    try { body = JSON.parse(await readBody(req, LIMITS.bodyBytes)); }
    catch (error) { return send(res, error.status || 400, error.status ? { error: 'too_large', detail: `a whiteboard render request must fit within ${LIMITS.bodyBytes} bytes` } : { error: 'malformed', detail: 'the body is not JSON' }); }
    const errors = validateRenderRequest(body);
    if (errors.length) return send(res, 400, { error: 'invalid_job', schema: RENDER_SCHEMA, errors: errors.slice(0, 50) });
    const hash = createHash('sha256').update(canonical(body)).digest('hex');
    const seen = key && keys.get(key);
    if (seen) {
      if (seen.hash !== hash) return send(res, 409, { error: 'idempotency_conflict', detail: 'this Idempotency-Key was used for a different job; use a new key for a new attempt', render_id: seen.render_id });
      const prior = renders.get(seen.render_id);
      if (!prior) return send(res, 410, { error: seen.state === 'unknown' ? 'unknown_outcome' : 'expired', detail: 'this job\'s render is gone; nothing was started; use a new key for a new attempt', render_id: seen.render_id, state: seen.state });
      counters.replayed++;
      return send(res, 202, { render_id: prior.render_id, status: prior.status, poll: poll(prior.render_id), deadline_seconds: prior.deadline_seconds, replayed: true });
    }
    const store = jobStore();
    if (store.refusing) return send(res, 503, { error: store.refusing, detail: 'the durable job store is not usable; nothing was started', job_store: store });
    if (state.degraded) return send(res, 503, { error: 'degraded', detail: `${state.degraded}; the machine must be restarted` });
    if (state.active) return send(res, 429, { error: 'busy', detail: 'one render at a time; retry when the current render has finished', render_id: state.active.render_id });
    const id = randomBytes(16).toString('hex'), dir = join(jobsDir, id), seconds = body.manifest.timing.totalFrames / FPS, limitMs = jobTimeoutMs(seconds);
    const record = { render_id: id, type: 'whiteboard', status: 'rendering', stage: 'final', renderer: 'whiteboard', whiteboard_job_id: body.job_id, segment: body.segment, created_at: new Date().toISOString(), deadline_seconds: limitMs / 1000, settings, boot_id, job_store: store, ...(key ? { idempotency_key: key } : {}) };
    state.active = record;
    try {
      // The same ownership as a Motion job (2770 setgid directories, 0640 inputs): the render user reads them and writes public/fonts and out/.
      for (const d of ['out', 'public/audio']) mkdirSync(join(dir, d), { recursive: true });
      for (const d of [dir, join(dir, 'out'), join(dir, 'public'), join(dir, 'public', 'audio')]) chmodSync(d, 0o2770);
      const mp3 = new Map(body.audio.map(a => [a.beat, a.b64]));
      body.manifest.timing.beats.forEach((t, i) => { if (t.audioFrames > 0) writeFileSync(join(dir, 'public', audioName(i)), Buffer.from(mp3.get(t.audioKey), 'base64'), { mode: 0o640 }); });
      writeFileSync(join(dir, 'job.json'), JSON.stringify({ render_id: id, type: 'whiteboard', job_id: body.job_id, segment: body.segment, manifest: body.manifest }), { mode: 0o640 });
      prepareLimits(dir, limitMs);
      if (key && storeDir) writeFileSync(keyFile(key), JSON.stringify({ key, render_id: id, hash, state: 'accepted', error: null }));
    } catch (error) {
      state.active = null;
      rmSync(dir, { recursive: true, force: true });
      return send(res, 500, { error: 'renderer_failure', detail: `the job directory could not be prepared: ${error.message}` });
    }
    renders.set(id, record);
    if (key) remember(key, { render_id: id, hash, state: 'accepted', error: null });
    counters.started++;
    run(record, dir);
    log(`whiteboard render ${id} started (${body.job_id}, ${seconds}s)`);
    send(res, 202, { render_id: id, status: 'rendering', poll: poll(id), deadline_seconds: record.deadline_seconds });
  }

  // true when the path is a whiteboard route (answered here), false otherwise.
  return function handle(req, res, path) {
    if (path === '/whiteboard/render') {
      if (req.method !== 'POST') send(res, 405, { error: 'method_not_allowed' });
      else post(req, res).catch(error => send(res, 500, { error: 'renderer_failure', detail: error.message }));
      return true;
    }
    if (!path.startsWith('/whiteboard/')) return false;
    // Only a 32-hex id and a fixed artifact name: nothing in a URL ever becomes a file path.
    const m = path.match(/^\/whiteboard\/([0-9a-f]{32})(?:\/artifacts\/([a-z0-9.-]+))?$/);
    if (!m || !['GET', 'DELETE'].includes(req.method) || (req.method === 'DELETE' && m[2])) return send(res, 404, { error: 'not_found' }), true;
    prune();
    const record = renders.get(m[1]);
    if (record?.type !== 'whiteboard') return send(res, 404, { error: 'not_found', detail: 'unknown or expired render' }), true;
    if (req.method === 'DELETE') {
      const stop = cancels.get(record.render_id);
      if (record.status === 'rendering' && stop) { stop(); send(res, 202, { render_id: record.render_id, status: 'cancelling', poll: poll(record.render_id) }); }
      else send(res, 200, wbView(record));
      return true;
    }
    if (!m[2]) return send(res, 200, wbView(record)), true;
    if (!WHITEBOARD_ARTIFACTS.includes(m[2])) return send(res, 404, { error: 'not_found', detail: `artifacts: ${WHITEBOARD_ARTIFACTS.join(', ')}` }), true;
    if (record.status !== 'ready') return send(res, 409, { error: 'not_ready', status: record.status }), true;
    const data = record.files[m[2]];
    if (!data) return send(res, 404, { error: 'not_found' }), true;
    res.writeHead(200, { 'Content-Type': contentTypes[m[2]], 'Content-Length': data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
    return true;
  };
}
