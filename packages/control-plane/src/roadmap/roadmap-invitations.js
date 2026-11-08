// R4 integration glue: the two-choice invitation (v1.4 2.1, api.md routes 1 to 3; D1, D22, D23, D28). Deterministic, no model, no charge: the title is the
// source file name (decision T6). The server decides whether to offer (Tools' decideInvitation); the client only reports "this Markdown source is
// ready and Chat is idle". Dismissal is scoped to that invitation's row: the same source set is not offered again, a different one is, and
// nothing global changes. Auto-suggest off and Ask suppress an unsolicited invitation without writing a row; explicit teaching requests (the
// create route) are unaffected. Ask never starts a roadmap. An explicit drop (idleKey 'drop-...', UI.01 / roadmap 3.3) is acknowledged in
// every mode: its invitation is the learner's own trigger, so Ask and Auto-suggest off do not suppress it (an unfinished roadmap still does).
import { StateError } from './roadmap-contract.js';
import { decideInvitation } from './roadmap-validate.js';
import { readUnfinishedRoadmap } from './roadmap-store.js';
import { newId, sha256 } from './roadmap-money.js';
import { reserveRoadmapQuota } from './roadmap-quota.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);
const FILE_KEY = /^file:([A-Za-z0-9_-]{1,64})$/;
const KEY = /^[A-Za-z0-9_-]{8,128}$/;
const MODES = ['auto', 'ask', 'tutor'];
export const MAX_SOURCES = 8;
// ROADMAP_ON_DROP_ENABLED (beneath ROADMAP_ENABLED, which the route checks first): the value 'false' stops a dropped source from starting the roadmap (no invitation);
// unset or any other value is today's behavior. Global: one flag for every learner and canvas.
export const roadmapOnDropEnabled = env => env?.ROADMAP_ON_DROP_ENABLED !== 'false';

const view = (row, titles) => ({ id: row.id, state: row.state, sourceKeys: JSON.parse(row.source_keys_json), title: titles ?? row.title ?? '', choices: ['explain_on_canvas', 'keep_here'], offeredAt: new Date(row.offered_at * 1000).toISOString() });

// The learner's owned, stored Markdown sources among the reported keys: { key, rev, name }.
async function supportedSources(db, access, sourceKeys) {
  const found = [];
  for (const key of sourceKeys) {
    const m = FILE_KEY.exec(key);
    const row = m && await db.prepare("SELECT name, family, sha256 FROM file_sources WHERE id = ? AND status = 'stored' AND org = ? AND owner_email = ?").bind(m[1], access.org, access.actorEmail).first();
    if (row?.family === 'markdown') found.push({ key, rev: row.sha256, name: row.name });
  }
  return found;
}

// deps.settings(db, access) -> { autoSuggest, mode } (R2's readers when merged; the default is on, Tutor). body.mode is only a hint that can suppress.
export async function offerInvitation(db, access, { sourceKeys, idleKey, mode: hint, settings, onDrop = true, now = nowSeconds() }) {
  if (!Array.isArray(sourceKeys) || !sourceKeys.length || sourceKeys.length > MAX_SOURCES || !sourceKeys.every(k => typeof k === 'string')) throw new StateError('invalid_request', 'sourceKeys', 400);
  if (typeof idleKey !== 'string' || !KEY.test(idleKey)) throw new StateError('invalid_request', 'idleKey', 400);
  const explicit = idleKey.startsWith('drop-');
  if (explicit && !onDrop) return { status: 200, body: { invitation: null, suppressed: { reason: 'on_drop_off' } } }; // a quiet "not started": the source card was added by the client, nothing else happens
  const sources = await supportedSources(db, access, [...new Set(sourceKeys)].sort());
  const stored = (await settings?.(db, access)) || {};
  const mode = MODES.includes(stored.mode) ? stored.mode : MODES.includes(hint) ? hint : 'tutor';
  const setKey = await sha256(sources.map(s => `${s.key}@${s.rev}`).join('|'));
  const existing = sources.length ? await db.prepare('SELECT * FROM learn_roadmap_invitations WHERE org = ? AND owner_user_id = ? AND board_id = ? AND source_set_key = ?').bind(access.org, access.actorUserId, access.boardId, setKey).first() : null;
  const decision = decideInvitation({ sourceSupported: sources.length > 0, autoSuggest: explicit || stored.autoSuggest !== false, mode: explicit ? 'tutor' : mode, unfinishedRoadmap: !!(await readUnfinishedRoadmap(db, access)), alreadyOffered: !!existing });
  // An invitation that is still offered is returned as it is (reload, a second device, the same idle window sent twice).
  if (!decision.offer && existing?.state === 'offered' && decision.reason === 'already_offered') return { status: 200, body: { invitation: view(existing, sources.map(s => s.name).join(', ')) } };
  if (!decision.offer) return { status: 200, body: { invitation: null, suppressed: { reason: decision.reason } } };
  if (!(await reserveRoadmapQuota(db, access, 'invite', { now })).ok) return { status: 200, body: { invitation: null, suppressed: { reason: 'quota' } } };
  const id = newId('iv_'), title = sources.map(s => s.name).join(', ');
  await db.prepare(`INSERT OR IGNORE INTO learn_roadmap_invitations (id, org, owner_user_id, board_id, app, source_set_key, source_keys_json, state, offered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'offered', ?)`).bind(id, access.org, access.actorUserId, access.boardId, access.app ?? 'learn', setKey, JSON.stringify(sources.map(s => s.key)), now).run();
  const row = await db.prepare('SELECT * FROM learn_roadmap_invitations WHERE org = ? AND owner_user_id = ? AND board_id = ? AND source_set_key = ?').bind(access.org, access.actorUserId, access.boardId, setKey).first();
  return { status: 200, body: { invitation: view(row, title) } };
}

// route 2: the pending invitation for this board (reload, second device). Titles are re-read from the sources, never stored.
export async function pendingInvitation(db, access) {
  const row = await db.prepare("SELECT * FROM learn_roadmap_invitations WHERE org = ? AND owner_user_id = ? AND board_id = ? AND state = 'offered' ORDER BY offered_at DESC LIMIT 1").bind(access.org, access.actorUserId, access.boardId).first();
  if (!row || await readUnfinishedRoadmap(db, access)) return { status: 200, body: { invitation: null } };
  const sources = await supportedSources(db, access, JSON.parse(row.source_keys_json));
  return { status: 200, body: { invitation: sources.length ? view(row, sources.map(s => s.name).join(', ')) : null } };
}

// route 3: dismiss THIS invitation. Replay-safe: dismissing a dismissed invitation answers the same; one that is not yours is unknown.
export async function dismissInvitation(db, access, { invitationId, actionKey, now = nowSeconds() }) {
  if (typeof actionKey !== 'string' || !KEY.test(actionKey)) throw new StateError('invalid_request', 'actionKey', 400);
  const row = await db.prepare('SELECT * FROM learn_roadmap_invitations WHERE id = ? AND org = ? AND owner_user_id = ? AND board_id = ?').bind(invitationId, access.org, access.actorUserId, access.boardId).first();
  if (!row) throw new StateError('not_found', 'Not available', 404);
  if (row.state === 'offered') await db.prepare("UPDATE learn_roadmap_invitations SET state = 'dismissed', resolved_at = ? WHERE id = ? AND state = 'offered'").bind(now, row.id).run();
  const state = row.state === 'offered' ? 'dismissed' : row.state;
  return { status: 200, body: { invitation: { id: row.id, state } } };
}

// The create route passes the invitation it came from: that one (and only that one) becomes accepted.
export const acceptInvitation = (db, access, invitationId, roadmapId, now = nowSeconds()) => invitationId
  ? db.prepare("UPDATE learn_roadmap_invitations SET state = 'accepted', roadmap_id = ?, resolved_at = ? WHERE id = ? AND org = ? AND owner_user_id = ? AND board_id = ? AND state = 'offered'").bind(roadmapId, now, invitationId, access.org, access.actorUserId, access.boardId).run()
  : null;
