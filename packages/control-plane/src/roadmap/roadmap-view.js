// The RoadmapView every status and mutating response carries (contracts/api.md 3 and 6). Polling is metadata only: no generated text, table cells,
// answer keys, storage locations, result bodies, prices, costs, tokens, model names or internal error text. After acceptance `results[]` lists the
// slots with their state dimensions; the body comes only from the entitled result routes. Built from D1 on every read, so a reload and a second
// device see the same state.
import { readRoadmap, readUnfinishedRoadmap } from './roadmap-store.js';
import { tutorThreadOf } from './roadmap-lifecycle.js';
import { withheldCause } from './roadmap-check.js';
import { d1PublicRefs } from './roadmap-source-read.js';
import { STRINGS } from '../../../web/src/roadmap-strings.js';

// R5: an existing-card link on the offered proposal. A database without migration 0041 simply has none.
const linkOf = async (db, offered) => { try { const l = await db.prepare('SELECT card_id, reason, origin FROM learn_proposal_links WHERE proposal_id = ? AND proposal_version = ?').bind(offered.id, offered.version).first(); return l ? { cardId: l.card_id, reason: l.reason, origin: l.origin } : null; } catch { return null; } };

const iso = seconds => new Date(seconds * 1000).toISOString();
const json = text => { try { return JSON.parse(text); } catch { return null; } };
// The learner sentence for a terminal card failure is the contract fixture's wording (status-failed-card). Other failure classes surface only
// their code until the owner approves more strings; the UI maps codes.
export const FAILURE_MESSAGE = 'This explanation could not be made. You were not charged.';
// A held or refused card (failure class policy_block, refunded) tells the learner why in the S26 sentence; the learner's own signs of danger (the safety record's
// pause_support action) get the S27 supportive message instead. Both are DRAFT strings pending owner approval.
// Fix A: the cause is read from the stored checks, so a row an earlier build stored as policy_block for a grounding block reads honestly too.
// No recovery set (owner 2026-11-06: no Retry, Replace or Omit on explanation cards): a failed card closes its step and the roadmap moves on.
const SOURCE_MESSAGE = { quote_not_in_passage: STRINGS.notInSource, contradicts_source: STRINGS.contradictsSource };
const WITHHELD = new Set(['policy_block', 'terminal_validation_failure', 'checking_unavailable']);
function failureOf(r) {
  const check = WITHHELD.has(r.failure_class) && r.validation !== 'passed' ? json(r.check_json) : null;
  const cause = check ? withheldCause(check) : r.failure_class === 'policy_block' ? 'safety' : null;
  if (cause === 'personal_risk') return { failure: { code: 'personal_risk', message: STRINGS.personalRisk } };
  if (cause === 'safety') return { failure: { code: 'policy_block', message: STRINGS.safetyLimit } };
  if (cause === 'source') return { failure: { code: 'source_check_failed', message: SOURCE_MESSAGE[check.grounding.reason] || STRINGS.notMatchedToSource } };
  if (cause === 'unavailable') return { failure: { code: 'checking_unavailable', message: STRINGS.checkUnavailable } };
  return { failure: { code: 'generation_failed', message: FAILURE_MESSAGE } };
}

// Contract 4: one lifecycle stage per step and per accepted result (the client adds `accepting` and its own save-before-ack `saving`).
const resultStage = r => (r.generation === 'failed' || (r.billing === 'refunded' && r.delivery === 'not_delivered') ? 'failed'
  : r.delivery !== 'not_delivered' ? 'ready' : r.generation === 'generated' ? (r.validation === 'passed' ? 'saving' : 'checking')
  : r.validation === 'checking' ? 'checking' : 'generating');
const STEP_STAGE = { planned: 'planned', proposed: 'proposed', delivered: 'ready', skipped: 'skipped', cancelled: 'cancelled', incomplete: 'failed', already_understood: 'skipped' };
const planShape = (version, plan, steps, settings) => ({ version, outcome: plan.outcome, assumptions: plan.assumptions ?? [], formats: plan.formats ?? [], steps, stoppingPoint: plan.stoppingPoint,
  ...(plan.sourceCoverage ? { sourceCoverage: plan.sourceCoverage } : {}), settings });

export async function roadmapView(db, access, roadmap) {
  if (!roadmap) return null;
  const id = roadmap.id;
  const first = await db.prepare('SELECT text FROM learn_roadmap_instructions WHERE roadmap_id = ? ORDER BY version ASC LIMIT 1').bind(id).first();
  const lastInstruction = (await db.prepare('SELECT MAX(version) AS v FROM learn_roadmap_instructions WHERE roadmap_id = ?').bind(id).first())?.v ?? 1;
  // Contract 5: the accepted plan drives the ToC (`plan`/`steps`, and `acceptedPlan`); the newest unaccepted version is the Chat `draft`.
  const active = roadmap.accepted_plan_version ?? roadmap.plan_version;
  const rowOf = version => db.prepare('SELECT * FROM learn_roadmap_plan_versions WHERE roadmap_id = ? AND version = ?').bind(id, version).first();
  const planRow = await rowOf(active);
  const plan = planRow ? json(planRow.plan_json) : null;
  const draftRow = roadmap.plan_version !== roadmap.accepted_plan_version ? (roadmap.plan_version === active ? planRow : await rowOf(roadmap.plan_version)) : null;
  const draftPlan = draftRow ? json(draftRow.plan_json) : null;
  const { results: stepRows } = await db.prepare('SELECT * FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? ORDER BY position').bind(id, active).all();
  const scopeJson = json(roadmap.scope_json) || {};
  const sourceName = scopeJson.sourceName || '';
  const threadId = await tutorThreadOf(db, roadmap); // every device shows the roadmap in this Chat thread; null: none bound, or it was deleted
  // The invitation the roadmap was made from (null: none), so the client binds THIS roadmap's invitation thread, never an older roadmap's.
  const invitationId = (await db.prepare('SELECT id FROM learn_roadmap_invitations WHERE roadmap_id = ? AND org = ? AND owner_user_id = ? LIMIT 1').bind(id, roadmap.org, roadmap.owner_user_id).first())?.id ?? null;
  const { results: resultRows } = await db.prepare(`SELECT r.*, p.title AS p_title, p.description AS p_description, p.format AS p_format FROM learn_step_results r
    LEFT JOIN learn_step_proposals p ON p.id = r.proposal_id AND p.version = r.proposal_version WHERE r.roadmap_id = ? AND r.decision = 'accepted' ORDER BY r.created_at, r.slot_index`).bind(id).all();
  // R3's reference for each step, minted at Accept plan (roadmap-source-refs.js); null where none was minted.
  const refs = await d1PublicRefs({ LEARN_DB: db }, access, (stepRows || []).map(s => s.source_ref_id));
  // Polling never carries source text (api.md): the reference keeps identity and source only. The verified excerpt is read through the entitled reference (canvas-to-be-1 answer).
  for (const [key, ref] of refs) if (ref) refs.set(key, { v: ref.v, id: ref.id, kind: ref.kind, source: ref.source });
  const latestResult = new Map((resultRows || []).map(r => [r.step_id, r]));
  const steps = (stepRows || []).map(s => ({ id: s.id, position: s.position, title: s.title, goal: s.goal, format: s.format, passage: { start: s.passage_start, end: s.passage_end }, sourceRef: refs.get(s.source_ref_id) ?? null, state: s.state,
    stage: s.state === 'generating' ? (latestResult.has(s.id) ? resultStage(latestResult.get(s.id)) : 'generating') : STEP_STAGE[s.state] ?? s.state,
    ...(s.card_removed ? { cardRemoved: true } : {}), ...(s.answered ? { answered: true } : {}) }));
  const stepOf = stepId => steps.find(s => s.id === stepId);
  const offered = await db.prepare("SELECT * FROM learn_step_proposals WHERE roadmap_id = ? AND state IN ('checking', 'held', 'pending') ORDER BY created_at DESC LIMIT 1").bind(id).first();
  const position = offered ? stepOf(offered.step_id)?.position : null;
  const link = offered ? await linkOf(db, offered) : null;
  const proposal = offered && {
    id: offered.id, stepId: offered.step_id, version: offered.version, state: offered.state, stage: 'proposed', title: offered.title, description: offered.description, format: offered.format,
    sourceRelation: { kind: 'from', source: { key: roadmap.source_key, rev: roadmap.source_rev, name: sourceName }, sourceRef: stepOf(offered.step_id)?.sourceRef ?? null }, position: { index: position ?? null, total: steps.length }, acceptable: offered.state === 'pending' && !offered.stale && roadmap.state === 'active',
    ...(link ? { link } : {}),
  };
  const isFailed = r => r.generation === 'failed' || (r.billing === 'refunded' && r.delivery === 'not_delivered');
  const results = (resultRows || []).map(r => {
    const failed = isFailed(r);
    // canvas-to-be-1: the accepted proposal version's own words, so an applied Edit card survives a reload.
    return { id: r.id, stepId: r.step_id, proposalVersion: r.proposal_version, slot: { index: r.slot_index, cardId: r.card_id }, generation: r.generation, delivery: r.delivery, billing: r.billing, stage: resultStage(r),
      title: r.p_title ?? null, description: r.p_description ?? null, format: r.p_format ?? null,
      ...(r.billing === 'zero_priced' && r.body_json == null ? { existingCard: true } : {}), // R5: a linked card, delivered at acceptance
      ...(r.generation === 'generated' && r.validation !== 'passed' && !failed ? { held: true } : {}),
      ...(failed ? failureOf(r) : {}) };
  });
  // Next step ready: an acceptable pending proposal that follows a delivery, with no earlier work still in flight (the offered proposal is not in `results`).
  const settled = results.some(r => r.delivery === 'delivered') && (resultRows || []).every(r => r.delivery !== 'not_delivered' || isFailed(r));
  const next = steps.some(s => s.state === 'planned');
  const busy = results.some(r => r.generation === 'pending' || r.generation === 'generating');
  // A requested revision not yet planned: the shown draft is stale and its acceptance is refused (409 stale_draft).
  const revisionPending = !['completed', 'ended', 'failed'].includes(roadmap.state) && lastInstruction > ((draftRow ?? planRow)?.instruction_version ?? lastInstruction);
  const keptNow = (stepRows || []).filter(s => !['planned', 'proposed'].includes(s.state)).length;
  const draft = draftPlan && planShape(roadmap.plan_version, draftPlan, (draftPlan.steps || []).map((s, i) => ({ position: i + 1, title: s.title, goal: s.goal, format: s.format, passage: s.passage })), { depth: draftPlan.settings?.depth ?? roadmap.depth });
  if (draft) Object.assign(draft, { instructionVersion: draftRow.instruction_version, acceptable: !!draft.steps.length && !revisionPending && !draftPlan.question && !draftPlan.limitation
    && (roadmap.state === 'proposed' || (['active', 'paused'].includes(roadmap.state) && (draftPlan.keptSteps ?? 0) === keptNow)) });
  const acceptedPlan = roadmap.accepted_plan_version && plan ? planShape(active, plan, steps, { depth: plan.settings?.depth ?? roadmap.depth }) : null;
  const shown = draftPlan ?? plan;
  // A blocked card offer (roadmap-lifecycle.js recordOfferBlocked), shown only while its step still waits with no offer: the Chat recovery entry's one question or help.
  const held = scopeJson.offerRecovery, blockedStep = held && stepOf(held.stepId);
  const offerRecovery = held && !proposal && blockedStep && ['planned', 'cancelled', 'incomplete'].includes(blockedStep.state) && ['active', 'paused'].includes(roadmap.state)
    ? { stepId: held.stepId, reason: held.reason, ...(held.question ? { question: held.question } : {}), ...(held.help ? { help: held.help } : {}), ...(held.alternative ? { alternative: held.alternative } : {}) } : null;
  return {
    roadmap: { id, boardId: roadmap.board_id, state: roadmap.state, revision: roadmap.revision, planVersion: roadmap.plan_version, acceptedPlanVersion: roadmap.accepted_plan_version ?? null, depth: roadmap.depth,
      practiceMode: roadmap.practice_mode, instruction: first?.text ?? '', language: roadmap.language, scope: { kind: scopeJson.kind || 'whole', chars: scopeJson.chars ?? null, source: { key: roadmap.source_key, rev: roadmap.source_rev, name: sourceName }, fingerprint: roadmap.scope_fingerprint },
      ceiling: roadmap.ceiling, deliveredCount: roadmap.delivered_count, mode: roadmap.mode, modeRevision: roadmap.mode_revision, threadId, invitationId, createdAt: iso(roadmap.created_at), updatedAt: iso(roadmap.updated_at) },
    question: shown?.question ?? null, limitation: shown?.limitation ?? null, offerRecovery,
    plan: plan && planShape(active, plan, steps, { depth: plan.settings?.depth ?? roadmap.depth }),
    acceptedPlan, planDraft: draft ?? null, revisionPending, // planDraft, not `draft`: the R5 proposal-draft route already answers `draft`
    steps, proposal: proposal ?? null, results,
    nextStepReady: !!proposal?.acceptable && settled,
    poll: { afterMs: busy || roadmap.state === 'draft' || revisionPending ? 1500 : proposal ? 2000 : next ? 5000 : 10000, etag: `rv-${roadmap.revision}${threadId ? `-${threadId.slice(-12)}` : ''}`, ...(roadmap.state === 'completed' || roadmap.state === 'ended' ? { afterMs: 30000 } : {}) },
  };
}

export async function currentView(db, access, roadmapId = null) {
  const row = roadmapId ? await readRoadmap(db, access, roadmapId) : await readUnfinishedRoadmap(db, access);
  return roadmapView(db, access, row);
}

// Route 19: the board's ended and completed roadmaps for the ToC history. Metadata only: no source text, no card bodies.
export async function roadmapHistory(db, access) {
  const { results } = await db.prepare("SELECT * FROM learn_roadmaps WHERE org = ? AND owner_user_id = ? AND board_id = ? AND state IN ('ended', 'completed') ORDER BY updated_at DESC LIMIT 20").bind(access.org, access.actorUserId, access.boardId).all();
  const out = [];
  for (const r of results || []) {
    const first = await db.prepare('SELECT text FROM learn_roadmap_instructions WHERE roadmap_id = ? ORDER BY version ASC LIMIT 1').bind(r.id).first();
    out.push({ id: r.id, state: r.state, instruction: first?.text ?? '', deliveredCount: r.delivered_count, depth: r.depth, source: { name: json(r.scope_json)?.sourceName || '' }, endedAt: r.ended_at ? iso(r.ended_at) : null, updatedAt: iso(r.updated_at) });
  }
  return { roadmaps: out };
}
