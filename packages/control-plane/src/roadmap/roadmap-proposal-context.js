// R5.03 server side of "Add to Chat" for a proposal: a ContextRef { kind: 'proposal', sourceId: 'proposal:<id>', name, version: '<n>', range: null } names a proposal;
// the descriptive context is read HERE from the actor's own proposal row, never from browser-supplied text (chat-modes.js drops everything but the shape).
// Read-only: it can neither accept, charge nor rewrite the plan. It carries the proposal's title, description, format, position and source name, and
// nothing else: no draft, no instruction history, no answer key, no price. A ref for another learner's or board's proposal, an unknown id, or a version
// that is no longer the one the learner saw is refused (the turn is refused, naming nothing), exactly like an unreadable mentioned canvas.
import { roadmapView } from './roadmap-view.js';

export const PROPOSAL_ID = /^proposal:(pr_[0-9a-f]{24})$/;
export const PROPOSAL_UNAVAILABLE = 'That proposal is not available.';
const clean = text => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);

// user: { org, email, userId|user_id }; refs: the validated contextRefs; opts.boardId: the board the question is asked on, when the caller knows it.
// -> { text, refused: [sourceId] }
export async function proposalContext(env, user, refs, { boardId = null } = {}) {
  const out = { text: '', refused: [] }, blocks = [];
  const userId = user?.userId || user?.user_id;
  for (const ref of (refs || []).filter(r => r.kind === 'proposal')) {
    const id = PROPOSAL_ID.exec(String(ref.sourceId))?.[1];
    const row = id && userId ? await env.LEARN_DB.prepare('SELECT * FROM learn_step_proposals WHERE id = ? AND org = ? AND owner_user_id = ?').bind(id, user.org, userId).first() : null;
    const board = row && await env.LEARN_DB.prepare('SELECT id FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(row.board_id, user.org, user.email).first();
    if (!row || !board || (boardId && boardId !== row.board_id) || String(row.version) !== ref.version) { out.refused.push(ref.sourceId); continue; }
    const roadmap = await env.LEARN_DB.prepare('SELECT * FROM learn_roadmaps WHERE id = ?').bind(row.roadmap_id).first();
    const shown = roadmap && await roadmapView(env.LEARN_DB, { org: user.org, actorUserId: userId, boardId: row.board_id, actorEmail: user.email, boardOwnerEmail: user.email }, roadmap).catch(() => null);
    const step = shown?.steps?.find(s => s.id === row.step_id);
    blocks.push([`Proposed learning step (${row.state}${step ? `, step ${step.position} of ${shown.steps.length}` : ''}), attached by the learner:`, `Title: ${clean(row.title)}`, `What it would cover: ${clean(row.description)}`, `Format: ${row.format}`,
      `This is a proposal, not an explanation the learner has received. Accepting it is the learner's own action; do not say it was accepted, generated or charged.`].join('\n'));
  }
  out.text = blocks.join('\n\n');
  return out;
}
