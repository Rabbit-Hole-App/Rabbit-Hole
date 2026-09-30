import { repositoryIdentity, repositoryThreads } from './repositories.js';
import { divesFetch } from './dives.js';

// Dev-only canvas records (T02 section 8). A row is identity and title only; the
// canvas content stays in the learner's browser under small.adaptive-canvas:*.
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const TITLE = 120;

// Shape mirrors repositoryApp (repositories.js:33-36) so Learn and the catalog read it unchanged.
export function canvasApp(row, user) {
  return { ...row, kind: 'canvas', hosting: 'canvas', email: user.email, orgName: user.orgName, visibility: 'private', members: [],
    canView: true, canEdit: row.owner_email === user.email, url: `/apps/${row.name}`, inputs: {}, outputs: {} };
}
function canvasTitle(value) {
  if (typeof value !== 'string' || value.trim().length > TITLE) throw Error(`Use a title of up to ${TITLE} characters`);
  return value.trim();
}
async function ownedCanvas(env, user, name) {
  const row = await env.LEARN_DB.prepare('SELECT * FROM canvases WHERE org=? AND name=?').bind(user.org, name).first();
  if (!row) return json({ error: 'Canvas not found in this workspace' }, 404);
  if (row.owner_email !== user.email) return json({ error: 'This canvas is private to its owner' }, 403);
  return canvasApp(row, user);
}
export async function canvasAccess(req, env, name) {
  const user = await repositoryIdentity(req, env);
  return user instanceof Response ? user : ownedCanvas(env, user, name);
}
// The caller's own canvases only (owner-only in phase 1, section 8.2).
export async function ownerCanvases(env, user, archived = false) {
  const { results } = await env.LEARN_DB.prepare(`SELECT * FROM canvases WHERE org=? AND owner_email=? AND archived_at IS ${archived ? 'NOT ' : ''}NULL ORDER BY created_at DESC, id DESC`).bind(user.org, user.email).all();
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
      const app = await ownedCanvas(env, user, ref); if (app instanceof Response) return app;
      return repositoryThreads(new Request(req, { method: action === 'delete' ? 'DELETE' : action === 'rename' ? 'PATCH' : req.method }), db, user, app, id);
    }
    const match = path.match(/^\/api\/apps\/(canvas-[a-f0-9]{8})(?:\/(archive|restore|learn-course))?$/);
    if (!match) return json({ error: 'Not found' }, 404);
    const [, name, action] = match;
    const app = await ownedCanvas(env, user, name); if (app instanceof Response) return app;
    // Learn loads a course on mount (LearnCourse.jsx:22-27); canvases have none. Shape of learn-course.js:67.
    if (action === 'learn-course') return req.method === 'GET' ? json({ course: null, revision: 0, canAuthor: false }) : json({ error: 'Courses are not available on canvases' }, 405);
    if (action) {
      if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
      await db.prepare(`UPDATE canvases SET archived_at=${action === 'archive' ? "datetime('now')" : 'NULL'} WHERE id=?`).bind(app.id).run();
      return json(await ownedCanvas(env, user, name));
    }
    if (req.method === 'GET') return json(app);
    if (req.method === 'PATCH') {
      const title = canvasTitle((await req.json()).title);
      if (!title) throw Error('Title required');
      await db.prepare('UPDATE canvases SET title=? WHERE id=?').bind(title, app.id).run();
      return json({ ...app, title });
    }
    if (req.method === 'DELETE') {
      // Undo only while untouched (section 8.4). One statement, so a thread started meanwhile keeps the canvas.
      const { meta } = await db.prepare('DELETE FROM canvases WHERE id=? AND NOT EXISTS (SELECT 1 FROM threads WHERE org=? AND scope_ref=?)').bind(app.id, user.org, name).run();
      return meta.changes ? json({ ok: true }) : json({ error: 'This canvas has been used. Archive it instead.' }, 405);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) { return json({ error: error.message }, 400); }
}

// apiAsk's seam (index.js): the app, its context and the thread store all come from LEARN_DB,
// so a canvas turn writes nothing to live D1. It still reads live D1 for @-mentioned apps
// (apiAsk appForUser, appContext). Threads reuse repository-schema.sql threads/messages.
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
