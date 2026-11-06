// Tutor workflow Task 01 (C:/s/spec/tutor-workflow/draft.md): the shared contract's validation, control transitions and
// criterion summary precedence. Pure: no storage, network or model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRITERION_STATUS, EXPLICIT_ACTIONS, GUIDED_ENTRY, PROACTIVE_ACTIONS, SHAPES, canCoach, defaultControls, deriveCriterionSummary, deriveGoalCounts, mayRun, reduceTutorControls, validateCoachingRecord,
} from './learn-coaching-contract.js';

const criterion = (over = {}) => ({
  criterionId: 'c_threshold', version: 1, label: 'Use a decision threshold', requirement: 'Explain how a changed threshold changes the class',
  requiresReasoning: true, rubricVersion: 'r1', ...over,
});
let n = 0;
const obs = (over = {}) => ({
  observationId: `o${++n}`, attemptId: `a${n}`, assessmentId: `s${n}`, assessmentStatus: 'completed', criterionId: 'c_threshold', criterionVersion: 1,
  fit: 'met', reasoning: 'supported', assistance: 'none', validity: 'valid', observedAt: `2026-10-20T10:00:${String(n).padStart(2, '0')}Z`, ...over,
});
const status = observations => deriveCriterionSummary({ criterion: criterion(), observations }).status;

test('independent_complete_support_is_demonstrated_independently; assisted is with help', () => {
  assert.equal(status([obs()]), 'demonstrated_independently');
  assert.equal(status([obs({ assistance: 'assisted' })]), 'demonstrated_with_help');
  // An earlier hinted answer and a later independent one: independent, history kept in evidenceIds of the tier.
  const hinted = obs({ assistance: 'assisted' }), later = obs();
  const s = deriveCriterionSummary({ criterion: criterion(), observations: [hinted, later] });
  assert.equal(s.status, 'demonstrated_independently');
  assert.deepEqual(s.evidenceIds, [later.observationId]);
});

test('unknown_help_cannot_count_as_independent', () => {
  const s = deriveCriterionSummary({ criterion: criterion(), observations: [obs({ assistance: 'unknown' })] });
  assert.equal(s.status, 'needs_review');
  assert.equal(s.reason, 'help_not_recorded');
  // Unknown help beside assisted support is help, never independence.
  assert.equal(status([obs({ assistance: 'unknown' }), obs({ assistance: 'assisted' })]), 'demonstrated_with_help');
});

test('partial_reasoning_is_not_demonstrated', () => {
  assert.equal(status([obs({ reasoning: 'partial' })]), 'practising');
  assert.equal(status([obs({ reasoning: 'missing', assistance: 'assisted' })]), 'practising');
  assert.equal(status([obs({ fit: 'partial' })]), 'practising');
  // A correct calculation is enough only where the criterion does not require reasoning.
  assert.equal(deriveCriterionSummary({ criterion: criterion({ requiresReasoning: false }), observations: [obs({ reasoning: 'missing' })] }).status, 'demonstrated_independently');
});

test('same_observation_counts_once', () => {
  const one = obs({ assistance: 'assisted' });
  const s = deriveCriterionSummary({ criterion: criterion(), observations: [one, { ...one }, { ...one, assistance: 'none' }] });
  assert.equal(s.status, 'demonstrated_with_help', 'a repeated observation id is the first record, not new independent evidence');
  assert.deepEqual(s.evidenceIds, [one.observationId]);
  // One active criterion contributes at most one to its goal count, however many observations it has.
  const g = deriveGoalCounts({ criteria: [criterion(), criterion({ criterionId: 'c_sigmoid' })], observations: [obs(), obs(), obs(), one] });
  assert.equal(g.total, 2);
  assert.equal(g.counts.demonstrated_independently, 1);
  assert.equal(g.counts.not_checked, 1);
  assert.equal(Object.values(g.counts).reduce((a, b) => a + b, 0), 2);
});

test('scope_revision_does_not_rewrite_history', () => {
  const v1 = [criterion(), criterion({ criterionId: 'c_prob' }), criterion({ criterionId: 'c_sigmoid' }), criterion({ criterionId: 'c_loss' })];
  const history = [obs(), obs({ criterionId: 'c_prob' }), obs({ criterionId: 'c_sigmoid', assistance: 'assisted', reasoning: 'partial' })];
  const before = deriveGoalCounts({ criteria: v1, observations: history });
  // Scope 2: four criteria become six; the threshold criterion's requirement changed, so it has a new version.
  const v2 = [criterion({ version: 2 }), ...v1.slice(1), criterion({ criterionId: 'c_code' }), criterion({ criterionId: 'c_regularise' })];
  const after = deriveGoalCounts({ criteria: v2, observations: history });
  assert.equal(after.total, 6);
  assert.equal(after.summaries[0].status, 'not_checked', 'evidence for criterion version 1 does not count for version 2');
  assert.equal(after.counts.demonstrated_independently, 1);
  // The original scope's view is unchanged: re-deriving it gives the same result.
  assert.deepEqual(deriveGoalCounts({ criteria: v1, observations: history }), before);
  assert.equal(before.counts.demonstrated_independently, 2);
  assert.equal(before.counts.practising, 1);
  assert.equal(before.counts.not_checked, 1);
});

test('contradiction and dispute produce needs_review and keep the earlier support', () => {
  const good = obs(), bad = obs({ fit: 'not_met', reasoning: 'missing' });
  const s = deriveCriterionSummary({ criterion: criterion(), observations: [good, bad] });
  assert.equal(s.status, 'needs_review');
  assert.equal(s.reason, 'later_contradiction');
  assert.ok(s.evidenceIds.includes(good.observationId) && s.evidenceIds.includes(bad.observationId));
  // A failure followed by success is improvement, not contradiction.
  assert.equal(status([obs({ fit: 'not_met', reasoning: 'missing' }), obs()]), 'demonstrated_independently');
  // An evaluator's unresolved conflict cannot become a clean pass; a submitted dispute qualifies even independent support.
  assert.equal(deriveCriterionSummary({ criterion: criterion(), observations: [obs({ conflict: true })] }).reason, 'unresolved_conflict');
  const disputed = deriveCriterionSummary({ criterion: criterion(), observations: [obs(), obs({ validity: 'disputed', fit: 'not_met' })] });
  assert.equal(disputed.status, 'needs_review');
  assert.equal(disputed.reason, 'disputed');
});

test('pending, failed and superseded processing never replace confirmed evidence; wrong version or criterion is ignored', () => {
  const confirmed = obs({ assistance: 'assisted' });
  assert.equal(status([confirmed, obs({ assessmentStatus: 'pending', fit: 'not_met' }), obs({ assessmentStatus: 'failed', fit: 'not_met' })]), 'demonstrated_with_help');
  assert.equal(status([obs({ criterionVersion: 2 }), obs({ criterionId: 'c_other' })]), 'not_checked');
  // A deliberate reassessment supersedes the original assessment; the original record stays outside the summary.
  const original = obs({ fit: 'not_met', reasoning: 'missing' });
  const review = obs({ attemptId: original.attemptId, supersedesAssessmentId: original.assessmentId });
  assert.equal(status([original, review]), 'demonstrated_independently');
  assert.equal(status([obs({ validity: 'superseded' })]), 'not_checked');
  // An uninterpretable answer is not marked wrong: not checked.
  const unclear = deriveCriterionSummary({ criterion: criterion(), observations: [obs({ fit: 'unclear', reasoning: 'unclear' })] });
  assert.deepEqual([unclear.status, unclear.reason], ['not_checked', 'not_interpretable']);
  assert.equal(deriveCriterionSummary({ criterion: criterion(), observations: [] }).reason, 'no_evidence');
});

test('transfer_required_stays_practising_until_applied (integrator ruling Q1)', () => {
  const transfer = criterion({ requiresTransfer: true });
  const of = observations => deriveCriterionSummary({ criterion: transfer, observations });
  // Complete independent support in the original setting is not enough: practising until a transfer observation exists.
  const here = obs();
  assert.deepEqual([of([here]).status, of([here]).reason], ['practising', 'transfer_not_shown']);
  assert.deepEqual(of([here]).evidenceIds, [here.observationId]);
  // A valid transfer observation demonstrates it, keeping its assistance tier.
  const appliedAlone = obs({ application: 'applied' });
  assert.equal(of([here, appliedAlone]).status, 'demonstrated_independently');
  assert.deepEqual(of([here, appliedAlone]).evidenceIds, [appliedAlone.observationId]);
  assert.equal(of([here, obs({ application: 'applied', assistance: 'assisted' })]).status, 'demonstrated_with_help');
  assert.equal(of([obs({ application: 'applied', assistance: 'unknown' })]).reason, 'help_not_recorded');
  // An incomplete, pending or superseded transfer attempt does not count.
  assert.equal(of([here, obs({ application: 'applied', reasoning: 'partial' })]).status, 'practising');
  assert.equal(of([here, obs({ application: 'applied', assessmentStatus: 'pending' })]).status, 'practising');
  assert.equal(of([here, obs({ application: 'applied', validity: 'superseded' })]).status, 'practising');
  // Disputes still come first; without the flag nothing changes.
  assert.equal(of([obs({ application: 'applied' }), obs({ validity: 'disputed' })]).status, 'needs_review');
  assert.equal(deriveCriterionSummary({ criterion: criterion(), observations: [here] }).status, 'demonstrated_independently');
  assert.ok(validateCoachingRecord('Criterion', transfer).ok);
  assert.equal(validateCoachingRecord('Criterion', criterion({ requiresTransfer: 'yes' })).ok, false);
});

test('application and retention are separate dimensions; a newer timestamp alone is neither', () => {
  const first = obs(), newer = obs();
  const plain = deriveCriterionSummary({ criterion: criterion(), observations: [first, newer] });
  assert.equal(plain.application.status, 'not_checked');
  assert.equal(plain.retention.status, 'not_checked');
  const recall = obs({ retentionOf: first.observationId }), applied = obs({ application: 'applied', assistance: 'assisted' });
  const s = deriveCriterionSummary({ criterion: criterion(), observations: [first, recall, applied] });
  assert.equal(s.status, 'demonstrated_independently');
  assert.deepEqual(s.retention, { status: 'recalled', evidenceIds: [recall.observationId] });
  assert.deepEqual(s.application, { status: 'applied', evidenceIds: [applied.observationId] });
  // Application does not add a milestone to the count.
  assert.equal(deriveGoalCounts({ criteria: [criterion()], observations: [first, recall, applied] }).total, 1);
});

// --- controls ---
const tutorOn = { mode: 'tutor', tutorEnabled: true, suggestionsPaused: false, revision: 3 };
const step = (state, ...events) => events.reduce(({ state: s, log }, e) => { const r = reduceTutorControls(s, e); return { state: r.state, log: [...log, r] }; }, { state, log: [] });
const types = r => r.effects.map(e => e.type);
const fields = ({ mode, tutorEnabled, suggestionsPaused }) => ({ mode, tutorEnabled, suggestionsPaused });

test('controls: a new record is Auto with the dormant Tutor preference On and unpaused', () => {
  assert.deepEqual(defaultControls(), { mode: 'auto', tutorEnabled: true, suggestionsPaused: false, revision: 0 });
  assert.equal(canCoach(defaultControls(), { chatOpen: true, ready: true }), false, 'Auto never coaches proactively');
  assert.equal(canCoach(tutorOn, { chatOpen: true, ready: true }), true);
  assert.equal(canCoach(tutorOn, { chatOpen: false, ready: true }), false);
  assert.equal(canCoach(tutorOn, { chatOpen: true, ready: true, activeInput: true }), false);
  assert.equal(canCoach(tutorOn, { chatOpen: true, ready: false }), false);
});

test('controls: Auto/Ask suspend coaching and keep the saved Tutor preference and pause', () => {
  const paused = { ...tutorOn, suggestionsPaused: true };
  for (const mode of ['auto', 'ask']) {
    const r = reduceTutorControls(tutorOn, { type: 'select_mode', mode });
    assert.deepEqual(fields(r.state), { mode, tutorEnabled: true, suggestionsPaused: false });
    assert.deepEqual(types(r), ['persist', 'suspend_coaching']);
    const back = reduceTutorControls(r.state, { type: 'select_mode', mode: 'tutor' });
    assert.deepEqual(fields(back.state), fields(tutorOn), 'returning to Tutor restores On');
    assert.deepEqual(types(back), ['persist', 'show_choices'], 'saved choices only: no greeting replay, no model call');
    const { state } = step(paused, { type: 'select_mode', mode }, { type: 'select_mode', mode: 'tutor' });
    assert.equal(state.suggestionsPaused, true, 'the pause survives Auto/Ask and back');
    const off = { ...tutorOn, tutorEnabled: false };
    assert.deepEqual(fields(step(off, { type: 'select_mode', mode }, { type: 'select_mode', mode: 'tutor' }).state), fields(off));
  }
});

test('controls: Not now stays On, pauses, and only explicit resumption clears it', () => {
  const r = reduceTutorControls(tutorOn, { type: 'not_now' });
  assert.deepEqual(fields(r.state), { mode: 'tutor', tutorEnabled: true, suggestionsPaused: true });
  assert.deepEqual(types(r), ['persist', 'suspend_coaching']);
  assert.equal(reduceTutorControls({ ...tutorOn, tutorEnabled: false }, { type: 'not_now' }).rejected, 'invalid', 'Not now is an On-state dismissal');
  // A plain question and a one-time Check/Review change nothing.
  for (const type of ['question', 'check_review']) assert.equal(reduceTutorControls(r.state, { type }).state, r.state);
  // Auto, Ask or Off: a requested guided action runs once without clearing the pause.
  for (const s of [{ ...r.state, mode: 'auto' }, { ...r.state, mode: 'ask' }, { ...r.state, tutorEnabled: false }]) {
    assert.equal(reduceTutorControls(s, { type: 'start_guided' }).state, s);
    assert.equal(reduceTutorControls(s, { type: 'resume' }).state, s);
  }
});

test('controls: Resume clears the pause and shows the choices once', () => {
  const paused = { ...tutorOn, suggestionsPaused: true };
  const r = reduceTutorControls(paused, { type: 'resume' });
  assert.equal(r.state.suggestionsPaused, false);
  assert.deepEqual(types(r), ['persist', 'show_choices']);
  assert.deepEqual(reduceTutorControls(r.state, { type: 'resume' }).effects, [], 'a second Resume shows nothing again');
  const guided = reduceTutorControls(paused, { type: 'start_guided' });
  assert.equal(guided.state.suggestionsPaused, false, 'a new guided request in selected, enabled Tutor clears the pause');
  // Explicit Off -> On clears a pause and offers choices; a plain question does not.
  const off = { ...paused, tutorEnabled: false };
  const on = reduceTutorControls(off, { type: 'set_tutor_enabled', enabled: true });
  assert.deepEqual(fields(on.state), { mode: 'tutor', tutorEnabled: true, suggestionsPaused: false });
  assert.deepEqual(types(on), ['persist', 'show_choices']);
});

test('controls: Continue my own work switches Off with Undo, mode unchanged', () => {
  const r = reduceTutorControls(tutorOn, { type: 'continue_own_work' });
  assert.deepEqual(fields(r.state), { mode: 'tutor', tutorEnabled: false, suggestionsPaused: false });
  assert.deepEqual(types(r), ['persist', 'suspend_coaching', 'show_undo']);
  const undo = r.effects.find(e => e.type === 'show_undo').undo;
  const back = reduceTutorControls(r.state, { type: 'undo', undo });
  assert.deepEqual(fields(back.state), fields(tutorOn));
  assert.equal(back.state.revision, r.state.revision + 1);
  // Undo never overwrites a newer revision: after another change it is refused unchanged.
  const moved = reduceTutorControls(r.state, { type: 'select_mode', mode: 'ask' }).state;
  const late = reduceTutorControls(moved, { type: 'undo', undo });
  assert.equal(late.rejected, 'stale_revision');
  assert.equal(late.state, moved);
});

test('controls: revision guard, invalid events and no model effects', () => {
  assert.equal(reduceTutorControls(tutorOn, { type: 'not_now', expectedRevision: 2 }).rejected, 'stale_revision');
  assert.equal(reduceTutorControls(tutorOn, { type: 'not_now', expectedRevision: 3 }).state.revision, 4);
  assert.equal(reduceTutorControls(tutorOn, { type: 'select_mode', mode: 'syllabus' }).rejected, 'invalid');
  assert.equal(reduceTutorControls(tutorOn, { type: 'generate' }).rejected, 'invalid');
  assert.equal(reduceTutorControls({ mode: 'tutor' }, { type: 'not_now' }).rejected, 'invalid');
  assert.equal(reduceTutorControls(tutorOn, { type: 'select_mode', mode: 'tutor' }).state, tutorOn, 'no change, no revision bump');
  // Every reachable effect from every event is one of the four control effects; none is a model call.
  const events = [{ type: 'select_mode', mode: 'auto' }, { type: 'select_mode', mode: 'tutor' }, { type: 'set_tutor_enabled', enabled: false }, { type: 'set_tutor_enabled', enabled: true }, { type: 'not_now' }, { type: 'resume' }, { type: 'start_guided' }, { type: 'continue_own_work' }];
  for (const s of [tutorOn, { ...tutorOn, suggestionsPaused: true }, { ...tutorOn, tutorEnabled: false }, defaultControls()]) {
    for (const e of events) for (const effect of reduceTutorControls(s, e).effects) assert.ok(['persist', 'suspend_coaching', 'show_choices', 'show_undo'].includes(effect.type));
  }
});

test('proactive actions run only under canCoach; explicit requests run in every mode; unsubmitted work is never assessed', () => {
  const open = { chatOpen: true, ready: true };
  const modes = [tutorOn, { ...tutorOn, suggestionsPaused: true }, { ...tutorOn, tutorEnabled: false }, { ...tutorOn, mode: 'auto' }, { ...tutorOn, mode: 'ask' }];
  for (const kind of EXPLICIT_ACTIONS) for (const c of modes) assert.equal(mayRun(kind, c, open), true, `${kind} in ${JSON.stringify(c)}`);
  for (const kind of PROACTIVE_ACTIONS.filter(k => k !== 'assess_unsubmitted')) {
    assert.deepEqual(modes.map(c => mayRun(kind, c, open)), [true, false, false, false, false], kind);
    assert.equal(mayRun(kind, tutorOn, { ...open, activeInput: true }), false, `${kind} waits for active input`);
  }
  for (const c of modes) assert.equal(mayRun('assess_unsubmitted', c, open), false);
  assert.equal(mayRun('generate_lesson', tutorOn, open), false, 'unknown kinds fail closed');
  // An explicit guided entry in paused Tutor: start_guided clears the pause, then the opening turn may run.
  const paused = { ...tutorOn, suggestionsPaused: true };
  assert.equal(mayRun('hole_opening_turn', reduceTutorControls(paused, { type: 'start_guided' }).state, open), true);
  assert.equal(mayRun('hole_opening_turn', reduceTutorControls({ ...paused, mode: 'auto' }, { type: 'start_guided' }).state, open), false, 'static prompt outside Tutor');
  // Integrator ruling Q5 / owner 4a: the explicit guided entry's one opening turn runs in selected, enabled Tutor, paused or
  // not; never in Auto, Ask or Off (static prompt there).
  assert.deepEqual(modes.map(c => mayRun(GUIDED_ENTRY, c, open)), [true, true, false, false, false]);
});

// --- validation ---
test('validateCoachingRecord: wire shapes and cross-field rules', () => {
  assert.deepEqual(validateCoachingRecord('TutorControls', tutorOn), { ok: true, errors: [] });
  assert.equal(validateCoachingRecord('TutorControls', { ...tutorOn, mode: 'syllabus' }).ok, false);
  assert.equal(validateCoachingRecord('Nope', {}).ok, false);
  const goal = { goalId: 'g1', label: 'Predict a class using KNN', scopeVersion: 1, lifecycle: 'open', status: 'active', criteria: [criterion()], revision: 0, createdAt: 't', updatedAt: 't' };
  assert.ok(validateCoachingRecord('Goal', goal).ok);
  assert.match(validateCoachingRecord('Goal', { ...goal, criteria: [criterion(), criterion()] }).errors[0], /duplicate/);
  const state = { controls: tutorOn, goals: [goal], activeGoalId: 'g1', activeActivityId: null, revision: 1 };
  assert.ok(validateCoachingRecord('CoachingState', state).ok);
  assert.match(validateCoachingRecord('CoachingState', { ...state, activeGoalId: 'g_foreign' }).errors.join(), /activeGoalId/);
  assert.match(validateCoachingRecord('CoachingState', { ...state, activeGoalId: null, activeActivityId: 'a1' }).errors.join(), /activeActivityId/);
  assert.ok(validateCoachingRecord('Observation', obs()).ok);
  assert.equal(validateCoachingRecord('Observation', obs({ assistance: 'maybe' })).ok, false);
  assert.ok(validateCoachingRecord('CoachingRequest', { actionId: 'x', expectedRevision: 0, action: 'create_goal', payload: {} }).ok);
  assert.equal(validateCoachingRecord('CoachingRequest', { actionId: 'x', expectedRevision: -1, action: 'create_goal', payload: {} }).ok, false);
  assert.equal(validateCoachingRecord('SubmitAttempt', { activityId: 'a', activityRevision: 1, submissionKey: 'k', sourceRefs: [], assistanceRefs: [] }).ok, false, 'submittedContent is required');
  assert.ok(validateCoachingRecord('EntryDecision', { kind: 'welcome', sourceRefs: [], allowedActions: ['set_goal'] }).ok);
  assert.equal(validateCoachingRecord('EntryDecision', { kind: 'welcome', sourceRefs: [], allowedActions: ['generate_lesson'] }).ok, false);
  assert.ok(validateCoachingRecord('FocusDecision', { kind: 'clarify', sourceRefs: [{ kind: 'card', id: 'b1', version: 3 }] }).ok);
  // Every named shared contract has a validator.
  for (const kind of ['ActorScope', 'TutorControls', 'CoachingState', 'EntryDecision', 'FocusDecision', 'ActivityProposal', 'GoalRef', 'CriterionRef', 'SourceRef', 'ActivityRef', 'SubmitAttempt', 'AssessmentRecord', 'ProgressView', 'ProgressQuestionScope', 'TutorAction']) assert.ok(SHAPES[kind], kind);
  assert.deepEqual(CRITERION_STATUS, ['not_checked', 'practising', 'demonstrated_with_help', 'demonstrated_independently', 'needs_review']);
});
