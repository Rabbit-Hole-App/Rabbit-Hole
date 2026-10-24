// Canvas Stars (docs/features/stars.md; migration 0028). A star is a reference: one canvas_stars row per (canvas, account),
// keyed by the canonical canvas (org, name) and users.id. It copies nothing, grants nothing and is not a content edit, so
// nothing here calls touchCanvas. This module is a leaf (no static imports): canvases.js and dives.js import it for deletion
// cleanup, so the routes load repositoryIdentity lazily, as canvases.js loads learn-boards.js.
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// A canvas's star count, for a query whose `canvases` row is aliased `c` (as FORK_COUNT): every active relationship.
export const STAR_COUNT = '(SELECT count(*) FROM canvas_stars s WHERE s.org = c.org AND s.canvas = c.name)';
// Whether the viewer (users.id bound at `userParam`) has starred it: viewer-specific, so only on no-store responses.
export const STARRED_BY = userParam => `EXISTS (SELECT 1 FROM canvas_stars s WHERE s.org = c.org AND s.canvas = c.name AND s.user_id = ${userParam})`;

const CANVAS = /^canvas-[a-f0-9]{8}$/;
const ORG = /^[A-Za-z0-9._-]{1,100}$/;
const OWNER = '(SELECT c.owner_email FROM canvases c WHERE c.org = ? AND c.name = ?)';
const EVENT = 'INSERT INTO canvas_star_events (event_id, kind, reason, org, canvas, user_id, owner_star)';

// The one star state read: the count of the canvas and whether `userId` holds a star on it.
export async function starState(db, ref, userId = null) {
  const row = await db.prepare('SELECT count(*) AS n, COALESCE(sum(user_id = ?), 0) AS mine FROM canvas_stars WHERE org = ? AND canvas = ?').bind(userId ?? '', ref.org, ref.canvas).first();
  return { starred_by_me: !!userId && row.mine > 0, star_count: row.n };
}

// Desired state, never a toggle. Each branch is one D1 batch (one transaction): the transition event first, written only when
// the star is about to change (so a repeat writes none), then the change itself. Concurrent identical requests serialize in
// D1: the first changes and records, the rest find nothing to do. The count in the answer is read after, so it is a count
// that was true, whatever interleaved.
export async function setStar(db, ref, actor, starred) {
  const { org, canvas } = ref, key = [org, canvas, actor.userId];
  const here = 'org = ? AND canvas = ? AND user_id = ?';
  await db.batch(starred ? [
    db.prepare(`${EVENT} SELECT ?, 'added', 'voluntary', ?, ?, ?, COALESCE(${OWNER} = ?, 0) WHERE NOT EXISTS (SELECT 1 FROM canvas_stars WHERE ${here})`)
      .bind(crypto.randomUUID(), org, canvas, actor.userId, org, canvas, actor.email, ...key),
    db.prepare('INSERT OR IGNORE INTO canvas_stars (org, canvas, user_id, user_email) VALUES (?, ?, ?, ?)').bind(org, canvas, actor.userId, actor.email),
  ] : [
    db.prepare(`${EVENT} SELECT ?, 'removed', 'voluntary', ?, ?, ?, COALESCE(${OWNER} = ?, 0) WHERE EXISTS (SELECT 1 FROM canvas_stars WHERE ${here})`)
      .bind(crypto.randomUUID(), org, canvas, actor.userId, org, canvas, actor.email, ...key),
    db.prepare(`DELETE FROM canvas_stars WHERE ${here}`).bind(...key),
  ]);
  return { starred, star_count: (await starState(db, ref)).star_count };
}

// Deletion cleanup (a permanently deleted canvas or Rabbit Hole): every star on it goes with it, each recorded as a
// lifecycle removal - never a voluntary unstar - so analytics can tell them apart. Statements for the caller's batch.
export const purgeStars = (db, org, canvas, ownerEmail) => [
  db.prepare(`${EVENT} SELECT lower(hex(randomblob(16))), 'removed', 'lifecycle', s.org, s.canvas, s.user_id, s.user_email = ? FROM canvas_stars s WHERE s.org = ? AND s.canvas = ?`)
    .bind(ownerEmail, org, canvas),
  db.prepare('DELETE FROM canvas_stars WHERE org = ? AND canvas = ?').bind(org, canvas),
];

// Who is acting: the signed-in account's users.id and principal, from the session and never from the request. A session
// without a users.id (a CLI token) has no stable account to key a star on, so it cannot star.
export function starActor(viewer) {
  return viewer?.userId && viewer.email ? { userId: viewer.userId, email: viewer.email } : null;
}
export const noAccount = () => json({ error: 'Stars need a Rabbit Hole account. Sign in on the web to star this canvas.', code: 'no_account' }, 403);

// The canonical canvas a shared board is, or null: only a canvas's own main board has one (a project's board, `repo-*`, is not
// a canvas). `found.row` is the learn_boards row a link resolved to, so a share token, a publication token and the owner's
// name all land on the same (org, name), and the token itself is never stored.
export async function canonicalCanvas(db, row) {
  if (row.board !== 'main' || !CANVAS.test(row.app)) return null;
  const canvas = await db.prepare('SELECT org, name FROM canvases WHERE org = ? AND name = ? AND owner_email = ?').bind(row.org, row.app, row.owner_email).first();
  return canvas ? { org: canvas.org, canvas: canvas.name } : null;
}

// DELETE /api/learn/stars/canvas/<org>/<canvas>: remove my own star by its canonical reference, with no access check - the
// way out of a star whose canvas stopped being reachable (a revoked link, a canvas made private). It touches only the
// caller's own row and answers the same for a star that never existed, so it cannot be used to probe a canvas.
export async function starsRoute(path, req, env) {
  if (!path.startsWith('/api/learn/stars/')) return null;
  if (!env.LEARN_DB) return json({ error: 'Stars need the Learn database on this worker.' }, 503);
  const one = path.match(/^\/api\/learn\/stars\/canvas\/([^/]+)\/([^/]+)$/);
  if (!one) return json({ error: 'No such route' }, 404);
  if (req.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405);
  const { repositoryIdentity } = await import('./repositories.js');
  const viewer = await repositoryIdentity(req, env);
  if (viewer instanceof Response) return viewer;
  const actor = starActor(viewer);
  if (!actor) return noAccount();
  let org, canvas;
  try { [org, canvas] = [decodeURIComponent(one[1]), decodeURIComponent(one[2])]; } catch { return json({ error: 'No such canvas' }, 404); } // a malformed % escape
  if (!ORG.test(org) || !CANVAS.test(canvas)) return json({ error: 'No such canvas' }, 404);
  await setStar(env.LEARN_DB, { org, canvas }, actor, false);
  return json({ starred_by_me: false });
}
