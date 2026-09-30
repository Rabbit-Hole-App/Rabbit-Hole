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
// HISTORY_TURNS messages oldest first as the model's history, then the learner's turn.
export async function threadTurns(db, threadId, seed, userText) {
  if (seed.length) await db.batch(seed.map(turn => db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)').bind(threadId, turn.role, turn.content)));
  const { results: history } = await db.prepare(
    `SELECT role, content FROM messages WHERE thread_id = ? ORDER BY id DESC LIMIT ${HISTORY_TURNS}`
  ).bind(threadId).all();
  history.reverse();
  await db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)').bind(threadId, 'user', userText).run();
  return history;
}
