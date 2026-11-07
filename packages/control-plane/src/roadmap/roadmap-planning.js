// R4 integration glue: planning from the outbox. A create, an answer and a revision each commit a `plan_requested` event with their fact
// (roadmap-store.js createRoadmap, answerQuestion and revisePlan below), and this handler runs Tools' draft/revise planners over an injected
// `callModel`, then records the validated plan through State's recordPlan. Idempotent: the plan action key is derived from the instruction
// version, a superseded instruction version is dropped, and a replay finds the recorded plan and does nothing. The learner's ORIGINAL instruction
// (version 1) is passed unchanged to every call; later answers and edits are appended versions, never replacements.
import { StateError } from './roadmap-contract.js';
import { DEPTHS } from './roadmap-contract.js';
import { ceilingFor } from './roadmap-policy.js';
import { applyRoadmapAction, eventStatement, readRoadmap, recordPlan, requireKey } from './roadmap-store.js';
import { newId, sha256 } from './roadmap-money.js';
import { accessForRoadmap } from './roadmap-access.js';
import { readRoadmapSource } from './roadmap-source.js';
import { readMarkdownForActor } from './roadmap-source-reader.js';
import { draftRoadmap, reviseRoadmap } from './roadmap-plan.js';
import { platformCallModel } from './roadmap-models.js';
import { LIMIT_COPY } from './roadmap-source-read.js';
import { longMarkdownEnabled } from './roadmap-source-index.js';
import { readLongSource, prepareLongPlan, withLongCoverage } from './roadmap-source-long.js';

export const PLANNING_COPY = Object.freeze({
  failed: 'The plan could not be made. Edit your request or end the roadmap.', // NEW (S34)
});
const nowSeconds = () => Math.floor(Date.now() / 1000);
const parse = text => { try { return JSON.parse(text); } catch { return null; } };

const limitation = (code, message, extra = {}) => ({ outcome: '', assumptions: [], formats: [], stoppingPoint: '', steps: [], limitation: { code, message, readChars: 0, sourceChars: 0, offers: [], ...extra } });
// The planner's question gets a server id and option ids (the wire shape of status-questioning).
const withIds = (question, n) => ({ id: `q_${n}`, kind: question.kind, text: question.text, options: (question.options || []).map((o, i) => ({ id: `o${i + 1}`, label: o.label })) });

const instructionsOf = async (db, roadmapId) => {
  const { results } = await db.prepare('SELECT version, text, origin FROM learn_roadmap_instructions WHERE roadmap_id = ? ORDER BY version').bind(roadmapId).all();
  return results || [];
};

// The outbox handler for `plan_requested`. deps: { callModel?, registry?, transport?, readSourceForActor? } (tests inject; production uses defaults).
export async function planningHandler(env, event, { now = nowSeconds() } = {}, deps = {}) {
  const db = env.LEARN_DB;
  const access = await accessForRoadmap(db, event);
  if (!access) return { done: true }; // unknown roadmap or revoked access: stop, spend nothing
  const roadmap = await readRoadmap(db, access, event.roadmap_id);
  if (!roadmap || !['draft', 'questioning', 'proposed'].includes(roadmap.state)) return { done: true };
  // No new unsolicited work while the flag is off: wait, resume when it is restored (v1.4 4.1).
  if (env.ROADMAP_ENABLED !== 'true' && !deps.ignoreFlag) return { retry: true };
  const { instructionVersion } = parse(event.payload_json) || {};
  const instructions = await instructionsOf(db, roadmap.id);
  if (!instructions.length || instructions[instructions.length - 1].version !== instructionVersion) return { done: true }; // a newer request supersedes this one
  const key = `rmplan_${roadmap.id}_${instructionVersion}`;
  if (await db.prepare('SELECT 1 AS ok FROM learn_roadmap_actions WHERE org = ? AND owner_user_id = ? AND action_key = ?').bind(access.org, access.actorUserId, key).first()) return { done: true };

  const record = plan => recordPlan(db, access, { roadmapId: roadmap.id, actionKey: key, expectedRevision: roadmap.revision, plan, promptVersion: plan.promptVersion || 'roadmap-plan-1', model: plan.model ?? null, now });
  const settle = async plan => { try { await record(plan); } catch (error) { if (!(error instanceof StateError)) throw error; } return { done: true }; }; // a stale revision: the learner moved on

  const scope = parse(roadmap.scope_json) || { kind: 'whole' };
  const readSourceForActor = deps.readSourceForActor || readMarkdownForActor, ref = { key: roadmap.source_key, rev: roadmap.source_rev };
  // R7a: a roadmap made over a long Markdown source plans through the outline and evidence loop. The switch off, or anything the loop needs missing, is the R4 answer: choose a section.
  const isLong = scope.kind === 'long', tooLong = (extra = {}) => settle(limitation('source_too_large', LIMIT_COPY.tooLarge, { offers: LIMIT_COPY.offers, ...extra }));
  if (isLong && !longMarkdownEnabled(env)) return tooLong();
  const read = isLong ? await readLongSource(env, access, { ref }, { readSourceForActor })
    : await readRoadmapSource(env, access, { ref, scope: scope.kind === 'passage' ? { kind: 'passage', start: scope.start, end: scope.end } : { kind: 'declared' } }, { readSourceForActor });
  if (read.status !== 'ok' || read.sourceFingerprint !== roadmap.scope_fingerprint) {
    if (read.status === 'needs_clarification') return settle(limitation('source_too_large', LIMIT_COPY.tooLarge, { offers: LIMIT_COPY.offers }));
    return settle(limitation(read.status === 'ok' || read.reason === 'source_changed' ? 'source_changed' : 'source_unavailable', read.status === 'ok' || read.reason === 'source_changed' ? LIMIT_COPY.changed : LIMIT_COPY.unavailable));
  }

  const original = instructions[0].text, latest = instructions[instructions.length - 1].text;
  const previous = roadmap.plan_version ? parse((await db.prepare('SELECT plan_json FROM learn_roadmap_plan_versions WHERE roadmap_id = ? AND version = ?').bind(roadmap.id, roadmap.plan_version).first())?.plan_json) : null;
  const revising = !!previous?.steps?.length;
  const callModel = deps.callModel || platformCallModel(env, access, { roadmapId: roadmap.id, version: instructionVersion, quota: 'plan', registry: deps.registry, transport: deps.transport, now: () => now });
  const input = { instruction: { original, ...(instructionVersion > 1 ? { latest } : {}) }, depth: roadmap.depth, source: read, language: roadmap.language ?? undefined };
  let prepared = null;
  if (isLong) {
    prepared = await prepareLongPlan(env, access, roadmap, { readSourceForActor });
    if (!prepared.ok) return tooLong();
    input.long = prepared.long;
  }
  const out = revising
    ? await reviseRoadmap({ ...input, change: latest, current: previous, delivered: [] }, { callModel })
    : await draftRoadmap(input, { callModel });
  // A model limitation before any call was made is transient (nothing spent, nothing substituted). Once the long loop has spent calls, a retry would pay for them again: answer with the R4 limitation instead.
  if (out.outcome === 'unavailable') return isLong && out.calls > 0 ? tooLong({ choices: prepared.choices.map(({ locationId, part, parts, label, chars }) => ({ locationId, part, parts, label, chars })) }) : { retry: true };
  if (out.outcome === 'failed') return settle(limitation('plan_failed', PLANNING_COPY.failed));
  const n = instructionVersion;
  if (out.outcome === 'question') {
    const question = out.plan?.question ? withIds(out.plan.question, n) : withIds(out.question, n); // a language question has no plan
    return settle({ outcome: '', assumptions: [], formats: [], stoppingPoint: '', steps: [], question, language: out.plan?.language, promptVersion: out.promptVersion });
  }
  return settle({ ...(isLong ? withLongCoverage(out.plan, { units: prepared.units, loop: prepared.loop, totalChars: read.coverage.chars }) : out.plan), promptVersion: out.promptVersion });
}

// --- learner actions that request a plan: answer the focused question, revise the plan --------------------------------------------------
const WAITING = ['questioning'];
const REVISABLE = ['questioning', 'proposed'];

// Appends the next instruction version (never overwrites version 1) and commits plan_requested with the fact. text <= instructionChars is the caller's.
async function requestPlan(db, access, { roadmapId, expectedRevision, actionKey, operation, text, origin, settings = {}, from, now, extra = () => [] }) {
  requireKey(actionKey);
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  const next = ((await db.prepare('SELECT MAX(version) AS v FROM learn_roadmap_instructions WHERE roadmap_id = ?').bind(roadmapId).first())?.v || 0) + 1;
  const depth = settings.depth && DEPTHS.includes(settings.depth) ? settings.depth : roadmap.depth;
  return applyRoadmapAction(db, access, {
    operation, actionKey, roadmapId, expectedRevision, parts: [origin, await sha256(text), depth], now,
    guard: { sql: `(SELECT state FROM learn_roadmaps WHERE id = ?) IN (${from.map(() => '?').join(',')}) AND ? >= (SELECT delivered_count FROM learn_roadmaps WHERE id = ?)`, binds: [roadmapId, ...from, ceilingFor(depth), roadmapId] },
    outcome: { status: 202, body: { roadmapId, instructionVersion: next } },
    statements: r => [
      db.prepare(`INSERT INTO learn_roadmap_instructions (roadmap_id, version, org, owner_user_id, board_id, text, origin, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${r.and}`)
        .bind(roadmapId, next, access.org, access.actorUserId, access.boardId, text, origin, now, ...r.binds),
      db.prepare(`UPDATE learn_roadmaps SET depth = ?, ceiling = ? WHERE id = ? AND ${r.and}`).bind(depth, ceilingFor(depth), roadmapId, ...r.binds),
      ...extra(r),
      eventStatement(db, access, { roadmapId, kind: 'plan_requested', factId: roadmapId, factRevision: next, payload: { kind: 'revise', instructionVersion: next }, now }, r),
    ],
  });
}

// route 6: the learner answers the single focused question; planning resumes with the answer appended to their instruction.
export async function answerQuestion(db, access, { roadmapId, expectedRevision, actionKey, questionId, optionId, text, now = nowSeconds() }) {
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  // The question is found in any plan version of this roadmap, so a replay of an answer already given still resolves to the same text (and replays).
  const { results: versions } = await db.prepare('SELECT plan_json FROM learn_roadmap_plan_versions WHERE roadmap_id = ? ORDER BY version DESC').bind(roadmapId).all();
  const question = (versions || []).map(v => parse(v.plan_json)?.question).find(q => q && q.id === questionId);
  if (!question) throw new StateError('invalid_request', 'questionId', 400);
  const option = question.options.find(o => o.id === optionId);
  const answer = typeof text === 'string' && text.trim() ? text.trim() : option?.label;
  if (!answer || answer.length > 1000) throw new StateError('invalid_request', 'an answer is required', 400);
  // A language answer fixes the language so the same question is not asked again.
  const extra = question.kind === 'language' && option ? r => [db.prepare(`UPDATE learn_roadmaps SET language = ? WHERE id = ? AND ${r.and}`).bind(option.label, roadmapId, ...r.binds)] : undefined;
  return requestPlan(db, access, { roadmapId, expectedRevision, actionKey, operation: 'answer_question', text: answer, origin: 'answer', from: WAITING, now, extra });
}

// route 7: revise through the ToC conversation. Depth alone applies to an accepted roadmap at once (no new plan); an instruction edit makes a new
// plan version that needs acceptance, which is possible before acceptance (questioning, proposed). An instruction edit on an accepted roadmap is
// refused (409 invalid_transition): see the open decision in docs/features/explain-on-canvas/contracts/r4-integration.md.
export async function revisePlan(db, access, { roadmapId, expectedRevision, actionKey, instruction, settings = {}, scope, now = nowSeconds() }) {
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  if (scope != null) throw new StateError('invalid_request', 'scope revision is not supported yet', 400);
  const text = typeof instruction === 'string' ? instruction.trim() : '';
  if (text.length > 1000 || (instruction != null && typeof instruction !== 'string')) throw new StateError('invalid_request', 'instruction', 400);
  if (settings.depth != null && !DEPTHS.includes(settings.depth)) throw new StateError('invalid_request', 'depth', 400);
  if (!text && !settings.depth) throw new StateError('invalid_request', 'nothing to revise', 400);
  if (!text) {
    // Depth only: the plan stands, the ceiling and the card prompts follow the new Depth.
    const depth = settings.depth;
    return applyRoadmapAction(db, access, {
      operation: 'set_depth', actionKey, roadmapId, expectedRevision, parts: [depth], now, outcome: { status: 200, body: { roadmapId, depth } },
      guard: { sql: "(SELECT state FROM learn_roadmaps WHERE id = ?) IN ('proposed', 'active', 'paused') AND ? >= (SELECT delivered_count FROM learn_roadmaps WHERE id = ?)", binds: [roadmapId, ceilingFor(depth), roadmapId] },
      statements: r => [db.prepare(`UPDATE learn_roadmaps SET depth = ?, ceiling = ? WHERE id = ? AND ${r.and}`).bind(depth, ceilingFor(depth), roadmapId, ...r.binds)],
    });
  }
  if (!REVISABLE.includes(roadmap.state)) throw Object.assign(new StateError('invalid_transition', 'This changes an accepted plan.', 409), { reply: { code: 'invalid_transition', currentRevision: roadmap.revision, currentProposalVersion: null } });
  return requestPlan(db, access, { roadmapId, expectedRevision, actionKey, operation: 'revise_plan', text, origin: 'revise', settings, from: REVISABLE, now });
}

export { newId };
