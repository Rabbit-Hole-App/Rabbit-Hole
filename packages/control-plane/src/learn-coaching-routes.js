// packages/control-plane/src/learn-coaching-routes.js
// Personal Tutor state (C:/s/spec/tutor-workflow/draft.md Task 02):
//   GET  /api/learn/coaching?app=&board=  -> { state }
//   POST /api/learn/coaching { app, board, actionId, expectedRevision, action, payload } -> { state, effects, replayed? }
//        400 invalid payload, 404 unknown goal/activity, 409 { error, state } (revision, undo_stale, goal_closed, ...)
// Only the signed-in learner's own state, exactly as the journey route resolves it: an app they may open, a canvas, the
// account's users.id (never an email, never from the body). No model call is reachable from here. A database failure is
// 503 coaching_unavailable, never an empty state.
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { CoachingConflict, applyCoachingAction, readCoachingState } from './learn-coaching-store.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/; // learn-boards.js board names; ':' is refused, so parked/staged names are unreachable

export async function coachingRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/coaching') return null;
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
  if (access.kind !== 'canvas') return json({ error: 'coaching_on_canvases_only' }, 400);
  if (!access.user_id) return json({ error: 'identity_unavailable' }, 401);
  const actor = { org: access.org, userId: access.user_id, app: body.app, board: body.board };
  try {
    if (req.method === 'GET') return json({ state: await readCoachingState(env, actor) });
    const { actionId, expectedRevision, action, payload } = body;
    return json(await applyCoachingAction(env, actor, { actionId, expectedRevision, action, payload }));
  } catch (error) {
    if (error instanceof CoachingConflict) {
      if (error.status !== 409) return json({ error: error.code }, error.status);
      return json({ error: error.code, state: await readCoachingState(env, actor).catch(() => null) }, 409);
    }
    // ids only, never learner text or the account id
    console.error(JSON.stringify({ event: 'learn_coaching_error', app: actor.app, error: error?.name || 'Error', message: String(error?.message || '').slice(0, 120) }));
    return json({ error: 'coaching_unavailable' }, 503);
  }
}
