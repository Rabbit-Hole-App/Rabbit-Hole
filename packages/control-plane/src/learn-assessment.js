// packages/control-plane/src/learn-assessment.js
// Assessment routing for saved attempts. Sources: the Task 06 section of C:/s/spec/tutor-workflow/draft.md and owner
// decision 7a (2026-10-20).
//   assessAttempt(env, actor, attemptId, deps) -> AssessmentRecord
// It works only on a saved attempt, and only through the operation it claimed (learn-attempt-store.js).
//
// Routes. An attempt's criteria name registered claims through criterion.skillKey, a claim id in the goal's journey
// registry.
//   keyed  A choice that answers a journey probe with a server-only key. It is graded in code (probeEvaluation), with no
//          provider call. A keyed answer establishes no reasoning.
//   jev    Short text, checked against those claims: one JEV batch. The escalation policy may then ask for one admitted
//          call to LEARN_TASKS.tutor_evaluator, on consequential uncertainty or on a contradiction, confident or not (7a).
//   none   A drawing is unavailable: visual_not_supported (Task 14). Code and numeric answers are unavailable:
//          rubric_not_supported (Task 13). Text with no registered claim is unavailable: no_registered_claims.
//
// Spend. Every provider request passes the existing spend admission: askJev admits itself, and the larger evaluator goes
// through spendTransport (spendCallModel).
//
// Outcomes:
//   * A refusal is 'unavailable'.
//   * A timeout or a lost connection is 'unknown'. It is never retried automatically.
//   * A provider error or malformed output is 'failed'.
//   * None of these writes an observation, so the counts keep their last confirmed state.
//   * A contradiction whose escalation is refused or fails is saved as an observation with conflict. Progress shows it as
//     Needs review. It is never saved as a pass or a fail.
//
// Provenance records each call's role, requested and served model, reason, latency, usage and known cost. Unknown usage
// and cost are null, never 0.
//
// Journeys. A completed assessment of a journey activity also becomes that journey's evidence, once (feedJourney).
import { askJev, JEV_TRANSPORTS } from './learn-grade-jev.js';
import { anthropic } from './ask.js';
import { costUsd, loggedModel } from './learn-models.js';
import { TUTOR_PROTOCOL_VERSION } from './agents/learn-tutor.js';
import { evaluateFreeText, journeySpec, probeEvaluation, spendCallModel } from './learn-tutor-routes.js';
import { JourneyConflict, appendJourneyEvidence, loadJourneyById } from './learn-journey-store.js';
import { claimAssessment, commitAssessment, ownActivity, pendingOperation, readAttempt } from './learn-attempt-store.js';

export const KEYED_VERSION = 'journey-probe-key-v1';
// askJev's spend-guard refusals (learn-grade-jev.js): no call was made, so nothing is unknown about them.
const REFUSED = new Set(['cap_unset', 'daily_cap_reached', 'spend_schema_unavailable', 'spend_bound_unavailable', 'spend_identity_unavailable']);
const int = v => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const usd = v => (v != null && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);

/**
 * Turn evaluator events into one Observation per criterion. It is pure, and the deployed code and the tests use the same
 * function. The rules, in order:
 *   1. A contested idea left unsettled is an unresolved conflict: fit unclear, conflict true (Needs review).
 *   2. Settled passes and negatives on the same claim: partial.
 *   3. Settled negatives only: not_met.
 *   4. Settled passes covering every idea of the claim (or a keyed pass): met. Passes covering only some ideas: partial.
 *   5. Anything else is unclear and is not counted.
 * Application is 'applied' only when every pass of a met criterion was a transfer pass.
 */
export function observationsFrom({ events, criteria, claims, assistance, keyed }) {
  return criteria.map(c => {
    const own = events.filter(e => e.claim === c.skillKey);
    const conflict = own.some(e => e.contested && !e.settled);
    const settled = own.filter(e => e.settled);
    const passes = settled.filter(e => e.result === 'pass');
    const negatives = settled.filter(e => ['fail', 'misconception', 'gap'].includes(e.result));
    const ideas = claims[c.skillKey]?.ideas?.length ?? 0;
    const covered = keyed ? passes.length > 0 : ideas > 0 && new Set(passes.map(e => e.idea)).size >= ideas;
    const negative = negatives[0];
    const why = negative && (negative.result === 'misconception' ? `misconception:${negative.misconception_id}` : negative.result === 'gap' ? `prerequisite_gap:${negative.prerequisite}` : keyed ? 'wrong_option' : 'contradicted');
    let fit, reason;
    if (conflict) [fit, reason] = ['unclear', 'contradiction_unresolved'];
    else if (negatives.length && passes.length) [fit, reason] = ['partial', why];
    else if (negatives.length) [fit, reason] = ['not_met', why];
    else if (passes.length) [fit, reason] = covered ? ['met', keyed ? 'correct_option' : 'all_ideas_stated'] : ['partial', 'some_ideas_stated'];
    else [fit, reason] = ['unclear', own.some(e => e.result === 'non_attempt') ? 'non_attempt' : own.length ? 'uncertain' : 'not_addressed'];
    const reasoning = keyed ? (c.requiresReasoning ? 'missing' : 'not_required') : { met: 'supported', partial: 'partial', not_met: 'missing', unclear: 'unclear' }[fit];
    const application = fit === 'met' && passes.every(e => e.kind === 'demonstrated_in_transfer') ? 'applied' : 'not_assessed';
    return { criterionId: c.criterionId, criterionVersion: c.version, fit, reasoning, assistance, validity: 'valid', conflict, application, reason };
  });
}

// The criterion rows the attempt froze, at their exact versions.
async function criteriaOf(env, attempt) {
  const rows = (await env.LEARN_DB.prepare('SELECT criterion_id, version, requires_reasoning, rubric_version, skill_key FROM learn_goal_criteria WHERE goal_id = ?').bind(attempt.goalId).all()).results;
  return attempt.criterionRefs.map(ref => rows.find(r => r.criterion_id === ref.criterionId && r.version === ref.version)).filter(Boolean)
    .map(r => ({ criterionId: r.criterion_id, version: r.version, requiresReasoning: r.requires_reasoning === 1, rubricVersion: r.rubric_version, skillKey: r.skill_key }));
}

// The keyed probe a choice activity answers. Its source ref is {kind: 'journey_probe', id, version, locator?: {sectionId}}.
// With a sectionId, the probe is a check of that section's plan; without one, the journey's state decides, as in
// learn-tutor-routes.js openProbe. The key never leaves the server.
function probeOf(journey, ref) {
  const plan = journey.section_plan, section = ref.locator?.sectionId;
  const list = section != null ? (plan?.section_id === section ? plan.checks : null) : journey.state === 'diagnostic' ? journey.diagnostic?.probes : plan?.checks;
  const probe = list?.find(p => p.id === ref.id);
  return probe?.key ? probe : null;
}

async function assess(env, actor, attempt, deps) {
  const criteria = await criteriaOf(env, attempt);
  const rubricVersion = [...new Set(criteria.map(c => c.rubricVersion))].join(',').slice(0, 200) || null;
  const none = (status, reason, extra = {}) => ({ status, reason, rubricVersion, provenance: { route: null, calls: [], ...extra } });
  if (!criteria.length) return none('unavailable', 'no_criteria');
  const kind = attempt.responseKind;
  if (kind === 'drawing') return none('unavailable', 'visual_not_supported');
  if (kind !== 'text' && kind !== 'choice') return none('unavailable', 'rubric_not_supported');
  const activity = await ownActivity(env, actor, attempt.activityId);
  const journey = activity?.journey_id ? await loadJourneyById(env, activity.journey_id, { org: actor.org, owner_user_id: actor.userId }) : null;
  const claims = journey?.registry?.claims || {};
  const assessable = criteria.filter(c => c.skillKey && Object.hasOwn(claims, c.skillKey));
  const unassessed = criteria.filter(c => !assessable.includes(c)).map(c => ({ criterionId: c.criterionId, version: c.version, reason: 'no_registered_claim' }));
  if (!assessable.length) return none('unavailable', 'no_registered_claims', { unassessed });
  const sameVersion = activity.revision === attempt.activityRevision;

  if (kind === 'choice') {
    // The key belongs to the prompt version the learner answered.
    if (!sameVersion) return none('unavailable', 'activity_changed', { unassessed });
    const ref = JSON.parse(activity.source_refs_json).find(r => r.kind === 'journey_probe');
    const probe = ref && probeOf(journey, ref);
    if (!probe) return none('unavailable', 'no_answer_key', { unassessed });
    const option = attempt.submittedContent.optionId;
    if (!probe.options?.some(o => o.id === option)) return none('unavailable', 'unknown_option', { unassessed });
    const graded = assessable.filter(c => probe.claims.includes(c.skillKey));
    const skipped = [...unassessed, ...assessable.filter(c => !graded.includes(c)).map(c => ({ criterionId: c.criterionId, version: c.version, reason: 'not_in_probe' }))];
    if (!graded.length) return none('unavailable', 'no_registered_claims', { unassessed: skipped });
    const evaluation = probeEvaluation(journey.registry, probe, option), { events } = evaluation;
    const tag = { probe_id: probe.id, ...(ref.locator?.sectionId != null ? { section_id: ref.locator.sectionId } : {}) };
    return {
      journey: { journeyId: journey.id, evaluation, tag },
      status: 'completed', route: 'keyed', rubricVersion, evaluatorVersion: KEYED_VERSION,
      observations: observationsFrom({ events, criteria: graded, claims, assistance: attempt.assistance, keyed: true }),
      provenance: { route: 'keyed', checker: 'journey_probe_key', calls: [], unassessed: skipped },
    };
  }

  const ids = [...new Set(assessable.map(c => c.skillKey))];
  // The prompt the learner answered, while it is still that version and within the evaluator's bound. Otherwise the
  // claims alone define the checks.
  const question = sameVersion && activity.prompt.length <= 1200 ? activity.prompt : null;
  const spec = journeySpec(journey, { message: attempt.submittedContent.text, claims: ids, answering: true, ...(question ? { question } : {}) });
  if (spec.error) return none('unavailable', spec.error === 'claims must be 1-6 claim ids' ? 'too_many_claims' : 'not_eligible', { unassessed });

  // Watch both calls without changing them: what JEV served and any spend refusal of the escalation.
  const seen = { jev: null, refused: null };
  const ask = async (...args) => {
    try { const r = await (deps.ask || askJev)(...args); seen.jev = { ok: true, body: r.body, cost: r.cost }; return r; }
    catch (error) { seen.jev = { ok: false, code: error.code ?? null }; throw error; }
  };
  const paid = spendCallModel(env, { org: actor.org, user_id: actor.userId }, 'tutor_evaluate', deps.callModel || loggedModel('tutor_evaluator', anthropic));
  const callModel = async (...args) => {
    const response = await paid(...args);
    if (response.status === 429) {
      const body = await response.clone().json().catch(() => null);
      if (body?.code === 'spend_limited') seen.refused = body.reason || 'spend_limited';
    }
    return response;
  };
  const result = await evaluateFreeText(env, spec.value, attempt.submittedContent.text, { ask, callModel, ...(deps.timeoutMs ? { timeoutMs: deps.timeoutMs } : {}) });

  const transport = env.TYPESAFE_API_KEY ? 'direct' : env.VERCEL_TYPESAFE_API_KEY ? 'gateway' : null;
  const { jev: jevT, larger: largerT } = result.telemetry;
  const calls = [];
  if (seen.jev) {
    const refused = !seen.jev.ok && REFUSED.has(seen.jev.code);
    calls.push({
      role: 'jev', requestedModel: transport ? JEV_TRANSPORTS[transport].model : null, servedModel: seen.jev.body?.model ?? null, reason: 'claim_check',
      latencyMs: jevT.ms, outcome: refused ? 'refused' : jevT.outcome,
      usage: { inputTokens: int(seen.jev.body?.usage?.input_tokens), outputTokens: int(seen.jev.body?.usage?.output_tokens) }, costUsd: usd(seen.jev.cost),
    });
  }
  if (largerT.called) {
    const tokens = { inputTokens: largerT.input_tokens, outputTokens: largerT.output_tokens };
    const known = largerT.served_model && int(tokens.inputTokens) != null && int(tokens.outputTokens) != null;
    calls.push({
      role: 'tutor_evaluator', requestedModel: largerT.requested_model, servedModel: largerT.served_model, reason: largerT.reason,
      latencyMs: largerT.ms, outcome: seen.refused ? 'refused' : largerT.outcome,
      usage: tokens, costUsd: known ? costUsd({ model: largerT.served_model, input_tokens: tokens.inputTokens, output_tokens: tokens.outputTokens }) : null,
    });
  }
  const base = { rubricVersion, evaluatorVersion: TUTOR_PROTOCOL_VERSION };
  if (result.status === 'error') {
    const code = seen.jev?.code;
    const [status, reason] = !seen.jev ? ['unavailable', 'evaluator_unconfigured']
      : seen.jev.ok ? ['failed', 'malformed_evaluation']
        : REFUSED.has(code) ? ['unavailable', 'allowance_refused']
          : code === 'timeout' || code === 'network' ? ['unknown', 'completion_unknown']
            : ['failed', 'evaluator_error'];
    return { ...base, status, reason, provenance: { route: null, calls, escalation: null, unassessed } };
  }
  const esc = result.escalation;
  const outcome = !esc?.escalate ? 'not_needed' : seen.refused ? 'refused' : result.larger_error ? (largerT.outcome === 'timeout' ? 'unknown' : 'failed') : 'completed';
  return {
    journey: { journeyId: journey.id, evaluation: { status: result.status, evaluator: result.evaluator, events: result.events } },
    ...base, status: 'completed', route: result.evaluator === 'larger' ? 'larger' : 'jev',
    reason: esc?.escalate && outcome !== 'completed' ? `escalation_${outcome}` : null,
    observations: observationsFrom({ events: result.events, criteria: assessable, claims, assistance: attempt.assistance, keyed: false }),
    provenance: { route: result.evaluator === 'larger' ? 'larger' : 'jev', calls, escalation: esc ? { requested: esc.escalate, reason: esc.reason, uncertain: esc.uncertain, outcome } : null, unassessed },
  };
}

/**
 * Dispatch the attempt's pending operation, at most once, and return the attempt's latest AssessmentRecord.
 *   * Only the caller that wins the claim calls an evaluator.
 *   * Any other caller, and any attempt with no pending operation, just reads the current record.
 *   * An unexpected error inside the evaluation is saved as 'failed' (assessment_error). The claim never stays open.
 */
export async function assessAttempt(env, actor, attemptId, deps = {}) {
  const op = await pendingOperation(env, actor, attemptId);
  const token = op ? await claimAssessment(env, actor, op.id) : null;
  if (token) {
    const { attempt } = await readAttempt(env, actor, attemptId);
    let result;
    try { result = await assess(env, actor, attempt, deps); }
    catch (error) {
      // ids only, never learner text or the account id
      console.error(JSON.stringify({ event: 'learn_assessment_error', assessment: op.id, error: error?.name || 'Error', message: String(error?.message || '').slice(0, 120) }));
      result = { status: 'failed', reason: 'assessment_error', provenance: { route: null, calls: [] } };
    }
    const { journey, ...outcome } = result;
    const saved = await commitAssessment(env, actor, { assessmentId: op.id, token, attemptId, goalId: attempt.goalId, ...outcome });
    const record = saved && journey ? (await readAttempt(env, actor, attemptId)).assessments.find(a => a.assessmentId === op.id) : null;
    if (record?.status === 'completed') {
      await feedJourney(env, actor, attempt, record, journey)
        .catch(error => console.error(JSON.stringify({ event: 'learn_assessment_journey_error', assessment: op.id, error: error?.name || 'Error' })));
    }
  }
  return (await readAttempt(env, actor, attemptId)).assessment;
}

/**
 * Slice A gap b (T3-report §7.6): a completed assessment of a journey activity is that journey's evidence too, so the
 * walker's probe reading (probeResult), section completion and the planners see it. Once per attempt: when the journey
 * already holds evidence for this attempt, one of its observations or, for a keyed check, that probe (a reassessment, a
 * retried request, an answer through the journey's own evaluate route), nothing is added, so nothing counts twice. The ref
 * carries ids only, never learner text. A journey moved by another tab meanwhile is reloaded once, as journeyEvaluate does.
 * @returns {Promise<boolean>} whether evidence was added
 */
export async function feedJourney(env, actor, attempt, record, { journeyId, evaluation, tag = null }) {
  const ids = record.observations.map(o => o.observationId);
  const ref = { attempt_id: attempt.attemptId, assessment_id: record.assessmentId, observation_ids: ids, ...tag, canvas: { app: actor.app, board: actor.board } };
  const held = j => j.evidence.events.some(e => e.ref?.attempt_id === attempt.attemptId || e.ref?.observation_ids?.some(id => ids.includes(id))
    || (tag && e.ref?.probe_id === tag.probe_id && (e.ref.section_id ?? null) === (tag.section_id ?? null)));
  for (let tries = 0; tries < 2; tries += 1) {
    const journey = await loadJourneyById(env, journeyId, { org: actor.org, owner_user_id: actor.userId });
    if (!journey || held(journey)) return false;
    try { return (await appendJourneyEvidence(env, journey, evaluation, ref)).events !== journey.evidence.events; }
    catch (error) { if (!(error instanceof JourneyConflict) || error.code !== 'revision') throw error; }
  }
  return false;
}
