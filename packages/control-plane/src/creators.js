// Public creator profiles (docs/features/creator-profile.md, owner 2026-10-06 #63): /@handle, Explore's creator row and
// creator search. Public data, readable signed out. Identity is read by reference - user_handles.handle, user_profiles.name
// and avatar - and never copied; the explainers are the creator's part of the published set Explore lists
// (learn-boards.js PUBLISHED). Never an email, an id, or anything of a private, unlisted, archived, nested or trashed
// canvas. Anyone becomes a creator by publishing (owner rule): there is no creator record, only these reads.
import { FORK_COUNT, NAME_OF } from './canvases.js';
import { EXPLORE_LIMIT, PUBLISHED, PUBLISHED_CARDS, exploreCard, likeOf, searchTerm } from './learn-boards.js';

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
  (SELECT up.updated_at FROM user_profiles up WHERE up.email = h.email) AS since`;
const creator = r => ({ handle: r.handle, name: r.name ?? null, avatar: avatarUrl(r), explainer_count: r.explainers, url: `/@${r.handle}` });

// /@handle: who, their public explainer count and canonical forks (Σ FORK_COUNT over those explainers only), and the
// explainers on Explore's card. A handle with no live publication still resolves, with none (brief: the profile is
// never deleted); an unknown handle is a 404. Learners are not shown: they are not collected (#62 storage awaits GO).
async function profile(env, handle, sort) {
  if (!Object.hasOwn(SORTS, sort)) return json({ error: 'Sort a profile by newest or forks' }, 400);
  const who = await env.LEARN_DB.prepare(`SELECT ${IDENTITY} FROM user_handles h WHERE h.handle = ?`).bind(handle).first();
  if (!who) return json({ error: `No creator @${handle.toLowerCase()}` }, 404);
  const totals = await env.LEARN_DB.prepare(`SELECT count(*) AS n, COALESCE(sum(fork_count), 0) AS forks FROM (SELECT ${FORK_COUNT} AS fork_count ${PUBLISHED} AND h.handle = ?)`).bind(who.handle).first();
  const { results } = await env.LEARN_DB.prepare(`${PUBLISHED_CARDS} ${PUBLISHED} AND h.handle = ? ORDER BY ${SORTS[sort]}, p.rowid DESC LIMIT ${EXPLORE_LIMIT}`).bind(who.handle).all();
  return json({ handle: who.handle, name: who.name ?? null, avatar: avatarUrl(who), explainer_count: totals.n, fork_count: totals.forks, explainers: results.map(exploreCard) });
}

// Explore's "Creators to explore" (no q) and creator search (q): only people with at least one live publication, so a
// creator with none drops out of discovery while their profile still resolves. Discovery is by latest publication -
// no ranking, as Explore. Search matches the @handle or display name, never an email; an exact @handle comes first.
async function creators(env, q) {
  const term = searchTerm(q);
  const where = term ? `AND (h.handle LIKE ?1 ESCAPE '\\' OR ${NAME_OF('h.email')} LIKE ?1 ESCAPE '\\')` : '';
  const exact = term ? `h.handle = ?2 DESC, h.handle LIKE ?3 ESCAPE '\\' DESC,` : '';
  const { results } = await env.LEARN_DB.prepare(`SELECT ${IDENTITY}, count(*) AS explainers, max(p.published_at) AS latest ${PUBLISHED} ${where}
    GROUP BY h.handle ORDER BY ${exact} latest DESC, max(p.rowid) DESC LIMIT ${DISCOVER}`).bind(...(term ? [likeOf(term), term.toLowerCase(), `${likeOf(term).slice(1)}`] : [])).all();
  return json({ creators: results.map(creator) });
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
  const one = path.match(/^\/api\/learn\/creators\/([^/]+)(\/avatar)?$/);
  if (!one || !HANDLE.test(one[1])) return json({ error: 'No such creator' }, 404);
  return one[2] ? avatar(env, one[1]) : profile(env, one[1], url.searchParams.get('sort') || 'newest');
}
