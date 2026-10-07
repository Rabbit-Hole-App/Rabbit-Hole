// Library trash (docs/features/library-trash.md, owner 2026-10-06): Move to Trash and Restore for an owned top-level
// canvas or project, and the Trash list. A library_trash row hides the item from Home, Library, Explore and search,
// suspends its share links (kept, so Restore brings them back) and took its publication with it (Restore never
// republishes). Nothing is deleted, and neither action is a meaningful change (updated_at stays).
import { repositoryIdentity } from './repositories.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const NOW = "strftime('%Y-%m-%d %H:%M:%f', 'now')";

// Not in Trash: every list, share link and Explore read filters with this. `org` and `name` are qualified columns.
export const NOT_TRASHED = (org, name) => `NOT EXISTS (SELECT 1 FROM library_trash t WHERE t.org = ${org} AND t.name = ${name})`;

// The one write for both kinds; the caller has already checked ownership. A canvas's publication goes with it.
export function trashStatements(db, org, name, trash) {
  if (!trash) return [db.prepare('DELETE FROM library_trash WHERE org = ? AND name = ?').bind(org, name)];
  return [
    db.prepare(`INSERT OR IGNORE INTO library_trash (org, name, trashed_at) VALUES (?, ?, ${NOW})`).bind(org, name),
    db.prepare('DELETE FROM canvas_publications WHERE org = ? AND canvas = ?').bind(org, name),
  ];
}

// /api/library/trash (the Trash list) and /api/apps/<project>/(trash|untrash). A canvas's own routes live in canvases.js.
export const libraryTrashRoute = path => path === '/api/library/trash' || /^\/api\/apps\/repo-[a-z0-9-]+\/(trash|untrash)$/.test(path);

export async function libraryTrashFetch(req, env) {
  const path = new URL(req.url).pathname, db = env.LEARN_DB;
  const user = await repositoryIdentity(req, env); if (user instanceof Response) return user;
  if (path === '/api/library/trash') {
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const { results } = await db.prepare(`SELECT 'canvas' AS kind, c.name, c.title, t.trashed_at FROM library_trash t JOIN canvases c ON c.org = t.org AND c.name = t.name WHERE t.org = ? AND c.owner_email = ?
      UNION ALL SELECT 'repository' AS kind, r.name, r.repo AS title, t.trashed_at FROM library_trash t JOIN repository_apps r ON r.org = t.org AND r.name = t.name WHERE t.org = ? AND r.owner_email = ?
      ORDER BY trashed_at DESC`).bind(user.org, user.email, user.org, user.email).all();
    return json({ items: results });
  }
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  const [, name, action] = path.match(/^\/api\/apps\/(repo-[a-z0-9-]+)\/(trash|untrash)$/);
  const project = await db.prepare('SELECT owner_email FROM repository_apps WHERE org = ? AND name = ?').bind(user.org, name).first();
  if (!project) return json({ error: 'Project not found in this workspace' }, 404);
  if (project.owner_email !== user.email) return json({ error: 'Only its owner can move this project to Trash' }, 403);
  await db.batch(trashStatements(db, user.org, name, action === 'trash'));
  return json({ name, trashed: action === 'trash' });
}
