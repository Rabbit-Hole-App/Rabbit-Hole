// Tutor Task 07 (C:/s/spec/tutor-workflow/draft.md Task 07 and "How the tutor chooses materials"; integrator ruling Q5,
// owner 3a): choose one next activity for a goal, and apply a Tutor action to the canvas once.
//   chooseNextActivity(input, {plan}) -> {proposal, source, ...}: the objective first, then one manageable format.
//   applyTutorAction(action, current, deps) -> {status, ...}: identity, permission, controls and revision checks, then the
//     activity is saved and its material made at most once.
//   difficultyOffers, scopeFromJourney, proposalFromActions, assessmentText: the pieces, exported for the UI and tests.
// Pure apart from what is injected. A model is reachable only through `plan` (the existing Tutor planner, with its own
// Sonnet/Opus tiering, Opus re-plan and spend admission: no new tier here) and `makeMaterial` (the existing create_material
// -> /api/learn/artifact path). Opening, restoring or reading Progress passes no plan, so it never generates.
import { mayRun, validateCoachingRecord } from './learn-coaching-contract.js';

// Formats a learner can ask for, and the Tutor material tool that makes each. Text explanations are the artifact explain
// path that the learner's /explain shares (owner 2026-10-20, lane L10: it picks a plain card or an interactive scene by
// learning need), so no second generator exists here. Video and audio are never generated for an activity: only an
// existing one on the canvas is used, else the same objective gets a text explanation (paid video stays disabled).
export const FORMAT_COMMAND = { text: 'explain', worked: 'explain', diagram: 'diagram', graph: 'graph', quiz: 'quiz', comparison: 'compare', walkthrough: 'walkthrough' };
const MEDIA = { video: ['video'], audio: ['audio', 'video'] };
const ACTIVE = ['in_progress', 'paused'];
const NEXT = ['check_my_answer', 'read_explanation', 'skip'];
// After repeated difficulty (two assessed answers in a row on one criterion that did not meet it): stop the retry loop.
export const OFFERS = ['worked_answer', 'simpler_task', 'change_goal', 'pause'];
export const OFFER_LABEL = { worked_answer: 'Show me a worked answer', simpler_task: 'Give me a simpler task', change_goal: 'Choose a different goal', pause: 'Pause here' };
// shortcut: two misses in a row is the bound; tune it from real sessions.
const MISSES = 2;

const refOf = c => ({ criterionId: c.criterionId, version: c.version });
const current = (goal, refs) => refs.every(r => goal.criteria.some(c => c.criterionId === r.criterionId && c.version === r.version));

// The criterion to work on: the first not yet shown independently, most uncertain first. statuses: criterionId -> the
// Progress status (deriveCriterionSummary). null: every criterion is demonstrated independently.
const ORDER = ['needs_review', 'practising', 'demonstrated_with_help', 'not_checked'];
export function nextCriterion(criteria, statuses = {}) {
  for (const status of ORDER) {
    const found = criteria.find(c => (statuses[c.criterionId] ?? 'not_checked') === status);
    if (found) return found;
  }
  return null;
}

// evidence: the criterion's dated observations (Progress rows' evidence: fit, validity, observedAt). Silence, a view or an
// unassessed answer never counts as a miss; superseded or disputed evidence is not read.
export function difficultyOffers(evidence = []) {
  const valid = evidence.filter(e => e.validity === 'valid').sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)));
  const last = valid.slice(-MISSES);
  return last.length === MISSES && last.every(e => e.fit !== 'met') ? [...OFFERS] : [];
}

// The skills a journey goal could be measured by, for the learner to accept (draft "accept a goal and its criteria"): one
// criterion per claim its accepted path expects, in path order, at most 20. Nothing is saved until the learner accepts it
// (change_scope). requiresReasoning: a claim is an idea to explain, so a keyed answer alone never demonstrates it.
export function scopeFromJourney(journey, path) {
  const claims = journey?.registry?.claims || {}, seen = new Set(), out = [];
  for (const section of path?.sections || []) {
    for (const e of section.expected_evidence || []) {
      const claim = claims[e?.claim];
      if (!claim || seen.has(e.claim) || e.claim.length > 64 || out.length >= 20) continue;
      seen.add(e.claim);
      const label = journey.registry.concepts?.[claim.concept]?.label || claim.concept;
      out.push({ criterionId: e.claim.replace(/[^A-Za-z0-9_.:-]/g, ':').slice(0, 64), label: `${label}: ${e.claim.split('/').pop()}`.slice(0, 200),
        requirement: String(claim.statement).slice(0, 1000), requiresReasoning: true, requiresTransfer: e.kind === 'transfer', skillKey: e.claim });
    }
  }
  return out;
}

// A planned keyed check of the journey that names this criterion's claim and has not been answered: existing material, no
// planner. journey: the browser copy (answer keys removed); the server keeps the key and grades it (learn-assessment.js).
// A section check is found while its section is current; a diagnostic probe stays usable as a practice check.
// used: probe ids an answered activity of this goal already took (the browser's journey copy may not show that evidence yet).
function journeyCheck(journey, criterion, unreadable, used = []) {
  if (!journey?.id || !criterion.skillKey || unreadable.includes(journey.id)) return null;
  const events = journey.evidence?.events || [];
  const plan = journey.section_plan?.section_id === journey.active_section_id ? journey.section_plan : null;
  const candidates = [...(plan?.checks || []).map(p => ({ p, sectionId: plan.section_id })), ...(journey.diagnostic?.probes || []).map(p => ({ p, sectionId: null }))];
  const found = candidates.find(({ p, sectionId }) => ['mcq', 'prediction'].includes(p.kind) && p.options?.length && p.claims?.includes(criterion.skillKey) && !used.includes(p.id)
    && !events.some(e => e.ref?.probe_id === p.id && (e.ref.section_id ?? null) === sectionId));
  if (!found) return null;
  const { p, sectionId } = found;
  return { prompt: p.prompt, options: p.options.map(({ id, label }) => ({ id, label })),
    sourceRefs: [{ kind: 'journey_probe', id: p.id, version: journey.path_version || 1, locator: sectionId != null ? { sectionId } : { diagnostic: true } }] };
}

// One format for the objective: the learner's request when it can be met, else none (a question alone is the smallest
// activity). An unavailable medium keeps the objective and falls back to text, saying why.
function materialFor(request, constraints, capabilities, objective) {
  const format = request.format;
  if (!format) return null;
  const has = command => (capabilities.materials || []).some(m => m.command === command && !m.paid);
  const text = why => (has('explain') ? { format: 'text', command: 'explain', request: objective, fallbackFrom: format, reason: why } : null);
  if (MEDIA[format]) {
    const existing = (capabilities.blocks || []).find(b => MEDIA[format].includes(b.type) && b.available !== false);
    if (constraints.sound === false) return text('sound_unavailable');
    return existing ? { format, existing: { blockId: existing.id }, fallback: { format: 'text', command: 'explain', request: objective } } : text(`${format}_unavailable`);
  }
  const command = FORMAT_COMMAND[format];
  if (!command || !has(command)) return text('format_unavailable');
  // Anything but a text card keeps a text alternative for the same objective.
  return { format, command, request: objective, ...(format === 'text' || format === 'worked' ? {} : { fallback: { format: 'text', command: 'explain', request: objective } }) };
}

const proposal = (goal, criterion, fields) => {
  const out = { goalRef: { goalId: goal.goalId, scopeVersion: goal.scopeVersion }, criterionRefs: [refOf(criterion)], objective: criterion.label, nextActions: NEXT, ...fields };
  const checked = validateCoachingRecord('ActivityProposal', out);
  if (!checked.ok) throw new Error(`activity proposal failed its contract: ${checked.errors.slice(0, 3).join('; ')}`);
  return out;
};

// The validated adapter from the existing Tutor planner's actions (agents/learn-tutor.js TutorAction[]): its focused question
// is the response opportunity, its create_material (a free Tutor material tool only, never a paid one) the material. A plan
// without a question proposes nothing, so the caller keeps the requirement question instead.
export function proposalFromActions(actions, { goal, criterion, capabilities = {}, reason = 'planned' }) {
  const question = (actions || []).find(a => a?.type === 'ask_question' && typeof a.text === 'string' && a.text.trim());
  if (!question) return null;
  const make = actions.find(a => a?.type === 'create_material' && (capabilities.materials || []).some(m => m.command === a.command && !m.paid));
  const material = make ? { format: Object.keys(FORMAT_COMMAND).find(f => FORMAT_COMMAND[f] === make.command) || make.command, command: make.command, request: String(make.request || criterion.label).slice(0, 2000) } : null;
  return proposal(goal, criterion, { prompt: question.text.trim().slice(0, 4000), responseKind: 'text', ...(material ? { material } : {}), reason });
}

/**
 * The next activity for one goal (draft Task 07; "Selection process" steps 1-5).
 * input: { goal (CoachingState Goal, current-scope criteria), statuses {criterionId: status}, evidence {criterionId: dated
 *   observations}, activity (the goal's saved current Activity or null), journey (browser copy, or null), request {format?,
 *   kind?: 'next'|'worked_answer'|'simpler_task'}, constraints {sound?, minutes?, allowance?: 'exhausted', unreadable?: ids},
 *   capabilities {materials (learn-slash.js materialCommands), blocks (canvas blocks, for existing media)} }
 * deps.plan(input) -> TutorAction[]: the existing Tutor planner. Absent (opening, restore, Progress), no model is called.
 * -> { proposal: ActivityProposal | null, source: 'saved'|'journey_check'|'planner'|'requirement'|null, reason, activityId?,
 *      activity? {sourceRefs, checkpoint}, offers?, scope? }
 */
export async function chooseNextActivity(input, { plan = null } = {}) {
  const { goal, statuses = {}, evidence = {}, activity = null, journey = null, path = null, request = {}, constraints = {}, capabilities = {} } = input;
  if (!goal?.criteria?.length) {
    const scope = journey?.id && journey.id === goal?.journeyId ? scopeFromJourney(journey, path) : [];
    return { proposal: null, source: null, reason: scope.length ? 'accept_scope' : 'no_criteria', ...(scope.length ? { scope } : {}) };
  }
  const unreadable = constraints.unreadable || [];
  // 1. A valid saved step is the next activity: no planner, no new card. A requested format changes its material only.
  if (activity && activity.goalId === goal.goalId && current(goal, activity.criterionRefs)) {
    if (activity.status === 'awaiting_feedback') return { proposal: null, source: 'saved', reason: 'awaiting_feedback', activityId: activity.activityId };
    if (ACTIVE.includes(activity.status) && !['worked_answer', 'simpler_task'].includes(request.kind)) {
      const criterion = goal.criteria.find(c => c.criterionId === activity.criterionRefs[0]?.criterionId) || goal.criteria[0];
      const material = request.format ? materialFor(request, constraints, capabilities, activity.objective) : activity.checkpoint?.material ?? null;
      return {
        source: 'saved', reason: request.format ? 'format_changed' : 'saved_step', activityId: activity.activityId,
        proposal: { ...proposal(goal, criterion, { prompt: activity.prompt, responseKind: activity.responseKind, reason: 'saved_step', ...(material ? { material } : {}) }), criterionRefs: activity.criterionRefs, objective: activity.objective },
      };
    }
  }
  const criterion = nextCriterion(goal.criteria, statuses);
  if (!criterion) return { proposal: null, source: null, reason: 'goal_demonstrated' };
  // 2. Repeated difficulty on this criterion: stop and offer the ways out, unless the learner already picked one.
  const offers = difficultyOffers(evidence[criterion.criterionId]);
  if (offers.length && !['worked_answer', 'simpler_task'].includes(request.kind)) return { proposal: null, source: null, reason: 'repeated_difficulty', offers };
  if (request.kind === 'worked_answer') {
    // The worked answer is help, recorded on the activity so the next answer counts as assisted (learn-attempt-store.js).
    const material = materialFor({ format: 'worked' }, constraints, capabilities, `A worked answer: ${criterion.requirement}`);
    return { source: 'requirement', reason: 'worked_answer', activity: { sourceRefs: [], checkpoint: { assistanceRefs: ['worked_answer'] } },
      proposal: proposal(goal, criterion, { prompt: `After the worked answer, try it yourself: ${criterion.requirement}`, responseKind: 'text', reason: 'worked_answer', ...(material ? { material } : {}) }) };
  }
  const material = constraints.minutes != null && constraints.minutes < 5 && !request.format ? null : materialFor(request, constraints, capabilities, criterion.label);
  // 3. Existing material first: a planned keyed check on this claim (a simpler task is not a check).
  const answered = activity && activity.goalId === goal.goalId && !ACTIVE.includes(activity.status) ? activity.sourceRefs.filter(r => r.kind === 'journey_probe').map(r => r.id) : [];
  const check = request.kind === 'simpler_task' || request.format ? null : journeyCheck(journey, criterion, unreadable, answered);
  if (check) {
    return { source: 'journey_check', reason: 'existing_check', activity: { sourceRefs: check.sourceRefs, checkpoint: { options: check.options } },
      proposal: proposal(goal, criterion, { prompt: check.prompt, responseKind: 'choice', reason: 'existing_check', material: { format: 'check', existing: { sourceRefs: check.sourceRefs } } }) };
  }
  // 4. The existing planner, once, while the allowance holds; its result is validated before anything is shown.
  if (plan && constraints.allowance !== 'exhausted') {
    const planned = proposalFromActions(await plan({ goal, criterion, request, constraints, materials: capabilities.materials || [] }), { goal, criterion, capabilities, reason: request.kind === 'simpler_task' ? 'simpler_task' : 'planned' });
    if (planned) return { source: 'planner', reason: planned.reason, proposal: material && !planned.material ? { ...planned, material } : planned };
  }
  // 5. The criterion's own observable requirement, as the learner accepted it: no model, always available.
  const why = constraints.allowance === 'exhausted' ? 'allowance_exhausted' : request.kind === 'simpler_task' ? 'simpler_task' : 'requirement';
  return { source: 'requirement', reason: why, proposal: proposal(goal, criterion, { prompt: criterion.requirement, responseKind: 'text', reason: why, ...(material && why !== 'allowance_exhausted' ? { material } : {}) }) };
}

// ---- applying a Tutor action ---------------------------------------------------------------------------------------------
// The context a result belongs to (as learn-coaching-entry.js stillCurrent reads it): learner, canvas, goal and activity.
const CONTEXT = ['userId', 'app', 'board', 'goalId'];
const sameContext = (origin, now) => CONTEXT.every(key => (origin?.[key] ?? null) === (now?.[key] ?? null));
const inflight = new Map();

/**
 * Apply one TutorAction (SHAPES.TutorAction) at most once.
 * action: { actionId, kind: 'start_activity' | 'show_material', originContext {userId, app, board, goalId}, expectedRevisions
 *   {coaching}, payload {proposal, activityId?, activity? {sourceRefs, checkpoint}, requested, besideBlockId?} }
 * current: { userId, app, board, goalId, coachingRevision, controls, chat {chatOpen, ready, activeInput}, canEdit }, or a function
 *   returning it, so the checks read the context as it is when the card arrives.
 * deps: { coaching(action, payload, {actionId, expectedRevision}) -> CoachingState, canvas {blocks, insertBlock, reserve,
 *   release, revealBlock}, makeMaterial(material, {canvas}) -> Promise (the existing create_material path, explainMaterial) }
 * Checks, in order and again right before the card goes in: the same learner, canvas and goal (else the result stays with its
 * origin); an editable canvas this learner may change; for anything the learner did not ask for, the controls (Q5:
 * unrequested material runs only in selected, enabled, unpaused Tutor); the coaching revision it was planned on.
 * -> { status: 'applied'|'duplicate'|'kept_at_origin'|'refused'|'suppressed'|'stale', reason?, state?, activityId?, blockId?,
 *      material?: 'made'|'existing'|'failed'|'kept_at_origin'|'suppressed'|null }
 */
export function applyTutorAction(action, current, deps) {
  const p = action?.payload, proposed = p?.proposal != null && validateCoachingRecord('ActivityProposal', p.proposal).ok;
  const shaped = validateCoachingRecord('TutorAction', action).ok && (action.kind === 'start_activity' ? proposed || typeof p?.activityId === 'string' : action.kind === 'show_material' && proposed);
  if (!shaped) return Promise.resolve({ status: 'refused', reason: 'invalid_action' });
  if (inflight.has(action.actionId)) return inflight.get(action.actionId); // a retry while it runs: the same result
  const run = apply(action, current, deps).finally(() => setTimeout(() => inflight.delete(action.actionId), 0));
  inflight.set(action.actionId, run);
  return run;
}

function gate(action, now) {
  if (!sameContext(action.originContext, now)) return { status: 'kept_at_origin', reason: 'context_changed' };
  if (now.canEdit !== true) return { status: 'refused', reason: 'read_only' };
  if (!action.payload?.requested && !mayRun('unrequested_material', now.controls, now.chat)) return { status: 'suppressed', reason: 'coaching_off_or_paused' };
  return null;
}

async function apply(action, current, deps) {
  const now = typeof current === 'function' ? current : () => current;
  const stop = gate(action, now());
  if (stop) return stop;
  const { canvas, coaching, makeMaterial } = deps;
  const made = (canvas.blocks?.() || []).find(b => b.tutor_action === action.actionId);
  if (made) return { status: 'duplicate', blockId: made.id };
  const { proposal, activityId = null, activity = {}, besideBlockId = null } = action.payload || {};
  let state = null, id = activityId;
  if (action.kind === 'start_activity') {
    if (now().coachingRevision !== action.expectedRevisions.coaching) return { status: 'stale', reason: 'revision' };
    const payload = activityId ? { activityId } : { activity: {
      goalId: proposal.goalRef.goalId, objective: proposal.objective, prompt: proposal.prompt, responseKind: proposal.responseKind, criterionRefs: proposal.criterionRefs,
      sourceRefs: activity.sourceRefs || [], checkpoint: { ...activity.checkpoint, ...(proposal.material ? { material: proposal.material } : {}), actionId: action.actionId },
    } };
    // The server rechecks the goal, the criteria and the revision; the action id makes a retried write a replay (Task 02).
    try { state = await coaching('activate_activity', payload, { actionId: action.actionId, expectedRevision: action.expectedRevisions.coaching }); }
    catch (error) { return { status: error?.status === 409 ? 'stale' : 'refused', reason: error?.data?.error || error?.message || 'not_saved' }; }
    id = state?.activeActivityId ?? activityId;
  }
  const material = proposal?.material;
  if (!material || material.format === 'check') return { status: 'applied', state, activityId: id, material: null };
  const beside = besideBlockId && (canvas.blocks?.() || []).some(b => b.id === besideBlockId) ? besideBlockId : null;
  if (material.existing?.blockId && (canvas.blocks?.() || []).some(b => b.id === material.existing.blockId)) {
    canvas.revealBlock?.(material.existing.blockId);
    return { status: 'applied', state, activityId: id, material: 'existing', blockId: material.existing.blockId };
  }
  // The card goes in beside the relevant work, stamped with its action, activity and goal, and only while every check
  // still holds when it arrives; a card that arrives after a context change, Off or pause is not inserted anywhere else.
  let blockId = null, late = null;
  const stamped = {
    ...canvas,
    reserve: beside ? () => null : canvas.reserve,
    insertBlock: (block, options = {}) => {
      late = gate(action, now());
      if (late) return null;
      blockId = canvas.insertBlock({ ...block, tutor_action: action.actionId, coaching: { goalId: action.originContext.goalId, activityId: id } }, beside ? { after: beside } : options);
      return blockId;
    },
  };
  try { await makeMaterial(material, { canvas: stamped }); } catch { /* reported below: the activity and its objective stay */ }
  if (late) return { status: 'applied', state, activityId: id, material: late.status, reason: late.reason };
  return { status: 'applied', state, activityId: id, material: blockId ? 'made' : 'failed', ...(blockId ? { blockId } : { alternatives: ['text'] }) };
}

// The one seam where an explanation or other material is made (owner 2026-10-20, lane L10): the Tutor's own material tool
// line, run by the existing Learn command path with internal: true (lane L7: Tutor material tools are not typed commands).
// The server's artifact explain path chooses a plain card or an interactive scene by learning need; nothing here does.
export const materialLine = material => `/${material.command} ${material.request}`.trim();
export const explainMaterial = (runLearnCommand, base) => (material, { canvas }) => runLearnCommand(materialLine(material), { ...base, canvas, internal: true });

// ---- what the learner reads about a submitted answer ------------------------------------------------------------------
// Honest status for an assessment (draft "Pending or failed processing leaves the last confirmed summary intact"; gap d: a
// goal with no journey has no checkable criteria until rubric assessment, Task 13, exists). Never a grade or a percentage.
const UNAVAILABLE_TEXT = {
  no_registered_claims: 'Your answer is saved. Answers for this goal cannot be checked yet, so it is not assessed and your progress is unchanged.',
  no_criteria: 'Your answer is saved. This goal has no agreed skills to check it against yet.',
  rubric_not_supported: 'Your answer is saved. This kind of answer cannot be checked yet, so it is not assessed.',
  visual_not_supported: 'Your drawing is saved. Drawings cannot be checked yet, so it is not assessed.',
  allowance_refused: 'Your answer is saved. It could not be checked now because the AI allowance is used up; your progress is unchanged.',
  activity_changed: 'Your answer is saved for the question you answered; that question has changed since, so it was not checked.',
  source_unavailable: 'Your answer is saved. The code it is about is not available to you now, so it was not checked and your progress is unchanged.',
};
// Feedback when it is ready (draft Task 05): a pending assessment (another tab's request still checking the same answer, or a
// reply that could not read it back) is read again with GET, which reconciles and never calls a model, until it is final. The
// server settles an abandoned check as unknown after 60 s, so this stops by then; a failed read keeps what is shown.
export async function settledAttempt(read, view, { wait = ms => new Promise(resolve => setTimeout(resolve, ms)), every = 2000, tries = 35, live = () => true } = {}) {
  for (let i = 0; i < tries && view?.assessment?.status === 'pending' && live(); i += 1) {
    await wait(every);
    view = await read().catch(() => view);
  }
  return view;
}

export function assessmentText(assessment) {
  const status = assessment?.status, reason = assessment?.reason;
  if (status === 'pending') return 'Your answer is saved. Checking it…';
  if (status === 'completed') {
    const fits = (assessment.observations || []).map(o => o.fit);
    if (!fits.length) return 'Your answer is saved. Nothing in it could be checked against this goal.';
    if (assessment.observations.some(o => o.conflict)) return 'Your answer is saved. Parts of it point different ways, so it needs a review before it counts.';
    if (fits.every(f => f === 'met')) return assessment.observations.some(o => o.reasoning === 'missing') ? 'Correct. Explain why in your own words to show the reasoning too.' : 'That meets this skill.';
    // Every judgement uncertain: not a wrong answer, so not "Not yet" (integrator ruling 2026-10-21, defect 4).
    if (fits.every(f => f === 'unclear')) return 'Not sure yet: the check could not confirm your answer from what it could see. Add or adjust a citation, or explain more, and check again.';
    return fits.some(f => f === 'met' || f === 'partial') ? 'Partly there. Have another look at the parts still missing.' : 'Not yet. Have another look and try again.';
  }
  if (status === 'unavailable') return UNAVAILABLE_TEXT[reason] || 'Your answer is saved, but it could not be checked, so your progress is unchanged.';
  if (status === 'unknown') return 'Your answer is saved. Whether the check finished is unknown; your progress is unchanged until it is reviewed.';
  if (status === 'failed') return 'Your answer is saved. The check failed, so your progress is unchanged. You can ask for a review.';
  return 'Your answer is saved.';
}
