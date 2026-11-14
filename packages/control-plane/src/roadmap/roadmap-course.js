// Create a course (owner 2026-11-14): after the learner accepts the plan, "Generate course" makes every card of the accepted plan one after another with no
// per-card approval. The run is the ordinary roadmap machinery driven by the server itself: each step is offered and accepted in one go (the same hold, quote, one
// author call, checks and refund rules as a learner's own Accept; nothing is relaxed), and the next step starts as soon as the card in hand is MADE (roadmap-lifecycle.js
// COURSE_BUSY_STEP), not when the browser places it. The browser still inserts, saves and acknowledges each card exactly as before (roadmap-controller.js).
// The run lives in scope_json.course (no migration): { running, runs, startedAt, stopped, factsTried, facts }. It is read by the view (roadmap-view.js `course`).
// ponytail: cards are made one at a time (the money rule BE.12 allows one unresolved learner call per roadmap); making them in parallel needs that rule scoped per step first.
import { StateError } from './roadmap-contract.js';
import { acceptRoadmapStep, applyRoadmapAction, readRoadmap, readUnfinishedRoadmap } from './roadmap-store.js';
import { COURSE_BUSY_STEP, endRoadmap, proposeNextStep } from './roadmap-lifecycle.js';
import { withheldCause } from './roadmap-check.js';
import { revalidateSourceAsJob } from './roadmap-access.js';
import { composeProposal } from './roadmap-compose.js';
import { quoteStepAcceptance } from './roadmap-run.js';
import { platformCallModel } from './roadmap-models.js';
import { readMarkdownForActor } from './roadmap-source-reader.js';
import { FACTS_SYSTEM, FACTS_TOOL, factsMessage, validateFacts } from '../agents/roadmap-facts.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);
const parse = text => { try { return JSON.parse(text); } catch { return null; } };
export const courseOf = roadmap => { const course = parse(roadmap?.scope_json)?.course; return course && typeof course === 'object' ? course : null; };
const versionOf = roadmap => roadmap.accepted_plan_version ?? roadmap.plan_version;
const FACTS_MS = 15000;

// Every change to the run is one receipt-guarded action (the revision moves, so every device's next poll sees it). `change` is merged into the stored run.
async function writeCourse(db, access, roadmap, operation, change, { expectedRevision = roadmap.revision, actionKey = `rmcourse_${operation}_${roadmap.id}_${roadmap.revision}`, now = nowSeconds() } = {}) {
  const next = { ...(courseOf(roadmap) || {}), ...change };
  return applyRoadmapAction(db, access, {
    operation, actionKey, roadmapId: roadmap.id, expectedRevision, now,
    guard: { sql: "(SELECT state FROM learn_roadmaps WHERE id = ?) IN ('active', 'paused')", binds: [roadmap.id] },
    outcome: { status: 200, body: { roadmapId: roadmap.id } },
    statements: r => [db.prepare(`UPDATE learn_roadmaps SET scope_json = json_set(scope_json, '$.course', json(?)) WHERE id = ? AND ${r.and}`).bind(JSON.stringify(next), roadmap.id, ...r.binds)],
  });
}

// A step whose card could not be made: closed (skipped) with its latest accepted result failed or refunded unplaced. Try again reopens exactly these.
const FAILED_RESULT = "r.decision = 'accepted' AND (r.generation = 'failed' OR (r.billing = 'refunded' AND r.delivery = 'not_delivered'))";
const failedSteps = async (db, roadmapId, version) => ((await db.prepare(`SELECT s.id FROM learn_roadmap_steps s WHERE s.roadmap_id = ? AND s.plan_version = ? AND s.state IN ('incomplete', 'skipped')
  AND EXISTS (SELECT 1 FROM learn_step_results r WHERE r.step_id = s.id AND ${FAILED_RESULT})`).bind(roadmapId, version).all()).results || []);
const resultFailed = r => r.generation === 'failed' || (r.billing === 'refunded' && r.delivery === 'not_delivered');

// Back-pressure: while this many made cards wait to be placed (the learner's browser is away, or the canvas cannot save them), no new card is started. Every card is paid for when
// it is made and refunded if it is never placed within 24 hours, so an absent browser must not cost forty cards. Each placement wakes the run again (roadmap-auto.js).
export const UNPLACED_MAX = 3;
// Stop rules: this many cards in a row that could not be made (a provider outage), or two withheld for safety in a row, or one for a learner's own signs of danger.
export const FAILURES_IN_A_ROW = 3, REFUSALS_IN_A_ROW = 2;

// Generate course: the accepted plan's planned steps become a running course. Refused when the roadmap is not active (a paused one resumes), a course is already running, or nothing is left to make.
export async function startCourse(db, access, { roadmapId, expectedRevision, now = nowSeconds() }) {
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  if (!['active', 'paused'].includes(roadmap.state) || roadmap.accepted_plan_version == null) throw new StateError('roadmap_not_active', 'Not available', 409);
  const held = courseOf(roadmap);
  if (held?.running) throw new StateError('course_running', 'The course is already being made.', 409);
  const left = await db.prepare("SELECT COUNT(*) AS n FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? AND state = 'planned'").bind(roadmapId, versionOf(roadmap)).first();
  if (!left?.n) throw new StateError('nothing_to_generate', 'Every card of this plan is already made.', 409);
  const runs = (held?.runs ?? 0) + 1;
  return writeCourse(db, access, roadmap, 'course_start', { running: true, runs, stopped: null, startedAt: now }, { expectedRevision: expectedRevision ?? roadmap.revision, actionKey: `rmcourse_start_${roadmapId}_${runs}`, now });
}

// Try again (owner 2026-11-14): the cards that could not be made are planned again and the course runs for them. They were refunded when they failed, and are paid for again as each is made.
export async function retryCourse(db, access, { roadmapId, expectedRevision, now = nowSeconds() }) {
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  if (!['active', 'paused'].includes(roadmap.state) || roadmap.accepted_plan_version == null) throw new StateError('roadmap_not_active', 'Not available', 409);
  const held = courseOf(roadmap);
  if (held?.running) throw new StateError('course_running', 'The course is already being made.', 409);
  const failed = await failedSteps(db, roadmapId, versionOf(roadmap));
  if (!failed.length) throw new StateError('nothing_to_retry', 'No card needs another try.', 409);
  const runs = (held?.runs ?? 0) + 1, next = { ...(held || {}), running: true, runs, stopped: null, startedAt: now };
  return applyRoadmapAction(db, access, {
    operation: 'course_retry', actionKey: `rmcourse_retry_${roadmapId}_${runs}`, roadmapId, expectedRevision: expectedRevision ?? roadmap.revision, now,
    guard: { sql: "(SELECT state FROM learn_roadmaps WHERE id = ?) IN ('active', 'paused')", binds: [roadmapId] }, outcome: { status: 200, body: { roadmapId } },
    statements: r => [
      ...failed.map(s => db.prepare(`UPDATE learn_roadmap_steps SET state = 'planned', updated_at = ? WHERE id = ? AND state IN ('incomplete', 'skipped') AND ${r.and}`).bind(now, s.id, ...r.binds)),
      db.prepare(`UPDATE learn_roadmaps SET scope_json = json_set(scope_json, '$.course', json(?)) WHERE id = ? AND ${r.and}`).bind(JSON.stringify(next), roadmapId, ...r.binds),
    ],
  });
}

// One course per canvas (owner 2026-11-14): Create a course on a new file ends the canvas's unfinished roadmap (a draft, a plan under review, an accepted plan never started, a
// cancelled or incomplete course); its cards stay on the canvas. A course being made is never replaced: the drop is answered with a note and no invitation (roadmap-invitations.js).
export async function replaceUnfinished(db, access, { now = nowSeconds() } = {}) {
  const open = await readUnfinishedRoadmap(db, access);
  if (!open) return null;
  if (courseOf(open)?.running) throw new StateError('course_running', 'A course is being made. Drop the file again when it is done.', 422);
  try { return await endRoadmap(db, access, { roadmapId: open.id, expectedRevision: open.revision, actionKey: `rmreplace_${open.id}_${open.revision}`, now }); }
  catch (error) { if (!(error instanceof StateError)) throw error; throw new StateError('course_busy', 'A card is still being made. Try again in a moment.', 422); }
}

// Cancel: no new card is started. The card being made finishes and is delivered (accepted work always finishes); the cards already made stay on the canvas.
export async function stopCourse(db, access, { roadmapId, expectedRevision, now = nowSeconds() }) {
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  const held = courseOf(roadmap);
  if (!held?.running) return { status: 200, body: { roadmapId }, replayed: true };
  return writeCourse(db, access, roadmap, 'course_stop', { running: false, stopped: 'cancelled' }, { expectedRevision: expectedRevision ?? roadmap.revision, actionKey: `rmcourse_stop_${roadmapId}_${held.runs ?? 1}`, now });
}

const stopWith = async (db, access, roadmapId, stopped, now) => { const fresh = await readRoadmap(db, access, roadmapId); if (fresh && courseOf(fresh)?.running) await writeCourse(db, access, fresh, 'course_stop', { running: false, stopped }, { now }).catch(() => null); };
// A card that cannot be prepared: say whether the file changed (the learner edits the plan) or something else is wrong.
const stopBlocked = async (db, access, roadmapId, deps, now) => {
  const roadmap = await readRoadmap(db, access, roadmapId);
  const source = roadmap ? await (deps.revalidate || revalidateSourceAsJob)(db, access, roadmap).catch(() => ({ ok: true })) : { ok: true };
  await stopWith(db, access, roadmapId, source?.code === 'source_changed' ? 'source_changed' : 'blocked', now);
};

// One step of the run: if the card in hand is made and a step is left, offer it and accept it. Called after Generate course, after every made card (roadmap-wire.js) and after
// every delivery or failure (roadmap-auto.js). Idempotent: a repeat finds the step in flight and answers 'waiting'.
// deps: { compose?, revalidate?, quote?, onAccepted?, callModel?, factsInline?, adopt?, now? }. adopt (Generate course): the first offer Accept plan already made is accepted as it stands.
// -> { status: 'idle'|'waiting'|'started'|'completed'|'incomplete'|'blocked'|'refused'|'stopped'|'unresolved'|'skipped', reason? }
export async function advanceCourse(env, access, roadmapId, deps = {}) {
  const db = env.LEARN_DB, now = deps.now ?? nowSeconds();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const roadmap = await readRoadmap(db, access, roadmapId);
    if (!roadmap || !['active', 'paused'].includes(roadmap.state) || !courseOf(roadmap)?.running) return { status: 'idle' };
    const version = versionOf(roadmap);
    const adopted = deps.adopt ? await db.prepare("SELECT id, version FROM learn_step_proposals WHERE roadmap_id = ? AND state = 'pending' ORDER BY created_at DESC LIMIT 1").bind(roadmapId).first() : null;
    // The cards of THIS run, newest first: a stop rule reads only what the run itself made.
    const { results: recent } = await db.prepare("SELECT generation, billing, delivery, failure_class, check_json FROM learn_step_results WHERE roadmap_id = ? AND decision = 'accepted' AND created_at >= ? ORDER BY created_at DESC, rowid DESC LIMIT 3")
      .bind(roadmapId, courseOf(roadmap).startedAt ?? 0).all();
    const last = (recent || [])[0];
    if (last && resultFailed(last) && last.failure_class === 'policy_block') {
      const cause = last.check_json ? withheldCause(parse(last.check_json) || {}) : 'safety';
      if (cause === 'personal_risk' || (recent || []).slice(0, REFUSALS_IN_A_ROW).filter(r => resultFailed(r) && r.failure_class === 'policy_block').length >= REFUSALS_IN_A_ROW) { await stopWith(db, access, roadmapId, 'safety', now); return { status: 'stopped', reason: 'safety' }; }
    }
    if ((recent || []).length >= FAILURES_IN_A_ROW && recent.every(resultFailed)) { await stopWith(db, access, roadmapId, 'failures', now); return { status: 'stopped', reason: 'failures' }; }
    if (!adopted && await db.prepare(COURSE_BUSY_STEP).bind(roadmapId, version).first()) return { status: 'waiting' };
    const unplaced = await db.prepare("SELECT COUNT(*) AS n FROM learn_step_results WHERE roadmap_id = ? AND decision = 'accepted' AND generation = 'generated' AND validation = 'passed' AND delivery = 'not_delivered'").bind(roadmapId).first();
    if (unplaced?.n >= UNPLACED_MAX) return { status: 'waiting', reason: 'unplaced' };
    const next = await db.prepare("SELECT id FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? AND state = 'planned' LIMIT 1").bind(roadmapId, version).first();
    if (!adopted && !next) {
      // Nothing left to start. Cards still waiting to be placed wake this again as they land. When every card is placed the roadmap completes (proposeNextStep's own rule), unless
      // some could not be made: then it stays open so the learner can Try again.
      if (unplaced?.n) return { status: 'waiting' };
      if ((await failedSteps(db, roadmapId, version)).length) { await stopWith(db, access, roadmapId, 'incomplete', now); return { status: 'incomplete' }; }
    }
    try {
      const offered = adopted ? { body: { proposalId: adopted.id, version: adopted.version } } : await proposeNextStep(db, access, { roadmapId, expectedRevision: roadmap.revision, actionKey: `rmcourse_offer_${roadmapId}_${roadmap.revision}`, compose: deps.compose || ((rm, step) => composeProposal(db, rm, step)), env, revalidate: deps.revalidate, course: true, now });
      if (offered.body.state === 'completed') return { status: 'completed' };
      if (offered.body.offer === 'blocked') { await stopBlocked(db, access, roadmapId, deps, now); return { status: 'blocked' }; }
      const fresh = await readRoadmap(db, access, roadmapId);
      const accepted = await acceptRoadmapStep(env, access, { roadmapId, revision: fresh.revision, proposalId: offered.body.proposalId, proposalVersion: offered.body.version,
        actionKey: `rmcourse_accept_${offered.body.proposalId}_${offered.body.version}`, quote: args => (deps.quote ? deps.quote(env, access, args) : quoteStepAcceptance(env, access, args)), now });
      if (accepted.refusal) { await stopWith(db, access, roadmapId, 'allowance', now); return { status: 'refused' }; }
      if (!accepted.replayed) await deps.onAccepted?.(env, access, accepted.body);
      if (deps.factsInline) await ensureFacts(env, access, roadmapId, deps).catch(() => null);
      return { status: 'started' };
    } catch (error) {
      if (!(error instanceof StateError)) throw error;
      if (error.code === 'stale_revision') continue; // the roadmap moved under us: decide again from the new state
      if (error.code === 'outcome_unresolved') return { status: 'unresolved' }; // BE.12: the caller keeps its event pending
      if (error.code === 'offer_unready') { await stopBlocked(db, access, roadmapId, deps, now); return { status: 'blocked' }; }
      return { status: 'skipped', reason: error.code }; // proposal_not_pending, roadmap_not_active...: someone else already decided
    }
  }
  return { status: 'skipped', reason: 'stale_revision' };
}

// The fun facts for the wait: one platform-funded call, once per course (factsTried is set first, so a retry never repeats it). Never blocks a card and never fails the run.
export async function ensureFacts(env, access, roadmapId, deps = {}) {
  const db = env.LEARN_DB, roadmap = await readRoadmap(db, access, roadmapId), course = courseOf(roadmap);
  if (!roadmap || !course?.running || course.factsTried) return null;
  const claimed = await db.prepare("UPDATE learn_roadmaps SET scope_json = json_set(scope_json, '$.course.factsTried', 1) WHERE id = ? AND json_extract(scope_json, '$.course.factsTried') IS NULL").bind(roadmapId).run();
  if (claimed?.meta?.changes === 0) return null;
  const read = await (deps.readSourceForActor || readMarkdownForActor)(env, access, { key: roadmap.source_key, rev: roadmap.source_rev });
  if (read?.status !== 'ok' || !read.text) return null;
  const callModel = deps.callModel || platformCallModel(env, access, { roadmapId, version: 100 + (course.runs ?? 1), transport: deps.transport, quota: null }); // anchor: the roadmap id, as every platform call has (a made-up anchor is refused: operation ids must be server ids, found live); version 100+runs keeps it apart from the planner's. Not the plan quota (6 an hour): the facts are one small call a course, and a spent plan quota silently left the wait without them (found live)
  const name = parse(roadmap.scope_json)?.sourceName || '';
  let timer;
  try {
    const message = await Promise.race([
      callModel('roadmap_subject', { max_tokens: 4000, system: FACTS_SYSTEM, tools: [FACTS_TOOL], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: factsMessage({ name, language: roadmap.language, text: read.text.slice(0, 12000) }) }] }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('facts_timeout')), FACTS_MS); }),
    ]);
    const used = (message?.content || []).filter(part => part.type === 'tool_use');
    const verdict = used.length === 1 && used[0].name === FACTS_TOOL.name ? validateFacts(used[0].input) : { ok: false };
    if (!verdict.ok) return null;
    // No revision bump: the facts only decorate the wait, and the next card's own change carries them to every device.
    await db.prepare("UPDATE learn_roadmaps SET scope_json = json_set(scope_json, '$.course.facts', json(?)) WHERE id = ? AND org = ? AND owner_user_id = ?").bind(JSON.stringify(verdict.facts), roadmapId, access.org, access.actorUserId).run();
    return verdict.facts;
  } catch { return null; } finally { clearTimeout(timer); }
}
