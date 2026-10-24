// Public creator profiles (docs/features/creator-profile.md, owner 2026-10-06 #63): /@handle, Explore's creator row and
// creator search. Public data, readable signed out. Identity is read by reference - user_handles.handle, user_profiles.name
// and avatar, user_profile_descriptions.description - and never copied; the explainers are the creator's part of the
// published set Explore lists (learn-boards.js PUBLISHED). Never an email, an id, or anything of a private, unlisted,
// archived, nested or trashed canvas. Anyone becomes a creator by publishing (owner rule): there is no creator record,
// only these reads.
import { FORK_COUNT, NAME_OF } from './canvases.js';
import { EXPLORE_LIMIT, PUBLISHED, PUBLISHED_CARDS, exploreCard, likeOf, searchTerm } from './learn-boards.js';
import { PAGE, MAX_PAGE } from './canvas-stars-list.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
// A handle as a URL may carry it, any case (handles compare case-insensitively: user_handles is COLLATE NOCASE).
const HANDLE = /^[A-Za-z0-9_]{1,40}$/;
// The profile's sorts (brief §SORTING): Newest and Most forked. No "Most learned": learner counts are not collected.
const SORTS = { newest: 'p.published_at DESC', forks: 'fork_count DESC, p.published_at DESC' };
const DISCOVER = 8;
// The avatar is served by its own URL, never inlined in a list: a picture is up to 200k characters (profile.js).
// `v` changes when the profile does, so a new picture shows at once.
const avatarUrl = r => (r.has_avatar ? `/api/learn/creators/${r.handle}/avatar?v=${encodeURIComponent(r.since || '')}` : null);
const IDENTITY = `h.handle, ${NAME_OF('h.email')} AS name, (SELECT up.avatar IS NOT NULL FROM user_profiles up WHERE up.email = h.email) AS has_avatar,
  (SELECT up.updated_at FROM user_profiles up WHERE up.email = h.email) AS since,
  (SELECT d.description FROM user_profile_descriptions d WHERE d.email = h.email) AS description`;
// A creator card's counts (owner 2026-10-08: "the number of Projects and Canvas") are of what any viewer can see: their
// published canvases (the explainers) and the projects those cards name - PUBLISHED's `r`, a repository confirmed public
// and not in Trash. Never a private, unlisted or trashed canvas or project.
const COUNTS = 'count(*) AS explainers, count(DISTINCT r.id) AS projects';
const creator = r => ({ handle: r.handle, name: r.name ?? null, avatar: avatarUrl(r), description: r.description ?? null, explainer_count: r.explainers, project_count: r.projects, url: `/@${r.handle}` });

// /@handle: who, their public explainer count and canonical forks (Σ FORK_COUNT over those explainers only), and the
// explainers on Explore's card. A handle with no live publication still resolves, with none (brief: the profile is
// never deleted); an unknown handle is a 404. Learners are not shown: they are not collected (#62 storage awaits GO).
// `q` (owner 2026-10-08: "search projects or canvas by name for that specific creator") narrows the explainers to those
// whose title or public project (PUBLISHED's `r`: a repository confirmed public) contains it, any case, wildcards
// escaped - on the server, since the list is capped at EXPLORE_LIMIT. The counters stay the creator's totals.
async function profile(env, handle, sort, q) {
  if (!Object.hasOwn(SORTS, sort)) return json({ error: 'Sort a profile by newest or forks' }, 400);
  const who = await env.LEARN_DB.prepare(`SELECT ${IDENTITY} FROM user_handles h WHERE h.handle = ?`).bind(handle).first();
  if (!who) return json({ error: `No creator @${handle.toLowerCase()}` }, 404);
  const totals = await env.LEARN_DB.prepare(`SELECT count(*) AS n, COALESCE(sum(fork_count), 0) AS forks FROM (SELECT ${FORK_COUNT} AS fork_count ${PUBLISHED} AND h.handle = ?)`).bind(who.handle).first();
  const term = searchTerm(q);
  const match = term ? `AND (c.title LIKE ? ESCAPE '\\' OR r.repo LIKE ? ESCAPE '\\')` : '';
  const { results } = await env.LEARN_DB.prepare(`${PUBLISHED_CARDS} ${PUBLISHED} AND h.handle = ? ${match} ORDER BY ${SORTS[sort]}, p.rowid DESC LIMIT ${EXPLORE_LIMIT}`)
    .bind(who.handle, ...(term ? [likeOf(term), likeOf(term)] : [])).all();
  return json({ handle: who.handle, name: who.name ?? null, avatar: avatarUrl(who), description: who.description ?? null, explainer_count: totals.n, fork_count: totals.forks, starred_count: await starredCount(env, who.handle), explainers: results.map(exploreCard) });
}

// The Stars tab (docs/features/stars.md, brief Task 8): the canvases this person has starred that are public right now - the same
// PUBLISHED set Explore lists, so a private, unlisted, archived, nested or trashed canvas is filtered out BEFORE the count and the
// page, and a canvas that turns private drops out of both at once (the star is kept and returns with it). It includes their own
// public canvases, each card with its actual creator. A handle with no publication still has one; nothing is published by
// starring. Public data and the same for every viewer: no viewer state, signed out or in. The count is "public canvases this
// person has starred" - not a canvas's star_count, and not the owner's private total.
// `s` below is the stars of the profile's person only, by their principal (user_handles.email), never a request value.
const starredBy = (extra = '') => `EXISTS (SELECT 1 FROM canvas_stars s WHERE s.org = c.org AND s.canvas = c.name AND s.user_email = (SELECT uh.email FROM user_handles uh WHERE uh.handle = ?1) ${extra})`;
async function starredCount(env, handle) {
  return (await env.LEARN_DB.prepare(`SELECT count(*) AS n ${PUBLISHED} AND ${starredBy()}`).bind(handle).first()).n;
}
const STAR_CURSOR = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\|([0-9a-f]{32})$/;
async function profileStars(env, handle, params) {
  const who = await env.LEARN_DB.prepare('SELECT h.handle FROM user_handles h WHERE h.handle = ?').bind(handle).first();
  if (!who) return json({ error: `No creator @${handle.toLowerCase()}` }, 404);
  const limit = params.get('limit') === null ? PAGE : Number(params.get('limit'));
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) return json({ error: `Use a limit from 1 to ${MAX_PAGE}` }, 400);
  const cursor = params.get('cursor') === null ? null : params.get('cursor').match(STAR_CURSOR);
  if (params.get('cursor') !== null && !cursor) return json({ error: 'Use the cursor a previous page returned' }, 400);
  const term = searchTerm(params.get('q')), binds = [who.handle];
  if (term) binds.push(likeOf(term));
  const match = term ? `AND (c.title LIKE ?${binds.length} ESCAPE '\\' OR m.description LIKE ?${binds.length} ESCAPE '\\' OR h.handle LIKE ?${binds.length} ESCAPE '\\')` : '';
  if (cursor) binds.push(cursor[1], cursor[2]);
  const before = cursor ? `AND (s.created_at, s.id) < (?${binds.length - 1}, ?${binds.length})` : '';
  const mine = 'FROM canvas_stars s WHERE s.org = c.org AND s.canvas = c.name AND s.user_email = (SELECT uh.email FROM user_handles uh WHERE uh.handle = ?1)';
  const { results } = await env.LEARN_DB.prepare(`${PUBLISHED_CARDS}, (SELECT s.created_at ${mine}) AS starred_at, (SELECT s.id ${mine}) AS star_id ${PUBLISHED} AND ${starredBy(before)} ${match}
    ORDER BY starred_at DESC, star_id DESC LIMIT ${limit + 1}`).bind(...binds).all();
  const page = results.slice(0, limit);
  return json({ handle: who.handle, starred_count: await starredCount(env, who.handle), starred: page.map(exploreCard),
    next_cursor: results.length > limit ? `${page.at(-1).starred_at}|${page.at(-1).star_id}` : null });
}

// Explore's "Creators to explore" (no q) and creator search (q): only people with at least one live publication, so a
// creator with none drops out of discovery while their profile still resolves. Discovery is by latest publication -
// no ranking, as Explore. Search matches the @handle or display name, never an email; an exact @handle comes first.
async function creators(env, q) {
  const term = searchTerm(q);
  const where = term ? `AND (h.handle LIKE ?1 ESCAPE '\\' OR ${NAME_OF('h.email')} LIKE ?1 ESCAPE '\\')` : '';
  const exact = term ? `h.handle = ?2 DESC, h.handle LIKE ?3 ESCAPE '\\' DESC,` : '';
  const { results } = await env.LEARN_DB.prepare(`SELECT ${IDENTITY}, ${COUNTS}, max(p.published_at) AS latest ${PUBLISHED} ${where}
    GROUP BY h.handle ORDER BY ${exact} latest DESC, max(p.rowid) DESC LIMIT ${DISCOVER}`).bind(...(term ? [likeOf(term), term.toLowerCase(), `${likeOf(term).slice(1)}`] : [])).all();
  // `total`: every matching creator, past the DISCOVER cap - Explore shows the matching count (owner brief 2026-10-23).
  const { n } = await env.LEARN_DB.prepare(`SELECT count(DISTINCT h.handle) AS n ${PUBLISHED} ${where}`).bind(...(term ? [likeOf(term)] : [])).first();
  return json({ creators: results.map(creator), total: n });
}

// Creator chips for these handles, in their order (Explore's AI find, explore-find.js): only people with a live publication,
// on the same chip as discovery and search.
export async function creatorsByHandle(env, handles) {
  if (!handles.length) return [];
  const { results } = await env.LEARN_DB.prepare(`SELECT ${IDENTITY}, ${COUNTS} ${PUBLISHED} AND h.handle IN (${handles.map(() => '?').join(', ')}) GROUP BY h.handle`).bind(...handles).all();
  const found = new Map(results.map(r => [r.handle.toLowerCase(), creator(r)]));
  return handles.map(handle => found.get(handle.toLowerCase())).filter(Boolean);
}

// The picture itself: a PNG data URL as profile.js validated it, sent as bytes.
async function avatar(env, handle) {
  const row = await env.LEARN_DB.prepare('SELECT up.avatar FROM user_handles h JOIN user_profiles up ON up.email = h.email WHERE h.handle = ?').bind(handle).first();
  const data = row?.avatar?.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!data) return json({ error: 'No picture' }, 404);
  return new Response(Uint8Array.from(atob(data[1]), c => c.charCodeAt(0)), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
}

export async function creatorsRoute(path, req, env) {
  if (!path.startsWith('/api/learn/creators')) return null;
  if (!env.LEARN_DB) return json({ error: 'Creator profiles need the Learn database on this worker.' }, 503);
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const url = new URL(req.url);
  if (path === '/api/learn/creators') return creators(env, url.searchParams.get('q'));
  const one = path.match(/^\/api\/learn\/creators\/([^/]+)(\/avatar|\/stars)?$/);
  if (!one || !HANDLE.test(one[1])) return json({ error: 'No such creator' }, 404);
  if (one[2] === '/stars') return profileStars(env, one[1], url.searchParams);
  return one[2] ? avatar(env, one[1]) : profile(env, one[1], url.searchParams.get('sort') || 'newest', url.searchParams.get('q'));
}
