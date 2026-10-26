// Canvas Stars (docs/features/stars.md; migration 0028). A star is a reference: one canvas_stars row per (canvas, account),
// keyed by the canonical canvas (org, name) and users.id. It copies nothing, grants nothing and is not a content edit, so
// nothing here calls touchCanvas. The only static import is canvas-star-events.js, itself a leaf: canvases.js and dives.js
// import this module for deletion cleanup, so everything heavier (repositories.js, the list and analytics modules) loads lazily,
// as canvases.js loads learn-boards.js.
import { canvasRef, surfaceOf } from './canvas-star-events.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// A canvas's star count, for a query whose `canvases` row is aliased `c` (as FORK_COUNT): every active relationship.
export const STAR_COUNT = '(SELECT count(*) FROM canvas_stars s WHERE s.org = c.org AND s.canvas = c.name)';

const CANVAS = /^canvas-[a-f0-9]{8}$/;
const STAR_ID = /^[0-9a-f]{32}$/;
const OWNER = '(SELECT c.owner_email FROM canvases c WHERE c.org = ? AND c.name = ?)';
const EVENT = 'INSERT INTO canvas_star_events (event_id, kind, reason, org, canvas, user_id, owner_star, surface)';

// The star count of a canvas and whether `userId` holds one on it.
export async function starState(db, ref, userId = null) {
  const row = await db.prepare('SELECT count(*) AS n, COALESCE(sum(user_id = ?), 0) AS mine FROM canvas_stars WHERE org = ? AND canvas = ?').bind(userId ?? '', ref.org, ref.canvas).first();
  return { starred_by_me: !!userId && row.mine > 0, star_count: row.n };
}

// A whole list's counts in a few queries, never one per card: Map "org/canvas" -> { star_count, starred_by_me }. A canvas with no
// star is 0, never missing.
export async function starsFor(db, refs, userId = null) {
  const out = new Map(refs.map(ref => [`${ref.org}/${ref.canvas}`, { star_count: 0, starred_by_me: false }]));
  for (let i = 0; i < refs.length; i += 40) { // 2 binds a canvas, under D1's limit of 100 a statement
    const chunk = refs.slice(i, i + 40);
    const { results } = await db.prepare(`SELECT org, canvas, count(*) AS n, COALESCE(sum(user_id = ?), 0) AS mine FROM canvas_stars WHERE ${chunk.map(() => '(org = ? AND canvas = ?)').join(' OR ')} GROUP BY org, canvas`)
      .bind(userId ?? '', ...chunk.flatMap(ref => [ref.org, ref.canvas])).all();
    for (const row of results) out.set(`${row.org}/${row.canvas}`, { star_count: row.n, starred_by_me: row.mine > 0 });
  }
  return out;
}

// Desired state, never a toggle. Each branch is one D1 batch (one transaction): the transition event first, written only when
// the star is about to change (so a repeat writes none), then the change itself. Concurrent identical requests serialize in
// D1: the first changes and records, the rest find nothing to do. The count in the answer is read after, so it is a count
// that was true, whatever interleaved. `surface` (a fixed list) says where the press happened; `via` is the share link the
// person starred through (kept only as proof they held it, see the migration), set once and never replaced.
export async function setStar(db, ref, actor, starred, { surface = null, via = null } = {}) {
  const { org, canvas } = ref, key = [org, canvas, actor.userId];
  const here = 'org = ? AND canvas = ? AND user_id = ?', where = surfaceOf(surface);
  await db.batch(starred ? [
    db.prepare(`${EVENT} SELECT ?, 'added', 'voluntary', ?, ?, ?, COALESCE(${OWNER} = ?, 0), ? WHERE NOT EXISTS (SELECT 1 FROM canvas_stars WHERE ${here})`)
      .bind(crypto.randomUUID(), org, canvas, actor.userId, org, canvas, actor.email, where, ...key),
    db.prepare('INSERT OR IGNORE INTO canvas_stars (org, canvas, user_id, user_email) VALUES (?, ?, ?, ?)').bind(org, canvas, actor.userId, actor.email),
    ...(via ? [db.prepare(`UPDATE canvas_stars SET via_token = COALESCE(via_token, ?) WHERE ${here}`).bind(via, ...key)] : []),
  ] : [
    db.prepare(`${EVENT} SELECT ?, 'removed', 'voluntary', ?, ?, ?, COALESCE(${OWNER} = ?, 0), ? WHERE EXISTS (SELECT 1 FROM canvas_stars WHERE ${here})`)
      .bind(crypto.randomUUID(), org, canvas, actor.userId, org, canvas, actor.email, where, ...key),
    db.prepare(`DELETE FROM canvas_stars WHERE ${here}`).bind(...key),
  ]);
  return { starred, star_count: (await starState(db, ref)).star_count };
}

// Deletion cleanup (a permanently deleted canvas or Rabbit Hole): every star on it goes with it, each recorded as a
// lifecycle removal - never a voluntary unstar - so analytics can tell them apart. Statements for the caller's batch.
export const purgeStars = (db, org, canvas, ownerEmail) => [
  db.prepare(`${EVENT} SELECT lower(hex(randomblob(16))), 'removed', 'lifecycle', s.org, s.canvas, s.user_id, s.user_email = ?, NULL FROM canvas_stars s WHERE s.org = ? AND s.canvas = ?`)
    .bind(ownerEmail, org, canvas),
  db.prepare('DELETE FROM canvas_stars WHERE org = ? AND canvas = ?').bind(org, canvas),
];

// Who is acting: the signed-in account's users.id and principal, from the session and never from the request. A session
// without a users.id (a CLI token) has no stable account to key a star on, so it cannot star.
export function starActor(viewer) {
  return viewer?.userId && viewer.email ? { userId: viewer.userId, email: viewer.email } : null;
}
export const noAccount = () => json({ error: 'Stars need a Rabbit Hole account. Sign in on the web to star this canvas.', code: 'no_account' }, 403);

// The optional JSON body of a star request: only `surface` is read, and only from the fixed list.
export const surfaceFrom = async req => {
  const body = await req.json().catch(() => null);
  return body && typeof body === 'object' ? surfaceOf(body.surface) : null;
};

// The canonical canvas a shared board is, or null: only a canvas's own main board has one (a project's board, `repo-*`, is not
// a canvas). `row` is the learn_boards row a link resolved to, so a share token, a publication token and the owner's name all
// land on the same (org, name), and the token itself is never the identity.
export async function canonicalCanvas(db, row) {
  if (row.board !== 'main' || !CANVAS.test(row.app)) return null;
  const canvas = await db.prepare('SELECT org, name FROM canvases WHERE org = ? AND name = ? AND owner_email = ?').bind(row.org, row.app, row.owner_email).first();
  return canvas ? { org: canvas.org, canvas: canvas.name } : null;
}

// /api/learn/stars*: my own stars.
//   GET    /api/learn/stars                  my personal Stars list (canvas-stars-list.js)
//   DELETE /api/learn/stars/<id>             remove my star by its opaque id, with no access check: the way out of a star whose
//                                            canvas stopped being reachable. Only my own row; the same answer for any other id.
//   POST   /api/learn/stars/opened {surface, id|token}   a canvas opened from my Stars (id) or a profile's Stars (token): star.opened
//                                            telemetry only, best effort, a no-op where no telemetry sink is bound
//   POST   /api/learn/stars/state {tokens}   which of these publication tokens I have starred (cards in public lists)
//   GET    /api/learn/stars/analytics        star analytics for my published canvases (canvas-star-analytics.js)
export async function starsRoute(path, req, env) {
  if (path !== '/api/learn/stars' && !path.startsWith('/api/learn/stars/')) return null;
  if (!env.LEARN_DB) return json({ error: 'Stars need the Learn database on this worker.' }, 503);
  const { repositoryIdentity } = await import('./repositories.js');
  const viewer = await repositoryIdentity(req, env);
  const url = new URL(req.url), db = env.LEARN_DB;
  if (path === '/api/learn/stars/state') {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    // Signed out has no stars: the public cards simply show none starred, and no sign-in is asked.
    if (viewer instanceof Response || !starActor(viewer)) return json({ starred: [] });
    const body = await req.json().catch(() => null);
    const tokens = Array.isArray(body?.tokens) ? [...new Set(body.tokens.filter(t => typeof t === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(t)))].slice(0, 100) : null;
    if (!tokens) return json({ error: 'Send tokens as a list of publication tokens' }, 400);
    if (!tokens.length) return json({ starred: [] });
    const { results } = await db.prepare(`SELECT p.token FROM canvas_publications p JOIN canvas_stars s ON s.org = p.org AND s.canvas = p.canvas WHERE s.user_id = ? AND p.token IN (${tokens.map(() => '?').join(', ')})`).bind(starActor(viewer).userId, ...tokens).all();
    return json({ starred: results.map(row => row.token) });
  }
  if (viewer instanceof Response) return viewer;
  const actor = starActor(viewer);
  if (!actor) return noAccount();
  if (path === '/api/learn/stars') {
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const { personalStars } = await import('./canvas-stars-list.js');
    return personalStars(db, viewer, url.searchParams);
  }
  if (path === '/api/learn/stars/analytics') {
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const { starAnalytics } = await import('./canvas-star-analytics.js');
    return starAnalytics(db, viewer, url.searchParams.get('range') || '30d');
  }
  if (path === '/api/learn/stars/opened') {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    await recordOpened(env, actor, await req.json().catch(() => null));
    return json({ ok: true }); // the same answer whatever happened: this is analytics, never part of opening a canvas
  }
  const one = path.match(/^\/api\/learn\/stars\/([^/]+)$/);
  if (!one || !STAR_ID.test(one[1])) return json({ error: 'No such star' }, 404);
  if (req.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405);
  const mine = await db.prepare('SELECT org, canvas FROM canvas_stars WHERE id = ? AND user_id = ?').bind(one[1], actor.userId).first();
  if (mine) await setStar(db, mine, actor, false, { surface: await surfaceFrom(req) });
  return json({ starred_by_me: false });
}

// star.opened: where the opening surface (my Stars page, a profile's Stars tab) says a canvas was opened from. Never throws and
// writes nothing where no telemetry sink is bound (checked first, before any query), so no telemetry failure can reach the star
// flow. The canvas is found from the account's own star (id) or a live publication (token), never from a client-supplied
// workspace or name; owner_star says whether the opener owns it.
// ponytail: a signed-out viewer of a public profile records nothing, and a new-tab open (middle click) is not seen.
async function recordOpened(env, actor, body) {
  try {
    const surface = body?.surface;
    if (!['personal_stars', 'profile_stars'].includes(surface)) return;
    const { telemetryEnvironment, makeEvent } = await import('./telemetry-contract.js');
    if (!env.TELEMETRY_DB || !telemetryEnvironment(env)) return;
    const found = surface === 'personal_stars'
      ? (STAR_ID.test(body.id) ? await env.LEARN_DB.prepare('SELECT org, canvas FROM canvas_stars WHERE id = ? AND user_id = ?').bind(body.id, actor.userId).first() : null)
      : (/^[A-Za-z0-9_-]{16,64}$/.test(body.token) ? await env.LEARN_DB.prepare('SELECT org, canvas FROM canvas_publications WHERE token = ?').bind(body.token).first() : null);
    if (!found) return;
    const owned = await env.LEARN_DB.prepare(`SELECT 1 AS yes FROM canvases WHERE org = ? AND name = ? AND owner_email = ?`).bind(found.org, found.canvas, actor.email).first();
    const { emitTelemetry } = await import('./telemetry-delivery.js');
    await emitTelemetry(env, makeEvent('star.opened', { user_ref: actor.userId, feature: 'stars', operation: 'open', outcome: 'completed',
      payload: { canvas_ref: await canvasRef(found.org, found.canvas), owner_star: !!owned, surface } }, { service: 'control_plane' }));
  } catch { /* analytics only */ }
}
