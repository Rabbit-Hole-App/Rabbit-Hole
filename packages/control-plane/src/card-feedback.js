// Card feedback store (Explain-on-Canvas roadmap R1; learn-migrations/0036): one private up/down value per learner, canvas, board
// and generated card in learn_card_feedback. Never written into the board's card JSON, so a share, fork or duplicate cannot
// carry it. The card must exist on the learner's own saved board and be a generated card (web/src/card-feedback.js, the rule the
// canvas draws its control by). Clearing deletes the row. A deleted card's row stays (undoing the delete restores the rating)
// and is not read: list() answers only cards that are on the saved board now, so Progress never names a card it cannot open.
import { isFeedbackCard, validFeedback } from '../../web/src/card-feedback.js';

const CARD = /^[A-Za-z0-9_-]{1,100}$/;
export class FeedbackError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

// The learner's saved board blocks (learn_boards, as learn-boards.js ownerRow reads it); null when the board is not saved.
async function savedBlocks(env, actor, email) {
  if (!email) return null;
  const row = await env.LEARN_DB.prepare('SELECT state_json FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = ?').bind(actor.org, email, actor.app, actor.board).first();
  return row ? JSON.parse(row.state_json || '{}').blocks || [] : null;
}

const key = actor => [actor.org, actor.userId, actor.app, actor.board];

/** Set (up or down) or clear (null) the learner's rating of one generated card. -> { cardId, value } */
export async function setCardFeedback(env, actor, email, { cardId, value } = {}, { now = () => new Date().toISOString() } = {}) {
  if (typeof cardId !== 'string' || !CARD.test(cardId)) throw new FeedbackError('invalid_card', 400);
  if (value === undefined || !validFeedback(value)) throw new FeedbackError('invalid_value', 400);
  if (value === null) { // clearing needs no card: it only deletes the learner's own row
    await env.LEARN_DB.prepare('DELETE FROM learn_card_feedback WHERE org = ? AND owner_user_id = ? AND app = ? AND board = ? AND card_id = ?').bind(...key(actor), cardId).run();
    return { cardId, value: null };
  }
  const block = (await savedBlocks(env, actor, email))?.find(b => b?.id === cardId);
  if (!block) throw new FeedbackError('unknown_card', 404);
  if (!isFeedbackCard(block)) throw new FeedbackError('not_rateable', 400);
  await env.LEARN_DB.prepare('INSERT INTO learn_card_feedback (org, owner_user_id, app, board, card_id, value, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (org, owner_user_id, app, board, card_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(...key(actor), cardId, value, now()).run();
  return { cardId, value };
}

/** The learner's ratings of cards that are on the saved board now, oldest change first. -> [{ cardId, value, title }] */
export async function listCardFeedback(env, actor, email) {
  const { results } = await env.LEARN_DB.prepare('SELECT card_id, value FROM learn_card_feedback WHERE org = ? AND owner_user_id = ? AND app = ? AND board = ? ORDER BY updated_at, card_id').bind(...key(actor)).all();
  if (!results.length) return [];
  const blocks = new Map(((await savedBlocks(env, actor, email)) || []).map(b => [b?.id, b]));
  return results.filter(row => isFeedbackCard(blocks.get(row.card_id)))
    .map(row => ({ cardId: row.card_id, value: row.value, title: String(blocks.get(row.card_id).title || '').slice(0, 200) }));
}
