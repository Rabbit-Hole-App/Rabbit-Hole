// /api/learn/boards* on the dev worker: Learn canvas boards saved on the
// server and shared by link (docs/features/canvas-sharing.md).
//
// The owner saves a board while it is shared; a share has a view link and an
// edit link, each a random token stored on the board's row, so switching a
// link (or sharing) off revokes it. A view link can be public - readable
// without signing in; editing always needs a signed-in account.
import { authorizedBoardApp } from './learn-board.js';
import { repositoryIdentity } from './repositories.js';
import { sha256Hex } from './learn-grade-jev.js';

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
  if (!env.RUNS) return json({ error: 'Board files need the R2 bucket on this worker.' }, 503);
  if (!ASSET_KEY.test(key)) return json({ error: 'Bad asset key' }, 400);
  if (Number(req.headers.get('content-length') || 0) > MAX_ASSET) return json({ error: 'This file is over 25 MB and stays in your browser.' }, 413);
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > MAX_ASSET) return json({ error: 'This file is over 25 MB and stays in your browser.' }, 413);
  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  await env.RUNS.put(await assetObject(row, key), bytes, {
    httpMetadata: { contentType: SAFE_TYPE.test(type) ? type : 'application/octet-stream' },
    customMetadata: { key, kind: req.headers.get('x-asset-kind') === 'string' ? 'string' : 'blob' },
  });
  return json({ key, size: bytes.byteLength });
}

async function getAsset(env, row, key) {
  if (!env.RUNS || !ASSET_KEY.test(key)) return json({ error: 'No such file on this board' }, 404);
  const object = await env.RUNS.get(await assetObject(row, key));
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
  if (!env.RUNS) return json({ keys: [] });
  const keys = [];
  let cursor;
  do {
    const page = await env.RUNS.list({ prefix: `learn-boards/${row.id}/`, cursor, include: ['customMetadata'] });
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
  const edit = shared && !!body.edit ? (row.edit_token || newToken()) : null;
  const publicView = shared && !!body.view && !!body.public_view ? 1 : 0;
  await env.LEARN_DB.prepare('UPDATE learn_boards SET shared = ?, view_token = ?, edit_token = ?, public_view = ? WHERE id = ?')
    .bind(shared ? 1 : 0, view, edit, publicView, row.id).run();
  return json({ version: row.version, sharing: sharingOf({ shared, view_token: view, edit_token: edit, public_view: publicView }) });
}

async function sharedRow(env, token) {
  if (!TOKEN.test(token)) return null;
  const row = await env.LEARN_DB.prepare('SELECT * FROM learn_boards WHERE shared = 1 AND (view_token = ? OR edit_token = ?)').bind(token, token).first();
  return row ? { row, role: row.edit_token === token ? 'edit' : 'view' } : null;
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

async function openShared(req, env, token) {
  const found = await sharedAccess(req, env, token);
  if (found instanceof Response) return found;
  const { row, role } = found;
  return json({ role, app: row.app, board: row.board, owner: row.owner_email, version: row.version, updated_at: row.updated_at, state: JSON.parse(row.state_json) });
}

async function saveShared(req, env, token) {
  const found = await sharedRow(env, token);
  if (!found || found.role !== 'edit') return json({ error: 'This link cannot edit the board.' }, 403);
  const editor = await repositoryIdentity(req, env);
  if (editor instanceof Response) return json({ error: 'Sign in to edit this board.', signIn: true }, 401);
  const body = await readBody(req);
  const state = stateText(body?.state);
  if (state.error) return json({ error: state.error }, state.status || 400);
  if (body.version !== found.row.version) return json({ error: 'This board changed since you opened it.', version: found.row.version }, 409);
  const done = await env.LEARN_DB.prepare('UPDATE learn_boards SET state_json = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND version = ?')
    .bind(state.text, editor.email, new Date().toISOString(), found.row.id, found.row.version).run();
  if (!done.meta?.changes) return json({ error: 'This board changed since you opened it.' }, 409);
  return json({ version: found.row.version + 1 });
}

export async function learnBoardsRoute(path, req, env) {
  if (!env.LEARN_DB) return json({ error: 'Board sharing needs the Learn database on this worker.' }, 503);
  const sharedFile = path.match(/^\/api\/learn\/boards\/shared\/([^/]+)\/assets\/([^/]+)$/);
  if (sharedFile) {
    const found = await sharedAccess(req, env, decodeURIComponent(sharedFile[1]));
    if (found instanceof Response) return found;
    const key = decodeURIComponent(sharedFile[2]);
    if (req.method === 'GET') return getAsset(env, found.row, key);
    if (req.method === 'PUT') return found.role === 'edit' ? putAsset(req, env, found.row, key) : json({ error: 'This link cannot add files.' }, 403);
    return json({ error: 'Method not allowed' }, 405);
  }
  const shared = path.match(/^\/api\/learn\/boards\/shared\/([^/]+)$/);
  if (shared) {
    const token = decodeURIComponent(shared[1]);
    if (req.method === 'GET') return openShared(req, env, token);
    if (req.method === 'PUT') return saveShared(req, env, token);
    return json({ error: 'Method not allowed' }, 405);
  }
  const own = path.match(/^\/api\/learn\/boards\/([a-z0-9-]{1,100})\/([^/]+)(\/share|\/assets(?:\/([^/]+))?)?$/);
  if (!own) return null;
  const [, app, rawBoard, suffix, rawKey] = own;
  const shareRoute = suffix === '/share';
  const board = decodeURIComponent(rawBoard);
  if (!BOARD.test(board)) return json({ error: 'Board name must be 1-100 letters, digits, spaces, dots, dashes or underscores' }, 400);
  const access = await authorizedBoardApp(req, env, app);
  if (access instanceof Response) return access;
  const owner = { org: access.org, email: access.email };
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
    return row ? json({ version: row.version, updated_by: row.updated_by, updated_at: row.updated_at, sharing: sharingOf(row), state: JSON.parse(row.state_json) }) : json({ sharing: sharingOf(null) }, 404);
  }
  if (req.method === 'PUT') return saveOwn(env, owner, app, board, await readBody(req));
  return json({ error: 'Method not allowed' }, 405);
}
