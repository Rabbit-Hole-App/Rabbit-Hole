// /interact shared runner (INT-07B, docs/features/interact.md INT-07B checklist). ONE set of stage functions serves the durable job and the
// script (scripts/interact/run.mjs): advanceInteract performs exactly one stage and returns what to persist; runInteract loops it for the
// CLI and fixtures. Nothing here persists, schedules or talks to a provider on its own:
//   - model calls go through callInteractRole with the ctx the caller admitted (bounded, counted, never resent after an unknown outcome);
//   - persistence is the caller's `store`; the durable job's ExplainJobs adapter applies `patch` and `effects` after its fenced write;
//   - the design stage is a seam (`ctx.designRoles.design`) so the design lane's real stage plugs in with no change here.
// The stages, one per advance:   new -> (design) plan_ready -> (approval) approved -> (build) built -> (check) checked -> (deliver) card_ready
//   built -> check failed -> repair_needed -> (repair) built ...  at most three repairs shared across validation, render and review; then failed.
// A card exists only at card_ready, reached only from `checked` (every check passed AND the independent review accepted THIS composition) and only
// for a plan whose hash matches the recorded approval. The runner never invents an approval.
import { parseScenePlan, planHash } from '../../web/src/interact-plan.js';
import { buildScene } from './interact-build.js';
import { CHECK_LIMITS, checkRound, repairRound } from './interact-checks.js';
import { INTERACT_LIMITS, InteractModelError, interactProfileHash } from './interact-models.js';

export const FLOW_VERSION = 2; // INTERACT_SCENE_PLAN_ENABLED snapshots this into each new job (INT-07B-C03); legacy jobs have none
export const TERMINAL = Object.freeze(['card_ready', 'failed', 'blocked']);

export class StaleRevisionError extends Error {
  constructor(runId, expected, actual) { super(`run ${runId} is at revision ${actual}, not ${expected}; the save was refused`); this.name = 'StaleRevisionError'; this.code = 'stale_revision'; }
}

// A new run's state. profile: a resolved interact profile; the run keeps its id, version and hash for life (a changed profile is a new run).
export async function initialState(runId, request, profile) {
  return {
    flowVersion: FLOW_VERSION, runId, revision: 0, stage: 'new', request: { prompt: request.prompt, depth: request.depth, ...(request.context ? { context: request.context } : {}), ...(request.evidence ? { evidence: request.evidence } : {}), ...(request.fixture ? { fixture: request.fixture } : {}) },
    profile: { id: profile.id, version: profile.version, hash: await interactProfileHash(profile) }, calls: [], effects: [], round: 0, renderRetries: 0, failure: null,
  };
}

// An in-memory store with the CLI store's contract (the run-dir store in scripts/interact adds atomic files). load(runId) -> state | null;
// save(runId, expectedRevision, next) refuses a stale revision; putArtifact(hash, bytes, kind) is content-addressed and idempotent; getArtifact(hash).
export function createMemoryStore() {
  const runs = new Map(), blobs = new Map();
  return {
    runs, blobs,
    async load(runId) { return runs.has(runId) ? structuredClone(runs.get(runId)) : null; },
    async save(runId, expectedRevision, next) {
      const have = runs.get(runId)?.revision ?? 0;
      if (runs.has(runId) ? have !== expectedRevision : expectedRevision !== 0) throw new StaleRevisionError(runId, expectedRevision, have);
      runs.set(runId, structuredClone({ ...next, revision: expectedRevision + 1 }));
      return expectedRevision + 1;
    },
    async putArtifact(hash, bytes) { if (!blobs.has(hash)) blobs.set(hash, bytes); },
    async getArtifact(hash) { return blobs.get(hash) ?? null; },
  };
}

// The role call ceilings of the whole run: a call beyond a role's ceiling is refused BEFORE anything is sent (a denied call is not a sent call).
function limited(ctx, state, counts) {
  const used = role => state.calls.filter(c => c.role === role).length + (counts[role] ?? 0);
  return { ...ctx, async admit(info) {
    if (used(info.role) >= INTERACT_LIMITS.calls[info.role]) throw new InteractModelError('call_ceiling', `The ${info.role} role is limited to ${INTERACT_LIMITS.calls[info.role]} calls in one run.`, { sent: false });
    await ctx.admit?.(info);
    counts[info.role] = (counts[info.role] ?? 0) + 1;
  } };
}
const record = (state, call) => ({ ...call, id: `${state.runId}:${call.role}:${state.calls.filter(c => c.role === call.role).length + 1}` });
const effect = (state, type, discriminator, payload) => ({ type, key: `${state.runId}:${type}:${discriminator}`, payload, acked: false });
const stop = (state, failure) => ({ stage: 'failed', patch: { failure }, effects: [effect(state, 'stop', failure.kind, { kind: failure.kind, reason: failure.reason ?? null })] });

const job = (state, ctx) => ({ id: state.runId, plan: state.plan, planHash: state.planHash, capabilities: ctx.capabilities, evidence: state.request.evidence ?? [], oracle: ctx.oracle ?? null });

// advanceInteract(state, ctx) -> { stage, patch, effects, blobs?, waiting?, refused? }  performs ONE stage. patch holds only the fields it changed.
//   ctx: { capabilities, profile, adapters, env, fixture?, admit?, settle?, signal?, designRoles, captureCard, oracle?, approval?: { planHash } }
export async function advanceInteract(state, ctx) {
  try { return await advance(state, ctx); }
  catch (error) {
    // A call that ended without a known outcome is never resent by a reload and its cost is unknown: the run stops there, visibly, for the
    // job's reconciliation. A ceiling is a stop of its own. Any other refusal (a denied reservation, a provider outage) is thrown for the
    // job's own retry rules; the stage did not complete, so the persisted state is unchanged.
    if (error?.code === 'unknown_outcome') return { ...stop(state, { kind: 'unknown_outcome', reason: error.message }), stage: 'blocked' };
    if (error?.code === 'call_ceiling') return stop(state, { kind: 'call_ceiling', reason: error.message });
    throw error;
  }
}

async function advance(state, ctx) {
  if (TERMINAL.includes(state.stage)) return { stage: state.stage, patch: {}, effects: [] };
  // Cancel fences the run: nothing more is sent, and a late result of a call already in flight is not applied (the stage did not complete).
  if (ctx.signal?.aborted) return stop(state, { kind: 'cancelled', reason: 'the run was cancelled' });
  const counts = {}, roleCtx = limited(ctx, state, counts);
  const calls = list => list.reduce((out, c) => [...out, record({ ...state, calls: [...state.calls, ...out] }, c)], []); // ids continue the run's own numbering

  if (state.stage === 'new') {
    const designed = await ctx.designRoles.design({ jobId: state.runId, request: state.request, capabilities: ctx.capabilities, profile: ctx.profile }, roleCtx);
    const parsed = parseScenePlan(designed.plan, ctx.capabilities);
    if (!parsed.ok) return stop(state, { kind: 'design_invalid', reason: `${parsed.problems[0].path}: ${parsed.problems[0].message}`, problems: parsed.problems });
    if (parsed.value.depth !== state.request.depth) return stop(state, { kind: 'design_invalid', reason: `the plan changed the requested depth ${state.request.depth}` });
    const hash = await planHash(parsed.value);
    return { stage: 'plan_ready', patch: { plan: parsed.value, planHash: hash, design: { reviews: designed.reviews ?? [], revisions: designed.revisions ?? [] }, calls: [...state.calls, ...calls(designed.calls ?? [])] },
      effects: [effect(state, 'publish_plan', hash, { planHash: hash, title: parsed.value.title, cardDescription: parsed.value.cardDescription, depth: parsed.value.depth })],
      blobs: [{ kind: 'plan', hash, bytes: parsed.value }] };
  }

  if (state.stage === 'plan_ready') {
    const approval = ctx.approval;
    if (!approval?.planHash) return { stage: 'plan_ready', patch: {}, effects: [], waiting: 'approval' };
    if (approval.planHash !== state.planHash) return { stage: 'plan_ready', patch: {}, effects: [], refused: 'approval_mismatch', reason: `the approval is for ${String(approval.planHash).slice(0, 12)}, the ready plan is ${state.planHash.slice(0, 12)}` };
    return { stage: 'approved', patch: { approval: { planHash: approval.planHash, source: approval.source ?? 'caller' } }, effects: [] };
  }

  const guard = state.approval?.planHash === state.planHash && !!state.plan;
  if (!guard) return stop(state, { kind: 'not_approved', reason: 'this run has no approval for its plan; nothing was built' });

  if (state.stage === 'approved') {
    const built = await buildScene(job(state, ctx), roleCtx);
    const newCalls = calls([built.call]);
    const base = { calls: [...state.calls, ...newCalls], draft: built.draft ?? null };
    if (built.gap) { const failure = { kind: 'capability_gap', reason: built.gap.message, gap: built.gap }; return { ...stop(state, failure), patch: { ...base, failure } }; }
    if (built.problems) return { stage: 'repair_needed', patch: { ...base, artifacts: null, composition: null, failure: { stage: 'validate', problems: built.problems, findings: [] } }, effects: [] };
    return { stage: 'built', patch: { ...base, artifacts: built.artifacts, composition: built.composition, failure: null, round: 0 }, effects: [], blobs: blobsOf(built.artifacts, built.composition) };
  }

  if (state.stage === 'built') {
    const r = await checkRound({ ...job(state, ctx), artifacts: state.artifacts, composition: state.composition }, roleCtx);
    const newCalls = calls(r.calls ?? []);
    const base = { calls: [...state.calls, ...newCalls] };
    const blobs = (r.pngs ?? []).filter(p => p.sha256).map(p => ({ kind: 'capture', hash: p.sha256, bytes: p.bytes }));
    if (r.status === 'ready') return { stage: 'checked', patch: { ...base, review: r.review, check: { ...r.check, coverage: r.coverage }, captures: r.captures, failure: null }, effects: [], blobs };
    if (r.status === 'failed') return { stage: 'repair_needed', patch: { ...base, failure: r.failure, check: r.check ?? null, captures: r.captures ?? state.captures, review: r.review ?? null }, effects: [], blobs };
    if (r.status === 'render_unavailable') {
      const retries = state.renderRetries + 1; // a render outage recaptures; it costs no model call and no correction round
      return retries > CHECK_LIMITS.renderRetries ? { ...stop(state, { kind: 'render_unavailable', reason: r.reason }), stage: 'blocked' } : { stage: 'built', patch: { ...base, renderRetries: retries }, effects: [] };
    }
    if (r.status === 'incomplete') return stop(state, { kind: 'incomplete', reason: r.reason });
    return stop(state, { kind: r.status, reason: r.reason ?? r.status });
  }

  if (state.stage === 'repair_needed') {
    // The failing captures the review named, read back from the store by hash (the state keeps hashes, never pixels).
    const named = new Set((state.failure?.findings ?? []).map(f => f.target?.capture).filter(Boolean)), captureBytes = [];
    for (const c of state.captures ?? []) if (named.has(c.caseId) && c.sha256) { const bytes = await ctx.loadBlob?.(c.sha256); if (bytes) captureBytes.push({ caseId: c.caseId, png: bytes }); }
    const r = await repairRound({ ...job(state, ctx), draft: state.draft, failure: state.failure, round: state.round, captures: captureBytes }, roleCtx);
    const base = { calls: r.call ? [...state.calls, ...calls([r.call])] : state.calls };
    if (r.status === 'repaired') return { stage: 'built', patch: { ...base, draft: r.draft, artifacts: r.artifacts, composition: r.composition, failure: null, round: r.round, review: null, check: null, captures: null }, effects: [], blobs: blobsOf(r.artifacts, r.composition) };
    if (r.status === 'repaired_invalid') return { stage: 'repair_needed', patch: { ...base, draft: r.draft, artifacts: null, composition: null, failure: r.failure, round: r.round }, effects: [] };
    const failure = { kind: `repair_${r.status}`, reason: r.reason ?? r.gap?.message ?? r.status };
    return { ...stop(state, failure), patch: { ...base, round: r.round ?? state.round, failure } };
  }

  if (state.stage === 'checked') {
    // The one door to a card. Every condition is re-read from the persisted state, not remembered.
    const ok = state.review?.accepted === true && state.composition?.planHash === state.planHash && state.artifacts && !state.failure;
    if (!ok) return stop(state, { kind: 'not_ready', reason: 'the candidate did not pass every check on its own composition; no card was made' });
    const result = { status: 'card_ready', planHash: state.planHash, envelopeHash: state.composition.envelopeHash, rounds: state.round, depth: state.plan.depth };
    return { stage: 'card_ready', patch: { result },
      effects: [effect(state, 'deliver_card', state.composition.envelopeHash, { runId: state.runId, ...result, composition: state.composition })], blobs: [] };
  }
  return stop(state, { kind: 'unknown_stage', reason: `no stage "${state.stage}"` });
}

const blobsOf = (artifacts, composition) => [
  ...[artifacts.main, ...artifacts.supporting.map(s => s.artifact)].map(a => ({ kind: 'artifact', hash: a.kind === 'program' ? a.program.bundleHash : null, bytes: a })),
  { kind: 'composition', hash: composition.envelopeHash, bytes: composition },
].filter(b => b.hash);

// runInteract(request, { ctx, store, until, approvedPlanHash, runId }) -> the final state.
//   until: 'plan' stops when the reviewed plan is ready (no approval, no build); 'card' needs an approval equal to the ready plan hash.
// Resumes from the stored run: a completed stage is never repeated (so a reload makes no second model call), and effects not yet acknowledged
// are replayed first with their persisted keys. A profile that differs from the run's is refused: a changed profile is a new run.
export async function runInteract(request, { ctx, store, until = 'plan', approvedPlanHash = null, runId = request.runId }) {
  if (!['plan', 'card'].includes(until)) throw new Error('until is plan or card');
  let state = await store.load(runId);
  if (!state) {
    state = await initialState(runId, request, ctx.profile);
    state.revision = await store.save(runId, 0, state);
  } else {
    const hash = await interactProfileHash(ctx.profile);
    if (state.profile.hash !== hash) throw Object.assign(new Error(`run ${runId} used profile ${state.profile.id}@${state.profile.version}; a different profile starts a new run`), { code: 'profile_mismatch' });
    if (request.prompt !== undefined && (request.prompt !== state.request.prompt || request.depth !== state.request.depth)) throw Object.assign(new Error(`run ${runId} was made for another request`), { code: 'request_mismatch' });
  }
  const approval = approvedPlanHash ? { planHash: approvedPlanHash, source: 'cli' } : null;
  const flush = async () => {
    const pending = state.effects.filter(e => !e.acked);
    if (!pending.length) return;
    for (const e of pending) await ctx.applyEffect?.(e); // idempotent by e.key
    const next = { ...state, effects: state.effects.map(e => (e.acked ? e : { ...e, acked: true })) };
    state = { ...next, revision: await store.save(runId, state.revision, next) };
  };
  await flush(); // replay anything a previous process wrote but did not get to acknowledge
  for (let guard = 0; guard < 32; guard += 1) {
    if (TERMINAL.includes(state.stage)) break;
    if (until === 'plan' && state.stage === 'plan_ready') break;
    const step = await advanceInteract(state, { ...ctx, approval, loadBlob: hash => store.getArtifact?.(hash) });
    if (step.waiting || step.refused) { state = { ...state, waiting: step.waiting ?? null, refused: step.refused ? { code: step.refused, reason: step.reason } : null }; break; }
    for (const blob of step.blobs ?? []) await store.putArtifact(blob.hash, blob.bytes, blob.kind);
    const next = { ...state, ...step.patch, stage: step.stage, waiting: null, refused: null, effects: [...state.effects, ...step.effects] };
    state = { ...next, revision: await store.save(runId, state.revision, next) };
    await flush();
  }
  return state;
}
