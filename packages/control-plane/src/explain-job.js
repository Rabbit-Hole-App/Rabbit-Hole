// /explain v2 durable job (EXP-T12 slice 2; plan v2.1 sections 3.4 and 4). One Durable Object per canvas (ExplainJobs,
// idFromName(boardId)), following CadJobs (request fence, short locked mutations, alarm-driven stages, call ledger, Stop)
// and LearnVideos (durable Stop, unknown acceptance never resent, platform-paid renders recorded apart).
//
// Stages: queued -> [preparing -> awaiting_approval] -> authoring -> validating -> rendering -> reviewing -> ready, with
// repairing -> validating for at most EXPLAIN_LIMITS.correctionRounds rounds across all gates; failed and cancelled are terminal.
// The stage work (brief, author, compile, render, review, repair) is a pipeline injected at construction (explainPipeline by
// default, T16-T19's stages); the whole route is off unless EXPLAIN_V2_ENABLED is 'true'.
//
// Money: every model call is admitted on its own by spendTransport (the existing ledger), under one stable usage action per
// job phase (preparation, generation) so the learner sees one action; review calls are kind evaluation. Before generation
// starts (and before each Retry), the full generation worst case (explain-policy.js) must fit the learner's available
// allowance, else nothing starts. shortcut: that is a check, not a hold (a hold plus per-call admission would count twice in
// HELD_SUM), so concurrent spending elsewhere can still refuse a later call; the job then stops with an allowance reason and
// keeps its spec. Upgrade when the ledger can admit calls against a parent hold.
import { repositoryIdentity } from './repositories.js';
import { authorizedBoardApp } from './learn-board.js';
import { tutorImageContext } from './learn-image-context.js';
import { anthropic } from './ask.js';
import { costUsd, MESSAGE_LIMIT } from './learn-models.js';
import { spendTransport, spendEnforced, platformCaps } from './learn-spend.js';
import { refusalBody } from './learn-spend-ledger.js';
import { withUsage, noteUsageIdentity, usagePayer, usageTotals, recordMedia, finishAction, toMicros } from './learn-usage.js';
import { monthlyAllowanceMicros } from './learn-usage-config.js';
import { sha256Hex } from './learn-grade-jev.js';
import { consumeProposal, proposalRecord, proposalState, publishRevision, signProposal, verifyProposal } from './generation-proposal.js';
import { needsPreparation, prepareStage } from './explain-brief.js';
import { authorStage, selectExamples, specFacts, validateStage } from './explain-author.js';
import { reviewCaptures } from './explain-review.js';
import * as explainRender from './explain-render.js';
import { learnMedia } from './learn-storage.js';
import { allowedRepairs, defectKeys, presentationFix, repairStage } from './explain-repair.js';
import { EXPLAIN_LIMITS, EXPLAIN_POLICY_VERSION, REQUEST_CLASSES, ExplainPolicyError, callExplainRole, checkExplainRequest, explainReservation,
  explainRequest, newTiming, markTiming, beginStage, countStage, endStage, timingSummary } from './explain-policy.js';

const PREFIX = '/api/learn/explain/jobs';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status = 400, code = null) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
const KEY = /^[A-Za-z0-9_-]{8,128}$/;
const TERMINAL = new Set(['ready', 'failed', 'cancelled']);
// Where the request came from (CapabilityDecision.source): explicit /explain, the picker, a command-bearing Ctrl+K, a
// submitted suggestion, the shared router, or the Tutor's chosen tool.
const SOURCES = ['explicit', 'picker', 'command', 'suggestion', 'classified', 'tutor'];
const KIND = { brief: 'generation', author: 'generation', review: 'evaluation', repair: 'repair' };
const JOBS_KEPT = 50; // per canvas; older terminal jobs are pruned (their card already holds its saved result)
const jobKey = id => `job:${id}`;
const hex = () => crypto.randomUUID().replaceAll('-', '');
export const explainEnabled = env => env.EXPLAIN_V2_ENABLED === 'true';
export const EXPLAIN_DISABLED = 'Explanations are not available here yet.';

// The capability's stages: author and validate (T17, explain-author.js), render and review (T18, Lane D's explain-render.js
// renderStates and explain-review.js reviewCaptures, through the adapters below), repair (T19, explain-repair.js).
// Preparation: the sourced brief (T16, explain-brief.js).

// Render: the compiled scene's finished state per part, light and dark where the round's captures allow, as one manifest
// reserved before rendering. PNGs go to LEARN_MEDIA under the job (renderStates); the job keeps keys and hashes, not bytes.
// deps.render defaults to Lane D's explain-render.js: renderStates drives Browser Rendering (env.BROWSER, @cloudflare/puppeteer,
// keep_alive 10 s) on the render entry served from this Worker's own assets (env.ASSETS, render/scene.html in every build),
// with request interception that serves only that entry and its built /static/ files. Tests inject launch or browser.
// A deployment without BROWSER says rendering is unavailable and keeps the compiled result for Retry rendering.
export const renderStage = ({ render = explainRender, ...deps } = {}) => async (job, ctx) => {
  if (!ctx.env?.BROWSER && !deps.launch && !deps.browser) throw Object.assign(fail('Rendering explanations is not available here yet.', 503, 'render_unavailable'), { category: 'renderer' });
  const { compiledHash, renderStates, reserveCaptures } = render;
  const { scene } = job.compiled, parts = scene.exampleData?.partTitles?.length || 1;
  const themes = parts * 2 <= EXPLAIN_LIMITS.render.capturesPerRound ? ['light', 'dark'] : ['light'];
  const entries = [];
  for (let part = 0; part < parts; part++) for (const theme of themes) entries.push({ id: `${parts > 1 ? `p${part}-` : ''}${theme}`, part, time: scene.duration, inputs: parts > 1 ? { part } : {}, theme, width: scene.width, height: scene.height, dpr: 1 });
  const manifest = { compiledHash: await compiledHash(scene), reserved: reserveCaptures({ parts, themes: themes.length, width: scene.width, height: scene.height, dpr: 1 }), entries };
  let out;
  try { out = await renderStates(ctx.env, job.compiled, manifest, { jobId: job.id, ...deps }); }
  catch (error) { throw Object.assign(fail(`The explanation could not be rendered (${error.code || 'render_failed'}). Retry rendering.`, 503), { category: 'renderer' }); }
  return { captures: out.captures.map(({ png, ...capture }) => ({ ...capture, compiledHash: out.compiledHash, mediaType: 'image/png' })), renders: out.captures.map(() => ({ ok: true })) };
};
const base64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
// Review: every capture's actual pixels (read back from LEARN_MEDIA), the request, evidence and the spec's facts, through the
// job's admitted explain_review call. -> what apply and repair read: accepted, findings, whether the spec can fix them.
export async function reviewStage(job, ctx) {
  const captures = await Promise.all((job.captures || []).map(async capture => {
    if (typeof capture.data === 'string') return capture;
    const object = capture.key && await learnMedia(ctx.env)?.get(capture.key);
    return object ? { ...capture, data: base64(new Uint8Array(await object.arrayBuffer())) } : capture;
  }));
  let out;
  try { out = await reviewCaptures({ request: job.prompt, compiledHash: captures[0]?.compiledHash, facts: specFacts(job.spec), evidence: job.evidence || [], captures }, { callRole: ctx.call }); }
  catch (error) { if (error.cause) throw error.cause; throw Object.assign(fail(`The explanation could not be reviewed (${error.code || 'review_failed'}).`, 503), { category: error.code === 'missing_pixels' ? 'renderer' : 'spec' }); }
  const findings = out.captures.flatMap(capture => capture.findings), serious = findings.filter(f => f.severity !== 'minor');
  return { accepted: out.accepted, findings, repairable: allowedRepairs({ findings }).length > 0, category: serious[0]?.category || 'spec', imagesReviewed: captures.length };
}
export const explainPipeline = Object.freeze({ prepare: prepareStage, author: authorStage, validate: validateStage, render: renderStage(), review: reviewStage, repair: repairStage });

// Learner-facing view: credits, never dollars; no prompt, findings, spec or private diagnostics.
const credits = micros => Math.ceil((micros || 0) / 10000);
export function publicExplainJob(job) {
  const settled = job.calls.reduce((t, c) => t + (c.costMicros || 0), 0);
  return {
    id: job.id, version: 1, boardId: job.boardId, cardId: job.cardId, requestClass: job.requestClass, stage: job.stage, attempt: job.attempt,
    terminal: TERMINAL.has(job.stage), round: job.round, stopReason: job.stopReason, failure: job.failure,
    recovery: recoveryOf(job), usage: { credits: credits(settled), unknown: job.calls.some(c => c.status === 'unknown') },
    result: job.result, ...(job.brief ? { brief: job.brief, briefHash: job.briefHash } : {}),
    // Stage timing (plan 3.6): durations and counts only, the measurements T22 and the targets use.
    timing: timingSummary(job.timing), createdAt: job.createdAt, updatedAt: job.updatedAt,
  };
}
// The private record of a run (spec, findings, candidates, calls, capture keys), for the owner's own verification runs only.
const explainDiagnostics = job => ({ spec: job.spec, findings: job.findings, candidates: job.candidates || [], settings: job.settings,
  calls: job.calls, captures: (job.captures || []).map(({ data: _bytes, ...capture }) => capture), counts: job.counts, timing: job.timing });

// Only the actions that can run now (plan section 1.4). retry_render: a retained valid spec, render again (no reauthoring).
// new_attempt: a paid retry within this job's remaining ceiling. edit_request: always, a new request.
export function recoveryOf(job) {
  if (job.stage !== 'failed') return [];
  if (job.inFlight) return ['reconcile'];
  const actions = [];
  if (job.failure?.stage === 'rendering' && job.compiled) actions.push('retry_render');
  else if (job.failure?.retryable && withinCeiling(job)) actions.push('new_attempt');
  return [...actions, 'edit_request'];
}
const withinCeiling = job => job.counts.author < EXPLAIN_LIMITS.calls.author || (job.spec && job.round < EXPLAIN_LIMITS.correctionRounds);

function validateCreate(p) {
  if (!KEY.test(p.requestId || '')) throw fail('requestId is required.');
  if (typeof p.cardId !== 'string' || !KEY.test(p.cardId)) throw fail('cardId is required.');
  if (typeof p.prompt !== 'string' || !p.prompt.trim() || p.prompt.length > MESSAGE_LIMIT) throw fail('Describe what to explain.');
  if (!REQUEST_CLASSES.includes(p.requestClass)) throw fail('Unknown request class.');
  if (p.context != null && JSON.stringify(p.context).length > 60000) throw fail('The attached context is too large.', 413);
  if (p.baseRevision != null && !KEY.test(p.baseRevision)) throw fail('Invalid base revision.');
  if (p.threadId != null && (typeof p.threadId !== 'string' || !p.threadId || p.threadId.length > 64)) throw fail('Invalid chat thread.');
  if (p.source != null && !SOURCES.includes(p.source)) throw fail('Unknown request source.');
  if (p.requestClass === 'edit' && !p.baseRevision) throw fail('Choose the explanation to edit.');
  try { selectExamples(p.examples ?? []); } catch (error) { throw fail(error.message); }
}

// The route: owner-only, same origin, behind EXPLAIN_V2_ENABLED. Off, it answers 404 as if absent.
export async function explainRoute(path, req, env, deps = {}) {
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) return null;
  if (!explainEnabled(env)) return json({ error: EXPLAIN_DISABLED, code: 'explain_disabled' }, 404);
  if (!env.EXPLAIN_JOBS || !env.LEARN_DB) return json({ error: 'Explanations are not configured on this preview.' }, 503);
  const url = new URL(req.url);
  if (req.method !== 'GET' && req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed' }, 405);
  const user = await (deps.identity || repositoryIdentity)(req, env);
  if (user instanceof Response) return user;
  let body = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); } }
  const boardId = req.method === 'GET' ? url.searchParams.get('board') : body.boardId;
  if (typeof boardId !== 'string' || !boardId) return json({ error: 'board is required' }, 400);
  const board = await env.LEARN_DB.prepare('SELECT id, app, board FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(boardId, user.org, user.email).first();
  if (!board) return json({ error: 'Not available' }, 404);
  const rest = path.slice(PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent);
  const action = req.method === 'GET' ? (rest[0] ? 'get' : 'list') : (rest[0] ? rest[1] : 'create');
  if (!['get', 'list', 'create', 'cancel', 'retry', 'approve', 'refine'].includes(action) || rest.length > 2) return json({ error: 'Not found' }, 404);
  // EXP-T15 on v2: an attached image is read here, under this canvas's authorization, by the existing reader (as
  // /api/learn/artifact does), stored for the job and offered to the author as a layout reference only. Never a browser key.
  delete body.reference;
  if (action === 'create' && (body.image_context !== undefined || body.image_role !== undefined)) {
    if ((body.image_role ?? 'layout_reference') !== 'layout_reference' || body.image_context === undefined) return json({ error: 'image_role must be layout_reference, with an image_context' }, 400);
    if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(body.requestId)) return json({ error: 'requestId is required.' }, 400);
    const access = await (deps.access || authorizedBoardApp)(req, env, board.app);
    if (access instanceof Response) return access;
    const got = await (deps.images || tutorImageContext)(env, access, { image_context: body.image_context, board: board.board }).catch(() => null);
    if (got?.error) return json({ error: got.error }, got.status || 400);
    const image = got?.blocks?.find(part => part.type === 'image');
    if (!image) return json({ error: got?.notice || 'The attached image is unavailable. Attach it again and resend.', code: 'image_unavailable' }, 409);
    const key = `explain-reference/${board.id}/${body.requestId}`;
    await learnMedia(env).put(key, JSON.stringify({ mediaType: image.source.media_type, data: image.source.data }), { httpMetadata: { contentType: 'application/json' } });
    body.reference = { key, role: 'layout_reference', mediaType: image.source.media_type };
  }
  const stub = env.EXPLAIN_JOBS.get(env.EXPLAIN_JOBS.idFromName(board.id));
  return stub.fetch('https://explain/action', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, id: rest[0] || null, payload: body, board, user: { org: user.org, email: user.email, userId: user.userId || user.user_id || null }, origin: url.origin,
      // Owner-only diagnostics for live verification runs on a dev clone (EXPLAIN_DIAGNOSTICS, never set in a committed config).
      detail: req.method === 'GET' && url.searchParams.get('detail') === '1' && env.EXPLAIN_DIAGNOSTICS === 'true' }) });
}

export class ExplainJobs {
  constructor(state, env, pipeline = explainPipeline) { this.state = state; this.env = env; this.pipeline = pipeline; this.active = new Set(); }
  async locked(fn) {
    // An exception escaping blockConcurrencyWhile resets the object; expected refusals leave the gate first.
    const out = await this.state.blockConcurrencyWhile(async () => { try { return { value: await fn() }; } catch (error) { return { error }; } });
    if (out.error) throw out.error;
    return out.value;
  }
  get(id) { return this.state.storage.get(jobKey(id)); }
  async save(job) { job.updatedAt = Date.now(); await this.state.storage.put(jobKey(job.id), job); }
  async wake(delay = 50) { const at = Date.now() + delay, current = await this.state.storage.getAlarm?.(); if (!current || current > at) await this.state.storage.setAlarm(at); }

  async fetch(req) {
    try {
      const input = await req.json();
      return await this.locked(() => this.action(input));
    } catch (error) {
      if (error.refusal) return json(refusalBody(error.refusal), error.status || 429);
      return json({ error: error.status ? error.message : 'The explanation could not be updated.', ...(error.code ? { code: error.code } : {}) }, error.status || 503);
    }
  }

  async action({ action, id, payload = {}, board, user, origin, detail = false }) {
    if (action === 'list') {
      const jobs = [...(await this.state.storage.list({ prefix: 'job:' })).values()].filter(j => j.owner.email === user.email);
      return json({ jobs: jobs.sort((a, b) => a.createdAt - b.createdAt).map(publicExplainJob) });
    }
    if (action === 'create') return this.create(payload, board, user, origin);
    const job = id && await this.get(id);
    if (!job || job.owner.email !== user.email || job.boardId !== board.id) throw fail('Not available', 404);
    if (action === 'get') return json({ job: publicExplainJob(job), ...(job.stage === 'ready' ? { block: await this.block(job) } : {}), ...(detail ? { diagnostics: explainDiagnostics(job) } : {}) });
    if (action === 'cancel') return this.stop(job);
    if (action === 'retry') return this.retry(job, payload);
    if (action === 'approve') return this.approve(job, payload);
    if (action === 'refine') return this.refine(job, payload);
    throw fail('Not found', 404);
  }

  async create(payload, board, user, origin) {
    validateCreate(payload);
    const fingerprint = await sha256Hex(JSON.stringify([payload.cardId, payload.prompt, payload.context ?? null, payload.requestClass, payload.baseRevision ?? null, payload.examples ?? [], payload.image_context ?? null]));
    const fence = await this.state.storage.get(`request:${payload.requestId}`);
    if (fence) {
      if (fence.fingerprint !== fingerprint) throw fail('This request id belongs to a different explanation.', 409);
      return json({ job: publicExplainJob(await this.get(fence.id)) });
    }
    const jobs = [...(await this.state.storage.list({ prefix: 'job:' })).values()];
    if (jobs.some(j => j.cardId === payload.cardId && !TERMINAL.has(j.stage))) throw fail('This card already has an explanation in progress.', 409);
    // Same-card Edit (T20 slice 2): the card's accepted revision as it is saved on the canvas, and this canvas's saved spec for it.
    const base = payload.requestClass === 'edit' ? await this.editBase(payload, board) : null;
    const now = Date.now(), reserve = explainReservation();
    const job = {
      id: `ej_${hex()}`, version: 1, policyVersion: EXPLAIN_POLICY_VERSION, boardId: board.id, app: board.app, board: board.board,
      owner: { org: user.org, email: user.email, userId: user.userId || null }, origin, cardId: payload.cardId, requestId: payload.requestId,
      prompt: payload.prompt.trim(), context: payload.context ?? null, examples: payload.examples ?? [], evidence: [], source: payload.source ?? 'explicit', base, reference: payload.reference ?? null, requestClass: payload.requestClass, baseRevision: payload.baseRevision ?? null,
      // Preparation (a brief) is the server's decision (T16 owns the rule); until then a researched request prepares one.
      // A brief is prepared unless the request is simple and within the configured thresholds (explain-brief.js).
      prepare: needsPreparation(this.env, payload.requestClass), threadId: payload.threadId ?? null, settings: null, decision: null, refinement: null, pendingProposal: null,
      stage: 'queued', attempt: 1, round: 0, stopped: false, stopReason: null, failure: null, inFlight: null,
      counts: { brief: 0, author: 0, review: 0, repair: 0 }, reservedMicros: 0, calls: [], renders: 0,
      prepKey: `xp${hex()}`, actionKey: `xg${hex()}`, resultId: `er_${hex()}`, revision: `xr_${hex()}`,
      brief: null, briefHash: null, approval: null, spec: null, compiled: null, findings: [], result: null,
      timing: newTiming(payload.requestClass, now), createdAt: now, updatedAt: now, deadline: now + EXPLAIN_LIMITS.deadlines.jobMs,
      reservation: reserve,
    };
    // Generation is admitted up front on the direct path; a prepared request is admitted at approve. Refused: nothing is
    // stored, no fence, no call, so the learner's request and draft stay theirs to retry.
    // The chat thread a reviewed brief is posted on: the owner's own, on this canvas.
    if (job.threadId && !await this.env.LEARN_DB.prepare('SELECT id FROM threads WHERE id = ? AND org = ? AND user = ? AND scope_ref = ?').bind(job.threadId, user.org, user.email, board.app).first()) throw fail('Not available', 404);
    if (!job.prepare) await this.admitGeneration(job);
    await this.prune(jobs);
    await this.wake();
    await this.state.storage.put({ [jobKey(job.id)]: job, [`request:${payload.requestId}`]: { id: job.id, fingerprint } });
    return json({ job: publicExplainJob(job) }, 202);
  }
  // The base of an Edit: the card on the saved canvas must carry the revision the request was made from, and that revision's
  // spec must be this canvas's own saved result for the same card. A card made before explanations could be edited, or whose
  // saved spec is gone, gets an honest refusal, never a silent replacement; a newer card revision is a stale request.
  async editBase(payload, board) {
    const row = await this.env.LEARN_DB.prepare('SELECT state_json FROM learn_boards WHERE id = ?').bind(board.id).first();
    let blocks = [];
    try { blocks = JSON.parse(row?.state_json || '{}').blocks || []; } catch { /* an unreadable canvas has no card to edit */ }
    const block = blocks.find(b => b?.id === payload.cardId);
    if (!block) throw fail('Not available', 404);
    const unsupported = () => fail('This card cannot be edited this way yet. Ask for a new explanation instead.', 409, 'edit_unsupported');
    if (!block.explain?.revision || !block.explain.resultId) throw unsupported();
    if (block.explain.revision !== payload.baseRevision) throw fail('This explanation changed. Reload before editing.', 409, 'edit_stale');
    const saved = await this.state.storage.get(`result:${block.explain.resultId}`);
    if (!saved || saved.identity.cardId !== payload.cardId || saved.identity.revision !== payload.baseRevision) throw unsupported();
    return { revision: payload.baseRevision, resultId: block.explain.resultId, spec: saved.spec };
  }
  async prune(jobs) {
    const old = jobs.filter(j => TERMINAL.has(j.stage)).sort((a, b) => b.updatedAt - a.updatedAt).slice(JOBS_KEPT - 1);
    for (const j of old) { await this.state.storage.delete?.(jobKey(j.id)); await this.state.storage.delete?.(`request:${j.requestId}`); await this.state.storage.delete?.(`result:${j.resultId}`); }
  }

  // The learner's available allowance must cover generation's full worst case before any of it starts.
  async admitGeneration(job) {
    if (!spendEnforced(this.env)) return;
    if (!platformCaps(this.env).usd) throw Object.assign(fail('AI is paused.', 429), { refusal: { reason: 'cap_unset' } });
    const payer = await usagePayer(this.usageEnv(job, job.actionKey));
    if (payer?.chargeClass !== 'would_charge') return; // platform-funded work: the per-call platform guard still applies
    const allowance = monthlyAllowanceMicros(this.env);
    let reason = null;
    try {
      const { used, reserved } = await usageTotals(this.env.LEARN_DB, payer.userId, payer.period);
      const left = (allowance ?? 0) - used;
      if (allowance == null) reason = 'allowance_unavailable';
      else if (left <= 0) reason = 'allowance_exhausted';
      else if (left - reserved < job.reservation.generationMicros) reason = reserved > 0 && left >= job.reservation.generationMicros ? 'allowance_reserved' : 'allowance_insufficient';
    } catch { reason = 'allowance_unavailable'; }
    if (reason) throw Object.assign(fail('Not enough AI allowance.', reason === 'allowance_unavailable' ? 503 : 429), { refusal: { reason, period: payer.period } });
  }

  // Stop: durable at once. A call already sent finishes and settles (spendTransport); its result is dropped. No paid step
  // starts after this (paidCall rechecks under the lock).
  async stop(job) {
    if (TERMINAL.has(job.stage)) return json({ job: publicExplainJob(job) });
    endStage(job.timing, 'stopped');
    Object.assign(job, { stopped: true, stage: 'cancelled', stopReason: 'stopped', approval: null });
    await this.save(job);
    await this.finishUsage(job, 'cancelled');
    return json({ job: publicExplainJob(job) });
  }

  // Retry of the same job and card. Duplicate Retries (two clicks, a resent request) carry the attempt they saw; only the
  // first changes anything. Render failure with a retained compiled result re-renders without reauthoring. Otherwise a paid
  // retry continues within the job's remaining ceiling, never a reset one, after the allowance check.
  async retry(job, payload) {
    if (payload.expectedAttempt !== job.attempt) return json({ job: publicExplainJob(job) });
    const actions = recoveryOf(job);
    if (actions.includes('retry_render')) {
      Object.assign(job, { stage: 'rendering', failure: null, stopReason: null, attempt: job.attempt + 1, deadline: Date.now() + EXPLAIN_LIMITS.deadlines.jobMs });
    } else if (actions.includes('new_attempt')) {
      await this.admitGeneration(job);
      const stage = job.spec ? 'validating' : 'authoring';
      Object.assign(job, { stage, failure: null, stopReason: null, attempt: job.attempt + 1, deadline: Date.now() + EXPLAIN_LIMITS.deadlines.jobMs });
    } else throw fail(job.stage === 'failed' ? 'This explanation reached its limit. Edit the request to start a new one.' : 'Only a failed explanation can be retried.', 409);
    beginStage(job.timing, job.stage);
    await this.save(job); await this.wake();
    return json({ job: publicExplainJob(job) }, 202);
  }

  // The reviewed brief as the common signed proposal, on the learner's chat thread (an answer row, as chat-modes.js recordAnswer
  // writes one). A first version starts its one state; a refinement is the next version of the same proposal, published by
  // MOT-22's compare-and-swap on that state. A Generate or another revision that landed first wins; this one is kept off.
  async postBrief(job) {
    const db = this.env.LEARN_DB, previous = job.pendingProposal;
    const record = previous ? await proposalRecord(db, job.owner.email, job.app, previous.id) : null;
    if (record?.state?.used) return;
    const p = await signProposal(this.env, { command: 'explain', title: job.brief.title, description: job.brief.summary, settings: { presentation: job.brief.presentation }, source_refs: [],
      input: { org: job.owner.org, app: job.app, job: job.id, brief_hash: job.briefHash, request: job.prompt.slice(0, 500) } }, job.owner.email, previous ? { id: previous.id, version: (record?.current?.version ?? previous.version) + 1 } : {});
    const row = await db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?) RETURNING id').bind(job.threadId, 'assistant', 'Here is the plan for your explanation. Generate makes it.').first();
    const meta = { version: 1, mode: 'ask', kind: 'answer', contextRefs: [], actions: [], followUps: [], syllabus: null, proposal: p, ...(previous ? {} : { proposalState: proposalState(p) }) };
    await db.prepare("INSERT INTO chat_message_meta (message_id, thread_id, role, alternative_of, meta_json) VALUES (?, ?, 'assistant', NULL, ?)").bind(row.id, job.threadId, JSON.stringify(meta)).run();
    if (previous && !(record?.root && await publishRevision(db, record, p))) return;
    job.pendingProposal = { id: p.proposal_id, version: p.version, messageId: String(row.id) };
  }
  // A refinement through the composer: the brief is prepared again with the learner's words (an admitted brief call); the
  // previous approval no longer counts. Only while awaiting approval, within the refinement limit.
  async refine(job, payload) {
    if (job.stage !== 'awaiting_approval') throw fail('This brief can no longer be changed.', 409, 'brief_stale');
    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!message || message.length > MESSAGE_LIMIT) throw fail('Say what to change.');
    if (job.counts.brief >= EXPLAIN_LIMITS.calls.brief * (1 + EXPLAIN_LIMITS.refinements)) throw fail('This brief reached its change limit. Start a new request.', 429);
    endStage(job.timing, 'refined');
    Object.assign(job, { refinement: message, approval: null, stage: 'preparing' });
    beginStage(job.timing, 'preparing');
    await this.save(job); await this.wake();
    return json({ job: publicExplainJob(job) }, 202);
  }

  // Generate on a prepared brief: the signed /explain proposal for this job and its current brief, consumed through the one
  // atomic proposal state (generation-proposal.js consumeProposal, MOT-22) with the job id as the press key, so a repeated
  // Generate of the same job is idempotent and any other use is refused. The allowance is checked first: a refused Generate
  // consumes nothing and the proposal stays current.
  async approve(job, payload) {
    const stale = () => fail('This brief changed. Review it again before generating.', 409, 'brief_stale');
    if (job.proposal && job.proposal.id === payload.proposal?.proposal_id && job.proposal.version === payload.proposal?.version) return json({ job: publicExplainJob(job) });
    if (job.stage !== 'awaiting_approval') throw stale();
    const p = payload.proposal, refused = await verifyProposal(this.env, p, job.owner.email);
    if (refused) throw fail(refused, 409, 'proposal_invalid');
    if (p.command !== 'explain' || p.input?.job !== job.id || p.input?.brief_hash !== job.briefHash) throw stale();
    await this.admitGeneration(job);
    const used = await consumeProposal(this.env.LEARN_DB, p, job.owner.email, { org: job.owner.org, app: job.app }, job.id);
    if (used) throw fail(used.error, 409, used.code);
    job.proposal = { id: p.proposal_id, version: p.version };
    job.settings = p.settings; // the card's settings at Generate (presentation), applied to authoring
    markTiming(job.timing, 'generate');
    Object.assign(job, { approval: { briefHash: job.briefHash, at: Date.now() }, stage: 'authoring', deadline: Date.now() + EXPLAIN_LIMITS.deadlines.jobMs });
    beginStage(job.timing, 'authoring');
    await this.save(job); await this.wake();
    return json({ job: publicExplainJob(job) }, 202);
  }

  // The saved result the browser places: the compiled scene and its identity. Saved content renders without a model call.
  async block(job) {
    const saved = await this.state.storage.get(`result:${job.resultId}`);
    return saved && { type: 'animation', id: job.cardId, scene: saved.compiled?.scene ?? saved.compiled, explain: job.result };
  }

  usageEnv(job, key) {
    const scoped = withUsage(this.env, { feature: 'artifact', req: new Request('https://explain/job', { headers: { 'x-rh-action-key': key } }) });
    noteUsageIdentity(scoped, job.owner);
    return scoped;
  }
  // Each call's own admission (spendTransport) under the job phase's one usage action; the nested anthropic() reuses it.
  transport(job, role) {
    return (env, body, model) => spendTransport(this.usageEnv(job, role === 'brief' ? job.prepKey : job.actionKey), body, model, null,
      admitted => anthropic(admitted, body, model, null), { userId: job.owner.userId || job.owner.email, category: 'explain', provider: 'anthropic', kind: KIND[role] });
  }
  // Closes a phase's usage action once the job ends (usage_actions.status), so its record is terminal.
  async finishUsage(job, status) {
    const db = this.env.LEARN_DB, user = job.owner.userId || job.owner.email;
    if (!db) return;
    for (const key of [job.prepKey, job.actionKey]) {
      try { await db.prepare("UPDATE usage_actions SET status = ?, result = ?, ended_at = ? WHERE user_id = ? AND client_key = ? AND status = 'running'")
        .bind(status, status === 'completed' ? 'full' : 'none', Math.floor(Date.now() / 1000), user, key).run(); } catch { /* best effort, as finishAction */ }
    }
  }

  // One paid role call. Under the lock: the job is still this stage and attempt, not stopped, nothing else in flight, the
  // role's call count and the deadline allow it; the intent (key, bound) is stored before anything is sent.
  async paidCall(job, role, spec) {
    const body = explainRequest(this.env, role, spec), { boundMicros, images } = checkExplainRequest(this.env, role, body);
    const key = await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || current.stopped || current.attempt !== job.attempt || current.stage !== job.stage || current.inFlight) return null;
      const limit = role === 'brief' ? EXPLAIN_LIMITS.calls.brief * (1 + EXPLAIN_LIMITS.refinements) : EXPLAIN_LIMITS.calls[role];
      if (current.counts[role] + 1 > limit) throw Object.assign(fail(`This explanation reached its ${role} limit.`, 429), { stopReason: 'budget' });
      if (Date.now() >= current.deadline) throw Object.assign(fail('This explanation reached its time limit.', 409), { stopReason: 'deadline' });
      current.counts[role]++; current.reservedMicros += boundMicros;
      const callKey = `${current.id}-${role}-${current.counts[role]}`;
      current.inFlight = { key: callKey, role, at: Date.now() };
      current.calls.push({ key: callKey, role, attempt: current.attempt, requested: null, served: null, status: 'running', boundMicros, images, costMicros: null, inputTokens: null, outputTokens: null, startedAt: Date.now(), endedAt: null });
      await this.save(current);
      return callKey;
    });
    if (!key) throw Object.assign(fail('This explanation changed while it was working.', 409), { abandoned: true });
    this.active.add(job.id);
    let out, error;
    try { out = await callExplainRole(this.env, role, spec, { callModel: this.transport(job, role) }); } catch (e) { error = e; } finally { this.active.delete(job.id); }
    await this.locked(async () => {
      const current = await this.get(job.id), call = current.calls.find(c => c.key === key);
      const usage = out?.usage, cost = usage ? costUsd({ model: out.identity.served || out.identity.requested, ...usage }) : null;
      Object.assign(call, { requested: out?.identity.requested ?? null, served: out?.identity.served ?? error?.served ?? null, status: error ? 'failed' : 'settled',
        costMicros: toMicros(cost), inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null, endedAt: Date.now(), error: error?.code || (error ? 'failed' : null) });
      if (current.inFlight?.key === key) current.inFlight = null;
      countStage(current.timing, { calls: 1, inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens, images });
      await this.save(current);
    });
    if (error) throw error;
    return out;
  }

  async alarm() {
    await this.state.storage.setAlarm(Date.now() + 30000); // re-armed first: a terminated isolate still gets a recovery turn
    let active = false;
    for (const [, snapshot] of await this.state.storage.list({ prefix: 'job:' })) {
      const job = await this.get(snapshot.id);
      if (!job || TERMINAL.has(job.stage) && !job.inFlight || job.stage === 'awaiting_approval') continue;
      active = true;
      try { await this.advance(job); } catch (error) { await this.failed(job, error); }
    }
    if (active) await this.wake(1000); else await this.state.storage.deleteAlarm?.();
  }

  // An in-flight call this object is not running was interrupted (restart, eviction): whether the provider accepted it is
  // unknown. It is never resent; its admission keeps its reservation (spendTransport never settled it), it counts against
  // the ceiling, and the job fails retryably once reconciled.
  async reconcile(job) {
    const call = job.calls.find(c => c.key === job.inFlight.key);
    if (call) Object.assign(call, { status: 'unknown', endedAt: Date.now() });
    job.inFlight = null;
    if (!TERMINAL.has(job.stage)) {
      endStage(job.timing, 'interrupted');
      Object.assign(job, { stage: 'failed', stopReason: 'error', failure: { stage: call?.role === 'review' ? 'reviewing' : job.stage, category: 'transport', message: 'An AI step was interrupted. Its cost stays held until it is confirmed.', retryable: true } });
      await this.finishUsage(job, 'interrupted');
    }
    await this.save(job);
  }

  async advance(job) {
    if (job.inFlight) { if (!this.active.has(job.id)) await this.locked(async () => { const current = await this.get(job.id); if (current.inFlight && !this.active.has(job.id)) await this.reconcile(current); }); return; }
    if (Date.now() > job.deadline) throw Object.assign(fail('This explanation reached its time limit.', 409), { stopReason: 'deadline' });
    if (job.stage === 'queued') return this.move(job, job.prepare && !job.approval ? 'preparing' : 'authoring');
    const ctx = { env: this.env, call: (role, spec) => this.paidCall(job, role, spec), limits: EXPLAIN_LIMITS };
    const stage = job.stage, attempt = job.attempt;
    const run = { preparing: 'prepare', authoring: 'author', validating: 'validate', rendering: 'render', reviewing: 'review', repairing: 'repair' }[stage];
    const out = await this.pipeline[run](structuredClone(job), ctx);
    // A late result (after Stop, Retry or another stage) never overwrites what happened meanwhile.
    await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || current.stopped || current.attempt !== attempt || current.stage !== stage) return;
      await this.apply(current, stage, out || {});
    });
  }
  async move(job, stage) {
    await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || current.stopped || current.attempt !== job.attempt || current.stage !== job.stage) return;
      current.stage = stage; beginStage(current.timing, stage); markTiming(current.timing, 'firstFeedback');
      if (stage === 'authoring') markTiming(current.timing, 'generate');
      await this.save(current);
    });
  }
  async apply(job, stage, out) {
    const next = to => { endStage(job.timing, 'done'); job.stage = to; beginStage(job.timing, to); };
    // A capability gap (the request needs math, steps, an experiment or a component that cannot be drawn yet) ends the job
    // with what is missing: no repair, no simpler substitute card.
    if (out.gap) { await this.stopWith(job, 'capability_gap', 'capability', out.gap.message); job.failure.gap = out.gap; return this.save(job); }
    if (stage === 'preparing') {
      job.brief = out.brief; job.briefHash = await sha256Hex(JSON.stringify(out.brief)); job.approval = null; job.refinement = null;
      job.decision = out.decision ?? { capability: 'explain', requiresBrief: true, briefReasons: ['threshold_missing'] };
      await this.finishUsage({ ...job, actionKey: null }, 'completed');
      if (!job.decision.requiresBrief) {
        // No trigger fired: straight on to generation, after its own allowance check (a refusal stops the job, nothing spent).
        await this.admitGeneration(job);
        markTiming(job.timing, 'generate'); next('authoring');
      } else {
        endStage(job.timing, 'done'); job.stage = 'awaiting_approval'; beginStage(job.timing, 'awaiting_approval'); markTiming(job.timing, 'proposalReady');
        if (job.threadId) await this.postBrief(job);
      }
    } else if (stage === 'authoring') { job.spec = out.spec; next('validating'); }
    else if (stage === 'validating') {
      if (out.problems?.length) {
        job.findings.push({ round: job.round, stage, problems: out.problems });
        // A time presentation that only reveals is fixed deterministically first: no model call and no correction round.
        const fixed = presentationFix(job.spec);
        if (!fixed) return this.repairOrStop(job, out);
        job.candidates = [...(job.candidates || []), { round: job.round, operation: 'presentation', progress: true, specHash: (await sha256Hex(JSON.stringify(fixed))).slice(0, 16) }];
        job.spec = fixed; next('validating');
      } else { job.compiled = out.compiled; next('rendering'); }
    } else if (stage === 'rendering') {
      job.captures = out.captures || []; job.renders += out.renders?.length || 0; countStage(job.timing, { captures: job.captures.length });
      await this.recordRenders(job, out.renders || []);
      next('reviewing');
    } else if (stage === 'reviewing') {
      // The reviewer's findings are kept for an accepted result too (minor ones do not block it).
      job.findings.push({ round: job.round, stage, accepted: out.accepted === true, findings: out.findings || [] });
      if (out.accepted === true) return this.accept(job, out);
      return this.repairOrStop(job, out);
    } else if (stage === 'repairing') {
      // Every candidate is recorded (round, operation, hash); a refused or empty repair stops the job rather than spend again.
      job.candidates = [...(job.candidates || []), { round: job.round, operation: out.operation || null, progress: out.progress !== false, specHash: out.spec ? (await sha256Hex(JSON.stringify(out.spec))).slice(0, 16) : null, ...(out.rejected ? { rejected: out.rejected } : {}) }];
      if (out.rejected) return this.stopWith(job, 'unsupported_repair', 'spec', 'This explanation needs a change the repair step cannot make. Edit the request and try again.');
      if (out.progress === false) return this.stopWith(job, 'no_progress', 'spec', 'The explanation could not be repaired. Edit the request and try again.');
      job.spec = out.spec; job.compiled = null; next('validating');
    }
    await this.save(job);
  }
  async repairOrStop(job, out) {
    await this.recordDefects(job, out.findings);
    if (out.repairable === false) return this.stopWith(job, 'unsupported_repair', out.category || 'spec', out.message || 'This explanation needs a change the repair step cannot make. Edit the request.');
    if (job.round >= EXPLAIN_LIMITS.correctionRounds) return this.stopWith(job, 'rounds', out.category || 'spec', 'The explanation did not pass its checks within three corrections. Edit the request and try again.');
    job.round++; endStage(job.timing, 'rejected'); job.stage = 'repairing'; beginStage(job.timing, 'repairing');
    await this.save(job);
  }
  // Component and renderer defects: one durable, deduplicated backlog entry per defect on this canvas, and one sanitized log
  // line for the development backlog (T11). Runtime code never edits the library.
  async recordDefects(job, findings) {
    for (const { key, category, component } of await defectKeys(job.spec, findings)) {
      const entry = await this.state.storage.get(`defect:${key}`), now = Date.now();
      await this.state.storage.put(`defect:${key}`, { key, category, component, count: (entry?.count || 0) + 1, firstAt: entry?.firstAt || now, lastAt: now });
      console.log(JSON.stringify({ event: 'explain_defect', key, category, component, count: (entry?.count || 0) + 1 }));
    }
  }
  async stopWith(job, stopReason, category, message, retryable = false) {
    endStage(job.timing, stopReason);
    Object.assign(job, { stage: 'failed', stopReason, failure: { stage: job.stage, category, message, retryable } });
    await this.save(job); await this.finishUsage(job, 'failed');
  }
  async accept(job, out) {
    const spec = JSON.stringify(job.spec), compiled = JSON.stringify(job.compiled);
    job.result = { jobId: job.id, resultId: job.resultId, cardId: job.cardId, canvas: { boardId: job.boardId }, promptRef: (await sha256Hex(job.prompt)).slice(0, 16),
      revision: job.revision, baseRevision: job.baseRevision, specHash: (await sha256Hex(spec)).slice(0, 16), compiledHash: (await sha256Hex(compiled)).slice(0, 16),
      componentVersions: out.componentVersions || job.compiled?.componentVersions || {}, policyVersion: job.policyVersion };
    await this.state.storage.put(`result:${job.resultId}`, { spec: job.spec, compiled: job.compiled, identity: job.result });
    endStage(job.timing, 'accepted'); markTiming(job.timing, 'result');
    Object.assign(job, { stage: 'ready', stopReason: 'accepted' });
    await this.save(job); await this.finishUsage(job, 'completed');
  }
  // Renders are platform compute (feature render, free to the learner, cost unknown), recorded once per capture batch.
  async recordRenders(job, renders) {
    for (const render of renders) {
      const scoped = withUsage(this.env, { feature: 'render' });
      noteUsageIdentity(scoped, job.owner);
      await recordMedia(scoped, { provider: 'explain_renderer', ok: render.ok !== false });
      await finishAction(scoped, render.ok !== false ? { status: 'completed', result: 'full' } : { status: 'failed', result: 'none' });
    }
  }
  async failed(job, error) {
    await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || TERMINAL.has(current.stage) || current.inFlight || error.abandoned) return;
      const refused = ['spend_limited', 'spend_refused'].includes(error.code) || error.status === 429;
      const policy = error instanceof ExplainPolicyError;
      endStage(current.timing, 'failed');
      Object.assign(current, { stage: 'failed', stopReason: error.stopReason || (refused ? 'budget' : 'error'),
        failure: { stage: current.stage, category: refused ? 'budget' : policy ? 'transport' : error.category || 'internal', message: error.status || policy ? error.message : 'The explanation stopped unexpectedly.', retryable: !error.stopReason && error.code !== 'model_unavailable' } });
      // Private, structured: what failed, never the learner's words or the provider's raw text in a log.
      current.findings.push({ round: current.round, stage: current.failure.stage, error: error.code || error.name || 'error' });
      await this.save(current); await this.finishUsage(current, 'failed');
    });
  }
}

export { timingSummary as explainTimingSummary };
