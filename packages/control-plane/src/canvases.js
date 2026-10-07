import { repositoryIdentity, repositoryThreads } from './repositories.js';
import { divesFetch, pendingHoleApp } from './dives.js';
import { NOT_TRASHED, trashStatements } from './library-trash.js';

// Dev-only canvas records (T02 section 8). A row is identity and title only; the
// canvas content stays in the learner's browser under small.adaptive-canvas:*.
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const TITLE = 120;
// A publication's own read capability (/e/<token>): 24 random bytes, base64url - the shape of a share token
// (learn-boards.js newToken), never derived from one.
const publicationToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Shape mirrors repositoryApp (repositories.js:33-36) so Learn and the catalog read it unchanged.
export function canvasApp(row, user) {
  // access: what the owner's Visibility menu shows - public (published to Explore), unlisted (a share link), private.
  // board_saved: its main board is on the server, so no card calls its content browser-only (canvas-persistence.md, step 8).
  return { ...row, kind: 'canvas', hosting: 'canvas', email: user.email, orgName: user.orgName, visibility: 'private', members: [], published: !!row.publication_token,
    shared: !!row.shared, board_saved: !!row.board_saved, access: row.publication_token ? 'public' : row.shared ? 'unlisted' : 'private',
    canView: true, canEdit: row.owner_email === user.email, url: `/apps/${row.name}`, inputs: {}, outputs: {} };
}
// The canvas's last meaningful change (docs/features/canvas-metadata.md): a rename, a description edit, a change to its
// saved content - never a view, a selection, someone else's fork or Rabbit Hole, a copied link or a handle change. The
// same text form as created_at (SQLite datetime, here with milliseconds), so the two order together.
export const NOW = "strftime('%Y-%m-%d %H:%M:%f', 'now')";
export const touchCanvas = (db, org, canvas) => db.prepare(`INSERT INTO canvas_metadata (org, canvas, updated_at) VALUES (?, ?, ${NOW}) ON CONFLICT (org, canvas) DO UPDATE SET updated_at = excluded.updated_at`).bind(org, canvas);
// An optional description, written by its owner (never generated): plain text up to 500 characters; empty clears it.
const DESCRIPTION = 500;
function canvasDescription(value) {
  if (value === null) return null;
  if (typeof value !== 'string') throw Error('Write the description as text');
  const text = value.trim();
  if (text.length > DESCRIPTION) throw Error(`Use a description of up to ${DESCRIPTION} characters`);
  return text || null;
}
function canvasTitle(value) {
  if (typeof value !== 'string' || value.trim().length > TITLE) throw Error(`Use a title of up to ${TITLE} characters`);
  return value.trim();
}
// Fork provenance on every canvas its owner reads (docs/features/canvas-forking.md): the source's title when
// it was forked, a link to the source only while this owner may still open it - their own canvas, or the
// live share link they forked through; never a newer link or anything else about a source they lost - and
// the canvas's direct fork count. `published`: whether its owner published it to Explore - only an explicit owner action
// writes canvas_publications (docs/features/explore-publish.md); a share link, public_view, a fork or a Rabbit Hole never does.
export const FORK_COUNT = '(SELECT count(*) FROM canvas_forks k JOIN canvases kc ON kc.org = k.org AND kc.name = k.canvas WHERE k.forked_from_org = c.org AND k.forked_from_canvas_id = c.name)';
// A person's public handle and display name, by reference (docs/features/user-handles.md): read at the moment, never
// copied onto a canvas, so a changed handle shows everywhere at once. No handle row, no handle: never an email.
// `email` must be a qualified column of the outer row (c.owner_email): the inner tables carry their own aliases so a
// bare name can never bind to them and match every row.
export const HANDLE_OF = email => `(SELECT uh.handle FROM user_handles uh WHERE uh.email = ${email})`;
export const NAME_OF = email => `(SELECT up.name FROM user_profiles up WHERE up.email = ${email})`;
// The owner's handle and name (Home/Library cards, nested holes included), and the handle of whoever owned the source
// of a fork ("Forked from ... · @alice"); the fork itself is the forker's.
const CANVAS_ROW = `SELECT c.*, f.forked_from_title, CASE
    WHEN src.org = c.org AND src.owner_email = c.owner_email THEN '/apps/' || src.name
    WHEN f.forked_from_share IS NOT NULL AND (f.forked_from_canvas_id IS NULL OR src.name IS NOT NULL)
      AND EXISTS (SELECT 1 FROM learn_boards b WHERE b.shared = 1 AND b.view_token = f.forked_from_share) THEN '/b/' || f.forked_from_share
    WHEN f.forked_from_share IS NOT NULL AND EXISTS (SELECT 1 FROM canvas_publications pp JOIN canvases pc ON pc.org = pp.org AND pc.name = pp.canvas AND pc.archived_at IS NULL WHERE pp.token = f.forked_from_share) THEN '/e/' || f.forked_from_share
  END AS forked_from_url, ${FORK_COUNT} AS fork_count,
  ${HANDLE_OF('c.owner_email')} AS owner_handle, ${NAME_OF('c.owner_email')} AS owner_name, ${HANDLE_OF('f.forked_from_owner_id')} AS forked_from_handle,
  (SELECT p.token FROM canvas_publications p WHERE p.org = c.org AND p.canvas = c.name) AS publication_token,
  m.description, COALESCE(m.updated_at, c.created_at) AS updated_at,
  (SELECT b.shared FROM learn_boards b WHERE b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main') AS shared,
  EXISTS (SELECT 1 FROM learn_boards b WHERE b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main') AS board_saved,
  (SELECT t.trashed_at FROM library_trash t WHERE t.org = c.org AND t.name = c.name) AS trashed_at
  FROM canvases c LEFT JOIN canvas_forks f ON f.org = c.org AND f.canvas = c.name
  LEFT JOIN canvas_metadata m ON m.org = c.org AND m.canvas = c.name
  LEFT JOIN canvases src ON src.org = f.forked_from_org AND src.name = f.forked_from_canvas_id`;
async function ownedCanvas(env, user, name) {
  const row = await env.LEARN_DB.prepare(`${CANVAS_ROW} WHERE c.org=? AND c.name=?`).bind(user.org, name).first();
  if (!row) return json({ error: 'Canvas not found in this workspace' }, 404);
  if (row.owner_email !== user.email) return json({ error: 'This canvas is private to its owner' }, 403);
  return canvasApp(row, user);
}
// `pending` ({ parent: { app, board }, title }) lets a pending Rabbit Hole's chat and / commands run
// before its canvas row exists (dives.js pendingHoleApp); an existing row always wins.
// user_id (users.id, null without one) is the journey key (adaptive-learning-path-v1-architecture.md §10.2). It is set
// here, on the access object authorizedBoardApp returns, and not in canvasApp, so no canvas listing or canvas response
// the browser reads ever carries it.
export async function canvasAccess(req, env, name, pending = null) {
  const user = await repositoryIdentity(req, env);
  if (user instanceof Response) return user;
  let app = await ownedCanvas(env, user, name);
  if (app instanceof Response && app.status === 404 && pending) app = (await pendingHoleApp(env, user, name, pending)) || app;
  return app instanceof Response ? app : { ...app, user_id: user.userId ?? null };
}
// Titles are labels, never identities (docs/features/canvas-naming.md): different people may share one, and an owner
// may give two canvases the same title by hand - a typed title is kept exactly. Only a copy the system makes for its
// owner - a Duplicate, a fork - steps to the next free " (n)" when that owner's top-level Library (archived included)
// already has the title: "Example", "Example (2)", "Example (3)", skipping numbers in use. Nested Rabbit Holes, other
// owners and projects never count.
export async function freeTitle(db, org, owner, title) {
  const base = title.replace(/ \(\d+\)$/, '') || title;
  const like = `${base.replace(/[\\%_]/g, char => `\\${char}`)} (%)`;
  const { results } = await db.prepare(`SELECT c.title FROM canvases c WHERE c.org=? AND c.owner_email=? AND (c.title=? OR c.title=? OR c.title LIKE ? ESCAPE '\\') AND c.name NOT IN (SELECT child FROM canvas_dives WHERE org=? AND owner_email=? AND parent_app NOT LIKE 'share:%')`)
    .bind(org, owner, title, base, like, org, owner).all();
  const taken = new Set(results.map(row => row.title));
  if (!taken.has(title)) return title;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`, next = `${base.slice(0, TITLE - suffix.length)}${suffix}`;
    if (!taken.has(next)) return next;
  }
}

// The caller's own canvases only (owner-only in phase 1, section 8.2). Nested Rabbit Holes are left
// out: they belong to their root's tree and open through its navigator and portals (dives.js), never
// as top-level canvases in Home, Library or Search. They still open directly by their URL. A hole started
// from someone's shared canvas (parent `share:...`) is a root of the viewer's own, so it is listed.
export async function ownerCanvases(env, user, archived = false) {
  const { results } = await env.LEARN_DB.prepare(`${CANVAS_ROW} WHERE c.org=? AND c.owner_email=? AND c.archived_at IS ${archived ? 'NOT ' : ''}NULL AND ${NOT_TRASHED('c.org', 'c.name')} AND c.name NOT IN (SELECT child FROM canvas_dives WHERE org=? AND owner_email=? AND parent_app NOT LIKE 'share:%') ORDER BY updated_at DESC, c.id DESC`).bind(user.org, user.email, user.org, user.email).all();
  return results.map(row => canvasApp(row, user));
}

// Exactly the slugs canvasesFetch creates, so a live app that merely starts with canvas- stays live.
const isCanvas = name => typeof name === 'string' && /^canvas-[a-f0-9]{8}$/.test(name);
// Which dev requests are canvas traffic. dev-worker.js cannot be imported under node, so the rule lives here, tested.
// History lists only for Learn's scope (spec 8.2), so the legacy Agent panels never resume a canvas chat.
export function canvasRoute(url) {
  const path = url.pathname;
  return path === '/api/canvases' || /^\/api\/canvases\/dives(?:\/canvas-[a-f0-9]{8})?$/.test(path) || /^\/api\/apps\/canvas-[a-f0-9]{8}(?:\/|$)/.test(path) || /^\/api\/ask\/threads\/canvaschat-/.test(path)
    || (path === '/api/ask/threads' && url.searchParams.get('scope') === 'learn' && isCanvas(url.searchParams.get('ref')));
}
// Canvas asks the dev Learn router does not answer. A multipart Learn ask carries a + attachment,
// which canvases do not take yet (the dev worker calls this before its Learn router); a JSON /api/ask
// comes from the legacy Agent panels and would carry canvas chat to live small-cp. Learn's JSON asks
// never get here: the dev Learn router answers them with the LEARN_DB seam.
export async function refuseCanvasAsk(req) {
  const path = new URL(req.url).pathname;
  const multipart = req.headers.get('content-type')?.includes('multipart/form-data');
  if (req.method !== 'POST' || !['/api/ask', '/api/learn/ask', '/api/learn/selection'].includes(path) || (!multipart && path !== '/api/ask')) return null;
  let app = null;
  try { app = (multipart ? JSON.parse((await req.clone().formData()).get('body') || '{}') : await req.clone().json()).scope?.app; } catch { /* live small-cp answers malformed bodies as today */ }
  if (!isCanvas(app)) return null;
  return json({ error: multipart ? 'Attachments are not available on canvases yet. Upload a PDF from the canvas menu.' : 'Canvas chat runs in Learn. Open the canvas to ask there.' }, 400);
}

// The dev Learn router serves an ask only on dev storage: a canvas through canvasAskSeam, a repo-*
// app through repositoriesFetch. A job or server app's ask would reach apiAsk on the live D1
// (threads, messages), and the preview never sends one (D7), so it is refused here.
export function refuseLiveLearnAsk(access) {
  if (access.kind === 'canvas' || access.kind === 'repository') return null;
  return json({ error: 'Learn on a live app is off on this preview: it would write live chat history.' }, 403);
}

export async function canvasesFetch(req, env) {
  const url = new URL(req.url), path = url.pathname, db = env.LEARN_DB;
  const user = await repositoryIdentity(req, env); if (user instanceof Response) return user;
  try {
    if (path.startsWith('/api/canvases/dives')) return await divesFetch(req, env, user);
    if (path === '/api/canvases') {
      if (req.method === 'GET') return json({ canvases: await ownerCanvases(env, user, url.searchParams.get('archived') === '1') });
      if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      const body = await req.json();
      const title = canvasTitle(body.title ?? '') || 'Untitled canvas', project = body.project ?? null, device = body.device_id ?? null;
      if (device !== null && !(typeof device === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(device))) throw Error('Invalid device id');
      if (project !== null && !(typeof project === 'string' && await db.prepare('SELECT 1 FROM repository_apps WHERE org=? AND name=? AND owner_email=?').bind(user.org, project, user.email).first())) return json({ error: 'Project not found in this workspace' }, 404);
      // ponytail: no per-owner canvas cap (repositories cap 25 per workspace); add one if dev rows grow unbounded.
      const row = await db.prepare('INSERT INTO canvases(org,name,owner_email,title,project,device_id) VALUES(?,?,?,?,?,?) RETURNING *')
        .bind(user.org, `canvas-${crypto.randomUUID().slice(0, 8)}`, user.email, title, project, device).first();
      return json(canvasApp(row, user), 201);
    }
    // Learn's chat keeps its /api/ask/threads calls (ask.jsx:388,401,601,622); canvas history lives in LEARN_DB.
    const thread = path.match(/^\/api\/ask\/threads(?:\/(canvaschat-[a-f0-9-]+)(?:\/(delete|rename))?)?$/);
    if (thread) {
      const [, id, action] = thread;
      if (action && req.method !== 'POST') return json({ error: 'POST required' }, 405);
      const ref = id ? (await db.prepare('SELECT scope_ref FROM threads WHERE id=? AND org=? AND user=?').bind(id, user.org, user.email).first())?.scope_ref : url.searchParams.get('ref');
      if (!ref) return json({ error: 'Chat not found' }, 404);
      let app = await ownedCanvas(env, user, ref);
      // A pending hole has no row yet; its history is still only this user's own threads for that name.
      if (app instanceof Response && app.status === 404 && isCanvas(ref)) app = canvasApp({ id: null, org: user.org, name: ref, owner_email: user.email, title: '' }, user);
      if (app instanceof Response) return app;
      return repositoryThreads(new Request(req, { method: action === 'delete' ? 'DELETE' : action === 'rename' ? 'PATCH' : req.method }), db, user, app, id);
    }
    const match = path.match(/^\/api\/apps\/(canvas-[a-f0-9]{8})(?:\/(archive|restore|learn-course|publish|unpublish|trash|untrash))?$/);
    if (!match) return json({ error: 'Not found' }, 404);
    const [, name, action] = match;
    const app = await ownedCanvas(env, user, name); if (app instanceof Response) return app;
    // Learn loads a course on mount (LearnCourse.jsx:22-27); canvases have none. Shape of learn-course.js:67.
    if (action === 'learn-course') return req.method === 'GET' ? json({ course: null, revision: 0, canAuthor: false }) : json({ error: 'Courses are not available on canvases' }, 405);
    if (action) {
      if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
      // Publish to Explore / Remove from Explore (docs/features/explore-publish.md): the owner's explicit action, and the
      // only writer of canvas_publications. Unpublishing removes discoverability only: share links stay as they are.
      if (action === 'publish' || action === 'unpublish') {
        if (action === 'publish') {
          // Owner, 2026-10-06: only a live, top-level canvas with saved content, and only under the owner's public
          // @handle - Explore never shows an email. Publishing again keeps the same publication and token.
          if (app.archived_at) return json({ error: 'Restore this canvas before publishing it.' }, 409);
          if (app.trashed_at) return json({ error: 'Restore this canvas from Trash before publishing it.' }, 409);
          if (await db.prepare('SELECT 1 FROM canvas_dives WHERE org = ? AND child = ?').bind(user.org, name).first()) return json({ error: 'A Rabbit Hole inside another canvas cannot be published on its own.' }, 409);
          if (!app.owner_handle) return json({ error: 'Choose your handle before publishing.', needsHandle: true }, 409);
          if (!await db.prepare("SELECT 1 FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = 'main'").bind(user.org, user.email, name).first()) {
            return json({ error: 'There is nothing to publish yet: open this canvas so it saves, then publish.' }, 409);
          }
          await db.prepare('INSERT OR IGNORE INTO canvas_publications (org, canvas, token) VALUES (?, ?, ?)').bind(user.org, name, publicationToken()).run();
        } else await db.prepare('DELETE FROM canvas_publications WHERE org = ? AND canvas = ?').bind(user.org, name).run();
        return json(await ownedCanvas(env, user, name));
      }
      // Move to Trash / Restore (docs/features/library-trash.md): an owned top-level canvas only - a nested Rabbit Hole goes
      // with its canvas. Its publication goes too; its share links are suspended, not lost. Neither bumps updated_at.
      if (action === 'trash' || action === 'untrash') {
        if (action === 'trash' && await db.prepare("SELECT 1 FROM canvas_dives WHERE org = ? AND child = ? AND parent_app NOT LIKE 'share:%'").bind(user.org, name).first()) {
          return json({ error: 'A Rabbit Hole inside another canvas goes to Trash with its canvas.' }, 409);
        }
        await db.batch(trashStatements(db, user.org, name, action === 'trash'));
        return json(await ownedCanvas(env, user, name));
      }
      // Archived means out of Explore too (the safest reading): restoring never publishes it again by itself.
      if (action === 'archive') await db.prepare('DELETE FROM canvas_publications WHERE org = ? AND canvas = ?').bind(user.org, name).run();
      await db.prepare(`UPDATE canvases SET archived_at=${action === 'archive' ? "datetime('now')" : 'NULL'} WHERE id=?`).bind(app.id).run();
      return json(await ownedCanvas(env, user, name));
    }
    if (req.method === 'GET') return json(app);
    // Rename and Edit description; either one that changes something is the canvas's latest meaningful change.
    if (req.method === 'PATCH') {
      const body = await req.json();
      const title = body.title === undefined ? app.title : canvasTitle(body.title);
      if (!title) throw Error('Title required');
      const description = body.description === undefined ? app.description ?? null : canvasDescription(body.description);
      if (title === app.title && description === (app.description ?? null)) return json(app);
      await db.batch([
        db.prepare('UPDATE canvases SET title=? WHERE id=?').bind(title, app.id),
        touchCanvas(db, user.org, name),
        db.prepare('UPDATE canvas_metadata SET description=? WHERE org=? AND canvas=?').bind(description, user.org, name),
      ]);
      return json(await ownedCanvas(env, user, name));
    }
    if (req.method === 'DELETE') {
      // Undo only while untouched (section 8.4). One statement, so a thread started meanwhile keeps the canvas.
      const { meta } = await db.prepare('DELETE FROM canvases WHERE id=? AND NOT EXISTS (SELECT 1 FROM threads WHERE org=? AND scope_ref=?)').bind(app.id, user.org, name).run();
      if (meta.changes) await db.prepare('DELETE FROM canvas_publications WHERE org = ? AND canvas = ?').bind(user.org, name).run();
      return meta.changes ? json({ ok: true }) : json({ error: 'This canvas has been used. Archive it instead.' }, 405);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) { return json({ error: error.message }, 400); }
}

// apiAsk's seam (index.js): the app, its context and the thread store all come from LEARN_DB,
// so a canvas turn neither writes nor reads live D1: @-mentioned apps are not read on a seam turn
// (apiAsk). Threads reuse repository-schema.sql threads/messages.
export function canvasAskSeam(env, app) {
  const db = env.LEARN_DB;
  return {
    app, db,
    context: `SCOPE: canvas ${JSON.stringify(app.title)} - a standalone learning canvas whose content lives in the learner's browser. Teach as a general tutor.`,
    findThread: id => db.prepare("SELECT id, 'learn' AS scope, scope_ref FROM threads WHERE id=? AND org=? AND user=?").bind(id, app.org, app.email).first(),
    newThread: async title => {
      const id = `canvaschat-${crypto.randomUUID()}`;
      await db.prepare("INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES(?,?,?,?,'',?)").bind(id, app.org, app.email, app.name, title.slice(0, 120)).run();
      return id;
    },
  };
}
