import { authorizedBoardApp } from './learn-board.js';
import { validateVideo, videoCacheKey } from './learn-video-schema.js';
import { videoProvider } from './video-provider.js';
import { ManimProvider, cacheKey as mathCacheKey } from './math-provider.js';
import { MotionProvider, MotionRequestProvider, motionCacheKey, motionGrant, motionRequestCacheKey, motionReservationMicros, validateMotionRender, validateMotionRequest } from './motion-provider.js';
import { paidRefusal } from './learn-paid.js';
import { validateMathAnimation } from './learn-math-schema.js';
import { learnMedia } from './learn-storage.js';
import { admitSpend, operationId, settleSpend, spendEnforced, spendMessage } from './learn-spend-ledger.js';
import { forwardUsagePayer, usageFromForwarded, recordMedia, usageContext, usageRefusal, settleAttempt, withUsage, noteUsageIdentity, finishAction, finishActionOf } from './learn-usage.js';
import { admitRender, releaseRender } from './learn-render-admission.js';

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const POLL_MS = 10000; // Clips take minutes; background polling does not depend on an open browser.
const MAX_WAIT_MS = 30 * 60 * 1000;
// A /motion request plans, reviews, may repair once and renders twice: longer.
const maxWait = job => (job.provider === 'motion_request' ? 60 * 60 * 1000 : MAX_WAIT_MS);
const dollars = micros => `$${(micros / 1e6).toFixed(2)}`;
// A Motion job's model spending (owner items 1 and 6, 2026-10-21): one hold per attempt, admitted against the learner's
// allowance before anything starts, sized to what is left of the job's ceiling (MOTION_JOB_RESERVATION_USD) across its
// attempts, and settled once with the orchestrator's real cost. Stopped jobs keep polling until their cost is known.
// How a Motion job's action ends, by the job's actual terminal state (owner message 25): completed with its video; cancelled when
// it was stopped or never started; failed when it ended without a video at a known cost; interrupted (outcome unknown) when its
// cost could not be confirmed, as after an orchestrator restart. Never completed because its hold settled.
const motionOutcome = (job, view, known) => (known == null ? { status: 'interrupted', result: null }
  : view?.status === 'ready' ? { status: 'completed', result: 'full' }
    : job.stopped || view?.status === 'cancelled' || view?.status === 'refused' ? { status: 'cancelled', result: 'none' }
      : { status: 'failed', result: 'none' });
// A Motion job's reservation as the card shows it: reserved while it runs; pending while its final cost is not confirmed (a
// stopped job settling, or a cost that could not be read: reconciliation pending); released once settled at a known cost.
const motionHold = j => (j?.provider === 'motion_request' && j.spend?.admitted ? { usd: j.spend.micros / 1e6,
  state: !j.spend.settled ? (j.status === 'generating' ? 'reserved' : 'pending') : j.spend.costMicros == null ? 'pending' : 'released' } : null);
const needsSettling = job => job.provider === 'motion_request' && job.spend?.admitted && !job.spend.settled;
// What the orchestrator reports for a job that never started: nothing spent, the whole hold released.
const NOTHING = { status: 'refused', spend: { cost_usd: 0, bound_usd: 0, calls: 0, in_flight: 0 }, renders: 0 };
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
  return binding.get(id).fetch(withCanvasRepository(forwardUsagePayer(req, usageContext(env)?.identity || app), await canvasRepository(env, app)));
}

// The canvas's repository, from the server's own records and never the browser (mgrnd ruling, 2026-10-21): a repository
// canvas's repository at its imported commit, or a course canvas's pinned source (V1 has one course, the nanoGPT slice).
// Null when the canvas has none. A /motion request on it is grounded on that code only where Motion can read it.
const REPO = /^[\w.-]+\/[\w.-]+$/, SHA = /^[0-9a-f]{40}$/;
export async function canvasRepository(env, app) {
  if (app.kind === 'repository') return REPO.test(app.repo || '') && SHA.test(app.repo_commit || '') ? { repo: app.repo, commit: app.repo_commit } : null;
  try {
    const row = env.DB && app.id ? await env.DB.prepare('SELECT source_version FROM learn_courses WHERE app_id = ?').bind(app.id).first() : null;
    return SHA.test(row?.source_version || '') ? { repo: 'karpathy/nanoGPT', commit: row.source_version } : null;
  } catch { return null; }
}
// One server-set header, always removed from what the browser sent first (as the usage payer is).
const REPOSITORY_HEADER = 'x-rh-canvas-repository';
export function withCanvasRepository(req, repository) {
  const headers = new Headers(req.headers);
  headers.delete(REPOSITORY_HEADER);
  if (repository) headers.set(REPOSITORY_HEADER, JSON.stringify(repository));
  return new Request(req, { headers });
}
const forwardedRepository = req => {
  try { const r = JSON.parse(req.headers.get(REPOSITORY_HEADER) || 'null'); return r && REPO.test(r.repo || '') && SHA.test(r.commit || '') ? { repo: r.repo, commit: r.commit } : null; } catch { return null; }
};

// A stored clip, with range support. Its type is the job's own (Avatar Teacher §13: WebM with alpha stays
// video/webm); jobs that recorded none are MP4, as every FAL and Manim clip is.
export async function serveClip(env, job, req) {
  const object = await learnMedia(env).get(job.storageKey, { range: req.headers });
  if (!object) return json({ error: 'Video unavailable' }, 404);
  const headers = new Headers({ 'Content-Type': job.contentType || 'video/mp4', 'Cache-Control': 'private, max-age=3600', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' });
  headers.set('Content-Length', String(object.range?.length ?? object.size));
  if (object.range) headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
  return new Response(object.body, { status: object.range ? 206 : 200, headers });
}

// A finished clip from the provider's URL (the adapter has already checked its host). sniffed: the caller types
// the clip from its own bytes (Avatar Teacher), so a generic binary header is accepted too - HeyGen's
// files2.heygen.ai serves MP4 as binary/octet-stream (first real render, 2026-10-04).
const GENERIC_TYPES = ['binary/octet-stream', 'application/octet-stream'];
export async function downloadClip(url, { sniffed = false } = {}) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !(type.startsWith('video/') || (sniffed && GENERIC_TYPES.includes(type.split(';')[0].trim())))) throw new Error('Video download unavailable');
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
  return bytes;
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
        return serveClip(this.env, job, req);
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
        // Stop (M7A): only a job whose provider can stop it. Stopping is free, so it needs no
        // confirmation; the job fails as "Stopped." and stays retryable (a new confirmed Generate).
        if (body.action === 'cancel') {
          const p = await this.state.storage.get(`placement:${body.id}`);
          const job = p && await this.state.storage.get(`job:${p.key}`);
          if (!job) return json({ error: 'Video placement not found' }, 404);
          if (job.status !== 'generating') return json({ error: 'Nothing is generating here' }, 409);
          if (job.provider !== 'motion_request') return json({ error: 'This video cannot be stopped once it has started' }, 409);
          let unconfirmed = '';
          try { if (job.ticket) await new MotionRequestProvider(this.env).cancel(job.ticket); }
          catch (error) { unconfirmed = ` The Motion harness did not confirm the stop: ${error.message}`; }
          Object.assign(job, { status: 'failed', error: `Stopped.${unconfirmed}`, stopped: true, uncertain: false });
          await this.state.storage.put(`job:${p.key}`, job);
          // Its hold settles once the orchestrator reports what the stopped job really spent.
          if (needsSettling(job)) await this.state.storage.setAlarm(Date.now() + POLL_MS);
          return json(await this.list());
        }
        // A paid job starts only from the learner's explicit confirmation.
        const refused = paidRefusal(body); if (refused) return refused;
        const maths = body.operation?.op === 'generate_math_animation';
        const motion = body.operation?.op === 'motion_render';
        const motionRequest = body.operation?.op === 'motion_request';
        const provider = maths ? new ManimProvider(this.env) : motion ? new MotionProvider(this.env) : motionRequest ? new MotionRequestProvider(this.env) : videoProvider(this.env);
        const input = maths ? { spec: validateMathAnimation(body.operation), id: body.operation.id, caption: body.operation.caption } : motion ? validateMotionRender(body.operation) : motionRequest ? validateMotionRequest(body.operation) : validateVideo(body.operation);
        if (typeof body.lessonId !== 'string' || body.lessonId.length > 150 || typeof body.page !== 'string' || body.page.length > 150) throw new Error('Lesson and page are required');
        // The worker's compiler version is part of the key, so a rebuilt
        // compiler renders again instead of serving a stale animation.
        const version = maths ? await provider.workerVersion() : provider.version;
        const key = maths ? await mathCacheKey(input.spec, version) : motion ? await motionCacheKey(input) : motionRequest ? await motionRequestCacheKey(input) : await videoCacheKey(input, version);
        let job = await this.state.storage.get(`job:${key}`);
        if (!job || (body.retry === true && job.status === 'failed' && !job.uncertain)) {
          const all = await this.state.storage.list({ prefix: 'job:' });
          if ([...all.values()].some(j => j.status === 'generating')) return json({ error: 'One video is already generating. Wait for it before requesting another.' }, 409);
          if (all.size >= 100 && !job) throw new Error('This preview has reached its saved video limit');
          if (job && needsSettling(job)) return json({ error: 'The stopped video is still finishing. Try again in a moment.' }, 409);
          // A retry of the same Motion job spends from the same ceiling: what earlier attempts used (or may have used) carries over.
          job = { key, input, status: 'generating', startedAt: Date.now(), version, provider: maths ? 'manim' : motion ? 'motion' : motionRequest ? 'motion_request' : this.env.LEARN_VIDEO_PROVIDER, ...(motionRequest ? { consumedMicros: job?.consumedMicros || 0 } : {}) };
          // A Manim render is platform-funded rendering (owner 5A decision C, 2026-10-21: 'render', apart from the learner's
          // allowance): it takes the learner's render slot across all canvases first (render fairness, 2026-10-21).
          if (maths) {
            // No enforced remote limit is relied on (the worker's 420 s timeout kills its direct child only), so the slot counts
            // until it is released on a status the worker confirmed (waitSeconds null).
            const admission = await admitRender(this.env, req, { provider: 'manim', model: version, label: 'animation', waitSeconds: null });
            if (admission.refused) return admission.refused;
            job.slot = admission.slot;
          }
          // Persist before submitting. Never automatically repeat a potentially charged POST.
          await this.state.storage.put(`job:${key}`, job);
          await this.state.storage.setAlarm(Date.now() + POLL_MS);
          if (motionRequest) { job.repository = forwardedRepository(req); await this.startMotion(req, job, provider); }
          else try { job.ticket = maths ? await provider.submit(input, version) : await provider.submit(input); }
          // A Motion submit is a GET of a finished render (nothing charged), and a definite refusal
          // started nothing: both stay retryable. Anything else may have started a paid job.
          catch (error) { const known = motion || error.definite === true; job.status = 'failed'; job.uncertain = !known; job.error = known ? error.message : 'Submission could not be confirmed. Check the provider request history before generating again.'; }
          // Usage accounting (ledger bypass): one attempt per submission, cost unknown (no verified price); a definite
          // refusal started nothing and is not recorded. A Motion render submit is a GET of a finished render. A Manim render was
          // recorded by its admission. A definite refusal started nothing and gives its slot back; an unconfirmed submission may
          // be rendering, so it keeps the slot until the alarm reconciles it (reconcileManim).
          if (maths && !job.ticket) { if (job.uncertain) job.reconcile = true; else await releaseRender(this.env, job.slot, 'cancelled'); }
          else if (!motion && !maths && !motionRequest && (job.ticket || job.uncertain)) await recordMedia(usageFromForwarded(this.env, req, 'video'), { provider: job.provider, ok: !!job.ticket });
          await this.state.storage.put(`job:${key}`, job);
        } else if (body.retry === true && job.uncertain) {
          return json({ error: job.error }, 409);
        }
        const placementId = await videoCacheKey({ ...input, prompt: JSON.stringify([body.lessonId, body.page, input.id]) }, key);
        const operation = maths ? body.operation : input;
        const previous = await this.state.storage.get(`placement:${placementId}`);
        await this.state.storage.put(`placement:${placementId}`, previous || { id: placementId, key, lessonId: body.lessonId, page: body.page, operation, position: null });
        return json({ ...await this.list(), placementId }, 202);
      } catch (error) { return json({ error: error.message }, 400); }
    });
  }
  async list() {
    const placements = await this.state.storage.list({ prefix: 'placement:' });
    const jobs = await this.state.storage.list({ prefix: 'job:' });
    // motionHoldUsd: the per-job reservation the server admits (MOTION_JOB_RESERVATION_USD), only where Motion can start, so the
    // confirmation states the amount the server will hold (owner message 25), never a figure of the browser's own.
    const holdMicros = !new MotionRequestProvider(this.env).unavailable() && motionReservationMicros(this.env);
    return { ...(holdMicros ? { motionHoldUsd: holdMicros / 1e6 } : {}), videos: [...placements.values()].map(p => {
      const j = jobs.get(`job:${p.key}`);
      return { ...p, status: j?.status || 'idle', error: j?.error, retryable: !j?.uncertain, duration: j?.input.duration, provider: j?.result?.provider, generationId: j?.result?.generationId, ...(j?.result?.motion ? { motion: j.result.motion } : {}), ...(motionHold(j) ? { hold: motionHold(j) } : {}) };
    }) };
  }
  // Admission, then submission. A refusal or a definite orchestrator refusal starts nothing and releases the hold. An
  // unconfirmed submission (MOT-07: no answer, a 500, a 502, a malformed success) keeps the job generating with its hold
  // reserved; it is never resent: the alarm reconciles its key (pollMotion).
  async startMotion(req, job, provider) {
    const refused = provider.unavailable() || await this.admitMotion(req, job);
    if (refused) { Object.assign(job, { status: 'failed', error: refused, uncertain: false }); return; }
    await this.state.storage.put(`job:${job.key}`, job);
    try {
      // The grant names the orchestrator process that answers now (MOT-08); it is stored before the one POST it may go out in.
      job.spend.grant = await motionGrant(this.env.MOTION_ORCHESTRATOR_TOKEN, job.spend.opId, job.spend.micros, Math.floor(Date.now() / 1000), await provider.boot());
      await this.state.storage.put(`job:${job.key}`, job);
      job.ticket = await provider.submit(job.input, job.spend, job.repository);
    } catch (error) {
      if (!error.definite) return; // unconfirmed: the alarm reconciles the key, never resubmits
      await this.settleMotion(job, NOTHING);
      Object.assign(job, { status: 'failed', error: error.message, uncertain: false });
    }
  }

  // -> null when admitted (job.spend holds the reservation; startMotion signs its grant), else the person's explanation.
  async admitMotion(req, job) {
    const ceiling = motionReservationMicros(this.env);
    if (ceiling == null) return 'Motion is not available here yet: its per-video spending limit is not configured. Nothing was started.';
    const left = ceiling - (job.consumedMicros || 0);
    if (left <= 0) return `This video has used its ${dollars(ceiling)} AI spending limit across its attempts (an interrupted attempt's unknown cost stays counted). Nothing was started; ask for it in different words to make a new one.`;
    const scoped = usageFromForwarded(this.env, req, 'video');
    job.payer = usageContext(scoped)?.identity || null;
    const now = Math.floor(Date.now() / 1000), opId = operationId('motion');
    if (spendEnforced(this.env)) {
      const gate = await admitSpend(this.env.LEARN_DB, scoped, { opId, userId: 'provider:motion', org: 'platform', category: 'motion', reservedUsd: left / 1e6, kind: 'generation', provider: 'anthropic', now, deadlineAt: now + maxWait(job) / 1000 });
      // Refused: the action admission opened for this request is closed here (no route boundary runs inside the object).
      if (gate.refused) { await finishAction(scoped, { status: 'failed', result: 'none' }); return `${spendMessage(gate.reason, usageRefusal(scoped)?.period)} Nothing was started.`; }
      job.spend = { opId, attemptId: gate.attemptId, micros: left };
    } else job.spend = { opId, attemptId: null, micros: left };
    Object.assign(job.spend, { admitted: true, settled: false });
    return null;
  }

  // Settles the attempt's hold once: the real cost when the orchestrator could price every call (the rest is released),
  // else unknown with its reservation kept (learn-spend-ledger.js). Renders are platform-funded compute, recorded apart
  // under feature render (owner 5A decision C) and never in the learner's allowance.
  async settleMotion(job, view) {
    const spend = job.spend;
    if (!spend?.admitted || spend.settled) return;
    const cost = view?.spend?.cost_usd, known = Number.isFinite(cost) && cost >= 0 ? Math.ceil(Number((cost * 1e6).toFixed(6))) : null;
    const bound = Number.isFinite(view?.spend?.bound_usd) ? Math.ceil(Number((view.spend.bound_usd * 1e6).toFixed(6))) : spend.micros;
    const calls = view?.spend?.calls || 0, status = calls === 0 && known === 0 ? 'cancelled' : view?.status === 'ready' ? 'settled' : 'failed';
    if (spendEnforced(this.env)) {
      await settleSpend(this.env.LEARN_DB, spend.opId, { status, calls, costUsd: known == null ? null : known / 1e6, provider: 'anthropic', error: status === 'failed' ? `motion_${view?.status || 'lost'}` : null });
      await settleAttempt(this.env, spend.attemptId, { costMicros: known, status });
      await finishActionOf(this.env, spend.attemptId, motionOutcome(job, view, known));
    }
    job.consumedMicros = (job.consumedMicros || 0) + Math.min(known ?? bound, spend.micros);
    Object.assign(spend, { settled: true, costMicros: known });
    await this.state.storage.put(`job:${job.key}`, job);
    // Each render as the renderer reported it (orchestrator.mjs render_states): a finished one completed, a failed one failed,
    // one never reported finished interrupted (outcome unknown), never completed. Written once, with the settlement guard above.
    const states = (Array.isArray(view?.render_states) ? view.render_states : Array(Math.min(Number(view?.renders) || 0, 8)).fill('unknown')).slice(0, 8);
    for (const state of states) {
      const scoped = withUsage(this.env, { feature: 'render' });
      noteUsageIdentity(scoped, job.payer);
      await finishAction(scoped, state === 'ready' ? { status: 'completed', result: 'full' } : state === 'failed' ? { status: 'failed', result: 'none' } : { status: 'interrupted', result: null });
      await recordMedia(scoped, { provider: 'motion_renderer', ok: state === 'ready' });
    }
  }

  // One poll of a Motion job: reconcile an unconfirmed submission by its key, settle once the job ends and nothing is in flight,
  // then store the ready video or the reason it ended. A stopped job only settles.
  async pollMotion(job) {
    const provider = new MotionRequestProvider(this.env);
    const late = Date.now() - job.startedAt > maxWait(job);
    if (!job.ticket) {
      // Never resubmitted (MOT-07, and after Stop MOT-09). No grant stored: no POST ever left. Otherwise the orchestrator answers
      // the job the key started, or closes the key; closed by the process the grant was bound to, no job can ever start under it.
      let answer = job.spend?.grant ? null : { closed: true, boot: null };
      if (!answer) try { answer = await provider.close(job.spend.opId); } catch { /* unreachable: ask again */ }
      if (answer?.job_id) job.ticket = { id: answer.job_id };
      else if (answer?.closed && answer.boot === (job.spend?.grant?.boot ?? null)) {
        await this.settleMotion(job, NOTHING);
        if (job.status === 'generating') Object.assign(job, { status: 'failed', error: 'The Motion service did not start this video. Nothing was spent; generate it again.', uncertain: false });
        return;
      } else if (answer?.closed || late) {
        // The process the grant was for is gone (or never answered): whether it started the job is unknown.
        await this.settleMotion(job, null);
        if (job.status === 'generating') Object.assign(job, { status: 'failed', error: 'The Motion service lost this video before it confirmed the start. Its spending stays held until it is reconciled.', uncertain: true });
        return;
      } else return; // still being admitted, or unreachable: ask again
    }
    const view = await provider.job(job.ticket);
    // Stop is durable (MOT-09): a job still running after Stop, recovered by its key or whose stop went unconfirmed, is told again.
    if (job.stopped && view?.status === 'running') await provider.cancel(job.ticket).catch(() => {});
    if (view?.status === 'running' && !late) return;
    if (view && view.status !== 'running' && view.spend?.in_flight > 0 && !late) return; // a stopped call still lands and is priced
    await this.settleMotion(job, view && view.status !== 'running' ? view : null);
    if (job.status !== 'generating') return;
    if (!view || view.status === 'running') {
      Object.assign(job, view ? { status: 'failed', uncertain: true, error: `Generation has not completed within ${maxWait(job) / 60000} minutes. Check provider history before generating again.` }
        : { status: 'failed', error: 'The Motion service restarted while this video was being made. Generate it again; the interrupted attempt\'s cost stays counted.' });
      return;
    }
    const result = await provider.poll(job.ticket, view);
    job.storageKey = `learn-video-dev/${this.state.id}/${job.key}.mp4`;
    await learnMedia(this.env).put(job.storageKey, result.bytes, { httpMetadata: { contentType: 'video/mp4' } });
    job.result = { provider: result.provider, generationId: result.generationId, motion: result.motion };
    job.status = 'ready';
  }

  async alarm() {
    // A finished job stores its asset: only ever in the dev bucket, never small-runs.
    if (!this.env.LEARN_MEDIA) throw new Error('LEARN_MEDIA is not bound on this worker');
    const jobs = await this.state.storage.list({ prefix: 'job:' });
    for (const [key, job] of jobs) {
      if (job.provider === 'motion_request' && (job.status === 'generating' || needsSettling(job))) {
        try { await this.pollMotion(job); }
        catch (error) { if (error.final) { job.status = 'failed'; job.error = error.message; } } // transient: the next poll
        await this.state.storage.put(key, job);
        continue;
      }
      if (job.reconcile) { await this.reconcileManim(job); await this.state.storage.put(key, job); continue; }
      if (job.status !== 'generating') continue;
      // A crash after POST but before storing its ticket cannot safely be retried. A Manim job keeps its slot until reconciled.
      if (!job.ticket) { job.status = 'failed'; job.uncertain = true; job.error = 'Submission status is unknown. Check provider history before generating again.'; if (job.provider === 'manim' && job.slot) job.reconcile = true; }
      else {
        try {
          const result = job.provider === 'manim' ? await new ManimProvider(this.env).poll(job.ticket)
            : job.provider === 'motion' ? await new MotionProvider(this.env).poll(job.ticket)
            : await videoProvider({ ...this.env, LEARN_VIDEO_PROVIDER: job.provider }).poll(job.ticket);
          if (result?.bytes) {
            job.storageKey = `learn-video-dev/${this.state.id}/${job.key}.mp4`;
            await learnMedia(this.env).put(job.storageKey, result.bytes, { httpMetadata: { contentType: 'video/mp4' } });
            // Never persist the clip itself in the job record.
            job.result = { provider: result.provider, generationId: result.generationId, ...(result.motion ? { motion: result.motion } : {}) };
            job.status = 'ready';
          } else if (result) {
            const bytes = await downloadClip(result.videoUrl);
            job.storageKey = `learn-video-dev/${this.state.id}/${job.key}.mp4`;
            await learnMedia(this.env).put(job.storageKey, bytes, { httpMetadata: { contentType: 'video/mp4' } });
            job.result = { ...result, videoUrl: undefined, duration: job.input.duration };
            job.status = 'ready';
          }
          if (Date.now() - job.startedAt > maxWait(job) && job.status !== 'ready') { job.uncertain = true; throw new Error(`Generation has not completed within ${maxWait(job) / 60000} minutes. Check provider history before generating again.`); }
        } catch (error) {
          // Transient polling/storage errors keep the existing ticket: no paid resubmission.
          if (error.final || Date.now() - job.startedAt > maxWait(job) || /could not generate|returned no video|Invalid generated/.test(error.message)) { job.status = 'failed'; job.error = error.message; }
        }
      }
      // A Manim job that ended without a status the worker confirmed (timed out here, unconfirmed) keeps its slot until reconciled.
      if (job.provider === 'manim' && job.slot && job.status === 'failed' && job.uncertain) job.reconcile = true;
      await this.state.storage.put(key, job);
      if (job.status !== 'generating' && !job.reconcile) await releaseRender(this.env, job.slot, job.status === 'ready' ? 'settled' : 'failed'); // a Manim job's slot
    }
    if ([...(await this.state.storage.list({ prefix: 'job:' })).values()].some(j => j.status === 'generating' || j.reconcile || needsSettling(j))) await this.state.storage.setAlarm(Date.now() + POLL_MS);
  }
  // An unconfirmed Manim job (its submit response or ticket was lost, or it outlived its wait here) holds the learner's render
  // slot until the worker says what became of its deterministic key, read-only and never resubmitted. Within the wait, a job
  // the worker has is followed to its end as usual. A key it does not have is rendering nothing, and a ready or failed one has
  // ended: either releases the slot once. Still rendering or unreachable: the slot stays held and the next alarm asks again.
  // No local timer releases it (owner, 2026-10-21 message 19).
  async reconcileManim(job) {
    let state = null;
    try {
      const response = await new ManimProvider(this.env).request(`/jobs/${job.key}`);
      state = response.status === 404 ? 'gone' : response.ok ? (await response.json()).status : null;
    } catch { /* unreachable: held */ }
    if (state && Date.now() - job.startedAt <= MAX_WAIT_MS && state !== 'gone') {
      Object.assign(job, { ticket: { id: job.key, version: job.version }, status: 'generating', uncertain: false, error: undefined, reconcile: false });
    } else if (['gone', 'ready', 'failed'].includes(state)) {
      job.reconcile = false;
      await releaseRender(this.env, job.slot, state === 'ready' ? 'settled' : 'failed');
    }
  }

}
