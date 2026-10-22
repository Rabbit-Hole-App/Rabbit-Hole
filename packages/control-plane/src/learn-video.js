import { authorizedBoardApp } from './learn-board.js';
import { validateVideo, videoCacheKey } from './learn-video-schema.js';
import { videoProvider } from './video-provider.js';
import { ManimProvider, cacheKey as mathCacheKey } from './math-provider.js';
import { MotionProvider, MotionRequestProvider, motionCacheKey, motionGrant, motionRequestCacheKey, motionReservationMicros, validateMotionRender, validateMotionRequest } from './motion-provider.js';
import { MOTION_PAUSED, motionPaused, verifyProposal } from './generation-proposal.js';
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
// An attempt is reconciled until it settles, held or free (MOT-21): a free render recovery holds nothing, yet a Stop of it is
// followed until the orchestrator confirms it ended, its renders are recorded once, and nothing new starts over it.
const needsSettling = job => job.provider === 'motion_request' && (job.spend?.admitted || job.spend?.free) && !job.spend.settled;
// MOTION_ESTIMATE_USD (a typical job's actual cost) in credits, 1 credit = $0.01, rounded up; null when unset or invalid.
export const motionEstimateCredits = env => {
  const usd = /^\d+(\.\d{1,6})?$/.test(String(env?.MOTION_ESTIMATE_USD ?? '').trim()) ? Number(env.MOTION_ESTIMATE_USD) : 0;
  return usd > 0 ? Math.ceil(Number((usd * 100).toFixed(6))) : null;
};
// Motion admission runs inside Generate's blockConcurrencyWhile, which Cloudflare ends at 30 s. Everything from the job's creation
// (its storage writes, the hold, /health, the grant write and the POST) shares one 25 s deadline, leaving 5 s. The POST waits only
// for what is left; with under 2 s left it is not tried: refused before it, released, nothing started (MOT-08 review).
export const MOTION_ADMISSION_MS = 25000;
const MOTION_MIN_POST_MS = 2000;
const SLOW = 'The Motion service was too slow to answer. Nothing was started; generate it again.';
// Owner message 28: new Motion generation is paused (MOTION_GENERATION_PAUSED "1") until MOT-06/07 are fixed. Nothing new starts or
// is reserved; jobs already started keep polling, stopping, settling and playing, and their reservations stay.
export { MOTION_PAUSED };
// What the orchestrator reports for a job that never started: nothing spent, the whole hold released.
const NOTHING = { status: 'refused', spend: { cost_usd: 0, bound_usd: 0, calls: 0, in_flight: 0 }, renders: 0 };
// Recovery (owner message 38). Each attempt's artifacts (the orchestrator's sealed checkpoint, cause, actions, verbatim findings
// and keyframes) are copied to LEARN_MEDIA as they appear and when the attempt ends; the job keeps a pointer (job.recovery). A
// failed job offers only the actions that work for its cause: render (free) the accepted composition again, fix (paid) from the
// saved work, edit the request, add a source. A job lost in a restart recovers from what was saved before it.
const lostActions = r => (r?.state === 'accepted' ? ['render'] : r?.storyboard ? ['fix'] : []);
const EXPLAIN = {
  renderer: r => (r.actions.includes('render') ? 'Rendering failed after review. The reviewed animation is saved; rendering it again uses no credits.' : 'Rendering failed before review. The animation is saved; Continue fixing renders and reviews it.'),
  content: r => (r.finding ? `Review found a problem: ${r.finding.description}` : 'The plan did not pass its checks.'),
  model: () => 'A model step failed partway. The work so far is saved; Continue fixing resumes from it.',
  missing_context: r => r.question || 'Motion needs to know what to explain.',
  limit: () => 'This video reached its AI spending limit.',
  stopped: () => 'Stopped. The work so far is saved.',
  lost: () => 'The Motion service restarted during this attempt. The work saved before it is kept.',
};
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
      // A job still reconciling with no alarm pending (stranded by older code, or an alarm whose retries ran out) is re-armed.
      if ([...(await this.state.storage.list({ prefix: 'job:' })).values()].some(needsSettling) && await this.state.storage.getAlarm() == null) await this.state.storage.setAlarm(Date.now() + POLL_MS);
      return json(await this.list());
    }
    // Serialize concurrent duplicate submissions, including the external POST.
    return this.state.blockConcurrencyWhile(async () => {
      const entered = Date.now(); // a Motion admission deadline counts from here (MOTION_ADMISSION_MS)
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
        // Recovery of a failed /motion job from its saved checkpoint: a new attempt under the same job, its own hold (fix) or
        // none (render), one settlement, Stop and duplicate protection as for Generate. Only an action the job offers runs.
        if (body.action === 'recover') {
          const p = await this.state.storage.get(`placement:${body.id}`);
          const job = p && await this.state.storage.get(`job:${p.key}`);
          if (!job) return json({ error: 'Video placement not found' }, 404);
          const offered = job.provider === 'motion_request' && job.status === 'failed' && !job.uncertain && job.recovery?.key ? job.recovery.actions : [];
          if (!['render', 'fix'].includes(body.mode) || !offered.includes(body.mode)) return json({ error: 'This video cannot be recovered that way.' }, 409);
          if (body.mode === 'fix') { const refusedFix = paidRefusal(body); if (refusedFix) return refusedFix; }
          if (motionPaused(this.env)) return json({ error: MOTION_PAUSED, code: 'motion_paused' }, 503);
          if ([...(await this.state.storage.list({ prefix: 'job:' })).values()].some(j => j.status === 'generating')) return json({ error: 'One video is already generating. Wait for it before requesting another.' }, 409);
          if (needsSettling(job)) return json({ error: 'The last attempt is still finishing. Try again in a moment.' }, 409);
          const saved = await learnMedia(this.env).get(job.recovery.key);
          const artifacts = saved ? await saved.json().catch(() => null) : null;
          if (!artifacts?.checkpoint || !artifacts.seal) return json({ error: 'The saved work for this video is no longer available. Generate it again.' }, 409);
          Object.assign(job, { status: 'generating', startedAt: Date.now(), ticket: null, error: undefined, stopped: false, uncertain: false, spend: undefined });
          await this.state.storage.put(`job:${p.key}`, job);
          await this.state.storage.setAlarm(Date.now() + POLL_MS);
          await this.startMotion(req, job, new MotionRequestProvider(this.env), entered, { mode: body.mode, checkpoint: artifacts.checkpoint, seal: artifacts.seal, holdMicros: job.recovery.holdFixMicros });
          await this.state.storage.put(`job:${p.key}`, job);
          return json({ ...await this.list(), placementId: p.id }, 202);
        }
        // A paid job starts only from the learner's explicit confirmation.
        const refused = paidRefusal(body); if (refused) return refused;
        const maths = body.operation?.op === 'generate_math_animation';
        const motion = body.operation?.op === 'motion_render';
        const motionRequest = body.operation?.op === 'motion_request';
        // Before any admission or hold: Generate, Retry, inline Motion and Ctrl+K all start here.
        if (motionRequest && motionPaused(this.env)) return json({ error: MOTION_PAUSED, code: 'motion_paused' }, 503);
        const provider = maths ? new ManimProvider(this.env) : motion ? new MotionProvider(this.env) : motionRequest ? new MotionRequestProvider(this.env) : videoProvider(this.env);
        const input = maths ? { spec: validateMathAnimation(body.operation), id: body.operation.id, caption: body.operation.caption } : motion ? validateMotionRender(body.operation) : motionRequest ? validateMotionRequest(body.operation) : validateVideo(body.operation);
        if (typeof body.lessonId !== 'string' || body.lessonId.length > 150 || typeof body.page !== 'string' || body.page.length > 150) throw new Error('Lesson and page are required');
        // The worker's compiler version is part of the key, so a rebuilt
        // compiler renders again instead of serving a stale animation.
        const version = maths ? await provider.workerVersion() : provider.version;
        const key = maths ? await mathCacheKey(input.spec, version) : motion ? await motionCacheKey(input) : motionRequest ? await motionRequestCacheKey(input) : await videoCacheKey(input, version);
        // MOT-20: an approved proposal is one the worker signed for this learner, unexpired (generation-proposal.js), before any hold.
        // Where no orchestrator is configured, startMotion refuses the job as it always has (nothing starts), so the card says why.
        if (input.proposal && !provider.unavailable()) {
          const proposalRefused = await verifyProposal(this.env, input.proposal, usageContext(usageFromForwarded(this.env, req, 'video'))?.identity?.email);
          if (proposalRefused) return json({ error: proposalRefused, code: 'proposal_refused' }, 409);
        }
        let job = await this.state.storage.get(`job:${key}`);
        if (!job || (body.retry === true && job.status === 'failed' && !job.uncertain)) {
          const all = await this.state.storage.list({ prefix: 'job:' });
          if ([...all.values()].some(j => j.status === 'generating')) return json({ error: 'One video is already generating. Wait for it before requesting another.' }, 409);
          if (all.size >= 100 && !job) throw new Error('This preview has reached its saved video limit');
          if (job && needsSettling(job)) return json({ error: 'The stopped video is still finishing. Try again in a moment.' }, 409);
          // One video per proposal: its first Generate owns it (a retry of that video is the same key); another version is refused.
          const owner = input.proposal && await this.state.storage.get(`proposal:${input.proposal.proposal_id}`);
          if (owner && owner !== key) return json({ error: 'This proposal already made a video. Ask for a new version in chat to make another.', code: 'proposal_used' }, 409);
          if (input.proposal && !owner) await this.state.storage.put(`proposal:${input.proposal.proposal_id}`, key);
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
          if (motionRequest) { job.repository = forwardedRepository(req); await this.startMotion(req, job, provider, entered); }
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
    const paused = motionPaused(this.env);
    const holdMicros = !paused && !new MotionRequestProvider(this.env).unavailable() && motionReservationMicros(this.env);
    // The confirmation's estimate (owner message 32: 1 credit = $0.01), only where Motion can start; the hold stays internal.
    const estimate = holdMicros && motionEstimateCredits(this.env);
    return { ...(holdMicros ? { motionHoldUsd: holdMicros / 1e6 } : {}), ...(estimate ? { motionEstimateCredits: estimate } : {}), ...(paused ? { motionPaused: true } : {}), videos: [...placements.values()].map(p => {
      const j = jobs.get(`job:${p.key}`);
      return { ...p, status: j?.status || 'idle', error: j?.error, retryable: !j?.uncertain, duration: j?.input.duration, provider: j?.result?.provider, generationId: j?.result?.generationId, ...(j?.result?.motion ? { motion: j.result.motion } : {}), ...(motionHold(j) ? { hold: motionHold(j) } : {}),
        ...(j?.provider === 'motion_request' ? { usage: { usedMicros: j.usedMicros || 0, unknown: !!j.usageUnknown } } : {}), ...(j?.provider === 'motion_request' && j.status === 'failed' ? { recovery: this.motionRecovery(j, !!holdMicros) } : {}) };
    }) };
  }
  // What the card offers a failed /motion job: the explanation for its cause and only the actions that can run now (none for an
  // unconfirmed outcome; nothing that starts work while Motion cannot start; fix only with spending limit left). regenerate: a
  // paid "Generate again" of the whole request.
  motionRecovery(j, startable) {
    const r = j.recovery, left = (motionReservationMicros(this.env) ?? 0) - (j.consumedMicros || 0);
    const actions = (j.uncertain || !r ? [] : r.actions).filter(a => (a === 'render' || a === 'fix' ? startable && !!r.key && (a === 'render' || left > 0) : true));
    return { cause: j.uncertain ? 'unconfirmed' : r?.cause ?? null, actions, explanation: r?.cause && EXPLAIN[r.cause] ? EXPLAIN[r.cause]({ ...r, actions }) : null, regenerate: startable && !j.uncertain && left > 0 };
  }
  // Admission, then submission. A refusal or a definite orchestrator refusal starts nothing and releases the hold. An
  // unconfirmed submission (MOT-07: no answer, a 500, a 502, a malformed success) keeps the job generating with its hold
  // reserved; it is never resent: the alarm reconciles its key (pollMotion).
  // recover {mode, checkpoint, seal, holdMicros}: a recovery attempt. render holds nothing (its grant of 1 micro-USD lets the
  // orchestrator refuse any model call); fix holds its own worst case, at most what is left of the ceiling.
  async startMotion(req, job, provider, entered = Date.now(), recover = null) {
    const refused = provider.unavailable() || (recover?.mode === 'render' ? this.freeMotion(req, job) : await this.admitMotion(req, job, recover?.holdMicros));
    if (refused) { Object.assign(job, { status: 'failed', error: refused, uncertain: false }); return; }
    await this.state.storage.put(`job:${job.key}`, job);
    const left = () => entered + MOTION_ADMISSION_MS - Date.now();
    try {
      // The grant names the orchestrator process that answers now (MOT-08); it is stored before the one POST it may go out in.
      job.spend.grant = await motionGrant(this.env.MOTION_ORCHESTRATOR_TOKEN, job.spend.opId, job.spend.micros, Math.floor(Date.now() / 1000), await provider.boot(left()));
      await this.state.storage.put(`job:${job.key}`, job);
      if (left() < MOTION_MIN_POST_MS) throw Object.assign(new Error(SLOW), { definite: true }); // no POST left: nothing started
      job.ticket = await provider.submit(job.input, job.spend, job.repository, left(), recover && { mode: recover.mode, checkpoint: recover.checkpoint, seal: recover.seal });
    } catch (error) {
      if (!error.definite) return; // unconfirmed: the alarm reconciles the key, never resubmits
      await this.settleMotion(job, NOTHING);
      Object.assign(job, { status: 'failed', error: error.message, uncertain: false });
    }
  }

  // -> null when admitted (job.spend holds the reservation; startMotion signs its grant), else the person's explanation.
  freeMotion(req, job) {
    job.payer = usageContext(usageFromForwarded(this.env, req, 'video'))?.identity || null;
    job.spend = { opId: operationId('motion'), attemptId: null, micros: 1, admitted: false, free: true, settled: false };
    return null;
  }
  // cap: a recovery attempt's own worst case (orchestrator RECOVERY_POLICY), recalculated each time against what is left.
  async admitMotion(req, job, cap = null) {
    const ceiling = motionReservationMicros(this.env);
    if (ceiling == null) return 'Motion is not available here yet: its per-video spending limit is not configured. Nothing was started.';
    const left = Math.min(ceiling - (job.consumedMicros || 0), cap > 0 ? cap : Infinity);
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
    // A free attempt (render recovery) reserved nothing: it only records its renders, once.
    if (spend?.free && !spend.settled) {
      Object.assign(spend, { settled: true, costMicros: 0 });
      await this.stopLanded(job);
      await this.state.storage.put(`job:${job.key}`, job);
      return this.recordRenders(job, view);
    }
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
    job.usedMicros = (job.usedMicros || 0) + (known ?? 0);
    if (known == null) job.usageUnknown = true;
    Object.assign(spend, { settled: true, costMicros: known });
    await this.stopLanded(job);
    await this.state.storage.put(`job:${job.key}`, job);
    await this.recordRenders(job, view);
  }

  async recordRenders(job, view) {
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

  // The object accepts a Stop whenever it awaits a fetch, an alarm's poll included (MOT review, item 1). A Stop stored since this
  // copy of the job was read wins: its stopped flag, status and error are kept, never overwritten. -> true when one landed.
  async stopLanded(job) {
    const stored = await this.state.storage.get(`job:${job.key}`);
    if (!stored?.stopped || job.stopped) return false;
    Object.assign(job, { stopped: true, status: stored.status, error: stored.error, uncertain: stored.uncertain });
    return true;
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
      await this.stopLanded(job);
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
    // Each new checkpoint while it runs, and the final artifacts once it ends, before anything settles or its record can go.
    if (view && Number.isInteger(view.artifacts_rev)) {
      const mine = job.recovery?.jobId === job.ticket.id;
      if (!mine || view.artifacts_rev > job.recovery.rev || (view.status !== 'running' && !job.recovery.final)) await this.saveArtifacts(job, provider);
    }
    await this.stopLanded(job); // so a Stop during that poll is cancelled and settles as cancelled, not failed
    // Stop is durable (MOT-09): a job still running after Stop, recovered by its key or whose stop went unconfirmed, is told again.
    if (job.stopped && view?.status === 'running') await provider.cancel(job.ticket).catch(() => {});
    if (view?.status === 'running' && !late) return;
    if (view && view.status !== 'running' && view.spend?.in_flight > 0 && !late) return; // a stopped call still lands and is priced
    await this.settleMotion(job, view && view.status !== 'running' ? view : null);
    if (job.status !== 'generating') return;
    if (!view || view.status === 'running') {
      Object.assign(job, view ? { status: 'failed', uncertain: true, error: `Generation has not completed within ${maxWait(job) / 60000} minutes. Check provider history before generating again.` }
        : { status: 'failed', error: 'The Motion service restarted while this video was being made. Generate it again; the interrupted attempt\'s cost stays counted.' });
      if (!view && job.recovery) Object.assign(job.recovery, { cause: 'lost', actions: lostActions(job.recovery), final: true });
      return;
    }
    const result = await provider.poll(job.ticket, view);
    job.storageKey = `learn-video-dev/${this.state.id}/${job.key}.mp4`;
    await learnMedia(this.env).put(job.storageKey, result.bytes, { httpMetadata: { contentType: 'video/mp4' } });
    job.result = { provider: result.provider, generationId: result.generationId, motion: result.motion };
    job.status = 'ready';
  }

  // Copies the attempt's artifacts to LEARN_MEDIA and points the job at them. A failed read throws: the alarm asks again.
  async saveArtifacts(job, provider) {
    const a = await provider.artifacts(job.ticket);
    const key = a.checkpoint ? `learn-video-dev/${this.state.id}/${job.key}.motion/${job.ticket.id}.json` : job.recovery?.key ?? null;
    if (a.checkpoint) await learnMedia(this.env).put(key, JSON.stringify(a), { httpMetadata: { contentType: 'application/json' } });
    const f = a.blocking?.[0];
    job.recovery = { key, jobId: job.ticket.id, rev: a.rev, final: a.status !== 'running', cause: a.cause ?? null, actions: Array.isArray(a.actions) ? a.actions : [],
      state: a.checkpoint?.composition?.state ?? null, storyboard: !!a.checkpoint?.storyboard, holdFixMicros: Math.ceil((a.hold_usd?.fix ?? 0) * 1e6) || null,
      question: a.clarification?.question ?? null, finding: f ? { category: f.category, description: String(f.description).slice(0, 240) } : null };
  }

  async alarm() {
    // A finished job stores its asset: only ever in the dev bucket, never small-runs.
    if (!this.env.LEARN_MEDIA) throw new Error('LEARN_MEDIA is not bound on this worker');
    const jobs = await this.state.storage.list({ prefix: 'job:' });
    for (const [key, job] of jobs) {
      if (job.provider === 'motion_request' && (job.status === 'generating' || needsSettling(job))) {
        try { await this.pollMotion(job); }
        catch (error) { if (error.final) { job.status = 'failed'; job.error = error.message; } } // transient: the next poll
        // A Stop that landed after pollMotion's last look: kept, and its job told to stop now that it has a ticket.
        if (await this.stopLanded(job) && job.ticket) await new MotionRequestProvider(this.env).cancel(job.ticket).catch(() => {});
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
