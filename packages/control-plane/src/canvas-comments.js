// Canvas comments (docs/features/canvas-comments.md): threads pinned to a canvas's cards or empty space, and their
// replies, stored apart from the board - nothing here writes learn_boards, so a comment never bumps a board's version,
// its updated_at or the Library order. Two route families share one policy, can() (section 3):
// - the member family, /api/learn/c/:boardId/..., keyed by the canvas's main board id: the owner and active members;
// - the public family, /api/learn/boards/shared/:token/comments/..., keyed by an Explore publication's token: public
//   threads only, never a board id. A share link (/b/) token answers 404 here.
// Every permission identity is users.id. No response carries an email, a principal or an account id: a person is
// {name, handle?, avatar_url?}, read by reference so a renamed handle shows at once.
import { repositoryIdentity } from './repositories.js';
import { HANDLE_OF, NAME_OF } from './canvases.js';
import { sharedState } from './shared-privacy.js';
import { IN_TRASH_TREE } from './library-trash.js';
import { sha256Hex } from './learn-grade-jev.js';
import { boardAsset } from './learn-boards.js';
import { redactRepositoryCards } from './repository-cards.js';
import { isEmbed } from './learn-shared-ask.js';
import { changesFrom } from '../../web/src/comments/comment-sync.js';
import { REACTIONS } from '../../web/src/comments/comment-reactions.js';
import { uploadBody } from './upload-body.js';
import { FORMATS, HEAD_BYTES } from './file-sniff.js';
import { learnMedia } from './learn-storage.js';
import { BODY_MAX, LIMIT_DEFAULTS } from '../../web/src/comments/comment-limits.js';
import { fingerprint, holdsQuote, locate, stateOf, targetOf } from './comment-anchors.js';
import { ATTACHMENT_NOTE, ATTACHMENT_TYPES, releasePurged, safeName } from './comment-attachments.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const refuse = (error, code, status, extra = {}) => json({ error, code, ...extra }, status);
export const NO_ACCESS = "You don't have access to this canvas.";
const notFound = () => refuse("This canvas isn't available to you.", 'not_found', 404);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
export { BODY_MAX };
const RAW_MAX = 16 * 1024;
const PAGE = 30;
const MESSAGES = 50;
const MODES = ['off', 'open', 'closed'];

// Section 9, each overridable by a worker variable of the same name (the SHARED_ASK_LIMITS pattern).
// The numbers and their defaults live in the web's comment-limits.js (one config, shared with the panel); a worker variable of the
// same name overrides a number here.
export const COMMENT_LIMITS = LIMIT_DEFAULTS;
export const commentLimits = env => Object.fromEntries(Object.entries(COMMENT_LIMITS).map(([name, fallback]) => {
  const value = String(env?.[name] ?? '').trim();
  return [name, /^\d+$/.test(value) ? Number(value) : fallback];
}));

// The one policy (section 3), for both route families. actor: {owner, member, signedIn, starter, blocked};
// audience: the thread's ('members' | 'public'); mode: the public setting, 'off' whenever the canvas is not published;
// enabled: Allow comments. Allow comments off leaves the owner alone able to post, edit or resolve; reading, marking
// read and deleting your own comment never depend on it.
export function can(actor, action, { audience, mode, enabled }) {
  const { owner, member, signedIn, starter, blocked } = actor;
  const quiet = !enabled && !owner;
  if (audience === 'members') {
    const inside = !!(owner || member);
    if (action === 'read' || action === 'mark_read' || action === 'delete_own') return inside;
    if (action === 'post' || action === 'edit_own') return inside && !quiet;
    if (action === 'resolve') return !!owner || (!!member && !!starter && !quiet);
    if (action === 'delete_any') return !!owner;
    return false;
  }
  const read = !!(owner || member) || mode !== 'off';
  if (action === 'read') return read;
  if (action === 'mark_read' || action === 'delete_own') return read && !!signedIn;
  if (action === 'post' || action === 'edit_own') return !!signedIn && mode === 'open' && !blocked && !quiet;
  if (action === 'resolve') return owner ? mode !== 'off' : !!starter && !!signedIn && mode === 'open' && !blocked && !quiet;
  if (action === 'delete_any' || action === 'block') return !!owner;
  return false;
}

// A person by reference: display name, handle and avatar from the email column `col` (a qualified column of the
// outer row), aliased with `p` so one query can carry several people.
const PERSON = (col, p) => `${NAME_OF(col)} AS ${p}name, ${HANDLE_OF(col)} AS ${p}handle,
  (SELECT up.avatar IS NOT NULL FROM user_profiles up WHERE up.email = ${col}) AS ${p}has_avatar, (SELECT up.updated_at FROM user_profiles up WHERE up.email = ${col}) AS ${p}since`;
export function person(row, p = '') {
  const handle = row[`${p}handle`] || null;
  return { name: row[`${p}name`] ?? null, ...(handle ? { handle } : {}),
    ...(handle && row[`${p}has_avatar`] ? { avatar_url: `/api/learn/creators/${handle}/avatar?v=${encodeURIComponent(row[`${p}since`] || '')}` } : {}) };
}

// The one board resolver (owner decision D2, 2026-10-23). A board here is the main board of a canvas row - top-level, a
// project canvas or a nested Rabbit Hole - or the Main canvas of a project (repo-*). Each is its own board: its owner, its
// members and its settings are its own, read from its own (org, canvas) key, and nothing is inherited from a parent. A
// parent's members are not the hole's: the hole's people are those invited to the hole. A project's Main canvas has no
// members or publication, so only its owner reaches its comments. Archive changes nothing here; Trash suspends everyone but
// the owner, and a hole is in Trash with the canvas above it; a publication counts while the canvas is live.
const BOARD_ROW = `SELECT b.id, b.org, b.app AS canvas, b.owner_email, c.title, b.public_view = 1 AS public_view_open, ${IN_TRASH_TREE('c.org', 'c.name')} AS trashed,
    (c.archived_at IS NULL AND EXISTS (SELECT 1 FROM canvas_publications pub WHERE pub.org = c.org AND pub.canvas = c.name)) AS published,
    EXISTS (SELECT 1 FROM canvas_dives d WHERE d.org = c.org AND d.child = c.name AND d.parent_app NOT LIKE 'share:%') AS nested,
    COALESCE(s.comments_enabled, 1) AS comments_enabled, COALESCE(s.public_mode, 'off') AS public_mode, COALESCE(l.public_mode, 'off') AS link_mode, ${PERSON('c.owner_email', 'owner_')}
  FROM learn_boards b JOIN canvases c ON c.org = b.org AND c.name = b.app AND c.owner_email = b.owner_email
  LEFT JOIN canvas_comment_settings s ON s.org = c.org AND s.canvas = c.name
  LEFT JOIN canvas_comment_settings l ON l.org = c.org AND l.canvas = 'link:' || c.name
  WHERE b.board = 'main'`;
const PROJECT_BOARD = `SELECT b.id, b.org, b.app AS canvas, b.owner_email, r.repo AS title, 0 AS public_view_open, ${IN_TRASH_TREE('r.org', 'r.name')} AS trashed, 0 AS published, 0 AS nested,
    COALESCE(s.comments_enabled, 1) AS comments_enabled, 'off' AS public_mode, 'off' AS link_mode, ${PERSON('r.owner_email', 'owner_')}
  FROM learn_boards b JOIN repository_apps r ON r.org = b.org AND r.name = b.app AND r.owner_email = b.owner_email
  LEFT JOIN canvas_comment_settings s ON s.org = r.org AND s.canvas = r.name
  WHERE b.board = 'main' AND b.app LIKE 'repo-%'`;
export async function boardOf(env, boardId) {
  if (!BOARD_ID.test(boardId)) return null;
  const db = env.LEARN_DB;
  return (await db.prepare(`${BOARD_ROW} AND b.id = ?`).bind(boardId).first()) || (await db.prepare(`${PROJECT_BOARD} AND b.id = ?`).bind(boardId).first()) || null;
}

async function viewerOf(req, env) {
  if (isEmbed(req)) return null; // an embed is the public's, the owner's own page or not (SHARE-04)
  const viewer = await repositoryIdentity(req, env);
  return viewer instanceof Response ? null : viewer;
}
async function actorOn(env, board, viewer) {
  const owner = !!viewer && viewer.email === board.owner_email;
  const uid = viewer?.userId || null;
  const db = env.LEARN_DB;
  const member = !owner && !!uid && !board.trashed && !!(await db.prepare("SELECT 1 FROM canvas_members WHERE org = ? AND canvas = ? AND member_user_id = ? AND status = 'active'").bind(board.org, board.canvas, uid).first());
  const blocked = !owner && !!uid && !!(await db.prepare('SELECT 1 FROM canvas_comment_blocks WHERE org = ? AND canvas = ? AND user_id = ?').bind(board.org, board.canvas, uid).first());
  return { owner, member, blocked, signedIn: !!uid, uid, email: viewer?.email || null, org: viewer?.org || null };
}
const settingsOf = board => ({ mode: board.published ? board.public_mode : 'off', enabled: !!board.comments_enabled });

export async function memberContext(req, env, boardId) {
  const board = await boardOf(env, boardId);
  if (!board) return notFound();
  const viewer = await viewerOf(req, env);
  if (!viewer) return refuse('Sign in to see the comments on this canvas.', 'sign_in', 401, { signIn: true });
  const actor = await actorOn(env, board, viewer);
  if (!actor.owner && !actor.member) return notFound();
  return { family: 'member', board, actor, ...settingsOf(board) };
}

// The link's comment setting (owner decision 2026-10-22, Hidden / View only / Allow comments): a second settings row keyed
// 'link:<canvas>' beside Explore's, same vocabulary (off, closed, open), so no migration; no row is Hidden.
const LINK_MODES = { hidden: 'off', view: 'closed', allow: 'open' };
const linkName = mode => Object.keys(LINK_MODES).find(name => LINK_MODES[name] === mode) || 'hidden';

async function publicContext(req, env, token) {
  if (!TOKEN.test(token)) return notFound();
  let board = await env.LEARN_DB.prepare(`${BOARD_ROW} AND c.archived_at IS NULL AND NOT ${IN_TRASH_TREE('c.org', 'c.name')}
    AND EXISTS (SELECT 1 FROM canvas_publications pub WHERE pub.org = c.org AND pub.canvas = c.name AND pub.token = ?)`).bind(token).first();
  const viewer = await viewerOf(req, env);
  if (!board) {
    // A share link's token (/b/): only while the link is on, and for a signed-out visitor only when it is public. The retained
    // token alone proves nothing (permanent link, owner decision 2026-10-22). Its mode is the link's, not Explore's.
    board = await env.LEARN_DB.prepare(`${BOARD_ROW} AND b.shared = 1 AND b.view_token = ? AND NOT ${IN_TRASH_TREE('c.org', 'c.name')}`).bind(token).first();
    if (!board || !(board.public_view_open || viewer)) return (await env.LEARN_DB.prepare('SELECT 1 FROM learn_boards WHERE view_token = ?').bind(token).first()) ? refuse(NO_ACCESS, 'not_found', 404) : notFound();
    board = { ...board, published: 1, public_mode: board.link_mode };
  }
  const actor = await actorOn(env, board, viewer);
  const settings = settingsOf(board);
  if (settings.mode === 'off' && !actor.owner && !actor.member) return notFound();
  return { family: 'public', board, actor, ...settings };
}

const allowed = (ctx, action, audience, starter = false) => can({ ...ctx.actor, starter }, action, { audience, mode: ctx.mode, enabled: ctx.enabled });

async function readJson(req) {
  const raw = await req.text();
  if (raw.length > RAW_MAX) return { tooLarge: true };
  try { return JSON.parse(raw); } catch { return null; }
}

// The body as typed: 1-5,000 characters, not only spaces. Mentions travel beside it (section 10).
function bodyOf(value) {
  if (typeof value !== 'string' || !value.trim()) return { error: refuse('Write a comment first.', 'empty', 400) };
  if (value.length > BODY_MAX) return { error: refuse(`Comments are at most ${BODY_MAX.toLocaleString('en-US')} characters.`, 'too_long', 413) };
  return { body: value };
}
const mentionsOf = value => (Array.isArray(value) ? value.slice(0, 50).filter(m => Number.isInteger(m?.pos) && Number.isInteger(m?.len) && typeof m?.handle === 'string').map(({ pos, len, handle }) => ({ pos, len, handle })) : []);

// Who can be mentioned (section 5, Mentions), by audience, never by thread: members threads - the owner and active members;
// public threads - the owner and public participants (accounts that posted publicly here), never a blocked account.
// A map of principal -> users.id ('' for an owner who has never posted or invited, so only the principal is known).
async function audienceSet(env, ctx, audience) {
  const db = env.LEARN_DB, { org, canvas, owner_email: owner } = ctx.board;
  const ownerId = ctx.actor.owner ? ctx.actor.uid : (await db.prepare('SELECT invited_by AS id FROM canvas_members WHERE org = ? AND canvas = ? LIMIT 1').bind(org, canvas).first())?.id
    || (await db.prepare('SELECT m.author_id AS id FROM canvas_comments m JOIN canvas_comment_threads t ON t.id = m.thread_id WHERE t.org = ? AND t.canvas = ? AND m.author_email = ? LIMIT 1').bind(org, canvas, owner).first())?.id || '';
  const people = new Map([[owner, ownerId]]);
  const { results } = audience === 'members'
    ? await db.prepare("SELECT member_email AS email, member_user_id AS id FROM canvas_members WHERE org = ? AND canvas = ? AND status = 'active'").bind(org, canvas).all()
    : await db.prepare(`SELECT DISTINCT m.author_email AS email, m.author_id AS id FROM canvas_comments m JOIN canvas_comment_threads t ON t.id = m.thread_id
        WHERE t.org = ?1 AND t.canvas = ?2 AND t.audience = 'public' AND m.author_id NOT IN (SELECT k.user_id FROM canvas_comment_blocks k WHERE k.org = ?1 AND k.canvas = ?2)`).bind(org, canvas).all();
  for (const row of results) if (!people.has(row.email)) people.set(row.email, row.id);
  return people;
}
// Public mention lookup (owner decision D5, 2026-10-23): in a PUBLIC thread an account may also be mentioned when it has made itself
// public - a handle with a profile description (the line its /@handle page shows) or with a live Explore publication. Everyone
// else is mentionable only through authorized participation (audienceSet above). A members thread never takes this: a mention
// there is only ever of someone who can already read it. A mention notifies at most and NEVER grants access to anything.
// `h` is a user_handles alias; blocked accounts are not offered.
const DISCOVERABLE = (h, org, canvas) => `(EXISTS (SELECT 1 FROM user_profile_descriptions d WHERE d.email = ${h}.email)
    OR EXISTS (SELECT 1 FROM canvas_publications pub JOIN canvases pc ON pc.org = pub.org AND pc.name = pub.canvas
      WHERE pc.owner_email = ${h}.email AND pc.archived_at IS NULL AND NOT ${IN_TRASH_TREE('pc.org', 'pc.name')}))
  AND ${h}.email NOT IN (SELECT k.user_email FROM canvas_comment_blocks k WHERE k.org = ${org} AND k.canvas = ${canvas})`;
// The mentions a post may keep: `@handle` exactly at its range (any case), naming an account in the audience's set.
// Anything else stays plain text and notifies nobody; the post still succeeds.
async function acceptMentions(env, ctx, audience, body, mentions) {
  if (!mentions.length) return [];
  const set = await audienceSet(env, ctx, audience), kept = [], used = new Set();
  const most = commentLimits(env).COMMENT_MENTIONS_MAX;
  for (const { pos, len, handle } of mentions) {
    if (kept.length >= most) break;
    if (pos < 0 || len < 2 || pos + len > body.length || used.has(pos) || body.slice(pos, pos + len).toLowerCase() !== `@${handle}`.toLowerCase()) continue;
    const row = await env.LEARN_DB.prepare('SELECT email, handle FROM user_handles WHERE handle = ?').bind(handle).first();
    if (!row) continue;
    if (!set.has(row.email) && !(audience === 'public' && await env.LEARN_DB.prepare(`SELECT 1 FROM user_handles h WHERE h.email = ? AND ${DISCOVERABLE('h', '?', '?')}`).bind(row.email, ctx.board.org, ctx.board.canvas).first())) continue;
    used.add(pos);
    kept.push({ pos, len, handle: row.handle, user_id: set.get(row.email) ?? '', user_email: row.email });
  }
  return kept;
}
const mentionRows = (db, commentId, kept) => kept.map(m => db.prepare('INSERT INTO canvas_comment_mentions (comment_id, pos, len, user_id, user_email) VALUES (?, ?, ?, ?, ?)').bind(commentId, m.pos, m.len, m.user_id, m.user_email));

// Segments (section 10): the text with each kept mention as a reference, so a renamed handle shows its new value; a
// mentioned account that no longer has a handle reads as its text.
async function mentionsFor(env, ids) {
  if (!ids.length) return new Map();
  const { results } = await env.LEARN_DB.prepare(`SELECT mm.comment_id, mm.pos, mm.len, ${PERSON('mm.user_email', 'p_')} FROM canvas_comment_mentions mm WHERE mm.comment_id IN (${ids.map(() => '?').join(', ')}) ORDER BY mm.pos`).bind(...ids).all();
  const by = new Map();
  for (const row of results) by.set(row.comment_id, [...(by.get(row.comment_id) || []), row]);
  return by;
}
export function segmentsOf(body, mentions = []) {
  const out = [];
  let at = 0;
  for (const m of mentions) {
    if (m.pos < at || !m.p_handle) continue;
    if (m.pos > at) out.push({ text: body.slice(at, m.pos) });
    out.push({ mention: { name: m.p_name ?? null, handle: m.p_handle } });
    at = m.pos + m.len;
  }
  if (at < body.length) out.push({ text: body.slice(at) });
  return out;
}

// Section 8: a card-relative anchor (it follows the object without a write) or a canvas point, in world units.
const OBJECT_KINDS = ['block', 'exchange', 'item', 'shape', 'group'];
const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e7;
const round = n => Math.round(n * 10) / 10;
export function anchorOf(a) {
  if (a?.kind === 'point' && finite(a.x) && finite(a.y)) return { kind: 'point', x: round(a.x), y: round(a.y) };
  if (a?.kind === 'object' && typeof a.object_id === 'string' && /^[\x21-\x7e]{1,100}$/.test(a.object_id) && OBJECT_KINDS.includes(a.object_kind) && finite(a.dx) && finite(a.dy))
  {
    // Comments v2 item 5: a card anchor may name what in the card it is about (comment-anchors.js). Only a card (block) has one.
    const target = targetOf(a.target);
    if (target === null || (target && a.object_kind !== 'block')) return null;
    return { kind: 'object', object_id: a.object_id, object_kind: a.object_kind, dx: round(a.dx), dy: round(a.dy), label: typeof a.label === 'string' ? a.label.trim().slice(0, 120) : '', ...(target ? { v: 2, target } : {}) };
  }
  return null;
}

// Section 9: per person per canvas, and per person everywhere. A refusal writes nothing.
async function limited(env, ctx) {
  const limits = commentLimits(env), now = Date.now();
  const since = ms => new Date(now - ms).toISOString();
  const row = await env.LEARN_DB.prepare(`SELECT
      (SELECT count(*) FROM canvas_comments m JOIN canvas_comment_threads t ON t.id = m.thread_id WHERE m.author_id = ?1 AND t.org = ?2 AND t.canvas = ?3 AND m.created_at > ?4) AS recent,
      (SELECT count(*) FROM canvas_comments m JOIN canvas_comment_threads t ON t.id = m.thread_id WHERE m.author_id = ?1 AND t.org = ?2 AND t.canvas = ?3 AND m.created_at > ?5) AS today,
      (SELECT count(*) FROM canvas_comments m WHERE m.author_id = ?1 AND m.created_at > ?5) AS everywhere`)
    .bind(ctx.actor.uid, ctx.board.org, ctx.board.canvas, since(10 * 60_000), since(24 * 3600_000)).first();
  // The window that is full, and when its oldest post leaves it: the first moment a post is allowed again.
  const full = row.recent >= limits.COMMENT_CANVAS_10MIN ? ['canvas', 10 * 60_000] : row.today >= limits.COMMENT_CANVAS_DAY ? ['canvas', 24 * 3600_000]
    : row.everywhere >= limits.COMMENT_PERSON_DAY ? ['person', 24 * 3600_000] : null;
  if (!full) return null;
  const [scope, window] = full;
  const db = env.LEARN_DB, from = since(window);
  const oldest = await (scope === 'canvas'
    ? db.prepare('SELECT min(m.created_at) AS at FROM canvas_comments m JOIN canvas_comment_threads t ON t.id = m.thread_id WHERE m.author_id = ? AND t.org = ? AND t.canvas = ? AND m.created_at > ?').bind(ctx.actor.uid, ctx.board.org, ctx.board.canvas, from)
    : db.prepare('SELECT min(m.created_at) AS at FROM canvas_comments m WHERE m.author_id = ? AND m.created_at > ?').bind(ctx.actor.uid, from)).first();
  const retry = Math.max(1, Math.ceil((Date.parse(oldest?.at) + window - now) / 1000) || 60);
  const refused = refuse("You've posted a lot in a short time. Try again in a few minutes.", 'limited', 429, { limited: true, retry_after: retry });
  refused.headers.set('Retry-After', String(retry));
  return refused;
}

const THREAD_COLUMNS = `t.id, t.audience, t.anchor_json, t.created_by, t.created_at, t.resolved_at, t.last_activity_at, t.message_count, ${PERSON('t.created_by_email', 'a_')},
  (SELECT c.color FROM canvas_comment_colors c WHERE c.thread_id = t.id) AS color,
  (SELECT count(*) FROM canvas_comments m WHERE m.thread_id = t.id AND m.deleted_at IS NULL) AS live,
  (SELECT count(*) FROM canvas_comments m WHERE m.thread_id = t.id AND m.deleted_at IS NULL AND m.author_id <> t.created_by) AS others`;
// A pin's colour: the canvas's six swatches (AdaptiveCanvas COLORS); no row is the default orange (CommentPins PIN_DEFAULT).
export const PIN_COLORS = ['#37352f', '#2383e2', '#b42318', '#1a7f37', '#f59e0b', '#7c3aed'];
// Deleting a whole thread: the canvas owner always; the starter only while every live message in it is theirs.
const mayDeleteThread = (ctx, row) => allowed(ctx, 'delete_any', row.audience)
  || (!!ctx.actor.uid && row.created_by === ctx.actor.uid && !row.others && allowed(ctx, 'delete_own', row.audience));
function threadShape(ctx, row) {
  const starter = !!ctx.actor.uid && row.created_by === ctx.actor.uid;
  return {
    id: row.id, audience: row.audience, anchor: JSON.parse(row.anchor_json), ...(row.anchor_state ? { anchor_state: row.anchor_state } : {}), color: row.color || null, status: row.resolved_at ? 'resolved' : 'open', author: person(row, 'a_'),
    created_at: row.created_at, last_activity_at: row.last_activity_at, replies: Math.max(0, row.message_count - 1), comments: row.live,
    hidden_from_public: row.audience === 'public' && ctx.mode === 'off',
    can: { reply: allowed(ctx, 'post', row.audience), resolve: allowed(ctx, 'resolve', row.audience, starter), color: allowed(ctx, 'resolve', row.audience, starter), delete: mayDeleteThread(ctx, row) },
  };
}
const MESSAGE_COLUMNS = `m.id, m.author_id, m.body, m.created_at, m.edited_at, m.deleted_at, m.deleted_by, ${PERSON('m.author_email', 'a_')}`;
function messageShape(ctx, audience, row, mentions = [], reactions = [], attachments = []) {
  const mine = !!ctx.actor.uid && row.author_id === ctx.actor.uid;
  const deleted = row.deleted_at ? (row.deleted_by === row.author_id ? 'author' : 'owner') : null;
  return {
    id: row.id, author: person(row, 'a_'), segments: deleted ? [] : segmentsOf(row.body, mentions), created_at: row.created_at, edited: !!row.edited_at && !deleted, deleted, mine,
    reactions: deleted ? [] : reactions, attachments: deleted ? [] : attachments,
    can: { edit: !deleted && mine && allowed(ctx, 'edit_own', audience), delete: !deleted && ((mine && allowed(ctx, 'delete_own', audience)) || allowed(ctx, 'delete_any', audience)),
      react: !deleted && allowed(ctx, 'post', audience), history: !deleted && !!row.edited_at && (mine || ctx.actor.owner) },
  };
}

// Reactions (migration 0030): one emoji of the shared set (comment-reactions.js) per account per comment, shown as {emoji, count, mine} in the set's
// order. Never who reacted: a tap does not name a person.
export { REACTIONS };
async function reactionsFor(env, ctx, ids) {
  if (!ids.length) return new Map();
  const { results } = await env.LEARN_DB.prepare(`SELECT comment_id, emoji, count(*) AS n, max(user_id = ?) AS mine FROM canvas_comment_reactions WHERE comment_id IN (${ids.map(() => '?').join(', ')}) GROUP BY comment_id, emoji`)
    .bind(ctx.actor.uid || '', ...ids).all();
  const by = new Map();
  for (const row of results) by.set(row.comment_id, [...(by.get(row.comment_id) || []), { emoji: row.emoji, count: row.n, mine: !!row.mine }]);
  for (const list of by.values()) list.sort((a, b) => REACTIONS.indexOf(a.emoji) - REACTIONS.indexOf(b.emoji));
  return by;
}
// A comment's files as {id, name, mime, bytes}: never the object key. They download through GET /attachments/:id.
async function attachmentsFor(env, ids) {
  if (!ids.length) return new Map();
  const { results } = await env.LEARN_DB.prepare(`SELECT id, comment_id, name, mime, bytes FROM canvas_comment_attachments WHERE purged_at IS NULL AND comment_id IN (${ids.map(() => '?').join(', ')}) ORDER BY created_at, id`).bind(...ids).all();
  const by = new Map();
  for (const row of results) by.set(row.comment_id, [...(by.get(row.comment_id) || []), { id: row.id, name: row.name, mime: row.mime, bytes: row.bytes }]);
  return by;
}
// Message rows as the actor sees them: mentions, reactions and files read once for the whole page.
async function shapes(env, ctx, audience, rows) {
  const ids = rows.map(row => row.id);
  const [mentions, reactions, files] = await Promise.all([mentionsFor(env, ids), reactionsFor(env, ctx, ids), attachmentsFor(env, ids)]);
  return rows.map(row => messageShape(ctx, audience, row, mentions.get(row.id), reactions.get(row.id), files.get(row.id)));
}

// A thread of this board (and public, through the public family) that the actor may read; anything else is 404, so
// an id from another canvas, thread or audience never answers with its data.
async function threadIn(env, ctx, id) {
  if (!UUID.test(id)) return null;
  const row = await env.LEARN_DB.prepare(`SELECT ${THREAD_COLUMNS} FROM canvas_comment_threads t WHERE t.id = ? AND t.board_id = ?${ctx.family === 'public' ? " AND t.audience = 'public'" : ''}`).bind(id, ctx.board.id).first();
  if (!row || !allowed(ctx, 'read', row.audience)) return null;
  const anchor = JSON.parse(row.anchor_json);
  if (anchor.kind !== 'object') return row;
  const live = await boardLive(env, ctx.board.id);
  if (!live.has(anchor)) return null;
  if (anchor.target) row.anchor_state = await stateOf(anchor.target, live.entry(anchor));
  return row;
}

// A deleted object's threads (owner decision 2026-10-23): hidden from every list, count and read - reloads, other sessions,
// members and the public alike - while the saved board lacks the object, and back as they were when it returns (Undo restores
// the same id). Never destroyed by the delete: the canvas's permanent delete purges them (canvases.js purgeCommentRows).
// A group is live while an object carries its groupId: state.groups keeps a group whose members were all deleted.
const CONTENT = ['blocks', 'exchanges', 'items', 'shapes'];
export function liveObjects(state) {
  const ids = new Set(), groups = new Set(), entries = new Map();
  for (const key of CONTENT) for (const entry of Array.isArray(state?.[key]) ? state[key] : []) {
    if (entry?.id) { ids.add(entry.id); entries.set(entry.id, entry); }
    if (entry?.groupId) groups.add(entry.groupId);
  }
  return { entry: anchor => entries.get(anchor?.object_id), has: anchor => anchor?.kind !== 'object' || (anchor.object_kind === 'group' ? groups : ids).has(anchor.object_id) };
}
async function boardLive(env, boardId) {
  const row = await env.LEARN_DB.prepare('SELECT state_json FROM learn_boards WHERE id = ?').bind(boardId).first();
  return liveObjects(JSON.parse(row?.state_json || '{}'));
}
// This board's hidden thread ids as one JSON parameter, for `t.id NOT IN (SELECT value FROM json_each(?))`: one parse of the
// board per request (about 3 ms at the 1.9 MB cap), and none on a canvas without object threads.
const OBJECT_THREADS = "SELECT id, board_id, anchor_json FROM canvas_comment_threads WHERE board_id = ? AND json_extract(anchor_json, '$.kind') = 'object'";
const NOT_HIDDEN = n => `t.id NOT IN (SELECT value FROM json_each(?${n}))`;
async function hiddenOn(env, boardId) {
  const { results } = await env.LEARN_DB.prepare(OBJECT_THREADS).bind(boardId).all();
  return JSON.stringify(await hiddenAmong(env, results));
}
// rows: {id, board_id, anchor_json}; the ids among them whose object is not on their board, each board read once.
async function hiddenAmong(env, rows) {
  const boards = new Map(), hidden = [];
  for (const row of rows) {
    const anchor = JSON.parse(row.anchor_json);
    if (anchor.kind !== 'object') continue;
    if (!boards.has(row.board_id)) boards.set(row.board_id, await boardLive(env, row.board_id));
    if (!boards.get(row.board_id).has(anchor)) hidden.push(row.id);
  }
  return hidden;
}
// Counts by key over thread rows {key, id, board_id, anchor_json}, without the hidden ones.
async function countVisible(env, rows) {
  const hidden = new Set(await hiddenAmong(env, rows)), counts = {};
  for (const row of rows) if (!hidden.has(row.id)) counts[row.key] = (counts[row.key] || 0) + 1;
  return counts;
}
// What a comment leaves beside it (reactions and edit history) goes with the comment, however it goes (migration 0030).
const purgeSide = (db, where, ...binds) => ['canvas_comment_reactions', 'canvas_comment_edits'].map(table => db.prepare(`DELETE FROM ${table} WHERE ${where}`).bind(...binds));
const missingThread = () => refuse("This thread isn't available.", 'thread_gone', 404);

// Unread (section 5): someone else posted after my last read. The member family tracks it for the owner and members;
// the public family for participants - people who posted in the thread or were mentioned in it.
const unreadSql = participantsOnly => `(?1 IS NOT NULL AND EXISTS (SELECT 1 FROM canvas_comments x WHERE x.thread_id = t.id AND x.author_id != ?1 AND x.deleted_at IS NULL
    AND x.created_at > COALESCE((SELECT r.read_at FROM canvas_comment_reads r WHERE r.thread_id = t.id AND r.user_id = ?1), ''))
    ${participantsOnly ? `AND (EXISTS (SELECT 1 FROM canvas_comments y WHERE y.thread_id = t.id AND y.author_id = ?1)
      OR EXISTS (SELECT 1 FROM canvas_comment_mentions mm JOIN canvas_comments z ON z.id = mm.comment_id WHERE z.thread_id = t.id AND mm.user_id = ?1))` : ''})`;

// Mention suggestions (section 10, people): up to 8 of the audience's set whose handle or name starts with q, never an
// email, never yourself, never someone without a handle (who cannot be mentioned). A new thread asks by audience; a reply
// by thread, and the audience is the thread's.
async function suggest(env, ctx, params) {
  let audience = ctx.family === 'public' ? 'public' : params.get('audience') === 'public' ? 'public' : 'members';
  if (params.get('thread')) {
    const thread = await threadIn(env, ctx, params.get('thread'));
    if (!thread) return missingThread();
    audience = thread.audience;
  }
  if (!allowed(ctx, 'post', audience)) return json({ people: [] });
  const set = [...(await audienceSet(env, ctx, audience)).keys()].filter(email => email !== ctx.actor.email);
  const q = (params.get('q') || '').trim().toLowerCase().replace(/^@/, '').slice(0, 40);
  const like = `${q.replace(/[\\%_]/g, char => `\\${char}`)}%`;
  const match = `(lower(h.handle) LIKE ? ESCAPE '\\' OR lower(COALESCE(${NAME_OF('h.email')}, '')) LIKE ? ESCAPE '\\')`;
  const found = set.length ? (await env.LEARN_DB.prepare(`SELECT ${PERSON('h.email', 'a_')} FROM user_handles h WHERE h.email IN (${set.map(() => '?').join(', ')}) AND ${match} ORDER BY h.handle LIMIT 8`)
    .bind(...set, like, like).all()).results : [];
  // A public thread also offers accounts that made themselves public (D5), once two characters are typed, so the list is never a directory.
  const open = audience === 'public' && q.length >= 2 && found.length < 8
    ? (await env.LEARN_DB.prepare(`SELECT ${PERSON('h.email', 'a_')} FROM user_handles h WHERE ${match} AND h.email <> ? AND ${DISCOVERABLE('h', '?', '?')} ORDER BY h.handle LIMIT 8`)
      .bind(like, like, ctx.actor.email, ctx.board.org, ctx.board.canvas).all()).results : [];
  const seen = new Set(found.map(row => row.a_handle));
  return json({ people: [...found, ...open.filter(row => !seen.has(row.a_handle))].slice(0, 8).map(row => person(row, 'a_')) });
}

async function listThreads(env, ctx, params) {
  const status = ['open', 'resolved', 'all'].includes(params.get('status')) ? params.get('status') : 'open';
  const audience = ctx.family === 'public' ? 'public' : ['members', 'public'].includes(params.get('audience')) ? params.get('audience') : null;
  const hidden = await hiddenOn(env, ctx.board.id);
  const conditions = ['t.board_id = ?2', NOT_HIDDEN(3)];
  if (status === 'open') conditions.push('t.resolved_at IS NULL');
  if (status === 'resolved') conditions.push('t.resolved_at IS NOT NULL');
  if (audience) conditions.push(`t.audience = '${audience}'`);
  const cursor = /^([^|]{1,40})\|([0-9a-f-]{36})$/i.exec(params.get('cursor') || '');
  if (cursor) conditions.push('(t.last_activity_at < ?4 OR (t.last_activity_at = ?4 AND t.id < ?5))');
  const { results } = await env.LEARN_DB.prepare(`SELECT ${THREAD_COLUMNS}, ${unreadSql(ctx.family === 'public')} AS unread,
      (SELECT f.body FROM canvas_comments f WHERE f.thread_id = t.id ORDER BY f.created_at, f.id LIMIT 1) AS first_body,
      (SELECT f.deleted_at IS NOT NULL FROM canvas_comments f WHERE f.thread_id = t.id ORDER BY f.created_at, f.id LIMIT 1) AS first_deleted
    FROM canvas_comment_threads t WHERE ${conditions.join(' AND ')} ORDER BY t.last_activity_at DESC, t.id DESC LIMIT ${PAGE + 1}`)
    .bind(ctx.actor.uid, ctx.board.id, hidden, ...(cursor ? [cursor[1], cursor[2]] : [])).all();
  const readable = results.filter(row => allowed(ctx, 'read', row.audience));
  const page = readable.slice(0, PAGE);
  if (page.some(row => row.anchor_json.includes('"target"'))) {
    const live = await boardLive(env, ctx.board.id);
    for (const row of page) { const anchor = JSON.parse(row.anchor_json); if (anchor.target) row.anchor_state = await stateOf(anchor.target, live.entry(anchor) ?? {}); }
  }
  // The toolbar badge (owner, 2026-10-21): every open thread with a live comment this reader may read, whatever page,
  // status or audience filter the list is on; the same read rule as the list, per audience.
  const { results: open } = await env.LEARN_DB.prepare(`SELECT t.audience, count(*) AS n FROM canvas_comment_threads t WHERE t.board_id = ?1 AND t.resolved_at IS NULL AND ${NOT_HIDDEN(2)}
      AND EXISTS (SELECT 1 FROM canvas_comments m WHERE m.thread_id = t.id AND m.deleted_at IS NULL) GROUP BY t.audience`).bind(ctx.board.id, hidden).all();
  const last = results.length > PAGE ? results[PAGE - 1] : null;
  return json({
    threads: page.map(row => ({ ...threadShape(ctx, row), unread: !!row.unread, preview: row.first_deleted ? null : (row.first_body || '').slice(0, 200) })),
    cursor: last ? `${last.last_activity_at}|${last.id}` : null,
    open_count: open.filter(row => allowed(ctx, 'read', row.audience)).reduce((sum, row) => sum + row.n, 0),
    has_public: ctx.family === 'public' || !!(await env.LEARN_DB.prepare(`SELECT 1 FROM canvas_comment_threads t WHERE t.board_id = ?1 AND t.audience = 'public' AND ${NOT_HIDDEN(2)} LIMIT 1`).bind(ctx.board.id, hidden).first()),
  });
}

// A full read, or with ?since=<cursor> only what changed (section 10, Sync protocol; comment-sync.js): the same access checks
// either way, and every answer carries the cursor for the next since-read.
async function readThread(env, ctx, id, params) {
  const cursor = new Date().toISOString();
  const thread = await threadIn(env, ctx, id);
  if (!thread) return missingThread();
  const before = /^([^|]{1,40})\|([0-9a-f-]{36})$/i.exec(params.get('before') || '');
  const from = before ? null : changesFrom(params.get('since'));
  if (from) {
    const { results } = await env.LEARN_DB.prepare(`SELECT ${MESSAGE_COLUMNS} FROM canvas_comments m WHERE m.thread_id = ?1
        AND (m.created_at > ?2 OR m.edited_at > ?2 OR m.deleted_at > ?2
          OR m.id IN (SELECT x.comment_id FROM canvas_comment_touches x WHERE x.thread_id = ?1 AND x.touched_at > ?2)) ORDER BY m.created_at, m.id LIMIT ${MESSAGES + 1}`).bind(thread.id, from).all();
    if (results.length <= MESSAGES) {
      return json({ thread: threadShape(ctx, thread), messages: await shapes(env, ctx, thread.audience, results), since: true, cursor, follow: await followOf(env, ctx, thread.id) });
    }
  }
  const { results } = await env.LEARN_DB.prepare(`SELECT ${MESSAGE_COLUMNS} FROM canvas_comments m WHERE m.thread_id = ?1
      ${before ? 'AND (m.created_at < ?2 OR (m.created_at = ?2 AND m.id < ?3))' : ''} ORDER BY m.created_at DESC, m.id DESC LIMIT ${MESSAGES + 1}`)
    .bind(thread.id, ...(before ? [before[1], before[2]] : [])).all();
  const page = results.slice(0, MESSAGES).reverse();
  return json({ thread: threadShape(ctx, thread), messages: await shapes(env, ctx, thread.audience, page),
    before: results.length > MESSAGES ? `${page[0].created_at}|${page[0].id}` : null, cursor, follow: await followOf(env, ctx, thread.id), ...(from ? { reset: true } : {}) });
}

const hashOf = parts => sha256Hex(JSON.stringify(parts));

// Files on a post (migration 0031). A post names the uploads it carries by id: `attachments: [id]`. The ids are parsed first
// (so a replayed post is recognised by its hash before anything is checked), then checked to be the caller's own waiting
// uploads on this canvas, then attached by statements that re-check the per-comment cap inside the batch.
function attachmentIds(env, value) {
  if (value === undefined) return { ids: null };
  const max = commentLimits(env).COMMENT_ATTACH_COMMENT_MAX;
  const ids = Array.isArray(value) ? [...new Set(value)] : null;
  if (!ids || !ids.every(id => typeof id === 'string' && UUID.test(id))) return { error: refuse('Those attachments are not valid.', 'bad_attachment', 400) };
  if (ids.length > max) return { error: refuse(`A comment holds at most ${max} attachments.`, 'too_many_attachments', 413) };
  return { ids: ids.sort() };
}
async function attachmentsReady(env, ctx, fresh) {
  if (!fresh.length) return null;
  const { results } = await env.LEARN_DB.prepare(`SELECT id FROM canvas_comment_attachments WHERE id IN (${fresh.map(() => '?').join(', ')}) AND uploader_id = ? AND org = ? AND canvas = ? AND comment_id IS NULL AND purged_at IS NULL`)
    .bind(...fresh, ctx.actor.uid, ctx.board.org, ctx.board.canvas).all();
  return results.length === fresh.length ? null : refuse('An attachment is no longer available. Remove it and attach it again.', 'bad_attachment', 409);
}
const attachRows = (env, ctx, commentId, threadId, ids) => ids.map(id => env.LEARN_DB.prepare(`UPDATE canvas_comment_attachments SET comment_id = ?1, thread_id = ?2 WHERE id = ?3 AND uploader_id = ?4 AND org = ?5 AND canvas = ?6
    AND comment_id IS NULL AND purged_at IS NULL AND (SELECT count(*) FROM canvas_comment_attachments a WHERE a.comment_id = ?1 AND a.purged_at IS NULL) < ?7`)
  .bind(commentId, threadId, id, ctx.actor.uid, ctx.board.org, ctx.board.canvas, commentLimits(env).COMMENT_ATTACH_COMMENT_MAX));
// Access to files goes at once (purged_at is set in the caller's batch); the objects follow in releasePurged.
const purgeAttachments = (db, where, ...binds) => db.prepare(`UPDATE canvas_comment_attachments SET purged_at = ? WHERE purged_at IS NULL AND ${where}`).bind(new Date().toISOString(), ...binds);

async function startThread(req, env, ctx) {
  const input = await readJson(req);
  if (input?.tooLarge) return refuse('That comment is too long.', 'too_long', 413);
  if (!UUID.test(input?.id || '')) return refuse('A new thread needs a client id (a UUID).', 'bad_id', 400);
  const audience = ctx.family === 'public' ? 'public' : input.audience === 'public' ? 'public' : 'members';
  if (!allowed(ctx, 'post', audience)) return postRefusal(ctx, audience);
  const anchor = anchorOf(input.anchor);
  if (!anchor || JSON.stringify(anchor).length > 2048) return refuse('Choose where the comment goes.', 'bad_anchor', 400);
  // SHARE-02: a visitor's temporary copy has objects only they see; a comment may name only an object on the canvas itself.
  // The owner too (owner decision 2026-10-23: no new comment on a deleted object): the owner's page saves its board before
  // posting on an object, so an object drawn a moment ago is on the server copy by then.
  const sent = JSON.stringify(anchor); // the anchor as sent: the retry hash must not depend on the card's fingerprint taken below
  const live = anchor.kind === 'object' ? await boardLive(env, ctx.board.id) : null;
  if (live && !live.has(anchor)) return refuse("That object isn't on this canvas, so it can't take a comment.", 'object_not_on_canvas', 409);
  if (anchor.target) {
    // What the card holds NOW is the baseline the thread is compared with later; a quote the card does not hold is refused.
    const card = live.entry(anchor), { target } = anchor;
    if ((target.kind === 'text' || target.kind === 'code') && !holdsQuote(card, target.quote)) return refuse("That text isn't on this card any more.", 'quote_not_on_card', 409);
    Object.assign(target, target.kind === 'code' ? locate(card, target.quote) || {} : {}, { hash: await fingerprint(card) });
  }
  const { body, error } = bodyOf(input.body);
  if (error) return error;
  const mentions = mentionsOf(input.mentions);
  const files = attachmentIds(env, input.attachments);
  if (files.error) return files.error;
  const hash = await hashOf([ctx.actor.uid, ctx.board.id, audience, sent, body, mentions, ...(files.ids?.length ? [files.ids] : [])]);
  const replay = await sameCreate(env, 'canvas_comment_threads', input.id, hash);
  if (replay) return replay === 'conflict' ? idConflict() : threadReply(env, ctx, input.id, 200);
  const over = await limited(env, ctx);
  if (over) return over;
  const notReady = await attachmentsReady(env, ctx, files.ids || []);
  if (notReady) return notReady;
  const now = new Date().toISOString();
  const db = env.LEARN_DB;
  const kept = await acceptMentions(env, ctx, audience, body, mentions), first = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare('INSERT INTO canvas_comment_threads (id, board_id, org, canvas, audience, anchor_json, created_by, created_by_email, create_hash, created_at, last_activity_at, message_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
        .bind(input.id, ctx.board.id, ctx.board.org, ctx.board.canvas, audience, JSON.stringify(anchor), ctx.actor.uid, ctx.actor.email, hash, now, now),
      db.prepare('INSERT INTO canvas_comments (id, thread_id, author_id, author_email, body, create_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(first, input.id, ctx.actor.uid, ctx.actor.email, body, hash, now),
      ...mentionRows(db, first, kept),
      ...attachRows(env, ctx, first, input.id, files.ids || []),
    ]);
  } catch (failure) {
    // Two copies of one post raced: the loser reads the winner's row, or the id belongs to someone else.
    const raced = await sameCreate(env, 'canvas_comment_threads', input.id, hash);
    if (!raced) throw failure;
    return raced === 'conflict' ? idConflict() : threadReply(env, ctx, input.id, 200);
  }
  return threadReply(env, ctx, input.id, 201);
}
async function threadReply(env, ctx, id, status) {
  const thread = await env.LEARN_DB.prepare(`SELECT ${THREAD_COLUMNS} FROM canvas_comment_threads t WHERE t.id = ?`).bind(id).first();
  const anchor = JSON.parse(thread.anchor_json);
  if (anchor.target) thread.anchor_state = await stateOf(anchor.target, (await boardLive(env, ctx.board.id)).entry(anchor) ?? {}); // 'ok' for a thread just started
  const first = await env.LEARN_DB.prepare(`SELECT ${MESSAGE_COLUMNS} FROM canvas_comments m WHERE m.thread_id = ? ORDER BY m.created_at, m.id LIMIT 1`).bind(id).first();
  const mentions = (await mentionsFor(env, [first.id])).get(first.id) || [];
  return json({ thread: threadShape(ctx, thread), comment: (await shapes(env, ctx, thread.audience, [first]))[0], accepted_mentions: mentions.map(m => ({ pos: m.pos, len: m.len, handle: m.p_handle })) }, status);
}
// An id that exists already: the same author retrying the same post to the same target gets it back; anything else
// is a conflict with no content, so someone else's id never returns their comment.
async function sameCreate(env, table, id, hash) {
  const row = await env.LEARN_DB.prepare(`SELECT create_hash FROM ${table} WHERE id = ?`).bind(id).first();
  return row ? (row.create_hash === hash ? 'same' : 'conflict') : null;
}
const idConflict = () => refuse('That id is already used.', 'id_conflict', 409);

function postRefusal(ctx, audience) {
  if (!ctx.actor.signedIn) return refuse('Sign in to comment.', 'sign_in', 401, { signIn: true });
  if (!ctx.enabled && !ctx.actor.owner) return refuse('Comments are turned off for this canvas.', 'comments_off', 403);
  if (audience === 'public' && ctx.actor.blocked) return refuse("You can't comment publicly on this canvas. You can still read its public comments.", 'blocked', 403);
  if (audience === 'public' && ctx.mode === 'closed') return refuse('Comments are closed. Existing comments stay visible.', 'closed', 403);
  if (audience === 'public') return refuse('Public comments are off for this canvas.', 'public_off', 403);
  return refuse("You can't comment here.", 'forbidden', 403);
}

async function reply(req, env, ctx, threadId) {
  const thread = await threadIn(env, ctx, threadId);
  if (!thread) return missingThread();
  const input = await readJson(req);
  if (input?.tooLarge) return refuse('That comment is too long.', 'too_long', 413);
  if (!UUID.test(input?.id || '')) return refuse('A reply needs a client id (a UUID).', 'bad_id', 400);
  if (!allowed(ctx, 'post', thread.audience)) return postRefusal(ctx, thread.audience);
  const { body, error } = bodyOf(input.body);
  if (error) return error;
  const mentions = mentionsOf(input.mentions);
  const files = attachmentIds(env, input.attachments);
  if (files.error) return files.error;
  const hash = await hashOf([ctx.actor.uid, thread.id, body, mentions, ...(files.ids?.length ? [files.ids] : [])]);
  const replay = await sameCreate(env, 'canvas_comments', input.id, hash);
  if (replay) return replay === 'conflict' ? idConflict() : commentReply(env, ctx, thread, input.id, 200);
  // ponytail: check-then-insert, so concurrent replies can pass the thread cap by a few; a conditional insert if that matters.
  if (thread.message_count >= commentLimits(env).COMMENT_THREAD_MAX) return refuse('This thread is full. Start a new thread.', 'thread_full', 409);
  const over = await limited(env, ctx);
  if (over) return over;
  const notReady = await attachmentsReady(env, ctx, files.ids || []);
  if (notReady) return notReady;
  const now = new Date().toISOString();
  const db = env.LEARN_DB;
  const kept = await acceptMentions(env, ctx, thread.audience, body, mentions);
  try {
    await db.batch([
      db.prepare('INSERT INTO canvas_comments (id, thread_id, author_id, author_email, body, create_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(input.id, thread.id, ctx.actor.uid, ctx.actor.email, body, hash, now),
      db.prepare('UPDATE canvas_comment_threads SET message_count = message_count + 1, last_activity_at = ? WHERE id = ?').bind(now, thread.id),
      ...mentionRows(db, input.id, kept),
      ...attachRows(env, ctx, input.id, thread.id, files.ids || []),
    ]);
  } catch (failure) {
    const raced = await sameCreate(env, 'canvas_comments', input.id, hash);
    if (!raced) throw failure;
    return raced === 'conflict' ? idConflict() : commentReply(env, ctx, thread, input.id, 200);
  }
  return commentReply(env, ctx, thread, input.id, 201);
}
async function commentReply(env, ctx, thread, id, status) {
  const row = await env.LEARN_DB.prepare(`SELECT ${MESSAGE_COLUMNS} FROM canvas_comments m WHERE m.id = ? AND m.thread_id = ?`).bind(id, thread.id).first();
  if (!row) return idConflict();
  const mentions = (await mentionsFor(env, [id])).get(id) || [];
  return json({ comment: (await shapes(env, ctx, thread.audience, [row]))[0], accepted_mentions: mentions.map(m => ({ pos: m.pos, len: m.len, handle: m.p_handle })) }, status);
}

// A comment of a thread this actor may read on this board; else 404.
async function commentIn(env, ctx, id) {
  if (!UUID.test(id)) return null;
  const row = await env.LEARN_DB.prepare(`SELECT ${MESSAGE_COLUMNS}, m.thread_id FROM canvas_comments m JOIN canvas_comment_threads t ON t.id = m.thread_id
    WHERE m.id = ? AND t.board_id = ?${ctx.family === 'public' ? " AND t.audience = 'public'" : ''}`).bind(id, ctx.board.id).first();
  if (!row) return null;
  const thread = await threadIn(env, ctx, row.thread_id);
  return thread ? { row, thread } : null;
}

async function editComment(req, env, ctx, id) {
  const found = await commentIn(env, ctx, id);
  if (!found || found.row.deleted_at) return refuse('This comment was deleted.', 'comment_gone', 404);
  if (found.row.author_id !== ctx.actor.uid) return refuse('Only its author can edit a comment.', 'forbidden', 403);
  if (!allowed(ctx, 'edit_own', found.thread.audience)) return postRefusal(ctx, found.thread.audience);
  const input = await readJson(req);
  if (input?.tooLarge) return refuse('That comment is too long.', 'too_long', 413);
  const { body, error } = bodyOf(input?.body);
  if (error) return error;
  // An edit sends the whole new body and its full mentions; the stored ones are replaced. `attachments`, when sent, is the whole
  // list the comment keeps: ids left out are removed, new ones (the caller's waiting uploads) are added.
  const files = attachmentIds(env, input.attachments);
  if (files.error) return files.error;
  const had = (await env.LEARN_DB.prepare('SELECT id FROM canvas_comment_attachments WHERE comment_id = ? AND purged_at IS NULL').bind(id).all()).results.map(row => row.id);
  const fresh = files.ids ? files.ids.filter(file => !had.includes(file)) : [], removed = files.ids ? had.filter(file => !files.ids.includes(file)) : [];
  const notReady = await attachmentsReady(env, ctx, fresh);
  if (notReady) return notReady;
  const kept = await acceptMentions(env, ctx, found.thread.audience, body, mentionsOf(input.mentions));
  const db = env.LEARN_DB, now = new Date().toISOString();
  await db.batch([
    // The text this edit replaces, with its mention ranges, for the author and the owner (migration 0030); the newest 20 stay.
    db.prepare(`INSERT INTO canvas_comment_edits (id, comment_id, body, mentions_json, replaced_at)
      SELECT ?, c.id, c.body, COALESCE((SELECT json_group_array(json_object('pos', mm.pos, 'len', mm.len)) FROM canvas_comment_mentions mm WHERE mm.comment_id = c.id), '[]'), ? FROM canvas_comments c WHERE c.id = ?`).bind(crypto.randomUUID(), now, id),
    db.prepare('DELETE FROM canvas_comment_edits WHERE comment_id = ?1 AND id NOT IN (SELECT e.id FROM canvas_comment_edits e WHERE e.comment_id = ?1 ORDER BY e.replaced_at DESC, e.id DESC LIMIT 20)').bind(id),
    db.prepare('UPDATE canvas_comments SET body = ?, edited_at = ? WHERE id = ?').bind(body, now, id),
    db.prepare('DELETE FROM canvas_comment_mentions WHERE comment_id = ?').bind(id),
    ...mentionRows(db, id, kept),
    ...removed.map(file => purgeAttachments(db, 'comment_id = ? AND id = ?', id, file)),
    ...attachRows(env, ctx, id, found.thread.id, fresh),
  ]);
  if (removed.length) await releasePurged(env, ctx.board.org, ctx.board.canvas);
  return commentReply(env, ctx, found.thread, id, 200);
}

async function deleteComment(env, ctx, id) {
  const found = await commentIn(env, ctx, id);
  if (!found || found.row.deleted_at) return refuse('This comment was deleted.', 'comment_gone', 404);
  const mine = found.row.author_id === ctx.actor.uid;
  if (!(mine ? allowed(ctx, 'delete_own', found.thread.audience) : allowed(ctx, 'delete_any', found.thread.audience))) return refuse("You can't delete this comment.", 'forbidden', 403);
  const db = env.LEARN_DB;
  await db.batch([
    db.prepare('UPDATE canvas_comments SET deleted_at = ?, deleted_by = ? WHERE id = ?').bind(new Date().toISOString(), ctx.actor.uid, id),
    db.prepare('DELETE FROM canvas_comment_mentions WHERE comment_id = ?').bind(id),
    ...purgeSide(db, 'comment_id = ?', id),
    purgeAttachments(db, 'comment_id = ?', id),
  ]);
  await releasePurged(env, ctx.board.org, ctx.board.canvas);
  return commentReply(env, ctx, found.thread, id, 200);
}

// A reaction (migration 0030): { emoji, on } sets or clears the caller's own, idempotently; whoever may post here may react.
async function react(req, env, ctx, id) {
  const found = await commentIn(env, ctx, id);
  if (!found || found.row.deleted_at) return refuse('This comment was deleted.', 'comment_gone', 404);
  if (!allowed(ctx, 'post', found.thread.audience)) return postRefusal(ctx, found.thread.audience);
  const input = await readJson(req);
  if (!REACTIONS.includes(input?.emoji) || typeof input?.on !== 'boolean') return refuse('Pick one of the reactions.', 'bad_reaction', 400);
  const db = env.LEARN_DB, now = new Date().toISOString();
  await db.batch([
    input.on ? db.prepare('INSERT OR IGNORE INTO canvas_comment_reactions (comment_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)').bind(id, ctx.actor.uid, input.emoji, now)
      : db.prepare('DELETE FROM canvas_comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?').bind(id, ctx.actor.uid, input.emoji),
    db.prepare('INSERT INTO canvas_comment_touches (comment_id, thread_id, touched_at) VALUES (?, ?, ?) ON CONFLICT (comment_id) DO UPDATE SET touched_at = excluded.touched_at').bind(id, found.row.thread_id, now),
  ]);
  return commentReply(env, ctx, found.thread, id, 200);
}

// What an edit replaced, newest first: the comment's author and the canvas owner only, and nothing once it is deleted.
async function editHistory(env, ctx, id) {
  const found = await commentIn(env, ctx, id);
  if (!found || found.row.deleted_at) return refuse('This comment was deleted.', 'comment_gone', 404);
  if (found.row.author_id !== ctx.actor.uid && !ctx.actor.owner) return refuse("You can't see this comment's history.", 'forbidden', 403);
  const { results } = await env.LEARN_DB.prepare('SELECT body, replaced_at FROM canvas_comment_edits WHERE comment_id = ? ORDER BY replaced_at DESC, id DESC').bind(id).all();
  return json({ edits: results.map(row => ({ body: row.body, replaced_at: row.replaced_at })) });
}

// A new PUBLIC thread from a members thread (owner decision D6, 2026-10-23): the author of a comment offers some of their OWN words
// publicly. `{ id, comment_id, text? }`: the text is a verbatim piece of that author's own comment (all of it when omitted).
// Nothing else is copied - no other reply, no file, no mention, no reaction, no participant, no history - and nothing links the
// new thread to the old one, so the public thread says nothing of the private one. The new thread is the author's, on the same
// anchor, under the usual public rules (the public setting, blocks, the rate limits).
async function publicCopy(req, env, ctx, threadId) {
  const thread = await threadIn(env, ctx, threadId);
  if (!thread) return missingThread();
  if (thread.audience !== 'members') return refuse('This thread is already public.', 'already_public', 400);
  if (!allowed(ctx, 'post', 'public')) return postRefusal(ctx, 'public');
  const input = await readJson(req);
  if (input?.tooLarge) return refuse('That comment is too long.', 'too_long', 413);
  if (!UUID.test(input?.id || '') || !UUID.test(input?.comment_id || '')) return refuse('A public copy needs a client id and a comment (UUIDs).', 'bad_id', 400);
  const source = await env.LEARN_DB.prepare('SELECT body, author_id, deleted_at FROM canvas_comments WHERE id = ? AND thread_id = ?').bind(input.comment_id, thread.id).first();
  if (!source || source.deleted_at) return refuse('This comment was deleted.', 'comment_gone', 404);
  if (source.author_id !== ctx.actor.uid) return refuse('You can only share your own words.', 'forbidden', 403);
  const text = input.text === undefined ? source.body : input.text;
  if (typeof text !== 'string' || !text.trim() || !source.body.includes(text)) return refuse('Choose words from your own comment.', 'bad_text', 400);
  const hash = await hashOf([ctx.actor.uid, ctx.board.id, 'public-copy', thread.id, input.comment_id, text]);
  const replay = await sameCreate(env, 'canvas_comment_threads', input.id, hash);
  if (replay) return replay === 'conflict' ? idConflict() : threadReply(env, ctx, input.id, 200);
  const over = await limited(env, ctx);
  if (over) return over;
  const now = new Date().toISOString(), db = env.LEARN_DB, first = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare('INSERT INTO canvas_comment_threads (id, board_id, org, canvas, audience, anchor_json, created_by, created_by_email, create_hash, created_at, last_activity_at, message_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
        .bind(input.id, ctx.board.id, ctx.board.org, ctx.board.canvas, 'public', thread.anchor_json, ctx.actor.uid, ctx.actor.email, hash, now, now),
      db.prepare('INSERT INTO canvas_comments (id, thread_id, author_id, author_email, body, create_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(first, input.id, ctx.actor.uid, ctx.actor.email, text, hash, now),
    ]);
  } catch (failure) {
    const raced = await sameCreate(env, 'canvas_comment_threads', input.id, hash);
    if (!raced) throw failure;
    return raced === 'conflict' ? idConflict() : threadReply(env, ctx, input.id, 200);
  }
  return threadReply(env, ctx, input.id, 201);
}

// Upload (migration 0031, D3): the raw file as the body, its type in Content-Type and its name in X-File-Name (URL-encoded),
// `?audience=public` for a new public thread's file. The caller must be able to post here. The file is checked by its first bytes,
// then RESERVED by one conditional INSERT that holds the canvas total and the caller's waiting uploads to their caps in the same
// statement - parallel uploads cannot both pass a check - and only then written to the bucket; a failed write drops the reservation.
// It waits, unattached, until a post names it; an hour later it is swept.
const typed = value => { try { return decodeURIComponent(value || '').slice(0, 300); } catch { return ''; } };
async function uploadAttachment(req, env, ctx, params) {
  const bucket = learnMedia(env);
  if (!bucket) return refuse('Attachments need the R2 bucket on this worker.', 'unavailable', 503);
  const audience = ctx.family === 'public' || params.get('audience') === 'public' ? 'public' : 'members';
  if (!allowed(ctx, 'post', audience)) return postRefusal(ctx, audience);
  const mime = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const format = ATTACHMENT_TYPES[mime];
  if (!format) return refuse(ATTACHMENT_NOTE, 'bad_type', 415);
  const limits = commentLimits(env), mb = bytes => `${Math.round(bytes / (1024 * 1024))} MB`;
  const got = await uploadBody(req, { cap: limits.COMMENT_ATTACH_FILE_BYTES, sniffBytes: HEAD_BYTES });
  if (got.refused === 'over') return refuse(`Files are at most ${mb(limits.COMMENT_ATTACH_FILE_BYTES)}.`, 'file_too_big', 413);
  if (got.refused === 'length') return refuse('Send this file with its Content-Length.', 'length_required', 411);
  if (!got.length) return refuse('That file is empty.', 'empty', 400);
  if (!FORMATS[format](got.head)) return refuse('This file is not what its type says.', 'bad_file', 415);
  const db = env.LEARN_DB, now = new Date(), { org, canvas } = ctx.board;
  // Uploads nobody attached within the hour no longer count against the caps.
  await db.prepare('UPDATE canvas_comment_attachments SET purged_at = ? WHERE org = ? AND canvas = ? AND comment_id IS NULL AND purged_at IS NULL AND created_at < ?')
    .bind(now.toISOString(), org, canvas, new Date(now.getTime() - 3600_000).toISOString()).run();
  await releasePurged(env, org, canvas);
  const id = crypto.randomUUID(), key = `comment-attachments/${ctx.board.id}/${id}`, name = safeName(typed(req.headers.get('x-file-name')));
  const reserved = await db.prepare(`INSERT INTO canvas_comment_attachments (id, org, canvas, uploader_id, object_key, name, mime, bytes, created_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
    WHERE (SELECT COALESCE(SUM(a.bytes), 0) FROM canvas_comment_attachments a WHERE a.org = ?2 AND a.canvas = ?3 AND a.purged_at IS NULL) + ?8 <= ?10
      AND (SELECT count(*) FROM canvas_comment_attachments a WHERE a.org = ?2 AND a.canvas = ?3 AND a.uploader_id = ?4 AND a.comment_id IS NULL AND a.purged_at IS NULL) < ?11`)
    .bind(id, org, canvas, ctx.actor.uid, key, name, mime, got.length, now.toISOString(), limits.COMMENT_ATTACH_CANVAS_BYTES, limits.COMMENT_ATTACH_COMMENT_MAX).run();
  if (!reserved.meta?.changes) {
    const waiting = await db.prepare('SELECT count(*) AS n FROM canvas_comment_attachments WHERE org = ? AND canvas = ? AND uploader_id = ? AND comment_id IS NULL AND purged_at IS NULL').bind(org, canvas, ctx.actor.uid).first();
    return waiting.n >= limits.COMMENT_ATTACH_COMMENT_MAX ? refuse('Send or remove the files you already attached first.', 'too_many_waiting', 429)
      : refuse(`This canvas's comment attachments are full (${mb(limits.COMMENT_ATTACH_CANVAS_BYTES)}). Delete a comment with files to make room.`, 'canvas_full', 413);
  }
  try { await bucket.put(key, got.body, { httpMetadata: { contentType: mime } }); } catch (error) {
    await db.prepare('DELETE FROM canvas_comment_attachments WHERE id = ?').bind(id).run();
    throw error;
  }
  return json({ attachment: { id, name, mime, bytes: got.length } }, 201);
}

// A file, to whoever may read its thread NOW (threadIn re-runs on every request, so a removed member, a turned-off link, a
// deleted comment or a purged file ends access at once). A file still waiting to be attached is its uploader's alone.
async function downloadAttachment(env, ctx, id) {
  const gone = () => refuse("This file isn't available.", 'attachment_gone', 404);
  if (!UUID.test(id)) return gone();
  const row = await env.LEARN_DB.prepare('SELECT thread_id, comment_id, uploader_id, object_key, name, mime FROM canvas_comment_attachments WHERE id = ? AND org = ? AND canvas = ? AND purged_at IS NULL')
    .bind(id, ctx.board.org, ctx.board.canvas).first();
  if (!row) return gone();
  if (row.comment_id) {
    const thread = await threadIn(env, ctx, row.thread_id);
    const live = thread && await env.LEARN_DB.prepare('SELECT 1 FROM canvas_comments WHERE id = ? AND thread_id = ? AND deleted_at IS NULL').bind(row.comment_id, row.thread_id).first();
    if (!live) return gone();
  } else if (!ctx.actor.uid || row.uploader_id !== ctx.actor.uid) return gone();
  const object = await learnMedia(env)?.get(row.object_key);
  if (!object) return gone();
  const image = row.mime.startsWith('image/');
  return new Response(object.body, { headers: {
    'Content-Type': row.mime, 'Content-Length': String(object.size ?? ''),
    'Content-Disposition': `${image ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Cache-Control': 'private, no-store',
  } });
}

// A pin's colour (section 8, owner 2026-10-08): the palette only, by whoever may resolve the thread; never the board.
async function setColor(req, env, ctx, id) {
  const thread = await threadIn(env, ctx, id);
  if (!thread) return missingThread();
  if (!allowed(ctx, 'resolve', thread.audience, thread.created_by === ctx.actor.uid)) return refuse("You can't change this comment's colour.", 'forbidden', 403);
  const input = await readJson(req);
  if (!PIN_COLORS.includes(input?.color)) return refuse('Pick a colour from the palette.', 'bad_color', 400);
  await env.LEARN_DB.prepare('INSERT INTO canvas_comment_colors (thread_id, color, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (thread_id) DO UPDATE SET color = excluded.color, updated_by = excluded.updated_by, updated_at = excluded.updated_at')
    .bind(thread.id, input.color, ctx.actor.uid, new Date().toISOString()).run();
  return json({ thread: threadShape(ctx, await threadIn(env, ctx, id)) });
}

// Del on a pin (owner, 2026-10-08): the whole thread, permanently - messages, mentions, read marks and colour.
// ponytail: a deleted thread's messages leave the rate-limit counts; keep tombstones if delete-and-repost floods a canvas.
async function deleteThread(env, ctx, id) {
  const thread = await threadIn(env, ctx, id);
  if (!thread) return missingThread();
  if (!mayDeleteThread(ctx, thread)) {
    const theirs = thread.created_by === ctx.actor.uid && thread.others;
    return refuse(theirs ? 'Others have replied, so only the canvas owner can delete this thread.' : "You can't delete this thread.", 'forbidden', 403);
  }
  const db = env.LEARN_DB;
  await db.batch([
    db.prepare('DELETE FROM canvas_comment_mentions WHERE comment_id IN (SELECT id FROM canvas_comments WHERE thread_id = ?)').bind(thread.id),
    ...purgeSide(db, 'comment_id IN (SELECT id FROM canvas_comments WHERE thread_id = ?)', thread.id),
    db.prepare('DELETE FROM canvas_comment_touches WHERE thread_id = ?').bind(thread.id),
    db.prepare('DELETE FROM canvas_comment_follows WHERE thread_id = ?').bind(thread.id),
    purgeAttachments(db, 'thread_id = ?', thread.id),
    db.prepare('DELETE FROM canvas_comments WHERE thread_id = ?').bind(thread.id),
    db.prepare('DELETE FROM canvas_comment_reads WHERE thread_id = ?').bind(thread.id),
    db.prepare('DELETE FROM canvas_comment_colors WHERE thread_id = ?').bind(thread.id),
    db.prepare('DELETE FROM canvas_comment_threads WHERE id = ?').bind(thread.id),
  ]);
  await releasePurged(env, ctx.board.org, ctx.board.canvas);
  return json({ deleted: thread.id });
}

async function resolve(env, ctx, id, open) {
  const thread = await threadIn(env, ctx, id);
  if (!thread) return missingThread();
  if (!allowed(ctx, 'resolve', thread.audience, thread.created_by === ctx.actor.uid)) return refuse("You can't resolve this thread.", 'forbidden', 403);
  await env.LEARN_DB.prepare('UPDATE canvas_comment_threads SET resolved_at = ?, resolved_by = ? WHERE id = ?')
    .bind(open ? null : new Date().toISOString(), open ? null : ctx.actor.uid, thread.id).run();
  return json({ thread: threadShape(ctx, await threadIn(env, ctx, id)) });
}

async function markRead(env, ctx, id) {
  const thread = await threadIn(env, ctx, id);
  if (!thread) return missingThread();
  if (!allowed(ctx, 'mark_read', thread.audience)) return json({ read: false });
  await env.LEARN_DB.prepare('INSERT INTO canvas_comment_reads (thread_id, user_id, read_at) VALUES (?, ?, ?) ON CONFLICT (thread_id, user_id) DO UPDATE SET read_at = excluded.read_at')
    .bind(thread.id, ctx.actor.uid, new Date().toISOString()).run();
  return json({ read: true });
}

// Ungroup (owner decision 2026-10-23): a group's threads become canvas threads at its former place before the group goes, and
// the Ungroup's Undo puts them back. The owner's only - moving comments with the canvas is an edit of the canvas, never a
// commenter's right. { ungroup: [{ id: group id, x, y }] } or { regroup: [group id] }; the answer is { threads: [{ id, anchor }] },
// every thread of those groups as it now is.
// Atomic: every update of one request is one D1 batch (one transaction), so a failure moves nothing. Idempotent by target: a
// moved thread keeps the group anchor it had under `ungrouped` - a retry, a lost answer's resend or a concurrent duplicate
// finds it there and writes the same place again, and Regroup restores exactly that anchor, so no thread is ever moved twice
// or left half-moved. An object target is not checked against the saved board: the Undo's group reaches it with the next
// save, and until then the thread is hidden, as any thread of a missing object.
const OBJECT_ID = /^[!-~]{1,100}$/;
async function moveAnchors(req, env, ctx) {
  if (!ctx.actor.owner) return refuse('Only the owner moves comments.', 'forbidden', 403);
  const input = await readJson(req);
  const ungroup = Array.isArray(input?.ungroup) ? input.ungroup.slice(0, 100) : null;
  const regroup = Array.isArray(input?.regroup) ? input.regroup.slice(0, 100) : null;
  const gids = ungroup ? ungroup.map(spot => spot?.id) : regroup || [];
  if (!gids.length || !gids.every(id => typeof id === 'string' && OBJECT_ID.test(id))) return refuse('Nothing to move.', 'bad_move', 400);
  const points = ungroup?.map(spot => anchorOf({ kind: 'point', x: spot.x, y: spot.y }));
  if (points?.some(point => !point)) return refuse('Choose where the comment goes.', 'bad_anchor', 400);
  const db = env.LEARN_DB, was = "json_extract(anchor_json, '$.ungrouped.object_id') = ?2 AND json_extract(anchor_json, '$.kind') = 'point'";
  await db.batch(gids.flatMap((gid, i) => (ungroup ? [
    db.prepare(`UPDATE canvas_comment_threads SET anchor_json = json_set(anchor_json, '$.x', ?3, '$.y', ?4) WHERE board_id = ?1 AND ${was}`).bind(ctx.board.id, gid, points[i].x, points[i].y),
    db.prepare(`UPDATE canvas_comment_threads SET anchor_json = json_object('kind', 'point', 'x', ?3, 'y', ?4, 'ungrouped', json(anchor_json))
      WHERE board_id = ?1 AND json_extract(anchor_json, '$.kind') = 'object' AND json_extract(anchor_json, '$.object_kind') = 'group' AND json_extract(anchor_json, '$.object_id') = ?2`).bind(ctx.board.id, gid, points[i].x, points[i].y),
  ] : [db.prepare(`UPDATE canvas_comment_threads SET anchor_json = json_extract(anchor_json, '$.ungrouped') WHERE board_id = ?1 AND ${was}`).bind(ctx.board.id, gid)])));
  const { results } = await db.prepare(`SELECT id, anchor_json FROM canvas_comment_threads WHERE board_id = ?1 AND (json_extract(anchor_json, '$.ungrouped.object_id') IN (SELECT value FROM json_each(?2))
    OR (json_extract(anchor_json, '$.object_kind') = 'group' AND json_extract(anchor_json, '$.object_id') IN (SELECT value FROM json_each(?2)))) ORDER BY id`).bind(ctx.board.id, JSON.stringify(gids)).all();
  return json({ threads: results.map(row => ({ id: row.id, anchor: JSON.parse(row.anchor_json) })) });
}

// Allow comments and the public setting (section 4): the owner's; the public setting only on a published canvas.
async function saveSettings(req, env, ctx) {
  if (!ctx.actor.owner) return refuse('Only the owner changes comment settings.', 'forbidden', 403);
  const input = await readJson(req);
  const enabled = input?.comments_enabled, mode = input?.public_mode, link = input?.link_comments;
  if (enabled !== undefined && typeof enabled !== 'boolean') return refuse('comments_enabled must be true or false.', 'bad_setting', 400);
  if (mode !== undefined && !MODES.includes(mode)) return refuse('public_mode is off, open or closed.', 'bad_setting', 400);
  if (mode !== undefined && !ctx.board.published) return refuse('Publish this canvas to Explore first.', 'not_published', 409);
  if (link !== undefined && !Object.hasOwn(LINK_MODES, link)) return refuse('link_comments is hidden, view or allow.', 'bad_setting', 400);
  const next = { enabled: enabled === undefined ? !!ctx.board.comments_enabled : enabled, mode: mode === undefined ? ctx.board.public_mode : mode };
  await env.LEARN_DB.prepare(`INSERT INTO canvas_comment_settings (org, canvas, comments_enabled, public_mode, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (org, canvas) DO UPDATE SET comments_enabled = excluded.comments_enabled, public_mode = excluded.public_mode, updated_at = excluded.updated_at`)
    .bind(ctx.board.org, ctx.board.canvas, next.enabled ? 1 : 0, next.mode, new Date().toISOString()).run();
  if (link !== undefined) {
    await env.LEARN_DB.prepare(`INSERT INTO canvas_comment_settings (org, canvas, comments_enabled, public_mode, updated_at) VALUES (?, ?, 1, ?, ?)
      ON CONFLICT (org, canvas) DO UPDATE SET public_mode = excluded.public_mode, updated_at = excluded.updated_at`)
      .bind(ctx.board.org, `link:${ctx.board.canvas}`, LINK_MODES[link], new Date().toISOString()).run();
    ctx.board.link_mode = LINK_MODES[link];
  }
  return json({ comments_enabled: next.enabled, public_mode: next.mode, ...(link !== undefined ? { link_comments: linkName(ctx.board.link_mode) } : {}), published: !!ctx.board.published });
}

// Blocks (section 3): the author of one public comment, by its stored account id; never membership.
async function listBlocks(env, ctx) {
  if (!ctx.actor.owner) return refuse('Only the owner sees blocks.', 'forbidden', 403);
  const { results } = await env.LEARN_DB.prepare(`SELECT k.id, k.blocked_at, ${PERSON('k.user_email', 'a_')} FROM canvas_comment_blocks k WHERE k.org = ? AND k.canvas = ? ORDER BY k.blocked_at DESC`)
    .bind(ctx.board.org, ctx.board.canvas).all();
  return json({ blocks: results.map(row => ({ block_id: row.id, person: person(row, 'a_'), blocked_at: row.blocked_at })) });
}
async function addBlock(req, env, ctx) {
  if (!ctx.actor.owner) return refuse('Only the owner blocks commenters.', 'forbidden', 403);
  const input = await readJson(req);
  if (!UUID.test(input?.comment_id || '')) return refuse('Choose a public comment.', 'bad_id', 400);
  const target = await env.LEARN_DB.prepare(`SELECT m.author_id, m.author_email FROM canvas_comments m JOIN canvas_comment_threads t ON t.id = m.thread_id
    WHERE m.id = ? AND t.board_id = ? AND t.audience = 'public'`).bind(input.comment_id, ctx.board.id).first();
  if (!target) return refuse("This comment isn't available.", 'comment_gone', 404);
  if (target.author_id === ctx.actor.uid) return refuse("You can't block yourself.", 'self', 400);
  const now = new Date().toISOString();
  const db = env.LEARN_DB;
  const statements = [db.prepare('INSERT INTO canvas_comment_blocks (id, org, canvas, user_id, user_email, blocked_by, blocked_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (org, canvas, user_id) DO NOTHING')
    .bind(crypto.randomUUID(), ctx.board.org, ctx.board.canvas, target.author_id, target.author_email, ctx.actor.uid, now)];
  if (input.remove_comments === true) statements.push(db.prepare(`UPDATE canvas_comments SET deleted_at = ?, deleted_by = ? WHERE author_id = ? AND deleted_at IS NULL
    AND thread_id IN (SELECT id FROM canvas_comment_threads WHERE org = ? AND canvas = ? AND audience = 'public')`).bind(now, ctx.actor.uid, target.author_id, ctx.board.org, ctx.board.canvas),
    ...purgeSide(db, `comment_id IN (SELECT id FROM canvas_comments WHERE author_id = ? AND thread_id IN (SELECT id FROM canvas_comment_threads WHERE org = ? AND canvas = ? AND audience = 'public'))`, target.author_id, ctx.board.org, ctx.board.canvas),
    purgeAttachments(db, `comment_id IN (SELECT id FROM canvas_comments WHERE author_id = ? AND thread_id IN (SELECT id FROM canvas_comment_threads WHERE org = ? AND canvas = ? AND audience = 'public'))`, target.author_id, ctx.board.org, ctx.board.canvas));
  await db.batch(statements);
  if (input.remove_comments === true) await releasePurged(env, ctx.board.org, ctx.board.canvas);
  return listBlocks(env, ctx);
}
async function removeBlock(env, ctx, id) {
  if (!ctx.actor.owner) return refuse('Only the owner unblocks commenters.', 'forbidden', 403);
  const gone = await env.LEARN_DB.prepare('DELETE FROM canvas_comment_blocks WHERE id = ? AND org = ? AND canvas = ?').bind(id, ctx.board.org, ctx.board.canvas).run();
  if (!gone.meta?.changes) return refuse('No such block on this canvas.', 'not_found', 404);
  return listBlocks(env, ctx);
}

// The member page (/c/<board id>): the board read-only, for the owner and active members. Never through the public family.
// Membership opens the canvas, never a private repository: its cards are whole only for their original importer.
async function readBoard(env, ctx) {
  const row = await env.LEARN_DB.prepare('SELECT state_json, version, updated_at FROM learn_boards WHERE id = ?').bind(ctx.board.id).first();
  const state = await redactRepositoryCards(env.LEARN_DB, JSON.parse(row.state_json), { org: ctx.actor.org, email: ctx.actor.email });
  // The owner is sent to their own page; only they learn its name here.
  return json({ title: ctx.board.title, owner: person(ctx.board, 'owner_'), role: ctx.actor.owner ? 'owner' : 'member', ...(ctx.actor.owner ? { canvas: ctx.board.canvas } : {}), version: row.version, updated_at: row.updated_at,
    // A member sees what was placed on the canvas, never the owner's own answers, attempts, ticks or highlights (SHARE-01).
    state: ctx.actor.owner ? state : sharedState(state) });
}

// Library → Shared with you (section 5): canvases where I am an active member, with their owner, last change and how many
// threads have news for me. A canvas in Trash is suspended, so it is not listed.
async function sharedWithMe(req, env) {
  const viewer = await viewerOf(req, env);
  if (!viewer?.userId) return refuse('Sign in to see what is shared with you.', 'sign_in', 401, { signIn: true });
  const from = `FROM canvas_members m JOIN canvases c ON c.org = m.org AND c.name = m.canvas
    JOIN learn_boards b ON b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main'`;
  const where = `WHERE m.member_user_id = ?1 AND m.status = 'active' AND NOT ${IN_TRASH_TREE('c.org', 'c.name')}`;
  const { results } = await env.LEARN_DB.prepare(`SELECT b.id AS board_id, c.title, COALESCE(md.updated_at, c.created_at) AS updated_at, ${PERSON('c.owner_email', 'owner_')}
    ${from} LEFT JOIN canvas_metadata md ON md.org = c.org AND md.canvas = c.name ${where} ORDER BY updated_at DESC`).bind(viewer.userId).all();
  const unread = await countVisible(env, (await env.LEARN_DB.prepare(`SELECT b.id AS key, t.id, t.board_id, t.anchor_json ${from}
    JOIN canvas_comment_threads t ON t.board_id = b.id ${where} AND ${unreadSql(false)}`).bind(viewer.userId).all()).results);
  return json({ canvases: results.map(row => ({ board_id: row.board_id, title: row.title, owner: person(row, 'owner_'), updated_at: row.updated_at, unread: unread[row.board_id] || 0 })) });
}

function about(env, ctx) {
  const { owner, member, signedIn } = ctx.actor;
  const audience = ctx.family === 'public' ? 'public' : 'members';
  return json({
    role: owner ? 'owner' : member ? 'member' : 'viewer', title: ctx.board.title, ...(ctx.board.nested ? { nested: true } : {}), owner: person(ctx.board, 'owner_'),
    comments_enabled: ctx.enabled, public_mode: ctx.board.published ? ctx.board.public_mode : 'off', ...(owner ? { link_comments: linkName(ctx.board.link_mode) } : {}), published: !!ctx.board.published, signed_in: signedIn,
    can: { post: allowed(ctx, 'post', audience), post_public: allowed(ctx, 'post', 'public'), settings: owner, blocked: ctx.actor.blocked },
    attachments: { types: Object.keys(ATTACHMENT_TYPES), file_bytes: commentLimits(env).COMMENT_ATTACH_FILE_BYTES, per_comment: commentLimits(env).COMMENT_ATTACH_COMMENT_MAX },
  });
}

// Library and Home lines (section 5): how many threads have news for me, on my own canvases (by name) and on canvases
// shared with me (by board id). Owner threads count members and public threads alike.
async function unreadCounts(req, env) {
  const viewer = await viewerOf(req, env);
  if (!viewer?.userId) return refuse('Sign in first.', 'sign_in', 401, { signIn: true });
  const db = env.LEARN_DB;
  const owned = await db.prepare(`SELECT c.name AS key, t.id, t.board_id, t.anchor_json FROM canvases c JOIN learn_boards b ON b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main'
      JOIN canvas_comment_threads t ON t.board_id = b.id WHERE c.org = ?2 AND c.owner_email = ?3 AND t.resolved_at IS NULL AND ${unreadSql(false)}`).bind(viewer.userId, viewer.org, viewer.email).all();
  const shared = await db.prepare(`SELECT b.id AS key, t.id, t.board_id, t.anchor_json FROM canvas_members m JOIN canvases c ON c.org = m.org AND c.name = m.canvas
      JOIN learn_boards b ON b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main' JOIN canvas_comment_threads t ON t.board_id = b.id
      WHERE m.member_user_id = ?1 AND m.status = 'active' AND t.resolved_at IS NULL AND ${unreadSql(false)} AND NOT ${IN_TRASH_TREE('c.org', 'c.name')}`).bind(viewer.userId).all();
  return json({ owned: await countVisible(env, owned.results), shared: await countVisible(env, shared.results) });
}

// The inbox (owner decision D4, 2026-10-23: in-app first, no email): the threads with news for me that I can read NOW, across
// canvases, newest first. News is a comment by someone else, live, after my last read of the thread. It reaches the inbox when I
// was mentioned in it, I started it or posted in it, I follow it, or it is on a canvas I own - and never when I muted the thread.
// Three places are read, each only as far as the reader's access goes: my own canvases, canvases I am an active member of (not in
// Trash), and public threads elsewhere that I took part in, while the canvas is published with public comments on and I am not
// blocked. A deleted object's threads are hidden as everywhere. Computed from threads, mentions and read marks (nothing stored but
// follow and mute, migration 0032).
const READ_AT = "COALESCE((SELECT r.read_at FROM canvas_comment_reads r WHERE r.thread_id = t.id AND r.user_id = ?1), '')";
const INBOX_COLUMNS = `t.id AS thread_id, t.board_id, t.audience, t.anchor_json, t.last_activity_at, t.resolved_at,
  (SELECT count(*) FROM canvas_comments x WHERE x.thread_id = t.id AND x.author_id != ?1 AND x.deleted_at IS NULL AND x.created_at > ${READ_AT}) AS news,
  EXISTS (SELECT 1 FROM canvas_comment_mentions mm JOIN canvas_comments z ON z.id = mm.comment_id WHERE z.thread_id = t.id AND z.deleted_at IS NULL AND z.author_id != ?1
    AND (mm.user_id = ?1 OR mm.user_email = ?2) AND z.created_at > ${READ_AT}) AS mentioned,
  (t.created_by = ?1 OR EXISTS (SELECT 1 FROM canvas_comments y WHERE y.thread_id = t.id AND y.author_id = ?1)) AS took_part,
  (SELECT g.state FROM canvas_comment_follows g WHERE g.thread_id = t.id AND g.user_id = ?1) AS follow,
  (SELECT f.body FROM canvas_comments f WHERE f.thread_id = t.id ORDER BY f.created_at, f.id LIMIT 1) AS first_body,
  (SELECT f.deleted_at IS NOT NULL FROM canvas_comments f WHERE f.thread_id = t.id ORDER BY f.created_at, f.id LIMIT 1) AS first_deleted`;
const INBOX_FROM = "FROM canvases c JOIN learn_boards b ON b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main' JOIN canvas_comment_threads t ON t.board_id = b.id";
const INBOX_MAX = 50;
async function inbox(req, env) {
  const viewer = await viewerOf(req, env);
  if (!viewer?.userId) return refuse('Sign in first.', 'sign_in', 401, { signIn: true });
  const db = env.LEARN_DB, who = [viewer.userId, viewer.email];
  const query = (from, where, extra) => `SELECT * FROM (SELECT ${INBOX_COLUMNS}, c.title AS canvas_title, ${extra} ${from} WHERE ${where}) WHERE news > 0 ORDER BY last_activity_at DESC LIMIT 100`;
  const mine = await db.prepare(query(INBOX_FROM, 'c.org = ?3 AND c.owner_email = ?2', "'owner' AS kind, NULL AS token")).bind(...who, viewer.org).all();
  const member = await db.prepare(query(`FROM canvas_members m JOIN canvases c ON c.org = m.org AND c.name = m.canvas JOIN learn_boards b ON b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main'
      JOIN canvas_comment_threads t ON t.board_id = b.id`, `m.member_user_id = ?1 AND m.status = 'active' AND NOT ${IN_TRASH_TREE('c.org', 'c.name')}`, "'member' AS kind, NULL AS token")).bind(...who).all();
  // ponytail: public threads elsewhere are found by this person's own posts and mentions (indexed by author and by user), not by scanning every public thread.
  const open = await db.prepare(query(`${INBOX_FROM} LEFT JOIN canvas_comment_settings s ON s.org = c.org AND s.canvas = c.name`,
    `t.audience = 'public' AND c.owner_email <> ?2 AND c.archived_at IS NULL AND NOT ${IN_TRASH_TREE('c.org', 'c.name')} AND COALESCE(s.public_mode, 'off') <> 'off'
      AND EXISTS (SELECT 1 FROM canvas_publications pub WHERE pub.org = c.org AND pub.canvas = c.name)
      AND NOT EXISTS (SELECT 1 FROM canvas_members cm WHERE cm.org = c.org AND cm.canvas = c.name AND cm.member_user_id = ?1 AND cm.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM canvas_comment_blocks k WHERE k.org = c.org AND k.canvas = c.name AND k.user_id = ?1)
      AND (t.created_by = ?1 OR t.id IN (SELECT y.thread_id FROM canvas_comments y WHERE y.author_id = ?1)
        OR t.id IN (SELECT z.thread_id FROM canvas_comment_mentions mm JOIN canvas_comments z ON z.id = mm.comment_id WHERE mm.user_id = ?1 OR mm.user_email = ?2)
        OR t.id IN (SELECT g.thread_id FROM canvas_comment_follows g WHERE g.user_id = ?1 AND g.state = 'follow'))`,
    "'public' AS kind, (SELECT pub.token FROM canvas_publications pub WHERE pub.org = c.org AND pub.canvas = c.name) AS token")).bind(...who).all();
  const seen = new Set(), rows = [...mine.results, ...member.results, ...open.results].filter(row => !seen.has(row.thread_id) && seen.add(row.thread_id));
  const hidden = new Set(await hiddenAmong(env, rows.map(row => ({ id: row.thread_id, board_id: row.board_id, anchor_json: row.anchor_json }))));
  const items = rows.filter(row => !hidden.has(row.thread_id) && row.follow !== 'mute')
    .map(row => ({ row, reason: row.mentioned ? 'mention' : row.took_part ? 'reply' : row.follow === 'follow' ? 'follow' : row.kind === 'owner' ? 'canvas' : null }))
    .filter(entry => entry.reason).sort((a, b) => (a.row.last_activity_at < b.row.last_activity_at ? 1 : -1)).slice(0, INBOX_MAX)
    .map(({ row, reason }) => ({
      thread_id: row.thread_id, reason, canvas: row.canvas_title, audience: row.audience, news: row.news, status: row.resolved_at ? 'resolved' : 'open',
      preview: row.first_deleted ? null : (row.first_body || '').slice(0, 200), last_activity_at: row.last_activity_at,
      link: row.kind === 'public' ? `/e/${row.token}?thread=${row.thread_id}` : `/c/${row.board_id}?thread=${row.thread_id}`,
    }));
  return json({ items, count: items.length });
}

// Follow or mute one thread (migration 0032): `{ state: 'follow' | 'mute' | 'default' }`. Whoever may read and is signed in.
async function followOf(env, ctx, threadId) {
  if (!ctx.actor.uid) return null;
  return (await env.LEARN_DB.prepare('SELECT state FROM canvas_comment_follows WHERE thread_id = ? AND user_id = ?').bind(threadId, ctx.actor.uid).first())?.state ?? null;
}
async function setFollow(req, env, ctx, id) {
  const thread = await threadIn(env, ctx, id);
  if (!thread) return missingThread();
  if (!allowed(ctx, 'mark_read', thread.audience)) return refuse('Sign in to follow or mute a thread.', 'sign_in', 401, { signIn: true });
  const input = await readJson(req);
  if (!['follow', 'mute', 'default'].includes(input?.state)) return refuse('Choose follow, mute or default.', 'bad_state', 400);
  const db = env.LEARN_DB;
  if (input.state === 'default') await db.prepare('DELETE FROM canvas_comment_follows WHERE thread_id = ? AND user_id = ?').bind(thread.id, ctx.actor.uid).run();
  else await db.prepare('INSERT INTO canvas_comment_follows (thread_id, user_id, state, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (thread_id, user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at')
    .bind(thread.id, ctx.actor.uid, input.state, new Date().toISOString()).run();
  return json({ follow: input.state === 'default' ? null : input.state });
}

// Whatever fails inside answers JSON (owner bug, 2026-10-09: an uncaught error reached the browser as the platform's HTML
// error page, which the panel could only call "Couldn't send."). The error goes to the Worker's logs with its route.
export async function canvasCommentsRoute(path, req, env) {
  try { return await commentsRoute(path, req, env); } catch (error) {
    console.error('canvas comments failed', req.method, path, error?.stack || String(error));
    return json({ error: "Couldn't save that: the server failed. Try again in a moment.", code: 'server_error' }, 500);
  }
}
async function commentsRoute(path, req, env) {
  if (path === '/api/learn/comments/unread') return !env.LEARN_DB ? json({ error: 'Comments need the Learn database on this worker.' }, 503) : req.method === 'GET' ? unreadCounts(req, env) : json({ error: 'Method not allowed' }, 405);
  if (path === '/api/learn/comments/inbox') return !env.LEARN_DB ? json({ error: 'Comments need the Learn database on this worker.' }, 503) : req.method === 'GET' ? inbox(req, env) : json({ error: 'Method not allowed' }, 405);
  if (path === '/api/learn/c/shared-with-me') return !env.LEARN_DB ? json({ error: 'Comments need the Learn database on this worker.' }, 503) : req.method === 'GET' ? sharedWithMe(req, env) : json({ error: 'Method not allowed' }, 405);
  let match = path.match(/^\/api\/learn\/c\/([^/]+)(\/.*)?$/), family = 'member';
  if (!match) { match = path.match(/^\/api\/learn\/boards\/shared\/([^/]+)\/comments(\/.*)?$/); family = 'public'; }
  if (!match) return null;
  const rest = match[2] || '';
  // The invitation family and the whole members subtree belong to the control plane (C4).
  if (family === 'member' && /^\/members(\/|$)/.test(rest)) return null;
  if (!env.LEARN_DB) return json({ error: 'Comments need the Learn database on this worker.' }, 503);
  const url = new URL(req.url);
  if (req.method !== 'GET' && req.headers.has('origin') && req.headers.get('origin') !== url.origin) return refuse('Invalid origin', 'origin', 403);
  const key = decodeURIComponent(match[1]);
  const ctx = family === 'member' ? await memberContext(req, env, key) : await publicContext(req, env, key);
  if (ctx instanceof Response) return ctx;
  const { method } = req;
  const not = () => json({ error: 'Method not allowed' }, 405);
  if (rest === '' || rest === '/') return method === 'GET' ? about(env, ctx) : not();
  let part;
  if (family === 'member' && rest === '/board') return method === 'GET' ? readBoard(env, ctx) : not();
  if (family === 'member' && (part = rest.match(/^\/assets\/([^/]+)$/))) return method === 'GET' ? boardAsset(env, ctx.board, decodeURIComponent(part[1]), req) : not();
  if (rest === '/threads') return method === 'GET' ? listThreads(env, ctx, url.searchParams) : method === 'POST' ? startThread(req, env, ctx) : not();
  if ((part = rest.match(/^\/threads\/([^/]+)$/))) return method === 'GET' ? readThread(env, ctx, part[1], url.searchParams) : method === 'DELETE' ? deleteThread(env, ctx, part[1]) : not();
  if ((part = rest.match(/^\/threads\/([^/]+)\/follow$/))) return method === 'PUT' ? setFollow(req, env, ctx, part[1]) : not();
  if ((part = rest.match(/^\/threads\/([^/]+)\/color$/))) return method === 'PUT' ? setColor(req, env, ctx, part[1]) : not();
  if ((part = rest.match(/^\/threads\/([^/]+)\/comments$/))) return method === 'POST' ? reply(req, env, ctx, part[1]) : not();
  if (family === 'member' && (part = rest.match(/^\/threads\/([^/]+)\/public-copy$/))) return method === 'POST' ? publicCopy(req, env, ctx, part[1]) : not();
  if ((part = rest.match(/^\/threads\/([^/]+)\/(resolve|reopen|read)$/))) {
    if (method !== 'POST') return not();
    return part[2] === 'read' ? markRead(env, ctx, part[1]) : resolve(env, ctx, part[1], part[2] === 'reopen');
  }
  if ((part = rest.match(/^\/comments\/([^/]+)$/))) return method === 'PATCH' ? editComment(req, env, ctx, part[1]) : method === 'DELETE' ? deleteComment(env, ctx, part[1]) : not();
  if (rest === '/attachments') return method === 'POST' ? uploadAttachment(req, env, ctx, url.searchParams) : not();
  if ((part = rest.match(/^\/attachments\/([^/]+)$/))) return method === 'GET' ? downloadAttachment(env, ctx, part[1]) : not();
  if ((part = rest.match(/^\/comments\/([^/]+)\/reactions$/))) return method === 'PUT' ? react(req, env, ctx, part[1]) : not();
  if ((part = rest.match(/^\/comments\/([^/]+)\/history$/))) return method === 'GET' ? editHistory(env, ctx, part[1]) : not();
  if (rest === '/people') return method === 'GET' ? suggest(env, ctx, url.searchParams) : not();
  if (family === 'member' && rest === '/anchors') return method === 'POST' ? moveAnchors(req, env, ctx) : not();
  if (family === 'member' && rest === '/comment-settings') return method === 'PUT' ? saveSettings(req, env, ctx) : not();
  if (family === 'member' && rest === '/blocks') return method === 'GET' ? listBlocks(env, ctx) : method === 'POST' ? addBlock(req, env, ctx) : not();
  if (family === 'member' && (part = rest.match(/^\/blocks\/([^/]+)$/))) return method === 'DELETE' ? removeBlock(env, ctx, part[1]) : not();
  return refuse('Not found', 'not_found', 404);
}
