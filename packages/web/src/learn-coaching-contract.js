// packages/web/src/learn-coaching-contract.js
// Tutor workflow shared contracts (C:/s/spec/tutor-workflow/draft.md "Shared contracts", Task 01; owner decisions
// 2026-10-20 1a-5a). Pure: no storage, no network, no model. The Worker imports it as ../../web/src/... like the journey
// code does, so the browser and the server validate one shape and step controls with one reducer.
//
// Wire shapes (JSDoc; validateCoachingRecord(kind, value) checks each kind named in SHAPES):
// @typedef {{org: string, userId: string, app: string, board: string}} ActorScope  server-resolved; client fields are never authority
// @typedef {{mode: 'auto'|'ask'|'tutor', tutorEnabled: boolean, suggestionsPaused: boolean, revision: number}} TutorControls
// @typedef {{goalId: string, scopeVersion: number}} GoalRef
// @typedef {{criterionId: string, version: number}} CriterionRef
// @typedef {{criterionId: string, version: number, label: string, requirement: string, requiresReasoning: boolean, requiresTransfer?: boolean, rubricVersion: string, skillKey?: string}} Criterion
//   requiresTransfer (integrator ruling Q1, 2026-10-20): demonstrated only with a valid transfer (application) observation
// @typedef {{goalId: string, label: string, outcome?: string, scopeVersion: number, lifecycle: 'open'|'completed'|'archived',
//   status: 'active'|'paused'|'completed'|'archived', criteria: Criterion[], activityId?: string, journeyId?: string,
//   revision: number, createdAt: string, updatedAt: string}} Goal  status is derived: an open goal is active iff the pointer names it
// @typedef {{activityId: string, goalId: string, revision: number, status: string, objective: string, prompt: string, responseKind: string,
//   criterionRefs: CriterionRef[], sourceRefs: SourceRef[], checkpoint?: object, updatedAt: string}} Activity  revision is the prompt version attempts bind to
// @typedef {{controls: TutorControls, goals: Goal[], activeGoalId?: string, activeActivityId?: string, activities?: Activity[], revision: number}} CoachingState
//   activities: each goal's current activity (the one a return resumes)
// @typedef {{kind: string, id: string, version: string|number, hash?: string, locator?: object}} SourceRef  hash: a real content hash when the store has no revision
// @typedef {{activityId: string, revision: number, goalRef: GoalRef, criterionRefs: CriterionRef[], sourceRefs: SourceRef[], prompt: string, checkpoint?: object}} ActivityRef
// @typedef {{kind: string, activityRef?: ActivityRef, messageKey?: string, sourceRefs: SourceRef[], allowedActions: string[]}} EntryDecision  never invokes a provider
// @typedef {{kind: 'answer'|'resume'|'create_goal'|'clarify', goalRef?: GoalRef, activityRef?: ActivityRef, sourceRefs: SourceRef[]}} FocusDecision
// @typedef {{goalRef: GoalRef, criterionRefs: CriterionRef[], objective: string, prompt: string, responseKind: string, material?: object, nextActions: string[], reason: string}} ActivityProposal
// @typedef {{activityId: string, activityRevision: number, submissionKey: string, submittedContent: any, sourceRefs: SourceRef[], assistanceRefs: string[]}} SubmitAttempt
//   the server freezes the content, resolves assistance and computes the canonical hash
// @typedef {{observationId: string, attemptId: string, assessmentId: string, assessmentStatus: string, criterionId: string, criterionVersion: number,
//   fit: 'met'|'partial'|'not_met'|'unclear', reasoning: 'supported'|'partial'|'missing'|'unclear'|'not_required', assistance: 'none'|'assisted'|'unknown',
//   validity: 'valid'|'disputed'|'superseded', conflict?: boolean, application?: 'not_assessed'|'applied', retentionOf?: string,
//   supersedesAssessmentId?: string, observedAt: string, reason?: string}} Observation
// @typedef {{assessmentId: string, attemptId: string, status: string, observations: Observation[], rubricVersion?: string, provenance: object, supersedesAssessmentId?: string}} AssessmentRecord
//   status is processing (pending/completed/unavailable/failed/unknown), never a learner grade
// @typedef {{goalRef: GoalRef, summaryRevision: number, derivationVersion: number, criteria: object[], counts: object, pendingAssessments: string[], savedAt?: string, nextAction?: object}} ProgressView
// @typedef {{goalRefs: GoalRef[], criterionRefs: CriterionRef[], dimensions: string[], timeRange?: object, observationIds: string[], summaryRevision: number}} ProgressQuestionScope
// @typedef {{actionId: string, kind: string, originContext: object, expectedRevisions: object, payload?: object}} TutorAction
// @typedef {{actionId: string, expectedRevision: number, action: string, payload: object}} CoachingRequest  POST /api/learn/coaching

export const MODES = ['auto', 'ask', 'tutor'];
export const GOAL_LIFECYCLE = ['open', 'completed', 'archived'];
export const GOAL_STATUS = ['active', 'paused', 'completed', 'archived'];
export const ACTIVITY_STATUS = ['in_progress', 'awaiting_feedback', 'feedback_ready', 'completed', 'paused', 'skipped'];
export const RESPONSE_KINDS = ['text', 'choice', 'numeric', 'drawing', 'code'];
export const ASSESSMENT_STATUS = ['pending', 'completed', 'unavailable', 'failed', 'unknown'];
export const FIT = ['met', 'partial', 'not_met', 'unclear'];
export const REASONING = ['supported', 'partial', 'missing', 'unclear', 'not_required'];
export const ASSISTANCE = ['none', 'assisted', 'unknown'];
export const VALIDITY = ['valid', 'disputed', 'superseded'];
export const CRITERION_STATUS = ['not_checked', 'practising', 'demonstrated_with_help', 'demonstrated_independently', 'needs_review'];
export const DIMENSIONS = ['fit', 'reasoning', 'assistance', 'application', 'retention'];
export const ENTRY_KINDS = ['loading', 'recovery', 'quiet', 'welcome', 'existing_work', 'resume', 'completed'];
export const ENTRY_ACTIONS = ['retry', 'set_goal', 'explain', 'review', 'build_lesson', 'continue', 'recap', 'quick_check', 'resume', 'next_goal', 'something_else'];
export const FOCUS_KINDS = ['answer', 'resume', 'create_goal', 'clarify'];
// POST /api/learn/coaching actions (Task 02). activate_goal is the explicit return to a paused goal; edit_goal and delete_goal
// are goal management (/goal, owner 2026-10-21), each naming the goal revision it was made on.
export const COACHING_ACTIONS = ['save_controls', 'create_goal', 'change_scope', 'activate_goal', 'activate_activity', 'pause_activity', 'edit_goal', 'delete_goal'];
// reduceTutorControls events. question and check_review are listed so callers can prove they change nothing.
export const CONTROL_EVENTS = ['select_mode', 'set_tutor_enabled', 'not_now', 'resume', 'start_guided', 'question', 'check_review', 'continue_own_work', 'undo'];
export const CONTROL_EFFECTS = ['persist', 'suspend_coaching', 'show_choices', 'show_undo'];
export const DERIVATION_VERSION = 1;

// A new personal canvas record (Implementation defaults): Auto selected; the dormant Tutor preference On and unpaused.
export const defaultControls = () => ({ mode: 'auto', tutorEnabled: true, suggestionsPaused: false, revision: 0 });

// --- validation -------------------------------------------------------------------------------------------------------
// Field specs: 'id' a non-empty string of at most 200; 'text' a non-empty string of at most 4000; 'str' any string of at
// most 4000; 'int' a non-negative integer; 'bool'; 'obj' a plain object; 'any' anything but undefined; 'ver' an id or an
// int; an array of strings is an enum; [spec] an array of that spec; a SHAPES key is a nested record. A trailing '?'
// (or {opt: spec}) makes the field optional: null or absent.
const ID = 200, TEXT = 4000;
const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
const BASE = {
  id: v => typeof v === 'string' && v.length > 0 && v.length <= ID,
  text: v => typeof v === 'string' && v.trim().length > 0 && v.length <= TEXT,
  str: v => typeof v === 'string' && v.length <= TEXT,
  int: v => Number.isInteger(v) && v >= 0,
  bool: v => typeof v === 'boolean',
  obj: isObj,
  any: v => v !== undefined,
  ver: v => BASE.id(v) || BASE.int(v),
};
const opt = spec => ({ opt: spec });

export const SHAPES = {
  ActorScope: { org: 'id', userId: 'id', app: 'id', board: 'id' },
  TutorControls: { mode: MODES, tutorEnabled: 'bool', suggestionsPaused: 'bool', revision: 'int' },
  GoalRef: { goalId: 'id', scopeVersion: 'int' },
  CriterionRef: { criterionId: 'id', version: 'int' },
  Criterion: { criterionId: 'id', version: 'int', label: 'text', requirement: 'text', requiresReasoning: 'bool', requiresTransfer: 'bool?', rubricVersion: 'id', skillKey: 'id?' },
  Goal: {
    goalId: 'id', label: 'text', outcome: 'str?', scopeVersion: 'int', lifecycle: GOAL_LIFECYCLE, status: GOAL_STATUS,
    criteria: ['Criterion'], activityId: 'id?', journeyId: 'id?', revision: 'int', createdAt: 'id', updatedAt: 'id',
  },
  Activity: {
    activityId: 'id', goalId: 'id', revision: 'int', status: ACTIVITY_STATUS, objective: 'text', prompt: 'text', responseKind: RESPONSE_KINDS,
    criterionRefs: ['CriterionRef'], sourceRefs: ['SourceRef'], checkpoint: 'obj?', updatedAt: 'id',
  },
  CoachingState: { controls: 'TutorControls', goals: ['Goal'], activeGoalId: 'id?', activeActivityId: 'id?', activities: opt(['Activity']), revision: 'int' },
  SourceRef: { kind: 'id', id: 'id', version: 'ver', hash: 'id?', locator: 'obj?' },
  ActivityRef: { activityId: 'id', revision: 'int', goalRef: 'GoalRef', criterionRefs: ['CriterionRef'], sourceRefs: ['SourceRef'], prompt: 'text', checkpoint: 'obj?' },
  EntryDecision: { kind: ENTRY_KINDS, activityRef: opt('ActivityRef'), messageKey: 'id?', sourceRefs: ['SourceRef'], allowedActions: [ENTRY_ACTIONS] },
  FocusDecision: { kind: FOCUS_KINDS, goalRef: opt('GoalRef'), activityRef: opt('ActivityRef'), sourceRefs: ['SourceRef'] },
  ActivityProposal: {
    goalRef: 'GoalRef', criterionRefs: ['CriterionRef'], objective: 'text', prompt: 'text', responseKind: RESPONSE_KINDS,
    material: 'obj?', nextActions: ['text'], reason: 'text',
  },
  SubmitAttempt: { activityId: 'id', activityRevision: 'int', submissionKey: 'id', submittedContent: 'any', sourceRefs: ['SourceRef'], assistanceRefs: ['id'] },
  Observation: {
    observationId: 'id', attemptId: 'id', assessmentId: 'id', assessmentStatus: ASSESSMENT_STATUS, criterionId: 'id', criterionVersion: 'int',
    fit: FIT, reasoning: REASONING, assistance: ASSISTANCE, validity: VALIDITY, conflict: 'bool?', application: opt(['not_assessed', 'applied']),
    retentionOf: 'id?', supersedesAssessmentId: 'id?', observedAt: 'id', reason: 'str?',
  },
  AssessmentRecord: { assessmentId: 'id', attemptId: 'id', status: ASSESSMENT_STATUS, observations: ['Observation'], rubricVersion: 'id?', provenance: 'obj', supersedesAssessmentId: 'id?' },
  ProgressView: {
    goalRef: 'GoalRef', summaryRevision: 'int', derivationVersion: 'int', criteria: ['obj'], counts: 'obj', pendingAssessments: ['id'],
    savedAt: 'id?', nextAction: 'obj?',
  },
  ProgressQuestionScope: { goalRefs: ['GoalRef'], criterionRefs: ['CriterionRef'], dimensions: [DIMENSIONS], timeRange: 'obj?', observationIds: ['id'], summaryRevision: 'int' },
  TutorAction: { actionId: 'id', kind: 'id', originContext: 'obj', expectedRevisions: 'obj', payload: 'obj?' },
  CoachingRequest: { actionId: 'id', expectedRevision: 'int', action: COACHING_ACTIONS, payload: 'obj' },
};

const MAX_ITEMS = 200;
function check(spec, value, path, errors) {
  if (isObj(spec) && 'opt' in spec) { if (value != null) check(spec.opt, value, path, errors); return; }
  if (typeof spec === 'string' && spec.endsWith('?')) { if (value != null) check(spec.slice(0, -1), value, path, errors); return; }
  if (Array.isArray(spec) && spec.every(s => typeof s === 'string') && spec.length !== 1) {
    if (!spec.includes(value)) errors.push(`${path}: one of ${spec.join('|')}`); return;
  }
  if (Array.isArray(spec)) {
    if (!Array.isArray(value) || value.length > MAX_ITEMS) { errors.push(`${path}: array of at most ${MAX_ITEMS}`); return; }
    value.forEach((item, i) => check(spec[0], item, `${path}[${i}]`, errors)); return;
  }
  if (SHAPES[spec]) { shape(spec, value, path, errors); return; }
  if (!BASE[spec](value)) errors.push(`${path}: ${spec}`);
}
function shape(kind, value, path, errors) {
  if (!isObj(value)) { errors.push(`${path}: ${kind} object`); return; }
  for (const [field, spec] of Object.entries(SHAPES[kind])) check(spec, value[field], path ? `${path}.${field}` : field, errors);
}

// Cross-field rules the field specs cannot say.
const RULES = {
  CoachingState: v => [
    ...(v.activeGoalId != null && !v.goals.some(g => g.goalId === v.activeGoalId) ? ['activeGoalId: not one of goals'] : []),
    ...(v.activeActivityId != null && v.activeGoalId == null ? ['activeActivityId: needs activeGoalId'] : []),
    ...(new Set(v.goals.map(g => g.goalId)).size !== v.goals.length ? ['goals: duplicate goalId'] : []),
  ],
  Goal: v => (new Set(v.criteria.map(c => c.criterionId)).size !== v.criteria.length ? ['criteria: duplicate criterionId'] : []),
  // A JSON-serialisable submission only; size limits are the attempt store's (Task 05), stated there, never truncated.
  SubmitAttempt: v => (typeof v.submittedContent === 'function' ? ['submittedContent: JSON value'] : []),
};

/** @returns {{ok: boolean, errors: string[]}} */
export function validateCoachingRecord(kind, value) {
  if (!SHAPES[kind]) return { ok: false, errors: [`unknown kind ${kind}`] };
  const errors = [];
  shape(kind, value, '', errors);
  if (!errors.length && RULES[kind]) errors.push(...RULES[kind](value));
  return { ok: errors.length === 0, errors };
}

// --- controls ---------------------------------------------------------------------------------------------------------
// Effective proactive permission (Implementation defaults): selected Tutor, On, unpaused, an open visible chat, a ready
// authorized state and no conflicting active input. Callers recheck it when scheduling and again before applying.
export const canCoach = (controls, { chatOpen = false, ready = false, activeInput = false } = {}) =>
  controls?.mode === 'tutor' && controls.tutorEnabled === true && controls.suggestionsPaused === false && chatOpen && ready && !activeInput;
const proactive = c => c.mode === 'tutor' && c.tutorEnabled && !c.suggestionsPaused;

// Which actions are proactive (integrator ruling Q5, 2026-10-20, decisions.md; provisional for owner review): what the
// Tutor starts on its own runs only under canCoach (Tutor selected, On, unpaused, chat open and ready, no active input);
// what the learner explicitly asks for runs in every mode, once, without changing the controls. Assessing work that was
// not explicitly submitted never runs (owner 3a). An unknown kind runs nowhere.
// guided_entry_turn is the owner's 4a exception: one opening turn for an explicit guided Rabbit Hole entry runs while Tutor
// is selected and On, paused or not (the entry is the explicit resumption: dispatch start_guided to clear the pause); in
// Auto, Ask or Off it never runs and the static prompt shows. Restoring a URL, refresh, Back or reopening is not an entry.
export const PROACTIVE_ACTIONS = ['hook', 'opening_turn', 'hole_opening_turn', 'unrequested_question', 'suggest_practice', 'unrequested_material', 'next_step_offer', 'assess_unsubmitted'];
export const EXPLICIT_ACTIONS = ['answer', 'requested_material', 'check_review', 'slash_command'];
export const GUIDED_ENTRY = 'guided_entry_turn';
export const mayRun = (kind, controls, context) => EXPLICIT_ACTIONS.includes(kind)
  || (kind === GUIDED_ENTRY && controls?.mode === 'tutor' && controls.tutorEnabled === true)
  || (PROACTIVE_ACTIONS.includes(kind) && kind !== 'assess_unsubmitted' && canCoach(controls, context));

// One reducer for the browser and the Worker (owner 3a; "Tutor controls and dismissal"). No effect ever asks for a model
// call: show_choices shows saved or static choices only. Every change bumps revision; an event carrying expectedRevision
// that does not match is refused unchanged ('stale_revision'), as is an event that makes no sense ('invalid').
//   select_mode        Auto/Ask suspend coaching and keep tutorEnabled and suggestionsPaused; Tutor restores them.
//   set_tutor_enabled  explicit Off->On clears a pause and offers choices; On->Off stops coaching.
//   not_now            stays On, pauses suggestions until explicit resumption (no timer).
//   resume / start_guided  clear the pause only while Tutor is selected and On; otherwise nothing changes (the requested
//                      action itself runs once, outside this reducer).
//   question / check_review  change nothing.
//   continue_own_work  the Off action, mode unchanged, with an Undo token for exactly the revision it produced.
//   undo               restores the token's previous values only if nothing changed since (token.revision).
/** @returns {{state: TutorControls, effects: {type: string}[], rejected?: string}} */
export function reduceTutorControls(state, event) {
  const same = rejected => ({ state, effects: [], ...(rejected ? { rejected } : {}) });
  if (!validateCoachingRecord('TutorControls', state).ok || !isObj(event) || !CONTROL_EVENTS.includes(event.type)) return same('invalid');
  if (event.expectedRevision != null && event.expectedRevision !== state.revision) return same('stale_revision');
  let next = state;
  const effects = [];
  switch (event.type) {
    case 'select_mode':
      if (!MODES.includes(event.mode)) return same('invalid');
      next = { ...state, mode: event.mode };
      if (event.mode === 'tutor' && state.mode !== 'tutor' && proactive(next)) effects.push({ type: 'show_choices' });
      break;
    case 'set_tutor_enabled':
      if (typeof event.enabled !== 'boolean') return same('invalid');
      next = { ...state, tutorEnabled: event.enabled, ...(event.enabled && !state.tutorEnabled ? { suggestionsPaused: false } : {}) };
      if (event.enabled && !state.tutorEnabled && proactive(next)) effects.push({ type: 'show_choices' });
      break;
    case 'not_now':
      if (!state.tutorEnabled) return same('invalid');
      next = { ...state, suggestionsPaused: true };
      break;
    case 'resume':
    case 'start_guided':
      if (state.mode === 'tutor' && state.tutorEnabled && state.suggestionsPaused) {
        next = { ...state, suggestionsPaused: false };
        if (event.type === 'resume') effects.push({ type: 'show_choices' });
      }
      break;
    case 'continue_own_work':
      next = { ...state, tutorEnabled: false };
      break;
    case 'undo': {
      const u = event.undo;
      if (!isObj(u) || !Number.isInteger(u.revision) || typeof u.tutorEnabled !== 'boolean' || typeof u.suggestionsPaused !== 'boolean') return same('invalid');
      if (u.revision !== state.revision) return same('stale_revision');
      next = { ...state, tutorEnabled: u.tutorEnabled, suggestionsPaused: u.suggestionsPaused };
      break;
    }
    default: // question, check_review
      break;
  }
  if (next === state || (next.mode === state.mode && next.tutorEnabled === state.tutorEnabled && next.suggestionsPaused === state.suggestionsPaused)) return { state, effects: [] };
  next = { ...next, revision: state.revision + 1 };
  effects.unshift({ type: 'persist' });
  if (proactive(state) && !proactive(next)) effects.push({ type: 'suspend_coaching' });
  if (event.type === 'continue_own_work') effects.push({ type: 'show_undo', undo: { revision: next.revision, tutorEnabled: state.tutorEnabled, suggestionsPaused: state.suggestionsPaused } });
  return { state: next, effects };
}

// --- evidence ---------------------------------------------------------------------------------------------------------
// The observations that can count for this criterion: its id and exact version, completed processing (pending, failed,
// unavailable and unknown processing never replace confirmed evidence), not superseded (by validity or by a later
// assessment's supersedesAssessmentId), each observation id once.
function applicable(criterion, observations) {
  const superseded = new Set(observations.map(o => o?.supersedesAssessmentId).filter(Boolean));
  const seen = new Set(), out = [];
  for (const o of observations) {
    if (!isObj(o) || seen.has(o.observationId)) continue;
    if (o.criterionId !== criterion.criterionId || o.criterionVersion !== criterion.version) continue;
    if (o.assessmentStatus !== 'completed' || o.validity === 'superseded' || superseded.has(o.assessmentId)) continue;
    if (!validateCoachingRecord('Observation', o).ok) continue;
    seen.add(o.observationId);
    out.push(o);
  }
  return out.sort((a, b) => (a.observedAt < b.observedAt ? -1 : a.observedAt > b.observedAt ? 1 : 0));
}

const complete = (criterion, o) => o.fit === 'met' && (!criterion.requiresReasoning || o.reasoning === 'supported');
const ids = list => list.map(o => o.observationId);

// One status per criterion (Task 01 precedence): unresolved relevant contradiction or dispute -> needs_review; eligible
// complete independent support -> demonstrated_independently; complete assisted support -> demonstrated_with_help;
// complete support whose help is unknown, and nothing else eligible -> needs_review ('help_not_recorded'); incomplete
// relevant support -> practising; nothing interpretable -> not_checked. A later not_met answer after complete support is a
// contradiction. Application and retention are separate dimensions here, never extra counted milestones; retention needs
// an explicit retentionOf link to earlier support, never a newer timestamp alone.
// Transfer gate (integrator ruling Q1, 2026-10-20): a criterion with requiresTransfer counts only complete support that is
// also a transfer observation (application 'applied') as eligible; complete support without one stays practising
// ('transfer_not_shown'). Contradiction and dispute still come first.
/** @returns {{status: string, reason: string, evidenceIds: string[], application: {status: string, evidenceIds: string[]}, retention: {status: string, evidenceIds: string[]}}} */
export function deriveCriterionSummary({ criterion, observations = [] }) {
  if (!validateCoachingRecord('Criterion', criterion).ok) throw new TypeError('deriveCriterionSummary: invalid criterion');
  const list = applicable(criterion, observations);
  const interpretable = list.filter(o => o.fit !== 'unclear');
  const support = interpretable.filter(o => complete(criterion, o));
  const latestSupport = support.at(-1);
  const flagged = list.filter(o => o.validity === 'disputed' || o.conflict === true);
  const later = latestSupport ? interpretable.filter(o => o.fit === 'not_met' && o.observedAt > latestSupport.observedAt) : [];
  const applied = support.filter(o => o.application === 'applied');
  const supportIds = new Set(ids(support));
  const recalled = support.filter(o => o.retentionOf && supportIds.has(o.retentionOf) && o.retentionOf !== o.observationId);
  const dims = {
    application: { status: applied.length ? 'applied' : 'not_checked', evidenceIds: ids(applied) },
    retention: { status: recalled.length ? 'recalled' : 'not_checked', evidenceIds: ids(recalled) },
  };
  const out = (status, reason, evidence) => ({ status, reason, evidenceIds: ids(evidence), ...dims });
  if (flagged.length) return out('needs_review', flagged.some(o => o.validity === 'disputed') ? 'disputed' : 'unresolved_conflict', [...flagged, ...support]);
  if (later.length) return out('needs_review', 'later_contradiction', [...support, ...later]);
  const eligible = criterion.requiresTransfer ? applied : support;
  const independent = eligible.filter(o => o.assistance === 'none');
  if (independent.length) return out('demonstrated_independently', 'independent_support', independent);
  const assisted = eligible.filter(o => o.assistance === 'assisted');
  if (assisted.length) return out('demonstrated_with_help', 'assisted_support', assisted);
  if (eligible.length) return out('needs_review', 'help_not_recorded', eligible);
  if (support.length) return out('practising', 'transfer_not_shown', support);
  if (interpretable.length) return out('practising', 'incomplete_support', interpretable);
  return out('not_checked', list.length ? 'not_interpretable' : 'no_evidence', []);
}

// A goal's counts for one scope: each criterion once, whatever the number of observations. No percentage.
export function deriveGoalCounts({ criteria = [], observations = [] }) {
  const counts = Object.fromEntries(CRITERION_STATUS.map(s => [s, 0]));
  const summaries = criteria.map(criterion => ({ criterionId: criterion.criterionId, version: criterion.version, ...deriveCriterionSummary({ criterion, observations }) }));
  for (const s of summaries) counts[s.status] += 1;
  return { total: criteria.length, counts, summaries };
}
