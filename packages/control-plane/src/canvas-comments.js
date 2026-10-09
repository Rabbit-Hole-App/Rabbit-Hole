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
import { NOT_TRASHED } from './library-trash.js';
import { sha256Hex } from './learn-grade-jev.js';
import { getAsset } from './learn-boards.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const refuse = (error, code, status, extra = {}) => json({ error, code, ...extra }, status);
const notFound = () => refuse("This canvas isn't available to you.", 'not_found', 404);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
export const BODY_MAX = 5000;
const RAW_MAX = 16 * 1024;
const PAGE = 30;
const MESSAGES = 50;
const MODES = ['off', 'open', 'closed'];

// Section 9, each overridable by a worker variable of the same name (the SHARED_ASK_LIMITS pattern).
export const COMMENT_LIMITS = { COMMENT_CANVAS_10MIN: 30, COMMENT_CANVAS_DAY: 300, COMMENT_PERSON_DAY: 1000, COMMENT_THREAD_MAX: 1000 };
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

// A top-level canvas's main board (Q5): never a nested Rabbit Hole, never a project board. Archive changes nothing
// here; Trash suspends everyone but the owner; a publication counts while the canvas is live.
const BOARD_ROW = `SELECT b.id, b.org, b.app AS canvas, b.owner_email, c.title, NOT ${NOT_TRASHED('c.org', 'c.name')} AS trashed,
    (c.archived_at IS NULL AND EXISTS (SELECT 1 FROM canvas_publications pub WHERE pub.org = c.org AND pub.canvas = c.name)) AS published,
    COALESCE(s.comments_enabled, 1) AS comments_enabled, COALESCE(s.public_mode, 'off') AS public_mode, ${PERSON('c.owner_email', 'owner_')}
  FROM learn_boards b JOIN canvases c ON c.org = b.org AND c.name = b.app AND c.owner_email = b.owner_email
  LEFT JOIN canvas_comment_settings s ON s.org = c.org AND s.canvas = c.name
  WHERE b.board = 'main' AND c.name NOT IN (SELECT d.child FROM canvas_dives d WHERE d.org = c.org AND d.parent_app NOT LIKE 'share:%')`;

async function viewerOf(req, env) {
  const viewer = await repositoryIdentity(req, env);
  return viewer instanceof Response ? null : viewer;
}
async function actorOn(env, board, viewer) {
  const owner = !!viewer && viewer.email === board.owner_email;
  const uid = viewer?.userId || null;
  const db = env.LEARN_DB;
  const member = !owner && !!uid && !board.trashed && !!(await db.prepare("SELECT 1 FROM canvas_members WHERE org = ? AND canvas = ? AND member_user_id = ? AND status = 'active'").bind(board.org, board.canvas, uid).first());
  const blocked = !owner && !!uid && !!(await db.prepare('SELECT 1 FROM canvas_comment_blocks WHERE org = ? AND canvas = ? AND user_id = ?').bind(board.org, board.canvas, uid).first());
  return { owner, member, blocked, signedIn: !!uid, uid, email: viewer?.email || null };
}
const settingsOf = board => ({ mode: board.published ? board.public_mode : 'off', enabled: !!board.comments_enabled });

async function memberContext(req, env, boardId) {
  if (!BOARD_ID.test(boardId)) return notFound();
  const board = await env.LEARN_DB.prepare(`${BOARD_ROW} AND b.id = ?`).bind(boardId).first();
  if (!board) return notFound();
  const viewer = await viewerOf(req, env);
  if (!viewer) return refuse('Sign in to see the comments on this canvas.', 'sign_in', 401, { signIn: true });
  const actor = await actorOn(env, board, viewer);
  if (!actor.owner && !actor.member) return notFound();
  return { family: 'member', board, actor, ...settingsOf(board) };
}

async function publicContext(req, env, token) {
  if (!TOKEN.test(token)) return notFound();
  const board = await env.LEARN_DB.prepare(`${BOARD_ROW} AND c.archived_at IS NULL AND ${NOT_TRASHED('c.org', 'c.name')}
    AND EXISTS (SELECT 1 FROM canvas_publications pub WHERE pub.org = c.org AND pub.canvas = c.name AND pub.token = ?)`).bind(token).first();
  if (!board) return notFound();
  const actor = await actorOn(env, board, await viewerOf(req, env));
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
// The mentions a post may keep: `@handle` exactly at its range (any case), naming an account in the audience's set.
// Anything else stays plain text and notifies nobody; the post still succeeds.
async function acceptMentions(env, ctx, audience, body, mentions) {
  if (!mentions.length) return [];
  const set = await audienceSet(env, ctx, audience), kept = [], used = new Set();
  for (const { pos, len, handle } of mentions) {
    if (pos < 0 || len < 2 || pos + len > body.length || used.has(pos) || body.slice(pos, pos + len).toLowerCase() !== `@${handle}`.toLowerCase()) continue;
    const row = await env.LEARN_DB.prepare('SELECT email, handle FROM user_handles WHERE handle = ?').bind(handle).first();
    if (!row || !set.has(row.email)) continue;
    used.add(pos);
    kept.push({ pos, len, handle: row.handle, user_id: set.get(row.email), user_email: row.email });
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
    return { kind: 'object', object_id: a.object_id, object_kind: a.object_kind, dx: round(a.dx), dy: round(a.dy), label: typeof a.label === 'string' ? a.label.trim().slice(0, 120) : '' };
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
  return row.recent >= limits.COMMENT_CANVAS_10MIN || row.today >= limits.COMMENT_CANVAS_DAY || row.everywhere >= limits.COMMENT_PERSON_DAY
    ? refuse("You've posted a lot in a short time. Try again in a few minutes.", 'limited', 429, { limited: true }) : null;
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
    id: row.id, audience: row.audience, anchor: JSON.parse(row.anchor_json), color: row.color || null, status: row.resolved_at ? 'resolved' : 'open', author: person(row, 'a_'),
    created_at: row.created_at, last_activity_at: row.last_activity_at, replies: Math.max(0, row.message_count - 1), comments: row.live,
    hidden_from_public: row.audience === 'public' && ctx.mode === 'off',
    can: { reply: allowed(ctx, 'post', row.audience), resolve: allowed(ctx, 'resolve', row.audience, starter), color: allowed(ctx, 'resolve', row.audience, starter), delete: mayDeleteThread(ctx, row) },
  };
}
const MESSAGE_COLUMNS = `m.id, m.author_id, m.body, m.created_at, m.edited_at, m.deleted_at, m.deleted_by, ${PERSON('m.author_email', 'a_')}`;
function messageShape(ctx, audience, row, mentions = []) {
  const mine = !!ctx.actor.uid && row.author_id === ctx.actor.uid;
  const deleted = row.deleted_at ? (row.deleted_by === row.author_id ? 'author' : 'owner') : null;
  return {
    id: row.id, author: person(row, 'a_'), segments: deleted ? [] : segmentsOf(row.body, mentions), created_at: row.created_at, edited: !!row.edited_at && !deleted, deleted, mine,
    can: { edit: !deleted && mine && allowed(ctx, 'edit_own', audience), delete: !deleted && ((mine && allowed(ctx, 'delete_own', audience)) || allowed(ctx, 'delete_any', audience)) },
  };
}

// A thread of this board (and public, through the public family) that the actor may read; anything else is 404, so
// an id from another canvas, thread or audience never answers with its data.
async function threadIn(env, ctx, id) {
  if (!UUID.test(id)) return null;
  const row = await env.LEARN_DB.prepare(`SELECT ${THREAD_COLUMNS} FROM canvas_comment_threads t WHERE t.id = ? AND t.board_id = ?${ctx.family === 'public' ? " AND t.audience = 'public'" : ''}`).bind(id, ctx.board.id).first();
  return row && allowed(ctx, 'read', row.audience) ? row : null;
}
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
  if (!set.length) return json({ people: [] });
  const q = (params.get('q') || '').trim().toLowerCase().replace(/^@/, '').slice(0, 40);
  const like = `${q.replace(/[\\%_]/g, char => `\\${char}`)}%`;
  const { results } = await env.LEARN_DB.prepare(`SELECT ${PERSON('h.email', 'a_')} FROM user_handles h WHERE h.email IN (${set.map(() => '?').join(', ')})
      AND (lower(h.handle) LIKE ? ESCAPE '\\' OR lower(COALESCE(${NAME_OF('h.email')}, '')) LIKE ? ESCAPE '\\') ORDER BY h.handle LIMIT 8`)
    .bind(...set, like, like).all();
  return json({ people: results.map(row => person(row, 'a_')) });
}

async function listThreads(env, ctx, params) {
  const status = ['open', 'resolved', 'all'].includes(params.get('status')) ? params.get('status') : 'open';
  const audience = ctx.family === 'public' ? 'public' : ['members', 'public'].includes(params.get('audience')) ? params.get('audience') : null;
  const conditions = ['t.board_id = ?2'];
  if (status === 'open') conditions.push('t.resolved_at IS NULL');
  if (status === 'resolved') conditions.push('t.resolved_at IS NOT NULL');
  if (audience) conditions.push(`t.audience = '${audience}'`);
  const cursor = /^([^|]{1,40})\|([0-9a-f-]{36})$/i.exec(params.get('cursor') || '');
  if (cursor) conditions.push('(t.last_activity_at < ?3 OR (t.last_activity_at = ?3 AND t.id < ?4))');
  const { results } = await env.LEARN_DB.prepare(`SELECT ${THREAD_COLUMNS}, ${unreadSql(ctx.family === 'public')} AS unread,
      (SELECT f.body FROM canvas_comments f WHERE f.thread_id = t.id ORDER BY f.created_at, f.id LIMIT 1) AS first_body,
      (SELECT f.deleted_at IS NOT NULL FROM canvas_comments f WHERE f.thread_id = t.id ORDER BY f.created_at, f.id LIMIT 1) AS first_deleted
    FROM canvas_comment_threads t WHERE ${conditions.join(' AND ')} ORDER BY t.last_activity_at DESC, t.id DESC LIMIT ${PAGE + 1}`)
    .bind(ctx.actor.uid, ctx.board.id, ...(cursor ? [cursor[1], cursor[2]] : [])).all();
  const readable = results.filter(row => allowed(ctx, 'read', row.audience));
  const page = readable.slice(0, PAGE);
  const last = results.length > PAGE ? results[PAGE - 1] : null;
  return json({
    threads: page.map(row => ({ ...threadShape(ctx, row), unread: !!row.unread, preview: row.first_deleted ? null : (row.first_body || '').slice(0, 200) })),
    cursor: last ? `${last.last_activity_at}|${last.id}` : null,
    has_public: ctx.family === 'public' || !!(await env.LEARN_DB.prepare("SELECT 1 FROM canvas_comment_threads WHERE board_id = ? AND audience = 'public' LIMIT 1").bind(ctx.board.id).first()),
  });
}

async function readThread(env, ctx, id, params) {
  const thread = await threadIn(env, ctx, id);
  if (!thread) return missingThread();
  const before = /^([^|]{1,40})\|([0-9a-f-]{36})$/i.exec(params.get('before') || '');
  const { results } = await env.LEARN_DB.prepare(`SELECT ${MESSAGE_COLUMNS} FROM canvas_comments m WHERE m.thread_id = ?1
      ${before ? 'AND (m.created_at < ?2 OR (m.created_at = ?2 AND m.id < ?3))' : ''} ORDER BY m.created_at DESC, m.id DESC LIMIT ${MESSAGES + 1}`)
    .bind(thread.id, ...(before ? [before[1], before[2]] : [])).all();
  const page = results.slice(0, MESSAGES).reverse();
  const mentions = await mentionsFor(env, page.map(row => row.id));
  return json({ thread: threadShape(ctx, thread), messages: page.map(row => messageShape(ctx, thread.audience, row, mentions.get(row.id))),
    before: results.length > MESSAGES ? `${page[0].created_at}|${page[0].id}` : null });
}

const hashOf = parts => sha256Hex(JSON.stringify(parts));

async function startThread(req, env, ctx) {
  const input = await readJson(req);
  if (input?.tooLarge) return refuse('That comment is too long.', 'too_long', 413);
  if (!UUID.test(input?.id || '')) return refuse('A new thread needs a client id (a UUID).', 'bad_id', 400);
  const audience = ctx.family === 'public' ? 'public' : input.audience === 'public' ? 'public' : 'members';
  if (!allowed(ctx, 'post', audience)) return postRefusal(ctx, audience);
  const anchor = anchorOf(input.anchor);
  if (!anchor || JSON.stringify(anchor).length > 1024) return refuse('Choose where the comment goes.', 'bad_anchor', 400);
  const { body, error } = bodyOf(input.body);
  if (error) return error;
  const mentions = mentionsOf(input.mentions);
  const hash = await hashOf([ctx.actor.uid, ctx.board.id, audience, anchor, body, mentions]);
  const replay = await sameCreate(env, 'canvas_comment_threads', input.id, hash);
  if (replay) return replay === 'conflict' ? idConflict() : threadReply(env, ctx, input.id, 200);
  const over = await limited(env, ctx);
  if (over) return over;
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
  const first = await env.LEARN_DB.prepare(`SELECT ${MESSAGE_COLUMNS} FROM canvas_comments m WHERE m.thread_id = ? ORDER BY m.created_at, m.id LIMIT 1`).bind(id).first();
  const mentions = (await mentionsFor(env, [first.id])).get(first.id) || [];
  return json({ thread: threadShape(ctx, thread), comment: messageShape(ctx, thread.audience, first, mentions), accepted_mentions: mentions.map(m => ({ pos: m.pos, len: m.len, handle: m.p_handle })) }, status);
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
  const hash = await hashOf([ctx.actor.uid, thread.id, body, mentions]);
  const replay = await sameCreate(env, 'canvas_comments', input.id, hash);
  if (replay) return replay === 'conflict' ? idConflict() : commentReply(env, ctx, thread, input.id, 200);
  // ponytail: check-then-insert, so concurrent replies can pass the thread cap by a few; a conditional insert if that matters.
  if (thread.message_count >= commentLimits(env).COMMENT_THREAD_MAX) return refuse('This thread is full. Start a new thread.', 'thread_full', 409);
  const over = await limited(env, ctx);
  if (over) return over;
  const now = new Date().toISOString();
  const db = env.LEARN_DB;
  const kept = await acceptMentions(env, ctx, thread.audience, body, mentions);
  try {
    await db.batch([
      db.prepare('INSERT INTO canvas_comments (id, thread_id, author_id, author_email, body, create_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(input.id, thread.id, ctx.actor.uid, ctx.actor.email, body, hash, now),
      db.prepare('UPDATE canvas_comment_threads SET message_count = message_count + 1, last_activity_at = ? WHERE id = ?').bind(now, thread.id),
      ...mentionRows(db, input.id, kept),
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
  return json({ comment: messageShape(ctx, thread.audience, row, mentions), accepted_mentions: mentions.map(m => ({ pos: m.pos, len: m.len, handle: m.p_handle })) }, status);
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
  // An edit sends the whole new body and its full mentions; the stored ones are replaced.
  const kept = await acceptMentions(env, ctx, found.thread.audience, body, mentionsOf(input.mentions));
  const db = env.LEARN_DB;
  await db.batch([
    db.prepare('UPDATE canvas_comments SET body = ?, edited_at = ? WHERE id = ?').bind(body, new Date().toISOString(), id),
    db.prepare('DELETE FROM canvas_comment_mentions WHERE comment_id = ?').bind(id),
    ...mentionRows(db, id, kept),
  ]);
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
  ]);
  return commentReply(env, ctx, found.thread, id, 200);
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
    db.prepare('DELETE FROM canvas_comments WHERE thread_id = ?').bind(thread.id),
    db.prepare('DELETE FROM canvas_comment_reads WHERE thread_id = ?').bind(thread.id),
    db.prepare('DELETE FROM canvas_comment_colors WHERE thread_id = ?').bind(thread.id),
    db.prepare('DELETE FROM canvas_comment_threads WHERE id = ?').bind(thread.id),
  ]);
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

// Allow comments and the public setting (section 4): the owner's; the public setting only on a published canvas.
async function saveSettings(req, env, ctx) {
  if (!ctx.actor.owner) return refuse('Only the owner changes comment settings.', 'forbidden', 403);
  const input = await readJson(req);
  const enabled = input?.comments_enabled, mode = input?.public_mode;
  if (enabled !== undefined && typeof enabled !== 'boolean') return refuse('comments_enabled must be true or false.', 'bad_setting', 400);
  if (mode !== undefined && !MODES.includes(mode)) return refuse('public_mode is off, open or closed.', 'bad_setting', 400);
  if (mode !== undefined && !ctx.board.published) return refuse('Publish this canvas to Explore first.', 'not_published', 409);
  const next = { enabled: enabled === undefined ? !!ctx.board.comments_enabled : enabled, mode: mode === undefined ? ctx.board.public_mode : mode };
  await env.LEARN_DB.prepare(`INSERT INTO canvas_comment_settings (org, canvas, comments_enabled, public_mode, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (org, canvas) DO UPDATE SET comments_enabled = excluded.comments_enabled, public_mode = excluded.public_mode, updated_at = excluded.updated_at`)
    .bind(ctx.board.org, ctx.board.canvas, next.enabled ? 1 : 0, next.mode, new Date().toISOString()).run();
  return json({ comments_enabled: next.enabled, public_mode: next.mode, published: !!ctx.board.published });
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
    AND thread_id IN (SELECT id FROM canvas_comment_threads WHERE org = ? AND canvas = ? AND audience = 'public')`).bind(now, ctx.actor.uid, target.author_id, ctx.board.org, ctx.board.canvas));
  await db.batch(statements);
  return listBlocks(env, ctx);
}
async function removeBlock(env, ctx, id) {
  if (!ctx.actor.owner) return refuse('Only the owner unblocks commenters.', 'forbidden', 403);
  const gone = await env.LEARN_DB.prepare('DELETE FROM canvas_comment_blocks WHERE id = ? AND org = ? AND canvas = ?').bind(id, ctx.board.org, ctx.board.canvas).run();
  if (!gone.meta?.changes) return refuse('No such block on this canvas.', 'not_found', 404);
  return listBlocks(env, ctx);
}

// The member page (/c/<board id>): the board read-only, for the owner and active members. Never through the public family.
async function readBoard(env, ctx) {
  const row = await env.LEARN_DB.prepare('SELECT state_json, version, updated_at FROM learn_boards WHERE id = ?').bind(ctx.board.id).first();
  // The owner is sent to their own page; only they learn its name here.
  return json({ title: ctx.board.title, owner: person(ctx.board, 'owner_'), role: ctx.actor.owner ? 'owner' : 'member', ...(ctx.actor.owner ? { canvas: ctx.board.canvas } : {}), version: row.version, updated_at: row.updated_at, state: JSON.parse(row.state_json) });
}

// Library → Shared with you (section 5): canvases where I am an active member, with their owner, last change and how many
// threads have news for me. A canvas in Trash is suspended, so it is not listed.
async function sharedWithMe(req, env) {
  const viewer = await viewerOf(req, env);
  if (!viewer?.userId) return refuse('Sign in to see what is shared with you.', 'sign_in', 401, { signIn: true });
  const { results } = await env.LEARN_DB.prepare(`SELECT b.id AS board_id, c.title, COALESCE(md.updated_at, c.created_at) AS updated_at, ${PERSON('c.owner_email', 'owner_')},
      (SELECT count(*) FROM canvas_comment_threads t WHERE t.board_id = b.id AND ${unreadSql(false)}) AS unread
    FROM canvas_members m JOIN canvases c ON c.org = m.org AND c.name = m.canvas
    JOIN learn_boards b ON b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main'
    LEFT JOIN canvas_metadata md ON md.org = c.org AND md.canvas = c.name
    WHERE m.member_user_id = ?1 AND m.status = 'active' AND ${NOT_TRASHED('c.org', 'c.name')} ORDER BY updated_at DESC`).bind(viewer.userId).all();
  return json({ canvases: results.map(row => ({ board_id: row.board_id, title: row.title, owner: person(row, 'owner_'), updated_at: row.updated_at, unread: row.unread })) });
}

function about(ctx) {
  const { owner, member, signedIn } = ctx.actor;
  const audience = ctx.family === 'public' ? 'public' : 'members';
  return json({
    role: owner ? 'owner' : member ? 'member' : 'viewer', title: ctx.board.title, owner: person(ctx.board, 'owner_'),
    comments_enabled: ctx.enabled, public_mode: ctx.board.published ? ctx.board.public_mode : 'off', published: !!ctx.board.published, signed_in: signedIn,
    can: { post: allowed(ctx, 'post', audience), post_public: allowed(ctx, 'post', 'public'), settings: owner, blocked: ctx.actor.blocked },
  });
}

// Library and Home lines (section 5): how many threads have news for me, on my own canvases (by name) and on canvases
// shared with me (by board id). Owner threads count members and public threads alike.
async function unreadCounts(req, env) {
  const viewer = await viewerOf(req, env);
  if (!viewer?.userId) return refuse('Sign in first.', 'sign_in', 401, { signIn: true });
  const db = env.LEARN_DB;
  const owned = await db.prepare(`SELECT c.name AS key, count(*) AS n FROM canvases c JOIN learn_boards b ON b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main'
      JOIN canvas_comment_threads t ON t.board_id = b.id WHERE c.org = ?2 AND c.owner_email = ?3 AND t.resolved_at IS NULL AND ${unreadSql(false)} GROUP BY c.name`).bind(viewer.userId, viewer.org, viewer.email).all();
  const shared = await db.prepare(`SELECT b.id AS key, count(*) AS n FROM canvas_members m JOIN canvases c ON c.org = m.org AND c.name = m.canvas
      JOIN learn_boards b ON b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main' JOIN canvas_comment_threads t ON t.board_id = b.id
      WHERE m.member_user_id = ?1 AND m.status = 'active' AND t.resolved_at IS NULL AND ${unreadSql(false)} AND ${NOT_TRASHED('c.org', 'c.name')} GROUP BY b.id`).bind(viewer.userId).all();
  const map = rows => Object.fromEntries(rows.results.map(row => [row.key, row.n]));
  return json({ owned: map(owned), shared: map(shared) });
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
  if (rest === '' || rest === '/') return method === 'GET' ? about(ctx) : not();
  let part;
  if (family === 'member' && rest === '/board') return method === 'GET' ? readBoard(env, ctx) : not();
  if (family === 'member' && (part = rest.match(/^\/assets\/([^/]+)$/))) return method === 'GET' ? getAsset(env, ctx.board, decodeURIComponent(part[1])) : not();
  if (rest === '/threads') return method === 'GET' ? listThreads(env, ctx, url.searchParams) : method === 'POST' ? startThread(req, env, ctx) : not();
  if ((part = rest.match(/^\/threads\/([^/]+)$/))) return method === 'GET' ? readThread(env, ctx, part[1], url.searchParams) : method === 'DELETE' ? deleteThread(env, ctx, part[1]) : not();
  if ((part = rest.match(/^\/threads\/([^/]+)\/color$/))) return method === 'PUT' ? setColor(req, env, ctx, part[1]) : not();
  if ((part = rest.match(/^\/threads\/([^/]+)\/comments$/))) return method === 'POST' ? reply(req, env, ctx, part[1]) : not();
  if ((part = rest.match(/^\/threads\/([^/]+)\/(resolve|reopen|read)$/))) {
    if (method !== 'POST') return not();
    return part[2] === 'read' ? markRead(env, ctx, part[1]) : resolve(env, ctx, part[1], part[2] === 'reopen');
  }
  if ((part = rest.match(/^\/comments\/([^/]+)$/))) return method === 'PATCH' ? editComment(req, env, ctx, part[1]) : method === 'DELETE' ? deleteComment(env, ctx, part[1]) : not();
  if (rest === '/people') return method === 'GET' ? suggest(env, ctx, url.searchParams) : not();
  if (family === 'member' && rest === '/comment-settings') return method === 'PUT' ? saveSettings(req, env, ctx) : not();
  if (family === 'member' && rest === '/blocks') return method === 'GET' ? listBlocks(env, ctx) : method === 'POST' ? addBlock(req, env, ctx) : not();
  if (family === 'member' && (part = rest.match(/^\/blocks\/([^/]+)$/))) return method === 'DELETE' ? removeBlock(env, ctx, part[1]) : not();
  return refuse('Not found', 'not_found', 404);
}
