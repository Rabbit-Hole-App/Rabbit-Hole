// packages/control-plane/src/learn-user-settings.js
// Learn user settings on LEARN_DB (learn-migrations/0037; Tutor ladder R2, decisions D11 and D12):
//   Auto-suggest: one value per learner (learn_user_settings), default on. One boolean, idempotent: the last write wins.
//   Depth: overview | standard | deep, one value per learner and canvas (learn_canvas_depth), default standard. Guarded writes.
//   GET  /api/learn/user-settings?app=&board= -> { settings: { depth, autoSuggest }, depthRevision, learner }
//   POST /api/learn/user-settings { app, board, autoSuggest } -> the same answer
//   POST /api/learn/user-settings { app, board, depth, expectedRevision, actionId? } -> the same answer (set_depth)
// Exactly one setting per POST. A Depth write names the revision it was made from (0: no row yet). It is applied only at that
// revision, and then the row's revision is one more and last_action_id is its actionId. At any other revision it writes nothing:
// the same actionId again is a replay (200, replayed: true, the current state, nothing written); anything else is 409
// stale_depth with the current settings and revision, so the caller adopts them. Auto-suggest never copies a canvas's own
// learn_coaching_state.tutor_enabled: a learner with no row has the default (on), whatever any canvas holds.
// Only the signed-in learner's own rows, resolved as the coaching route resolves them: an app they may open, a canvas, the
// account's users.id (never an email, never from the body). Nothing here calls a model. `learner` is an opaque short hash of
// that identity, so one browser shared by two accounts never applies one learner's change to the other's tab.
// A database without 0037 reads as the defaults and refuses a write (503 settings_unavailable): it never answers an empty
// success for a change that was not kept.
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { sha256Hex } from './learn-grade-jev.js';
import { DEFAULT_DEPTH, validDepth } from './chat-depth.js';
import { autoSuggestFactStatements, roadmapAutoEnabled, runLearnerEvents } from './roadmap/roadmap-settings-events.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/; // learn-boards.js board names, as the coaching route
const ACTION = /^[A-Za-z0-9_-]{8,64}$/;
export const DEFAULT_SETTINGS = Object.freeze({ depth: DEFAULT_DEPTH, autoSuggest: true });
const DEPTH_ROW = 'org = ? AND owner_user_id = ? AND app = ? AND board = ?';
const depthKey = a => [a.org, a.userId, a.app, a.board];

// actor: { org, userId, app, board }, server-resolved. -> { depth, autoSuggest, depthRevision }; the defaults (revision 0) for anything not saved.
export async function readSettings(env, actor) {
  const [user, canvas] = await Promise.all([
    env.LEARN_DB.prepare('SELECT auto_suggest FROM learn_user_settings WHERE org = ? AND owner_user_id = ?').bind(actor.org, actor.userId).first(),
    env.LEARN_DB.prepare(`SELECT depth, revision FROM learn_canvas_depth WHERE ${DEPTH_ROW}`).bind(...depthKey(actor)).first(),
  ]);
  return { depth: validDepth(canvas?.depth) ?? DEFAULT_SETTINGS.depth, autoSuggest: user ? user.auto_suggest === 1 : DEFAULT_SETTINGS.autoSuggest, depthRevision: canvas?.revision ?? 0 };
}

// The Depth a model call should honor: the stored one, or Standard when there is none, no identity, no canvas or board, or the tables
// are not there yet (no 'main' fallback: an unnamed board is Standard). Never throws: Depth is a preference, and a failed read must
// not stop an answer.
export async function readDepth(env, actor) {
  if (!env?.LEARN_DB || !actor?.org || !actor?.userId || !actor?.app || !actor?.board) return DEFAULT_DEPTH;
  try {
    const row = await env.LEARN_DB.prepare(`SELECT depth FROM learn_canvas_depth WHERE ${DEPTH_ROW}`).bind(...depthKey(actor)).first();
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

// Auto-suggest: a boolean, already validated.
export async function saveAutoSuggest(env, actor, autoSuggest) {
  const save = env.LEARN_DB.prepare('INSERT INTO learn_user_settings (org, owner_user_id, auto_suggest, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (org, owner_user_id) DO UPDATE SET auto_suggest = excluded.auto_suggest, updated_at = excluded.updated_at')
    .bind(actor.org, actor.userId, autoSuggest ? 1 : 0, new Date().toISOString());
  // R6: with both roadmap flags on, a CHANGE also commits its revisioned fact and learner-scoped event in this same batch (0040). Flag off, or a database
  // that genuinely lacks 0040's table (the batch is atomic, so nothing was kept): the plain write above. Any other batch failure is NOT retried as a plain
  // write (that would save the preference without its event): it propagates and the route answers 503 settings_unavailable.
  if (!roadmapAutoEnabled(env)) { await save.run(); return; }
  try { await env.LEARN_DB.batch([save, ...autoSuggestFactStatements(env.LEARN_DB, actor, autoSuggest)]); } catch (error) {
    if (!/no such table:?\s*learn_roadmap_settings_facts/i.test(String(error?.message))) throw error;
    await save.run(); return;
  }
  await runLearnerEvents(env, actor); // fan the event out to the learner's unfinished roadmaps now; the scheduled scan recovers a failure
}

// set_depth: { depth, expectedRevision, actionId? }, already validated. One conditional statement, so a stale write changes nothing.
// -> 'applied' | 'replayed' | 'stale'
export async function setDepth(env, actor, { depth, expectedRevision, actionId = null }) {
  const now = new Date().toISOString();
  const written = expectedRevision === 0
    ? await env.LEARN_DB.prepare('INSERT INTO learn_canvas_depth (org, owner_user_id, app, board, depth, revision, last_action_id, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING')
      .bind(...depthKey(actor), depth, actionId, now).run()
    : await env.LEARN_DB.prepare(`UPDATE learn_canvas_depth SET depth = ?, revision = revision + 1, last_action_id = ?, updated_at = ? WHERE ${DEPTH_ROW} AND revision = ?`)
      .bind(depth, actionId, now, ...depthKey(actor), expectedRevision).run();
  if (written.meta?.changes > 0) return 'applied';
  const row = await env.LEARN_DB.prepare(`SELECT last_action_id FROM learn_canvas_depth WHERE ${DEPTH_ROW}`).bind(...depthKey(actor)).first();
  return actionId && row?.last_action_id === actionId ? 'replayed' : 'stale';
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
  let write = null;
  if (req.method === 'POST') {
    if ((body.depth === undefined) === (body.autoSuggest === undefined)) return json({ error: 'Send depth or autoSuggest, one per request' }, 400);
    if (body.autoSuggest !== undefined) {
      if (typeof body.autoSuggest !== 'boolean') return json({ error: 'autoSuggest must be true or false' }, 400);
      write = () => saveAutoSuggest(env, actor, body.autoSuggest);
    } else {
      if (!validDepth(body.depth)) return json({ error: 'depth must be overview, standard or deep' }, 400);
      if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) return json({ error: 'expectedRevision must be the revision this change was made from (0 when none was saved)' }, 400);
      if (body.actionId !== undefined && !ACTION.test(body.actionId)) return json({ error: 'actionId must be 8-64 letters, digits, dashes or underscores' }, 400);
      write = () => setDepth(env, actor, { depth: body.depth, expectedRevision: body.expectedRevision, actionId: body.actionId ?? null });
    }
  }
  try {
    const outcome = write ? await write() : 'applied';
    const { depthRevision, ...settings } = await readSettings(env, actor);
    const answer = { settings, depthRevision, learner: await learnerKey(actor) };
    if (outcome === 'stale') return json({ error: 'stale_depth', ...answer }, 409);
    return json(outcome === 'replayed' ? { ...answer, replayed: true } : answer);
  } catch (error) {
    // ids only, never the account id or a value
    console.error(JSON.stringify({ event: 'learn_user_settings_error', app: actor.app, error: error?.name || 'Error', message: String(error?.message || '').slice(0, 120) }));
    // A read of a database without 0037 is the defaults; a write is refused so the learner is told it was not kept.
    if (req.method === 'GET') return json({ settings: { ...DEFAULT_SETTINGS }, depthRevision: 0, learner: await learnerKey(actor), unsaved: true });
    return json({ error: 'settings_unavailable' }, 503);
  }
}
