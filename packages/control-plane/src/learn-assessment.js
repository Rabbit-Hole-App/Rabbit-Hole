// packages/control-plane/src/learn-assessment.js
// Assessment routing for saved attempts. Sources: the Task 06 section of C:/s/spec/tutor-workflow/draft.md and owner
// decision 7a (2026-10-20).
//   assessAttempt(env, actor, attemptId, deps) -> AssessmentRecord
// It works only on a saved attempt, and only through the operation it claimed (learn-attempt-store.js).
//
// Routes. The journey routes (keyed: a choice graded against a journey probe's server-only key; jev: short text checked against a
// journey registry's claims by JEV and the larger evaluator) were removed in the Tutor cleanup P1 with the journeys. Rows they
// wrote (route 'keyed', 'jev', 'larger') are history and stay readable.
//   rubric Text or code whose criteria carry a rubric (rubricVersion 'rubric-…'): one admitted call to LEARN_TASKS.tutor_rubric
//          (learn-rubric-assessment.js, Task 13). A coaching goal without a journey is assessable this way. A codebase goal's
//          criteria carry the codebase rubric; its cited repository files are read at their commit, and an answer whose
//          code cannot be read now is unavailable: source_unavailable, with no call (owner finding 5B).
//   visual A drawing whose criteria carry a rubric: its authorized image bytes go to one admitted call to
//          LEARN_TASKS.tutor_visual (learn-visual-assessment.js, Task 14).
//   explain_back  A combined Explain-back answer (explainBackOf): one admitted call judging every frozen criterion, with the
//          parent attempt and its pinned review for a revision, under TUTOR_EXPLAIN_BACK_ENABLED alone.
//   none   Otherwise a drawing is unavailable: visual_not_supported. Code and numeric answers are unavailable:
//          rubric_not_supported. Text is unavailable: no_registered_claims. A choice that answered a journey probe, whose
//          key is gone, is unavailable: no_answer_key (progress degrades to not assessed, never an error).
//
// The capability gate (richRoute): the rubric and visual routes run only where the deployment enables them
// (TUTOR_RUBRIC_ASSESSMENT_ENABLED / TUTOR_VISUAL_ASSESSMENT_ENABLED = 'true'; off until their real-model quality check
// passes, draft Task 15; TUTOR_CODEBASE_ASSESSMENT_ENABLED for codebase answers alone) and only for criteria that carry a rubric. Anything else stays visibly unassessed (owner 7a).
// Criteria of such an attempt that carry no rubric are listed unassessed (no_rubric).
//
// Spend. Every provider request passes the existing spend admission (spendCallModel, learn-spend.js).
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
import { claimAssessment, commitAssessment, ownActivity, pendingOperation, readAttempt } from './learn-attempt-store.js';
import { assessRubricAttempt, carriesRubric, rubricSources } from './learn-rubric-assessment.js';
import { assessVisualAttempt, resolveDrawing } from './learn-visual-assessment.js';
import { assessExplainBack, explainBackOf } from './learn-explain-assessment.js';
import { CODEBASE_RUBRIC, REPOSITORY_SOURCE, isRepositorySource } from '../../web/src/learn-codebase-goals.js';

// The criterion rows the attempt froze, at their exact versions.
async function criteriaOf(env, attempt) {
  const rows = (await env.LEARN_DB.prepare('SELECT criterion_id, version, label, requirement, requires_reasoning, rubric_version, skill_key FROM learn_goal_criteria WHERE goal_id = ?').bind(attempt.goalId).all()).results;
  return attempt.criterionRefs.map(ref => rows.find(r => r.criterion_id === ref.criterionId && r.version === ref.version)).filter(Boolean)
    .map(r => ({ criterionId: r.criterion_id, version: r.version, label: r.label, requirement: r.requirement, requiresReasoning: r.requires_reasoning === 1, rubricVersion: r.rubric_version, skillKey: r.skill_key }));
}

// The capability gate for Tasks 13 and 14: the rich route this attempt may take, or null.
// TUTOR_CODEBASE_ASSESSMENT_ENABLED (owner production GO 2026-10-21) opens the rubric route for codebase answers alone: every
// rubric criterion is the codebase rubric and the attempt is bound to cited repository files, which the resolver still reads
// at their commit under readableVersion. Other rubric goals and drawings keep their own switches.
export function richRoute(env, kind, criteria, sourceRefs = []) {
  if (!criteria.some(carriesRubric)) return null;
  if (kind === 'drawing') return env.TUTOR_VISUAL_ASSESSMENT_ENABLED === 'true' ? 'visual' : null;
  if (kind !== 'text' && kind !== 'code') return null;
  if (env.TUTOR_RUBRIC_ASSESSMENT_ENABLED === 'true') return 'rubric';
  const codebase = criteria.filter(carriesRubric).every(c => c.rubricVersion === CODEBASE_RUBRIC) && sourceRefs.some(isRepositorySource);
  return codebase && env.TUTOR_CODEBASE_ASSESSMENT_ENABLED === 'true' ? 'rubric' : null;
}

// A rich assessment. The evaluators get only what is authorized now: the learner's own sources or image, read under the
// route's access (deps.access), and the task prompt only while it is the version the learner answered.
async function assessRich(env, actor, attempt, criteria, route, deps) {
  const rubric = criteria.filter(carriesRubric);
  const unassessed = criteria.filter(c => !carriesRubric(c)).map(c => ({ criterionId: c.criterionId, version: c.version, reason: 'no_rubric' }));
  const activity = await ownActivity(env, actor, attempt.activityId);
  const context = { actor, criteria: rubric, unassessed, activity: activity?.revision === attempt.activityRevision ? { prompt: activity.prompt } : null };
  const rubricVersion = [...new Set(rubric.map(c => c.rubricVersion))].join(',').slice(0, 200);
  if (route === 'visual') return { rubricVersion, ...await assessVisualAttempt(env, attempt, { ...context, image: await resolveDrawing(env, deps.access, actor, attempt.submittedContent) }, deps) };
  const read = await rubricSources(env, deps.access, actor, attempt.sourceRefs);
  // A codebase answer is judged against the code it cites, at that commit (owner finding 5B). When that code cannot be read now
  // (access revoked, the version gone), nothing is sent: the answer stays unassessed and Progress keeps its last state.
  if (read.sourcesUnavailable.some(s => s.kind === REPOSITORY_SOURCE && s.reason === 'source_unavailable')) {
    return { rubricVersion, status: 'unavailable', reason: 'source_unavailable', provenance: { route: null, calls: [], unassessed, sourcesUnavailable: read.sourcesUnavailable } };
  }
  return { rubricVersion, ...await assessRubricAttempt(env, attempt, { ...context, ...read }, deps) };
}

async function assess(env, actor, attempt, deps, assessmentId) {
  const criteria = await criteriaOf(env, attempt);
  const rubricVersion = [...new Set(criteria.map(c => c.rubricVersion))].join(',').slice(0, 200) || null;
  const none = (status, reason, extra = {}) => ({ status, reason, rubricVersion, provenance: { route: null, calls: [], ...extra } });
  if (!criteria.length) return none('unavailable', 'no_criteria');
  // An Explain-back answer (learn-explain-assessment.js) has its own switch, so it never opens the general rubric or visual routes.
  const answer = explainBackOf(attempt);
  if (answer) {
    if (env.TUTOR_EXPLAIN_BACK_ENABLED !== 'true') return none('unavailable', 'explain_back_disabled', { gate: 'disabled' });
    return { rubricVersion, ...await assessExplainBack(env, actor, attempt, answer, criteria, deps, assessmentId) };
  }
  const kind = attempt.responseKind;
  const rich = richRoute(env, kind, criteria, attempt.sourceRefs);
  if (rich) return assessRich(env, actor, attempt, criteria, rich, deps);
  const gate = { gate: criteria.some(carriesRubric) ? 'disabled' : 'no_rubric' };
  if (kind === 'drawing') return none('unavailable', 'visual_not_supported', gate);
  if (kind !== 'text' && kind !== 'choice') return none('unavailable', 'rubric_not_supported', gate);
  // Tutor cleanup P1: no journey registry, so no registered claim to check text against and no probe key to grade a choice by. A
  // choice that answered a journey probe says so (no_answer_key); every other answer is as it was for a goal with no journey.
  const activity = kind === 'choice' ? await ownActivity(env, actor, attempt.activityId) : null;
  const keyless = activity != null && JSON.parse(activity.source_refs_json || '[]').some(r => r.kind === 'journey_probe');
  const unassessed = criteria.map(c => ({ criterionId: c.criterionId, version: c.version, reason: 'no_registered_claim' }));
  return none('unavailable', keyless ? 'no_answer_key' : 'no_registered_claims', { unassessed });
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
    try { result = await assess(env, actor, attempt, deps, op.id); }
    catch (error) {
      // ids only, never learner text or the account id
      console.error(JSON.stringify({ event: 'learn_assessment_error', assessment: op.id, error: error?.name || 'Error', message: String(error?.message || '').slice(0, 120) }));
      result = { status: 'failed', reason: 'assessment_error', provenance: { route: null, calls: [] } };
    }
    await commitAssessment(env, actor, { assessmentId: op.id, token, attemptId, goalId: attempt.goalId, ...result });
  }
  return (await readAttempt(env, actor, attemptId)).assessment;
}
