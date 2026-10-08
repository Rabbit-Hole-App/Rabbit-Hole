// Per-canvas members and recipient-only invitations (docs/features/canvas-comments.md section 6, the H7 contract):
// the owner invites by email; only whoever controls the invited address can accept, by a fresh code sent there; access
// binds to the accepting account's users.id. Served by the control plane (C4): the invitation family
// /api/learn/invites/* (token in the POST body, never a URL) and the whole members subtree /api/learn/c/:boardId/members.
// Session only (sessionOf with uid, never CLI auth); POSTs need this site's Origin; every answer is no-store.
// The invited address is never used to find or link an account, and never leaves the server except to its owner.
import { echoesLogin, loginEmail, sessionOf } from './auth.js';
import { hmacHex, sha256 } from './token.js';
import { HANDLE_OF, NAME_OF } from './canvases.js';
import { NOT_TRASHED } from './library-trash.js';

const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
const refuse = (error, code, status, extra = {}) => json({ error, code, ...extra }, status, extra.retry_after ? { 'Retry-After': String(extra.retry_after) } : {});
const invalid = () => refuse('This invitation is no longer valid.', 'invite_invalid', 404);

export const INVITE_TTL = 14 * 24 * 3600;
export const CODE_TTL = 600;
export const CODE_TRIES = 5;
export const INVITE_LOCK = 20;
export const MEMBERS_MAX = 50;
const MAX_EMAILS = 20;
const MIN = 60, HOUR = 3600, DAY = 24 * HOUR;
const now = () => Math.floor(Date.now() / 1000);
const BOARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const CODE = /^\d{6}$/;
export const newInviteToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// C3: a uniform six-digit code (draws at or above 4294000000 rejected, so mod 10^6 is unbiased).
export function newCode() {
  const draw = new Uint32Array(1);
  do crypto.getRandomValues(draw); while (draw[0] >= 4294000000);
  return String(draw[0] % 1e6).padStart(6, '0');
}
const codeHmac = (env, id, uid, code) => hmacHex(env.MASTER_KEY, `${id}:${uid}:${code}`);
function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// C1: delivery goes to the address as normalized (a +tag kept); only rate-limit accounting folds the +tag.
// ponytail: Gmail dot-aliasing is not folded; fold it in capKey if abuse shows up.
export const capKey = email => email.replace(/^([^@+]*)\+[^@]*@/, '$1@');
export const maskEmail = email => { const [local, domain] = email.split('@'); return `${local.slice(0, 1)}•••@${domain}`; };

// Section 9 windows. Every email attempt consumes one unit of each applicable cap, reserved by one conditional INSERT;
// owner and recipient caps refuse with the same `limited`, so an owner cannot tell who else emailed an address.
const recipientWindows = cap => [
  { name: 'recipient', where: 'cap_key = ?', args: [cap], window: 15 * MIN, max: 5 },
  { name: 'recipient', where: 'cap_key = ?', args: [cap], window: DAY, max: 20 },
];
const inviteWindows = (cap, owner) => [
  ...recipientWindows(cap),
  { name: 'recipient', where: "cap_key = ? AND kind = 'invite'", args: [cap], window: DAY, max: 10 },
  { name: 'owner', where: "cap_key = ? AND kind = 'invite' AND owner_user_id = ?", args: [cap, owner], window: DAY, max: 3 },
  { name: 'owner', where: "kind = 'invite' AND owner_user_id = ?", args: [owner], window: DAY, max: 20 },
];
const codeWindows = (cap, invitation, uid) => [
  { name: 'gap', where: "kind = 'code' AND invitation_id = ? AND user_id = ?", args: [invitation, uid], window: MIN, max: 1 },
  { name: 'codes', where: "kind = 'code' AND invitation_id = ? AND user_id = ?", args: [invitation, uid], window: 15 * MIN, max: 3 },
  { name: 'codes', where: "kind = 'code' AND invitation_id = ? AND user_id = ?", args: [invitation, uid], window: DAY, max: 10 },
  { name: 'codes', where: "kind = 'code' AND user_id = ?", args: [uid], window: DAY, max: 10 },
  ...recipientWindows(cap),
];
// The wait for each violated window: its oldest counting row's sent_at plus the window, minus now; the largest wins.
async function violated(db, windows, at) {
  let wait = 0;
  const names = new Set();
  for (const w of windows) {
    const { results } = await db.prepare(`SELECT sent_at FROM canvas_invite_sends WHERE ${w.where} AND sent_at > ? ORDER BY sent_at DESC LIMIT ${w.max}`).bind(...w.args, at - w.window).all();
    if (results.length < w.max) continue;
    names.add(w.name);
    wait = Math.max(wait, results[w.max - 1].sent_at + w.window - at);
  }
  return { retry_after: Math.max(1, wait), names };
}
async function reserve(db, windows, row, at) {
  const result = await db.prepare(`INSERT INTO canvas_invite_sends (id, cap_key, kind, owner_user_id, invitation_id, user_id, sent_at)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${windows.map(w => `(SELECT count(*) FROM canvas_invite_sends WHERE ${w.where} AND sent_at > ?) < ${w.max}`).join(' AND ')}`)
    .bind(row.id, row.cap_key, row.kind, row.owner_user_id ?? null, row.invitation_id, row.user_id ?? null, at, ...windows.flatMap(w => [...w.args, at - w.window])).run();
  return result.meta?.changes ? null : violated(db, windows, at);
}
// A request refused after its reservation (it lost a race) gives the unit back: a refused request consumes nothing.
const release = (db, id) => db.prepare('DELETE FROM canvas_invite_sends WHERE id = ?').bind(id).run();
const delivered = (db, id, ok) => db.prepare('UPDATE canvas_invite_sends SET delivered = ? WHERE id = ?').bind(ok ? 1 : 0, id).run();

// C6: fixed plain-text templates. Interpolated: the title (quoted, control characters stripped, at most 120), the inviter's
// name or @handle, the accepting account's name and @handle. Never a principal or any address but the recipient's.
const clean = text => String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
const nameOf = (person, fallback) => (person?.name && person?.handle ? `${clean(person.name)} (@${person.handle})` : person?.name ? clean(person.name) : person?.handle ? `@${person.handle}` : fallback);
const verbs = enabled => (enabled ? 'view and comment on' : 'view');
export function inviteEmail({ inviter, title, link, enabled }) {
  const who = nameOf(inviter, 'A Rabbit Hole user');
  return {
    subject: `${who} invited you to ${enabled ? 'comment on' : 'view'} '${clean(title)}'`,
    text: `${who} invited you to ${verbs(enabled)} '${clean(title)}' in Rabbit Hole.\n\nOpen the invitation:\n${link}\n\nYou'll confirm this email address with a code before you join. The invitation lasts 14 days.\n\nReplies to this email aren't read.\n`,
  };
}
export function codeEmail({ code, inviter, account, title }) {
  return {
    subject: 'Your Rabbit Hole invitation code',
    text: `Your code: ${code}\n\nSomeone signed in to Rabbit Hole as ${nameOf(account, `a ${account?.provider_label || 'Rabbit Hole'} user`)} asked to accept ${nameOf(inviter, 'a Rabbit Hole user')}'s invitation to '${clean(title)}'. The code expires in 10 minutes. If this wasn't you, ignore this email.\n\nReplies to this email aren't read.\n`,
  };
}

const PERSON = col => `${NAME_OF(col)} AS name, ${HANDLE_OF(col)} AS handle, (SELECT up.avatar IS NOT NULL FROM user_profiles up WHERE up.email = ${col}) AS has_avatar, (SELECT up.updated_at FROM user_profiles up WHERE up.email = ${col}) AS since`;
const person = row => ({ name: row.name ?? null, ...(row.handle ? { handle: row.handle } : {}), ...(row.handle && row.has_avatar ? { avatar_url: `/api/learn/creators/${row.handle}/avatar?v=${encodeURIComponent(row.since || '')}` } : {}) });
async function personOf(db, email) {
  const row = await db.prepare(`SELECT ${PERSON('p.e')} FROM (SELECT ? AS e) p`).bind(email).first();
  return person(row || {});
}
const PROVIDERS = { google: 'Google', github: 'GitHub', email: 'email' };

// A top-level canvas's main board (Q5), with its owner, title, Trash state and Allow comments.
const BOARD = `SELECT b.id AS board_id, b.org, b.app AS canvas, c.owner_email, c.title, NOT ${NOT_TRASHED('c.org', 'c.name')} AS trashed,
    COALESCE((SELECT s.comments_enabled FROM canvas_comment_settings s WHERE s.org = c.org AND s.canvas = c.name), 1) AS comments_enabled
  FROM learn_boards b JOIN canvases c ON c.org = b.org AND c.name = b.app AND c.owner_email = b.owner_email
  WHERE b.board = 'main' AND c.name NOT IN (SELECT d.child FROM canvas_dives d WHERE d.org = c.org AND d.parent_app NOT LIKE 'share:%')`;

async function readBody(req) {
  if (Number(req.headers.get('content-length') || 0) > 16 * 1024) return null;
  const raw = await req.text();
  if (raw.length > 16 * 1024) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ---------- Owner: the members subtree ----------

const MEMBER_ROW = `SELECT m.id, m.invited_email, m.status, m.email_status, m.invited_at, m.expires_at, m.failed_attempts, m.member_email, ${PERSON('m.member_email')}
  FROM canvas_members m WHERE m.org = ? AND m.canvas = ? AND m.status IN ('pending', 'active') ORDER BY m.invited_at, m.id`;
async function listMembers(db, board) {
  const { results } = await db.prepare(MEMBER_ROW).bind(board.org, board.canvas).all();
  // The owner sees the addresses they typed; a member's account appears by reference, never by its principal.
  return json({ members: results.map(row => ({ id: row.id, invited_email: row.invited_email, status: row.status, email_status: row.email_status,
    ...(row.status === 'active' ? { person: person(row) } : {}), invited_at: row.invited_at, expires_at: row.expires_at, expired: row.status === 'pending' && row.expires_at <= now(),
    locked: row.failed_attempts >= INVITE_LOCK })), comments_enabled: !!board.comments_enabled });
}

async function sendInvite(env, sendEmail, board, row, token, origin) {
  const link = `${env.PUBLIC_ORIGIN || origin}/i#${token}`;
  const mail = inviteEmail({ inviter: await personOf(env.LEARN_DB, board.owner_email), title: board.title, link, enabled: !!board.comments_enabled });
  const sent = await sendEmail(env, row.invited_email, mail.subject, mail.text);
  // A test instance (echoesLogin) echoes instead of mailing (H4); nothing else ever sees the link.
  return { sent: sent || echoesLogin(env), echo: echoesLogin(env) ? { test_invite_url: `/i#${token}` } : {} };
}

async function invite(req, env, sendEmail, session, board) {
  const body = await readBody(req);
  const emails = Array.isArray(body?.emails) ? body.emails.slice(0, MAX_EMAILS) : [];
  if (!emails.length) return refuse('Add an email address.', 'no_emails', 400);
  if (board.trashed) return refuse('Restore this canvas from Trash first.', 'trashed', 409);
  const db = env.LEARN_DB, at = now();
  // The owner's own daily cap, before any address: one answer for the whole request.
  const owner = await violated(db, [{ name: 'owner', where: "kind = 'invite' AND owner_user_id = ?", args: [session.uid], window: DAY, max: 20 }], at);
  if (owner.names.size) return refuse("You've sent a lot of invitations today. Try again later.", 'limited', 429, { limited: true, retry_after: owner.retry_after });
  const invited = [], skipped = [];
  for (const raw of emails) {
    const email = loginEmail(raw);
    if (!email) { skipped.push({ email: String(raw ?? '').slice(0, 254), reason: 'invalid_email' }); continue; }
    const open = await db.prepare("SELECT status FROM canvas_members WHERE org = ? AND canvas = ? AND invited_email = ? AND status IN ('pending', 'active')").bind(board.org, board.canvas, email).first();
    if (open) { skipped.push({ email, reason: open.status === 'active' ? 'already_member' : 'already_invited' }); continue; }
    const count = await db.prepare("SELECT count(*) AS n FROM canvas_members WHERE org = ? AND canvas = ? AND status IN ('pending', 'active')").bind(board.org, board.canvas).first();
    if (count.n >= MEMBERS_MAX) { skipped.push({ email, reason: 'members_full' }); continue; }
    const id = crypto.randomUUID(), sendId = crypto.randomUUID();
    const refused = await reserve(db, inviteWindows(capKey(email), session.uid), { id: sendId, cap_key: capKey(email), kind: 'invite', owner_user_id: session.uid, invitation_id: id }, at);
    if (refused) { skipped.push({ email, reason: 'limited', retry_after: refused.retry_after }); continue; }
    const token = newInviteToken();
    // Created as 'failed', then sent, then 'sent': a Worker that dies between shows "Email wasn't sent · Resend", which is true.
    try {
      await db.prepare(`INSERT INTO canvas_members (id, org, canvas, invited_email, status, token_hash, email_status, invited_by, invited_at, expires_at)
        VALUES (?, ?, ?, ?, 'pending', ?, 'failed', ?, ?, ?)`).bind(id, board.org, board.canvas, email, await sha256(token), session.uid, at, at + INVITE_TTL).run();
    } catch (failure) {
      if (!/UNIQUE/i.test(String(failure?.message))) throw failure;
      // A concurrent invitation to the same address won: this one sends nothing and consumes nothing.
      await release(db, sendId);
      skipped.push({ email, reason: 'already_invited' });
      continue;
    }
    const row = { invited_email: email };
    const { sent, echo } = await sendInvite(env, sendEmail, board, row, token, new URL(req.url).origin);
    await delivered(db, sendId, sent);
    if (sent) await db.prepare("UPDATE canvas_members SET email_status = 'sent', email_sent_at = ? WHERE id = ?").bind(at, id).run();
    invited.push({ id, email_status: sent ? 'sent' : 'failed', ...echo });
  }
  return json({ invited, skipped });
}

async function resend(req, env, sendEmail, session, board, id) {
  const db = env.LEARN_DB, at = now();
  const row = await db.prepare('SELECT id, invited_email, status FROM canvas_members WHERE id = ? AND org = ? AND canvas = ?').bind(id, board.org, board.canvas).first();
  if (!row || !['pending', 'active'].includes(row.status)) return refuse('No such invitation on this canvas.', 'not_found', 404);
  if (row.status === 'active') return refuse('They already joined.', 'already_joined', 409);
  if (board.trashed) return refuse('Restore this canvas from Trash first.', 'trashed', 409);
  const sendId = crypto.randomUUID();
  const refused = await reserve(db, inviteWindows(capKey(row.invited_email), session.uid), { id: sendId, cap_key: capKey(row.invited_email), kind: 'invite', owner_user_id: session.uid, invitation_id: id }, at);
  if (refused) return refuse('Too many invitations to this address for now.', 'limited', 429, { limited: true, retry_after: refused.retry_after });
  const token = newInviteToken();
  // The old link and every open code die with the rotation, even if this send fails; the lock resets.
  const [rotated] = await db.batch([
    db.prepare("UPDATE canvas_members SET token_hash = ?, expires_at = ?, failed_attempts = 0, email_status = 'failed' WHERE id = ? AND status = 'pending'").bind(await sha256(token), at + INVITE_TTL, id),
    db.prepare('UPDATE canvas_invite_codes SET ended_at = ? WHERE invitation_id = ? AND ended_at IS NULL').bind(at, id),
  ]);
  if (!rotated.meta?.changes) { await release(db, sendId); return refuse('They already joined.', 'already_joined', 409); }
  const { sent, echo } = await sendInvite(env, sendEmail, board, row, token, new URL(req.url).origin);
  await delivered(db, sendId, sent);
  if (sent) await db.prepare("UPDATE canvas_members SET email_status = 'sent', email_sent_at = ? WHERE id = ?").bind(at, id).run();
  return json({ email_status: sent ? 'sent' : 'failed', ...echo });
}

async function removeMember(env, board, id) {
  const db = env.LEARN_DB, at = now();
  const row = await db.prepare("SELECT status FROM canvas_members WHERE id = ? AND org = ? AND canvas = ? AND status IN ('pending', 'active')").bind(id, board.org, board.canvas).first();
  if (!row) return refuse('No such invitation on this canvas.', 'not_found', 404);
  await db.batch([
    db.prepare('UPDATE canvas_members SET status = ?, token_hash = NULL, ended_at = ? WHERE id = ?').bind(row.status === 'active' ? 'removed' : 'cancelled', at, id),
    db.prepare('UPDATE canvas_invite_codes SET ended_at = ? WHERE invitation_id = ? AND ended_at IS NULL').bind(at, id),
  ]);
  return listMembers(db, board);
}

// ---------- The invitation family ----------

// The invitation behind a token: pending, unexpired, its canvas live (not in Trash). Anything else is one answer.
async function invitationOf(db, token) {
  if (!TOKEN.test(token || '')) return null;
  const hash = await sha256(token);
  const row = await db.prepare(`SELECT m.id, m.invited_email, m.failed_attempts, m.token_hash, i.* FROM canvas_members m
    JOIN (${BOARD}) i ON i.org = m.org AND i.canvas = m.canvas WHERE m.token_hash = ? AND m.status = 'pending' AND m.expires_at > ?`).bind(hash, now()).first();
  return row && !row.trashed ? row : null;
}
// The same account opening a link it already used (a lost 200, a second tab): its membership, found by the kept hash.
async function joinedBefore(db, token, session) {
  if (!session?.uid || !TOKEN.test(token || '')) return null;
  return db.prepare(`SELECT m.id, m.invited_email, m.failed_attempts, m.token_hash, i.* FROM canvas_members m JOIN (${BOARD}) i ON i.org = m.org AND i.canvas = m.canvas
    WHERE m.token_hash = ? AND m.status = 'active' AND m.member_user_id = ?`).bind(await sha256(token), session.uid).first();
}
const alreadyMember = (db, inv, uid) => db.prepare("SELECT 1 FROM canvas_members WHERE org = ? AND canvas = ? AND member_user_id = ? AND status = 'active'").bind(inv.org, inv.canvas, uid).first();
async function accountOf(env, session) {
  return { ...(await personOf(env.LEARN_DB, session.email)), provider_label: PROVIDERS[session.prov] || 'email' };
}

async function preview(req, env, body) {
  const db = env.LEARN_DB;
  const session = await sessionOf(req, env);
  const inv = await invitationOf(db, body?.token) || await joinedBefore(db, body?.token, session);
  if (!inv) return invalid();
  const signedIn = !!session?.uid;
  const already = signedIn && !!(await alreadyMember(db, inv, session.uid)), ownerSelf = signedIn && session.email === inv.owner_email;
  return json({
    state: inv.failed_attempts >= INVITE_LOCK ? 'locked' : 'pending', title: clean(inv.title), inviter: await personOf(db, inv.owner_email), masked_email: maskEmail(inv.invited_email),
    comments_enabled: !!inv.comments_enabled, signed_in: signedIn, ...(signedIn ? { account: await accountOf(env, session) } : {}),
    already_member: already, owner_self: ownerSelf, ...(already || ownerSelf ? { url: `/c/${inv.board_id}` } : {}),
  });
}

// Steps 1-4 shared by code and accept: a session with uid, a live invitation, not the owner, not already a member.
async function gate(req, env, body) {
  const session = await sessionOf(req, env);
  if (!session?.uid) return refuse('Sign in to continue.', 'sign_in', 401, { signIn: true });
  const inv = await invitationOf(env.LEARN_DB, body?.token);
  if (!inv) return invalid();
  if (session.email === inv.owner_email) return refuse('This is your canvas.', 'owner_self', 403, { url: `/c/${inv.board_id}` });
  if (await alreadyMember(env.LEARN_DB, inv, session.uid)) return refuse('You already have access.', 'already_member', 409, { url: `/c/${inv.board_id}` });
  return { session, inv };
}

async function sendCode(req, env, sendEmail, body) {
  const gated = await gate(req, env, body);
  if (gated instanceof Response) return gated;
  const { session, inv } = gated;
  const db = env.LEARN_DB, at = now();
  if (inv.failed_attempts >= INVITE_LOCK) return refuse('Too many wrong codes for this invitation. Ask the owner to resend it.', 'too_many_tries', 429);
  const sendId = crypto.randomUUID();
  const refused = await reserve(db, codeWindows(capKey(inv.invited_email), inv.id, session.uid), { id: sendId, cap_key: capKey(inv.invited_email), kind: 'code', invitation_id: inv.id, user_id: session.uid }, at);
  if (refused) {
    const tooMany = refused.names.has('gap') || refused.names.has('codes');
    return refuse(tooMany ? 'Too many codes requested.' : 'Too many emails to this address for now.', tooMany ? 'too_many_codes' : 'limited', 429, { retry_after: refused.retry_after, ...(tooMany ? {} : { limited: true }) });
  }
  const code = newCode(), codeId = crypto.randomUUID();
  await db.batch([
    db.prepare('UPDATE canvas_invite_codes SET ended_at = ? WHERE invitation_id = ? AND user_id = ? AND ended_at IS NULL').bind(at, inv.id, session.uid),
    db.prepare('INSERT INTO canvas_invite_codes (id, invitation_id, user_id, code_hmac, sent_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(codeId, inv.id, session.uid, await codeHmac(env, codeId, session.uid, code), at, at + CODE_TTL),
  ]);
  const mail = codeEmail({ code, inviter: await personOf(db, inv.owner_email), account: await accountOf(env, session), title: inv.title });
  const sent = (await sendEmail(env, inv.invited_email, mail.subject, mail.text)) || echoesLogin(env);
  await delivered(db, sendId, sent);
  if (!sent) {
    await db.prepare('UPDATE canvas_invite_codes SET ended_at = ? WHERE id = ?').bind(at, codeId).run();
    const capped = await violated(db, codeWindows(capKey(inv.invited_email), inv.id, session.uid), at);
    return refuse("We couldn't send the code.", 'email_unavailable', 503, { retry_after: Math.max(60, capped.names.size ? capped.retry_after : 0) });
  }
  return json({ sent: true, masked_email: maskEmail(inv.invited_email), expires_in: CODE_TTL, retry_after: 60, ...(echoesLogin(env) ? { test_code: code } : {}) });
}

async function accept(req, env, body) {
  const replay = await joinedBefore(env.LEARN_DB, body?.token, await sessionOf(req, env));
  if (replay) return json({ joined: true, url: `/c/${replay.board_id}` });
  const gated = await gate(req, env, body);
  if (gated instanceof Response) return gated;
  const { session, inv } = gated;
  const db = env.LEARN_DB, at = now(), url = `/c/${inv.board_id}`;
  if (inv.failed_attempts >= INVITE_LOCK) return refuse('Too many wrong codes for this invitation. Ask the owner to resend it.', 'too_many_tries', 429);
  if (!CODE.test(body?.code || '')) return refuse('Enter the 6-digit code.', 'code_wrong', 422, { tries_left: CODE_TRIES });
  // a. Claim an attempt on this account's open code; nothing comes back when there is none to try.
  const claimed = await db.prepare(`UPDATE canvas_invite_codes SET attempts = attempts + 1
    WHERE invitation_id = ? AND user_id = ? AND ended_at IS NULL AND expires_at > ? AND attempts < ? AND (SELECT failed_attempts FROM canvas_members WHERE id = ?) < ?
    RETURNING id, code_hmac, attempts`).bind(inv.id, session.uid, at, CODE_TRIES, inv.id, INVITE_LOCK).first();
  if (!claimed) {
    if ((await db.prepare('SELECT failed_attempts FROM canvas_members WHERE id = ?').bind(inv.id).first())?.failed_attempts >= INVITE_LOCK) return refuse('Too many wrong codes for this invitation. Ask the owner to resend it.', 'too_many_tries', 429);
    const last = await db.prepare('SELECT expires_at, attempts, ended_at FROM canvas_invite_codes WHERE invitation_id = ? AND user_id = ? ORDER BY sent_at DESC LIMIT 1').bind(inv.id, session.uid).first();
    if (!last || (last.ended_at && last.attempts < CODE_TRIES)) return refuse('Send a code first.', 'code_needed', 409);
    if (last.attempts >= CODE_TRIES) return refuse('Too many tries. Send a new code.', 'too_many_tries', 429);
    return refuse('This code has expired. Codes last 10 minutes.', 'code_expired', 410);
  }
  // b. A wrong code counts against this code and against the whole invitation (the lock at 20).
  if (!sameHex(await codeHmac(env, claimed.id, session.uid, body.code), claimed.code_hmac)) {
    await db.prepare('UPDATE canvas_members SET failed_attempts = failed_attempts + 1 WHERE id = ?').bind(inv.id).run();
    if (claimed.attempts >= CODE_TRIES) {
      await db.prepare('UPDATE canvas_invite_codes SET ended_at = ? WHERE id = ?').bind(at, claimed.id).run();
      return refuse('Too many tries. Send a new code.', 'too_many_tries', 429);
    }
    return refuse("That code isn't right.", 'code_wrong', 422, { tries_left: CODE_TRIES - claimed.attempts });
  }
  // c. The right code: activation and the end of every open code, one transaction.
  let activated;
  try {
    [activated] = await db.batch([
      db.prepare(`UPDATE canvas_members SET status = 'active', member_user_id = ?, member_email = ?, accepted_at = ?
        WHERE id = ? AND status = 'pending' AND token_hash = ? AND expires_at > ? AND failed_attempts < ? AND EXISTS (SELECT 1 FROM canvas_invite_codes WHERE id = ? AND ended_at IS NULL)`)
        .bind(session.uid, session.email, at, inv.id, inv.token_hash, at, INVITE_LOCK, claimed.id),
      db.prepare('UPDATE canvas_invite_codes SET ended_at = ? WHERE invitation_id = ? AND ended_at IS NULL').bind(at, inv.id),
    ]);
  } catch (failure) {
    if (!/UNIQUE/i.test(String(failure?.message))) throw failure;
    // This account is already active through another invitation (another address): this one stays pending for the owner.
    await db.prepare('UPDATE canvas_invite_codes SET ended_at = ? WHERE id = ?').bind(at, claimed.id).run();
    return refuse('You already have access.', 'already_member', 409, { url });
  }
  if (activated.meta?.changes) return json({ joined: true, url });
  const row = await db.prepare('SELECT status, member_user_id FROM canvas_members WHERE id = ?').bind(inv.id).first();
  return row?.status === 'active' && row.member_user_id === session.uid ? json({ joined: true, url }) : invalid();
}

async function cancel(req, env, body) {
  const session = await sessionOf(req, env);
  if (!session?.uid) return refuse('Sign in to continue.', 'sign_in', 401, { signIn: true });
  const inv = await invitationOf(env.LEARN_DB, body?.token);
  if (!inv) return invalid();
  await env.LEARN_DB.prepare('UPDATE canvas_invite_codes SET ended_at = ? WHERE invitation_id = ? AND user_id = ? AND ended_at IS NULL').bind(now(), inv.id, session.uid).run();
  return json({ cancelled: true });
}

// The mount (index.js): before any generic /api user resolution. sendEmail is index.js's own, passed in; it only ever
// gets the stored invited address and these fixed templates.
export const membersPath = path => path.startsWith('/api/learn/invites/') || /^\/api\/learn\/c\/[^/]+\/members(\/|$)/.test(path);
export async function canvasMembersRoute(req, env, path, { sendEmail }) {
  if (!env.LEARN_DB) return json({ error: 'Invitations need the Learn database.' }, 503);
  const url = new URL(req.url);
  if (req.method !== 'GET') {
    const allowed = env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN).origin : url.origin;
    if (req.headers.get('Origin') !== allowed) return refuse('cross-site request refused', 'origin', 403);
  }
  const action = path.match(/^\/api\/learn\/invites\/(preview|code|accept|cancel)$/);
  if (action) {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const body = await readBody(req);
    if (action[1] === 'preview') return preview(req, env, body);
    if (action[1] === 'code') return sendCode(req, env, sendEmail, body);
    if (action[1] === 'accept') return accept(req, env, body);
    return cancel(req, env, body);
  }
  const owned = path.match(/^\/api\/learn\/c\/([^/]+)\/members(?:\/([^/]+)(\/resend)?)?$/);
  if (!owned) return refuse('Not found', 'not_found', 404);
  const session = await sessionOf(req, env);
  if (!session?.uid) return refuse('Sign in to continue.', 'sign_in', 401, { signIn: true });
  const boardId = decodeURIComponent(owned[1]);
  const board = BOARD_ID.test(boardId) ? await env.LEARN_DB.prepare(`${BOARD} AND b.id = ?`).bind(boardId).first() : null;
  // Only the owner manages members; anyone else gets the same 404 as a canvas that does not exist.
  if (!board || board.owner_email !== session.email) return refuse("This canvas isn't available to you.", 'not_found', 404);
  const [, , id, resending] = owned;
  if (!id) return req.method === 'GET' ? listMembers(env.LEARN_DB, board) : req.method === 'POST' ? invite(req, env, sendEmail, session, board) : json({ error: 'Method not allowed' }, 405);
  if (resending) return req.method === 'POST' ? resend(req, env, sendEmail, session, board, id) : json({ error: 'Method not allowed' }, 405);
  return req.method === 'DELETE' ? removeMember(env, board, id) : json({ error: 'Method not allowed' }, 405);
}
