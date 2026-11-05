// /whiteboard durable job (roadmap v1 W1.2, sections 5.1 and 6.1). One Durable Object per canvas (WhiteboardJobs, idFromName(board.id)), on the
// shape of animation-job.js: a request fence per card, short locked mutations, alarm-driven stages, a call ledger, a signed proposal in Chat.
//
// Stages: queued -> planning -> awaiting_approval -> (Generate) authoring -> narrating -> timing -> rendering -> ready; failed is terminal.
// planning makes one whiteboard_plan call through
// spendTransport under the plan key (prepKey); the reply is supported or unsupported (clarify is W3); a supported plan must fit
// whiteboard-policy.js before it is shown; unsupported ends the job with the roadmap 1.3 refusal in Chat. refine is one more planner call
// (revision + 1, the same proposal id); a duration change is a refine with the note `duration: <n>` (W-D7). approve verifies the signed
// proposal (the learner's consent), checks the generation worst case against the allowance, consumes the proposal and leaves the job at
// `authoring` with its generation lease (approval + deadline).
// Then (W1.3), one alarm step at a time, each checkpointed on the job:
//   authoring   one whiteboard_author call per scene (whiteboard-author.js), corrections <= 2 shared; the video's totals checked at the end
//   narrating   one Fish call per narrated beat (whiteboard-tts.js), its MP3 checkpointed to R2 and measured from its frames
//   timing      whiteboard-timing.js; an overrun scene's narration is rewritten once (a correction) and narrated again; still over: failed
//   rendering   whiteboard-render-client.js, one segment; the artifacts pulled to R2, then captions, transcript and manifest written: ready
// A failure says the 1.3 reason of its stage: the plan could not be written (planning, authoring), the narration could not be made
// (narrating, timing), the drawing could not be rendered (rendering).
//
// Money: every model call is admitted on its own (spendTransport), feature 'artifact', category 'whiteboard': planning under prepKey, the
// author under actionKey; every Fish call goes through fishSpendTransport under actionKey. A phase that fails is refunded by key
// (refundActionByKey): prepKey before Generate, actionKey after. A supported or unsupported plan stays charged; a ready video is charged.
//
// Lease: a call's intent is stored before it is sent (inFlight, with `until`); its result is applied only while that same call is still the
// running one. An in-flight call this object is not running (the object restarted) is never sent again: once its lease has expired the call
// is recorded as unknown and the job fails with its stage's reason, refunded.
import { anthropic } from './ask.js';
import { LEARN_TASKS, costUsd } from './learn-models.js';
import { platformCaps, spendEnforced, spendTransport } from './learn-spend.js';
import { refusalBody } from './learn-spend-ledger.js';
import { noteUsageIdentity, refundActionByKey, toMicros, usagePayer, usageTotals, withUsage } from './learn-usage.js';
import { allowanceFor } from './learn-entitlement.js';
import { sha256Hex } from './learn-grade-jev.js';
import { consumeProposal, envelopeFor, proposalRecord, proposalState, publishRevision, signProposal, verifyProposal } from './generation-proposal.js';
import { RENDERER_VERSION, WHITEBOARD_CALL_MS, WHITEBOARD_LIMITS as L, WHITEBOARD_POLICY_VERSION, callWhiteboardRole, whiteboardRequest, whiteboardReservation, whiteboardStreaming } from './whiteboard-policy.js';
import { manifestHash, planHash, validateManifest, validateResult, whiteboardVersions } from './whiteboard-schema.js';
import { priceUsage } from './pricing-registry.js';
import { CONTEXT_CUT, FAILURE_PLAN, failureText, planLines, planStage, refusalText } from './whiteboard-plan.js';
import { authorScene, rewriteScene } from './whiteboard-author.js';
import { TTS_TIMEOUT_MS, narrateBeat } from './whiteboard-tts.js';
import { audioKeyOf, fitTiming } from './whiteboard-timing.js';
import { base64, renderRequest, renderStep } from './whiteboard-render-client.js';
import { ORPHAN_MS, assetKey, captionsVtt, sweepOrphans, transcriptOf } from './whiteboard-assets.js';
import { learnMedia } from './learn-storage.js';

export const WHITEBOARD_COMMAND = 'whiteboard-video';
export const whiteboardEnabled = env => env.WHITEBOARD_ENABLED === 'true';
export const whiteboardKilled = env => env.WHITEBOARD_EXECUTION_KILL === 'true';

export const FAILURE_NARRATION = 'the narration could not be made', FAILURE_DRAWING = 'the drawing could not be rendered';
const REASON = { queued: FAILURE_PLAN, planning: FAILURE_PLAN, authoring: FAILURE_PLAN, narrating: FAILURE_NARRATION, timing: FAILURE_NARRATION, rendering: FAILURE_DRAWING };
const reasoned = (error, reason) => Object.assign(error, { reason });
const problem = (code, message, reason, extra = {}) => reasoned(Object.assign(new Error(message), { code, ...extra }), reason);
const bytesHash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
const narratedBeats = job => job.scenes.flatMap((s, i) => s.beats.filter(b => b.narration.trim()).map(b => ({ audioKey: audioKeyOf(job.plan.scenes[i].id, b.id), text: b.narration })));

// The generation stages. Each runs one step on a copy of the job and returns { set, next?, waitMs? }, applied under the lock by advance.
// ctx: { env, call(role, spec), narrate(audioKey, text), bucket, fetch }.
const generationStages = {
  async authoring(job, ctx) {
    const { scene, corrections } = await authorScene(job, job.scenes.length, ctx);
    const scenes = [...job.scenes, scene];
    if (scenes.length < job.plan.scenes.length) return { set: { scenes, corrections } };
    // ponytail: a video over its totals (beats, words, primitives, points) fails without a correction call.
    const issues = validateManifest({ plan: job.plan, scenes });
    if (issues.length) throw problem('video_unfit', `The video does not fit the policy: ${issues.slice(0, 6).join('; ')}`, FAILURE_PLAN, { issues });
    return { set: { scenes, corrections }, next: 'narrating' };
  },
  async narrating(job, ctx) {
    const todo = narratedBeats(job).find(b => !job.audio[b.audioKey]);
    if (!todo) return { next: 'timing' };
    const { bytes, seconds } = await ctx.narrate(todo.audioKey, todo.text);
    const key = assetKey(job, todo.audioKey);
    await ctx.bucket.put(key, bytes, { httpMetadata: { contentType: 'audio/mpeg' } });
    return { set: { audio: { ...job.audio, [todo.audioKey]: { key, seconds, bytes: bytes.length, sha256: await bytesHash(bytes) } } } };
  },
  async timing(job, ctx) {
    const fit = fitTiming(job.plan, job.scenes, new Map(Object.entries(job.audio)));
    if (fit.timing) return { set: { timing: fit.timing }, next: 'rendering' };
    const over = fit.overrun.find(o => !job.rewritten.includes(o.sceneId)), index = over ? job.plan.scenes.findIndex(s => s.id === over.sceneId) : -1;
    const rewritten = over ? await rewriteScene(job, index, ctx, over).catch(error => { throw reasoned(error, FAILURE_PLAN); }) : null;
    if (!rewritten) throw problem('narration_overrun', `Scene narration overruns its window: ${JSON.stringify(fit.overrun)}`, FAILURE_NARRATION);
    const audio = Object.fromEntries(Object.entries(job.audio).filter(([k]) => !k.startsWith(`audio/${over.sceneId}-`)));
    return { set: { scenes: job.scenes.map((s, i) => (i === index ? rewritten.scene : s)), corrections: rewritten.corrections, audio, rewritten: [...job.rewritten, over.sceneId] }, next: 'narrating' };
  },
  async rendering(job, ctx) {
    const state = job.render || { key: `${job.id}:${job.attempt}:0`, total: job.timing.totalFrames };
    // The audio is read back from its checkpoints only when a POST is due (the body is built only then).
    const body = async () => {
      const audio = new Map();
      for (const t of job.timing.beats.filter(b => b.audioFrames > 0)) {
        const object = await ctx.bucket.get(job.audio[t.audioKey].key);
        if (!object) throw problem('audio_missing', `audio ${t.audioKey} is missing`, FAILURE_DRAWING);
        audio.set(t.audioKey, base64(new Uint8Array(await object.arrayBuffer())));
      }
      return renderRequest(job, job.scenes, job.timing, audio);
    };
    const started = Date.now(), step = await renderStep(ctx.env, state, body, { fetch: ctx.fetch });
    if (!step.files) return { set: { render: step.state }, waitMs: step.waitMs };
    const keys = {};
    for (const [name, bytes] of Object.entries(step.files)) { keys[name] = assetKey(job, name); await ctx.bucket.put(keys[name], bytes, { httpMetadata: { contentType: name.endsWith('.mp4') ? 'video/mp4' : 'image/png' } }); }
    return { set: { render: step.state, pulled: { keys, measured: step.measured, bytes: step.files['final.mp4'].length, sha256: await bytesHash(step.files['final.mp4']), pullMs: Date.now() - started } }, next: 'ready' };
  },
};
// The stage work by stage name: tests inject stubs.
export const whiteboardPipeline = Object.freeze({ planning: planStage, ...generationStages });

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status = 400, code = null) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
const KEY = /^[A-Za-z0-9_-]{8,128}$/;
const TERMINAL = new Set(['ready', 'failed', 'cancelled']);
const BEFORE_GENERATE = new Set(['queued', 'planning', 'awaiting_approval']);
const JOBS_KEPT = 50, LEASE_SLACK_MS = 30_000, REPORT_RETRY_MS = 30_000;
const PLAN_CALLS = 1 + L.planRevisions;
export const WHITEBOARD_REFUND = 'whiteboard_failed_refund';
const jobKey = id => `job:${id}`;
const hex = () => crypto.randomUUID().replaceAll('-', '');
const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const credits = micros => Math.ceil((micros || 0) / 10000);
const codePoints = text => [...text].length;
const reportKey = job => `${job.id}:${job.attempt}`;
// The card's title: the planner's, else the request's first words (before any plan exists).
const titleOf = job => job.title || clean(job.prompt, 60);
// A job that holds the canvas's one generation slot: past Generate, not ended, inside its deadline (a job left at the W1.3 seam frees it then).
const generating = (jobs, now = Date.now()) => jobs.some(j => !BEFORE_GENERATE.has(j.stage) && !TERMINAL.has(j.stage) && now < j.deadline);
// Every stage change goes through here: the wall time of the stage being left is added to its total (the timings line).
function moveTo(job, stage, now = Date.now()) {
  job.stageTime ??= {};
  job.stageTime[job.stage] = (job.stageTime[job.stage] || 0) + (now - (job.stageSince ?? now));
  job.stage = stage; job.stageSince = now;
}
const seconds = ms => Math.round((ms || 0)) / 1000;
// The timings line (owner benchmark order): wall seconds per stage, measured by the job, never by a model.
function timingsOf(job) {
  const t = job.stageTime || {}, pull = job.pulled?.pullMs || 0;
  const line = { video_seconds: job.plan.durationSeconds, plan: seconds(t.planning), author: seconds(t.authoring), narration: seconds(t.narrating), timing_fit: seconds(t.timing),
    render: [seconds(Math.max(0, (t.rendering || 0) - pull))], pull_store: seconds(pull) };
  return { ...line, total: Math.round((line.plan + line.author + line.narration + line.timing_fit + line.render[0] + line.pull_store) * 1000) / 1000 };
}
// The fields a card keeps for its video (wb-web's block): set from the job, measured once it is ready.
const blockOf = job => ({ artifactId: job.artifactId, revision: 1, planHash: job.planHash, measured: job.result ? { seconds: job.result.measured.seconds, frames: job.result.measured.frames, bytes: job.result.measured.bytes } : null, status: job.stage });
// Error words: animation-job.js's own where one fits; the new ones are quoted in the W1.2 hand-back for the owner.
const INVALID = 'Invalid whiteboard request.';
const PLAN_STALE = 'This plan changed. Review it again before generating.';
const PLAN_LIMIT = 'This plan reached its change limit. Start a new request.';
const CANVAS_BUSY = 'Another whiteboard video is being made on this canvas.';

export function publicWhiteboardJob(job) {
  return {
    id: job.id, version: 1, boardId: job.boardId, cardId: job.cardId, stage: job.stage, attempt: job.attempt, terminal: TERMINAL.has(job.stage),
    title: titleOf(job), durationSeconds: job.durationSeconds, outcome: job.unsupported ? 'unsupported' : job.plan ? 'supported' : null,
    failure: job.failure ? { ...job.failure, message: failureText(titleOf(job), job.failure.reason) } : null,
    ...(job.plan ? { plan: job.plan, planHash: job.planHash } : {}), result: job.result,
    usage: { credits: credits(job.calls.reduce((t, c) => t + (c.costMicros || 0), 0)), unknown: job.calls.some(c => c.status === 'unknown') },
    chatPending: !!job.reportDue, createdAt: job.createdAt, updatedAt: job.updatedAt,
  };
}

function validateCreate(p) {
  if (!KEY.test(p.requestId || '') || typeof p.cardId !== 'string' || !KEY.test(p.cardId)) throw fail(INVALID, 400, 'invalid_request');
  if (typeof p.prompt !== 'string' || !p.prompt.trim()) throw fail('Say what to explain.', 400, 'prompt_required'); // roadmap 1.3
  if (codePoints(p.prompt) > L.promptCodePoints) throw fail(INVALID, 413, 'prompt_too_long');
  if (p.context != null && typeof p.context !== 'string') throw fail(INVALID, 400, 'invalid_context');
  if (p.durationSeconds != null && (!L.durations.includes(p.durationSeconds) || p.durationSeconds > L.servedMaxSeconds)) throw fail(INVALID, 400, 'duration_invalid');
  if (p.threadId != null && (typeof p.threadId !== 'string' || !p.threadId || p.threadId.length > 64)) throw fail(INVALID, 400, 'invalid_thread');
}
const DURATION_NOTE = /^duration:\s*(\d+)$/i;

export class WhiteboardJobs {
  constructor(state, env, pipeline = whiteboardPipeline, { tasks = LEARN_TASKS, fetch = null } = {}) {
    this.state = state; this.env = env; this.pipeline = pipeline; this.tasks = tasks; this.active = new Set(); this.fetchImpl = fetch;
  }
  async locked(fn) {
    const out = await this.state.blockConcurrencyWhile(async () => { try { return { value: await fn() }; } catch (error) { return { error }; } });
    if (out.error) throw out.error;
    return out.value;
  }
  get(id) { return this.state.storage.get(jobKey(id)); }
  async save(job) { job.updatedAt = Date.now(); await this.state.storage.put(jobKey(job.id), job); }
  async wake(delay = 50) { const at = Date.now() + delay, current = await this.state.storage.getAlarm?.(); if (!current || current > at) await this.state.storage.setAlarm(at); }
  async jobs() { return [...(await this.state.storage.list({ prefix: 'job:' })).values()]; }

  async fetch(req) {
    try {
      const input = await req.json();
      return await this.locked(() => this.action(input));
    } catch (error) {
      if (error.refusal) return json(refusalBody(error.refusal), error.status || 429);
      return json({ error: error.status ? error.message : 'Not available', ...(error.code ? { code: error.code } : {}) }, error.status || 503);
    }
  }

  async action({ action, id, payload = {}, board, user, origin }) {
    if (action === 'create') return this.create(payload, board, user, origin);
    if (action === 'result') return this.readResult(id, board, user);
    const job = id && await this.get(id);
    if (!job || job.owner.email !== user.email || job.boardId !== board.id) throw fail('Not available', 404);
    if (action === 'get') {
      if (job.reportDue) await this.report(job); // a Chat message not written yet is tried again by any status read
      return json({ job: publicWhiteboardJob(job), block: blockOf(job) });
    }
    if (action === 'approve') return this.approve(job, payload);
    if (action === 'refine') return this.refine(job, payload);
    throw fail('Not found', 404);
  }

  // A finished video of a card on this canvas, for its owner only (W1.3 writes `result:<artifactId>`).
  async readResult(artifactId, board, user) {
    const saved = typeof artifactId === 'string' && await this.state.storage.get(`result:${artifactId}`);
    if (!saved || saved.owner?.email !== user.email || saved.boardId !== board.id) throw fail('Not available', 404);
    return json({ result: saved.result, cardId: saved.cardId, title: saved.title });
  }

  async create(payload, board, user, origin) {
    validateCreate(payload);
    if (whiteboardKilled(this.env)) throw fail('AI is paused.', 503, 'whiteboard_killed');
    const context = typeof payload.context === 'string' && payload.context.trim() ? { text: payload.context.slice(0, L.contextChars), cut: payload.context.length > L.contextChars } : null;
    const durationSeconds = payload.durationSeconds ?? L.defaultSeconds;
    const fingerprint = await sha256Hex(JSON.stringify([payload.cardId, payload.prompt, payload.context ?? null, durationSeconds]));
    const fence = await this.state.storage.get(`request:${payload.requestId}`);
    if (fence) {
      if (fence.fingerprint !== fingerprint) throw fail(INVALID, 409, 'request_conflict');
      return json({ job: publicWhiteboardJob(await this.get(fence.id)) });
    }
    const jobs = await this.jobs();
    if (jobs.some(j => j.cardId === payload.cardId && !TERMINAL.has(j.stage))) throw fail('This card already has a whiteboard video in progress.', 409, 'card_busy');
    if (generating(jobs)) throw fail(CANVAS_BUSY, 409, 'canvas_busy');
    if (payload.threadId && !await this.env.LEARN_DB.prepare('SELECT id FROM threads WHERE id = ? AND org = ? AND user = ? AND scope_ref = ?').bind(payload.threadId, user.org, user.email, board.app).first()) throw fail('Not available', 404);
    const now = Date.now();
    const job = {
      id: `wj_${hex()}`, version: 1, policyVersion: WHITEBOARD_POLICY_VERSION, boardId: board.id, app: board.app, board: board.board,
      owner: { org: user.org, email: user.email, userId: user.userId || null }, origin, cardId: payload.cardId, requestId: payload.requestId,
      prompt: payload.prompt.trim(), context, durationSeconds, threadId: payload.threadId ?? null,
      stage: 'queued', attempt: 1, failure: null, unsupported: null, inFlight: null, refinement: null, title: null, plan: null, planHash: null,
      pendingProposal: null, proposal: null, approval: null, result: null, reservation: null, reported: null, reportDue: false,
      counts: { plan: 0, author: 0, fish: 0 }, calls: [], prepKey: `wp${hex()}`, actionKey: `wg${hex()}`, artifactId: `wa_${hex()}`,
      scenes: [], corrections: 0, rewritten: [], audio: {}, timing: null, render: null, pulled: null, resumeAt: 0, stageTime: {}, stageSince: now, swept: false,
      createdAt: now, updatedAt: now, deadline: now + L.jobDeadlineMs,
    };
    await this.prune(jobs);
    await this.state.storage.put({ [jobKey(job.id)]: job, [`request:${payload.requestId}`]: { id: job.id, fingerprint } });
    await this.wake();
    return json({ job: publicWhiteboardJob(job) }, 202);
  }
  async prune(jobs) {
    for (const j of jobs.filter(x => TERMINAL.has(x.stage)).sort((a, b) => b.updatedAt - a.updatedAt).slice(JOBS_KEPT - 1)) {
      await this.state.storage.delete?.(jobKey(j.id)); await this.state.storage.delete?.(`request:${j.requestId}`);
    }
  }

  // An Edit of the plan in Chat, or a new duration (`duration: <n>`, W-D7): one more planner call on the current published revision.
  async refine(job, payload) {
    if (job.stage !== 'awaiting_approval') throw fail(PLAN_STALE, 409, 'plan_stale');
    if (whiteboardKilled(this.env)) throw fail('AI is paused.', 503, 'whiteboard_killed');
    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!message || codePoints(message) > L.promptCodePoints) throw fail('Say what to change.', 400, 'message_required');
    if (payload.proposal !== undefined) {
      const record = job.pendingProposal ? await proposalRecord(this.env.LEARN_DB, job.owner.email, job.app, job.pendingProposal.id).catch(() => null) : null;
      if (!record?.current || record.state?.used || payload.proposal?.proposal_id !== job.pendingProposal.id || payload.proposal?.version !== record.current.version) throw fail(PLAN_STALE, 409, 'plan_stale');
    }
    if (job.counts.plan >= PLAN_CALLS) throw fail(PLAN_LIMIT, 429, 'plan_limit');
    const duration = DURATION_NOTE.exec(message);
    if (duration) {
      const seconds = Number(duration[1]);
      if (!L.durations.includes(seconds) || seconds > L.servedMaxSeconds) throw fail(INVALID, 400, 'duration_invalid');
      job.durationSeconds = seconds; job.refinement = `Re-plan the video for ${seconds} seconds.`;
    } else job.refinement = message;
    moveTo(job, 'planning');
    await this.save(job); await this.wake();
    return json({ job: publicWhiteboardJob(job) }, 202);
  }

  // Generate on the posted plan: the signed proposal for this job and its current plan, consumed once with the job id as the press key (a repeated
  // Generate from this or another tab is idempotent). The allowance check comes first: a refused Generate consumes nothing.
  async approve(job, payload) {
    const p = payload.proposal;
    if (job.proposal && job.proposal.id === p?.proposal_id && job.proposal.version === p?.version) return json({ job: publicWhiteboardJob(job) });
    if (job.stage !== 'awaiting_approval') throw fail(PLAN_STALE, 409, 'plan_stale');
    const refused = await verifyProposal(this.env, p, job.owner.email);
    if (refused) throw fail(refused, 409, 'proposal_invalid');
    if (p.command !== WHITEBOARD_COMMAND || p.input?.job !== job.id || p.input?.plan_hash !== job.planHash || p.settings?.duration_seconds !== job.plan.durationSeconds) throw fail(PLAN_STALE, 409, 'plan_stale');
    if (whiteboardKilled(this.env)) throw fail('AI is paused.', 503, 'whiteboard_killed');
    if (generating(await this.jobs())) throw fail(CANVAS_BUSY, 409, 'canvas_busy');
    await this.admitGeneration(job);
    const used = await consumeProposal(this.env.LEARN_DB, p, job.owner.email, { org: job.owner.org, app: job.app }, job.id);
    if (used) throw fail(used.error, 409, used.code);
    const now = Date.now(), proposal = { id: p.proposal_id, version: p.version };
    // The learner may retitle the card on the proposal; the plan itself is what was signed (its hash), never the browser's copy.
    Object.assign(job, { proposal, title: clean(p.title, 60) || job.title, approval: { planHash: job.planHash, proposal, at: now }, deadline: now + L.jobDeadlineMs });
    moveTo(job, 'authoring', now);
    await this.save(job); await this.wake();
    return json({ job: publicWhiteboardJob(job) }, 202);
  }

  // The learner's available allowance must cover the generation worst case before it starts (a check, not a hold), as animation-job.js.
  async admitGeneration(job) {
    if (!spendEnforced(this.env)) return;
    if (!platformCaps(this.env).usd) throw Object.assign(fail('AI is paused.', 429), { refusal: { reason: 'cap_unset' } });
    const payer = await usagePayer(this.usageEnv(job, job.actionKey));
    if (payer?.chargeClass !== 'would_charge') return;
    const allowance = await allowanceFor(this.env.LEARN_DB, this.env, payer.userId, payer.period);
    let reason = null;
    try {
      const { used, reserved } = await usageTotals(this.env.LEARN_DB, payer.userId, payer.period);
      const left = (allowance ?? 0) - used, need = job.reservation.generationMicros;
      if (allowance == null) reason = 'allowance_unavailable';
      else if (left <= 0) reason = 'allowance_exhausted';
      else if (left - reserved < need) reason = reserved > 0 && left >= need ? 'allowance_reserved' : 'allowance_insufficient';
    } catch { reason = 'allowance_unavailable'; }
    // ponytail: no free-failures-per-day rule like Animation's; the owner has not set one for /whiteboard.
    if (reason) throw Object.assign(fail('Not enough AI credits.', reason === 'allowance_unavailable' ? 503 : 429), { refusal: { reason, period: payer.period } });
  }

  // The plan as the signed proposal on the learner's Chat thread; a refinement is the next version of the same proposal (compare-and-swap).
  async postPlan(job) {
    const db = this.env.LEARN_DB, previous = job.pendingProposal, plan = job.plan;
    job.threadId ??= await this.planThread(job);
    const record = previous ? await proposalRecord(db, job.owner.email, job.app, previous.id) : null;
    if (record?.state?.used) return;
    const p = await signProposal(this.env, { command: WHITEBOARD_COMMAND, title: titleOf(job), description: planLines(plan), settings: { duration_seconds: plan.durationSeconds }, source_refs: [],
      assumptions: job.context?.cut ? [CONTEXT_CUT] : [], limitations: plan.limitations,
      input: { org: job.owner.org, app: job.app, job: job.id, plan_hash: job.planHash, request: job.prompt.slice(0, 500), scenes: plan.scenes.length } }, job.owner.email,
    { envelope: envelopeFor(this.env, { org: job.owner.org, app: job.app }), ...(previous ? { id: previous.id, version: (record?.current?.version ?? previous.version) + 1 } : {}) });
    // The Chat text beside the card is the proposal body itself (roadmap 1.3; the heading is the web card's).
    const row = await db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?) RETURNING id').bind(job.threadId, 'assistant', p.description).first();
    const meta = { version: 1, mode: 'ask', kind: 'answer', contextRefs: [], actions: [], followUps: [], syllabus: null, proposal: p, ...(previous ? {} : { proposalState: proposalState(p) }) };
    await db.prepare("INSERT INTO chat_message_meta (message_id, thread_id, role, alternative_of, meta_json) VALUES (?, ?, 'assistant', NULL, ?)").bind(row.id, job.threadId, JSON.stringify(meta)).run();
    if (previous && !(record?.root && await publishRevision(db, record, p))) return;
    job.pendingProposal = { id: p.proposal_id, version: p.version, messageId: String(row.id) };
  }
  // The canvas's open Chat thread for the owner (as animation-job.js planThread), or a new one made the open one.
  async planThread(job) {
    const db = this.env.LEARN_DB, { org, email } = job.owner, key = `active:${job.app}:${org}:${email}`;
    const open = await db.prepare('SELECT context_json FROM chat_thread_state WHERE thread_id = ?').bind(key).first().catch(() => null);
    let id = null;
    try { id = JSON.parse(open?.context_json || 'null')?.threadId ?? null; } catch { /* unreadable: none */ }
    if (id && await db.prepare('SELECT id FROM threads WHERE id = ? AND org = ? AND user = ? AND scope_ref = ?').bind(id, org, email, job.app).first()) return id;
    id = `canvaschat-${crypto.randomUUID()}`;
    const at = new Date().toISOString();
    await db.batch([
      db.prepare("INSERT INTO threads (id, org, user, scope_ref, commit_sha, title) VALUES (?, ?, ?, ?, '', ?)").bind(id, org, email, job.app, titleOf(job)),
      db.prepare('INSERT INTO chat_thread_state (thread_id, context_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(thread_id) DO UPDATE SET context_json = excluded.context_json, updated_at = excluded.updated_at').bind(key, JSON.stringify({ threadId: id }), at),
    ]);
    return id;
  }
  // One assistant message and its meta row in one batch, found again by its key: a reload or a retry never writes a second one.
  async writeChat(job, key, content) {
    const db = this.env.LEARN_DB;
    job.threadId ??= await this.planThread(job);
    if (await db.prepare("SELECT message_id FROM chat_message_meta WHERE thread_id = ? AND json_extract(meta_json, '$.reportKey') = ?").bind(job.threadId, key).first()) return;
    await db.batch([
      db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)').bind(job.threadId, 'assistant', content),
      db.prepare("INSERT INTO chat_message_meta (message_id, thread_id, role, alternative_of, meta_json) SELECT max(id), ?, 'assistant', NULL, ? FROM messages WHERE thread_id = ?")
        .bind(job.threadId, JSON.stringify({ version: 1, mode: 'ask', kind: 'answer', contextRefs: [], actions: [], followUps: [], syllabus: null, reportKey: key }), job.threadId),
    ]);
  }
  // The refusal or the failure, said once in Chat per job and attempt (reportKey); a write that fails is tried again by the alarm and by a status read.
  async report(job) {
    if (job.reported === job.attempt || !this.env.LEARN_DB) return;
    const text = job.unsupported ? refusalText(job.unsupported.asked, job.unsupported.alternative) : job.failure ? failureText(titleOf(job), job.failure.reason) : null;
    if (!text) return;
    try { await this.writeChat(job, reportKey(job), text); Object.assign(job, { reported: job.attempt, reportDue: false }); }
    catch { job.reportDue = true; await this.state.storage.setAlarm?.(Date.now() + REPORT_RETRY_MS); }
    await this.save(job);
  }

  usageEnv(job, key) {
    const scoped = withUsage(this.env, { feature: 'artifact', req: new Request('https://whiteboard/job', { headers: { 'x-rh-action-key': key } }) });
    noteUsageIdentity(scoped, job.owner);
    return scoped;
  }
  transport(job, role) {
    const stream = whiteboardStreaming(this.env, role);
    return (env, body, model) => spendTransport(this.usageEnv(job, role === 'plan' ? job.prepKey : job.actionKey), body, model, null,
      admitted => anthropic(stream ? { ...admitted, MODEL_STREAM: stream } : admitted, body, model, null), { userId: job.owner.userId || job.owner.email, category: 'whiteboard', provider: 'anthropic', kind: 'generation' });
  }
  async finishUsage(job, status) {
    const db = this.env.LEARN_DB, user = job.owner.userId || job.owner.email;
    if (!db) return;
    for (const key of [job.prepKey, ...(job.approval ? [job.actionKey] : [])]) {
      try { await db.prepare("UPDATE usage_actions SET status = ?, result = ?, ended_at = ? WHERE user_id = ? AND client_key = ? AND status = 'running'")
        .bind(status, status === 'completed' ? 'full' : 'none', Math.floor(Date.now() / 1000), user, key).run(); } catch { /* best effort, as finishAction */ }
    }
  }
  // A failed phase gives back its settled calls once (refundActionByKey is idempotent): the plan key while no Generate, the generation key after.
  async refund(job) {
    const db = this.env.LEARN_DB, user = job.owner.userId || job.owner.email;
    if (!db) return;
    try { await refundActionByKey(db, user, job.approval ? job.actionKey : job.prepKey, `${WHITEBOARD_REFUND}:${job.attempt}`); } catch (error) { console.warn('whiteboard refund not made:', error?.message); }
  }

  // One paid role call: under the lock, the job is still this stage and attempt, nothing else in flight, within the plan-call ceiling; the
  // intent and its lease are stored before anything is sent. The result is applied only while this call is still the running one.
  async paidCall(job, role, spec) {
    const { boundMicros } = whiteboardRequest(this.env, role, spec, this.tasks);
    const key = await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || current.attempt !== job.attempt || current.stage !== job.stage || current.inFlight) return null;
      if (role === 'plan' && current.counts.plan + 1 > PLAN_CALLS) throw fail(PLAN_LIMIT, 429, 'plan_limit');
      // The author's ceiling: one call per scene plus the two shared corrections (whiteboardReservation's count).
      if (role === 'author' && (current.counts.author || 0) + 1 > current.plan.scenes.length + L.authorCorrections) throw Object.assign(new Error('The author call ceiling is reached.'), { code: 'count_limit' });
      current.counts[role] = (current.counts[role] || 0) + 1;
      const callKey = `${current.id}-${role}-${current.calls.length + 1}`, now = Date.now();
      current.inFlight = { key: callKey, role, at: now, until: now + WHITEBOARD_CALL_MS[role] + LEASE_SLACK_MS };
      current.calls.push({ key: callKey, role, attempt: current.attempt, status: 'running', boundMicros, costMicros: null, served: null, inputTokens: null, outputTokens: null, startedAt: now, endedAt: null });
      await this.save(current);
      return callKey;
    });
    if (!key) throw Object.assign(fail('This whiteboard job changed while it was working.', 409), { abandoned: true });
    this.active.add(job.id);
    let out, error;
    try { out = await callWhiteboardRole(this.env, role, spec, { callModel: this.transport(job, role), tasks: this.tasks }); } catch (e) { error = e; } finally { this.active.delete(job.id); }
    const kept = await this.locked(async () => {
      const current = await this.get(job.id), call = current?.calls.find(c => c.key === key);
      if (!call || call.status !== 'running') return false; // reconciled meanwhile: the lease is gone, nothing is applied
      const usage = out?.usage ?? error?.billed?.usage, refused = ['provider_unavailable', 'spend_refused'].includes(error?.code);
      if (refused) current.counts[role]--;
      Object.assign(call, { status: refused ? 'refused' : error ? 'failed' : 'settled', served: out?.served ?? error?.billed?.served ?? null, error: error?.code ?? (error ? 'failed' : null),
        costMicros: refused ? 0 : toMicros(usage ? costUsd({ model: out?.served || error?.billed?.served || 'claude-opus-5-5', ...usage }) : null),
        inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null, endedAt: Date.now() });
      current.inFlight = null;
      await this.save(current);
      return true;
    });
    if (!kept) throw Object.assign(fail('This whiteboard job changed while it was working.', 409), { abandoned: true });
    if (error) throw error;
    return out;
  }

  // One Fish call for one beat, under the same lease rule as paidCall: its intent stored first, applied only while it is still the running call.
  async paidFish(job, audioKey, text) {
    const key = await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || current.attempt !== job.attempt || current.stage !== job.stage || current.inFlight) return null;
      current.counts.fish = (current.counts.fish || 0) + 1;
      const callKey = `${current.id}-fish-${current.calls.length + 1}`, now = Date.now();
      current.inFlight = { key: callKey, role: 'fish', at: now, until: now + 2 * TTS_TIMEOUT_MS + LEASE_SLACK_MS };
      current.calls.push({ key: callKey, role: 'fish', beat: audioKey, attempt: current.attempt, status: 'running', chars: text.length, costMicros: null, startedAt: now, endedAt: null });
      await this.save(current);
      return callKey;
    });
    if (!key) throw Object.assign(fail('This whiteboard job changed while it was working.', 409), { abandoned: true });
    this.active.add(job.id);
    let out, error;
    try { out = await narrateBeat(this.usageEnv(job, job.actionKey), text, { fetch: (...a) => this.outbound(...a) }); } catch (e) { error = e; } finally { this.active.delete(job.id); }
    const kept = await this.locked(async () => {
      const current = await this.get(job.id), call = current?.calls.find(c => c.key === key);
      if (!call || call.status !== 'running') return false;
      // reconciling: Fish accepted the request and its audio never arrived; it may be charged and is not asked for again.
      Object.assign(call, { status: error ? (error.code === 'reconciling' ? 'unknown' : 'failed') : 'settled', error: error?.code ?? null, attempts: out?.attempts ?? error?.attempts ?? null,
        costMicros: out ? priceUsage({ provider: 'fish', model: 's1', quantities: { input_bytes: new TextEncoder().encode(text).length } }).micros : null, endedAt: Date.now() });
      current.inFlight = null;
      await this.save(current);
      return true;
    });
    if (!kept) throw Object.assign(fail('This whiteboard job changed while it was working.', 409), { abandoned: true });
    if (error) throw reasoned(error, FAILURE_NARRATION);
    return out;
  }
  outbound(...args) { return (this.fetchImpl || globalThis.fetch)(...args); }

  async alarm() {
    let busy = false;
    const now = Date.now();
    for (const job of await this.jobs()) {
      if (job.reportDue) { await this.locked(async () => { const current = await this.get(job.id); if (current?.reportDue) await this.report(current); }); continue; }
      if (job.stage === 'failed' && job.approval && !job.swept && now - (job.endedAt ?? job.updatedAt) >= ORPHAN_MS) { await this.sweep(job); continue; }
      if (TERMINAL.has(job.stage) || job.stage === 'awaiting_approval') continue;
      if (job.inFlight) {
        busy = true;
        // An in-flight call this object is not running is never sent again: once its lease has expired the job fails, the call unknown.
        if (this.active.has(job.id) || Date.now() < job.inFlight.until) continue;
        await this.locked(async () => { const current = await this.get(job.id); if (current?.inFlight && !this.active.has(job.id) && Date.now() >= current.inFlight.until) await this.reconcile(current); });
        continue;
      }
      if (whiteboardKilled(this.env)) continue; // the kill switch: nothing new is dispatched
      busy = true;
      if (!BEFORE_GENERATE.has(job.stage) && now > job.deadline) { await this.failed(job, Object.assign(new Error('The job reached its deadline.'), { code: 'job_deadline' })); continue; }
      if (job.resumeAt > now) continue; // a renderer that is busy, waking or still rendering is asked again later
      if (job.stage === 'queued') { await this.locked(async () => { const current = await this.get(job.id); if (current?.stage === 'queued') { moveTo(current, 'planning'); await this.save(current); } }); continue; }
      try { await this.advance(job, this.pipeline[job.stage]); } catch (error) { await this.failed(job, error); }
    }
    if (busy) return this.wake(1000);
    // Nothing running: an alarm stays set for the soonest leftover sweep of a failed job.
    const due = (await this.jobs()).filter(j => j.stage === 'failed' && j.approval && !j.swept).map(j => (j.endedAt ?? j.updatedAt) + ORPHAN_MS);
    if (due.length) await this.state.storage.setAlarm(Math.max(Date.now() + 1000, Math.min(...due)));
  }
  // A failed job's checkpoints and partial pulls, gone after 24 h (no result points at them).
  async sweep(job) {
    const bucket = learnMedia(this.env);
    if (bucket) { try { await sweepOrphans(bucket, job); } catch (error) { console.warn('whiteboard sweep not made:', error?.message); return; } }
    await this.locked(async () => { const current = await this.get(job.id); if (current) { current.swept = true; await this.save(current); } });
  }
  async reconcile(job) {
    const call = job.calls.find(c => c.key === job.inFlight.key);
    if (call) Object.assign(call, { status: 'unknown', endedAt: Date.now() });
    job.inFlight = null;
    await this.end(job, { code: 'call_interrupted', stage: job.stage, reason: REASON[job.stage] ?? FAILURE_PLAN, previousRevisionAvailable: false });
  }
  async advance(job, work) {
    const stage = job.stage, attempt = job.attempt;
    const ctx = { env: this.env, tasks: this.tasks, bucket: learnMedia(this.env), fetch: (...a) => this.outbound(...a),
      call: (role, spec) => this.paidCall(job, role, spec), narrate: (audioKey, text) => this.paidFish(job, audioKey, text) };
    const out = await work(structuredClone(job), ctx);
    await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || current.attempt !== attempt || current.stage !== stage) return; // a late result never overwrites what happened meanwhile
      if (stage === 'planning') return this.applyPlan(current, out);
      Object.assign(current, out.set || {});
      current.resumeAt = out.waitMs ? Date.now() + out.waitMs : 0;
      if (out.next === 'ready') return this.accept(current);
      if (out.next) moveTo(current, out.next);
      await this.save(current);
    });
  }
  // The finished video: captions, transcript and manifest written beside the pulled artifacts, the result bound to plan, scenes, timing,
  // audio and MP4 hashes and the versions, and the timings line. Charged (no refund) from here.
  async accept(job) {
    const bucket = learnMedia(this.env), now = Date.now();
    job.stageTime.rendering = (job.stageTime.rendering || 0) + (now - job.stageSince); job.stageSince = now; // the rendering stage closes here
    const keys = { mp4: job.pulled.keys['final.mp4'], poster: job.pulled.keys['poster.png'], captions: assetKey(job, 'captions.vtt'), transcript: assetKey(job, 'transcript.json'), manifest: assetKey(job, 'manifest.json') };
    await bucket.put(keys.captions, captionsVtt(job.scenes, job.timing), { httpMetadata: { contentType: 'text/vtt' } });
    await bucket.put(keys.transcript, JSON.stringify(transcriptOf(job.scenes, job.timing)), { httpMetadata: { contentType: 'application/json' } });
    const assets = { ...Object.fromEntries(Object.entries(job.audio).map(([k, a]) => [k, a.sha256])), 'final.mp4': job.pulled.sha256 }, versions = whiteboardVersions(this.tasks);
    const measured = { seconds: job.pulled.measured.seconds, frames: job.pulled.measured.frames, width: 1920, height: 1080, bytes: job.pulled.bytes }, timings = timingsOf(job);
    const result = { schema: 'whiteboard-result/1', artifactId: job.artifactId, revision: 1, planHash: job.planHash, manifestHash: await manifestHash({ plan: job.plan, scenes: job.scenes, timing: job.timing, assets }, versions),
      rendererVersion: RENDERER_VERSION, keys, measured, timings };
    const issues = validateResult(result);
    if (issues.length) throw problem('result_invalid', `The result does not fit its contract: ${issues.slice(0, 6).join('; ')}`, FAILURE_DRAWING);
    await bucket.put(keys.manifest, JSON.stringify({ plan: job.plan, scenes: job.scenes, timing: job.timing, measured, versions, assets, timings }), { httpMetadata: { contentType: 'application/json' } });
    await this.state.storage.put(`result:${job.artifactId}`, { result, owner: { org: job.owner.org, email: job.owner.email }, boardId: job.boardId, cardId: job.cardId, title: titleOf(job) });
    job.result = result;
    moveTo(job, 'ready');
    await this.save(job); await this.finishUsage(job, 'completed');
  }
  async applyPlan(job, out) {
    await this.finishUsage(job, 'completed');
    if (out.unsupported) {
      // Not a whiteboard video: the 1.3 refusal in Chat, no proposal and no Generate. The planner's answer stays charged.
      Object.assign(job, { unsupported: out.unsupported, refinement: null });
      moveTo(job, 'failed');
      await this.save(job); await this.report(job);
      return;
    }
    Object.assign(job, { plan: out.plan, title: out.title, planHash: await planHash(out.plan), refinement: null, reservation: whiteboardReservation(out.plan, this.tasks) });
    moveTo(job, 'awaiting_approval');
    await this.postPlan(job);
    await this.save(job);
  }
  async end(job, failure) {
    Object.assign(job, { failure, endedAt: Date.now() });
    moveTo(job, 'failed');
    await this.save(job); await this.finishUsage(job, 'failed'); await this.refund(job); await this.report(job);
  }
  async failed(job, error) {
    await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || TERMINAL.has(current.stage) || current.inFlight || error.abandoned) return;
      (current.errors ??= []).push({ stage: current.stage, code: error.code || error.name || 'error', message: String(error.message || '').slice(0, 1500), ...(error.issues ? { issues: error.issues.slice(0, 20) } : {}) }); // diagnostics only
      await this.end(current, { code: error.code || 'error', stage: current.stage, reason: error.reason ?? REASON[current.stage] ?? FAILURE_PLAN, previousRevisionAvailable: false });
    });
  }
}
