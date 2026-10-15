// Canvas references (C:/s/spec/canvas-references-mvp.md, contract C:/s/spec/references-plan.md). The saved source board is
// authoritative: a CanvasNode block carries refs [{ id, target }], target a learn_boards.id. learn_canvas_refs
// (learn-migrations/0021) is a derived index for backlinks, rewritten only in the batch that writes the board and guarded on
// the row that write produced, so a rejected, stale or same-base losing save never changes it.
//
// "Viewer can read canvas X": the viewer owns X, or is an active member of X (members exist on top-level canvases only),
// and X is not in Trash. Link tokens, public links and Explore do not count for this MVP.
import { repositoryIdentity } from './repositories.js';
import { NOT_TRASHED } from './library-trash.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const BOARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_CARD_REFS = 20;
export const MAX_BOARD_REFS = 500;
const TITLE = 120;
// ponytail: backlinks list at most this many references per canvas; paginate when a canvas is referenced more.
const MAX_BACKLINKS = 1000;

export const tooManyRefs = () => json({ error: `A card holds up to ${MAX_CARD_REFS} canvas links and a canvas up to ${MAX_BOARD_REFS}. Remove some links and try again.`, code: 'too_many_refs' }, 413);

// The board's references in card order, deduplicated by id; null when over a bound. A malformed ref is kept in the board
// and never indexed.
export function boardRefs(state) {
  const refs = [], seen = new Set();
  let total = 0;
  for (const block of Array.isArray(state?.blocks) ? state.blocks : []) {
    const list = Array.isArray(block?.refs) ? block.refs : [];
    if (list.length > MAX_CARD_REFS || (total += list.length) > MAX_BOARD_REFS) return null;
    if (typeof block.id !== 'string' || !block.id) continue;
    for (const ref of list) {
      if (typeof ref?.id !== 'string' || !REF_ID.test(ref.id) || typeof ref.target !== 'string' || !BOARD_ID.test(ref.target) || seen.has(ref.id)) continue;
      seen.add(ref.id);
      refs.push({ id: ref.id, object: block.id.slice(0, 200), title: typeof block.title === 'string' && block.title.trim() ? block.title.trim().slice(0, TITLE) : null, target: ref.target.toLowerCase() });
    }
  }
  return refs;
}

// A copy's cards keep their targets under new reference ids (fork, duplicate).
export const reidRefs = blocks => blocks.map(block => (Array.isArray(block?.refs) ? { ...block, refs: block.refs.map(ref => ({ ...ref, id: crypto.randomUUID() })) } : block));

// `c` is a canvases alias; binds org, email, userId.
const READS = c => `((${c}.org = ? AND ${c}.owner_email = ?) OR EXISTS (SELECT 1 FROM canvas_members cm WHERE cm.org = ${c}.org AND cm.canvas = ${c}.name AND cm.member_user_id = ? AND cm.status = 'active'))`;
const who = viewer => [viewer.org, viewer.email, viewer.userId ?? null];
// The board row exactly as this batch's write left it: version null means any version (an unversioned save).
const GUARD = 'EXISTS (SELECT 1 FROM learn_boards g WHERE g.id = ? AND g.state_json = ? AND g.version = COALESCE(?, g.version))';

// The index rewrite for one board write, for the same batch, after the write. `saver` is the board owner: a target they
// cannot read is not indexed (revalidated on every save), and resolves as Unavailable.
export function indexStatements(db, boardId, text, version, refs, saver) {
  const guard = [boardId, text, version ?? null];
  return [
    db.prepare(`DELETE FROM learn_canvas_refs WHERE source_board = ? AND ${GUARD}`).bind(boardId, ...guard),
    ...(refs.length ? [db.prepare(`INSERT OR IGNORE INTO learn_canvas_refs (source_board, ref_id, source_object, object_title, target_board)
      SELECT ?, json_extract(j.value, '$.id'), json_extract(j.value, '$.object'), json_extract(j.value, '$.title'), t.id
      FROM json_each(?) j JOIN learn_boards t ON t.id = json_extract(j.value, '$.target') AND t.board = 'main' AND t.id != ?
      JOIN canvases tc ON tc.org = t.org AND tc.name = t.app AND tc.owner_email = t.owner_email
      WHERE ${GUARD} AND ${READS('tc')}`).bind(boardId, JSON.stringify(refs), boardId, ...guard, ...who(saver))] : []),
  ];
}

// Before a board row is deleted, in the same batch: its outgoing references.
export const dropRefs = (db, org, owner, app) => db.prepare('DELETE FROM learn_canvas_refs WHERE source_board IN (SELECT id FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ?)').bind(org, owner, app);

// A readable canvas's main board, with what a viewer may see of it. Holes are left to READS (members only exist on top-level).
const READABLE = `SELECT b.id, c.org, c.name, c.title, c.project, c.owner_email,
    COALESCE((SELECT pb.title FROM learn_boards pb WHERE pb.org = c.org AND pb.owner_email = c.owner_email AND pb.app = c.project AND pb.board = 'main'),
      (SELECT r.repo FROM repository_apps r WHERE r.org = c.org AND r.name = c.project)) AS project_title,
    COALESCE((SELECT up.name FROM user_profiles up WHERE up.email = c.owner_email), (SELECT uh.handle FROM user_handles uh WHERE uh.email = c.owner_email)) AS owner_name
  FROM learn_boards b JOIN canvases c ON c.org = b.org AND c.name = b.app AND c.owner_email = b.owner_email
  WHERE b.board = 'main' AND ${NOT_TRASHED('c.org', 'c.name')}`;

const own = (row, viewer) => row.org === viewer.org && row.owner_email === viewer.email;
// The owner opens their canvas at its existing URL; a member at /c/<boardId>. path: the project, or the owner for a shared one.
const hrefOf = (row, viewer) => (own(row, viewer) ? (row.project ? `/apps/${row.project}?tab=learn&canvas=${row.name}` : `/apps/${row.name}`) : `/c/${row.id}`);
const pathOf = (row, viewer) => (own(row, viewer) ? row.project_title || null : row.owner_name || null);
const card = (href, object) => `${href}${href.includes('?') ? '&' : '?'}card=${encodeURIComponent(object)}`;
const shown = (row, viewer) => ({ title: row.title, path: pathOf(row, viewer), href: hrefOf(row, viewer) });

// GET /api/learn/canvas-picker?q=&exclude=&limit=: the viewer's own and member canvases, newest first, bounded. No holes,
// nothing in Trash or archived, never `exclude`.
async function picker(req, env, viewer) {
  const params = new URL(req.url).searchParams;
  const q = (params.get('q') || '').trim().slice(0, 100);
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.get('limit'), 10) || 20));
  const like = `%${q.replace(/[\\%_]/g, char => `\\${char}`)}%`;
  const { results } = await env.LEARN_DB.prepare(`${READABLE} AND ${READS('c')} AND c.archived_at IS NULL AND b.id != ? AND c.title LIKE ? ESCAPE '\\'
      AND c.name NOT IN (SELECT d.child FROM canvas_dives d WHERE d.org = c.org AND d.parent_app NOT LIKE 'share:%')
    ORDER BY COALESCE((SELECT md.updated_at FROM canvas_metadata md WHERE md.org = c.org AND md.canvas = c.name), c.created_at) DESC, c.id DESC LIMIT ?`).bind(...who(viewer), params.get('exclude') || '', like, limit + 1).all();
  return json({ canvases: results.slice(0, limit).map(row => ({ id: row.id, ...shown(row, viewer) })), more: results.length > limit });
}

// GET /api/learn/links/<boardId>: 404 unless the viewer can read the board. from: this board's saved references grouped
// by target, each target resolved for this viewer (unreadable or gone: unavailable, with no title or path). to: indexed
// references from other canvases the viewer can read, grouped by source; counts are what is returned.
async function links(env, viewer, boardId) {
  const db = env.LEARN_DB;
  const board = BOARD_ID.test(boardId) && await db.prepare(`SELECT b.state_json FROM learn_boards b JOIN canvases c ON c.org = b.org AND c.name = b.app AND c.owner_email = b.owner_email
    WHERE b.id = ? AND b.board = 'main' AND ${NOT_TRASHED('c.org', 'c.name')} AND ${READS('c')}`).bind(boardId.toLowerCase(), ...who(viewer)).first();
  if (!board) return json({ error: 'Canvas not found' }, 404);
  const id = boardId.toLowerCase();
  let state = null;
  try { state = JSON.parse(board.state_json); } catch { /* an unreadable board lists no references */ }
  const refs = boardRefs(state) || [];
  const targets = [...new Set(refs.map(ref => ref.target))];
  const readable = new Map();
  if (targets.length) {
    const { results } = await db.prepare(`${READABLE} AND b.id IN (SELECT value FROM json_each(?)) AND ${READS('c')}`).bind(JSON.stringify(targets), ...who(viewer)).all();
    for (const row of results) readable.set(row.id, row);
  }
  const from = targets.map(target => {
    const row = readable.get(target);
    const group = refs.filter(ref => ref.target === target).map(ref => ({ id: ref.id, object: ref.object, objectTitle: ref.title }));
    return row ? { target, ...shown(row, viewer), unavailable: false, refs: group } : { target, unavailable: true, refs: group };
  });
  const { results: rows } = await db.prepare(`SELECT r.ref_id, r.source_object, r.object_title, src.* FROM learn_canvas_refs r
    JOIN (${READABLE} AND ${READS('c')}) src ON src.id = r.source_board
    WHERE r.target_board = ? AND r.source_board != ? ORDER BY src.title, r.source_board, r.rowid LIMIT ${MAX_BACKLINKS}`).bind(...who(viewer), id, id).all();
  const to = new Map();
  for (const row of rows) {
    if (!to.has(row.id)) to.set(row.id, { source: row.id, ...shown(row, viewer), refs: [] });
    const group = to.get(row.id);
    group.refs.push({ id: row.ref_id, object: row.source_object, objectTitle: row.object_title, href: card(group.href, row.source_object) });
  }
  return json({ board: id, from, to: [...to.values()] });
}

export const canvasRefsRoute = path => path === '/api/learn/canvas-picker' || /^\/api\/learn\/links\/[^/]+$/.test(path);

export async function canvasRefsFetch(req, env) {
  if (!env.LEARN_DB) return json({ error: 'Canvas links need the Learn database on this worker.' }, 503);
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const viewer = await repositoryIdentity(req, env);
  if (viewer instanceof Response) return viewer;
  const path = new URL(req.url).pathname;
  if (path === '/api/learn/canvas-picker') return picker(req, env, viewer);
  return links(env, viewer, decodeURIComponent(path.slice('/api/learn/links/'.length)));
}
