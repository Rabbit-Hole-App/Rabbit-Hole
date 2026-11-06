// The RoadmapView every status and mutating response carries (contracts/api.md 3 and 6). Polling is metadata only: no generated text, table cells,
// answer keys, storage locations, result bodies, prices, costs, tokens, model names or internal error text. After acceptance `results[]` lists the
// slots with their state dimensions; the body comes only from the entitled result routes. Built from D1 on every read, so a reload and a second
// device see the same state.
import { readRoadmap, readUnfinishedRoadmap } from './roadmap-store.js';
import { d1PublicRefs } from './roadmap-source-read.js';

// R5: an existing-card link on the offered proposal. A database without migration 0041 simply has none.
const linkOf = async (db, offered) => { try { const l = await db.prepare('SELECT card_id, reason, origin FROM learn_proposal_links WHERE proposal_id = ? AND proposal_version = ?').bind(offered.id, offered.version).first(); return l ? { cardId: l.card_id, reason: l.reason, origin: l.origin } : null; } catch { return null; } };

const iso = seconds => new Date(seconds * 1000).toISOString();
const json = text => { try { return JSON.parse(text); } catch { return null; } };
// The learner sentence for a terminal card failure is the contract fixture's wording (status-failed-card). Other failure classes surface only
// their code until the owner approves more strings; the UI maps codes.
export const FAILURE_MESSAGE = 'This explanation could not be made. You were not charged.';

export async function roadmapView(db, access, roadmap) {
  if (!roadmap) return null;
  const id = roadmap.id;
  const first = await db.prepare('SELECT text FROM learn_roadmap_instructions WHERE roadmap_id = ? ORDER BY version ASC LIMIT 1').bind(id).first();
  const planRow = await db.prepare('SELECT * FROM learn_roadmap_plan_versions WHERE roadmap_id = ? AND version = ?').bind(id, roadmap.plan_version).first();
  const plan = planRow ? json(planRow.plan_json) : null;
  const { results: stepRows } = await db.prepare('SELECT * FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? ORDER BY position').bind(id, roadmap.plan_version).all();
  const scopeJson = json(roadmap.scope_json) || {};
  const sourceName = scopeJson.sourceName || '';
  // R3's reference for each step, minted at Accept plan (roadmap-source-refs.js); null where none was minted.
  const refs = await d1PublicRefs({ LEARN_DB: db }, access, (stepRows || []).map(s => s.source_ref_id));
  // Polling never carries source text (api.md): where R3's table exists the reference's anchor holds the passage quote, so the view keeps only identity and source; the delivered card carries the full reference.
  for (const [key, ref] of refs) if (ref) refs.set(key, { v: ref.v, id: ref.id, kind: ref.kind, source: ref.source });
  const steps = (stepRows || []).map(s => ({ id: s.id, position: s.position, title: s.title, goal: s.goal, format: s.format, passage: { start: s.passage_start, end: s.passage_end }, sourceRef: refs.get(s.source_ref_id) ?? null, state: s.state,
    ...(s.card_removed ? { cardRemoved: true } : {}), ...(s.answered ? { answered: true } : {}) }));
  const offered = await db.prepare("SELECT * FROM learn_step_proposals WHERE roadmap_id = ? AND state IN ('checking', 'held', 'pending') ORDER BY created_at DESC LIMIT 1").bind(id).first();
  const position = offered ? steps.find(s => s.id === offered.step_id)?.position : null;
  const link = offered ? await linkOf(db, offered) : null;
  const proposal = offered && {
    id: offered.id, stepId: offered.step_id, version: offered.version, state: offered.state, title: offered.title, description: offered.description, format: offered.format,
    sourceRelation: { kind: 'from', source: { key: roadmap.source_key, rev: roadmap.source_rev, name: sourceName }, sourceRef: steps.find(s => s.id === offered.step_id)?.sourceRef ?? null }, position: { index: position ?? null, total: steps.length }, acceptable: offered.state === 'pending' && !offered.stale && roadmap.state === 'active',
    ...(link ? { link } : {}),
  };
  const { results: resultRows } = await db.prepare(`SELECT r.* FROM learn_step_results r WHERE r.roadmap_id = ? AND r.decision = 'accepted' ORDER BY r.created_at, r.slot_index`).bind(id).all();
  const results = (resultRows || []).map(r => {
    const failed = r.generation === 'failed' || (r.billing === 'refunded' && r.delivery === 'not_delivered');
    return { id: r.id, stepId: r.step_id, proposalVersion: r.proposal_version, slot: { index: r.slot_index, cardId: r.card_id }, generation: r.generation, delivery: r.delivery, billing: r.billing,
      ...(r.billing === 'zero_priced' && r.body_json == null ? { existingCard: true } : {}), // R5: a linked card, delivered at acceptance
      ...(r.generation === 'generated' && r.validation !== 'passed' && !failed ? { held: true } : {}),
      ...(failed ? { failure: { code: 'generation_failed', message: FAILURE_MESSAGE }, recovery: ['retry', 'replace', 'omit'] } : {}) };
  });
  const quiet = !offered && results.every(r => r.delivery !== 'not_delivered' || r.generation === 'failed');
  const next = steps.some(s => s.state === 'planned');
  const busy = results.some(r => r.generation === 'pending' || r.generation === 'generating');
  return {
    roadmap: { id, boardId: roadmap.board_id, state: roadmap.state, revision: roadmap.revision, planVersion: roadmap.plan_version, acceptedPlanVersion: roadmap.accepted_plan_version ?? null, depth: roadmap.depth,
      practiceMode: roadmap.practice_mode, instruction: first?.text ?? '', language: roadmap.language, scope: { kind: scopeJson.kind || 'whole', chars: scopeJson.chars ?? null, source: { key: roadmap.source_key, rev: roadmap.source_rev, name: sourceName }, fingerprint: roadmap.scope_fingerprint },
      ceiling: roadmap.ceiling, deliveredCount: roadmap.delivered_count, mode: roadmap.mode, modeRevision: roadmap.mode_revision, createdAt: iso(roadmap.created_at), updatedAt: iso(roadmap.updated_at) },
    question: plan?.question ?? null, limitation: plan?.limitation ?? null,
    plan: plan && { version: roadmap.plan_version, outcome: plan.outcome, assumptions: plan.assumptions ?? [], formats: plan.formats ?? [], steps, stoppingPoint: plan.stoppingPoint },
    steps, proposal: proposal ?? null, results,
    nextStepReady: !!proposal?.acceptable && quiet,
    poll: { afterMs: busy || roadmap.state === 'draft' ? 1500 : proposal ? 2000 : next ? 5000 : 10000, etag: `rv-${roadmap.revision}`, ...(roadmap.state === 'completed' || roadmap.state === 'ended' ? { afterMs: 30000 } : {}) },
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
