// R4 integration glue: the job that drives generation from the `step_accepted` outbox event (R4.05, R4.08 to R4.11). For each accepted result slot:
// revalidate the source request-less, run Tools' generateRoadmapCard (text/table only, provider calls stable-identified and drawn from the step
// hold), run Tools' checks (grounding and text safety) on the output, then record the outcome through State: recordGenerated on a passed
// card, failCard for every failure class (owner MVP, CORE.04: one author dispatch per accepted card; every failure is terminal and
// refunded once, with no automatic author retry). Delivery stays the learner's browser: this never writes a board. Accepted work finishes even when ROADMAP_ENABLED
// is off (v1.4 4.1); only routes and unsolicited stages are gated.
// ponytail: a held card (unsupported claims) is refunded rather than regenerated once; a checked regeneration is a later change.
import { authorRoute, generateRoadmapCard, quoteRoadmapCard, requestFingerprint } from './roadmap-generate.js';
import { StateError } from './roadmap-contract.js';
import { sha256 } from './roadmap-source.js';
import { checkRoadmapCard, withheldCause } from './roadmap-check.js';
import { modelAdjudicator } from './roadmap-safety.js';
import { failCard, readRoadmap, recordGenerated } from './roadmap-store.js';
import { learnerUsageEnv, planCall, withRoadmapProviderCall } from './roadmap-money.js';
import { accessForRoadmap, revalidateSourceAsJob } from './roadmap-access.js';
import { checkpointed, makeClassify, platformCallModel, platformJevAsk } from './roadmap-models.js';
import { readMarkdownForActor } from './roadmap-source-reader.js';
import { d1PublicRef } from './roadmap-source-read.js';
import { operationOf } from '../learn-spend-ledger.js';
import { loggedModel } from '../learn-models.js';
import { planModel } from '../ask.js';
import { askJev } from '../learn-grade-jev.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);
const parse = text => { try { return JSON.parse(text); } catch { return null; } };
// 'rm.<proposalId>.<version>.<cardId>.<stage>.<call>.<retry>.<authorizationId>' (roadmap-contract.js operationKey)
const fieldsOfKey = key => { const [, , , , stage, call, retry] = key.split('.'); return { stage, call: Number(call), retry: Number(retry) }; };

export async function generationHandler(env, event, { now = nowSeconds() } = {}, deps = {}) {
  const db = env.LEARN_DB;
  const access = await accessForRoadmap(db, event, { checkBoard: false });
  if (!access) return { done: true };
  const roadmap = await readRoadmap(db, access, event.roadmap_id);
  const { proposalId, proposalVersion, authorizationId, snapshot = null } = parse(event.payload_json) || {};
  if (!roadmap || !proposalId) return { done: true };
  const { results } = await db.prepare("SELECT * FROM learn_step_results WHERE roadmap_id = ? AND proposal_id = ? AND proposal_version = ? AND decision = 'accepted' AND delivery = 'not_delivered' AND generation IN ('pending', 'generating') ORDER BY slot_index")
    .bind(roadmap.id, proposalId, proposalVersion).all();
  let deferred = false;
  for (const result of results || []) if (await generateOne(env, access, roadmap, result, { proposalId, proposalVersion, authorizationId, snapshot }, { now, ...deps }) === 'defer') deferred = true;
  return deferred ? { retry: true } : { done: true };
}

// CORE.03: the learner's accepted words through a plan row's instruction version: v1 verbatim, then each non-empty accepted revision/answer in order.
export async function learnerInstructionThrough(db, roadmapId, upTo) {
  const { results } = await db.prepare('SELECT version, text, origin FROM learn_roadmap_instructions WHERE roadmap_id = ? AND version <= ? ORDER BY version').bind(roadmapId, upTo).all();
  const rows = results || [];
  return { original: rows.find(r => r.version === 1)?.text ?? '', revisions: rows.filter(r => r.version > 1 && r.text.trim()).map(r => ({ version: r.version, text: r.text, origin: r.origin })) };
}
const teachingScopeOf = scope => ({ kind: scope?.kind || 'whole', ...(Number.isInteger(scope?.start) && Number.isInteger(scope?.end) ? { start: scope.start, end: scope.end } : {}) });

// CORE.03/05: the writer's record of one accepted (or about to be accepted) step, read from the step's OWN plan row (its plan_version and
// position, never whichever plan is latest), the accepted instruction history through that row's instruction version, the pinned document and
// the frozen settings. With a snapshot (acceptance) every frozen field comes from it. -> { rec, planRow } | { error }
export async function stepInput(env, access, roadmap, { step, proposal, snapshot = null }, deps = {}) {
  const db = env.LEARN_DB;
  const planVersion = snapshot?.planVersion ?? step?.plan_version;
  const planRow = step ? await db.prepare('SELECT plan_json, plan_hash, instruction_version, accepted_at FROM learn_roadmap_plan_versions WHERE roadmap_id = ? AND version = ?').bind(roadmap.id, planVersion).first() : null;
  const plan = parse(planRow?.plan_json), planStep = plan?.steps?.[step?.position - 1];
  // Missing or inconsistent stored plan data stops before any author call: never empty claims or outcome, never another plan's step.
  if (!planRow?.accepted_at || !planStep || planStep.title !== step.title || (snapshot && (snapshot.planHash !== planRow.plan_hash || snapshot.position !== step.position || snapshot.stepId !== step.id))) return { error: 'plan_binding' };
  const text = await (deps.readSourceForActor || readMarkdownForActor)(env, access, { key: roadmap.source_key, rev: roadmap.source_rev });
  if (text.status !== 'ok' || text.complete === false) return { error: 'source' };
  const sourceRef = step.source_ref_id ? await (deps.loadSourceRef || d1PublicRef)(env, access, step.source_ref_id) : null;
  const rec = { stepId: step.id, proposalId: proposal.id, proposalVersion: proposal.version,
    format: snapshot?.format ?? proposal.format ?? step.format, stepTitle: snapshot?.title ?? proposal.title ?? step.title, stepGoal: step.goal,
    // The passage offsets are the highlight anchor; the writer's context is the whole document at the pinned revision.
    passageText: text.text.slice(step.passage_start, step.passage_end), documentText: text.text,
    claimsToCover: Array.isArray(planStep.claimsToCover) ? planStep.claimsToCover : [], outcome: typeof plan.outcome === 'string' ? plan.outcome : '',
    learnerInstruction: snapshot?.learnerInstruction ?? await learnerInstructionThrough(db, roadmap.id, planRow.instruction_version),
    instructionVersion: planRow.instruction_version, teachingScope: snapshot?.teachingScope ?? teachingScopeOf(parse(roadmap.scope_json)),
    sourceRef, language: snapshot?.language ?? roadmap.language ?? 'en', depth: snapshot?.depth ?? plan.settings?.depth ?? roadmap.depth, retry: 0,
    ...(snapshot ? { requestFingerprint: snapshot.requestFingerprint, boundMicros: snapshot.boundMicros } : {}) };
  return { rec, planRow, planVersion };
}

// CORE.05: at Accept, before anything is written: the immutable accepted-input snapshot and the quote of the actual full first author request.
// -> { snapshot, boundMicros, contentFingerprint }. Throws a 409 StateError (nothing written, the proposal stays pending) when it cannot be priced or bound.
export async function quoteStepAcceptance(env, access, { roadmap, proposal }, deps = {}) {
  const db = env.LEARN_DB;
  const step = await db.prepare('SELECT * FROM learn_roadmap_steps WHERE id = ? AND roadmap_id = ?').bind(proposal.step_id, roadmap.id).first();
  const got = await stepInput(env, access, roadmap, { step, proposal }, deps);
  if (got.error) throw new StateError(got.error === 'source' ? 'source_unavailable' : 'step_unavailable', 'This card cannot be prepared.', 409);
  const q = await quoteRoadmapCard(env, got.rec);
  if (q.outcome !== 'quoted') throw new StateError('request_unpriced', 'This card cannot be prepared.', 409);
  const { rec, planRow } = got;
  const snapshot = { v: 1, stepId: step.id, planVersion: got.planVersion, planHash: planRow.plan_hash, position: step.position, proposalId: proposal.id, proposalVersion: proposal.version,
    contentHash: proposal.content_hash, instructionVersion: rec.instructionVersion, learnerInstruction: rec.learnerInstruction, teachingScope: rec.teachingScope,
    depth: rec.depth, language: rec.language, format: rec.format, title: rec.stepTitle, source: { key: roadmap.source_key, rev: roadmap.source_rev },
    provider: q.provider, model: q.model, requestFingerprint: q.requestFingerprint, boundMicros: q.boundMicros };
  const contentFingerprint = await sha256(JSON.stringify([proposal.content_hash, snapshot.planHash, snapshot.position, snapshot.requestFingerprint, roadmap.source_rev]));
  return { snapshot, boundMicros: q.boundMicros, contentFingerprint };
}

async function generateOne(env, access, roadmap, result, ids, deps) {
  const db = env.LEARN_DB, now = () => deps.now ?? nowSeconds();
  // CORE.04: one author dispatch per accepted ordinary slot. Every failure is terminal (refunded once, step skipped, provider expense kept);
  // allowAutomaticRetry false keeps the stored failure terminal too, so a reload or replay never turns it into another purchase.
  const fail = failureClass => failCard(db, access, { roadmapId: roadmap.id, resultId: result.id, failureClass, retryNo: 0, allowAutomaticRetry: false, now: now() });
  // A crash left a call that may have reached the provider: its outcome is unknown, it is never retried blind (R4.06). Refund and stop.
  // A call that already settled or failed is never sent again either: a handler replay creates no fresh author operation.
  const prior = await db.prepare("SELECT checkpoint FROM learn_roadmap_calls WHERE result_id = ? AND payer = 'learner' AND checkpoint <> 'planned' LIMIT 1").bind(result.id).first();
  if (prior) { await fail(prior.checkpoint === 'failed' ? 'transient_provider_failure' : 'unknown_provider_outcome'); return 'failed'; }
  // Access is rechecked before every dispatch: a board that is no longer the owner's gets no new call and no charge.
  if (!await accessForRoadmap(db, { org: access.org, owner_user_id: access.actorUserId, board_id: access.boardId, roadmap_id: roadmap.id })) { await fail('denied_access'); return 'failed'; }
  await db.prepare("UPDATE learn_step_results SET generation = 'generating', updated_at = ? WHERE id = ? AND generation = 'pending'").bind(now(), result.id).run();
  const step = await db.prepare('SELECT * FROM learn_roadmap_steps WHERE id = ?').bind(result.step_id).first();
  const proposal = await db.prepare('SELECT * FROM learn_step_proposals WHERE id = ? AND version = ?').bind(ids.proposalId, ids.proposalVersion).first();
  const base = deps.base || loggedModel('artifact', planModel);
  const current = await readRoadmap(db, access, roadmap.id);
  const source = await revalidateSourceAsJob(db, access, current);
  if (!source.ok) { await fail('denied_access'); return 'failed'; } // stops BEFORE admission: nothing is spent
  const got = proposal ? await stepInput(env, access, current, { step, proposal, snapshot: ids.snapshot }, deps) : { error: 'plan_binding' };
  if (got.error) { await fail(got.error === 'source' ? 'denied_access' : 'terminal_validation_failure'); return 'failed'; }
  const rec = { ...got.rec, cardId: result.card_id, retry: 0 };
  // The learner's usage context (payer from the access object, never a body) with the step hold; each call is checkpointed around the transport.
  const withProviderCall = (e, fields) => withRoadmapProviderCall(e, fields, { kind: fields.stage === 'generate' ? 'generation' : 'repair' });
  const callModel = async (e, body, model, org) => {
    const op = operationOf(e), f = fieldsOfKey(op.key), route = authorRoute(e, model);
    await planCall(db, access, { opId: op.opId, key: op.key, roadmapId: roadmap.id, resultId: result.id, authorizationId: ids.authorizationId, stage: f.stage, call: f.call, retry: f.retry, payer: 'learner', task: 'artifact',
      provider: route.provider, model: route.model, requestFingerprint: await requestFingerprint(body, route), now: now() });
    return checkpointed(db, op.opId, now, () => base(e, body, model, org));
  };
  const out = await generateRoadmapCard(learnerUsageEnv(env, access, ids.proposalId, ids.proposalVersion), access, { authorizationId: ids.authorizationId, resultId: result.id, resultVersion: result.result_version },
    { loadAccepted: async () => rec, withProviderCall, callModel, ...(deps.generate ? { generate: deps.generate } : {}) });
  if (out.outcome === 'ok') return finish(env, access, roadmap, result, ids, out, { passage: rec.passageText, original: rec.learnerInstruction.original, rev: current.source_rev }, deps, now, fail);
  if (out.outcome === 'unavailable') return 'defer'; // not wired yet: the event retries, nothing was spent
  await fail(out.outcome === 'forbidden' ? 'denied_access' : out.failure_class);
  return 'failed';
}

// The checks, then the recorded outcome. Platform-funded (quota 'check'); the output is withheld unless every check that runs passes.
async function finish(env, access, roadmap, result, ids, out, { passage, original, rev }, deps, now, fail) {
  const db = env.LEARN_DB;
  const checkIds = { roadmapId: roadmap.id, version: ids.proposalVersion, anchor: result.card_id };
  const callModel = deps.checkCallModel || platformCallModel(env, access, { ...checkIds, quota: 'check', registry: deps.registry, transport: deps.transport, now });
  const classify = deps.classify || makeClassify({ ask: platformJevAsk(env, access, { ...checkIds, ask: deps.askJev || ((e, request) => askJev(e, request, { transport: 'direct' })), now }) });
  // Owner MVP policy (2026-11-06): an ordinary explanation is not held for a per-card citation check; safety, the source revision and the
  // output schema still gate it, and check_json records the citation check as not run.
  const verdict = await checkRoadmapCard({ block: out.block, passage, rev, instruction: original, grounding: false }, { callModel, classify, adjudicate: modelAdjudicator({ callModel }) });
  const checkJson = { validation: verdict.validation, grounding: { validation: verdict.grounding.validation, reason: verdict.grounding.reason ?? null, calls: verdict.grounding.calls, unresolved: verdict.grounding.unresolved?.length ?? 0,
      // private diagnostics (never shown to the learner): which claim failed, the evidence returned, the validation error, what the escalation did
      ...(verdict.grounding.failed?.length ? { failed: verdict.grounding.failed.slice(0, 6) } : {}) },
    safety: { decision: verdict.safety.decision, action: verdict.safety.action, why: verdict.safety.why, policy_version: verdict.safety.policy_version, input_hash: verdict.safety.input_hash, retried: verdict.safety.retried, adjudicated: verdict.safety.adjudicated } };
  await recordGenerated(db, access, { resultId: result.id, primitive: out.primitive, body: out.block, validation: verdict.validation, checkJson, now: now() });
  if (verdict.validation === 'passed' && verdict.publishable) return 'generated';
  // Withheld: the body stays private (entitlement requires passed checks) and the learner is refunded; the reason class picks no retry.
  // Only a genuine safety block or personal risk is policy_block; a source problem and an unfinished check keep their own class (and Retry).
  const cause = withheldCause(verdict);
  await fail(cause === 'safety' || cause === 'personal_risk' ? 'policy_block' : cause === 'unavailable' ? 'checking_unavailable' : 'terminal_validation_failure');
  return 'failed';
}
