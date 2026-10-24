// GET and PUT /api/learn/chat/messages/:messageId/proposal (UI-15, MOT-20, UI-15.1)
//   GET -> { proposal, message_id, used, references }: the owner's current revision of the proposal on that answer, with each
//   reference's state (ok, changed, deleted, inaccessible, unsupported) re-resolved now under the owner's own access
//   (generation-review-refs.js).
//   PUT { expected_version, settings?, description?, title?, references?, requirements?, assumptions?, missing_information?,
//   limitations? } -> { proposal, references }: an edit on a generation proposal card, saved over that answer's meta.proposal as its
//   next version, validated by the canonical schema and the review rules, and signed again for the learner (generation-proposal.js
//   reviseProposal). No model call: the stored proposal is the one revised, never one the browser sends. Only the owner of the
//   message's thread may read or write it; anything else is a 404. LEARN_DB only. Every accepted save is the next revision.
// IMG-01: POST /api/learn/chat/image-proposals { app, thread_id, prompt, settings, references?, title? } -> 201 { thread_id, message_id, proposal,
//   references }. The person's own /generate-image request becomes a signed v3 proposal on their canvas chat, with no model call: the
//   server signs the prompt (with its reference pills), the schema-valid settings and its own quote (generation-proposal.js
//   imageProposalQuote), and stores it as an answer row exactly as a chat proposal is, so the same GET/PUT, card and one-shot consume
//   apply. Off unless IMAGE_GENERATE_ENABLED is 'true' (503 image_generation_disabled). A combination not yet validated, or a price
//   not known, is still a proposal: the card says why and Generate stays blocked (image-settings.js, the quote).
// MOT-22: the body names the revision it was made from ({..., expected_version}); only the published current revision changes,
// through the proposal's one state (generation-proposal.js saveRevision). A save from an older revision, one that lost a race with
// another tab, a chat refinement or a Generate, or one after it made its video is a 409 with the current proposal, never applied, so
// the browser keeps the learner's draft beside the latest. A refused edit is a 400 with the words and the paths (errors), and the
// browser keeps the draft.
import { repositoryIdentity } from './repositories.js';
import { PROPOSAL_STALE, proposalRecord, proposalState, proposalUsedText, reviewAvailable, reviseProposal, saveRevision, signProposal } from './generation-proposal.js';
import { resolveReferences } from './generation-review-refs.js';
import { validateSettings } from '../../web/src/generation-confirmation-schema.js';
import { plainPrompt } from '../../web/src/generation-review.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const PATH = /^\/api\/learn\/chat\/messages\/(\d{1,15})\/proposal$/;
const IMAGE_PATH = '/api/learn/chat/image-proposals', THREAD = /^canvaschat-[0-9a-f-]{36}$/;

async function createImageProposal(req, env, deps) {
  if (env.IMAGE_GENERATE_ENABLED !== 'true') return json({ error: 'Image generation is not available.', code: 'image_generation_disabled' }, 503);
  if (!env.LEARN_DB || !reviewAvailable(env)) return json({ error: 'Image generation is not available.', code: 'not_configured' }, 503);
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const user = await (deps.identity || repositoryIdentity)(req, env);
  if (user instanceof Response) return user;
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const plainBody = v => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!plainBody(body) || typeof body.app !== 'string' || !body.app || body.app.length > 200 || !THREAD.test(body.thread_id || '') || typeof body.prompt !== 'string' || !plainBody(body.settings)
    || (body.references != null && !Array.isArray(body.references)) || (body.title != null && typeof body.title !== 'string')) return json({ error: 'An app, a chat id, a prompt and settings are required.' }, 400);
  const owner = await (deps.owner || (async (r, e, app) => (await import('./learn-boards.js')).boardOwner(r, e, app)))(req, env, body.app);
  if (owner instanceof Response) return owner;
  if (owner.org !== user.org || owner.email !== user.email) return json({ error: 'Canvas not found' }, 404);
  const db = env.LEARN_DB;
  const thread = await db.prepare('SELECT org, user, scope_ref FROM threads WHERE id = ?').bind(body.thread_id).first();
  if (thread && (thread.org !== user.org || thread.user !== user.email)) return json({ error: 'Chat not found' }, 404);
  if (thread && thread.scope_ref !== body.app) return json({ error: 'This chat belongs to another canvas', code: 'thread_canvas_mismatch' }, 409);
  const references = body.references ?? [];
  const settings = validateSettings('generate-image', body.settings, { references });
  if (settings.error) return json({ error: settings.error, errors: [{ path: settings.path, message: settings.error }] }, 400);
  const words = (plainPrompt(body.prompt, references) || '').replace(/\s+/g, ' ').trim();
  let p;
  try {
    p = await signProposal(env, { command: 'generate-image', title: (body.title || words.slice(0, 80) || 'Image').trim(), description: words, settings: settings.value, source_refs: [], prompt: body.prompt, references,
      original_request: `/generate-image ${words}`.slice(0, 500), input: { request: `/generate-image ${words}`.slice(0, 500), org: user.org, app: body.app } }, user.email, { envelope: 'v3' });
  } catch (error) { return json({ error: error.message, code: 'proposal_invalid' }, 400); }
  const meta = { version: 1, mode: 'ask', kind: 'answer', contextRefs: [], actions: [], followUps: [], syllabus: null, proposal: p, proposalState: proposalState(p) }, at = new Date().toISOString();
  // One batch, so a message never lands without the meta row the proposal is found by (canvases.js saveChatMessage).
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES(?,?,?,?,'',?)").bind(body.thread_id, user.org, user.email, body.app, (p.title || 'Image').slice(0, 120)),
    db.prepare('INSERT INTO messages(thread_id,role,content) VALUES(?,?,?)').bind(body.thread_id, 'assistant', 'Here is the plan for your image. Generate makes it.'),
    db.prepare('INSERT INTO chat_message_meta(message_id,thread_id,role,meta_json) SELECT max(id),?,?,? FROM messages WHERE thread_id=?').bind(body.thread_id, 'assistant', JSON.stringify(meta), body.thread_id),
    db.prepare('INSERT INTO chat_thread_state(thread_id,last_activity_at,updated_at) VALUES(?,?,?) ON CONFLICT(thread_id) DO UPDATE SET last_activity_at=excluded.last_activity_at, updated_at=excluded.updated_at').bind(body.thread_id, at, at),
  ]);
  const row = await db.prepare("SELECT message_id FROM chat_message_meta WHERE thread_id = ? AND json_extract(meta_json, '$.proposal.proposal_id') = ?").bind(body.thread_id, p.proposal_id).first();
  const states = await resolveReferences(env, p, { req, user: { org: user.org, email: user.email }, app: body.app }, { authorize: deps.authorize });
  return json({ thread_id: body.thread_id, message_id: String(row.message_id), proposal: p, references: states.states }, 201);
}

// null when the path is not this route, so the dispatcher can try the next one. deps: identity and the reference reader (tests inject).
export async function chatProposalFetch(req, env, deps = {}) {
  const url = new URL(req.url), match = url.pathname.match(PATH);
  if (url.pathname === IMAGE_PATH) return createImageProposal(req, env, deps);
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
