// /whiteboard durable job (roadmap v1 W1.2, sections 5.1 and 6.1). One Durable Object per canvas (WhiteboardJobs, idFromName(board.id)), on the
// shape of animation-job.js: a request fence per card, short locked mutations, alarm-driven stages, a call ledger, a signed proposal in Chat.
//
// Stages built here: queued -> planning -> awaiting_approval -> (Generate) authoring. planning makes one whiteboard_plan call through
// spendTransport under the plan key (prepKey); the reply is supported or unsupported (clarify is W3); a supported plan must fit
// whiteboard-policy.js before it is shown; unsupported ends the job with the roadmap 1.3 refusal in Chat. refine is one more planner call
// (revision + 1, the same proposal id); a duration change is a refine with the note `duration: <n>` (W-D7). approve verifies the signed
// proposal (the learner's consent), checks the generation worst case against the allowance, consumes the proposal and leaves the job at
// `authoring` with its generation lease (approval + deadline).
// W1.3 SEAM: the stages from authoring on (author, narrate, time, render, ready) are not built. whiteboardPipeline has no entry for them, so
// the alarm leaves an approved job exactly as approve stored it; W1.3 adds `authoring: ...` (and the rest) to the pipeline, run by advance under
// the same lease rule, and writes `result:<artifactId>` records that readResult already serves.
//
// Money: a plan call is admitted on its own (spendTransport) under prepKey, feature 'artifact', category 'whiteboard'. A planning phase that
// fails is refunded by key (refundActionByKey); a supported or unsupported answer is the learner's and stays charged. Generation (actionKey) is
// W1.3's; approve only checks that its worst case (whiteboardReservation().generationMicros) fits the learner's allowance.
//
// Lease: a call's intent is stored before it is sent (inFlight, with `until`); its result is applied only while that same call is still the
// running one. An in-flight call this object is not running (the object restarted) is never sent again: once its lease has expired the call
// is recorded as unknown and the job fails with the plan reason, refunded.
import { anthropic } from './ask.js';
import { LEARN_TASKS, costUsd } from './learn-models.js';
import { platformCaps, spendEnforced, spendTransport } from './learn-spend.js';
import { refusalBody } from './learn-spend-ledger.js';
import { noteUsageIdentity, refundActionByKey, toMicros, usagePayer, usageTotals, withUsage } from './learn-usage.js';
import { allowanceFor } from './learn-entitlement.js';
import { sha256Hex } from './learn-grade-jev.js';
import { consumeProposal, envelopeFor, proposalRecord, proposalState, publishRevision, signProposal, verifyProposal } from './generation-proposal.js';
import { WHITEBOARD_CALL_MS, WHITEBOARD_LIMITS as L, WHITEBOARD_POLICY_VERSION, callWhiteboardRole, whiteboardRequest, whiteboardReservation, whiteboardStreaming } from './whiteboard-policy.js';
import { planHash } from './whiteboard-schema.js';
import { CONTEXT_CUT, FAILURE_PLAN, failureText, planLines, planStage, refusalText } from './whiteboard-plan.js';

export const WHITEBOARD_COMMAND = 'whiteboard-video';
export const whiteboardEnabled = env => env.WHITEBOARD_ENABLED === 'true';
export const whiteboardKilled = env => env.WHITEBOARD_EXECUTION_KILL === 'true';
// The stage work by stage name: tests inject stubs. W1.3 adds the generation stages here (see the seam above).
export const whiteboardPipeline = Object.freeze({ planning: planStage });

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
  constructor(state, env, pipeline = whiteboardPipeline, { tasks = LEARN_TASKS } = {}) {
    this.state = state; this.env = env; this.pipeline = pipeline; this.tasks = tasks; this.active = new Set();
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
      return json({ job: publicWhiteboardJob(job) });
    }
    if (action === 'approve') return this.approve(job, payload);
    if (action === 'refine') return this.refine(job, payload);
    throw fail('Not found', 404);
  }

  // A finished video of a card on this canvas, for its owner only (W1.3 writes `result:<artifactId>`).
  async readResult(artifactId, board, user) {
    const saved = typeof artifactId === 'string' && await this.state.storage.get(`result:${artifactId}`);
    if (!saved || saved.owner?.email !== user.email || saved.boardId !== board.id) throw fail('Not available', 404);
    return json({ result: saved.result, cardId: saved.cardId });
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
      counts: { plan: 0 }, calls: [], prepKey: `wp${hex()}`, actionKey: `wg${hex()}`, artifactId: `wa_${hex()}`,
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
    job.stage = 'planning';
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
    Object.assign(job, { proposal, title: clean(p.title, 60) || job.title, approval: { planHash: job.planHash, proposal, at: now }, stage: 'authoring', deadline: now + L.jobDeadlineMs });
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
    try { await db.prepare("UPDATE usage_actions SET status = ?, result = ?, ended_at = ? WHERE user_id = ? AND client_key = ? AND status = 'running'")
      .bind(status, status === 'completed' ? 'full' : 'none', Math.floor(Date.now() / 1000), user, job.prepKey).run(); } catch { /* best effort, as finishAction */ }
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

  async alarm() {
    let busy = false;
    for (const job of await this.jobs()) {
      if (job.reportDue) { await this.locked(async () => { const current = await this.get(job.id); if (current?.reportDue) await this.report(current); }); continue; }
      if (TERMINAL.has(job.stage) || job.stage === 'awaiting_approval') continue;
      if (job.inFlight) {
        busy = true;
        // An in-flight call this object is not running is never sent again: once its lease has expired the job fails, the call unknown.
        if (this.active.has(job.id) || Date.now() < job.inFlight.until) continue;
        await this.locked(async () => { const current = await this.get(job.id); if (current?.inFlight && !this.active.has(job.id) && Date.now() >= current.inFlight.until) await this.reconcile(current); });
        continue;
      }
      if (whiteboardKilled(this.env)) continue; // the kill switch: nothing new is dispatched
      if (job.stage === 'queued') { busy = true; await this.locked(async () => { const current = await this.get(job.id); if (current?.stage === 'queued') { current.stage = 'planning'; await this.save(current); } }); continue; }
      const work = this.pipeline[job.stage];
      if (!work) continue; // W1.3 SEAM: no work for authoring and later yet; the approved job waits as approve left it
      busy = true;
      try { await this.advance(job, work); } catch (error) { await this.failed(job, error); }
    }
    if (busy) await this.wake(1000);
  }
  async reconcile(job) {
    const call = job.calls.find(c => c.key === job.inFlight.key);
    if (call) Object.assign(call, { status: 'unknown', endedAt: Date.now() });
    job.inFlight = null;
    await this.end(job, { code: 'call_interrupted', stage: job.stage, reason: FAILURE_PLAN, previousRevisionAvailable: false });
  }
  async advance(job, work) {
    const stage = job.stage, attempt = job.attempt;
    const out = await work(structuredClone(job), { env: this.env, call: (role, spec) => this.paidCall(job, role, spec), tasks: this.tasks });
    await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || current.attempt !== attempt || current.stage !== stage) return; // a late result never overwrites what happened meanwhile
      if (stage === 'planning') await this.applyPlan(current, out);
    });
  }
  async applyPlan(job, out) {
    await this.finishUsage(job, 'completed');
    if (out.unsupported) {
      // Not a whiteboard video: the 1.3 refusal in Chat, no proposal and no Generate. The planner's answer stays charged.
      Object.assign(job, { stage: 'failed', unsupported: out.unsupported, refinement: null });
      await this.save(job); await this.report(job);
      return;
    }
    Object.assign(job, { plan: out.plan, title: out.title, planHash: await planHash(out.plan), refinement: null, stage: 'awaiting_approval', reservation: whiteboardReservation(out.plan, this.tasks) });
    await this.postPlan(job);
    await this.save(job);
  }
  async end(job, failure) {
    Object.assign(job, { stage: 'failed', failure });
    await this.save(job); await this.finishUsage(job, 'failed'); await this.refund(job); await this.report(job);
  }
  async failed(job, error) {
    await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || TERMINAL.has(current.stage) || current.inFlight || error.abandoned) return;
      (current.errors ??= []).push({ stage: current.stage, code: error.code || error.name || 'error', message: String(error.message || '').slice(0, 1500), ...(error.issues ? { issues: error.issues.slice(0, 20) } : {}) }); // diagnostics only
      await this.end(current, { code: error.code || 'error', stage: current.stage, reason: FAILURE_PLAN, previousRevisionAvailable: false });
    });
  }
}
