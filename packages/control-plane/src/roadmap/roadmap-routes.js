// R4 routes (contracts/api.md): /api/learn/roadmap/*. NOT MOUNTED: the Lead mounts roadmapRoute(path, req, env, deps) beside explainRoute in the Learn
// worker (dev-worker.js, exact patch in the hand-back). Behind ROADMAP_ENABLED: unset or not 'true', every roadmap route answers 404 as if absent
// before anything else is read, and the feedback and Depth routes are untouched. Owner-only, same origin, server-built access object.
import { repositoryIdentity } from '../repositories.js';
import { refusalBody } from '../learn-spend-ledger.js';
import { StateError, ERROR_CODES, conflictReply } from './roadmap-contract.js';
import { acceptPlan, acceptRoadmapStep, acknowledgeDelivery, createRoadmap, readEntitledResult, readRoadmap, readResult } from './roadmap-store.js';
import { cancelProposal, endRoadmap, markResultRemoved, omitStep, proposeNextStep, replaceStep, retryStep, setMode } from './roadmap-lifecycle.js';
import { currentView } from './roadmap-view.js';

const PREFIX = '/api/learn/roadmap';
export const roadmapEnabled = env => env?.ROADMAP_ENABLED === 'true';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const NOT_AVAILABLE = { error: 'Not available', code: 'not_found' };

// deps (all optional in tests): identity(req, env), readSource(access, {sourceId, revision, scope}) -> { key, rev, scopeFingerprint, scope, language? } (Tools,
// request-bound: the session reads the Markdown once), startPlanning(env, access, roadmapId), compose(roadmap, step) (Tools, checked proposal), onAccepted(env, access, body)
// (kicks the RoadmapJobs object), now.
export async function roadmapRoute(path, req, env, deps = {}) {
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) return null;
  if (!roadmapEnabled(env)) return json({ error: 'Not found', code: 'roadmap_disabled' }, 404);
  if (!env.LEARN_DB) return json({ error: 'Not available', code: 'not_found' }, 503);
  const url = new URL(req.url);
  if (req.method !== 'GET' && req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin', code: 'forbidden' }, 403);
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed' }, 405);
  const user = await (deps.identity || repositoryIdentity)(req, env);
  if (user instanceof Response) return user;
  let body = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { return json({ error: 'Invalid JSON', code: 'invalid_request' }, 400); } }
  const boardId = req.method === 'GET' ? url.searchParams.get('boardId') : body.boardId;
  if (typeof boardId !== 'string' || !boardId) return json({ error: 'boardId is required', code: 'invalid_request' }, 400);
  const db = env.LEARN_DB;
  const board = await db.prepare('SELECT id, app, board FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(boardId, user.org, user.email).first();
  if (!board) return json(NOT_AVAILABLE, 404);
  // The access object: from the authenticated session and the owned board row, never from the body. Owner-only before R14.
  const userId = user.userId || user.user_id;
  if (!userId) return json(NOT_AVAILABLE, 404);
  const access = { org: user.org, actorUserId: userId, actorEmail: user.email, boardId: board.id, boardOwnerEmail: user.email, role: 'owner', payerUserId: userId, app: board.app };
  const rest = path.slice(PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent);
  const roadmapId = rest[0];
  const now = deps.now?.();
  const arg = { actionKey: body.actionKey, expectedRevision: body.expectedRevision ?? body.revision, ...(now ? { now } : {}) };
  const reply = async result => {
    if (result.refusal) return json({ ...refusalBody(result.refusal), current: await currentView(db, access, rest[0]) }, result.refusal.reason === 'unavailable' || result.refusal.reason === 'payer_unavailable' || result.refusal.reason === 'allowance_unavailable' ? 503 : 429);
    return json(result.body && result.status < 300 ? { ...result.body, view: await currentView(db, access, result.body.roadmapId ?? rest[0]) } : result.body, result.status);
  };
  try {
    // GET /  (status for this board)
    if (req.method === 'GET' && rest.length === 0) {
      const view = await currentView(db, access);
      if (view && req.headers.get('if-none-match') === view.poll.etag) return new Response(null, { status: 304, headers: { ETag: view.poll.etag, 'Cache-Control': 'no-store' } });
      return json(view ?? { roadmap: null, poll: { afterMs: 5000, etag: 'rv-none' } });
    }
    // POST /  (create)
    if (req.method === 'POST' && rest.length === 0) {
      if (!deps.readSource) return json({ error: 'Not available', code: 'source_unavailable' }, 503);
      const source = await deps.readSource(access, { sourceId: body.source?.sourceId, revision: body.source?.revision, scope: body.source?.scope });
      if (source?.error) return json({ error: source.error, code: source.code || 'source_unsupported', ...(source.limitation ? { limitation: source.limitation } : {}) }, source.status || 422);
      const created = await createRoadmap(db, access, { actionKey: body.actionKey, app: board.app, instruction: body.instruction, source: { key: source.key, rev: source.rev }, scope: source.scope, scopeFingerprint: source.scopeFingerprint, depth: body.depth, language: source.language ?? null, ...(now ? { now } : {}) });
      if (!created.replayed) await deps.startPlanning?.(env, access, created.body.roadmapId);
      return reply(created);
    }
    if (req.method === 'GET' && rest.length === 1) { const view = await currentView(db, access, roadmapId); return view ? json(view) : json(NOT_AVAILABLE, 404); }
    // GET /:rm/results/:rs  (the entitlement predicate; not entitled is indistinguishable from unknown)
    if (req.method === 'GET' && rest[1] === 'results' && rest.length === 3) {
      const got = await readEntitledResult(db, access, { roadmapId, resultId: rest[2] });
      return got ? json({ resultId: got.id, cardId: got.cardId, primitive: got.primitive, block: got.block }) : json(NOT_AVAILABLE, 404);
    }
    if (req.method !== 'POST') return json({ error: 'Not found', code: 'not_found' }, 404);
    const [, kind, id, verb] = rest;
    if (kind === 'accept-plan' && rest.length === 2) return reply(await acceptPlan(db, access, { roadmapId, planVersion: body.planVersion, ...arg }));
    if (kind === 'end' && rest.length === 2) return reply(await endRoadmap(db, access, { roadmapId, ...arg }));
    if (kind === 'mode' && rest.length === 2) return reply(await setMode(db, access, { roadmapId, mode: body.mode, actionKey: body.actionKey, ...(now ? { now } : {}) }));
    if (kind === 'steps' && id === 'propose' && rest.length === 3) {
      if (!deps.compose) return json({ error: 'Not available', code: 'not_found' }, 503);
      return reply(await proposeNextStep(db, access, { roadmapId, compose: deps.compose, ...arg }));
    }
    if (kind === 'steps' && verb === 'retry' && rest.length === 4) return reply(await retryStep(env, access, { roadmapId, stepId: id, ...arg }));
    if (kind === 'steps' && verb === 'replace' && rest.length === 4) return deps.compose ? reply(await replaceStep(db, access, { roadmapId, stepId: id, compose: deps.compose, ...arg })) : json({ error: 'Not available', code: 'not_found' }, 503);
    if (kind === 'steps' && verb === 'omit' && rest.length === 4) return reply(await omitStep(db, access, { roadmapId, stepId: id, ...arg }));
    if (kind === 'proposals' && verb === 'accept' && rest.length === 4) {
      const done = await acceptRoadmapStep(env, access, { roadmapId, revision: arg.expectedRevision, proposalId: id, proposalVersion: body.proposalVersion, actionKey: body.actionKey, ...(now ? { now } : {}) });
      if (!done.refusal && !done.replayed) await deps.onAccepted?.(env, access, done.body);
      return reply(done);
    }
    if (kind === 'proposals' && verb === 'cancel' && rest.length === 4) return reply(await cancelProposal(db, access, { roadmapId, proposalId: id, proposalVersion: body.proposalVersion, ...arg }));
    if (kind === 'results' && verb === 'deliver' && rest.length === 4) {
      // Idempotent: the same authorized blocks every time. Also the resume path after a reload or a second device.
      const got = await readEntitledResult(db, access, { roadmapId, resultId: id });
      if (!got) return json(NOT_AVAILABLE, 404);
      const row = await readResult(db, access, id);
      return json({ resultId: id, stepId: row.step_id, cards: [{ slot: { index: row.slot_index, cardId: got.cardId }, block: { ...got.block, id: got.cardId, stepId: row.step_id } }], ackRequired: got.delivery === 'not_delivered' });
    }
    if (kind === 'results' && verb === 'ack' && rest.length === 4) return reply(await acknowledgeDelivery(db, access, { roadmapId, resultId: id, cardIds: body.cardIds, boardVersion: body.boardVersion ?? null, ...arg }));
    if (kind === 'results' && verb === 'removed' && rest.length === 4) return reply(await markResultRemoved(db, access, { roadmapId, resultId: id, ...arg }));
    return json({ error: 'Not found', code: 'not_found' }, 404);
  } catch (error) {
    if (!(error instanceof StateError)) throw error;
    const status = error.status || ERROR_CODES[error.code] || 409;
    const out = { error: status === 409 ? 'This roadmap changed. Showing the latest.' : error.message, code: error.code };
    if (status === 409) {
      Object.assign(out, error.reply || conflictReply({ code: error.code, currentRevision: (roadmapId ? await readRoadmap(db, access, roadmapId) : null)?.revision ?? null }));
      out.current = await currentView(db, access, roadmapId);
    }
    return json(out, status);
  }
}
