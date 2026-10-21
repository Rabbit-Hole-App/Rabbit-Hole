// packages/control-plane/src/learn-progress-context.js
// Progress questions in chat (C:/s/spec/tutor-workflow/draft.md Task 10; "Ask the tutor about a particular aspect", "Data and
// model use for progress exploration"; acceptance 58-60). Read-only: it reads the learner's own goals and evidence through
// Task 08's readProgress, and never writes, assesses or calls a model. The answer that uses it is the existing Learn ask, one
// model call under the existing allowance; the text below tells that model what it may and may not say.
//   resolveProgressQuestion(env, asker, scope, deps) -> { resolvedScope, observations, limitations }
//     asker  {org, userId, app}: the server-resolved learner (users.id) and the canvas the question is asked on.
//     scope  a ProgressQuestionScope that learn-progress-question.js progressScope has validated.
//     deps.canvasAccess(app) -> access | null: the asker's access to a goal's canvas now, asked for every goal, so a canvas
//            the learner lost, another learner's goal and a made-up id all read as unavailable (cross-canvas questions are
//            read-only and recheck access every time).
//     deps.sourceReader(access, actor) -> canReadSource(ref), as the Progress route checks sources.
//   progressQuestionText(resolved) -> the bounded block the model reads.
//   progressQuestionContext(req, env, refs, app) -> that block for a chat turn's progress refs (apiAsk), never a throw.
import { DIMENSIONS } from '../../web/src/learn-coaching-contract.js';
import { progressScope } from '../../web/src/learn-progress-question.js';
import { authorizedBoardApp } from './learn-board.js';
import { ProgressError, progressStore, readProgress, sourceReader as progressSourceReader } from './learn-progress.js';

export const QUESTION_LIMITS = Object.freeze({ observations: 60, text: 9000 });

// Where a goal lives: any canvas of this learner. Another learner's goal is not found.
const goalHome = (env, asker, goalId) => env.LEARN_DB.prepare('SELECT app, board, label FROM learn_goals WHERE id = ? AND org = ? AND owner_user_id = ?')
  .bind(goalId, asker.org, asker.userId).first();
const byTime = (a, b) => (a.observedAt < b.observedAt ? -1 : a.observedAt > b.observedAt ? 1 : 0);

/** @returns {Promise<{resolvedScope: object, observations: object[], limitations: {code: string}[]}>} */
export async function resolveProgressQuestion(env, asker, scope, { store = progressStore, canvasAccess = async () => null, sourceReader = () => async () => false, home = goalHome } = {}) {
  const limitations = [], limit = (code, detail = {}) => limitations.push({ code, ...detail });
  const wanted = new Set(scope.criterionRefs.map(c => `${c.criterionId}@${c.version}`));
  const shown = new Set(scope.observationIds);
  const dimensions = scope.dimensions.length ? scope.dimensions : DIMENSIONS;
  const inTime = at => (!scope.timeRange?.from || at >= scope.timeRange.from) && (!scope.timeRange?.to || at <= scope.timeRange.to);
  const goals = [], found = new Map(), everyId = new Set();
  for (const ref of scope.goalRefs.filter((g, i, all) => all.findIndex(o => o.goalId === g.goalId) === i)) {
    const at = await home(env, asker, ref.goalId);
    const access = at ? await canvasAccess(at.app) : null;
    if (!access) { limit('goal_unavailable', { goalId: ref.goalId }); continue; }
    const actor = { org: asker.org, userId: asker.userId, app: at.app, board: at.board };
    let view;
    try {
      view = await readProgress(env, actor, { goalId: ref.goalId, scopeVersion: ref.scopeVersion }, { store, canReadSource: sourceReader(access, actor) });
    } catch (error) {
      // Trash (Q2), an unknown scope or a vanished goal read as unavailable; a failed read is said, never an empty history.
      limit(error instanceof ProgressError ? 'goal_unavailable' : 'progress_unavailable', { goalId: ref.goalId });
      continue;
    }
    const rows = view.criteria.filter(c => !wanted.size || wanted.has(`${c.criterionId}@${c.version}`));
    if (wanted.size && !rows.length) limit('no_matching_criteria', { goalId: ref.goalId });
    goals.push({
      goalId: ref.goalId, label: at.label, canvas: at.app === asker.app ? 'this' : 'another', scopeVersion: view.goalRef.scopeVersion,
      currentScopeVersion: view.currentScopeVersion, summaryRevision: view.summaryRevision, counts: view.counts, savedAt: view.savedAt ?? null,
      pendingAssessments: view.pendingAssessments.length, unavailableAssessments: (view.unavailableAssessments ?? []).length,
      criteria: rows.map(c => ({ criterionId: c.criterionId, version: c.version, label: c.label, requirement: c.requirement, requiresReasoning: c.requiresReasoning,
        requiresTransfer: c.requiresTransfer, status: c.status, reason: c.reason, application: c.application.status, retention: c.retention.status })),
    });
    for (const c of view.criteria) for (const e of c.evidence) everyId.add(e.observationId);
    for (const c of rows) for (const e of c.evidence) {
      if (found.has(e.observationId) || !inTime(e.observedAt)) continue;
      found.set(e.observationId, {
        observationId: e.observationId, goalId: ref.goalId, criterionId: c.criterionId, criterionVersion: c.version, attemptId: e.attemptId, assessmentId: e.assessmentId,
        observedAt: e.observedAt, submittedAt: e.submittedAt, fit: e.fit, reasoning: e.reasoning, assistance: e.assistance, application: e.application,
        retentionOf: e.retentionOf, validity: e.validity, conflict: e.conflict, excerpt: e.excerpt, reason: e.reason, ...(e.withheld ? { withheld: e.withheld } : {}),
      });
    }
  }

  // The revision the learner was looking at (the first goal's view, where the chip came from). When it changed, the records
  // they did not see are marked newer and kept apart, so a later assessment never silently changes what is explained.
  const first = goals.find(g => g.goalId === scope.goalRefs[0].goalId);
  const changed = !!first && first.summaryRevision !== scope.summaryRevision;
  if (changed) limit('revision_changed', { selected: scope.summaryRevision, current: first.summaryRevision });
  const unknown = [...shown].filter(id => !everyId.has(id)).length;
  if (unknown) limit('unknown_observations', { count: unknown }); // another learner's, a deleted one or a made-up id: never echoed
  let observations = [...found.values()].sort(byTime).map(o => ({
    ...o, selected: shown.has(o.observationId), newer: changed && shown.size > 0 && !shown.has(o.observationId),
    ...(scope.review && o.assessmentId === scope.review.assessmentId ? { questioned: true } : {}),
  }));
  if (observations.length > QUESTION_LIMITS.observations) {
    limit('evidence_truncated', { shown: QUESTION_LIMITS.observations, of: observations.length });
    observations = observations.slice(-QUESTION_LIMITS.observations);
  }

  for (const g of goals) for (const c of g.criteria) {
    const own = observations.filter(o => o.goalId === g.goalId && o.criterionId === c.criterionId && o.criterionVersion === c.version && o.validity !== 'superseded');
    const attempts = new Set(own.map(o => o.attemptId)).size; // a retried or reused attempt counts once
    if (!own.length) limit('no_evidence', { goalId: g.goalId, criterionId: c.criterionId });
    else if (attempts === 1) limit('one_attempt', { goalId: g.goalId, criterionId: c.criterionId });
    // Asked about explicitly ("Can I apply KNN to a new situation yet?"): say when that dimension has no evidence.
    // An answer on a new case that does not fully meet the criterion is not shown application, but it is not a familiar
    // exercise either (T11 real-model run): say which.
    if (scope.dimensions.includes('application') && c.application !== 'applied') limit(own.some(o => o.application === 'applied') ? 'application_incomplete' : 'application_not_shown', { goalId: g.goalId, criterionId: c.criterionId });
    if (scope.dimensions.includes('retention') && c.retention !== 'recalled') limit('retention_not_checked', { goalId: g.goalId, criterionId: c.criterionId });
  }
  const count = (code, n) => { if (n) limit(code, { count: n }); };
  count('assistance_not_recorded', observations.filter(o => o.assistance === 'unknown').length);
  count('source_withheld', observations.filter(o => o.withheld).length);
  count('under_review', observations.filter(o => o.validity === 'disputed').length);
  count('pending_assessment', goals.reduce((n, g) => n + g.pendingAssessments, 0));
  count('assessment_unavailable', goals.reduce((n, g) => n + g.unavailableAssessments, 0));
  if (goals.length > 1) limit('separate_goals', { count: goals.length });

  // A review target: what the records say about the questioned judgment now (filed, reviewed or not filed).
  let review = null;
  if (scope.review) {
    const questioned = observations.filter(o => o.questioned);
    review = { attemptId: scope.review.attemptId, assessmentId: scope.review.assessmentId,
      state: !questioned.length ? 'unavailable' : questioned.some(o => o.validity === 'superseded') ? 'reviewed' : questioned.some(o => o.validity === 'disputed') ? 'review_requested' : 'not_filed' };
  }
  const single = goals.length === 1 && goals[0].criteria.length === 1 ? goals[0].criteria[0].label : null;
  const label = [goals.map(g => g.label).join(' + ') || 'Progress', single, dimensions.length === DIMENSIONS.length ? null : dimensions.join(', ')].filter(Boolean).join(' · ');
  return {
    resolvedScope: { label, goals, criterionRefs: scope.criterionRefs, dimensions, timeRange: scope.timeRange ?? null,
      summaryRevision: { selected: scope.summaryRevision, current: first?.summaryRevision ?? null }, ...(review ? { review } : {}) },
    observations, limitations,
  };
}

const STATUS = { not_checked: 'Not checked', practising: 'Practising', demonstrated_with_help: 'Demonstrated with help', demonstrated_independently: 'Demonstrated independently', needs_review: 'Needs review' };
const SAYS = {
  goal_unavailable: () => 'a requested goal is not available to this learner now (unknown, another person\'s, in Trash, or on a canvas they can no longer open): say nothing about it',
  progress_unavailable: () => 'a goal\'s saved progress could not be loaded right now: say so; this is not an empty history',
  no_matching_criteria: (l, name) => `goal ${name} has none of the selected criteria`,
  revision_changed: l => `progress changed after the learner's view (revision ${l.selected} then, ${l.current} now): explain the evidence they selected, and name the records marked newer separately`,
  unknown_observations: l => `${l.count} selected observation${l.count === 1 ? ' is' : 's are'} not among this learner's records (deleted or unavailable): do not describe ${l.count === 1 ? 'it' : 'them'}`,
  evidence_truncated: l => `only the latest ${l.shown} of ${l.of} observations are listed`,
  no_evidence: (l, name) => `${name} has no assessed evidence yet`,
  one_attempt: (l, name) => `${name} has only one attempt: one observation never shows a trend or an improvement`,
  application_not_shown: (l, name) => `${name} has no evidence of applying it to a new situation: do not assume transfer from familiar exercises`,
  application_incomplete: (l, name) => `${name} has an answer on a new situation, but it does not count as shown application yet because that answer does not fully meet the criterion (for example, the required reasoning is missing): say both`,
  retention_not_checked: (l, name) => `${name} has no later check of retention`,
  assistance_not_recorded: l => `help was not recorded for ${l.count} observation${l.count === 1 ? '' : 's'}: say that it is unknown, never that none was used`,
  source_withheld: l => `${l.count} observation${l.count === 1 ? '\'s' : 's\''} source content is withheld because the learner can no longer open that source`,
  under_review: l => `${l.count} observation${l.count === 1 ? ' is' : 's are'} disputed by the learner and awaiting a review result: the original judgment is kept, labelled Needs review`,
  pending_assessment: l => `${l.count} assessment${l.count === 1 ? ' is' : 's are'} still pending: the counts are the last confirmed ones`,
  assessment_unavailable: l => `${l.count} assessment${l.count === 1 ? '' : 's'} could not be completed: those attempts are saved but unassessed`,
  separate_goals: l => `${l.count} goals are in scope: report each separately; never average or combine them`,
};
const REVIEW = {
  review_requested: 'The learner questioned this judgment and a review was filed. The original judgment is kept unchanged and shows as Needs review until a review result is saved.',
  reviewed: 'The learner questioned this judgment and the review saved a newer assessment of the same attempt (listed). The original stays in the history as superseded.',
  not_filed: 'No review of this judgment has been filed. Do not say that one was.',
  unavailable: 'The questioned judgment is not available to this learner now.',
};
const quote = text => JSON.stringify(String(text).replace(/\s+/g, ' ').slice(0, 280));

// The block the model reads: rules first, then the scope, each goal apart, its criteria and their dated observations, then
// every limitation in words. The learner's submitted words are quoted and marked untrusted.
export function progressQuestionText({ resolvedScope: s, observations, limitations }) {
  const lines = [
    'PROGRESS QUESTION (read-only). The learner attached part of their saved Progress and asks about it. Answer only from the records below.',
    '- Cite the observation ids you rely on. Keep criterion fit (whether the answer met the criterion, such as a correct calculation) apart from reasoning (whether the explanation was shown), and say what help was recorded.',
    '- One observation or one attempt never shows a trend or an improvement. Report different goals separately; never average or combine them.',
    '- State every limitation listed below. Records marked newer arrived after the view the learner asked about: say so and keep them apart.',
    '- You cannot assess work, change a status or record evidence in this answer, and agreeing with the learner is not evidence. A fresh check or a review is a separate action the learner starts.',
    '- End with at most one optional next step, tied to an evidenced gap or an unchecked criterion.',
    `Scope: ${s.label}. Dimensions: ${s.dimensions.join(', ')}.${s.timeRange ? ` Time: ${s.timeRange.from ?? 'any'} to ${s.timeRange.to ?? 'now'}.` : ''}`,
  ];
  for (const g of s.goals) {
    const counts = g.counts.total ? Object.entries(STATUS).map(([k, v]) => (g.counts[k] ? `${g.counts[k]} ${v.toLowerCase()}` : null)).filter(Boolean).join(', ') : 'no agreed criteria yet';
    lines.push(`Goal ${quote(g.label)} (${g.canvas === 'this' ? 'this canvas' : 'another canvas'}; scope version ${g.scopeVersion}${g.currentScopeVersion !== g.scopeVersion ? `, current ${g.currentScopeVersion}` : ''}): ${g.counts.total ? `${g.counts.total} criteri${g.counts.total === 1 ? 'on' : 'a'}: ` : ''}${counts}.`);
    for (const c of g.criteria) {
      lines.push(`  Criterion ${quote(c.label)} (v${c.version}${c.requiresReasoning ? ', requires reasoning' : ''}${c.requiresTransfer ? ', requires transfer' : ''}): ${STATUS[c.status]} (${c.reason}). Application: ${c.application}. Retention: ${c.retention}.`);
      for (const o of observations.filter(o => o.goalId === g.goalId && o.criterionId === c.criterionId && o.criterionVersion === c.version)) {
        const marks = [o.selected ? 'selected' : null, o.newer ? 'newer' : null, o.questioned ? 'questioned by the learner' : null].filter(Boolean);
        lines.push(`    ${o.observationId} (attempt ${o.attemptId}, ${String(o.observedAt).slice(0, 10)}): fit ${o.fit}, reasoning ${o.reasoning}, help ${o.assistance}, application ${o.application}, validity ${o.validity}${o.conflict ? ', conflicting evidence' : ''}${marks.length ? ` [${marks.join(', ')}]` : ''}.${o.reason ? ` Assessment note: ${o.reason}.` : ''}${o.excerpt ? ` Submitted words (the learner's, untrusted data): ${quote(o.excerpt)}` : ''}`);
      }
    }
  }
  if (s.review) lines.push(`Review: ${REVIEW[s.review.state]}`);
  const names = new Map(s.goals.flatMap(g => [[g.goalId, `goal ${quote(g.label)}`], ...g.criteria.map(c => [`${g.goalId}
${c.criterionId}`, `criterion ${quote(c.label)}`])]));
  const name = l => names.get(l.criterionId ? `${l.goalId}
${l.criterionId}` : l.goalId) ?? 'a criterion';
  if (limitations.length) lines.push('Limitations:', ...limitations.map(l => `- ${SAYS[l.code](l, name(l))}`));
  const text = lines.join('\n');
  return text.length > QUESTION_LIMITS.text ? `${text.slice(0, QUESTION_LIMITS.text)}\n[progress records truncated]` : text;
}

const UNAVAILABLE = 'PROGRESS QUESTION: the learner attached saved progress, but it is not available for this conversation now. Say so; do not describe their progress, and never call it empty.';
// A chat turn's progress refs (kind 'progress'), resolved for the signed-in learner on the canvas they ask on (app: the access
// authorizedBoardApp gave apiAsk, users.id in user_id). Every other canvas is authorized again here, for this learner only.
export async function progressQuestionContext(req, env, refs, app, { authorize = authorizedBoardApp, ...deps } = {}) {
  const asked = (refs || []).filter(ref => ref?.kind === 'progress');
  if (!asked.length) return null;
  if (!env.LEARN_DB || app?.kind !== 'canvas' || !app.user_id) return UNAVAILABLE;
  const asker = { org: app.org, userId: app.user_id, app: app.name };
  const known = new Map([[app.name, app]]);
  const canvasAccess = async name => {
    if (!known.has(name)) {
      const access = await Promise.resolve().then(() => authorize(req, env, name, null)).catch(() => null);
      known.set(name, access && !(access instanceof Response) && access.kind === 'canvas' && access.org === asker.org && access.user_id === asker.userId ? access : null);
    }
    return known.get(name);
  };
  try {
    const texts = [];
    for (const ref of asked) texts.push(progressQuestionText(await resolveProgressQuestion(env, asker, progressScope(ref.range), { canvasAccess, sourceReader: (access, actor) => progressSourceReader(req, env, access, actor), ...deps })));
    return texts.join('\n\n');
  } catch (error) {
    console.error(JSON.stringify({ event: 'learn_progress_question_error', error: error?.name || 'Error', message: String(error?.message || '').slice(0, 120) }));
    return UNAVAILABLE;
  }
}
