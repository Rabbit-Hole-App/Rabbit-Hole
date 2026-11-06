// packages/control-plane/src/card-feedback-routes.js
// Card feedback (Explain-on-Canvas roadmap R1): a learner's private up/down self-report on a generated card of their own canvas.
//
//   GET /api/learn/card-feedback?app=&board=            -> { items: [{ cardId, value: 'up'|'down', title }] }
//        Only cards on the saved board now (a deleted card is not listed, so nothing links to it). No model call.
//   PUT /api/learn/card-feedback {app, board, cardId, value: 'up'|'down'|null} -> { cardId, value }
//        null clears. 400 invalid_card, invalid_value, not_rateable (an imported or practice card); 404 unknown_card (not on the
//        saved board yet: the canvas saves and retries once).
//
// Access: the signed-in owner of the canvas, resolved as the attempt routes resolve it (authorizedBoardApp, the account's users.id
// never taken from the body). A link visitor, a member or another account gets the access answer, never a rating. Mounted next to
// the attempt routes in packages/web/dev-worker.js (Lead-owned).
import { authorizedBoardApp } from './learn-board.js';
import { FeedbackError, listCardFeedback, setCardFeedback } from './card-feedback.js';

const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/; // learn-boards.js board names
const BODY_CHARS = 1024;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function cardFeedbackRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/card-feedback') return null;
  if (!['GET', 'PUT'].includes(req.method)) return json({ error: 'GET or PUT required' }, 405);
  let body;
  if (req.method === 'GET') {
    const query = new URL(req.url).searchParams;
    body = { app: query.get('app'), board: query.get('board') };
  } else {
    if (Number(req.headers.get('content-length')) > 4 * BODY_CHARS) return json({ error: 'too_large' }, 413);
    const raw = await req.text();
    if (raw.length > BODY_CHARS) return json({ error: 'too_large' }, 413);
    try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON' }, 400);
  }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body.app, null);
  if (access instanceof Response) return access;
  if (req.method === 'PUT' && req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  if (typeof body.board !== 'string' || !BOARD.test(body.board)) return json({ error: 'Board name must be 1-100 letters, digits, spaces, dots, dashes or underscores' }, 400);
  if (access.kind !== 'canvas') return json({ error: 'feedback_on_canvases_only' }, 400);
  if (!access.user_id) return json({ error: 'identity_unavailable' }, 401);
  const actor = { org: access.org, userId: access.user_id, app: body.app, board: body.board };
  try {
    if (req.method === 'GET') return json({ items: await listCardFeedback(env, actor, access.email ?? null) });
    return json(await setCardFeedback(env, actor, access.email ?? null, { cardId: body.cardId, value: body.value }));
  } catch (error) {
    if (error instanceof FeedbackError) return json({ error: error.code }, error.status);
    console.error(JSON.stringify({ event: 'card_feedback_error', error: error?.name || 'Error', message: String(error?.message || '').slice(0, 120) }));
    return json({ error: 'feedback_unavailable' }, 503);
  }
}
