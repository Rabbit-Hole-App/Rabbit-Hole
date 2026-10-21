// packages/control-plane/src/learn-coaching-store.js
// Personal Tutor state on LEARN_DB (learn-migrations/0025; C:/s/spec/tutor-workflow/draft.md Task 02, owner decision 5a):
// controls, several goals per learner and canvas with one active pointer, versioned criteria and activities.
//   readCoachingState(env, actor) -> CoachingState
//   applyCoachingAction(env, actor, {actionId, expectedRevision, action, payload}) -> {state, effects, replayed?}
// actor is the server-resolved ActorScope {org, userId, app, board}; userId is users.id and never leaves the server.
// Every write is one D1 batch whose statements all hold only at the expected coaching revision, the last one bumping it,
// so a stale tab writes nothing (CoachingConflict 'revision'); the same actionId again replays the current state.
// Changing goals pauses the old one (a derived status) and parks its journey; nothing is archived. No evidence is ever
// written here: criteria are what the learner accepted, and a legacy journey's goal starts with none.
import { RESPONSE_KINDS, reduceTutorControls, validateCoachingRecord } from '../../web/src/learn-coaching-contract.js';
import { goalForJourneySql, parkJourneySql, unparkJourneySql } from './learn-journey-store.js';

export class CoachingConflict extends Error {
  constructor(code, status = 409) { super(`coaching conflict: ${code}`); this.name = 'CoachingConflict'; this.code = code; this.status = status; }
}
const invalid = message => new CoachingConflict(message, 400);
const missing = code => new CoachingConflict(code, 404);

const MAX_OPEN_GOALS = 50, MAX_CRITERIA = 20, MAX_SOURCES = 20, MAX_CHECKPOINT = 8000;
const KEY = 'org = ? AND owner_user_id = ? AND app = ? AND board = ?';
const key = a => [a.org, a.userId, a.app, a.board];
const GUARD = `EXISTS (SELECT 1 FROM learn_coaching_state WHERE ${KEY} AND revision = ?)`;
const parse = text => (text == null ? null : JSON.parse(text));

// The learner's row, made on first use (owner decision 5a backfill): pointing at the board's live journey, whose goal row
// is made in the same batch. Deterministic goal ids and DO NOTHING make two first requests agree.
export async function ensureState(env, actor) {
  const read = () => env.LEARN_DB.prepare(`SELECT * FROM learn_coaching_state WHERE ${KEY}`).bind(...key(actor)).first();
  const row = await read();
  if (row) return row;
  const now = new Date().toISOString();
  await env.LEARN_DB.batch([
    env.LEARN_DB.prepare(goalForJourneySql(`j.org = ? AND j.owner_user_id = ? AND j.app = ? AND j.board = ? AND j.archived_at IS NULL`)).bind(actor.board, now, now, ...key(actor)),
    env.LEARN_DB.prepare(`INSERT INTO learn_coaching_state (org, owner_user_id, app, board, active_goal_id, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, (SELECT 'lg_' || id FROM learning_journeys WHERE ${KEY} AND archived_at IS NULL), 0, ?, ?) ON CONFLICT DO NOTHING`)
      .bind(...key(actor), ...key(actor), now, now),
  ]);
  return read();
}

const criterionOf = r => ({
  criterionId: r.criterion_id, version: r.version, label: r.label, requirement: r.requirement,
  requiresReasoning: r.requires_reasoning === 1, requiresTransfer: r.requires_transfer === 1, rubricVersion: r.rubric_version, ...(r.skill_key ? { skillKey: r.skill_key } : {}),
});
const activityOf = r => ({
  activityId: r.id, goalId: r.goal_id, revision: r.revision, status: r.status, objective: r.objective, prompt: r.prompt,
  responseKind: r.response_kind, criterionRefs: JSON.parse(r.criterion_refs_json), sourceRefs: JSON.parse(r.source_refs_json),
  checkpoint: parse(r.checkpoint_json), updatedAt: r.updated_at,
});
const goalStatus = (g, activeId) => (g.lifecycle === 'archived' || g.journey_archived_at ? 'archived' : g.lifecycle === 'completed' ? 'completed' : g.id === activeId ? 'active' : 'paused');

// One snapshot: the controls, every goal of this learner on this canvas with its current scope's criteria, and each goal's
// current activity. A missing table or a failed read throws: it never becomes an empty history.
export async function readCoachingState(env, actor) {
  const row = await ensureState(env, actor);
  const scoped = 'g.org = ? AND g.owner_user_id = ? AND g.app = ? AND g.board = ?';
  const [goals, criteria, activities] = await Promise.all([
    env.LEARN_DB.prepare(`SELECT g.*, j.archived_at AS journey_archived_at FROM learn_goals g LEFT JOIN learning_journeys j ON j.id = g.journey_id WHERE ${scoped} ORDER BY g.created_at, g.id`).bind(...key(actor)).all(),
    env.LEARN_DB.prepare(`SELECT c.* FROM learn_goal_criteria c JOIN learn_goals g ON g.id = c.goal_id AND c.scope_version = g.scope_version WHERE ${scoped} ORDER BY c.goal_id, c.position`).bind(...key(actor)).all(),
    env.LEARN_DB.prepare(`SELECT a.* FROM learn_activities a JOIN learn_goals g ON g.id = a.goal_id AND a.id = g.activity_id WHERE ${scoped}`).bind(...key(actor)).all(),
  ]);
  const byGoal = new Map();
  for (const c of criteria.results) byGoal.set(c.goal_id, [...(byGoal.get(c.goal_id) || []), criterionOf(c)]);
  const list = goals.results.map(g => ({
    goalId: g.id, label: g.label, outcome: g.outcome, scopeVersion: g.scope_version,
    lifecycle: g.journey_archived_at ? 'archived' : g.lifecycle, status: goalStatus(g, row.active_goal_id),
    criteria: byGoal.get(g.id) || [], activityId: g.activity_id, journeyId: g.journey_id, revision: g.revision, createdAt: g.created_at, updatedAt: g.updated_at,
  }));
  const activeGoalId = list.some(g => g.goalId === row.active_goal_id && g.status === 'active') ? row.active_goal_id : null;
  const state = {
    controls: { mode: row.mode, tutorEnabled: row.tutor_enabled === 1, suggestionsPaused: row.suggestions_paused === 1, revision: row.revision },
    goals: list, activeGoalId, activeActivityId: activeGoalId ? row.active_activity_id : null,
    activities: activities.results.map(activityOf), revision: row.revision,
  };
  const valid = validateCoachingRecord('CoachingState', state);
  if (!valid.ok) throw new Error(`coaching state failed its contract: ${valid.errors.slice(0, 3).join('; ')}`);
  return state;
}

// --- payload checks (the trust boundary: nothing else reaches SQL) -------------------------------------------------------
const sized = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const CRITERION_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
function only(payload, allowed) {
  const extra = Object.keys(payload).filter(k => !allowed.includes(k));
  if (extra.length) throw invalid(`unexpected payload field ${extra[0].slice(0, 40)}`);
}
function criteriaFrom(list) {
  if (!Array.isArray(list) || list.length > MAX_CRITERIA) throw invalid(`criteria must be at most ${MAX_CRITERIA}`);
  const out = list.map((c, i) => {
    if (c == null || typeof c !== 'object') throw invalid('each criterion must be an object');
    only(c, ['criterionId', 'label', 'requirement', 'requiresReasoning', 'requiresTransfer', 'rubricVersion', 'skillKey']);
    if (c.criterionId != null && (typeof c.criterionId !== 'string' || !CRITERION_ID.test(c.criterionId))) throw invalid('criterionId must be 1-64 letters, digits or _.:-');
    if (!sized(c.label, 200) || !sized(c.requirement, 1000)) throw invalid('a criterion needs a label (200) and an observable requirement (1000)');
    if (typeof c.requiresReasoning !== 'boolean') throw invalid('requiresReasoning must be true or false');
    if (c.requiresTransfer != null && typeof c.requiresTransfer !== 'boolean') throw invalid('requiresTransfer must be true or false');
    if (c.rubricVersion != null && !sized(c.rubricVersion, 64)) throw invalid('rubricVersion must be 1-64 characters');
    if (c.skillKey != null && !sized(c.skillKey, 64)) throw invalid('skillKey must be 1-64 characters');
    return { criterionId: c.criterionId ?? `c${i + 1}`, label: c.label, requirement: c.requirement, requiresReasoning: c.requiresReasoning, requiresTransfer: c.requiresTransfer ?? false, rubricVersion: c.rubricVersion ?? 'r1', skillKey: c.skillKey ?? null };
  });
  if (new Set(out.map(c => c.criterionId)).size !== out.length) throw invalid('criterionId must be unique within a goal');
  return out;
}
const refsOk = (kind, list, max) => Array.isArray(list) && list.length <= max && list.every(r => validateCoachingRecord(kind, r).ok);

async function ownGoal(env, actor, goalId) {
  if (typeof goalId !== 'string' || goalId.length > 200) throw invalid('goalId required');
  // Another learner's goal, another canvas's or a made-up id all read as missing: nothing about them is told.
  const g = await env.LEARN_DB.prepare(`SELECT g.*, j.archived_at AS journey_archived_at FROM learn_goals g LEFT JOIN learning_journeys j ON j.id = g.journey_id WHERE g.id = ? AND g.org = ? AND g.owner_user_id = ? AND g.app = ? AND g.board = ?`)
    .bind(goalId, ...key(actor)).first();
  if (!g) throw missing('unknown_goal');
  if (g.lifecycle !== 'open' || g.journey_archived_at) throw new CoachingConflict('goal_closed');
  return g;
}

// --- statements -------------------------------------------------------------------------------------------------------
// Moving the pointer to another goal: the board's live journey gets a goal row if older code made it without one, then
// every journey live on the board except the target's is parked, then the target's journey (if parked) returns.
function switchGoal(env, actor, rev, target, now) {
  const g = [...key(actor), rev], board = actor.board;
  const out = [
    env.LEARN_DB.prepare(goalForJourneySql(`j.org = ? AND j.owner_user_id = ? AND j.app = ? AND j.board = ? AND j.archived_at IS NULL AND ${GUARD}`)).bind(board, now, now, ...key(actor), ...g),
    env.LEARN_DB.prepare(parkJourneySql(GUARD)).bind(now, ...key(actor), target.journey_id ?? null, ...g),
  ];
  if (target.journey_id) out.push(env.LEARN_DB.prepare(unparkJourneySql(GUARD)).bind(board, now, target.journey_id, actor.org, actor.userId, actor.app, ...key(actor), ...g));
  return out;
}

const PLANS = {
  async save_controls(env, actor, row, payload) {
    only(payload, ['event']);
    const controls = { mode: row.mode, tutorEnabled: row.tutor_enabled === 1, suggestionsPaused: row.suggestions_paused === 1, revision: row.revision };
    const r = reduceTutorControls(controls, payload.event);
    if (r.rejected === 'stale_revision') throw new CoachingConflict('undo_stale');
    if (r.rejected) throw invalid('event is not a valid control event');
    if (r.state === controls) return null;
    return { statements: [], next: { mode: r.state.mode, tutorEnabled: r.state.tutorEnabled, suggestionsPaused: r.state.suggestionsPaused }, effects: r.effects };
  },

  async create_goal(env, actor, row, payload, rev, now) {
    only(payload, ['label', 'outcome', 'criteria']);
    if (!sized(payload.label, 200)) throw invalid('label must be 1-200 characters');
    if (payload.outcome != null && (typeof payload.outcome !== 'string' || payload.outcome.length > 1000)) throw invalid('outcome must be at most 1000 characters');
    const criteria = criteriaFrom(payload.criteria ?? []);
    const open = await env.LEARN_DB.prepare(`SELECT COUNT(*) AS n FROM learn_goals WHERE ${KEY} AND lifecycle = 'open'`).bind(...key(actor)).first();
    if (open.n >= MAX_OPEN_GOALS) throw new CoachingConflict('goal_limit');
    const id = `lg_${crypto.randomUUID()}`, scope = criteria.length ? 1 : 0, g = [...key(actor), rev];
    return {
      statements: [
        env.LEARN_DB.prepare(`INSERT INTO learn_goals (id, org, owner_user_id, app, board, label, outcome, origin, scope_version, lifecycle, revision, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, 'coaching', ?, 'open', 0, ?, ? WHERE ${GUARD}`).bind(id, ...key(actor), payload.label, payload.outcome ?? '', scope, now, now, ...g),
        ...criteria.map((c, i) => insertCriterion(env, id, scope, { ...c, version: 1 }, i, now, g)),
        ...switchGoal(env, actor, rev, { journey_id: null }, now),
      ],
      next: { activeGoalId: id, activeActivityId: null },
    };
  },

  async change_scope(env, actor, row, payload, rev, now) {
    only(payload, ['goalId', 'criteria']);
    const goal = await ownGoal(env, actor, payload.goalId);
    const criteria = criteriaFrom(payload.criteria);
    if (!criteria.length) throw invalid('a scope needs at least one criterion');
    // A criterion keeps its version only while what it asks is unchanged; any change is the next version. Earlier scopes'
    // rows stay as they were, so evidence keeps its original criterion version.
    const { results } = await env.LEARN_DB.prepare('SELECT * FROM learn_goal_criteria WHERE goal_id = ? ORDER BY scope_version').bind(goal.id).all();
    const latest = new Map(results.map(r => [r.criterion_id, r]));
    const scope = goal.scope_version + 1, g = [...key(actor), rev];
    const versioned = criteria.map(c => {
      const was = latest.get(c.criterionId);
      const same = was && was.label === c.label && was.requirement === c.requirement && (was.requires_reasoning === 1) === c.requiresReasoning && (was.requires_transfer === 1) === c.requiresTransfer && was.rubric_version === c.rubricVersion && (was.skill_key ?? null) === c.skillKey;
      return { ...c, version: !was ? 1 : same ? was.version : Math.max(...results.filter(r => r.criterion_id === c.criterionId).map(r => r.version)) + 1 };
    });
    return {
      statements: [
        ...versioned.map((c, i) => insertCriterion(env, goal.id, scope, c, i, now, g)),
        env.LEARN_DB.prepare(`UPDATE learn_goals SET scope_version = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND scope_version = ? AND ${GUARD}`).bind(scope, now, goal.id, goal.scope_version, ...g),
      ],
      next: {},
    };
  },

  async activate_goal(env, actor, row, payload, rev, now) {
    only(payload, ['goalId']);
    const goal = await ownGoal(env, actor, payload.goalId);
    if (goal.id === row.active_goal_id) return null;
    return { statements: switchGoal(env, actor, rev, goal, now), next: { activeGoalId: goal.id, activeActivityId: goal.activity_id ?? null } };
  },

  async activate_activity(env, actor, row, payload, rev, now) {
    const g = [...key(actor), rev], statements = [];
    let activity, goal;
    if (payload.activityId != null) {
      only(payload, ['activityId']);
      if (typeof payload.activityId !== 'string' || payload.activityId.length > 200) throw invalid('activityId required');
      activity = await env.LEARN_DB.prepare('SELECT * FROM learn_activities WHERE id = ? AND org = ? AND owner_user_id = ?').bind(payload.activityId, actor.org, actor.userId).first();
      if (!activity) throw missing('unknown_activity');
      goal = await ownGoal(env, actor, activity.goal_id).catch(error => { throw error.code === 'unknown_goal' ? missing('unknown_activity') : error; });
      if (activity.status === 'paused') statements.push(env.LEARN_DB.prepare(`UPDATE learn_activities SET status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'paused' AND ${GUARD}`).bind(now, activity.id, ...g));
    } else {
      only(payload, ['activity']);
      const a = payload.activity;
      if (a == null || typeof a !== 'object') throw invalid('activityId or activity required');
      only(a, ['goalId', 'objective', 'prompt', 'responseKind', 'criterionRefs', 'sourceRefs', 'checkpoint']);
      goal = await ownGoal(env, actor, a.goalId);
      if (!sized(a.objective, 500) || !sized(a.prompt, 4000)) throw invalid('an activity needs an objective (500) and its exact prompt (4000)');
      if (!RESPONSE_KINDS.includes(a.responseKind)) throw invalid(`responseKind must be one of ${RESPONSE_KINDS.join('|')}`);
      if (!refsOk('CriterionRef', a.criterionRefs, MAX_CRITERIA) || !refsOk('SourceRef', a.sourceRefs ?? [], MAX_SOURCES)) throw invalid('criterionRefs and sourceRefs must be valid references');
      const checkpoint = a.checkpoint == null ? null : JSON.stringify(a.checkpoint);
      if (checkpoint != null && (typeof a.checkpoint !== 'object' || checkpoint.length > MAX_CHECKPOINT)) throw invalid(`checkpoint must be an object of at most ${MAX_CHECKPOINT} characters`);
      // An activity targets criteria of its goal's current scope, at their current version: never another goal's.
      const { results } = await env.LEARN_DB.prepare('SELECT criterion_id, version FROM learn_goal_criteria WHERE goal_id = ? AND scope_version = ?').bind(goal.id, goal.scope_version).all();
      const current = new Set(results.map(r => `${r.criterion_id}@${r.version}`));
      if (!a.criterionRefs.every(r => current.has(`${r.criterionId}@${r.version}`))) throw invalid('criterionRefs must name criteria of the goal\'s current scope');
      activity = { id: `la_${crypto.randomUUID()}`, goal_id: goal.id, status: 'in_progress' };
      statements.push(env.LEARN_DB.prepare(`INSERT INTO learn_activities (id, goal_id, org, owner_user_id, revision, status, objective, prompt, response_kind, criterion_refs_json, source_refs_json, checkpoint_json, created_at, updated_at)
        SELECT ?, ?, ?, ?, 1, 'in_progress', ?, ?, ?, ?, ?, ?, ?, ? WHERE ${GUARD}`)
        .bind(activity.id, goal.id, actor.org, actor.userId, a.objective, a.prompt, a.responseKind, JSON.stringify(a.criterionRefs), JSON.stringify(a.sourceRefs ?? []), checkpoint, now, now, ...g));
    }
    if (activity.id === row.active_activity_id) return null;
    // The activity this one replaces within the goal waits, paused, for an explicit return.
    if (row.active_activity_id) statements.push(env.LEARN_DB.prepare(`UPDATE learn_activities SET status = 'paused', updated_at = ? WHERE id = ? AND status = 'in_progress' AND ${GUARD}`).bind(now, row.active_activity_id, ...g));
    statements.push(env.LEARN_DB.prepare(`UPDATE learn_goals SET activity_id = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND ${GUARD}`).bind(activity.id, now, goal.id, ...g));
    if (goal.id !== row.active_goal_id) statements.push(...switchGoal(env, actor, rev, goal, now));
    return { statements, next: { activeGoalId: goal.id, activeActivityId: activity.id } };
  },

  async pause_activity(env, actor, row, payload, rev, now) {
    only(payload, ['activityId']);
    if (payload.activityId !== row.active_activity_id || row.active_activity_id == null) throw new CoachingConflict('not_active_activity');
    return {
      statements: [env.LEARN_DB.prepare(`UPDATE learn_activities SET status = 'paused', updated_at = ? WHERE id = ? AND status = 'in_progress' AND ${GUARD}`).bind(now, row.active_activity_id, ...key(actor), rev)],
      next: { activeActivityId: null },
    };
  },
};

// Server-driven steps of an activity after an explicit submit (Slice A gap a, T3-report §7.7): awaiting_feedback once its
// attempt is saved, feedback_ready once that attempt's assessment is final. Like every write here it is one batch at the
// current coaching revision, which it bumps, so a tab holding the old revision gets 409 with the newer state; a concurrent
// write is retried on the fresh revision. Forward only, from the statuses listed: a completed or skipped activity never
// moves. assessment {attemptId, status, reason} is kept on the activity's checkpoint, so a UI can say what the feedback is,
// an unavailable one included, without reading the attempt. -> the new status, or null when the activity did not move.
const SUBMIT_STEPS = { awaiting_feedback: ['in_progress', 'paused', 'feedback_ready'], feedback_ready: ['awaiting_feedback'] };
export async function advanceActivity(env, actor, activityId, to, assessment = null) {
  const from = SUBMIT_STEPS[to];
  if (!from) throw new Error(`advanceActivity: ${to} is not a submit step`);
  for (let tries = 0; tries < 3; tries += 1) {
    const activity = await env.LEARN_DB.prepare('SELECT status, checkpoint_json FROM learn_activities WHERE id = ? AND org = ? AND owner_user_id = ?').bind(activityId, actor.org, actor.userId).first();
    if (!activity || !from.includes(activity.status)) return null;
    const row = await ensureState(env, actor), now = new Date().toISOString();
    const checkpoint = assessment ? JSON.stringify({ ...parse(activity.checkpoint_json), assessment }) : activity.checkpoint_json;
    const results = await env.LEARN_DB.batch([
      env.LEARN_DB.prepare(`UPDATE learn_activities SET status = ?, checkpoint_json = ?, updated_at = ? WHERE id = ? AND org = ? AND owner_user_id = ? AND status = ? AND ${GUARD}`)
        .bind(to, checkpoint, now, activityId, actor.org, actor.userId, activity.status, ...key(actor), row.revision),
      env.LEARN_DB.prepare(`UPDATE learn_coaching_state SET revision = revision + 1, updated_at = ? WHERE ${KEY} AND revision = ?`).bind(now, ...key(actor), row.revision),
    ]);
    if (results[0].meta.changes) return to;
  }
  throw new CoachingConflict('revision');
}

// Ruling Q2: a canvas's Tutor rows follow its lifecycle. Trash deletes nothing (Progress hides them while trashed); a
// permanent delete removes them in the canvas's own delete batch, children first. Every learner's rows on that canvas (org,
// app), all boards: only its owner, or a pending hole's, can hold any (canvasAccess).
export const purgeTutorRows = (db, org, app) => {
  const goals = 'SELECT id FROM learn_goals WHERE org = ? AND app = ?', attempts = 'SELECT id FROM learn_attempts WHERE org = ? AND app = ?';
  return [
    db.prepare(`DELETE FROM learn_observations WHERE attempt_id IN (${attempts})`).bind(org, app),
    db.prepare(`DELETE FROM learn_assessments WHERE attempt_id IN (${attempts})`).bind(org, app),
    db.prepare('DELETE FROM learn_attempts WHERE org = ? AND app = ?').bind(org, app),
    db.prepare(`DELETE FROM learn_activities WHERE goal_id IN (${goals})`).bind(org, app),
    db.prepare(`DELETE FROM learn_goal_criteria WHERE goal_id IN (${goals})`).bind(org, app),
    db.prepare('DELETE FROM learn_goals WHERE org = ? AND app = ?').bind(org, app),
    db.prepare('DELETE FROM learn_coaching_state WHERE org = ? AND app = ?').bind(org, app),
  ];
};

function insertCriterion(env, goalId, scope, c, position, now, guardBinds) {
  return env.LEARN_DB.prepare(`INSERT INTO learn_goal_criteria (goal_id, scope_version, criterion_id, version, position, label, requirement, requires_reasoning, requires_transfer, rubric_version, skill_key, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${GUARD}`)
    .bind(goalId, scope, c.criterionId, c.version, position, c.label, c.requirement, c.requiresReasoning ? 1 : 0, c.requiresTransfer ? 1 : 0, c.rubricVersion, c.skillKey, now, ...guardBinds);
}

export async function applyCoachingAction(env, actor, request) {
  const checked = validateCoachingRecord('CoachingRequest', request);
  if (!checked.ok) throw invalid(checked.errors.join('; ').slice(0, 300));
  const row = await ensureState(env, actor);
  // A retry of the action that made this revision: the same result, nothing written twice.
  if (row.last_action_id === request.actionId) return { state: await readCoachingState(env, actor), effects: [], replayed: true };
  if (row.revision !== request.expectedRevision) throw new CoachingConflict('revision');
  const rev = row.revision, now = new Date().toISOString();
  const plan = await PLANS[request.action](env, actor, row, request.payload, rev, now);
  if (!plan) return { state: await readCoachingState(env, actor), effects: [] };
  const n = {
    mode: row.mode, tutorEnabled: row.tutor_enabled === 1, suggestionsPaused: row.suggestions_paused === 1,
    activeGoalId: row.active_goal_id, activeActivityId: row.active_activity_id, ...plan.next,
  };
  const results = await env.LEARN_DB.batch([
    ...plan.statements,
    env.LEARN_DB.prepare(`UPDATE learn_coaching_state SET mode = ?, tutor_enabled = ?, suggestions_paused = ?, active_goal_id = ?, active_activity_id = ?, last_action_id = ?, revision = revision + 1, updated_at = ? WHERE ${KEY} AND revision = ?`)
      .bind(n.mode, n.tutorEnabled ? 1 : 0, n.suggestionsPaused ? 1 : 0, n.activeGoalId, n.activeActivityId, request.actionId, now, ...key(actor), rev),
  ]);
  if (!results.at(-1).meta.changes) throw new CoachingConflict('revision');
  return { state: await readCoachingState(env, actor), effects: plan.effects || [] };
}

