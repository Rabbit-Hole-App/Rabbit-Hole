// /dive (docs/features/dive-v1.md): nested Rabbit Holes. A hole is a canvas; canvas_dives links a
// child canvas to the board and card it was entered from. The client keeps an empty hole in the
// browser and calls POST only when the first canvas object lands, so an abandoned dive never
// reaches D1. Rename is the canvas PATCH (canvases.js); the tree is owner-private like canvases.
import { canvasApp } from './canvases.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const CANVAS = /^canvas-[a-f0-9]{8}$/;
const BOARD = /^[a-z0-9-]{1,32}$/;
const TITLE = 120, DIVE_JSON = 16000;

// A level of the tree the navigator can name and open: a canvas or a repository project board.
async function level(db, user, app, board) {
  if (CANVAS.test(app)) {
    const row = await db.prepare('SELECT name, title FROM canvases WHERE org=? AND name=? AND owner_email=?').bind(user.org, app, user.email).first();
    return row && { app, board, title: row.title, kind: 'canvas' };
  }
  const row = await db.prepare('SELECT name, repo FROM repository_apps WHERE org=? AND name=? AND owner_email=?').bind(user.org, app, user.email).first();
  return row && { app, board, title: row.repo, kind: 'repository' };
}
const linkOf = (db, user, child) => db.prepare('SELECT * FROM canvas_dives WHERE org=? AND owner_email=? AND child=?').bind(user.org, user.email, child).first();

// Every hole under root, root excluded, parents before children. A child canvas has only its main
// board today, but any board of it counts, so a subtree is never partly left behind.
async function descendants(db, user, root) {
  const out = [], queue = [root], seen = new Set([root]);
  while (queue.length) {
    const { results } = await db.prepare('SELECT d.child, c.title FROM canvas_dives d JOIN canvases c ON c.org=d.org AND c.name=d.child WHERE d.org=? AND d.owner_email=? AND d.parent_app=? ORDER BY d.created_at, d.child')
      .bind(user.org, user.email, queue.shift()).all();
    for (const row of results) if (!seen.has(row.child)) { seen.add(row.child); out.push({ name: row.child, title: row.title }); queue.push(row.child); }
  }
  return out;
}

// A pending hole's identity for chat and / commands before it persists: the hole has no canvas
// row until its first canvas object (chat alone never persists it, R-4), so an ask that names one
// is answered as a virtual canvas of this owner, provided the parent board is theirs. Nothing is
// written here; the ask's thread is keyed by the hole's name, so it continues if the hole is kept.
export async function pendingHoleApp(env, user, name, pending) {
  const board = pending?.parent?.board || 'main';
  const title = typeof pending?.title === 'string' ? pending.title.trim() : '';
  if (!CANVAS.test(name || '') || !title || title.length > TITLE || !BOARD.test(board)) return null;
  if (!await level(env.LEARN_DB, user, pending.parent?.app, board)) return null;
  return { ...canvasApp({ id: null, org: user.org, name, owner_email: user.email, title, project: null, created_at: null, archived_at: null, device_id: null }, user), pending: true };
}

export async function divesFetch(req, env, user) {
  const url = new URL(req.url), db = env.LEARN_DB;
  const one = url.pathname.match(/^\/api\/canvases\/dives\/(canvas-[a-f0-9]{8})$/)?.[1];

  // Where this board sits: the path from its root down to it, and its immediate children.
  if (!one && req.method === 'GET') {
    const app = url.searchParams.get('app') || '', board = url.searchParams.get('board') || 'main';
    if (!BOARD.test(board)) throw Error('Invalid board');
    const here = await level(db, user, app, board);
    if (!here) return json({ error: 'Not found in this workspace' }, 404);
    const path = [here], seen = new Set([app]);
    let link = await linkOf(db, user, app), dive = link ? JSON.parse(link.dive_json) : null;
    // No depth cap: the walk ends at the root; `seen` only guards a corrupted cycle.
    while (link && !seen.has(link.parent_app)) {
      seen.add(link.parent_app);
      // A hole started from a shared canvas (learn-boards.js startRabbitHole): its parent is the share link, a
      // view-only level named from the hole's own record. It is the root; the walk never reads the sharer's rows.
      if (link.parent_app.startsWith('share:')) {
        const source = JSON.parse(link.dive_json).source || {};
        path.unshift({ app: link.parent_app, board: link.parent_board, title: source.title || 'Shared canvas', kind: 'shared', href: source.share_url || null, origin_block_id: link.origin_block_id });
        break;
      }
      const parent = await level(db, user, link.parent_app, link.parent_board);
      if (!parent) break;
      path.unshift({ ...parent, origin_block_id: link.origin_block_id });
      link = await linkOf(db, user, link.parent_app);
    }
    const { results } = await db.prepare('SELECT d.child, d.origin_block_id, c.title FROM canvas_dives d JOIN canvases c ON c.org=d.org AND c.name=d.child WHERE d.org=? AND d.owner_email=? AND d.parent_app=? AND d.parent_board=? ORDER BY d.created_at, d.child')
      .bind(user.org, user.email, app, board).all();
    return json({ path, dive, children: results.map(row => ({ name: row.child, title: row.title, origin_block_id: row.origin_block_id })) });
  }

  // Persist a hole: its canvas row and its link, together, at the first canvas object.
  if (!one && req.method === 'POST') {
    const body = await req.json();
    const { name, parent = {}, origin_block_id: origin, dive = {} } = body;
    const board = parent.board || 'main', device = body.device_id ?? null;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!CANVAS.test(name || '')) throw Error('Invalid hole name');
    if (!title || title.length > TITLE) throw Error(`Use a title of up to ${TITLE} characters`);
    if (!BOARD.test(board)) throw Error('Invalid board');
    if (typeof origin !== 'string' || !origin || origin.length > 200) throw Error('Select the card you want to go deeper from.');
    if (device !== null && !(typeof device === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(device))) throw Error('Invalid device id');
    const diveJson = JSON.stringify(dive);
    if (diveJson.length > DIVE_JSON) throw Error('Dive record too large');
    if (!await level(db, user, parent.app, board)) return json({ error: 'Parent not found in this workspace' }, 404);
    // One child per originating card: a second dive from it enters the first.
    const existing = await db.prepare('SELECT child FROM canvas_dives WHERE org=? AND owner_email=? AND parent_app=? AND parent_board=? AND origin_block_id=?')
      .bind(user.org, user.email, parent.app, board, origin).first();
    if (existing) return json({ error: 'This card already has a Rabbit Hole', existing: existing.child }, 409);
    if (await db.prepare('SELECT 1 FROM canvases WHERE org=? AND name=?').bind(user.org, name).first()) return json({ error: 'Hole name taken' }, 409);
    await db.batch([
      db.prepare('INSERT INTO canvases(org,name,owner_email,title,project,device_id) VALUES(?,?,?,?,NULL,?)').bind(user.org, name, user.email, title, device),
      db.prepare('INSERT INTO canvas_dives(org,owner_email,child,parent_app,parent_board,origin_block_id,dive_json) VALUES(?,?,?,?,?,?,?)').bind(user.org, user.email, name, parent.app, board, origin, diveJson),
    ]);
    const row = await db.prepare('SELECT * FROM canvases WHERE org=? AND name=?').bind(user.org, name).first();
    return json(canvasApp(row, user), 201);
  }

  // Delete a hole. A hole with holes under it answers 409 with them listed; only an explicit
  // ?subtree=1 removes them all. Never a silent cascade.
  if (one && req.method === 'DELETE') {
    if (!await linkOf(db, user, one)) return json({ error: 'Rabbit Hole not found' }, 404);
    const below = await descendants(db, user, one);
    if (below.length && url.searchParams.get('subtree') !== '1') return json({ error: 'This Rabbit Hole has holes inside it', descendants: below }, 409);
    const names = [one, ...below.map(hole => hole.name)];
    // ponytail: the holes' Learn chat threads stay in LEARN_DB, unreachable; delete them when canvas threads get a retention rule.
    await db.batch(names.flatMap(name => [
      db.prepare('DELETE FROM canvas_dives WHERE org=? AND owner_email=? AND child=?').bind(user.org, user.email, name),
      db.prepare('DELETE FROM canvases WHERE org=? AND owner_email=? AND name=?').bind(user.org, user.email, name),
    ]));
    return json({ ok: true, deleted: names });
  }
  return json({ error: 'Method not allowed' }, 405);
}
