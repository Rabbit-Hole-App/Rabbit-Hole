// R4 integration glue: the job that drives generation from the `step_accepted` outbox event (R4.05, R4.08 to R4.11). For each accepted result slot:
// revalidate the source request-less, run Tools' generateRoadmapCard (text/table only, provider calls stable-identified and drawn from the step
// hold), run Tools' checks (grounding and text safety) on the output, then record the outcome through State: recordGenerated on a passed
// card, failCard for every failure class (a transient provider failure earns its ONE automatic retry after the refund; anything else is
// terminal and refunded). Delivery stays the learner's browser: this never writes a board. Accepted work finishes even when ROADMAP_ENABLED
// is off (v1.4 4.1); only routes and unsolicited stages are gated.
// ponytail: a held card (unsupported claims) is refunded rather than regenerated once; a checked regeneration is a later change.
import { generateRoadmapCard } from './roadmap-generate.js';
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

// How many automatic retries this result already used: each retried failure left a card_failed receipt with retry:true.
const retriesUsed = async (db, resultId) => (await db.prepare("SELECT COUNT(*) AS n FROM learn_roadmap_actions WHERE operation = 'card_failed' AND action_key LIKE ? AND outcome_json LIKE '%\"retry\":true%'").bind(`sys_fail_${resultId}_%`).first()).n;

export async function generationHandler(env, event, { now = nowSeconds() } = {}, deps = {}) {
  const db = env.LEARN_DB;
  const access = await accessForRoadmap(db, event, { checkBoard: false });
  if (!access) return { done: true };
  const roadmap = await readRoadmap(db, access, event.roadmap_id);
  const { proposalId, proposalVersion, authorizationId } = parse(event.payload_json) || {};
  if (!roadmap || !proposalId) return { done: true };
  const { results } = await db.prepare("SELECT * FROM learn_step_results WHERE roadmap_id = ? AND proposal_id = ? AND proposal_version = ? AND decision = 'accepted' AND delivery = 'not_delivered' AND generation IN ('pending', 'generating') ORDER BY slot_index")
    .bind(roadmap.id, proposalId, proposalVersion).all();
  let deferred = false;
  for (const result of results || []) if (await generateOne(env, access, roadmap, result, { proposalId, proposalVersion, authorizationId }, { now, ...deps }) === 'defer') deferred = true;
  return deferred ? { retry: true } : { done: true };
}

async function generateOne(env, access, roadmap, result, ids, deps) {
  const db = env.LEARN_DB, now = () => deps.now ?? nowSeconds();
  const fail = (failureClass, retryNo) => failCard(db, access, { roadmapId: roadmap.id, resultId: result.id, failureClass, retryNo, now: now() });
  // A crash left a call that may have reached the provider: its outcome is unknown, it is never retried blind (R4.06). Refund and stop.
  const open = await db.prepare("SELECT 1 AS n FROM learn_roadmap_calls WHERE result_id = ? AND checkpoint IN ('admitted', 'dispatched', 'unknown', 'reconciling') LIMIT 1").bind(result.id).first();
  if (open) { await fail('unknown_provider_outcome'); return 'failed'; }
  // Access is rechecked before every dispatch: a board that is no longer the owner's gets no new call and no charge.
  if (!await accessForRoadmap(db, { org: access.org, owner_user_id: access.actorUserId, board_id: access.boardId, roadmap_id: roadmap.id })) { await fail('denied_access'); return 'failed'; }
  await db.prepare("UPDATE learn_step_results SET generation = 'generating', updated_at = ? WHERE id = ? AND generation = 'pending'").bind(now(), result.id).run();
  const step = await db.prepare('SELECT * FROM learn_roadmap_steps WHERE id = ?').bind(result.step_id).first();
  const proposal = await db.prepare('SELECT format FROM learn_step_proposals WHERE id = ? AND version = ?').bind(ids.proposalId, ids.proposalVersion).first();
  const original = (await db.prepare('SELECT text FROM learn_roadmap_instructions WHERE roadmap_id = ? AND version = 1').bind(roadmap.id).first())?.text ?? '';
  const base = deps.base || loggedModel('artifact', planModel);
  const readSource = deps.readSourceForActor || readMarkdownForActor;

  for (let retryNo = await retriesUsed(db, result.id); ; ) {
    const current = await readRoadmap(db, access, roadmap.id);
    const source = await revalidateSourceAsJob(db, access, current);
    if (!source.ok) { await fail('denied_access', retryNo); return 'failed'; } // stops BEFORE admission: nothing is spent
    const text = await readSource(env, access, { key: current.source_key, rev: current.source_rev });
    if (text.status !== 'ok' || text.complete === false) { await fail('denied_access', retryNo); return 'failed'; }
    const passage = text.text.slice(step.passage_start, step.passage_end);
    const sourceRef = step.source_ref_id ? await (deps.loadSourceRef || d1PublicRef)(env, access, step.source_ref_id) : null;
    const loadAccepted = async () => ({ cardId: result.card_id, stepId: step.id, proposalId: ids.proposalId, proposalVersion: ids.proposalVersion, format: proposal?.format ?? step.format, stepTitle: step.title, stepGoal: step.goal,
      passageText: passage, sourceRef, language: current.language || 'en', depth: current.depth, retry: retryNo });
    // The learner's usage context (payer from the access object, never a body) with the step hold; each call is checkpointed around the transport.
    const withProviderCall = (e, fields) => withRoadmapProviderCall(e, fields, { kind: fields.stage === 'generate' ? 'generation' : 'repair' });
    const callModel = async (e, body, model, org) => {
      const op = operationOf(e), f = fieldsOfKey(op.key);
      await planCall(db, access, { opId: op.opId, key: op.key, roadmapId: roadmap.id, resultId: result.id, authorizationId: ids.authorizationId, stage: f.stage, call: f.call, retry: f.retry, payer: 'learner', task: 'artifact', model, now: now() });
      return checkpointed(db, op.opId, now, () => base(e, body, model, org));
    };
    const out = await generateRoadmapCard(learnerUsageEnv(env, access, ids.proposalId, ids.proposalVersion), access, { authorizationId: ids.authorizationId, resultId: result.id, resultVersion: result.result_version },
      { loadAccepted, withProviderCall, callModel, ...(deps.generate ? { generate: deps.generate } : {}) });

    if (out.outcome === 'ok') return finish(env, access, roadmap, result, ids, out, { passage, original, rev: current.source_rev }, deps, now, fail, retryNo);
    if (out.outcome === 'unavailable') return 'defer'; // not wired yet: the event retries, nothing was spent
    const done = await fail(out.outcome === 'forbidden' ? 'denied_access' : out.failure_class, retryNo);
    if (done.body?.retry) { retryNo = done.body.retryNo; continue; } // refunded first, then the one bounded automatic retry with a fresh operation identity
    return 'failed';
  }
}

// The checks, then the recorded outcome. Platform-funded (quota 'check'); the output is withheld unless every check passes.
async function finish(env, access, roadmap, result, ids, out, { passage, original, rev }, deps, now, fail, retryNo) {
  const db = env.LEARN_DB;
  const checkIds = { roadmapId: roadmap.id, version: ids.proposalVersion, anchor: result.card_id };
  const callModel = deps.checkCallModel || platformCallModel(env, access, { ...checkIds, quota: 'check', registry: deps.registry, transport: deps.transport, now });
  const classify = deps.classify || makeClassify({ ask: platformJevAsk(env, access, { ...checkIds, ask: deps.askJev || ((e, request) => askJev(e, request, { transport: 'direct' })), now }) });
  const verdict = await checkRoadmapCard({ block: out.block, passage, rev, instruction: original }, { callModel, classify, adjudicate: modelAdjudicator({ callModel }) });
  const checkJson = { validation: verdict.validation, grounding: { validation: verdict.grounding.validation, reason: verdict.grounding.reason ?? null, calls: verdict.grounding.calls, unresolved: verdict.grounding.unresolved?.length ?? 0,
      // private diagnostics (never shown to the learner): which claim failed, the evidence returned, the validation error, what the escalation did
      ...(verdict.grounding.failed?.length ? { failed: verdict.grounding.failed.slice(0, 6) } : {}) },
    safety: { decision: verdict.safety.decision, action: verdict.safety.action, why: verdict.safety.why, policy_version: verdict.safety.policy_version, input_hash: verdict.safety.input_hash, retried: verdict.safety.retried, adjudicated: verdict.safety.adjudicated } };
  await recordGenerated(db, access, { resultId: result.id, primitive: out.primitive, body: out.block, validation: verdict.validation, checkJson, now: now() });
  if (verdict.validation === 'passed' && verdict.publishable) return 'generated';
  // Withheld: the body stays private (entitlement requires passed checks) and the learner is refunded; the reason class picks no retry.
  // Only a genuine safety block or personal risk is policy_block; a source problem and an unfinished check keep their own class (and Retry).
  const cause = withheldCause(verdict);
  await fail(cause === 'safety' || cause === 'personal_risk' ? 'policy_block' : cause === 'unavailable' ? 'checking_unavailable' : 'terminal_validation_failure', retryNo);
  return 'failed';
}
