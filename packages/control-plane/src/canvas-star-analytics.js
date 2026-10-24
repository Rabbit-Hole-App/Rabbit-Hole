// Star analytics for a creator (docs/features/stars.md "Analytics", brief Task 9.4): GET /api/learn/stars/analytics?range=7d|30d|all.
// Aggregate only - no route returns a person. Scope: the creator's own canvases that are in Explore right now (the PUBLISHED
// predicate), the same set the rest of creator analytics speaks about (creator-analytics-contract.md "Scope"); a private canvas's
// stars are not in these numbers. Folding these fields into the creator analytics endpoint of the analytics lane is a call to
// starAnalytics, not a second dashboard.
//
// Definitions (returned with the numbers so a screen never has to guess):
//   current stars     - relationships that exist now (canvas_stars, authoritative). Not a sum of history.
//   additions         - successful transitions to starred in the range (canvas_star_events 'added'), gross actions. A person who
//                       unstars and stars again counts twice here; unique_users counts them once.
//   voluntary removals- transitions to unstarred by the person. Removals by the system (its canvas was deleted) are 'lifecycle' and
//                       are not in this scope (the canvas is gone) nor in net_change.
//   net_change        - additions minus voluntary removals, gross actions. It is not the change in current stars.
//   owner / others    - the creator starring their own canvas, against everyone else.
// History starts when the first event was recorded (collection_started_at). Before it nothing was collected, which is not zero:
// a range that begins earlier is marked partial, and with no event yet every period figure is null, not 0.
import { PUBLISHED } from './learn-boards.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const RANGES = { '7d': '-7 days', '30d': '-30 days', all: null };
export const DEFINITIONS = Object.freeze({
  current_stars: 'Stars that exist now on your published canvases (not a sum of history).',
  additions: 'Times someone starred one of your published canvases in the range (gross actions; unique_users counts each person once).',
  voluntary_removals: 'Times someone removed their star in the range (gross actions). Removals caused by deleting a canvas are not counted.',
  net_change: 'Additions minus voluntary removals in the range (gross actions; not the change in current stars).',
  owner_vs_others: 'Stars from you on your own canvases, against stars from everyone else.',
  opens_from_stars: 'Opens of your canvases from someone\'s Stars page or a profile Stars tab. Not collected yet.',
});
const NOT_COLLECTED = Object.freeze({ value: null, reason: 'not_collected' });

export async function starAnalytics(db, viewer, range) {
  if (!Object.hasOwn(RANGES, range)) return json({ error: 'Use a range of 7d, 30d or all' }, 400);
  const mine = `${PUBLISHED} AND c.owner_email = ?1 AND c.org = ?2`; // ?1 the creator's principal, ?2 their workspace
  const sinceAt = RANGES[range] ? (await db.prepare("SELECT strftime('%Y-%m-%d %H:%M:%f', 'now', ?) AS t").bind(RANGES[range]).first()).t : null;
  const inRange = sinceAt ? 'AND e.at >= ?3' : '';
  const binds = [viewer.email, viewer.org, ...(sinceAt ? [sinceAt] : [])];
  const { results: canvases } = await db.prepare(`SELECT c.org, c.name AS canvas, c.title, p.token,
      (SELECT count(*) FROM canvas_stars s WHERE s.org = c.org AND s.canvas = c.name) AS current_stars,
      (SELECT count(*) FROM canvas_stars s WHERE s.org = c.org AND s.canvas = c.name AND s.user_email = c.owner_email) AS owner_stars
      ${mine}`).bind(viewer.email, viewer.org).all();
  const started = (await db.prepare('SELECT min(at) AS at FROM canvas_star_events').first()).at;
  const scope = `e.reason = 'voluntary' ${inRange} AND EXISTS (SELECT 1 ${mine} AND p.org = e.org AND p.canvas = e.canvas)`;
  const events = started === null ? [] : (await db.prepare(`SELECT e.org, e.canvas, e.kind, e.owner_star, count(*) AS n FROM canvas_star_events e WHERE ${scope} GROUP BY e.org, e.canvas, e.kind, e.owner_star`).bind(...binds).all()).results;
  const sum = (rows, kind, ownerStar = null) => rows.filter(r => r.kind === kind && (ownerStar === null || r.owner_star === ownerStar)).reduce((n, r) => n + r.n, 0);
  const people = async kind => (await db.prepare(`SELECT count(DISTINCT e.user_id) AS n FROM canvas_star_events e WHERE e.kind = '${kind}' AND ${scope}`).bind(...binds).first()).n; // kind is a literal of ours
  const period = started === null ? null : {
    additions: { gross: sum(events, 'added'), unique_users: await people('added'), by_owner: sum(events, 'added', 1), by_others: sum(events, 'added', 0) },
    voluntary_removals: { gross: sum(events, 'removed'), unique_users: await people('removed') },
    net_change: sum(events, 'added') - sum(events, 'removed'),
  };
  const per = canvases.map(r => {
    const rows = events.filter(e => e.org === r.org && e.canvas === r.canvas);
    return { title: r.title, url: `/e/${r.token}`, current_stars: r.current_stars,
      ...(period ? { additions: sum(rows, 'added'), voluntary_removals: sum(rows, 'removed'), net_change: sum(rows, 'added') - sum(rows, 'removed') } : {}) };
  }).sort((a, b) => b.current_stars - a.current_stars || a.title.localeCompare(b.title)).slice(0, 100);
  return json({
    scope: 'published', range, definitions: DEFINITIONS, collection_started_at: started ? `${started.replace(' ', 'T')}Z` : null,
    // A range that begins before collection did covers a partly uncollected period; 'all' starts where collection did.
    partial: !!(started && sinceAt && started > sinceAt),
    current: { stars: canvases.reduce((n, r) => n + r.current_stars, 0), by_owner: canvases.reduce((n, r) => n + r.owner_stars, 0), by_others: canvases.reduce((n, r) => n + r.current_stars - r.owner_stars, 0) },
    period: period ?? NOT_COLLECTED, opens_from_stars: NOT_COLLECTED, canvases: per,
  });
}
