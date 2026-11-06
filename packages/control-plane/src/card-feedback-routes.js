// packages/control-plane/src/card-feedback-routes.js
// Card feedback (Explain-on-Canvas roadmap R1): a learner's private up/down self-report on a generated card of their own canvas.
//
//   GET /api/learn/card-feedback?app=&board=            -> { items: [{ cardId, value: 'up'|'down'|null, revision, title }] }
//        Only cards on the saved board now (a deleted card is not listed, so nothing links to it); a cleared rating has value null.
//   PUT /api/learn/card-feedback {app, board, cardId, value: 'up'|'down'|null} -> { cardId, value, revision, updatedAt }
//        null clears. revision counts up on every change, so a late answer is never mistaken for a newer choice.
//        400 unknown_property (anything but those four keys), invalid_card, invalid_value, not_rateable (an imported or failed card).
//        404 not_available: the one answer for a canvas or card that is absent, not saved yet (the canvas saves and retries once) or
//        not the caller's, so it cannot be used to find out what exists.
//
// Access: the signed-in owner of the canvas, resolved as the attempt routes resolve it (authorizedBoardApp, the account's users.id
// never taken from the body). A link visitor, a member or another account gets not_available, never a rating. Answers are private and
// uncached. Not tied to ROADMAP_ENABLED: feedback works whether or not the Tutor roadmap does. Calls no model and no usage or
// billing code. Mounted next to the attempt routes in packages/web/dev-worker.js (Lead-owned).
import { authorizedBoardApp } from './learn-board.js';
import { FeedbackError, listCardFeedback, setCardFeedback } from './card-feedback.js';

const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/; // learn-boards.js board names
const BODY_CHARS = 1024;
const KEYS = ['app', 'board', 'cardId', 'value'];
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function cardFeedbackRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/card-feedback') return null;
  if (!['GET', 'PUT'].includes(req.method)) return json({ error: 'GET or PUT required' }, 405);
  let body;
  if (req.method === 'GET') {
    const query = new URL(req.url).searchParams;
    if ([...query.keys()].some(k => !['app', 'board'].includes(k))) return json({ error: 'unknown_property' }, 400);
    body = { app: query.get('app'), board: query.get('board') };
  } else {
    if (Number(req.headers.get('content-length')) > 4 * BODY_CHARS) return json({ error: 'too_large' }, 413);
    const raw = await req.text();
    if (raw.length > BODY_CHARS) return json({ error: 'too_large' }, 413);
    try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON' }, 400);
    // Ownership, learner and assessment fields are never accepted from the client, so none can be smuggled in.
    if (Object.keys(body).some(k => !KEYS.includes(k))) return json({ error: 'unknown_property' }, 400);
  }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body.app, null);
  // Signed out (401), a malformed app name (400) and a failing service (5xx) answer as they are; every other refusal of the canvas
  // (another account's, absent, private) is the same not_available, so a guessed canvas name tells nothing.
  if (access instanceof Response) return [400, 401].includes(access.status) || access.status >= 500 ? access : json({ error: 'not_available' }, 404);
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
