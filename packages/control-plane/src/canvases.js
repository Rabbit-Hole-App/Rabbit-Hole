import { validOpen } from './chat-modes.js';
import { FILE_SOURCE, validFileRange } from '../../web/src/file-chat-ref.js';
import { CHAT_MODES, PROJECT_FIELDS, cardCodeRefs, projectAccess, repositoryApp, repositoryIdentity, repositorySnapshot, repositoryThreads } from './repositories.js';
import { REPOSITORY_SYSTEM, REPOSITORY_TOOLS, repositoryTool, SELECTED_NOTE } from './repository-context.js';
import { divesFetch, pendingHoleApp } from './dives.js';
import { NOT_TRASHED, trashStatements } from './library-trash.js';
import { dropRefs } from './canvas-refs.js';
import { dropFileRefs } from './file-refs.js';

// Dev-only canvas records (T02 section 8). A row is identity and title only; the
// canvas content stays in the learner's browser under small.adaptive-canvas:*.
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const TITLE = 120;
// A publication's own read capability (/e/<token>): 24 random bytes, base64url - the shape of a share token
// (learn-boards.js newToken), never derived from one.
const publicationToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Shape mirrors repositoryApp (repositories.js:33-36) so Learn and the catalog read it unchanged.
export function canvasApp(row, user) {
  // access: what the owner's Visibility menu shows - public (published to Explore), unlisted (a share link), private.
  // board_saved: its main board is on the server, so no card calls its content browser-only (canvas-persistence.md, step 8).
  return { ...row, kind: 'canvas', hosting: 'canvas', email: user.email, orgName: user.orgName, visibility: 'private', members: [], published: !!row.publication_token,
    shared: !!row.shared, board_saved: !!row.board_saved, access: row.publication_token ? 'public' : row.shared ? 'unlisted' : 'private',
    canView: true, canEdit: row.owner_email === user.email, url: `/apps/${row.name}`, inputs: {}, outputs: {} };
}
// The canvas's last meaningful change (docs/features/canvas-metadata.md): a rename, a description edit, a change to its
// saved content - never a view, a selection, someone else's fork or Rabbit Hole, a copied link or a handle change. The
// same text form as created_at (SQLite datetime, here with milliseconds), so the two order together.
export const NOW = "strftime('%Y-%m-%d %H:%M:%f', 'now')";
export const touchCanvas = (db, org, canvas) => db.prepare(`INSERT INTO canvas_metadata (org, canvas, updated_at) VALUES (?, ?, ${NOW}) ON CONFLICT (org, canvas) DO UPDATE SET updated_at = excluded.updated_at`).bind(org, canvas);
// A canvas's (or project's) main board is made with its row (canvas-persistence.md, owner 2026-10-08), so publish, share,
// Duplicate and Fork never meet one with nothing on the server. Empty, in the shape an untouched canvas page saves, at
// version 0: the version a browser that saw no server copy bases its first PUT on, so that PUT is still the board's
// version 1 and a sync, as before. OR IGNORE: a canvas made before this gets one on demand and never loses one it has.
export const EMPTY_BOARD = JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [], groups: [], areas: [], exchanges: [], sources: [] });
export const emptyBoard = (db, org, owner, app, board = 'main') => db.prepare('INSERT OR IGNORE INTO learn_boards (id, org, owner_email, app, board, state_json, version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
  .bind(crypto.randomUUID(), org, owner, app, board, EMPTY_BOARD, owner, new Date().toISOString());
// An optional description, written by its owner (never generated): plain text up to 500 characters; empty clears it.
const DESCRIPTION = 500;
function canvasDescription(value) {
  if (value === null) return null;
  if (typeof value !== 'string') throw Error('Write the description as text');
  const text = value.trim();
  if (text.length > DESCRIPTION) throw Error(`Use a description of up to ${DESCRIPTION} characters`);
  return text || null;
}
function canvasTitle(value) {
  if (typeof value !== 'string' || value.trim().length > TITLE) throw Error(`Use a title of up to ${TITLE} characters`);
  return value.trim();
}
// Fork provenance on every canvas its owner reads (docs/features/canvas-forking.md; owner decision E1, 2026-10-16): the
// immediate source as the header resolves it for this owner now (withForkSources), never the title saved when it was
// forked - and the canvas's direct fork count. `published`: whether its owner published it to Explore - only an explicit owner action
// writes canvas_publications (docs/features/explore-publish.md); a share link, public_view, a fork or a Rabbit Hole never does.
export const FORK_COUNT = '(SELECT count(*) FROM canvas_forks k JOIN canvases kc ON kc.org = k.org AND kc.name = k.canvas WHERE k.forked_from_org = c.org AND k.forked_from_canvas_id = c.name)';
// A person's public handle and display name, by reference (docs/features/user-handles.md): read at the moment, never
// copied onto a canvas, so a changed handle shows everywhere at once. No handle row, no handle: never an email.
// `email` must be a qualified column of the outer row (c.owner_email): the inner tables carry their own aliases so a
// bare name can never bind to them and match every row.
export const HANDLE_OF = email => `(SELECT uh.handle FROM user_handles uh WHERE uh.email = ${email})`;
export const NAME_OF = email => `(SELECT up.name FROM user_profiles up WHERE up.email = ${email})`;
// The owner's handle and name (Home/Library cards, nested holes included); the fork itself is the forker's. A fork row's
// recorded parent is read here only for withForkSources, which replaces it with the resolved source.
const CANVAS_ROW = `SELECT c.*, f.canvas IS NOT NULL AS fork_row, f.owner_email AS fork_owner, f.forked_from_org AS fork_parent_org, f.forked_from_canvas_id AS fork_parent, f.forked_from_share AS fork_parent_share,
  ${FORK_COUNT} AS fork_count,
  ${HANDLE_OF('c.owner_email')} AS owner_handle, ${NAME_OF('c.owner_email')} AS owner_name,
  (SELECT p.token FROM canvas_publications p WHERE p.org = c.org AND p.canvas = c.name) AS publication_token,
  m.description, COALESCE(m.updated_at, c.created_at) AS updated_at,
  (SELECT b.shared FROM learn_boards b WHERE b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main') AS shared,
  EXISTS (SELECT 1 FROM learn_boards b WHERE b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main') AS board_saved,
  (SELECT t.trashed_at FROM library_trash t WHERE t.org = c.org AND t.name = c.name) AS trashed_at
  FROM canvases c LEFT JOIN canvas_forks f ON f.org = c.org AND f.canvas = c.name
  LEFT JOIN canvas_metadata m ON m.org = c.org AND m.canvas = c.name`;
// forked_from: null (not a fork), or its immediate source for this viewer from the header's resolver (learn-provenance.js
// sourceAccess): { state: 'accessible', title, url, handle }, { state: 'private' } or { state: 'unavailable' }. Every row of
// a list in one query, never one per card.
async function withForkSources(env, rows, user) {
  const forks = rows.filter(row => row.fork_row);
  const { sourceAccess } = forks.length ? await import('./learn-provenance.js') : {};
  const sources = forks.length ? await sourceAccess(env, forks.map(row => ({ org: row.fork_parent_org, name: row.fork_parent, share: row.fork_parent_share, forker: { org: row.org, email: row.fork_owner } })), user) : [];
  const of = new Map(forks.map((row, index) => [row, sources[index]]));
  return rows.map(row => {
    const { fork_row: _fork, fork_owner: _forker, fork_parent_org: _org, fork_parent: _parent, fork_parent_share: _share, ...rest } = row;
    return { ...rest, forked_from: of.get(row) ?? null };
  });
}
async function ownedCanvas(env, user, name) {
  const found = await env.LEARN_DB.prepare(`${CANVAS_ROW} WHERE c.org=? AND c.name=?`).bind(user.org, name).first();
  if (!found) return json({ error: 'Canvas not found in this workspace' }, 404);
  if (found.owner_email !== user.email) return json({ error: 'This canvas is private to its owner' }, 403);
  const [row] = await withForkSources(env, [found], user);
  return canvasApp(row, user);
}
// `pending` ({ parent: { app, board }, title }) lets a pending Rabbit Hole's chat and / commands run
// before its canvas row exists (dives.js pendingHoleApp); an existing row always wins.
// user_id (users.id, null without one) is the journey key (adaptive-learning-path-v1-architecture.md §10.2). It is set
// here, on the access object authorizedBoardApp returns, and not in canvasApp, so no canvas listing or canvas response
// the browser reads ever carries it.
export async function canvasAccess(req, env, name, pending = null) {
  const user = await repositoryIdentity(req, env);
  if (user instanceof Response) return user;
  let app = await ownedCanvas(env, user, name);
  if (app instanceof Response && app.status === 404 && pending) app = (await pendingHoleApp(env, user, name, pending)) || app;
  return app instanceof Response ? app : { ...app, user_id: user.userId ?? null };
}
// Titles are labels, never identities (docs/features/canvas-naming.md): different people may share one, and an owner
// may give two canvases the same title by hand - a typed title is kept exactly. Only a copy the system makes for its
// owner - a Duplicate, a fork - steps to the next free " (n)" when that owner's top-level Library (archived included)
// already has the title: "Example", "Example (2)", "Example (3)", skipping numbers in use. Nested Rabbit Holes, other
// owners and projects never count.
export async function freeTitle(db, org, owner, title) {
  const base = title.replace(/ \(\d+\)$/, '') || title;
  const like = `${base.replace(/[\\%_]/g, char => `\\${char}`)} (%)`;
  const { results } = await db.prepare(`SELECT c.title FROM canvases c WHERE c.org=? AND c.owner_email=? AND (c.title=? OR c.title=? OR c.title LIKE ? ESCAPE '\\') AND c.name NOT IN (SELECT child FROM canvas_dives WHERE org=? AND owner_email=? AND parent_app NOT LIKE 'share:%')`)
    .bind(org, owner, title, base, like, org, owner).all();
  const taken = new Set(results.map(row => row.title));
  if (!taken.has(title)) return title;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`, next = `${base.slice(0, TITLE - suffix.length)}${suffix}`;
    if (!taken.has(next)) return next;
  }
}

// The caller's own canvases only (owner-only in phase 1, section 8.2). Nested Rabbit Holes are left
// out: they belong to their root's tree and open through its navigator and portals (dives.js), never
// as top-level canvases in Home, Library or Search. They still open directly by their URL. A hole started
// from someone's shared canvas (parent `share:...`) is a root of the viewer's own, so it is listed.
export async function ownerCanvases(env, user, archived = false) {
  const { results } = await env.LEARN_DB.prepare(`${CANVAS_ROW} WHERE c.org=? AND c.owner_email=? AND c.archived_at IS ${archived ? 'NOT ' : ''}NULL AND ${NOT_TRASHED('c.org', 'c.name')} AND c.name NOT IN (SELECT child FROM canvas_dives WHERE org=? AND owner_email=? AND parent_app NOT LIKE 'share:%') ORDER BY updated_at DESC, c.id DESC`).bind(user.org, user.email, user.org, user.email).all();
  return (await withForkSources(env, results, user)).map(row => canvasApp(row, user));
}

// Exactly the slugs canvasesFetch creates, so a live app that merely starts with canvas- stays live.
const isCanvas = name => typeof name === 'string' && /^canvas-[a-f0-9]{8}$/.test(name);
// A repository's Main canvas is a chat home too (repo-canvas-graph.md: the canvas is the repository workspace): its Chat
// keeps its threads, History and active thread through the same routes, owner-only like a canvas.
const isRepository = name => typeof name === 'string' && /^repo-[a-z0-9-]{1,80}$/.test(name);
const isChatApp = name => isCanvas(name) || isRepository(name);
// Which dev requests are canvas traffic. dev-worker.js cannot be imported under node, so the rule lives here, tested.
// History lists only for Learn's scope (spec 8.2), so the legacy Agent panels never resume a canvas chat.
export function canvasRoute(url) {
  const path = url.pathname;
  return path === '/api/canvases' || /^\/api\/canvases\/dives(?:\/canvas-[a-f0-9]{8})?$/.test(path) || /^\/api\/apps\/canvas-[a-f0-9]{8}(?:\/|$)/.test(path) || /^\/api\/ask\/threads\/(?:canvaschat|repochat)-/.test(path)
    || (path === '/api/ask/threads' && url.searchParams.get('scope') === 'learn' && isChatApp(url.searchParams.get('ref'))) || CHAT_STATE.test(path)
    || CHAT_MESSAGES.test(path) || path === CHAT_ACTIVE;
}
// Saving a chat exchange the client already shows (a Tutor reply in Auto, owner brief 2026-10-14 chat persistence): no model
// call and no new schema. Any id reaches the handler, which answers a malformed one with 400 rather than letting it fall
// through to another route.
const CHAT_MESSAGES = /^\/api\/learn\/chat\/threads\/([^/]+)\/messages$/;
const CHAT_ACTIVE = '/api/learn/chat/active';
const CHAT_ID = /^(?:canvaschat|repochat)-[0-9a-f-]{36}$/, CLIENT_ID = /^[A-Za-z0-9_-]{1,80}$/, CONTENT = 100000;
// A / command line the Chat box sent (UI changes brief 1): saved as the user's message, its command named as an Ask turn's is.
const COMMAND = /^[a-z0-9][a-z0-9-]{0,39}$/;
const noChatTables = error => /no such table/i.test(error?.message || '');
const unavailable = () => json({ error: 'Saving chat is not available here yet' }, 503);
async function jsonObject(req) {
  const body = await req.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Send a JSON object');
  return body;
}
// The canvas a chat write names must be the caller's own, or a pending hole of theirs (the state route's fallback): null, or
// the refusal (another person's canvas).
// The caller's own repository (repository_apps), as ownedCanvas answers for a canvas: 404 unknown, 403 another person's.
async function ownedRepository(env, user, name) {
  const row = await env.LEARN_DB.prepare('SELECT * FROM repository_apps WHERE org=? AND name=?').bind(user.org, name).first();
  if (!row) return json({ error: 'Repository not found in this workspace' }, 404);
  if (row.owner_email !== user.email) return json({ error: 'This repository is private to its owner' }, 403);
  return repositoryApp(row, user);
}
const ownedChatApp = (env, user, name) => (isRepository(name) ? ownedRepository(env, user, name) : ownedCanvas(env, user, name));
async function canvasRefusal(env, user, app) {
  if (!isChatApp(app)) throw Error('Send app as a canvas name');
  const owned = await ownedChatApp(env, user, app);
  // An unknown canvas name may be a pending Rabbit Hole (no row yet); an unknown repository is just unknown.
  return owned instanceof Response && (owned.status !== 404 || isRepository(app)) ? owned : null;
}
// null when no thread has this id yet; 404 for another person's (never revealed), 409 for the caller's own on another canvas,
// so a late reply never lands in a different canvas's thread; else the row.
async function canvasThread(db, user, id, app) {
  const row = await db.prepare('SELECT org, user, scope_ref FROM threads WHERE id=?').bind(id).first();
  if (!row) return null;
  if (row.org !== user.org || row.user !== user.email) return json({ error: 'Chat not found' }, 404);
  return row.scope_ref === app ? row : json({ error: 'This chat belongs to another canvas', code: 'thread_canvas_mismatch' }, 409);
}
// POST /api/learn/chat/threads/<id>/messages: one message, idempotent per (thread, client_id). The client mints the thread id,
// so the first POST creates the thread and a retried create never makes a second one.
async function saveChatMessage(req, env, user, id) {
  const db = env.LEARN_DB, body = await jsonObject(req);
  const { app, client_id: clientId, role, content, title } = body, status = body.status ?? 'done', mode = body.mode ?? 'auto', command = body.command ?? null;
  if (!CHAT_ID.test(id)) throw Error('Chat id must be canvaschat- or repochat- and a UUID');
  if (typeof clientId !== 'string' || !CLIENT_ID.test(clientId)) throw Error('client_id must be 1-80 letters, digits, _ or -');
  if (!['user', 'assistant'].includes(role)) throw Error('role must be user or assistant');
  if (role === 'user' && body.status !== undefined) throw Error('Only an assistant message has a status');
  if (!['done', 'interrupted'].includes(status)) throw Error('status must be done or interrupted');
  if (!CHAT_MODES.includes(mode)) throw Error('Mode must be auto, ask or tutor');
  if (typeof content !== 'string' || content.length > CONTENT) throw Error(`content must be text of at most ${CONTENT} characters`);
  if (!content.trim() && status !== 'interrupted') throw Error('content is required');
  if (title != null && typeof title !== 'string') throw Error('title must be text');
  if (command !== null && (role !== 'user' || typeof command !== 'string' || !COMMAND.test(command))) throw Error('command must be a Learn command name, on a user message');
  const refused = await canvasRefusal(env, user, app); if (refused) return refused;
  const thread = await canvasThread(db, user, id, app); if (thread instanceof Response) return thread;
  // ponytail: select-then-insert, so two truly concurrent POSTs of one client_id can both insert. A unique index on
  // (thread_id, json_extract(meta_json, '$.clientId')) closes that race; it is a migration, so it waits for its own GO.
  const saved = () => db.prepare("SELECT message_id FROM chat_message_meta WHERE thread_id=? AND json_extract(meta_json, '$.clientId')=?").bind(id, clientId).first();
  let row;
  try { row = await saved(); } catch (error) { if (noChatTables(error)) return unavailable(); throw error; } // before any write: 0019 missing creates nothing
  if (row) return json({ threadId: id, messageId: String(row.message_id), clientId, duplicate: true });
  // The meta shapes chat-modes.js stores (recordUserTurn, recordAnswer), plus the clientId a retry is found by.
  const meta = role === 'user' ? { mode, command, contextRefs: [], clientId }
    : status === 'interrupted' ? { status, mode, clientId }
    : { version: 1, mode, kind: 'answer', contextRefs: [], actions: [], followUps: [], syllabus: null, source: 'tutor', clientId };
  const at = new Date().toISOString();
  // One batch, so a message never lands without the meta row its retry is found by; that row takes the thread's newest
  // message, the one this batch just inserted.
  await db.batch([
    ...(thread ? [] : [db.prepare("INSERT OR IGNORE INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES(?,?,?,?,'',?)").bind(id, user.org, user.email, app, (title || content).slice(0, TITLE))]),
    db.prepare('INSERT INTO messages(thread_id,role,content) VALUES(?,?,?)').bind(id, role, content),
    db.prepare('INSERT INTO chat_message_meta(message_id,thread_id,role,meta_json) SELECT max(id),?,?,? FROM messages WHERE thread_id=?').bind(id, role, JSON.stringify(meta), id),
    db.prepare('INSERT INTO chat_thread_state(thread_id,last_activity_at,updated_at) VALUES(?,?,?) ON CONFLICT(thread_id) DO UPDATE SET last_activity_at=excluded.last_activity_at, updated_at=excluded.updated_at').bind(id, at, at),
  ]);
  return json({ threadId: id, messageId: String((await saved()).message_id), clientId, duplicate: false }, 201);
}
// The open thread per canvas is one chat_thread_state row (no new column or table): its thread_id is a synthetic key per
// canvas, workspace and person - no real thread id starts with 'active:', so History's join and a thread's delete never meet
// it - and context_json holds { threadId }. Only PUT /api/learn/chat/active writes it, never a message save, so a late answer
// finishing in thread A cannot make A the open thread after the person opened B.
// slot 'toc' (owner brief 2026-10-16 item 7): the Table of contents' own conversation keeps its own open thread, a second key
// beside Chat's, so the two never restore each other's thread. Its threads are ordinary threads of the canvas.
const activeKey = (user, app, slot = null) => `active:${slot ? `${slot}:` : ''}${app}:${user.org}:${user.email}`;
const activeSlot = slot => { if (slot == null || slot === 'toc') return slot ?? null; throw Error('slot must be toc'); };
async function activeChat(req, env, user, url) {
  const db = env.LEARN_DB;
  if (req.method === 'GET') {
    const app = url.searchParams.get('app'), slot = activeSlot(url.searchParams.get('slot'));
    const refused = await canvasRefusal(env, user, app); if (refused) return refused;
    let saved = null;
    try { saved = JSON.parse((await db.prepare('SELECT context_json FROM chat_thread_state WHERE thread_id=?').bind(activeKey(user, app, slot)).first())?.context_json ?? 'null')?.threadId; }
    catch (error) { if (!noChatTables(error) && !(error instanceof SyntaxError)) throw error; }
    // A thread since deleted, or no longer this person's on this canvas, is none.
    const thread = typeof saved === 'string' ? await canvasThread(db, user, saved, app) : null;
    return json({ threadId: thread && !(thread instanceof Response) ? saved : null });
  }
  if (req.method !== 'PUT') return json({ error: 'GET or PUT required' }, 405);
  const { app, thread_id: threadId, slot: rawSlot } = await jsonObject(req);
  const slot = activeSlot(rawSlot);
  if (threadId !== null && !(typeof threadId === 'string' && CHAT_ID.test(threadId))) throw Error('thread_id must be a chat id or null');
  const refused = await canvasRefusal(env, user, app); if (refused) return refused;
  if (threadId) {
    const thread = await canvasThread(db, user, threadId, app);
    if (!thread) return json({ error: 'Chat not found' }, 404);
    if (thread instanceof Response) return thread;
  }
  const at = new Date().toISOString();
  try {
    await db.prepare('INSERT INTO chat_thread_state(thread_id,context_json,updated_at) VALUES(?,?,?) ON CONFLICT(thread_id) DO UPDATE SET context_json=excluded.context_json, updated_at=excluded.updated_at')
      .bind(activeKey(user, app, slot), JSON.stringify({ threadId }), at).run();
  } catch (error) { if (noChatTables(error)) return unavailable(); throw error; }
  return json({ threadId });
}
// A Chat thread's saved state (chat-workspace-CONTRACT.md A3): its mode, attached ContextRefs (A2) and draft, upserted into
// chat_thread_state by PUT /api/learn/chat/threads/<id>/state. last_activity_at is the turn's (apiAsk), never touched here.
const CHAT_STATE = /^\/api\/learn\/chat\/threads\/((?:canvaschat|repochat)-[a-f0-9-]+)\/(state)$/;
const REF_PREFIXES = { doc: ['doc'], card: ['card'], group: ['group'], code: ['code'], image: ['image'], media: ['media'], web: ['paper', 'wiki'], file: ['file'], excerpt: ['excerpt'] };
const short = (value, limit) => typeof value === 'string' && value.length <= limit;
// null, or exactly one of the A2 range shapes.
function validRange(range) {
  if (range == null) return true;
  if (typeof range !== 'object' || Array.isArray(range)) return false;
  const page = Number.isInteger(range.page) && range.page > 0, quote = range.quote === undefined || short(range.quote, 500);
  switch (Object.keys(range).sort().join()) {
    case 'page': case 'page,quote': return page && quote;
    case 'quote': return short(range.quote, 500) && range.quote.length > 0;
    case 'cardIds': return Array.isArray(range.cardIds) && range.cardIds.length > 0 && range.cardIds.length <= 50 && range.cardIds.every(id => short(id, 200));
    case 'end,path,start': return short(range.path, 500) && Number.isInteger(range.start) && range.start > 0 && Number.isInteger(range.end) && range.end >= range.start;
    case 'startSec': case 'endSec,startSec': return Number.isFinite(range.startSec) && range.startSec >= 0 && (range.endSec === undefined || (Number.isFinite(range.endSec) && range.endSec >= range.startSec));
    default: return validFileRange(range); // an imported file's scope (file-chat-ref.js): slide, sheet, rows, cell, object
  }
}
// A2 limits: at most 20 refs, each at most 2 KB as JSON without its text, text only on card/group/image/media (<= 8000),
// and all texts together at most 32000 chars.
export function validContextRefs(refs) {
  if (!Array.isArray(refs) || refs.length > 20) return false;
  let texts = 0, excerpts = 0;
  const valid = refs.every(ref => {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return false;
    // open: an excerpt's reader ref, on its own bound (chat-modes.js validOpen), never counted in the 2 KB.
    const { text, open, ...rest } = ref;
    if (!validOpen(ref.kind, open)) return false;
    // A pinned PDF excerpt keeps its verbatim text on its own budget (chat-modes.js EXCERPT_TEXT, EXCERPTS_TEXT).
    if (ref.kind === 'excerpt') { if (!(/^excerpt:pdfx_[0-9a-f]{24}$/.test(String(ref.sourceId)) && (text === undefined || short(text, 12000)))) return false; excerpts += text?.length || 0; }
    else if (text !== undefined && !(['card', 'group', 'image', 'media'].includes(ref.kind) && short(text, 8000))) return false;
    else texts += text?.length || 0;
    if (ref.kind === 'file' && !(FILE_SOURCE.test(String(ref.sourceId)) && validFileRange(ref.range))) return false;
    return Object.hasOwn(REF_PREFIXES, ref.kind) && short(ref.sourceId, 1000) && REF_PREFIXES[ref.kind].includes(ref.sourceId.split(':')[0]) && ref.sourceId.indexOf(':') < ref.sourceId.length - 1
      && short(ref.name, 120) && ref.name.length > 0 && short(ref.version, 200) && validRange(ref.range) && JSON.stringify(rest).length <= 2048;
  });
  return valid && texts <= 32000 && excerpts <= 96000;
}
// The columns a state PUT writes: only what it sends. draft: null clears the saved draft.
export function chatThreadState(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Send a mode, contextRefs or a draft');
  const fields = {};
  if (body.mode !== undefined) { if (!CHAT_MODES.includes(body.mode)) throw Error('Mode must be auto, ask or tutor'); fields.mode = body.mode; }
  if (body.contextRefs !== undefined) { if (!validContextRefs(body.contextRefs)) throw Error('Invalid context: at most 20 sources, each a valid reference'); fields.context_json = JSON.stringify(body.contextRefs); }
  if (body.draft !== undefined) {
    const draft = body.draft;
    if (draft !== null && !(typeof draft === 'object' && short(draft.text, 8000) && (draft.command == null || (typeof draft.command === 'string' && /^[\w-]{1,40}$/.test(draft.command))))) throw Error('A draft is at most 8000 characters');
    fields.draft_json = draft === null ? null : JSON.stringify({ text: draft.text, command: draft.command ?? null });
  }
  if (!Object.keys(fields).length) throw Error('Send a mode, contextRefs or a draft');
  return fields;
}
// Canvas asks the dev Learn router does not answer. A multipart Learn ask carries a + attachment,
// which canvases do not take yet (the dev worker calls this before its Learn router); a JSON /api/ask
// comes from the legacy Agent panels and would carry canvas chat to live small-cp. Learn's JSON asks
// never get here: the dev Learn router answers them with the LEARN_DB seam.
export async function refuseCanvasAsk(req) {
  const path = new URL(req.url).pathname;
  const multipart = req.headers.get('content-type')?.includes('multipart/form-data');
  if (req.method !== 'POST' || !['/api/ask', '/api/learn/ask', '/api/learn/selection'].includes(path) || (!multipart && path !== '/api/ask')) return null;
  let app = null;
  try { app = (multipart ? JSON.parse((await req.clone().formData()).get('body') || '{}') : await req.clone().json()).scope?.app; } catch { /* live small-cp answers malformed bodies as today */ }
  if (!isCanvas(app)) return null;
  return json({ error: multipart ? 'Attachments are not available on canvases yet. Upload a PDF from the canvas menu.' : 'Canvas chat runs in Learn. Open the canvas to ask there.' }, 400);
}

// The dev Learn router serves an ask only on dev storage: a canvas through canvasAskSeam, a repo-*
// app through repositoriesFetch. A job or server app's ask would reach apiAsk on the live D1
// (threads, messages), and the preview never sends one (D7), so it is refused here.
export function refuseLiveLearnAsk(access) {
  if (access.kind === 'canvas' || access.kind === 'repository') return null;
  return json({ error: 'Learn on a live app is off on this preview: it would write live chat history.' }, 403);
}

export async function canvasesFetch(req, env) {
  const url = new URL(req.url), path = url.pathname, db = env.LEARN_DB;
  const user = await repositoryIdentity(req, env); if (user instanceof Response) return user;
  try {
    if (path.startsWith('/api/canvases/dives')) return await divesFetch(req, env, user);
    if (path === '/api/canvases') {
      if (req.method === 'GET') return json({ canvases: await ownerCanvases(env, user, url.searchParams.get('archived') === '1') });
      if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      const body = await req.json();
      const title = canvasTitle(body.title ?? '') || 'Untitled canvas', project = body.project ?? null, device = body.device_id ?? null;
      if (device !== null && !(typeof device === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(device))) throw Error('Invalid device id');
      if (project !== null && !(typeof project === 'string' && await db.prepare('SELECT 1 FROM repository_apps WHERE org=? AND name=? AND owner_email=?').bind(user.org, project, user.email).first())) return json({ error: 'Project not found in this workspace' }, 404);
      // ponytail: no per-owner canvas cap (repositories cap 25 per workspace); add one if dev rows grow unbounded.
      // One batch: a canvas is its row and its empty main board together, or nothing.
      const name = `canvas-${crypto.randomUUID().slice(0, 8)}`;
      // A canvas added to a project takes the project's visibility (owner, 2026-10-09; visibility-menu.md "Projects"), read
      // before it joins: unlisted, its own view link; public, its Explore publication under the owner's @handle. A private
      // or mixed project adds it private.
      const inherit = project ? projectAccess(await db.prepare(`SELECT ${PROJECT_FIELDS()} FROM repository_apps r WHERE r.org=? AND r.name=?`).bind(user.org, project).first()) : 'private';
      await db.batch([
        db.prepare('INSERT INTO canvases(org,name,owner_email,title,project,device_id) VALUES(?,?,?,?,?,?)').bind(user.org, name, user.email, title, project, device),
        emptyBoard(db, user.org, user.email, name),
      ]);
      if (inherit === 'unlisted') {
        // learn-boards.js imports this module: load it here, not at the top (learn-context-docs.js does the same).
        const [{ newToken }, { sharePin }] = await Promise.all([import('./learn-boards.js'), import('./learn-shared-ask.js')]);
        const view = newToken();
        await db.prepare("UPDATE learn_boards SET shared = 1, view_token = ? WHERE org = ? AND owner_email = ? AND app = ? AND board = 'main'").bind(view, user.org, user.email, name).run();
        await sharePin(db, await db.prepare("SELECT * FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = 'main'").bind(user.org, user.email, name).first());
      }
      if (inherit === 'public' && await db.prepare('SELECT 1 FROM user_handles WHERE email = ?').bind(user.email).first()) {
        await db.prepare('INSERT OR IGNORE INTO canvas_publications (org, canvas, token) VALUES (?, ?, ?)').bind(user.org, name, publicationToken()).run();
      }
      return json(await ownedCanvas(env, user, name), 201);
    }
    const saving = path.match(CHAT_MESSAGES);
    if (saving) return req.method === 'POST' ? await saveChatMessage(req, env, user, saving[1]) : json({ error: 'POST required' }, 405);
    if (path === CHAT_ACTIVE) return await activeChat(req, env, user, url);
    // Learn's chat keeps its /api/ask/threads calls (ask.jsx:388,401,601,622); canvas history lives in LEARN_DB.
    const thread = path.match(/^\/api\/ask\/threads(?:\/((?:canvaschat|repochat)-[a-f0-9-]+)(?:\/(delete|rename))?)?$/) || path.match(CHAT_STATE);
    if (thread) {
      const [, id, action] = thread;
      if (action === 'state' ? req.method !== 'PUT' : action && req.method !== 'POST') return json({ error: `${action === 'state' ? 'PUT' : 'POST'} required` }, 405);
      const ref = id ? (await db.prepare('SELECT scope_ref FROM threads WHERE id=? AND org=? AND user=?').bind(id, user.org, user.email).first())?.scope_ref : url.searchParams.get('ref');
      if (!ref) return json({ error: 'Chat not found' }, 404);
      if (!isChatApp(ref)) return json({ error: 'Chat not found' }, 404);
      let app = await ownedChatApp(env, user, ref);
      // A pending hole has no row yet; its history is still only this user's own threads for that name.
      if (app instanceof Response && app.status === 404 && isCanvas(ref)) app = canvasApp({ id: null, org: user.org, name: ref, owner_email: user.email, title: '' }, user);
      if (app instanceof Response) return app;
      if (action === 'state') {
        const fields = chatThreadState(await req.json()), columns = Object.keys(fields);
        try {
          await db.prepare(`INSERT INTO chat_thread_state (thread_id, ${columns.join(', ')}, updated_at) VALUES (?, ${columns.map(() => '?').join(', ')}, datetime('now')) ON CONFLICT(thread_id) DO UPDATE SET ${columns.map(column => `${column} = excluded.${column}`).join(', ')}, updated_at = excluded.updated_at`).bind(id, ...Object.values(fields)).run();
        } catch (error) {
          // learn-migrations 0019 not applied on this database yet: nothing is saved, and no table is made here.
          if (/no such table/i.test(error.message)) return json({ error: 'Saving chat state is not available here yet' }, 503);
          throw error;
        }
        return json({ ok: true });
      }
      return repositoryThreads(new Request(req, { method: action === 'delete' ? 'DELETE' : action === 'rename' ? 'PATCH' : req.method }), db, user, app, id);
    }
    const match = path.match(/^\/api\/apps\/(canvas-[a-f0-9]{8})(?:\/(archive|restore|learn-course|publish|unpublish|trash|untrash))?$/);
    if (!match) return json({ error: 'Not found' }, 404);
    const [, name, action] = match;
    const app = await ownedCanvas(env, user, name); if (app instanceof Response) return app;
    // Learn loads a course on mount (LearnCourse.jsx:22-27); canvases have none. Shape of learn-course.js:67.
    if (action === 'learn-course') return req.method === 'GET' ? json({ course: null, revision: 0, canAuthor: false }) : json({ error: 'Courses are not available on canvases' }, 405);
    if (action) {
      if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
      // Publish to Explore / Remove from Explore (docs/features/explore-publish.md): the owner's explicit action, and the
      // only writer of canvas_publications. Unpublishing removes discoverability only: share links stay as they are.
      if (action === 'publish' || action === 'unpublish') {
        if (action === 'publish') {
          // Owner, 2026-10-06: only a live, top-level canvas, and only under the owner's public @handle - Explore never
          // shows an email. Publishing again keeps the same publication and token. A canvas never opened publishes empty,
          // and one made before boards came with their rows gets its empty board now (owner, 2026-10-08).
          if (app.archived_at) return json({ error: 'Restore this canvas before publishing it.' }, 409);
          if (app.trashed_at) return json({ error: 'Restore this canvas from Trash before publishing it.' }, 409);
          if (await db.prepare('SELECT 1 FROM canvas_dives WHERE org = ? AND child = ?').bind(user.org, name).first()) return json({ error: 'A Rabbit Hole inside another canvas cannot be published on its own.' }, 409);
          if (!app.owner_handle) return json({ error: 'Choose your handle before publishing.', needsHandle: true }, 409);
          await db.batch([emptyBoard(db, user.org, user.email, name), db.prepare('INSERT OR IGNORE INTO canvas_publications (org, canvas, token) VALUES (?, ?, ?)').bind(user.org, name, publicationToken())]);
        } else await db.prepare('DELETE FROM canvas_publications WHERE org = ? AND canvas = ?').bind(user.org, name).run();
        return json(await ownedCanvas(env, user, name));
      }
      // Move to Trash / Restore (docs/features/library-trash.md): an owned top-level canvas only - a nested Rabbit Hole goes
      // with its canvas. Its publication goes too; its share links are suspended, not lost. Neither bumps updated_at.
      if (action === 'trash' || action === 'untrash') {
        if (action === 'trash' && await db.prepare("SELECT 1 FROM canvas_dives WHERE org = ? AND child = ? AND parent_app NOT LIKE 'share:%'").bind(user.org, name).first()) {
          return json({ error: 'A Rabbit Hole inside another canvas goes to Trash with its canvas.' }, 409);
        }
        await db.batch(trashStatements(db, user.org, name, action === 'trash'));
        return json(await ownedCanvas(env, user, name));
      }
      // Archived means out of Explore too (the safest reading): restoring never publishes it again by itself.
      if (action === 'archive') await db.prepare('DELETE FROM canvas_publications WHERE org = ? AND canvas = ?').bind(user.org, name).run();
      await db.prepare(`UPDATE canvases SET archived_at=${action === 'archive' ? "datetime('now')" : 'NULL'} WHERE id=?`).bind(app.id).run();
      return json(await ownedCanvas(env, user, name));
    }
    if (req.method === 'GET') return json(app);
    // Rename and Edit description; either one that changes something is the canvas's latest meaningful change.
    if (req.method === 'PATCH') {
      const body = await req.json();
      const title = body.title === undefined ? app.title : canvasTitle(body.title);
      if (!title) throw Error('Title required');
      const description = body.description === undefined ? app.description ?? null : canvasDescription(body.description);
      if (title === app.title && description === (app.description ?? null)) return json(app);
      await db.batch([
        db.prepare('UPDATE canvases SET title=? WHERE id=?').bind(title, app.id),
        touchCanvas(db, user.org, name),
        db.prepare('UPDATE canvas_metadata SET description=? WHERE org=? AND canvas=?').bind(description, user.org, name),
      ]);
      return json(await ownedCanvas(env, user, name));
    }
    if (req.method === 'DELETE') {
      // Undo only while untouched (section 8.4). One statement, so a thread started meanwhile keeps the canvas.
      const { meta } = await db.prepare('DELETE FROM canvases WHERE id=? AND NOT EXISTS (SELECT 1 FROM threads WHERE org=? AND scope_ref=?)').bind(app.id, user.org, name).run();
      if (meta.changes) {
        await db.batch([
          db.prepare('DELETE FROM canvas_publications WHERE org = ? AND canvas = ?').bind(user.org, name),
          dropRefs(db, user.org, user.email, name),
          dropFileRefs(db, user.org, user.email, name),
          db.prepare("DELETE FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = 'main'").bind(user.org, user.email, name),
        ]);
      }
      return meta.changes ? json({ ok: true }) : json({ error: 'This canvas has been used. Archive it instead.' }, 405);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) { return json({ error: error.message }, 400); }
}

// A project canvas asks with its project's repository, as the Main canvas does (docs/features/project-canvases.md): the
// same system note and code tools, on the project's current snapshot. apiAsk reads it on every ask, and only as the
// caller's own project in this workspace: another person's, one in Trash, one gone or not indexed yet, or a snapshot
// that will not load leaves a general canvas, quietly.
export async function projectRepository(env, app) {
  if (!app.project) return null;
  try {
    const row = await env.LEARN_DB.prepare(`SELECT * FROM repository_apps r WHERE r.org=? AND r.name=? AND r.owner_email=? AND ${NOT_TRASHED('r.org', 'r.name')}`).bind(app.org, app.project, app.email).first();
    if (!row?.commit_sha) return null;
    const snapshot = await repositorySnapshot(env, row);
    return {
      context: `SCOPE: canvas ${JSON.stringify(app.title)} in the project ${row.repo} - a learning canvas whose content lives in the learner's browser, about this repository: ${JSON.stringify({ repo: row.repo, commit: row.commit_sha })}`,
      system: REPOSITORY_SYSTEM, tools: REPOSITORY_TOOLS, runTool: (name, input) => repositoryTool(snapshot, name, input),
      // The learner's code refs (graph and Files selections), read from this snapshot only (repository-context.js).
      // A code card pinned to another commit of a repository the learner owns is read at that commit (cardCodeRefs).
      selected: async refs => ({ selectedEntities: await cardCodeRefs(env, { org: app.org, email: app.email }, refs, snapshot), selectedNote: SELECTED_NOTE }),
    };
  } catch { return null; }
}

// apiAsk's seam (index.js): the app, its context and the thread store all come from LEARN_DB,
// so a canvas turn neither writes nor reads live D1: @-mentioned apps are not read on a seam turn
// (apiAsk). Threads reuse repository-schema.sql threads/messages. `repository`: projectRepository, per ask.
export function canvasAskSeam(env, app) {
  const db = env.LEARN_DB;
  return {
    app, db,
    // The title is a weak hint (chat workspace brief section 8): a stale title must never outrank the discussion or material.
    context: `SCOPE: canvas ${JSON.stringify(app.title)} - a standalone learning canvas whose content lives in the learner's browser. The title is a weak hint and may be outdated: it is never the topic when the request, recent turns, attached material or the selection say otherwise. Teach as a general tutor.`,
    repository: () => projectRepository(env, app),
    // Code cards and selections on a canvas outside a project (or whose project the asker cannot read): each read at its own
    // commit under the repository rule (repositories.js readableVersion), so a fork or a copy can ask about them too.
    selected: async refs => ({ selectedEntities: await cardCodeRefs(env, { org: app.org, email: app.email }, refs), selectedNote: SELECTED_NOTE }),
    findThread: id => db.prepare("SELECT id, 'learn' AS scope, scope_ref FROM threads WHERE id=? AND org=? AND user=?").bind(id, app.org, app.email).first(),
    newThread: async title => {
      const id = `canvaschat-${crypto.randomUUID()}`;
      await db.prepare("INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES(?,?,?,?,'',?)").bind(id, app.org, app.email, app.name, title.slice(0, 120)).run();
      return id;
    },
  };
}
