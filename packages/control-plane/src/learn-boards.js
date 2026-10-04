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
import { FORK_COUNT } from './canvases.js';

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
  return json({ version: row.version, sharing: sharingOf({ shared, view_token: view, edit_token: edit, public_view: publicView }) });
}

async function sharedRow(env, token) {
  if (!TOKEN.test(token)) return null;
  const row = await env.LEARN_DB.prepare('SELECT * FROM learn_boards WHERE shared = 1 AND view_token = ?').bind(token).first();
  return row ? { row, role: 'view' } : null;
}

// Who may open a shared link: anyone for a public view link, otherwise any
// signed-in account. Returns the row and role, or the refusal.
async function sharedAccess(req, env, token) {
  const found = await sharedRow(env, token);
  if (!found) return json({ error: 'This link is not shared any more, or never was.' }, 404);
  if (!(found.role === 'view' && found.row.public_view)) {
    const viewer = await repositoryIdentity(req, env);
    if (viewer instanceof Response) return json({ error: 'Sign in to open this board.', signIn: true }, 401);
  }
  return found;
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
    return { row, state: JSON.parse(row.state_json), org: row.org, canvas: canvas?.name ?? null, owner: row.owner_email, title: canvas?.title || row.title || (row.board === 'main' ? row.app : row.board), share: source.token };
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
  return { row, state, org: user.org, canvas: canvas.name, owner: user.email, title: canvas.title, share: null };
}

const forkReply = (name, title, extra = {}) => ({ name, title, url: `/apps/${name}?tab=learn`, ...extra });

async function fork(req, env, body) {
  const user = await repositoryIdentity(req, env);
  if (user instanceof Response) return user.status === 401 ? json({ error: 'Sign in to fork this board.', signIn: true }, 401) : user;
  if (body?.key !== undefined && !(typeof body.key === 'string' && FORK_KEY.test(body.key))) return json({ error: 'Bad fork key' }, 400);
  // An old client sends no key: its fork is never a replay.
  const key = body?.key ?? crypto.randomUUID();
  const db = env.LEARN_DB;
  // The same action again (double click, a retried request): the fork it already made.
  const replay = async () => {
    const made = await db.prepare('SELECT c.name, c.title FROM canvas_forks f JOIN canvases c ON c.org = f.org AND c.name = f.canvas WHERE f.owner_email = ? AND f.fork_key = ?').bind(user.email, key).first();
    return made && json(forkReply(made.name, made.title, { replayed: true }));
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
  const forkedFrom = { resource_id: source.canvas || source.row?.app || null, board: source.row?.board || 'main', board_id: source.row?.id || null, title, creator: { name: source.owner, source_owner_verified: false }, share_url: source.share ? `/b/${source.share}` : null };
  // One batch: a fork is its canvas, board and link together, or nothing. The UNIQUE key refuses a
  // concurrent duplicate of the same action, which then answers with the fork that won.
  try {
    await db.batch([
      db.prepare('INSERT INTO canvases(org,name,owner_email,title,project,device_id) VALUES(?,?,?,?,NULL,NULL)').bind(user.org, name, user.email, title),
      db.prepare('INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, version, updated_by, updated_at, title, forked_from) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)')
        .bind(id, user.org, user.email, name, 'main', JSON.stringify(state), user.email, now, title, JSON.stringify(forkedFrom)),
      db.prepare('INSERT INTO canvas_forks (org, canvas, owner_email, fork_key, forked_from_org, forked_from_canvas_id, root_org, root_canvas_id, forked_from_owner_id, forked_from_title, forked_from_share, forked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(user.org, name, user.email, key, source.canvas ? source.org : null, source.canvas, root[0], root[1], source.owner, title, source.share, now),
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
  return json(forkReply(name, title, { files, forked_from: forkedFrom }), 201);
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
  // A canvas's link shows the canvas's own title and its direct fork count (docs/features/canvas-forking.md).
  const canvas = CANVAS.test(row.app) ? await env.LEARN_DB.prepare(`SELECT title, ${FORK_COUNT} AS fork_count FROM canvases c WHERE org = ? AND name = ?`).bind(row.org, row.app).first() : null;
  return json({ role, app: row.app, board: row.board, title: canvas?.title || row.title || null, owner: row.owner_email, fork_count: canvas?.fork_count || 0, version: row.version, updated_at: row.updated_at, state: JSON.parse(row.state_json) });
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
  const shared = path.match(/^\/api\/learn\/boards\/shared\/([^/]+)$/);
  if (shared) {
    const token = decodeURIComponent(shared[1]);
    if (req.method === 'GET') return openShared(req, env, token);
    if (req.method === 'PUT') return json({ error: 'Shared links are view-only. Fork the board to edit your own copy.' }, 403);
    return json({ error: 'Method not allowed' }, 405);
  }
  const own = path.match(/^\/api\/learn\/boards\/([a-z0-9-]{1,100})\/([^/]+)(\/share|\/assets(?:\/([^/]+))?)?$/);
  if (!own) return null;
  const [, app, rawBoard, suffix, rawKey] = own;
  const shareRoute = suffix === '/share';
  const board = decodeURIComponent(rawBoard);
  if (!BOARD.test(board)) return json({ error: 'Board name must be 1-100 letters, digits, spaces, dots, dashes or underscores' }, 400);
  const owner = await boardOwner(req, env, app);
  if (owner instanceof Response) return owner;
  if (shareRoute) return req.method === 'POST' ? share(env, owner, app, board, await readBody(req)) : json({ error: 'Method not allowed' }, 405);
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
    return row ? json({ version: row.version, updated_by: row.updated_by, updated_at: row.updated_at, title: row.title || null, forked_from: row.forked_from ? JSON.parse(row.forked_from) : null, sharing: sharingOf(row), state: JSON.parse(row.state_json) }) : json({ exists: false, sharing: sharingOf(null) });
  }
  if (req.method === 'PUT') return saveOwn(env, owner, app, board, await readBody(req));
  return json({ error: 'Method not allowed' }, 405);
}
