// PUT /api/learn/chat/messages/:messageId/syllabus { goal?, topics } -> { syllabus } (chat-workspace-CONTRACT.md B6):
// the learner's edit of a Tutor syllabus, saved over that answer's meta.syllabus in chat_message_meta. Validated as the
// trailer is (chat-modes.js validateSyllabus: the journey path shape), refs drawn only from that answer's own refs. Only the
// owner of the message's thread may write it; anything else is a 404. LEARN_DB only.
import { repositoryIdentity } from './repositories.js';
import { validateSyllabus } from './chat-modes.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const PATH = /^\/api\/learn\/chat\/messages\/(\d{1,15})\/syllabus$/;

// null when the path is not this route, so the dispatcher can try the next one.
export async function chatSyllabusFetch(req, env, deps = {}) {
  const url = new URL(req.url), match = url.pathname.match(PATH);
  if (!match) return null;
  if (req.method !== 'PUT') return json({ error: 'PUT required' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  const user = await (deps.identity || repositoryIdentity)(req, env);
  if (user instanceof Response) return user;
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const db = env.LEARN_DB;
  const row = await db.prepare("SELECT mm.meta_json FROM chat_message_meta mm JOIN threads t ON t.id = mm.thread_id WHERE mm.message_id = ? AND mm.role = 'assistant' AND t.org = ? AND t.user = ?")
    .bind(Number(match[1]), user.org, user.email).first();
  const meta = row && JSON.parse(row.meta_json);
  if (!meta?.syllabus) return json({ error: 'Syllabus not found' }, 404);
  const checked = validateSyllabus({ goal: body?.goal ?? meta.syllabus.goal, topics: body?.topics }, meta.contextRefs, meta.syllabus.journeyId ?? null);
  if (!checked.ok) return json({ error: checked.errors.slice(0, 3).join('; ') }, 400);
  await db.prepare('UPDATE chat_message_meta SET meta_json = ? WHERE message_id = ?').bind(JSON.stringify({ ...meta, syllabus: checked.value }), Number(match[1])).run();
  return json({ syllabus: checked.value });
}
