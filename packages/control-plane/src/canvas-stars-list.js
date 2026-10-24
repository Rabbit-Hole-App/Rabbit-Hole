// My personal Stars list (docs/features/stars.md, brief Task 7): GET /api/learn/stars?q=&cursor=&limit=. Every star I hold,
// most recently starred first, newest first with the star's own id as the tie-breaker, in bounded pages (keyset cursor, so a
// page never shifts when a star is added or removed). Each star is opened only through a route that authorizes NOW:
//   owner  - my own canvas in this workspace, not in Trash: /apps/<name>
//   public - the canvas is in Explore right now (the PUBLISHED predicate, reused as it stands): /e/<publication token>
//   link   - the share link I starred through is still the live link of its canvas (never another one): /b/<token>
// Anything else - revoked, unpublished, in Trash, deleted, a private canvas that is not mine - is "unavailable": the answer
// carries the star's id and time and nothing else (no title, creator, thumbnail, counts or link), and Remove still works.
// Search runs in SQL over the accessible rows only, before the limit, so it covers the whole collection and can never match
// an unavailable canvas's hidden title.
import { FORK_COUNT, HANDLE_OF, NAME_OF } from './canvases.js';
import { NOT_TRASHED } from './library-trash.js';
import { NO_TRASHED_ANCESTOR, PUBLISHED, likeOf, searchTerm } from './learn-boards.js';
import { STAR_COUNT } from './canvas-stars.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const PAGE = 24, MAX_PAGE = 50;
const CURSOR = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\|([0-9a-f]{32})$/;

const PUBLICLY_LISTED = `${PUBLISHED} AND p.org = s.org AND p.canvas = s.canvas`;
// ?2 the viewer's email, ?3 their workspace.
const ACCESS = `CASE WHEN c.name IS NULL THEN NULL
  WHEN c.owner_email = ?2 AND c.org = ?3 AND ${NOT_TRASHED('c.org', 'c.name')} THEN 'owner'
  WHEN EXISTS (SELECT 1 ${PUBLICLY_LISTED}) THEN 'public'
  WHEN s.via_token IS NOT NULL AND EXISTS (SELECT 1 FROM learn_boards b WHERE b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main'
    AND b.shared = 1 AND b.view_token = s.via_token AND ${NO_TRASHED_ANCESTOR}) THEN 'link' END`;
const FROM = `FROM canvas_stars s LEFT JOIN canvases c ON c.org = s.org AND c.name = s.canvas LEFT JOIN canvas_metadata m ON m.org = c.org AND m.canvas = c.name WHERE s.user_id = ?1`;
const COLUMNS = `s.id, s.created_at AS starred_at, s.via_token, c.name AS canvas, c.title, m.description, COALESCE(m.updated_at, c.created_at) AS updated_at,
  ${HANDLE_OF('c.owner_email')} AS handle, ${NAME_OF('c.owner_email')} AS owner_name, ${FORK_COUNT} AS fork_count, ${STAR_COUNT} AS star_count, ${ACCESS} AS access,
  (SELECT p.token ${PUBLICLY_LISTED}) AS pub_token`;

const route = r => (r.access === 'owner' ? `/apps/${r.canvas}` : r.access === 'public' ? `/e/${r.pub_token}` : `/b/${r.via_token}`);
// The card fields of an accessible star (the shape of Explore's card, plus my own state), or the generic unavailable entry.
const entry = r => (r.access
  ? { id: r.id, access: r.access, title: r.title, description: r.description ?? null, creator: r.handle ? { handle: r.handle, name: r.owner_name ?? null } : null, fork_count: r.fork_count, star_count: r.star_count,
    starred_by_me: true, url: route(r), updated_at: r.updated_at, starred_at: r.starred_at }
  : { id: r.id, access: 'unavailable', unavailable: true, starred_at: r.starred_at });

// total: every star I hold, unavailable ones included; unavailable: how many of those cannot be opened. Neither depends on the
// search, and neither is the public profile's count (which counts only public canvases).
export async function personalStars(db, viewer, params) {
  const limit = params.get('limit') === null ? PAGE : Number(params.get('limit'));
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) return json({ error: `Use a limit from 1 to ${MAX_PAGE}` }, 400);
  const cursor = params.get('cursor') === null ? null : params.get('cursor').match(CURSOR);
  if (params.get('cursor') !== null && !cursor) return json({ error: 'Use the cursor a previous page returned' }, 400);
  const term = searchTerm(params.get('q'));
  const binds = [viewer.userId, viewer.email, viewer.org];
  const where = [];
  if (term) { binds.push(likeOf(term)); where.push(`access IS NOT NULL AND (title LIKE ?${binds.length} ESCAPE '\\' OR description LIKE ?${binds.length} ESCAPE '\\' OR handle LIKE ?${binds.length} ESCAPE '\\' OR owner_name LIKE ?${binds.length} ESCAPE '\\')`); }
  if (cursor) { binds.push(cursor[1], cursor[2]); where.push(`(starred_at, id) < (?${binds.length - 1}, ?${binds.length})`); }
  const { results } = await db.prepare(`SELECT * FROM (SELECT ${COLUMNS} ${FROM}) ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY starred_at DESC, id DESC LIMIT ${limit + 1}`).bind(...binds).all();
  const page = results.slice(0, limit);
  const totals = await db.prepare(`SELECT count(*) AS total, COALESCE(sum(access IS NULL), 0) AS unavailable FROM (SELECT ${ACCESS} AS access ${FROM})`).bind(viewer.userId, viewer.email, viewer.org).first();
  return json({ stars: page.map(entry), next_cursor: results.length > limit ? `${page.at(-1).starred_at}|${page.at(-1).id}` : null, total: totals.total, unavailable: totals.unavailable });
}
