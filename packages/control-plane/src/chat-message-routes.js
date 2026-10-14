// Chat answer footer routes (agent-coordination/tasks/chat-workspace-CONTRACT.md B2, B5, B7): a person's thumbs on an
// assistant answer, and one stored alternative of a regenerated turn. LEARN_DB only: the message must sit in a thread
// (repository-schema.sql threads) whose org and user are the caller's, else 404 - another person's message and a missing
// one look the same. Served by the dev worker beside the canvas routes; the side tables come from learn migration 0019.
import { repositoryIdentity } from './repositories.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const REASON_MAX = 280;
const ROUTE = /^\/api\/learn\/chat\/messages\/(\d+)(\/feedback)?$/;
export const chatMessageRoute = path => ROUTE.test(path);

// { value: { rating, reason } } or { error }. null clears; a reason rides only with a rating, trimmed, empty = none.
export function validateFeedback(body) {
  if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'rating')) return { error: 'rating is required' };
  const { rating, reason } = body;
  if (rating !== null && rating !== 'up' && rating !== 'down') return { error: "rating must be 'up', 'down' or null" };
  if (reason !== undefined && reason !== null && typeof reason !== 'string') return { error: 'reason must be text' };
  const text = String(reason ?? '').trim();
  if (text.length > REASON_MAX) return { error: `reason must be at most ${REASON_MAX} characters` };
  return { value: { rating, reason: rating && text ? text : null } };
}

// The caller's own assistant message, or null.
const ownedAnswer = (db, id, user) => db.prepare("SELECT m.id, m.thread_id, m.content FROM messages m JOIN threads t ON t.id = m.thread_id WHERE m.id = ? AND m.role = 'assistant' AND t.org = ? AND t.user = ?").bind(id, user.org, user.email).first();

// One assistant message as B2 shapes it. A message with no meta row is an old one: kind 'answer', no actions, alone in its turn.
async function answerRecord(db, row, user) {
  const meta = await db.prepare('SELECT alternative_of, meta_json FROM chat_message_meta WHERE message_id = ?').bind(row.id).first();
  const fb = await db.prepare('SELECT rating, reason FROM chat_message_feedback WHERE message_id = ? AND user = ?').bind(row.id, user.email).first();
  let stored = {};
  try { stored = JSON.parse(meta?.meta_json || '{}') || {}; } catch { /* a bad row reads as an old message */ }
  const { kind = 'answer', ...rest } = stored;
  const first = meta?.alternative_of ?? row.id;
  const { results = [] } = await db.prepare('SELECT message_id FROM chat_message_meta WHERE thread_id = ? AND (message_id = ? OR alternative_of = ?) ORDER BY message_id').bind(row.thread_id, first, first).all();
  const alternatives = results.length ? results.map(r => String(r.message_id)) : [String(row.id)];
  return {
    messageId: String(row.id), role: 'assistant', content: row.content, kind,
    meta: { ...rest, alternativeOf: meta?.alternative_of != null ? String(meta.alternative_of) : null, alternatives, feedback: fb ? { rating: fb.rating, reason: fb.reason ?? null } : null },
  };
}

export async function chatMessageFetch(req, env) {
  const [, id, feedback] = new URL(req.url).pathname.match(ROUTE) || [];
  if (!id) return json({ error: 'Not found' }, 404);
  const user = await repositoryIdentity(req, env);
  if (user instanceof Response) return user;
  const db = env.LEARN_DB;
  try {
    if (!feedback) {
      if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const row = await ownedAnswer(db, Number(id), user);
      return row ? json(await answerRecord(db, row, user)) : json({ error: 'Message not found' }, 404);
    }
    if (req.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
    if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const checked = validateFeedback(body);
    if (checked.error) return json({ error: checked.error }, 400);
    if (!await ownedAnswer(db, Number(id), user)) return json({ error: 'Message not found' }, 404);
    const { rating, reason } = checked.value;
    if (rating === null) await db.prepare('DELETE FROM chat_message_feedback WHERE message_id = ? AND user = ?').bind(Number(id), user.email).run();
    else await db.prepare('INSERT INTO chat_message_feedback (message_id, user, rating, reason, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (message_id, user) DO UPDATE SET rating = excluded.rating, reason = excluded.reason, updated_at = excluded.updated_at')
      .bind(Number(id), user.email, rating, reason, new Date().toISOString()).run();
    return json({ rating, reason });
  } catch (error) { return json({ error: error.message }, 400); }
}
