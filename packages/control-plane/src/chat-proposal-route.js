// PUT /api/learn/chat/messages/:messageId/proposal { settings } -> { proposal } (UI-15, MOT-20): settings changed on a generation
// proposal card (Motion: its duration), saved over that answer's meta.proposal as its next version, validated per command and
// signed again for the learner (generation-proposal.js reviseSettings). No model call: the stored proposal is the one revised,
// never one the browser sends. Only the owner of the message's thread may write it; anything else is a 404. LEARN_DB only.
import { repositoryIdentity } from './repositories.js';
import { reviseSettings } from './generation-proposal.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const PATH = /^\/api\/learn\/chat\/messages\/(\d{1,15})\/proposal$/;

// null when the path is not this route, so the dispatcher can try the next one.
export async function chatProposalFetch(req, env, deps = {}) {
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
  if (!meta?.proposal) return json({ error: 'Proposal not found' }, 404);
  const revised = await reviseSettings(env, meta.proposal, body?.settings, user.email);
  if (revised.error) return json({ error: revised.error }, 400);
  await db.prepare('UPDATE chat_message_meta SET meta_json = ? WHERE message_id = ?').bind(JSON.stringify({ ...meta, proposal: revised.proposal }), Number(match[1])).run();
  return json({ proposal: revised.proposal });
}
