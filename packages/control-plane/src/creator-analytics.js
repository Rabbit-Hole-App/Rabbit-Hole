// Creator analytics read (docs/features/creator-analytics-contract.md "Dashboard read contract", owner brief 2026-10-23):
// GET /api/analytics/creator?range=7d|30d|all[&canvas=<name>]. Owner-only: the scope is always the session's own live
// public canvases (PUBLISHED, the set the creator profile lists), so there is no parameter that names another creator.
// Analytics storage is not approved, so the only numbers are the canonical counters that already exist - the current
// public-canvas count and FORK_COUNT - and every other section is not_collected (dashboard()). It writes nothing.
import { FORK_COUNT } from './canvases.js';
import { PUBLISHED } from './learn-boards.js';
import { repositoryIdentity } from './repositories.js';
import { RANGES, dashboard } from '../../web/src/creator-analytics-shape.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const CANVAS = /^canvas-[a-f0-9]{8}$/;
export const creatorAnalyticsRoute = path => path === '/api/analytics/creator';

export async function creatorAnalyticsFetch(req, env, { now = Date.now } = {}) {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!env.LEARN_DB) return json({ error: 'Creator analytics needs the Learn database on this worker.' }, 503);
  const user = await repositoryIdentity(req, env); if (user instanceof Response) return user;
  const url = new URL(req.url);
  const range = url.searchParams.get('range') ?? '30d', canvas = url.searchParams.get('canvas');
  if (!RANGES.includes(range)) return json({ error: 'Use range=7d, 30d or all' }, 400);
  if (canvas !== null && !CANVAS.test(canvas)) return json({ error: 'canvas must be a canvas name such as canvas-0a1b2c3d' }, 400);
  const { results } = await env.LEARN_DB.prepare(`SELECT c.name AS canvas, c.title, ${FORK_COUNT} AS fork_count ${PUBLISHED} AND c.owner_email = ? ORDER BY p.published_at DESC, p.rowid DESC`)
    .bind(user.email).all();
  // Someone else's, private, unlisted, archived, trashed or unknown: one answer, so existence is not revealed.
  if (canvas && !results.some(r => r.canvas === canvas)) return json({ error: 'No public canvas of yours by that name' }, 404);
  return json(dashboard({ range, canvas, canvases: results.map(r => ({ canvas: r.canvas, title: r.title, fork_count: r.fork_count })), now: now() }));
}
