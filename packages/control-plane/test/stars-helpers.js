// Shared helpers of the Stars tests (canvas-stars.test.js, canvas-stars-lists.test.js) on the shared-canvas fixture.
import { BOARD } from './shared-canvas-fixture.js';
import { starsRoute } from '../src/canvas-stars.js';
import { creatorsRoute } from '../src/creators.js';

export const BEN = 'u-ben-9a2b', CARA = 'u-cara-71f0', ANA = 'u-ana-5d1e';

export const handle = (f, email, h, name = null) => {
  f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name').run(email, name);
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, h);
};
// A canvas of `as` (with a board), optionally published; its publication token opens at /e/<token>.
export const canvasOf = async (f, as, title, { publish = false } = {}) => {
  const canvas = (await f.call('POST', '/api/canvases', { as, body: { title } })).body;
  await f.call('PUT', `/api/learn/boards/${canvas.name}/main`, { as, body: { state: BOARD } });
  if (!publish) return { canvas, token: null };
  const made = (await f.call('POST', `/api/apps/${canvas.name}/publish`, { as })).body;
  return { canvas, token: made.publication_token };
};
// ana's published canvas.
export const published = async (f, title = 'Why ice floats') => {
  if (!f.sqlite.prepare('SELECT 1 FROM user_handles WHERE email = ?').get('ana@test')) handle(f, 'ana@test', 'ana');
  return canvasOf(f, 'ana', title, { publish: true });
};
export const star = (f, token, as, method = 'PUT', body) => f.call(method, `/api/learn/boards/shared/${token}/star`, { as, body });
export const rows = f => f.sqlite.prepare('SELECT org, canvas, user_id, user_email FROM canvas_stars ORDER BY user_id, canvas').all().map(r => ({ ...r }));
export const events = f => f.sqlite.prepare('SELECT kind, reason, user_id, owner_star, surface, delivered_at FROM canvas_star_events ORDER BY at, rowid').all().map(e => ({ ...e }));
// /api/learn/stars* and /api/learn/creators*, which the fixture's dispatcher does not serve (dev-worker.js registers them).
export async function api(f, method, path, as, body) {
  const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const url = new URL(req.url);
  const res = path.startsWith('/api/learn/creators') ? await creatorsRoute(url.pathname, req, f.env) : await starsRoute(url.pathname, req, f.env);
  return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() };
}
