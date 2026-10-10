// Library folders (docs/features/library-folders.md, owner 2026-10-09): flat folders in a person's own Library for their
// canvases and projects. Owner-only on every route: another account's folder answers 404, never 403, so an id says
// nothing. Nothing else reads these tables - a folder never reaches Explore, a share or a profile.
import { repositoryIdentity } from './repositories.js';
import { PIN_COLORS } from './canvas-comments.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
// The canvas's six swatches, as comment pins use them; a new folder without one is blue.
export const FOLDER_COLORS = PIN_COLORS;
export const NAME_MAX = 60;
const ID = '[0-9a-f-]{36}';
// The Library's two kinds (canvases.js isCanvas, repositories.js repo- names); apps are never filed.
const ITEM = '(?:canvas-[a-f0-9]{8}|repo-[a-z0-9-]{1,80})';

export const folderName = value => {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
};

export const libraryFoldersRoute = path => path === '/api/library/folders' || path.startsWith('/api/library/folders/');

const owned = (db, user, id) => db.prepare('SELECT id, name, color, created_at, updated_at FROM library_folders WHERE id = ? AND org = ? AND owner_email = ?').bind(id, user.org, user.email).first();
// Only the owner's own canvas or project can be filed: a folder is theirs, and so is everything in it.
const ownsItem = async (db, user, name) => !!(await db.prepare(`SELECT 1 FROM canvases WHERE org = ?1 AND name = ?2 AND owner_email = ?3
  UNION ALL SELECT 1 FROM repository_apps WHERE org = ?1 AND name = ?2 AND owner_email = ?3`).bind(user.org, name, user.email).first());
// One folder per item: the primary key (org, name) makes a move a replace.
const fileItem = (db, user, name, id) => db.prepare(`INSERT INTO library_folder_items (org, name, folder_id, owner_email) VALUES (?, ?, ?, ?)
  ON CONFLICT (org, name) DO UPDATE SET folder_id = excluded.folder_id, owner_email = excluded.owner_email`).bind(user.org, name, id, user.email);

async function body(req) {
  try { const b = await req.json(); return b && typeof b === 'object' && !Array.isArray(b) ? b : null; } catch { return null; }
}

export async function libraryFoldersFetch(req, env) {
  const path = new URL(req.url).pathname, db = env.LEARN_DB, method = req.method;
  const user = await repositoryIdentity(req, env); if (user instanceof Response) return user;
  if (path === '/api/library/folders') {
    if (method === 'GET') {
      const { results: folders } = await db.prepare('SELECT id, name, color, created_at, updated_at FROM library_folders WHERE org = ? AND owner_email = ? ORDER BY name COLLATE NOCASE, created_at').bind(user.org, user.email).all();
      const { results: items } = await db.prepare('SELECT i.name, i.folder_id FROM library_folder_items i JOIN library_folders f ON f.id = i.folder_id WHERE i.org = ? AND f.org = ? AND f.owner_email = ?').bind(user.org, user.org, user.email).all();
      return json({ folders, items: Object.fromEntries(items.map(i => [i.name, i.folder_id])) });
    }
    if (method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const input = await body(req); if (!input) return json({ error: 'Send a JSON object' }, 400);
    const name = folderName(input.name); if (!name) return json({ error: `A folder name is 1 to ${NAME_MAX} characters` }, 400);
    const color = input.color === undefined ? FOLDER_COLORS[1] : input.color;
    if (!FOLDER_COLORS.includes(color)) return json({ error: 'Pick a colour from the palette' }, 400);
    // "New folder…" from a card's ⋮ makes the folder and moves the card in one step.
    const item = input.item ?? null;
    if (item !== null && (typeof item !== 'string' || !new RegExp(`^${ITEM}$`).test(item) || !(await ownsItem(db, user, item)))) return json({ error: 'Item not found in your Library' }, 404);
    const now = new Date().toISOString(), folder = { id: crypto.randomUUID(), name, color, created_at: now, updated_at: now };
    await db.batch([
      db.prepare('INSERT INTO library_folders (id, org, owner_email, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(folder.id, user.org, user.email, name, color, now, now),
      ...(item ? [fileItem(db, user, item, folder.id)] : []),
    ]);
    return json({ folder, ...(item ? { item } : {}) }, 201);
  }
  const m = path.match(new RegExp(`^/api/library/folders/(${ID})(?:/items/(${ITEM}))?$`));
  if (!m) return json({ error: 'Not found' }, 404);
  const [, id, item] = m;
  const folder = await owned(db, user, id);
  if (!folder) return json({ error: 'Folder not found' }, 404);
  if (item) {
    if (method === 'PUT') {
      if (!(await ownsItem(db, user, item))) return json({ error: 'Item not found in your Library' }, 404);
      await fileItem(db, user, item, id).run();
      return json({ name: item, folder: id });
    }
    if (method !== 'DELETE') return json({ error: 'Method not allowed' }, 405);
    const { meta } = await db.prepare('DELETE FROM library_folder_items WHERE org = ? AND name = ? AND folder_id = ?').bind(user.org, item, id).run();
    return meta.changes ? json({ name: item, folder: null }) : json({ error: 'Not in this folder' }, 404);
  }
  if (method === 'PATCH') {
    const input = await body(req); if (!input) return json({ error: 'Send a JSON object' }, 400);
    const name = input.name === undefined ? folder.name : folderName(input.name);
    if (!name) return json({ error: `A folder name is 1 to ${NAME_MAX} characters` }, 400);
    const color = input.color === undefined ? folder.color : input.color;
    if (!FOLDER_COLORS.includes(color)) return json({ error: 'Pick a colour from the palette' }, 400);
    const updated_at = new Date().toISOString();
    await db.prepare('UPDATE library_folders SET name = ?, color = ?, updated_at = ? WHERE id = ?').bind(name, color, updated_at, id).run();
    return json({ folder: { ...folder, name, color, updated_at } });
  }
  if (method === 'DELETE') {
    // Its items go back to the Library: the rows go, never an item.
    const [released] = await db.batch([
      db.prepare('DELETE FROM library_folder_items WHERE folder_id = ?').bind(id),
      db.prepare('DELETE FROM library_folders WHERE id = ?').bind(id),
    ]);
    return json({ deleted: id, released: released.meta.changes });
  }
  return json({ error: 'Method not allowed' }, 405);
}
