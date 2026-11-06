// packages/control-plane/src/learn-user-settings.js
// Learn user settings on LEARN_DB (learn-migrations/0037; Tutor ladder R2, decisions D11 and D12):
//   Auto-suggest: one value per learner (learn_user_settings), default on.
//   Depth: overview | standard | deep, one value per learner and canvas (learn_canvas_depth), default standard.
//   GET  /api/learn/user-settings?app=&board= -> { settings: { depth, autoSuggest }, learner }
//   POST /api/learn/user-settings { app, board, depth?, autoSuggest? } -> the same answer (a field left out keeps its value)
// Only the signed-in learner's own rows, resolved as the coaching route resolves them: an app they may open, a canvas, the
// account's users.id (never an email, never from the body). Nothing here calls a model. `learner` is an opaque short hash of
// that identity, so one browser shared by two accounts never applies one learner's change to the other's tab.
// A database without 0037 reads as the defaults and refuses a write (503 settings_unavailable): it never answers an empty
// success for a change that was not kept.
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { sha256Hex } from './learn-grade-jev.js';
import { DEFAULT_DEPTH, validDepth } from './chat-depth.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/; // learn-boards.js board names, as the coaching route
export const DEFAULT_SETTINGS = Object.freeze({ depth: DEFAULT_DEPTH, autoSuggest: true });

// actor: { org, userId, app, board }, server-resolved. -> { depth, autoSuggest }; the defaults for anything not saved.
export async function readSettings(env, actor) {
  const [user, canvas] = await Promise.all([
    env.LEARN_DB.prepare('SELECT auto_suggest FROM learn_user_settings WHERE org = ? AND owner_user_id = ?').bind(actor.org, actor.userId).first(),
    env.LEARN_DB.prepare('SELECT depth FROM learn_canvas_depth WHERE org = ? AND owner_user_id = ? AND app = ? AND board = ?').bind(actor.org, actor.userId, actor.app, actor.board).first(),
  ]);
  return { depth: validDepth(canvas?.depth) ?? DEFAULT_SETTINGS.depth, autoSuggest: user ? user.auto_suggest === 1 : DEFAULT_SETTINGS.autoSuggest };
}

// The Depth a model call should honor: the stored one, or Standard when there is none, no identity or the tables are not there
// yet. Never throws: Depth is a preference, and a failed read must not stop an answer.
export async function readDepth(env, actor) {
  if (!env?.LEARN_DB || !actor?.org || !actor?.userId) return DEFAULT_DEPTH;
  try {
    const row = await env.LEARN_DB.prepare('SELECT depth FROM learn_canvas_depth WHERE org = ? AND owner_user_id = ? AND app = ? AND board = ?').bind(actor.org, actor.userId, actor.app, actor.board).first();
    return validDepth(row?.depth) ?? DEFAULT_DEPTH;
  } catch { return DEFAULT_DEPTH; }
}

// Whether this learner allows unasked suggestions (R4 invitations, R6 proposals read this). On when there is no row, no identity or
// the table is not there yet: the default is today's behavior. Never throws.
export async function readAutoSuggest(env, actor) {
  if (!env?.LEARN_DB || !actor?.org || !actor?.userId) return DEFAULT_SETTINGS.autoSuggest;
  try {
    const row = await env.LEARN_DB.prepare('SELECT auto_suggest FROM learn_user_settings WHERE org = ? AND owner_user_id = ?').bind(actor.org, actor.userId).first();
    return row ? row.auto_suggest === 1 : DEFAULT_SETTINGS.autoSuggest;
  } catch { return DEFAULT_SETTINGS.autoSuggest; }
}

// patch: { depth?, autoSuggest? }, already validated. One statement per field.
export async function saveSettings(env, actor, patch) {
  const now = new Date().toISOString(), statements = [];
  if (patch.autoSuggest !== undefined) statements.push(env.LEARN_DB.prepare('INSERT INTO learn_user_settings (org, owner_user_id, auto_suggest, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (org, owner_user_id) DO UPDATE SET auto_suggest = excluded.auto_suggest, updated_at = excluded.updated_at').bind(actor.org, actor.userId, patch.autoSuggest ? 1 : 0, now));
  if (patch.depth !== undefined) statements.push(env.LEARN_DB.prepare('INSERT INTO learn_canvas_depth (org, owner_user_id, app, board, depth, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (org, owner_user_id, app, board) DO UPDATE SET depth = excluded.depth, updated_at = excluded.updated_at').bind(actor.org, actor.userId, actor.app, actor.board, patch.depth, now));
  if (statements.length) await env.LEARN_DB.batch(statements);
}

const learnerKey = async actor => (await sha256Hex(`learn-settings|${actor.org}|${actor.userId}`)).slice(0, 16);

export async function userSettingsRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/user-settings') return null;
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'GET or POST required' }, 405);
  let body;
  if (req.method === 'GET') {
    const query = new URL(req.url).searchParams;
    body = { app: query.get('app'), board: query.get('board') };
  } else {
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON' }, 400);
  }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body.app, null);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  if (typeof body.board !== 'string' || !BOARD.test(body.board)) return json({ error: 'Board name must be 1-100 letters, digits, spaces, dots, dashes or underscores' }, 400);
  if (access.kind !== 'canvas') return json({ error: 'settings_on_canvases_only' }, 400);
  if (!access.user_id) return json({ error: 'identity_unavailable' }, 401);
  const actor = { org: access.org, userId: access.user_id, app: body.app, board: body.board };
  const patch = {};
  if (req.method === 'POST') {
    if (body.depth !== undefined) { if (!validDepth(body.depth)) return json({ error: 'depth must be overview, standard or deep' }, 400); patch.depth = body.depth; }
    if (body.autoSuggest !== undefined) { if (typeof body.autoSuggest !== 'boolean') return json({ error: 'autoSuggest must be true or false' }, 400); patch.autoSuggest = body.autoSuggest; }
    if (!Object.keys(patch).length) return json({ error: 'Send depth or autoSuggest' }, 400);
  }
  try {
    if (req.method === 'POST') await saveSettings(env, actor, patch);
    return json({ settings: await readSettings(env, actor), learner: await learnerKey(actor) });
  } catch (error) {
    // ids only, never the account id or a value
    console.error(JSON.stringify({ event: 'learn_user_settings_error', app: actor.app, error: error?.name || 'Error', message: String(error?.message || '').slice(0, 120) }));
    // A read of a database without 0037 is the defaults; a write is refused so the learner is told it was not kept.
    if (req.method === 'GET') return json({ settings: { ...DEFAULT_SETTINGS }, learner: await learnerKey(actor), unsaved: true });
    return json({ error: 'settings_unavailable' }, 503);
  }
}
