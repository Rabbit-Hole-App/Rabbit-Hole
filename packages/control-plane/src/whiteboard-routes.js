// /whiteboard routes (roadmap v1 W1.2): owner-only, same origin, one WhiteboardJobs object per canvas. GET /api/learn/whiteboard/jobs answers
// { available } for the menu switch (as image-jobs.js); everything else answers 404 as if absent unless WHITEBOARD_ENABLED is 'true'.
//   POST /api/learn/whiteboard/jobs                     { boardId, requestId, cardId, prompt, context?, durationSeconds?, threadId? }
//   GET  /api/learn/whiteboard/jobs/<id>?board=
//   POST /api/learn/whiteboard/jobs/<id>/approve        { boardId, proposal }
//   POST /api/learn/whiteboard/jobs/<id>/refine         { boardId, message, proposal? }
//   GET  /api/learn/whiteboard/results/<artifactId>?board=
// ponytail: the asset route (video bytes, ranges, download) is W1.3.
import { repositoryIdentity } from './repositories.js';
import { whiteboardEnabled, whiteboardKilled } from './whiteboard-job.js';

export const WHITEBOARD_PREFIX = '/api/learn/whiteboard';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const notFound = () => json({ error: 'Not found' }, 404);

export async function whiteboardRoute(path, req, env, deps = {}) {
  if (!path.startsWith(`${WHITEBOARD_PREFIX}/`)) return null;
  const rest = path.slice(WHITEBOARD_PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent);
  const url = new URL(req.url);
  if (req.method === 'GET' && rest.length === 1 && rest[0] === 'jobs') return json({ available: whiteboardEnabled(env) && !whiteboardKilled(env) && !!env.WHITEBOARD_JOBS && !!env.LEARN_DB });
  if (!whiteboardEnabled(env)) return notFound();
  const results = req.method === 'GET' && rest[0] === 'results' && rest.length === 2;
  const action = results ? 'result' : rest[0] !== 'jobs' ? null : req.method === 'POST' ? (rest.length === 1 ? 'create' : rest.length === 3 ? rest[2] : null) : req.method === 'GET' && rest.length === 2 ? 'get' : null;
  if (!['create', 'get', 'approve', 'refine', 'result'].includes(action)) return notFound();
  if (!env.WHITEBOARD_JOBS || !env.LEARN_DB) return json({ error: 'Not available', code: 'not_configured' }, 503);
  if (req.method !== 'GET' && req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  const user = await (deps.identity || repositoryIdentity)(req, env);
  if (user instanceof Response) return user;
  let body = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON' }, 400);
  const boardId = req.method === 'GET' ? url.searchParams.get('board') : body.boardId;
  if (typeof boardId !== 'string' || !boardId) return json({ error: 'board is required' }, 400);
  // The caller's own canvas only (as animation-job.js:370).
  const board = await env.LEARN_DB.prepare('SELECT id, app, board FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(boardId, user.org, user.email).first();
  if (!board) return json({ error: 'Not available' }, 404);
  const { boardId: _board, ...payload } = body;
  const stub = env.WHITEBOARD_JOBS.get(env.WHITEBOARD_JOBS.idFromName(board.id));
  return stub.fetch('https://whiteboard/action', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, id: action === 'create' ? null : rest[1], payload, board, user: { org: user.org, email: user.email, userId: user.userId || user.user_id || null }, origin: url.origin }) });
}
