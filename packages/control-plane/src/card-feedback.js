// Card feedback store (Explain-on-Canvas roadmap R1; learn-migrations/0036): one private up/down value per learner, canvas, board
// and generated card in learn_card_feedback, with a revision that counts up on every change. Never written into the board's card
// JSON, so a share, fork or duplicate cannot carry it. The card must exist on the learner's own saved board and be a generated card
// (web/src/card-feedback.js, the rule the canvas draws its control by, imported cards that look like a generated one included).
// Clearing keeps the row with a NULL value so the revision never goes back. A deleted card's row stays (undoing the delete restores
// the rating) and is not listed, so Progress never names a card it cannot open. Calls no model and touches no usage or billing table.
import { isFeedbackCard, validFeedback } from '../../web/src/card-feedback.js';

const CARD = /^[A-Za-z0-9_-]{1,100}$/;
export class FeedbackError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
// One answer for a card that is absent, not on the saved board, or not the caller's to reach: nothing says which (no existence oracle).
const NOT_AVAILABLE = () => new FeedbackError('not_available', 404);

// The learner's saved board blocks (learn_boards, as learn-boards.js ownerRow reads it); null when the board is not saved.
async function savedBlocks(env, actor, email) {
  if (!email) return null;
  const row = await env.LEARN_DB.prepare('SELECT state_json FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = ?').bind(actor.org, email, actor.app, actor.board).first();
  return row ? JSON.parse(row.state_json || '{}').blocks || [] : null;
}

const key = actor => [actor.org, actor.userId, actor.app, actor.board];
const WHERE = 'org = ? AND owner_user_id = ? AND app = ? AND board = ? AND card_id = ?';
const current = async (env, actor, cardId) => env.LEARN_DB.prepare(`SELECT value, revision, updated_at FROM learn_card_feedback WHERE ${WHERE}`).bind(...key(actor), cardId).first();

/** Set (up or down) or clear (null) the learner's rating of one generated card. -> { cardId, value, revision, updatedAt }
 *  Setting the value the row already holds changes nothing and returns its revision. */
export async function setCardFeedback(env, actor, email, { cardId, value } = {}, { now = () => new Date().toISOString() } = {}) {
  if (typeof cardId !== 'string' || !CARD.test(cardId)) throw new FeedbackError('invalid_card', 400);
  if (value === undefined || !validFeedback(value)) throw new FeedbackError('invalid_value', 400);
  const at = now();
  let changed;
  if (value === null) { // clearing needs no card: it only empties the learner's own row
    changed = await env.LEARN_DB.prepare(`UPDATE learn_card_feedback SET value = NULL, revision = revision + 1, updated_at = ? WHERE ${WHERE} AND value IS NOT NULL RETURNING revision, updated_at`).bind(at, ...key(actor), cardId).first();
  } else {
    const block = (await savedBlocks(env, actor, email))?.find(b => b?.id === cardId);
    if (!block) throw NOT_AVAILABLE();
    if (!isFeedbackCard(block)) throw new FeedbackError('not_rateable', 400);
    changed = await env.LEARN_DB.prepare('INSERT INTO learn_card_feedback (org, owner_user_id, app, board, card_id, value, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT (org, owner_user_id, app, board, card_id) DO UPDATE SET value = excluded.value, revision = revision + 1, updated_at = excluded.updated_at WHERE value IS NOT excluded.value RETURNING revision, updated_at')
      .bind(...key(actor), cardId, value, at).first();
  }
  const row = changed ?? await current(env, actor, cardId);
  return { cardId, value, revision: row?.revision ?? 0, updatedAt: row?.updated_at ?? null };
}

/** The learner's rows for cards that are on the saved board now (a cleared one has value null). -> [{ cardId, value, revision, title }] */
export async function listCardFeedback(env, actor, email) {
  const { results } = await env.LEARN_DB.prepare('SELECT card_id, value, revision FROM learn_card_feedback WHERE org = ? AND owner_user_id = ? AND app = ? AND board = ? ORDER BY updated_at, card_id').bind(...key(actor)).all();
  if (!results.length) return [];
  const blocks = new Map(((await savedBlocks(env, actor, email)) || []).map(b => [b?.id, b]));
  return results.filter(row => isFeedbackCard(blocks.get(row.card_id)))
    .map(row => ({ cardId: row.card_id, value: row.value, revision: row.revision, title: String(blocks.get(row.card_id).title || '').slice(0, 200) }));
}
