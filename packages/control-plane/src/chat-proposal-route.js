// GET and PUT /api/learn/chat/messages/:messageId/proposal (UI-15, MOT-20, UI-15.1)
//   GET -> { proposal, message_id, used, references }: the owner's current revision of the proposal on that answer, with each
//   reference's state (ok, changed, deleted, inaccessible, unsupported) re-resolved now under the owner's own access
//   (generation-review-refs.js).
//   PUT { expected_version, settings?, description?, title?, references?, requirements?, assumptions?, missing_information?,
//   limitations? } -> { proposal, references }: an edit on a generation proposal card, saved over that answer's meta.proposal as its
//   next version, validated by the canonical schema and the review rules, and signed again for the learner (generation-proposal.js
//   reviseProposal). No model call: the stored proposal is the one revised, never one the browser sends. Only the owner of the
//   message's thread may read or write it; anything else is a 404. LEARN_DB only. Every accepted save is the next revision.
// MOT-22: the body names the revision it was made from ({..., expected_version}); only the published current revision changes,
// through the proposal's one state (generation-proposal.js saveRevision). A save from an older revision, one that lost a race with
// another tab, a chat refinement or a Generate, or one after it made its video is a 409 with the current proposal, never applied, so
// the browser keeps the learner's draft beside the latest. A refused edit is a 400 with the words and the paths (errors), and the
// browser keeps the draft.
import { repositoryIdentity } from './repositories.js';
import { PROPOSAL_STALE, proposalRecord, proposalUsedText, reviseProposal, saveRevision } from './generation-proposal.js';
import { resolveReferences } from './generation-review-refs.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const PATH = /^\/api\/learn\/chat\/messages\/(\d{1,15})\/proposal$/;

// null when the path is not this route, so the dispatcher can try the next one. deps: identity and the reference reader (tests inject).
export async function chatProposalFetch(req, env, deps = {}) {
  const url = new URL(req.url), match = url.pathname.match(PATH);
  if (!match) return null;
  if (req.method !== 'PUT' && req.method !== 'GET') return json({ error: 'GET or PUT required' }, 405);
  if (req.method === 'PUT' && req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  const user = await (deps.identity || repositoryIdentity)(req, env);
  if (user instanceof Response) return user;
  const db = env.LEARN_DB;
  const id = Number(match[1]);
  const row = await db.prepare("SELECT mm.meta_json, t.scope_ref FROM chat_message_meta mm JOIN threads t ON t.id = mm.thread_id WHERE mm.message_id = ? AND mm.role = 'assistant' AND t.org = ? AND t.user = ?")
    .bind(id, user.org, user.email).first();
  const meta = row && JSON.parse(row.meta_json);
  if (!meta?.proposal) return json({ error: 'Proposal not found' }, 404);
  // The references' states, resolved now: a deleted, changed, refused or unsupported one is said before anything is generated.
  const states = async proposal => (await resolveReferences(env, proposal, { req, user: { org: user.org, email: user.email }, app: row.scope_ref }, { read: deps.read })).states;
  if (req.method === 'GET') {
    const now = await proposalRecord(db, user.email, row.scope_ref, meta.proposal.proposal_id);
    const proposal = now.current ?? meta.proposal;
    return json({ proposal, message_id: String(now.currentMessageId ?? id), used: !!now.state?.used, references: await states(proposal) });
  }
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!Number.isSafeInteger(body?.expected_version)) return json({ error: 'expected_version (the revision this change was made from) is required' }, 400);
  const record = await proposalRecord(db, user.email, row.scope_ref, meta.proposal.proposal_id);
  const conflict = async (code, error) => { const now = await proposalRecord(db, user.email, row.scope_ref, meta.proposal.proposal_id); return json({ error, code, current: now.current, current_message_id: now.currentMessageId }, 409); };
  if (record.state?.used) return conflict('proposal_used', proposalUsedText(meta.proposal.command));
  if (!record.state || record.state.sig !== meta.proposal.sig || record.state.version !== body.expected_version) return conflict('proposal_stale', PROPOSAL_STALE);
  const { expected_version, ...edit } = body;
  const revised = await reviseProposal(env, meta.proposal, edit, user.email, { org: user.org, app: row.scope_ref });
  if (revised.error) return json({ error: revised.error, ...(revised.code ? { code: revised.code } : {}), ...(revised.errors ? { errors: revised.errors } : {}) }, 400);
  const saved = await saveRevision(db, record, { messageId: id, raw: row.meta_json, meta }, revised.proposal);
  return saved.conflict ? conflict('proposal_stale', 'This proposal changed in another tab or was just generated. Your choice was not saved.') : json({ proposal: saved.proposal, references: await states(saved.proposal) });
}
