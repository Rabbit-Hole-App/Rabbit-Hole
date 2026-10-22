// PUT /api/learn/chat/messages/:messageId/proposal { settings } -> { proposal } (UI-15, MOT-20): settings changed on a generation
// proposal card (Motion: its duration), saved over that answer's meta.proposal as its next version, validated per command and
// signed again for the learner (generation-proposal.js reviseSettings). No model call: the stored proposal is the one revised,
// never one the browser sends. Only the owner of the message's thread may write it; anything else is a 404. LEARN_DB only.
// MOT-22: the body names the revision it was made from ({settings, expected_version}); only the published current revision
// changes, through the proposal's one state (generation-proposal.js saveRevision). A save from an older revision, one that lost
// a race with another tab, a chat refinement or a Generate, or one after it made its video is a 409 with the current proposal,
// never applied, so the browser keeps the learner's choice beside the latest.
import { repositoryIdentity } from './repositories.js';
import { PROPOSAL_STALE, proposalRecord, proposalUsedText, reviseSettings, saveRevision } from './generation-proposal.js';

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
  const id = Number(match[1]);
  const row = await db.prepare("SELECT mm.meta_json, t.scope_ref FROM chat_message_meta mm JOIN threads t ON t.id = mm.thread_id WHERE mm.message_id = ? AND mm.role = 'assistant' AND t.org = ? AND t.user = ?")
    .bind(id, user.org, user.email).first();
  const meta = row && JSON.parse(row.meta_json);
  if (!meta?.proposal) return json({ error: 'Proposal not found' }, 404);
  if (!Number.isSafeInteger(body?.expected_version)) return json({ error: 'expected_version (the revision this change was made from) is required' }, 400);
  const record = await proposalRecord(db, user.email, row.scope_ref, meta.proposal.proposal_id);
  const conflict = async (code, error) => { const now = await proposalRecord(db, user.email, row.scope_ref, meta.proposal.proposal_id); return json({ error, code, current: now.current, current_message_id: now.currentMessageId }, 409); };
  if (record.state?.used) return conflict('proposal_used', proposalUsedText(meta.proposal.command));
  if (!record.state || record.state.sig !== meta.proposal.sig || record.state.version !== body.expected_version) return conflict('proposal_stale', PROPOSAL_STALE);
  const revised = await reviseSettings(env, meta.proposal, body.settings, user.email, { org: user.org, app: row.scope_ref });
  if (revised.error) return json({ error: revised.error }, 400);
  const saved = await saveRevision(db, record, { messageId: id, raw: row.meta_json, meta }, revised.proposal);
  return saved.conflict ? conflict('proposal_stale', 'This proposal changed in another tab or was just generated. Your choice was not saved.') : json({ proposal: saved.proposal });
}
