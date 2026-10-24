// Weekly Top 5 canvases and creators for Explore (docs/features/explore-weekly-top.md; owner brief 2026-10-23). Public, read-only,
// no AI. Ranks the stars and direct forks first recorded in the current Monday-to-Monday Los Angeles week, among canvases that are
// PUBLISHED (learn-boards.js) right now. Stars come from the append-only canvas_star_events (migration 0028), forks from
// canvas_forks (0004); indexes in 0029. Imports learn-boards.js, which loads this file lazily (as explore-find.js).
import { NAME_OF } from './canvases.js';
import { PUBLISHED } from './learn-boards.js';
import { avatarUrl } from './creators.js';

export const RANKING_VERSION = 'weekly-top-v1';
export const ZONE = 'America/Los_Angeles';
const TOP = 5, MAX_AGE_SECONDS = 60;
const EMPTY = { canvases: 'No canvases have earned stars or forks yet this week.', creators: 'No creators have earned stars or forks yet this week.' };
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const zoneParts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
const partsOf = ms => Object.fromEntries(zoneParts.formatToParts(ms).map(p => [p.type, p.value]));
// The zone's offset from UTC at an instant, in ms (negative west of Greenwich).
const offsetAt = ms => { const p = partsOf(ms); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000; };
// The UTC instant at which the Los Angeles wall clock reads 00:00 on calendar day (y, m, d). Two passes settle the offset; a
// change of offset never falls on a midnight (US changes are Sunday 02:00), so the answer is exact.
const localMidnight = (y, m, d) => { const wall = Date.UTC(y, m - 1, d); let utc = wall - offsetAt(wall); utc = wall - offsetAt(utc); return utc; };
const day = ms => new Date(ms).toISOString().slice(0, 10);

// The Monday-to-Monday week that contains `now` (ms): start inclusive, end exclusive, as UTC instants plus the local dates.
export function weekOf(now) {
  const p = partsOf(now), sinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
  const monday = Date.UTC(+p.year, +p.month - 1, +p.day - sinceMonday), next = monday + 7 * 86400000;
  const [m0, m1] = [new Date(monday), new Date(next)];
  return { start: localMidnight(m0.getUTCFullYear(), m0.getUTCMonth() + 1, m0.getUTCDate()), end: localMidnight(m1.getUTCFullYear(), m1.getUTCMonth() + 1, m1.getUTCDate()), startLocal: day(monday), endLocal: day(next) };
}

// Star times are UTC 'YYYY-MM-DD HH:MM:SS.fff' (the migration default); fork times are JavaScript ISO strings.
const starTime = ms => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
const isoTime = ms => new Date(ms).toISOString();

// A qualifying star: the person's FIRST 'added' event on the canvas falls in the week (so remove and re-add never makes a new
// one), they are not the owner, and the star is still held. A qualifying fork: a direct fork whose actor's EARLIEST fork row of
// that source (rows of deleted forks are never removed) falls in the week, the actor is not the source's owner, and the actor
// still has a fork canvas of it. Params: ?1 ?2 star window, ?3 ?4 fork window. Rows are (org, canvas, actor, kind 's' or 'f').
const ACTIVITY = `SELECT e.org, e.canvas, e.user_id AS actor, 's' AS kind FROM canvas_star_events e
    WHERE e.kind = 'added' AND e.owner_star = 0 AND e.at >= ?1 AND e.at < ?2
      AND NOT EXISTS (SELECT 1 FROM canvas_star_events o WHERE o.org = e.org AND o.canvas = e.canvas AND o.user_id = e.user_id AND o.kind = 'added' AND o.at < ?1)
      AND EXISTS (SELECT 1 FROM canvas_stars s WHERE s.org = e.org AND s.canvas = e.canvas AND s.user_id = e.user_id)
    GROUP BY e.org, e.canvas, e.user_id
  UNION ALL
  SELECT f.forked_from_org, f.forked_from_canvas_id, f.owner_email, 'f' FROM canvas_forks f
    WHERE f.forked_at >= ?3 AND f.forked_at < ?4 AND f.forked_from_canvas_id IS NOT NULL
      AND f.owner_email <> (SELECT sc.owner_email FROM canvases sc WHERE sc.org = f.forked_from_org AND sc.name = f.forked_from_canvas_id)
      AND NOT EXISTS (SELECT 1 FROM canvas_forks o WHERE o.forked_from_org = f.forked_from_org AND o.forked_from_canvas_id = f.forked_from_canvas_id AND o.owner_email = f.owner_email AND o.forked_at < ?3)
      AND EXISTS (SELECT 1 FROM canvas_forks l JOIN canvases lc ON lc.org = l.org AND lc.name = l.canvas WHERE l.forked_from_org = f.forked_from_org AND l.forked_from_canvas_id = f.forked_from_canvas_id AND l.owner_email = f.owner_email)
    GROUP BY f.forked_from_org, f.forked_from_canvas_id, f.owner_email`;
const COUNTS = "count(DISTINCT CASE WHEN a.kind = 's' THEN a.actor END) AS stars, count(DISTINCT CASE WHEN a.kind = 'f' THEN a.actor END) AS forks";
// Eligibility is applied to the activity before it is aggregated, so a creator's numbers count only canvases that are public now.
// ponytail: the week's activity is aggregated per request on a cache miss; add a counter or a summary table when a week holds
// tens of thousands of stars (measure first, brief 8.6).
const CANVAS_RANK = `SELECT a.org, a.canvas, ${COUNTS} FROM (${ACTIVITY}) a
  WHERE EXISTS (SELECT 1 ${PUBLISHED} AND c.org = a.org AND c.name = a.canvas)
  GROUP BY a.org, a.canvas ORDER BY stars DESC, forks DESC, a.org, a.canvas LIMIT ${TOP}`;
const CREATOR_RANK = `SELECT ac.owner_email AS owner, ${COUNTS}, group_concat(DISTINCT ac.org || '/' || ac.name) AS contributing
  FROM (${ACTIVITY}) a JOIN canvases ac ON ac.org = a.org AND ac.name = a.canvas
  WHERE EXISTS (SELECT 1 ${PUBLISHED} AND c.org = a.org AND c.name = a.canvas)
  GROUP BY ac.owner_email ORDER BY stars DESC, forks DESC, ac.owner_email LIMIT ${TOP}`;

const marks = n => Array.from({ length: n }, () => '?').join(', ');

// Compute the answer for the week of `now`, plus every canvas that contributes to it (the cache revalidates their eligibility).
async function compute(db, now) {
  const week = weekOf(now), binds = [starTime(week.start), starTime(week.end), isoTime(week.start), isoTime(week.end)];
  const [top, people, since] = await Promise.all([
    db.prepare(CANVAS_RANK).bind(...binds).all(),
    db.prepare(CREATOR_RANK).bind(...binds).all(),
    db.prepare("SELECT min(at) AS at FROM canvas_star_events WHERE kind = 'added'").first(),
  ]);
  const keys = new Set(top.results.map(r => `${r.org}/${r.canvas}`));
  for (const r of people.results) for (const k of r.contributing.split(',')) keys.add(k);
  const canvasRows = top.results.length ? (await db.prepare(`SELECT p.token, c.org, c.name AS canvas, c.title, h.handle, ${NAME_OF('c.owner_email')} AS name ${PUBLISHED}
      AND c.org || '/' || c.name IN (${marks(top.results.length)})`).bind(...top.results.map(r => `${r.org}/${r.canvas}`)).all()).results : [];
  const shown = new Map(canvasRows.map(r => [`${r.org}/${r.canvas}`, r]));
  const creatorRows = people.results.length ? (await db.prepare(`SELECT h.email, h.handle, ${NAME_OF('h.email')} AS name,
      (SELECT up.avatar IS NOT NULL FROM user_profiles up WHERE up.email = h.email) AS has_avatar, (SELECT up.updated_at FROM user_profiles up WHERE up.email = h.email) AS since
      FROM user_handles h WHERE h.email IN (${marks(people.results.length)})`).bind(...people.results.map(r => r.owner)).all()).results : [];
  const who = new Map(creatorRows.map(r => [r.email, r]));
  // A canvas or creator that stopped being public between the two reads is left out, never shown.
  const canvases = top.results.filter(r => shown.has(`${r.org}/${r.canvas}`)).map((r, i) => {
    const c = shown.get(`${r.org}/${r.canvas}`);
    return { rank: i + 1, title: c.title, url: `/e/${c.token}`, thumbnail_url: `/api/learn/boards/published/${c.token}/thumbnail`,
      creator: { handle: c.handle, name: c.name ?? null, url: `/@${c.handle}` }, weekly_star_count: r.stars, weekly_fork_count: r.forks };
  });
  const creators = people.results.filter(r => who.has(r.owner)).map((r, i) => {
    const w = who.get(r.owner);
    return { rank: i + 1, handle: w.handle, name: w.name ?? null, url: `/@${w.handle}`, avatar_url: avatarUrl(w), weekly_star_supporter_count: r.stars, weekly_fork_supporter_count: r.forks };
  });
  const body = {
    ranking_version: RANKING_VERSION, timezone: ZONE, week_start: isoTime(week.start), week_end: isoTime(week.end), week_start_local: week.startLocal, week_end_local: week.endLocal,
    calculated_at: isoTime(now), freshness: { max_age_seconds: MAX_AGE_SECONDS },
    star_history_since: since?.at ? `${since.at.replace(' ', 'T')}Z` : null,
    canvases: { entries: canvases, empty_message: canvases.length ? null : EMPTY.canvases },
    creators: { entries: creators, empty_message: creators.length ? null : EMPTY.creators },
  };
  return { body, keys: [...keys], weekStart: week.start };
}

// How many of these canvases (org/name keys) are public right now. D1 allows 100 bound values, so chunks of 50.
async function stillPublic(db, keys) {
  let n = 0;
  for (let i = 0; i < keys.length; i += 50) {
    const part = keys.slice(i, i + 50);
    n += (await db.prepare(`SELECT count(*) AS n ${PUBLISHED} AND c.org || '/' || c.name IN (${marks(part.length)})`).bind(...part).first()).n;
  }
  return n;
}

// The answer is remembered per isolate for MAX_AGE_SECONDS (counts, order and titles may be that old). Eligibility is not: before
// every reuse the contributing canvases are checked against PUBLISHED, and if any left (unpublished, trashed, archived, deleted,
// owner lost the handle) the answer is recomputed, so nothing ineligible is returned until the cache expires. A newly public
// canvas or a new star appears within MAX_AGE_SECONDS.
let memo = null;
export const resetWeeklyTopCache = () => { memo = null; };

export async function weeklyTop(db, now = Date.now()) {
  if (memo && memo.db === db && memo.weekStart === weekOf(now).start && now >= memo.at && now - memo.at < MAX_AGE_SECONDS * 1000 && await stillPublic(db, memo.keys) === memo.keys.length) return memo.body;
  const fresh = await compute(db, now);
  memo = { ...fresh, db, at: now };
  return fresh.body;
}

export async function weeklyTopFetch(req, env) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'Weekly Top 5 is read with GET.', code: 'method_not_allowed' }, 405);
  if (!env.LEARN_DB) return json({ error: 'Weekly Top 5 needs the Learn database on this worker.', code: 'weekly_top_unavailable' }, 503);
  try { return json(await weeklyTop(env.LEARN_DB)); } catch { return json({ error: 'Weekly Top 5 could not be read.', code: 'weekly_top_failed' }, 500); }
}
