// Header provenance (C:/s/spec/hdr-provenance.md, owner decisions 1A-4A): the canvas header's repository button and fork
// history, computed here for the current viewer on every page kind, so a browser never receives what it may not show.
//   GET /api/learn/provenance/apps/<name>     the owner's own canvas or repository Main canvas
//   GET /api/learn/provenance/c/<board id>    a canvas shared with you as a member
//   GET /api/learn/provenance/link/<token>    a share link (/b) or an Explore publication (/e), signed out included
// Body: { repository: null | { label, url }, fork: null | { ancestors, complete, original } }. No capabilities: branch,
// commit, status and Refresh/Retry stay on the owner-only /api/repositories API.
import { repositoryIdentity } from './repositories.js';
import { NOT_TRASHED } from './library-trash.js';
import { boardRevision } from './learn-shared-ask.js';
import { NO_TRASHED_ANCESTOR, linkSource, linkTarget, sharedAccess } from './learn-boards.js';

export const MAX_ANCESTORS = 25;
const CANVAS = /^canvas-[a-f0-9]{8}$/;
const APP = /^(?:canvas-[a-f0-9]{8}|repo-[a-z0-9-]{1,80})$/;
const BOARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const notFound = () => reply({ error: 'Not found' }, 404);

const repositoryOf = repo => (repo && REPO.test(repo) ? { label: repo, url: `https://github.com/${repo}` } : null);
// Owner and member pages: the board's repository (its project, or the revision it inherited as a fork) only when it is
// confirmed public or the viewer owns it. Unknown visibility is private.
async function boardRepository(db, board, viewer) {
  const revision = board && await boardRevision(db, board);
  const repo = revision && await db.prepare('SELECT r.repo, r.owner_email, v.visibility FROM repository_apps r LEFT JOIN repository_visibility v ON v.app_id = r.id WHERE r.id = ?').bind(revision.id).first();
  return repo && (repo.visibility === 'public' || repo.owner_email === viewer?.email) ? repositoryOf(repo.repo) : null;
}

// The one permission resolver for a recorded parent (the header's history here, the Library card's "Forked from" through
// canvases.js): many parents in one query, for this viewer. A canvas opens at their own /apps, as an active member of a live
// canvas at /c/<board id>, through its live publication at /e (public), or through a share link at /b - only the link this
// viewer forked through themselves (the fork row's own token, they own that fork row) while it is still live: a share link is
// a capability, so a link they never held, a newer one included, is never handed out (owner decision 1A). Liveness follows
// the share and publication routes (learn-boards.js sharedRow). Each parent becomes { state: 'accessible', title, url, handle }
// (handle: its owner's public handle, or null), { state: 'private' } (nothing else), or { state: 'unavailable' } (no such
// canvas). `parents`: [{ org, name, share, forker: { org, email } }] as one canvas_forks row records them.
// A function, read at call time: canvases.js loads this module lazily, and the helpers it names come from modules it imports.
const SOURCES = () => `WITH p(org, name) AS (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?1))
  SELECT c.org, c.name, c.title, c.owner_email, (SELECT uh.handle FROM user_handles uh WHERE uh.email = c.owner_email) AS handle, b.id AS board_id,
    (b.id IS NOT NULL AND ${NOT_TRASHED('c.org', 'c.name')} AND EXISTS (SELECT 1 FROM canvas_members m WHERE m.org = c.org AND m.canvas = c.name AND m.member_user_id = ?2 AND m.status = 'active')) AS member,
    CASE WHEN b.shared = 1 AND b.view_token IS NOT NULL AND (?3 OR b.public_view = 1) AND ${NO_TRASHED_ANCESTOR} THEN b.view_token END AS share_token,
    CASE WHEN b.id IS NOT NULL AND c.archived_at IS NULL AND ${NOT_TRASHED('c.org', 'c.name')} THEN pub.token END AS publication
  FROM p JOIN canvases c ON c.org = p.org AND c.name = p.name
  LEFT JOIN learn_boards b ON b.org = c.org AND b.owner_email = c.owner_email AND b.app = c.name AND b.board = 'main'
  LEFT JOIN canvas_publications pub ON pub.org = c.org AND pub.canvas = c.name`;
const key = (org, name) => `${org}\u0000${name}`;
const forkedIt = (parent, viewer) => !!viewer && viewer.org === parent.forker?.org && viewer.email === parent.forker?.email;
export async function sourceAccess(env, parents, viewer) {
  const canvases = parents.filter(parent => parent.name);
  const found = new Map();
  if (canvases.length) {
    const { results } = await env.LEARN_DB.prepare(SOURCES()).bind(JSON.stringify(canvases.map(parent => [parent.org, parent.name])), viewer?.userId ?? null, viewer ? 1 : 0).all();
    for (const row of results) found.set(key(row.org, row.name), row);
  }
  return Promise.all(parents.map(async parent => {
    // A parent that is not a canvas (a share of a repository's Main board): its link while it is live and admits the viewer.
    // ponytail: one lookup per such parent (rare: forks of a project's shared Main board); batch it if a Library holds many.
    if (!parent.name) {
      const link = parent.share && await linkTarget(env, parent.share, !!viewer);
      if (!link) return { state: 'unavailable' };
      return link.url.startsWith('/e/') || forkedIt(parent, viewer) ? { state: 'accessible', title: link.title, url: link.url, handle: null } : { state: 'private' };
    }
    const row = found.get(key(parent.org, parent.name));
    if (!row) return { state: 'unavailable' };
    const url = viewer && viewer.org === row.org && viewer.email === row.owner_email ? `/apps/${row.name}`
      : viewer?.userId && row.member ? `/c/${row.board_id}`
      : row.publication ? `/e/${row.publication}`
      : row.share_token && row.share_token === parent.share && forkedIt(parent, viewer) ? `/b/${row.share_token}` : null;
    return url ? { state: 'accessible', title: row.title, url, handle: row.handle ?? null } : { state: 'private' };
  }));
}

// The recorded parent chain (canvas_forks), never invented: [0] is the immediate source. Stops at a canvas with no fork row
// (complete), a missing record (unavailable), a repeat (cycle) or MAX_ANCESTORS; the last three leave it incomplete.
export async function forkHistory(env, start, viewer) {
  const db = env.LEARN_DB;
  const own = await db.prepare('SELECT org, owner_email, forked_from_org, forked_from_canvas_id, forked_from_share, root_org, root_canvas_id FROM canvas_forks WHERE org = ? AND canvas = ?').bind(start.org, start.name).first();
  if (!own) return null;
  const ancestors = [], seen = new Set([key(start.org, start.name)]);
  let step = own, complete = false, top = null;
  while (ancestors.length < MAX_ANCESTORS) {
    // A parent that is not a canvas (a share of a repository's Main board) has no lineage of its own: the walk ends there.
    const parent = { org: step.forked_from_org, name: step.forked_from_canvas_id, share: step.forked_from_share, forker: { org: step.org, email: step.owner_email } };
    if (parent.name && seen.has(key(parent.org, parent.name))) break;
    // The header's ancestor is exactly C1's: state, and title and url when accessible - no owner handle.
    const [{ handle: _owner, ...ancestor }] = await sourceAccess(env, [parent], viewer);
    ancestors.push(ancestor);
    // A parent that is not a canvas has no lineage of its own: the walk ends there.
    if (!parent.name) { complete = true; break; }
    if (ancestor.state === 'unavailable') break;
    seen.add(key(parent.org, parent.name));
    step = await db.prepare('SELECT org, owner_email, forked_from_org, forked_from_canvas_id, forked_from_share FROM canvas_forks WHERE org = ? AND canvas = ?').bind(parent.org, parent.name).first();
    if (!step) { complete = true; top = parent; break; }
  }
  // The original only when the walk ended at a canvas with no parent and that canvas is the root the fork recorded.
  return { ancestors, complete, original: !!top && own.root_org === top.org && own.root_canvas_id === top.name };
}

async function signedIn(req, env) {
  const user = await repositoryIdentity(req, env);
  return user instanceof Response ? null : user;
}

async function ownerPage(req, env, name) {
  if (!APP.test(name)) return notFound();
  const viewer = await repositoryIdentity(req, env);
  if (viewer instanceof Response) return viewer.status === 401 ? reply({ error: 'Sign in to open this canvas.', signIn: true }, 401) : viewer;
  const db = env.LEARN_DB;
  const owned = CANVAS.test(name)
    ? await db.prepare('SELECT 1 FROM canvases WHERE org = ? AND name = ? AND owner_email = ?').bind(viewer.org, name, viewer.email).first()
    : await db.prepare('SELECT 1 FROM repository_apps WHERE org = ? AND name = ? AND owner_email = ?').bind(viewer.org, name, viewer.email).first();
  if (!owned) return notFound();
  const board = await db.prepare("SELECT id FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = 'main'").bind(viewer.org, viewer.email, name).first();
  return reply({
    repository: await boardRepository(db, { id: board?.id, org: viewer.org, app: name, owner_email: viewer.email }, viewer),
    fork: CANVAS.test(name) ? await forkHistory(env, { org: viewer.org, name }, viewer) : null,
  });
}

async function memberPage(req, env, boardId) {
  if (!BOARD_ID.test(boardId)) return notFound();
  const viewer = await repositoryIdentity(req, env);
  if (viewer instanceof Response) return viewer.status === 401 ? reply({ error: 'Sign in to open this canvas.', signIn: true }, 401) : viewer;
  const db = env.LEARN_DB;
  const board = await db.prepare(`SELECT b.id, b.org, b.app, b.owner_email, NOT ${NOT_TRASHED('c.org', 'c.name')} AS trashed FROM learn_boards b
    JOIN canvases c ON c.org = b.org AND c.name = b.app AND c.owner_email = b.owner_email WHERE b.id = ? AND b.board = 'main'`).bind(boardId).first();
  if (!board) return notFound();
  const owner = viewer.email === board.owner_email;
  const member = !owner && !!viewer.userId && !board.trashed && !!await db.prepare("SELECT 1 FROM canvas_members WHERE org = ? AND canvas = ? AND member_user_id = ? AND status = 'active'").bind(board.org, board.app, viewer.userId).first();
  if (!owner && !member) return notFound();
  return reply({ repository: await boardRepository(db, board, viewer), fork: await forkHistory(env, { org: board.org, name: board.app }, viewer) });
}

async function linkPage(req, env, token) {
  const found = await sharedAccess(req, env, token);
  if (found instanceof Response) return found.status === 404 ? notFound() : found;
  const viewer = found.viewer || await signedIn(req, env);
  const source = await linkSource(env.LEARN_DB, found);
  return reply({
    repository: source?.allowed ? repositoryOf(source.repo) : null,
    fork: CANVAS.test(found.row.app) && found.row.board === 'main' ? await forkHistory(env, { org: found.row.org, name: found.row.app }, viewer) : null,
  });
}

export async function provenanceRoute(path, req, env) {
  const match = path.match(/^\/api\/learn\/provenance\/(apps|c|link)\/([^/]+)$/);
  if (!match) return null;
  if (!env.LEARN_DB) return reply({ error: 'Provenance needs the Learn database on this worker.' }, 503);
  if (req.method !== 'GET') return reply({ error: 'Method not allowed' }, 405);
  let key;
  try { key = decodeURIComponent(match[2]); } catch { return notFound(); }
  return match[1] === 'apps' ? ownerPage(req, env, key) : match[1] === 'c' ? memberPage(req, env, key) : linkPage(req, env, key);
}
