// R4 integration glue: compose(roadmap, step) for Propose next step (roadmap-lifecycle.js proposeNextStep).
// READING OF R4.04 / R4.10 / R4.12: the proposal is the plan step the learner already accepted as part of the plan: its validated title, goal and format
// (no price, no invented link: validatePlan checked those). Composing it needs no model call in R4, so there is none, and no `roadmap_proposal`
// role is registered for R4; a model-written proposal, and a safety screen of the proposal's own words, are the later R5/R6 change. The content
// hash binds the proposal to the exact step, passage, scope fingerprint, Depth and latest instruction version, so changed input is a changed hash.
import { sha256 } from './roadmap-money.js';

// -> { format, title, description, contentHash, state: 'pending' }  (offerProposal's input)
export async function composeProposal(db, roadmap, step) {
  const latest = await db.prepare('SELECT MAX(version) AS v FROM learn_roadmap_instructions WHERE roadmap_id = ?').bind(roadmap.id).first();
  const contentHash = await sha256(JSON.stringify([step.id, step.title, step.goal, step.format, step.passage_start, step.passage_end, roadmap.scope_fingerprint, roadmap.depth, latest?.v ?? 1]));
  return { format: step.format, title: step.title, description: step.goal, contentHash, state: 'pending' };
}
