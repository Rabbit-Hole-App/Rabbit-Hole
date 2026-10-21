// PUT /api/learn/chat/messages/:messageId/outputs { outputs: [output] } -> { outputs } (UI changes brief sections 1 and 5):
// the cards a Chat prompt made, kept on that user message's meta.outputs in chat_message_meta (learn migration 0019; no new
// schema). Each output is upserted by cardId, so a retry or a refreshed snapshot never duplicates one. Only the owner of the
// message's thread may write it (threads are owner-only, canvases.js canvasRefusal); anything else is a 404, as the syllabus
// route answers (chat-syllabus-route.js). No model, executor or file call is made here.
import { repositoryIdentity } from './repositories.js';
import { checkOutput, mergeOutputs, OUTPUTS_MAX } from './chat-outputs.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const PATH = /^\/api\/learn\/chat\/messages\/(\d{1,15})\/outputs$/;
export { checkOutput, mergeOutputs, OUTPUTS_MAX, SNAPSHOT_MAX_BYTES } from './chat-outputs.js';

// null when the path is not this route, so the dispatcher can try the next one.
export async function chatOutputsFetch(req, env, deps = {}) {
  const url = new URL(req.url), match = url.pathname.match(PATH);
  if (!match) return null;
  if (req.method !== 'PUT') return json({ error: 'PUT required' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  const user = await (deps.identity || repositoryIdentity)(req, env);
  if (user instanceof Response) return user;
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!Array.isArray(body?.outputs) || !body.outputs.length || body.outputs.length > OUTPUTS_MAX) return json({ error: `Send 1-${OUTPUTS_MAX} outputs` }, 400);
  const checked = body.outputs.map(checkOutput), bad = checked.find(entry => entry.error);
  if (bad) return json({ error: bad.error }, 400);
  const db = env.LEARN_DB, id = Number(match[1]);
  let row;
  try {
    row = await db.prepare("SELECT mm.meta_json FROM chat_message_meta mm JOIN threads t ON t.id = mm.thread_id WHERE mm.message_id = ? AND mm.role = 'user' AND t.org = ? AND t.user = ?")
      .bind(id, user.org, user.email).first();
  } catch (error) { if (/no such table/i.test(error?.message || '')) return json({ error: 'Saving chat is not available here yet' }, 503); throw error; }
  if (!row) return json({ error: 'Message not found' }, 404);
  let meta = {};
  try { meta = JSON.parse(row.meta_json) || {}; } catch { /* a bad row keeps only what is written now */ }
  // ponytail: read-merge-write, so two concurrent PUTs for one message can lose one; the client sends them one at a time
  // (chat-outputs.js saveOutputs). A json_patch UPDATE closes that if writers multiply.
  const outputs = mergeOutputs(meta.outputs, checked.map(entry => entry.value));
  if (outputs.length > OUTPUTS_MAX) return json({ error: `A message keeps at most ${OUTPUTS_MAX} outputs` }, 400);
  await db.prepare('UPDATE chat_message_meta SET meta_json = ? WHERE message_id = ?').bind(JSON.stringify({ ...meta, outputs }), id).run();
  return json({ outputs });
}
