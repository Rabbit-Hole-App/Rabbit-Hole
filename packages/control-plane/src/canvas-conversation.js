import { HISTORY_TURNS } from './learn-models.js';

// A new canvas branch starts with only its own displayed question and answer.
// These are conversation text, never trusted source evidence or instructions.
export function canvasSeed(body, conversation = 'learn') {
  if (body.canvas_seed === undefined) return [];
  if (conversation !== 'learn' || body.thread_id) throw new Error('Canvas context is only accepted for a new Learn conversation');
  const seed = body.canvas_seed;
  if (!seed || typeof seed.question !== 'string' || !seed.question.trim() || seed.question.length > 4000
    || typeof seed.answer !== 'string' || !seed.answer.trim() || seed.answer.length > 32000) {
    throw new Error('Canvas conversation requires a question (up to 4000 characters) and answer (up to 32000 characters)');
  }
  return [{ role: 'user', content: seed.question }, { role: 'assistant', content: seed.answer }];
}

// One chat turn's storage, shared by apiAsk and repositoryAsk: the seed (if any), then the last
// HISTORY_TURNS messages oldest first as the model's history, then the learner's turn. The stored
// user message's id rides on the returned list as userMessageId.
// A regeneration (B5) passes its turn's stored user message as `before`: history is what came before
// it, and no user message is inserted. Superseded alternatives never count: of a turn's answers, only
// the newest is history (chat_message_meta.alternative_of; without learn migration 0019 there are none).
export async function threadTurns(db, threadId, seed, userText, before = null) {
  if (seed.length) await db.batch(seed.map(turn => db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)').bind(threadId, turn.role, turn.content)));
  const where = `m.thread_id = ?${before ? ' AND m.id < ?' : ''}`, params = before ? [threadId, before] : [threadId];
  const recent = sql => db.prepare(`SELECT m.role, m.content FROM messages m WHERE ${where}${sql} ORDER BY m.id DESC LIMIT ${HISTORY_TURNS}`).bind(...params).all();
  let history;
  try {
    ({ results: history } = await recent(` AND NOT EXISTS (SELECT 1 FROM chat_message_meta x WHERE x.message_id > m.id AND x.alternative_of = COALESCE((SELECT a.alternative_of FROM chat_message_meta a WHERE a.message_id = m.id), m.id))`));
  } catch { ({ results: history } = await recent('')); }
  history.reverse();
  if (before) return Object.assign(history, { userMessageId: before });
  const row = await db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?) RETURNING id').bind(threadId, 'user', userText).first();
  return Object.assign(history, { userMessageId: row?.id ?? null });
}
