// Create a course (owner 2026-11-14): after the learner accepts the plan, "Generate course" makes every card of the accepted plan one after another with no
// per-card approval. The run is the ordinary roadmap machinery driven by the server itself: each step is offered and accepted in one go (the same hold, quote, one
// author call, checks and refund rules as a learner's own Accept; nothing is relaxed), and the next step starts as soon as the card in hand is MADE (roadmap-lifecycle.js
// COURSE_BUSY_STEP), not when the browser places it. The browser still inserts, saves and acknowledges each card exactly as before (roadmap-controller.js).
// The run lives in scope_json.course (no migration): { running, runs, startedAt, stopped, factsTried, facts }. It is read by the view (roadmap-view.js `course`).
// ponytail: cards are made one at a time (the money rule BE.12 allows one unresolved learner call per roadmap); making them in parallel needs that rule scoped per step first.
import { StateError } from './roadmap-contract.js';
import { acceptRoadmapStep, applyRoadmapAction, readRoadmap } from './roadmap-store.js';
import { COURSE_BUSY_STEP, proposeNextStep } from './roadmap-lifecycle.js';
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

// Generate course: the accepted plan's planned steps become a running course. Refused when the roadmap is not active, a course is already running, or nothing is left to make.
export async function startCourse(db, access, { roadmapId, expectedRevision, now = nowSeconds() }) {
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  if (roadmap.state !== 'active' || roadmap.accepted_plan_version == null) throw new StateError('roadmap_not_active', 'Not available', 409);
  const held = courseOf(roadmap);
  if (held?.running) throw new StateError('course_running', 'The course is already being made.', 409);
  const left = await db.prepare("SELECT COUNT(*) AS n FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? AND state = 'planned'").bind(roadmapId, versionOf(roadmap)).first();
  if (!left?.n) throw new StateError('nothing_to_generate', 'Every card of this plan is already made.', 409);
  const runs = (held?.runs ?? 0) + 1;
  return writeCourse(db, access, roadmap, 'course_start', { running: true, runs, stopped: null, startedAt: now }, { expectedRevision: expectedRevision ?? roadmap.revision, actionKey: `rmcourse_start_${roadmapId}_${runs}`, now });
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

// One step of the run: if the card in hand is made and a step is left, offer it and accept it. Called after Generate course, after every made card (roadmap-wire.js) and after
// every delivery or failure (roadmap-auto.js). Idempotent: a repeat finds the step in flight and answers 'waiting'.
// deps: { compose?, revalidate?, quote?, onAccepted?, callModel?, factsInline?, adopt?, now? }. adopt (Generate course): the first offer Accept plan already made is accepted as it stands. -> { status: 'idle'|'waiting'|'started'|'completed'|'blocked'|'refused'|'unresolved'|'skipped', reason? }
export async function advanceCourse(env, access, roadmapId, deps = {}) {
  const db = env.LEARN_DB, now = deps.now ?? nowSeconds();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const roadmap = await readRoadmap(db, access, roadmapId);
    if (!roadmap || roadmap.state !== 'active' || !courseOf(roadmap)?.running) return { status: 'idle' };
    const version = versionOf(roadmap);
    const adopted = deps.adopt ? await db.prepare("SELECT id, version FROM learn_step_proposals WHERE roadmap_id = ? AND state = 'pending' ORDER BY created_at DESC LIMIT 1").bind(roadmapId).first() : null;
    if (!adopted && await db.prepare(COURSE_BUSY_STEP).bind(roadmapId, version).first()) return { status: 'waiting' };
    const next = await db.prepare("SELECT id FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? AND state = 'planned' LIMIT 1").bind(roadmapId, version).first();
    // Nothing left to start: the roadmap completes (proposeNextStep's own rule) once every card made is delivered; until then the last deliveries wake this again.
    if (!adopted && !next && await db.prepare("SELECT 1 AS n FROM learn_step_results WHERE roadmap_id = ? AND decision = 'accepted' AND delivery = 'not_delivered' AND generation != 'failed' AND billing != 'refunded' LIMIT 1").bind(roadmapId).first()) return { status: 'waiting' };
    try {
      const offered = adopted ? { body: { proposalId: adopted.id, version: adopted.version } } : await proposeNextStep(db, access, { roadmapId, expectedRevision: roadmap.revision, actionKey: `rmcourse_offer_${roadmapId}_${roadmap.revision}`, compose: deps.compose || ((rm, step) => composeProposal(db, rm, step)), env, revalidate: deps.revalidate, course: true, now });
      if (offered.body.state === 'completed') return { status: 'completed' };
      if (offered.body.offer === 'blocked') { await stopWith(db, access, roadmapId, 'blocked', now); return { status: 'blocked' }; }
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
      if (error.code === 'offer_unready') { await stopWith(db, access, roadmapId, 'blocked', now); return { status: 'blocked' }; }
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
  const callModel = deps.callModel || platformCallModel(env, access, { roadmapId, version: course.runs ?? 1, anchor: 'facts', quota: 'plan' });
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
