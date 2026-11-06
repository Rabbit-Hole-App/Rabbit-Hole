// Tutor decisions and hook exposure (brief Task 12; plan C:/s/spec/telemetry/task12-tutor-evidence-plan.md; owner decisions
// A to F, 2026-10-23). Built in the browser from the finished TutorDecisionEvent v1 (web/src/tutor-telemetry.js) and accepted only
// by the signed-in route POST /api/telemetry/tutor (ingest: 'tutor'). Ids, enums, counts, versions and timings only: no goal
// text, hook text, rationale, answer, excerpt, title or public identifier. The server stamps the account and time, and from its own
// records the goal, activity and criteria; a canvas reference only where the account owns that canvas.
// No difficulty field: the product has none (decision A). assistance_offered is derived from the action types by assistance-map-v1
// (web/src/tutor-telemetry.js); offered is not displayed and not used: displayed and used help are read from the hook events and from
// the assessed attempts (learning_attempts.assistance), never inferred here.
const COUNT = { type: 'int' };
export default {
  namespace: 'tutor',
  ingest: 'tutor',
  events: {
    // One per Tutor turn (tutor_decision).
    'tutor.decision': {
      session_id: { type: 'id' },
      scope: { enum: ['owned', 'shared'] },
      mode: { enum: ['journey', 'dive', 'course', 'canvas', 'shared'] },
      canvas_ref: { type: 'id' },           // the learner's own canvas (app id), only where the server confirmed ownership
      board: { type: 'token' },
      share_key: { type: 'id' },            // the one-way key of a shared canvas this turn came from; never its token or owner
      journey_id: { type: 'id' }, section_id: { type: 'id' }, dive_id: { type: 'id' },
      // From the server's own coaching records, never the browser: the learner's active goal and activity at ingestion.
      goal_id: { type: 'id' }, activity_id: { type: 'id' }, activity_revision: COUNT,
      activity_type: { enum: ['text', 'choice', 'numeric', 'drawing', 'code'] },
      criteria: { type: 'ids' },            // criterion_id:version of the activity
      // Evidence available before the decision: the selected claims by state.
      evidence_understood: COUNT, evidence_uncertain: COUNT, evidence_misconception: COUNT, evidence_prerequisite_gap: COUNT, evidence_not_observed: COUNT,
      target_claims: { type: 'ids' },
      transitions: COUNT, to_misconception: COUNT, to_understood: COUNT,
      intent_mode: { enum: ['auto', 'explicit_slash'] },
      inferred_intent: { enum: ['ask', 'teach', 'research', 'do'] },
      intent_status: { enum: ['declared', 'missing', 'explicit'] },
      action_type: { type: 'token' }, modality: { type: 'token' }, cost_tier: { enum: ['none', 'model', 'paid'] }, capability: { type: 'token' },
      actions: { type: 'ids' },
      reason_codes: { type: 'ids' }, reason_source: { enum: ['planner', 'router'] },
      selected_hook: { type: 'id' },
      clarification: { type: 'bool' },
      grounding: { enum: ['grounded', 'partially_grounded', 'insufficient_evidence', 'retrieval_failed'] },
      assistance_offered: { enum: ['none', 'explanation', 'material', 'scaffold', 'unknown'] },
      model_escalated: { type: 'bool' }, model_calls: COUNT,
      validation_ok: { type: 'bool' }, dropped_actions: COUNT, repairs: COUNT, repair_rules: { type: 'ids' }, fallback: { type: 'token' },
      planner_ms: { type: 'ms' }, first_text_ms: { type: 'ms' }, total_ms: { type: 'ms' }, handoff_ms: { type: 'ms' }, blocking_ms: { type: 'ms' },
      usage: { type: 'usage' },
      flags: { type: 'ids' },
    },
    // One per hook set that landed (next_steps_computed), including cached sets and sets discarded because their basis moved on.
    'tutor.hooks_computed': {
      session_id: { type: 'id' }, set_id: { type: 'id', required: true },
      scope: { enum: ['owned', 'shared'] }, mode: { enum: ['journey', 'dive', 'course', 'canvas', 'shared'] },
      canvas_ref: { type: 'id' }, board: { type: 'token' }, share_key: { type: 'id' }, journey_id: { type: 'id' }, section_id: { type: 'id' }, dive_id: { type: 'id' },
      suggestion_ids: { type: 'ids' },     // in screen order
      tier: { type: 'token' }, escalated: { type: 'bool' }, cached: { type: 'bool' }, discarded: { type: 'bool' }, calls: COUNT,
      validation_ok: { type: 'bool' }, fallback: { type: 'token' },
      evidence_understood: COUNT, evidence_uncertain: COUNT, evidence_misconception: COUNT, evidence_prerequisite_gap: COUNT, evidence_not_observed: COUNT,
      claim_count: COUNT, concept_count: COUNT,
      planner_ms: { type: 'ms' }, usage: { type: 'usage' },
    },
    // One per set the first time it is on screen (next_steps_shown), cached or not: the exposure the generation record cannot show. The
    // v1 shown event does not say whether the set was cached; read that from the set's tutor.hooks_computed (same set_id).
    'tutor.hooks_shown': {
      session_id: { type: 'id' }, set_id: { type: 'id', required: true },
      scope: { enum: ['owned', 'shared'] }, mode: { enum: ['journey', 'dive', 'course', 'canvas', 'shared'] },
      canvas_ref: { type: 'id' }, board: { type: 'token' }, share_key: { type: 'id' },
      suggestion_ids: { type: 'ids' },
    },
  },
};
