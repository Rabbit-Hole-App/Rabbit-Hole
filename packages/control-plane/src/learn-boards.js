// /api/learn/boards* on the dev worker: Learn canvas boards saved on the
// server and shared by link (docs/features/canvas-sharing.md).
//
// The owner saves a board while it is shared; a share is a view link - a
// random token stored on the board's row, so switching it (or sharing) off
// revokes it. It can be public - readable without signing in. Shared links are
// always view-only: editing someone else's board means forking it.
import { authorizedBoardApp } from './learn-board.js';
import { repositoryIdentity } from './repositories.js';
import { sha256Hex } from './learn-grade-jev.js';
import { learnMedia } from './learn-storage.js';
import { FORK_COUNT, HANDLE_OF, NAME_OF } from './canvases.js';
import { askShared, boardRevision, boardSources, shareKey, sharePin, shareSource, sharedTitle } from './learn-shared-ask.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
// D1 caps one value at 2 MB; a board over this is refused, not truncated.
export const MAX_STATE = 1_900_000;

// Board files (images, PDFs, clips, generated illustrations) live in R2 under
// the board's row, keyed by a hash of the canvas's own asset key.
export const MAX_ASSET = 25 * 1024 * 1024;
const ASSET_KEY = /^[\x20-\x7e]{1,500}$/;
// Served types: anything else is stored as opaque bytes, so an upload can never
// come back as a page on this origin.
const SAFE_TYPE = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|video\/(mp4|webm|quicktime)|audio\/(mpeg|wav|ogg|webm)|text\/x-cached-string)$/;
const assetObject = async (row, key) => `learn-boards/${row.id}/${await sha256Hex(key)}`;

async function putAsset(req, env, row, key) {
  if (!learnMedia(env)) return json({ error: 'Board files need the R2 bucket on this worker.' }, 503);
  if (!ASSET_KEY.test(key)) return json({ error: 'Bad asset key' }, 400);
  if (Number(req.headers.get('content-length') || 0) > MAX_ASSET) return json({ error: 'This file is over 25 MB and stays in your browser.' }, 413);
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > MAX_ASSET) return json({ error: 'This file is over 25 MB and stays in your browser.' }, 413);
  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  await learnMedia(env).put(await assetObject(row, key), bytes, {
    httpMetadata: { contentType: SAFE_TYPE.test(type) ? type : 'application/octet-stream' },
    customMetadata: { key, kind: req.headers.get('x-asset-kind') === 'string' ? 'string' : 'blob' },
  });
  return json({ key, size: bytes.byteLength });
}

async function getAsset(env, row, key) {
  if (!learnMedia(env) || !ASSET_KEY.test(key)) return json({ error: 'No such file on this board' }, 404);
  const object = await learnMedia(env).get(await assetObject(row, key));
  if (!object) return json({ error: 'No such file on this board' }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'X-Asset-Kind': object.customMetadata?.kind || 'blob',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Content-Disposition': 'attachment',
      // A notebook's workspace copy changes under the same key: always revalidate.
      'Cache-Control': 'private, no-cache',
    },
  });
}

async function listAssets(env, row) {
  if (!learnMedia(env)) return json({ keys: [] });
  const keys = [];
  let cursor;
  do {
    const page = await learnMedia(env).list({ prefix: `learn-boards/${row.id}/`, cursor, include: ['customMetadata'] });
    for (const object of page.objects) if (object.customMetadata?.key) keys.push(object.customMetadata.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json({ keys });
}

export const newToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const sharingOf = row => (row ? { shared: !!row.shared, view: row.view_token || null, edit: row.edit_token || null, public_view: !!row.public_view } : { shared: false, view: null, edit: null, public_view: false });

async function readBody(req) {
  try { return await req.json(); } catch { return null; }
}

function stateText(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { error: 'state must be a board object' };
  const text = JSON.stringify(state);
  return text.length > MAX_STATE ? { error: 'This board is too large to share (over 1.9 MB). Remove large images or outputs and try again.', status: 413 } : { text };
}

const ownerRow = (env, owner, app, board) => env.LEARN_DB.prepare('SELECT * FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = ?').bind(owner.org, owner.email, app, board).first();

// Save the owner's board. A stale version (someone with the edit link saved
// since) is refused with the newer version, never overwritten.
async function saveOwn(env, owner, app, board, body) {
  const state = stateText(body?.state);
  if (state.error) return json({ error: state.error }, state.status || 400);
  const row = await ownerRow(env, owner, app, board);
  const now = new Date().toISOString();
  if (!row) {
    await env.LEARN_DB.prepare('INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)')
      .bind(crypto.randomUUID(), owner.org, owner.email, app, board, state.text, owner.email, now).run();
    return json({ version: 1, sharing: sharingOf(null) });
  }
  if (Number.isInteger(body.version) && body.version !== row.version) return json({ error: 'This board changed since you opened it.', version: row.version }, 409);
  await env.LEARN_DB.prepare('UPDATE learn_boards SET state_json = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?').bind(state.text, owner.email, now, row.id).run();
  return json({ version: row.version + 1, sharing: sharingOf(row) });
}

// Turn sharing and each link on or off. A link switched back on gets a new
// token, so an old copy of it stays dead.
async function share(env, owner, app, board, body) {
  let row = await ownerRow(env, owner, app, board);
  if (!row) {
    const saved = await saveOwn(env, owner, app, board, body);
    if (!saved.ok) return saved;
    row = await ownerRow(env, owner, app, board);
  }
  const shared = !!body?.shared;
  const view = shared && !!body.view ? (row.view_token || newToken()) : null;
  const edit = null; // links are view-only (edit_token stays for older rows only)
  const publicView = shared && !!body.view && !!body.public_view ? 1 : 0;
  await env.LEARN_DB.prepare('UPDATE learn_boards SET shared = ?, view_token = ?, edit_token = ?, public_view = ? WHERE id = ?')
    .bind(shared ? 1 : 0, view, edit, publicView, row.id).run();
  // A new link pins the repository commit it answers from (docs/features/shared-canvas-ask.md); the same link keeps its pin.
  const updated = { ...row, shared: shared ? 1 : 0, view_token: view, edit_token: edit, public_view: publicView };
  if (view) await sharePin(env.LEARN_DB, updated);
  return json({ version: row.version, sharing: await ownerSharing(env, updated) });
}

// The Share panel's view of a link's repository: only a repository the owner owns (a fork's inherited one is never
// theirs to open up). private: not confirmed public, so the panel offers repository code for this link.
async function ownerSharing(env, row) {
  const source = row?.shared && row.view_token ? await shareSource(env.LEARN_DB, row) : null;
  return { ...sharingOf(row), ...(source?.owned ? { repository: { repo: source.repo, commit: source.commit, private: !source.public, repo_access: source.repo_access } } : {}) };
}

// The owner's repository-code permission for this link (owner-only; the server decides, never a client flag): a
// private repository of theirs is read for this link's viewers only while it is on. A public one needs nothing,
// and a new link starts with it off.
async function shareRepository(env, owner, app, board, body) {
  if (typeof body?.allow !== 'boolean') return json({ error: 'allow must be true or false' }, 400);
  const row = await ownerRow(env, owner, app, board);
  if (!row?.shared || !row.view_token) return json({ error: 'Turn the view link on first.' }, 409);
  const source = await shareSource(env.LEARN_DB, row);
  if (!source?.owned || source.public) return json({ error: 'Only a private repository of yours needs this permission.' }, 409);
  await env.LEARN_DB.prepare('UPDATE board_repository_pins SET repo_access = ? WHERE board_id = ? AND share_key = ?').bind(body.allow ? 1 : 0, row.id, await shareKey(row.view_token)).run();
  return json({ version: row.version, sharing: await ownerSharing(env, row) });
}

async function sharedRow(env, token) {
  if (!TOKEN.test(token)) return null;
  const row = await env.LEARN_DB.prepare('SELECT * FROM learn_boards WHERE shared = 1 AND view_token = ?').bind(token).first();
  return row ? { row, role: 'view' } : null;
}

// Who may open a shared link: anyone for a public view link, otherwise any
// signed-in account. Returns the row and role (and the viewer, when it had to
// ask), or the refusal.
async function sharedAccess(req, env, token) {
  const found = await sharedRow(env, token);
  if (!found) return json({ error: 'This link is not shared any more, or never was.' }, 404);
  if (!(found.role === 'view' && found.row.public_view)) {
    const viewer = await repositoryIdentity(req, env);
    if (viewer instanceof Response) return json({ error: 'Sign in to open this board.', signIn: true }, 401);
    found.viewer = viewer;
  }
  return found;
}

// Asking about a shared canvas (docs/features/shared-canvas-ask.md): whoever may open the link, and signed
// in even on a public link. Answered by learn-shared-ask.js, which writes nothing.
const MAX_ASK_BODY = 128 * 1024;
async function askAboutShared(req, env, token) {
  const found = await sharedAccess(req, env, token);
  if (found instanceof Response) return found;
  const viewer = found.viewer || await repositoryIdentity(req, env);
  if (viewer instanceof Response) return viewer.status === 401 ? json({ error: 'Sign in to ask about this canvas.', signIn: true }, 401) : viewer;
  const raw = await req.text();
  if (raw.length > MAX_ASK_BODY) return json({ error: 'This question and its history are too long.' }, 413);
  let body = null;
  try { body = JSON.parse(raw); } catch { /* askShared refuses a missing message */ }
  return askShared(env, found.row, viewer, body);
}

// Forking (docs/features/canvas-forking.md): the signed-in user gets their own
// Canvas - a row in the canvases catalog, standalone (no project) - holding a
// server copy of the board, its files and its notebook workspaces. Notebooks
// get new ids, so a fork never shares a browser workspace with its source.
// Where it came from is a canvas_forks row; the copy's forked_from JSON keeps
// the title for Learn's "Your fork of ..." notice.
const CANVAS = /^canvas-[a-f0-9]{8}$/;
const FORK_KEY = /^[A-Za-z0-9_-]{8,64}$/;
// A fork copies the board's content and nothing else a browser saved beside it
// (selection, view, anything newer); chat cards arrive settled, never mid-answer.
const CONTENT = ['strokes', 'shapes', 'items', 'links', 'blocks', 'groups', 'areas', 'exchanges'];
export function forkState(state) {
  const out = {};
  for (const key of CONTENT) if (Array.isArray(state?.[key])) out[key] = state[key];
  if (out.exchanges) out.exchanges = out.exchanges.map(exchange => ({ ...exchange, status: 'done' }));
  return out;
}

// What a fork copies from. A share link: whoever may open it (existing rules).
// A canvas by name: its owner only - and their browser holds its content, so
// the request carries it (`state`); without it, the board's server copy.
async function forkSource(req, env, user, body) {
  const source = body?.source;
  if (typeof source?.token === 'string') {
    const found = await sharedAccess(req, env, source.token);
    if (found instanceof Response) return found;
    const { row } = found;
    const canvas = CANVAS.test(row.app) ? await env.LEARN_DB.prepare('SELECT name, title FROM canvases WHERE org = ? AND name = ?').bind(row.org, row.app).first() : null;
    // The fork inherits the share's pinned revision (never the current HEAD); a repository the share may not show
    // stays unnamed in the fork's title and provenance.
    const pinned = await shareSource(env.LEARN_DB, row);
    return { row, state: JSON.parse(row.state_json), org: row.org, canvas: canvas?.name ?? null, owner: row.owner_email, title: sharedTitle(row, canvas?.title, pinned), share: source.token,
      revision: pinned && { id: pinned.id, commit: pinned.commit }, resource: canvas?.name || (row.app.startsWith('repo-') && !pinned?.allowed ? null : row.app) };
  }
  if (typeof source?.canvas !== 'string' || !CANVAS.test(source.canvas)) return json({ error: 'Choose a canvas or a share link to fork.' }, 400);
  const canvas = await env.LEARN_DB.prepare('SELECT name, title, owner_email FROM canvases WHERE org = ? AND name = ?').bind(user.org, source.canvas).first();
  if (!canvas) return json({ error: 'Canvas not found in this workspace' }, 404);
  if (canvas.owner_email !== user.email) return json({ error: 'This canvas is private to its owner' }, 403);
  if (body.state !== undefined) {
    const checked = stateText(body.state);
    if (checked.error) return json({ error: checked.error }, checked.status || 400);
  }
  const row = await ownerRow(env, user, canvas.name, 'main');
  const state = body.state ?? (row ? JSON.parse(row.state_json) : null);
  if (!state) return json({ error: "There is nothing to fork here: this canvas's content isn't in this browser or saved on the server. Open it where it was made and fork it there." }, 409);
  // Your own canvas reads its project at the current commit, or what it inherited as a fork: the fork keeps that.
  const revision = await boardRevision(env.LEARN_DB, { id: row?.id, org: user.org, app: canvas.name, owner_email: user.email });
  return { row, state, org: user.org, canvas: canvas.name, owner: user.email, title: canvas.title, share: null, revision, resource: canvas.name };
}

const forkReply = (name, title, extra = {}) => ({ name, title, url: `/apps/${name}?tab=learn`, ...extra });
// The source canvas's canonical direct-fork count after this action (the shared header's Fork button shows it); null
// when the source is not a canvas. Read from the rows, so a replay reports the same count and a failure reports none.
const sourceForkCount = async (db, org, canvas) => (canvas ? (await db.prepare(`SELECT ${FORK_COUNT} AS n FROM canvases c WHERE org = ? AND name = ?`).bind(org, canvas).first())?.n ?? null : null);

async function fork(req, env, body) {
  const user = await repositoryIdentity(req, env);
  if (user instanceof Response) return user.status === 401 ? json({ error: 'Sign in to fork this board.', signIn: true }, 401) : user;
  if (body?.key !== undefined && !(typeof body.key === 'string' && FORK_KEY.test(body.key))) return json({ error: 'Bad fork key' }, 400);
  // An old client sends no key: its fork is never a replay.
  const key = body?.key ?? crypto.randomUUID();
  const db = env.LEARN_DB;
  // The same action again (double click, a retried request): the fork it already made.
  const replay = async () => {
    const made = await db.prepare('SELECT c.name, c.title, f.forked_from_org, f.forked_from_canvas_id FROM canvas_forks f JOIN canvases c ON c.org = f.org AND c.name = f.canvas WHERE f.owner_email = ? AND f.fork_key = ?').bind(user.email, key).first();
    return made && json(forkReply(made.name, made.title, { replayed: true, source_fork_count: await sourceForkCount(db, made.forked_from_org, made.forked_from_canvas_id) }));
  };
  const earlier = await replay();
  if (earlier) return earlier;
  const source = await forkSource(req, env, user, body);
  if (source instanceof Response) return source;
  const title = String(source.title).slice(0, 120);
  // Lineage: the parent is the source canvas; the root is the parent's root, or the parent itself.
  const up = source.canvas && await db.prepare('SELECT root_org, root_canvas_id FROM canvas_forks WHERE org = ? AND canvas = ?').bind(source.org, source.canvas).first();
  const root = up?.root_canvas_id ? [up.root_org, up.root_canvas_id] : source.canvas ? [source.org, source.canvas] : [null, null];
  const name = `canvas-${crypto.randomUUID().slice(0, 8)}`;
  const renamed = new Map();
  const state = forkState(source.state);
  state.blocks = (state.blocks || []).map(block => {
    if (block.type !== 'notebook' || !block.notebook_id) return block;
    const fresh = crypto.randomUUID();
    renamed.set(`notebook:${block.notebook_id}`, `notebook:${fresh}`);
    return { ...block, notebook_id: fresh };
  });
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const forkedFrom = { resource_id: source.resource, board: source.row?.board || 'main', board_id: source.row?.id || null, title, creator: null, share_url: source.share ? `/b/${source.share}` : null };
  // One batch: a fork is its canvas, board and link together, or nothing. The UNIQUE key refuses a
  // concurrent duplicate of the same action, which then answers with the fork that won.
  try {
    await db.batch([
      db.prepare('INSERT INTO canvases(org,name,owner_email,title,project,device_id) VALUES(?,?,?,?,NULL,NULL)').bind(user.org, name, user.email, title),
      db.prepare('INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, version, updated_by, updated_at, title, forked_from) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)')
        .bind(id, user.org, user.email, name, 'main', JSON.stringify(state), user.email, now, title, JSON.stringify(forkedFrom)),
      db.prepare('INSERT INTO canvas_forks (org, canvas, owner_email, fork_key, forked_from_org, forked_from_canvas_id, root_org, root_canvas_id, forked_from_owner_id, forked_from_title, forked_from_share, forked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(user.org, name, user.email, key, source.canvas ? source.org : null, source.canvas, root[0], root[1], source.owner, title, source.share, now),
      // The repository revision the source was read at; the fork's share answers from it (docs/features/shared-canvas-ask.md).
      ...(source.revision ? [db.prepare('INSERT INTO board_repository_pins (board_id, repository_id, commit_sha, share_key, repo_access, pinned_at) VALUES (?, ?, ?, NULL, 0, ?)').bind(id, source.revision.id, source.revision.commit, now)] : []),
    ]);
  } catch (error) {
    const won = await replay();
    if (won) return won;
    return json({ error: `The fork could not be made: ${error.message}` }, 500);
  }
  let files = 0;
  // ponytail: files copy after the rows commit, so a worker dying mid-copy leaves the fork with fewer files and a
  // replay does not re-copy. Copy before the batch (orphan R2 objects on a lost race) if that is ever seen.
  if (learnMedia(env) && source.row) {
    let cursor;
    do {
      const page = await learnMedia(env).list({ prefix: `learn-boards/${source.row.id}/`, cursor, include: ['customMetadata'] });
      for (const object of page.objects) {
        const key = object.customMetadata?.key;
        if (!key) continue;
        const body = await learnMedia(env).get(object.key);
        if (!body) continue;
        const target = renamed.get(key) || key;
        await learnMedia(env).put(await assetObject({ id }, target), await new Response(body.body).arrayBuffer(), { httpMetadata: body.httpMetadata, customMetadata: { ...body.customMetadata, key: target } });
        files += 1;
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  return json(forkReply(name, title, { files, forked_from: forkedFrom, source_fork_count: await sourceForkCount(db, source.org, source.canvas) }), 201);
}

// Start Rabbit Hole (docs/features/shared-canvas-rabbit-hole.md): a viewer's own private Rabbit Hole from a
// shared canvas, never a fork and never a write to the shared board. It is the /dive model (dives.js): a canvas
// of the viewer's, a canvas_dives link whose parent is the share link (parent_app `share:<share key>`, so the
// raw token never names a level), and the Dive record, which carries the origin card's identities and a
// `source` shaped like a fork's forked_from (plus the board version and the pinned commit the viewer may see).
// The hole starts with one small anchor card saying where it began; nothing of the shared board is copied.
// One hole per viewer, share and origin (the canvas_dives UNIQUE key): starting again enters it.
export const SHARED_ROOT = ':root';
const ORIGIN_ID = 200, ORIGIN_TEXT = 200, ORIGIN_CONCEPTS = 32;
const plain = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// A card's name, whatever kind it is: a lesson block's own title or question, or a chat card's question.
export const cardName = entry => plain(entry?.title || entry?.question || entry?.prompt || entry?.label || entry?.text || entry?.body, 80) || 'a card';
const optionalId = value => (value == null ? null : typeof value === 'string' && value.length <= ORIGIN_ID ? value : undefined);
// The origin's identities as the browser resolved them (learn-target.js resolveTarget); the block id is checked
// against the shared board itself. Undefined marks a malformed field.
function originOf(origin, state) {
  if (origin == null) return { root: true };
  if (typeof origin !== 'object' || Array.isArray(origin)) return { error: 'origin must be an object or null' };
  const id = origin.block_id;
  if (typeof id !== 'string' || !id || id.length > ORIGIN_ID || id === SHARED_ROOT) return { error: 'origin.block_id must name a card' };
  const entry = [...(state.blocks || []), ...(state.exchanges || [])].find(item => item?.id === id);
  if (!entry) return { error: 'That card is not on this shared canvas.', status: 404 };
  const fields = { scene_id: optionalId(origin.scene_id), card_id: optionalId(origin.card_id), part_id: optionalId(origin.part_id), selected_object: optionalId(origin.selected_object) };
  if (Object.values(fields).includes(undefined)) return { error: 'origin ids must be strings of at most 200 characters' };
  const concepts = origin.concept_ids ?? [];
  if (!Array.isArray(concepts) || concepts.length > ORIGIN_CONCEPTS || concepts.some(concept => typeof concept !== 'string' || concept.length > ORIGIN_ID)) return { error: 'origin.concept_ids must be at most 32 short strings' };
  const depth = origin.depth == null ? null : plain(origin.depth, ORIGIN_TEXT);
  // The card's name as the viewer's canvas showed it (describeBlock); only ever the viewer's own hole title.
  const title = typeof origin.title === 'string' ? plain(origin.title, 120) : '';
  return { id, entry, ...fields, concept_ids: concepts, depth, title };
}

async function startRabbitHole(req, env, token, body) {
  const found = await sharedAccess(req, env, token);
  if (found instanceof Response) return found;
  const user = found.viewer || await repositoryIdentity(req, env);
  if (user instanceof Response) return user.status === 401 ? json({ error: 'Sign in to start your own Rabbit Hole from this canvas.', signIn: true }, 401) : user;
  const { row } = found, db = env.LEARN_DB;
  const origin = originOf(body?.origin, JSON.parse(row.state_json));
  if (origin.error) return json({ error: origin.error }, origin.status || 400);
  const parent = { app: `share:${await shareKey(token)}`, board: row.board };
  const originId = origin.root ? SHARED_ROOT : origin.id;
  const existing = () => db.prepare('SELECT d.child, c.title FROM canvas_dives d JOIN canvases c ON c.org = d.org AND c.name = d.child WHERE d.org = ? AND d.owner_email = ? AND d.parent_app = ? AND d.parent_board = ? AND d.origin_block_id = ?')
    .bind(user.org, user.email, parent.app, parent.board, originId).first();
  const reply = (hole, status, extra = {}) => json({ name: hole.child, title: hole.title, url: `/apps/${hole.child}`, ...extra }, status);
  const earlier = await existing();
  if (earlier) return reply(earlier, 200, { existing: true });
  // What the hole came from: the fork's provenance fields, so "which shared canvas, card and version?" has one shape.
  const canvas = CANVAS.test(row.app) ? await db.prepare('SELECT title FROM canvases WHERE org = ? AND name = ?').bind(row.org, row.app).first() : null;
  const pinned = await shareSource(db, row);
  const sharedName = sharedTitle(row, canvas?.title, pinned);
  const source = {
    resource_id: canvas ? row.app : (row.app.startsWith('repo-') && !pinned?.allowed ? null : row.app), board: row.board, board_id: row.id,
    title: sharedName, creator: null, share_url: `/b/${token}`, share_key: parent.app.slice('share:'.length),
    version: row.version, updated_at: row.updated_at, commit: pinned?.allowed ? pinned.commit : null,
  };
  const from = origin.root ? null : origin.title || cardName(origin.entry);
  const title = plain(origin.root ? `Exploring from ${sharedName}` : from, 120);
  const name = `canvas-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const record = {
    dive_id: name, concept: title, title, created_by: 'shared_start',
    origin: { parent, origin_block_id: originId, origin_scene_id: origin.scene_id ?? null, origin_card_id: origin.card_id ?? null, origin_part_id: origin.part_id ?? null,
      origin_concept_ids: origin.concept_ids ?? [], selected_object: origin.selected_object ?? null, depth: origin.depth ?? null, level: 1 },
    return_point: { block_id: origin.root ? null : originId, part_id: origin.part_id ?? null, selected_object: origin.selected_object ?? null, inputs: null, input_revision: null, practice_open: false, pending_question: null, viewport: null },
    source,
  };
  // The hole's first object: where it began, in words. Never a copy of the card.
  const anchor = { id: crypto.randomUUID(), type: 'explanation', dx: 0, dy: 0, title,
    body: origin.root ? `Started from the shared canvas "${sharedName}".` : `Started from "${from}" on the shared canvas "${sharedName}".`, anchor: { source: 'shared' } };
  const now = new Date().toISOString();
  try {
    await db.batch([
      db.prepare('INSERT INTO canvases(org,name,owner_email,title,project,device_id) VALUES(?,?,?,?,NULL,NULL)').bind(user.org, name, user.email, title),
      db.prepare('INSERT INTO canvas_dives(org,owner_email,child,parent_app,parent_board,origin_block_id,dive_json) VALUES(?,?,?,?,?,?,?)').bind(user.org, user.email, name, parent.app, parent.board, originId, JSON.stringify(record)),
      db.prepare('INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, version, updated_by, updated_at, title) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)')
        .bind(crypto.randomUUID(), user.org, user.email, name, 'main', JSON.stringify({ blocks: [anchor] }), user.email, now, title),
    ]);
  } catch (error) {
    // A concurrent start from the same origin won the UNIQUE key: enter that one.
    const won = await existing();
    if (won) return reply(won, 200, { existing: true });
    return json({ error: `The Rabbit Hole could not be started: ${error.message}` }, 500);
  }
  return reply({ child: name, title }, 201, { source });
}

// The owner of a board: someone with access to its app - or, for a canvas
// (smart-home catalog), the canvas's owner, checked against LEARN_DB.
async function boardOwner(req, env, app) {
  if (!CANVAS.test(app)) {
    const access = await authorizedBoardApp(req, env, app);
    return access instanceof Response ? access : { org: access.org, email: access.email };
  }
  const user = await repositoryIdentity(req, env);
  if (user instanceof Response) return user;
  const row = await env.LEARN_DB.prepare('SELECT owner_email FROM canvases WHERE org = ? AND name = ?').bind(user.org, app).first();
  if (!row) return json({ error: 'Canvas not found in this workspace' }, 404);
  if (row.owner_email !== user.email) return json({ error: 'This canvas is private to its owner' }, 403);
  return { org: user.org, email: user.email };
}

async function openShared(req, env, token) {
  const found = await sharedAccess(req, env, token);
  if (found instanceof Response) return found;
  const { row, role } = found;
  // A canvas's link shows the canvas's own title and its direct fork count (docs/features/canvas-forking.md); a link
  // to a board that is not a canvas (a project's) has no canvas to count, so its count is null, never a stale 0.
  const canvas = CANVAS.test(row.app) ? await env.LEARN_DB.prepare(`SELECT title, ${FORK_COUNT} AS fork_count FROM canvases c WHERE org = ? AND name = ?`).bind(row.org, row.app).first() : null;
  // The composer (docs/features/shared-canvas-ask.md): who is viewing (their own email, or null signed out),
  // and the context pills - the repository at the share's pinned commit, and the sources on the board. A private
  // repository the owner did not open up for this link shows nothing of itself: no name, commit or pill, and a
  // project board's app name (which names it) is withheld too.
  const viewer = found.viewer || await repositoryIdentity(req, env);
  const source = await shareSource(env.LEARN_DB, row);
  const hidden = row.app.startsWith('repo-') && !source?.allowed;
  const state = JSON.parse(row.state_json);
  // Who made it (docs/features/user-handles.md): the owner's @handle and display name, read by reference; no handle,
  // no creator. Never the owner's email: a link may be opened by anyone it reaches.
  const made = await env.LEARN_DB.prepare(`SELECT handle, ${NAME_OF('email')} AS name FROM user_handles WHERE email = ?`).bind(row.owner_email).first();
  const creator = made ? { handle: made.handle, name: made.name ?? null } : null;
  return json({ role, app: hidden ? null : row.app, board: row.board, title: sharedTitle(row, canvas?.title, source), creator, fork_count: canvas ? canvas.fork_count : null, version: row.version, updated_at: row.updated_at,
    viewer: viewer instanceof Response ? null : viewer.email, context: { repository: source?.allowed ? { repo: source.repo, commit: source.commit } : null, sources: boardSources(state) }, state });
}

export async function learnBoardsRoute(path, req, env) {
  if (!env.LEARN_DB) return json({ error: 'Board sharing needs the Learn database on this worker.' }, 503);
  const sharedFile = path.match(/^\/api\/learn\/boards\/shared\/([^/]+)\/assets\/([^/]+)$/);
  if (sharedFile) {
    const found = await sharedAccess(req, env, decodeURIComponent(sharedFile[1]));
    if (found instanceof Response) return found;
    const key = decodeURIComponent(sharedFile[2]);
    if (req.method === 'GET') return getAsset(env, found.row, key);
    if (req.method === 'PUT') return json({ error: 'Shared links are view-only. Fork the board to edit your own copy.' }, 403);
    return json({ error: 'Method not allowed' }, 405);
  }
  // One fork call for every surface (Library card, canvas top bar, shared board): { source, key, state? }.
  if (path === '/api/learn/boards/fork') return req.method === 'POST' ? fork(req, env, await readBody(req)) : json({ error: 'Method not allowed' }, 405);
  // The shared board's own path, kept for pages loaded before the one call.
  const forking = path.match(/^\/api\/learn\/boards\/shared\/([^/]+)\/fork$/);
  if (forking) return req.method === 'POST' ? fork(req, env, { ...(await readBody(req)), source: { token: decodeURIComponent(forking[1]) } }) : json({ error: 'Method not allowed' }, 405);
  // Start Rabbit Hole: the viewer's own private hole from this shared canvas (not a fork).
  const holing = path.match(/^\/api\/learn\/boards\/shared\/([^/]+)\/rabbit-hole$/);
  if (holing) return req.method === 'POST' ? startRabbitHole(req, env, decodeURIComponent(holing[1]), await readBody(req)) : json({ error: 'Method not allowed' }, 405);
  const asking = path.match(/^\/api\/learn\/boards\/shared\/([^/]+)\/ask$/);
  if (asking) return req.method === 'POST' ? askAboutShared(req, env, decodeURIComponent(asking[1])) : json({ error: 'Method not allowed' }, 405);
  const shared = path.match(/^\/api\/learn\/boards\/shared\/([^/]+)$/);
  if (shared) {
    const token = decodeURIComponent(shared[1]);
    if (req.method === 'GET') return openShared(req, env, token);
    if (req.method === 'PUT') return json({ error: 'Shared links are view-only. Fork the board to edit your own copy.' }, 403);
    return json({ error: 'Method not allowed' }, 405);
  }
  const own = path.match(/^\/api\/learn\/boards\/([a-z0-9-]{1,100})\/([^/]+)(\/share(?:\/repository)?|\/assets(?:\/([^/]+))?)?$/);
  if (!own) return null;
  const [, app, rawBoard, suffix, rawKey] = own;
  const shareRoute = suffix === '/share';
  const board = decodeURIComponent(rawBoard);
  if (!BOARD.test(board)) return json({ error: 'Board name must be 1-100 letters, digits, spaces, dots, dashes or underscores' }, 400);
  const owner = await boardOwner(req, env, app);
  if (owner instanceof Response) return owner;
  if (shareRoute) return req.method === 'POST' ? share(env, owner, app, board, await readBody(req)) : json({ error: 'Method not allowed' }, 405);
  if (suffix === '/share/repository') return req.method === 'POST' ? shareRepository(env, owner, app, board, await readBody(req)) : json({ error: 'Method not allowed' }, 405);
  if (suffix?.startsWith('/assets')) {
    const row = await ownerRow(env, owner, app, board);
    if (!row) return json({ error: 'Save or share this board first.' }, 404);
    if (!rawKey) return req.method === 'GET' ? listAssets(env, row) : json({ error: 'Method not allowed' }, 405);
    const key = decodeURIComponent(rawKey);
    if (req.method === 'GET') return getAsset(env, row, key);
    if (req.method === 'PUT') return putAsset(req, env, row, key);
    return json({ error: 'Method not allowed' }, 405);
  }
  if (req.method === 'GET') {
    const row = await ownerRow(env, owner, app, board);
    return row ? json({ version: row.version, updated_by: row.updated_by, updated_at: row.updated_at, title: row.title || null, forked_from: row.forked_from ? JSON.parse(row.forked_from) : null, sharing: await ownerSharing(env, row), state: JSON.parse(row.state_json) }) : json({ exists: false, sharing: sharingOf(null) });
  }
  if (req.method === 'PUT') return saveOwn(env, owner, app, board, await readBody(req));
  return json({ error: 'Method not allowed' }, 405);
}
