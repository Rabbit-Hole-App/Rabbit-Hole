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
import { linkSource, linkTarget, sharedAccess } from './learn-boards.js';

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

// Where this viewer may open a canvas: their own, as a member, through its live share link, through its publication.
async function canvasUrl(env, canvas, viewer) {
  const db = env.LEARN_DB;
  if (viewer && viewer.org === canvas.org && viewer.email === canvas.owner_email) return `/apps/${canvas.name}`;
  const main = await db.prepare("SELECT id, shared, view_token FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = 'main'").bind(canvas.org, canvas.owner_email, canvas.name).first();
  if (main && viewer?.userId && !canvas.trashed && await db.prepare("SELECT 1 FROM canvas_members WHERE org = ? AND canvas = ? AND member_user_id = ? AND status = 'active'").bind(canvas.org, canvas.name, viewer.userId).first()) return `/c/${main.id}`;
  if (main?.shared && main.view_token) { const link = await linkTarget(env, main.view_token, !!viewer); if (link) return link.url; }
  const published = await db.prepare('SELECT token FROM canvas_publications WHERE org = ? AND canvas = ?').bind(canvas.org, canvas.name).first();
  if (published) { const link = await linkTarget(env, published.token, !!viewer); if (link) return link.url; }
  return null;
}

// The recorded parent chain (canvas_forks), never invented: [0] is the immediate source. Stops at a canvas with no fork row
// (complete), a missing record (unavailable), a repeat (cycle) or MAX_ANCESTORS; the last three leave it incomplete.
export async function forkHistory(env, start, viewer) {
  const db = env.LEARN_DB, key = (org, name) => `${org}\u0000${name}`;
  const own = await db.prepare('SELECT forked_from_org, forked_from_canvas_id, forked_from_share, root_org, root_canvas_id FROM canvas_forks WHERE org = ? AND canvas = ?').bind(start.org, start.name).first();
  if (!own) return null;
  const ancestors = [], seen = new Set([key(start.org, start.name)]);
  let step = own, complete = false, top = null;
  while (ancestors.length < MAX_ANCESTORS) {
    // A parent that is not a canvas (a share of a repository's Main board) has no lineage of its own: the walk ends there.
    if (!step.forked_from_canvas_id) {
      const link = step.forked_from_share && await linkTarget(env, step.forked_from_share, !!viewer);
      ancestors.push(link ? { state: 'accessible', title: link.title, url: link.url } : { state: 'unavailable' });
      complete = true;
      break;
    }
    const at = key(step.forked_from_org, step.forked_from_canvas_id);
    if (seen.has(at)) break;
    seen.add(at);
    const canvas = await db.prepare(`SELECT c.org, c.name, c.title, c.owner_email, NOT ${NOT_TRASHED('c.org', 'c.name')} AS trashed FROM canvases c WHERE c.org = ? AND c.name = ?`).bind(step.forked_from_org, step.forked_from_canvas_id).first();
    if (!canvas) { ancestors.push({ state: 'unavailable' }); break; }
    const url = await canvasUrl(env, canvas, viewer);
    ancestors.push(url ? { state: 'accessible', title: canvas.title, url } : { state: 'private' });
    step = await db.prepare('SELECT forked_from_org, forked_from_canvas_id, forked_from_share FROM canvas_forks WHERE org = ? AND canvas = ?').bind(canvas.org, canvas.name).first();
    if (!step) { complete = true; top = canvas; break; }
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
