// Creator analytics (docs/features/creator-analytics-contract.md): what visitors do on public /e publications, collected,
// stored per learner and day (learn-migrations/0035), and read back by the publication's owner only.
//   POST /api/learn/boards/shared/<token>/events   ingest a browser's batch (learn-boards.js routes it here with its sharedRow)
//   GET  /api/analytics/creator                     every board of the signed-in creator
//   GET  /api/analytics/publications/<canvas>       one board of theirs (404 to anyone else, existence not revealed)
// Starts and forks are recorded by learn-boards.js in the same db.batch as the hole or fork (conversionStatements), so a
// failure records nothing and a replay (existing hole, replayed fork) never reaches the batch.
//
// Identity: a learner is a one-way key, sha256 of 'publication-learner:u:<users.id>' signed in, else
// 'publication-learner:v:<visitor id>' (a random UUID this browser keeps). A browser later seen signed in is linked
// (publication_visitor_links) and its anonymous rows count as that account at read time. The owner's own visits are dropped
// at ingest, and so are a browser's once the owner was seen signed in on it. Synthetic checks are stored apart and never
// reported as audience. Nothing personal is stored or returned: no email, users.id, visitor id, IP, user agent, referrer
// path or query, token, answer or typed text.
import { repositoryIdentity } from './repositories.js';
import { sha256Hex } from './learn-grade-jev.js';
import { sharedState } from './shared-privacy.js';
import { boardSources, isEmbed } from './learn-shared-ask.js';
import { FORK_COUNT } from './canvases.js';
import { STAR_COUNT } from './canvas-stars.js';
import { NOT_TRASHED } from './library-trash.js';
import { starFigures } from './canvas-star-analytics.js';
import { cardName } from './learn-boards.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const THRESHOLD = 10;
export const LIMITS = { body: 64 * 1024, events: 50, session_events: 3000, canvas_hour_events: 20000, session_active: 4 * 3600, raw_days: 90 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANVAS = /^canvas-[a-f0-9]{8}$/;
export const SOURCES = ['linkedin', 'explore', 'creator_profile', 'stars', 'direct', 'other_referrer'];
const TAG = /^[a-z0-9._-]{1,40}$/, HOST = /^(?=.{1,100}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/, STEP = /^[A-Za-z0-9:_.-]{1,120}$/;
const RANGES = { '7d': 7, '30d': 30, all: null };

const learnerKey = (kind, id) => sha256Hex(`publication-learner:${kind}:${id}`);
const principalKey = email => sha256Hex(`publication-creator:${email}`);
const userKey = viewer => learnerKey(viewer.userId ? 'u' : 'e', viewer.userId || viewer.email);
const short = (value, max = 200) => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : null);

// A card's concepts, as resolveTarget (web learn-target.js) reads them: its scene objects' conceptId and its spec's conceptIds.
export function cardConcepts(entry) {
  const ids = [...(entry?.scene?.objects || []).map(o => o?.conceptId), ...(Array.isArray(entry?.spec?.conceptIds) ? entry.spec.conceptIds : [])];
  return [...new Set(ids.filter(id => short(id)))].slice(0, 32);
}
const cardsOf = state => new Map([...(state.blocks || []), ...(state.exchanges || [])].filter(e => short(e?.id)).map(e => [e.id, e]));
const sourceKey = s => `${s.kind}:${s.id || s.title}`;
async function cardSetKey(state) {
  return sha256Hex([...cardsOf(state)].map(([id, e]) => `${id}:${cardConcepts(e).sort().join(',')}`).sort().join('\n'));
}

// The revision segment of the board version being read: a segment starts at the first version whose card set differs from
// the version recorded before it (contract "Revisions"). Recorded once per version.
async function segmentOf(db, org, canvas, version, state, now) {
  const known = await db.prepare('SELECT segment FROM publication_revisions WHERE org = ? AND canvas = ? AND version = ?').bind(org, canvas, version).first();
  if (known) return known.segment;
  const key = await cardSetKey(state);
  const before = await db.prepare('SELECT card_set_key, segment FROM publication_revisions WHERE org = ? AND canvas = ? AND version < ? ORDER BY version DESC LIMIT 1').bind(org, canvas, version).first();
  const segment = before && before.card_set_key === key ? before.segment : version;
  await db.prepare('INSERT OR IGNORE INTO publication_revisions (org, canvas, version, card_set_key, segment, first_seen_at) VALUES (?, ?, ?, ?, ?, ?)').bind(org, canvas, version, key, segment, now).run();
  return segment;
}

const metaStatements = (db, now) => [
  db.prepare("INSERT OR IGNORE INTO analytics_meta (key, value) VALUES ('collection_started_at', ?)").bind(now),
  db.prepare("INSERT INTO analytics_meta (key, value) VALUES ('last_ingest_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(now),
];
const learnerStatement = (db, org, canvas, learner, signed, synthetic, now) => db.prepare(`INSERT INTO publication_learners (org, canvas, learner_key, signed_in, synthetic, first_seen_at) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(org, canvas, learner_key) DO UPDATE SET signed_in = max(signed_in, excluded.signed_in)`).bind(org, canvas, learner, signed, synthetic, now);
const dayStatement = (db, at, { opens = 0, active = 0, source = null, campaign = null, host = null } = {}) => db.prepare(`INSERT INTO publication_learner_days (org, canvas, learner_key, day, segment, opens, active_seconds, source, campaign, referrer_host)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(org, canvas, learner_key, day, segment) DO UPDATE SET opens = opens + excluded.opens, active_seconds = active_seconds + excluded.active_seconds,
  source = COALESCE(source, excluded.source), campaign = COALESCE(campaign, excluded.campaign), referrer_host = COALESCE(referrer_host, excluded.referrer_host)`)
  .bind(at.org, at.canvas, at.learner, at.day, at.segment, opens, active, source, campaign, host);
// once: the first value of the day wins (a quiz's first try, a conversion that already exists); else repeats count in n.
const itemStatement = (db, at, kind, id, extra = null, once = false) => db.prepare(`INSERT INTO publication_learner_items (org, canvas, learner_key, day, segment, kind, item_id, n, extra)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(org, canvas, learner_key, day, segment, kind, item_id) DO ${once ? 'NOTHING' : 'UPDATE SET n = n + 1'}`)
  .bind(at.org, at.canvas, at.learner, at.day, at.segment, kind, id, extra);

// The Rabbit Hole start and fork success paths (learn-boards.js): statements for their own db.batch, [] when the action did
// not come through a live publication or was the owner's. item is the new hole's or fork's canvas name, unique per action.
export async function conversionStatements(db, { found, user, kind, item, materialId = null }) {
  const row = found?.row;
  if (!found?.publication || !row || row.board !== 'main' || !CANVAS.test(row.app) || !user?.email || user.email === row.owner_email) return [];
  const now = new Date().toISOString(), state = sharedState(JSON.parse(row.state_json));
  const at = { org: row.org, canvas: row.app, learner: await userKey(user), day: now.slice(0, 10), segment: await segmentOf(db, row.org, row.app, row.version, state, now) };
  const entry = materialId ? cardsOf(state).get(materialId) : null;
  return [learnerStatement(db, at.org, at.canvas, at.learner, 1, 0, now), dayStatement(db, at), itemStatement(db, at, kind, item, null, true),
    ...(entry ? cardConcepts(entry).map(c => itemStatement(db, at, 'concept_deeper', c)) : [])];
}

// POST /api/learn/boards/shared/<token>/events. found: sharedRow's answer for the token (null when the link is dead).
export async function ingestEvents(req, env, found) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const row = found?.row;
  // Public Explore publications only: a share link (/b), a project board or a dead token collects nothing.
  if (!found?.publication || row.board !== 'main' || !CANVAS.test(row.app)) return json({ error: 'Not a public learning board.' }, 404);
  const raw = await req.text();
  if (raw.length > LIMITS.body) return json({ error: 'Too large' }, 413);
  let body; try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const events = body?.events;
  if (!UUID.test(body?.visitor_id) || !UUID.test(body?.session_id) || !Array.isArray(events) || !events.length || events.length > LIMITS.events) return json({ error: `Send visitor_id, session_id and 1-${LIMITS.events} events.` }, 400);
  if (isEmbed(req)) return json({ accepted: 0, ignored: events.length, dropped: 'embed' }); // an embed on another site is not a /e visit
  const db = env.LEARN_DB, now = new Date().toISOString(), org = row.org, canvas = row.app;
  const identity = req.headers.get('cookie') ? await repositoryIdentity(req, env) : null;
  const viewer = identity instanceof Response ? null : identity;
  const visitor = await learnerKey('v', body.visitor_id);
  const ownerPrincipal = await principalKey(row.owner_email);
  const link = viewer ? db.prepare('INSERT OR IGNORE INTO publication_visitor_links (visitor_key, learner_key, principal_key, linked_at) VALUES (?, ?, ?, ?)').bind(visitor, await userKey(viewer), await principalKey(viewer.email), now) : null;
  // The creator's own visit, signed in or on a browser they were seen signed in on: dropped, but it proves the collector runs.
  const own = viewer ? viewer.email === row.owner_email : (await db.prepare('SELECT principal_key FROM publication_visitor_links WHERE visitor_key = ?').bind(visitor).first())?.principal_key === ownerPrincipal;
  if (own) { await db.batch([...metaStatements(db, now), ...(link ? [link] : [])]); return json({ accepted: 0, ignored: events.length, dropped: 'own_visit' }); }
  const sessionKey = await sha256Hex(`${visitor}:${body.session_id}`);
  const [inSession, inHour] = await Promise.all([
    db.prepare('SELECT count(*) AS n FROM publication_events WHERE session_key = ?').bind(sessionKey).first(),
    db.prepare('SELECT count(*) AS n FROM publication_events WHERE org = ? AND canvas = ? AND received_at > ?').bind(org, canvas, new Date(Date.parse(now) - 3600e3).toISOString()).first(),
  ]);
  if (inSession.n + events.length > LIMITS.session_events || inHour.n + events.length > LIMITS.canvas_hour_events) return json({ error: 'Too many events for now.', limited: true }, 429);
  const learner = viewer ? await userKey(viewer) : visitor, synthetic = body.synthetic === true ? 1 : 0;
  const state = sharedState(JSON.parse(row.state_json)), cards = cardsOf(state), sources = new Set(boardSources(state).map(sourceKey));
  const allConcepts = new Set([...cards.values()].flatMap(cardConcepts));
  const at = { org, canvas, learner, day: now.slice(0, 10), segment: await segmentOf(db, org, canvas, row.version, state, now) };
  // Replays: an event id already stored (a retried batch, a resent beacon) is ignored, so nothing it counted counts twice.
  const ids = await Promise.all(events.map(e => (UUID.test(e?.id) ? sha256Hex(`${visitor}:${e.id}`) : null)));
  const stored = new Set();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90).filter(Boolean);
    if (chunk.length) (await db.prepare(`SELECT event_id FROM publication_events WHERE event_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all()).results.forEach(r => stored.add(r.event_id));
  }
  let session = await db.prepare('SELECT * FROM publication_sessions WHERE session_key = ?').bind(sessionKey).first();
  const person = await db.prepare('SELECT credited_through FROM publication_learners WHERE org = ? AND canvas = ? AND learner_key = ?').bind(org, canvas, learner).first();
  let creditedThrough = person?.credited_through ?? null;
  const out = [], seenIds = new Set();
  let accepted = 0;
  const accept = (index, type, statements) => { out.push(db.prepare('INSERT INTO publication_events (event_id, org, canvas, session_key, type, received_at) VALUES (?, ?, ?, ?, ?, ?)').bind(ids[index], org, canvas, sessionKey, type, now), ...statements); accepted += 1; };
  events.forEach((e, index) => {
    if (!ids[index] || stored.has(ids[index]) || seenIds.has(ids[index])) return;
    seenIds.add(ids[index]);
    const card = short(e.material_id) && cards.get(e.material_id);
    switch (e.type) {
      case 'open': {
        const source = SOURCES.includes(e.source) ? e.source : 'direct';
        const campaign = typeof e.campaign === 'string' && TAG.test(e.campaign.toLowerCase()) ? e.campaign.toLowerCase() : null;
        const host = source === 'other_referrer' && typeof e.referrer_host === 'string' && HOST.test(e.referrer_host.toLowerCase()) ? e.referrer_host.toLowerCase() : null;
        const fresh = !session;
        if (fresh) {
          session = { started_at: now, reported_active: 0, credited_active: 0 };
          out.push(db.prepare('INSERT INTO publication_sessions (session_key, org, canvas, learner_key, started_at) VALUES (?, ?, ?, ?, ?)').bind(sessionKey, org, canvas, learner, now));
        }
        // Total opens are sessions: a reload or a return inside the visit adds no open.
        return accept(index, 'open', [dayStatement(db, at, { opens: fresh ? 1 : 0, source, campaign, host })]);
      }
      case 'active': {
        // Cumulative visible, recently active seconds from the browser. Credited: the increase over what this visit already
        // credited, never more than the wall-clock time since this learner's last credited second (overlapping tabs cannot
        // double it), and at most 4 h a visit. A heartbeat with no new activity credits nothing and writes no activity.
        const total = Number.isInteger(e.active_seconds) && e.active_seconds >= 0 && e.active_seconds <= 86400 ? e.active_seconds : null;
        if (total === null || !session) return;
        const from = Math.max(Date.parse(session.started_at), creditedThrough ? Date.parse(creditedThrough) : 0);
        const credit = Math.min(total - session.reported_active, Math.floor((Date.parse(now) - from) / 1000), LIMITS.session_active - session.credited_active);
        if (credit <= 0) return accept(index, 'active', []);
        session.reported_active += credit; session.credited_active += credit; creditedThrough = now;
        return accept(index, 'active', [dayStatement(db, at, { active: credit }),
          db.prepare('UPDATE publication_sessions SET reported_active = ?, credited_active = ? WHERE session_key = ?').bind(session.reported_active, session.credited_active, sessionKey)]);
      }
      case 'seen': case 'acted':
        if (!card) return;
        return accept(index, e.type, [dayStatement(db, at), itemStatement(db, at, `card_${e.type}`, e.material_id),
          ...cardConcepts(card).map(c => itemStatement(db, at, e.type === 'seen' ? 'concept_seen' : 'concept_explored', c))]);
      case 'resource':
        if (!short(e.resource_id) || !sources.has(e.resource_id)) return;
        return accept(index, 'resource', [dayStatement(db, at), itemStatement(db, at, 'resource', e.resource_id)]);
      case 'steps_shown': {
        const shown = Array.isArray(e.suggestions) ? e.suggestions.filter(s => STEP.test(s?.id) && Number.isInteger(s.position) && s.position >= 1 && s.position <= 3).slice(0, 3) : [];
        if (!shown.length) return;
        return accept(index, 'steps_shown', [dayStatement(db, at), ...shown.map(s => itemStatement(db, at, 'step_shown', s.id, s.position))]);
      }
      case 'step_selected': {
        if (!STEP.test(e.suggestion_id) || !Number.isInteger(e.position) || e.position < 1 || e.position > 3) return;
        const concepts = Array.isArray(e.concept_ids) ? e.concept_ids.filter(c => allConcepts.has(c)).slice(0, 32) : [];
        return accept(index, 'step_selected', [dayStatement(db, at), itemStatement(db, at, 'step_selected', e.suggestion_id, e.position), ...concepts.map(c => itemStatement(db, at, 'concept_deeper', c))]);
      }
      case 'quiz': {
        // The outcome is decided here from the published card's own answer key, never by the browser; the choice is not stored.
        const option = card?.type === 'quiz' && Array.isArray(card.options) ? card.options.find(o => o?.key === e.choice) : null;
        if (!option) return;
        return accept(index, 'quiz', [dayStatement(db, at), itemStatement(db, at, 'quiz', e.material_id, option.correct ? 1 : 0, true)]);
      }
      default:
    }
  });
  if (!accepted) { await db.batch(metaStatements(db, now)); return json({ accepted: 0, ignored: events.length }); }
  const oldest = new Date(Date.parse(now) - LIMITS.raw_days * 86400e3).toISOString();
  const prune = [db.prepare('DELETE FROM publication_events WHERE received_at < ?').bind(oldest), db.prepare('DELETE FROM publication_sessions WHERE started_at < ?').bind(oldest)];
  const credited = creditedThrough !== (person?.credited_through ?? null) ? [db.prepare('UPDATE publication_learners SET credited_through = ? WHERE org = ? AND canvas = ? AND learner_key = ?').bind(creditedThrough, org, canvas, learner)] : [];
  try {
    await db.batch([...metaStatements(db, now), ...prune, ...(link ? [link] : []), learnerStatement(db, org, canvas, learner, viewer ? 1 : 0, synthetic, now), ...out, ...credited]);
  } catch {
    // A concurrent copy of the same batch won an event id, or storage failed: nothing of this one was written; the browser retries.
    // Recorded for the owner's status when it can be; the next good batch clears it.
    await db.prepare("INSERT INTO analytics_meta (key, value) VALUES ('last_ingest_error_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(now).run().catch(() => {});
    return json({ error: 'Not recorded; retry.' }, 503);
  }
  return json({ accepted, ignored: events.length - accepted });
}

// ---- Reads -------------------------------------------------------------------------------------------------------------

const pub = value => ({ value, reason: null, public: true });
const hidden = reason => ({ value: null, reason });
const protect = (value, cohort) => (cohort >= THRESHOLD ? { value, reason: null } : hidden('insufficient_cohort'));
const ratio = (n, d) => (d ? Math.round((n / d) * 10000) / 10000 : 0);
const rate = (n, d) => protect(ratio(n, d), d);
const dayPlus = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
// Complementary suppression: in a partition whose total is shown, one hidden cell could be recovered by subtraction, so the
// smallest shown cell is hidden too. cells: [{ value }] mutable, in place.
function complement(cells) {
  const shown = cells.filter(c => c.metric.value !== null);
  if (cells.length - shown.length === 1 && shown.length) shown.sort((a, b) => a.metric.value - b.metric.value)[0].metric = hidden('complementary');
}

export const DEFINITIONS = Object.freeze({
  unique_visitors: 'Signed-in accounts and anonymous browsers, each counted once across your boards and days in the range. An anonymous browser is not an exact count of people. A browser later seen signed in counts as that account.',
  total_opens: 'Distinct visits (sessions) to a public board. A reload or a return within the visit adds nothing. Your own visits are excluded.',
  avg_active_seconds: 'Average credited active time per visitor and board: visible, recently active time with a 60-second inactivity threshold, never more than the wall-clock time, so overlapping tabs do not add up. It estimates engagement, not learning.',
  returning_visitors: 'Visitors seen on two or more distinct days in the range.',
  rabbit_holes_started: 'Rabbit Holes started successfully from a public board (recorded on the server when the hole is created; reopening one never counts).',
  canonical_forks: 'The canonical fork count of your boards, all time, including forks made through share links or by you.',
  audience_forks: 'Forks made by signed-in visitors through the public board, recorded when the fork is created; a retried fork never counts.',
  stars: 'Stars now are current saves (yours and the audience\'s). Net star actions are additions minus voluntary removals in the range, not the change in current Stars.',
  opens_from_stars: 'Visits whose first source was someone\'s Stars list, counted at the visit.',
  card_reach: 'Visitors who saw a card (at least half of it visible for 2 seconds) or interacted with it. A free canvas has no fixed reading order, so lower reach is not proof that someone left.',
  concepts: 'Of the visitors who saw a card carrying a concept, the share who interacted with it (explored) and who started a Rabbit Hole or chose a Next Step about it (went deeper).',
  next_steps: 'Suggestions actually shown and chosen, by position. Nothing is generated to measure it.',
  friction: 'Quiz cards only: visitors whose first answer was incorrect, decided on the server from the card\'s own answer key. Incomplete evidence is not an incorrect answer; Tutor-graded answers are not collected on public boards.',
  sources: 'The first observed source of each visitor in this scope and range: LinkedIn, Explore, your profile, Stars, other referrers (hostname only), or direct / unknown. Only allowlisted campaign tags are kept.',
  privacy: `Audience counts, rates and segments need at least ${THRESHOLD} visitors in that exact range and filter; a value that could be recovered by subtraction is hidden too. Hidden values are never zero. Exports apply the same rule.`,
  revisions: 'Before / after compares two revision periods of equal length around a change of the board\'s cards. It is descriptive: different audiences and dates, not proof that the edit caused a change.',
});

// GET /api/analytics/... -> a Response, or null for any other path.
export async function analyticsRoute(path, req, env) {
  if (!path.startsWith('/api/analytics/')) return null;
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const one = path.match(/^\/api\/analytics\/publications\/([^/]+)$/);
  if (path !== '/api/analytics/creator' && !one) return json({ error: 'Not found' }, 404);
  const viewer = await repositoryIdentity(req, env);
  if (viewer instanceof Response) return json({ error: 'Sign in to see your analytics.', signIn: true }, 401);
  const params = new URL(req.url).searchParams, range = params.get('range') || '30d';
  if (!Object.hasOwn(RANGES, range)) return json({ error: 'Use a range of 7d, 30d or all' }, 400);
  const db = env.LEARN_DB, canvas = one ? decodeURIComponent(one[1]) : null;
  try {
    if (canvas && !(CANVAS.test(canvas) && await db.prepare('SELECT 1 FROM canvases WHERE org = ? AND name = ? AND owner_email = ?').bind(viewer.org, canvas, viewer.email).first())) return json({ error: 'Not found' }, 404);
    return json(await readAnalytics(db, viewer, { range, canvas, synthetic: params.get('synthetic') === 'only' ? 1 : 0 }));
  } catch (error) {
    console.error('analytics read failed', error?.message);
    return json({ error: 'Analytics are temporarily unavailable. Missing values are not zero.', code: 'analytics_unavailable' }, 503);
  }
}

export async function readAnalytics(db, viewer, { range, canvas = null, synthetic = 0 }) {
  const now = new Date().toISOString(), today = now.slice(0, 10);
  await db.prepare("INSERT OR IGNORE INTO analytics_meta (key, value) VALUES ('collection_started_at', ?)").bind(now).run();
  const meta = Object.fromEntries((await db.prepare('SELECT key, value FROM analytics_meta').all()).results.map(r => [r.key, r.value]));
  const started = meta.collection_started_at, startDay = started.slice(0, 10);
  const scopeSql = canvas ? 'AND c.name = ?3' : '';
  const binds = [viewer.org, viewer.email, ...(canvas ? [canvas] : [])];
  // The boards in scope: the creator's canvases that are published now or have collected history (history is the canvas's,
  // not the token's, so an unpublish and republish keeps it).
  const boards = (await db.prepare(`SELECT c.name AS canvas, c.title, p.token,
      (p.token IS NOT NULL AND c.archived_at IS NULL AND ${NOT_TRASHED('c.org', 'c.name')}) AS published,
      ${FORK_COUNT} AS forks, ${STAR_COUNT} AS stars,
      (SELECT count(*) FROM canvas_stars s WHERE s.org = c.org AND s.canvas = c.name AND s.user_email = c.owner_email) AS owner_stars
    FROM canvases c LEFT JOIN canvas_publications p ON p.org = c.org AND p.canvas = c.name
    WHERE c.org = ?1 AND c.owner_email = ?2 ${scopeSql} AND (p.token IS NOT NULL OR EXISTS (SELECT 1 FROM publication_learners l WHERE l.org = c.org AND l.canvas = c.name))
    ORDER BY c.title`).bind(...binds).all()).results;
  const names = new Set(boards.map(b => b.canvas));
  const creator = await principalKey(viewer.email);
  // Per-learner rows of the scope since collection began, the creator's own browsers excluded; the range is applied below.
  // shortcut: rows are aggregated in the Worker, fine for thousands of learner-days a read; move the counts into SQL when a
  // creator's audience reaches tens of thousands of learner-days.
  const rows = async table => (await db.prepare(`SELECT d.*, COALESCE(k.learner_key, d.learner_key) AS who, (p.signed_in OR k.learner_key IS NOT NULL) AS signed
    FROM ${table} d JOIN publication_learners p ON p.org = d.org AND p.canvas = d.canvas AND p.learner_key = d.learner_key
    LEFT JOIN publication_visitor_links k ON k.visitor_key = d.learner_key
    WHERE d.org = ?1 AND d.canvas IN (SELECT c.name FROM canvases c WHERE c.org = ?1 AND c.owner_email = ?2 ${scopeSql}) AND p.synthetic = ?${binds.length + 1}
      AND (k.principal_key IS NULL OR k.principal_key != ?${binds.length + 2})`).bind(...binds, synthetic, creator).all()).results.filter(r => names.has(r.canvas));
  const [allDays, allItems] = [await rows('publication_learner_days'), await rows('publication_learner_items')];
  const syntheticCount = (await db.prepare(`SELECT count(*) AS n FROM publication_learners l WHERE l.org = ?1 AND l.synthetic = 1 AND l.canvas IN (SELECT c.name FROM canvases c WHERE c.org = ?1 AND c.owner_email = ?2 ${scopeSql})`).bind(...binds).first()).n;
  const from = RANGES[range] ? dayPlus(today, 1 - RANGES[range]) : startDay;
  const days = allDays.filter(r => r.day >= from), items = allItems.filter(r => r.day >= from);
  const whoOf = list => new Set(list.map(r => r.who));
  const itemsOf = (kind, id = null) => items.filter(r => r.kind === kind && (id === null || r.item_id === id));

  // Audience
  const visitors = whoOf(days), signed = whoOf(days.filter(r => r.signed));
  const anonymous = [...visitors].filter(w => !signed.has(w)).length;
  const split = [{ metric: protect(signed.size, signed.size) }, { metric: protect(anonymous, anonymous) }];
  if (visitors.size >= THRESHOLD) complement(split);
  const pairs = new Map(), perWho = new Map(), daysOf = new Map();
  for (const r of days) {
    pairs.set(`${r.who}|${r.canvas}`, (pairs.get(`${r.who}|${r.canvas}`) || 0) + r.active_seconds);
    perWho.set(r.who, (perWho.get(r.who) || 0) + r.active_seconds);
    daysOf.set(r.who, (daysOf.get(r.who) || new Set()).add(r.day));
  }
  const avgActive = (rowsOf, cohort) => { const p = new Map(); for (const r of rowsOf) p.set(`${r.who}|${r.canvas}`, (p.get(`${r.who}|${r.canvas}`) || 0) + r.active_seconds); return protect(p.size ? Math.round([...p.values()].reduce((a, b) => a + b, 0) / p.size) : 0, cohort); };
  const starts = itemsOf('start'), forks = itemsOf('fork');
  const starters = whoOf(starts), forkers = whoOf(forks);
  const within = (set, among) => [...set].filter(w => among.has(w)).length;

  // Stars (canvas-star-analytics.js, the one Stars read model): current relationships and the range's additions and removals.
  const sinceAt = RANGES[range] ? `${from} 00:00:00.000` : null;
  const stars = await starFigures(db, viewer, range, sinceAt);
  const starOf = name => stars.canvases.find(c => c.canvas === name);
  const inScope = list => list.filter(c => names.has(c.canvas));
  const periodSum = key => (stars.period?.value === null ? hidden('not_collected') : pub(inScope(stars.canvases).reduce((n, c) => n + (c[key] || 0), 0)));
  const opensFromStars = days.filter(r => r.source === 'stars').reduce((n, r) => n + r.opens, 0);

  // Boards
  const boardRows = boards.map(b => {
    const d = days.filter(r => r.canvas === b.canvas), seen = whoOf(d), s = starOf(b.canvas);
    return { canvas: b.canvas, title: b.title, url: b.token && b.published ? `/e/${b.token}` : null, published: !!b.published,
      visitors: protect(seen.size, seen.size), opens: pub(d.reduce((n, r) => n + r.opens, 0)), avg_active_seconds: avgActive(d, seen.size),
      start_rate: rate(within(whoOf(starts.filter(r => r.canvas === b.canvas)), seen), seen.size),
      audience_fork_rate: rate(within(whoOf(forks.filter(r => r.canvas === b.canvas)), seen), seen.size),
      stars_now: pub(b.stars), forks_all: pub(b.forks),
      star_additions: s && stars.period?.value !== null ? pub(s.additions) : hidden('not_collected'),
      star_removals: s && stars.period?.value !== null ? pub(s.voluntary_removals) : hidden('not_collected'),
      star_net: s && stars.period?.value !== null ? pub(s.net_change) : hidden('not_collected') };
  });

  // Learning
  const states = new Map();
  for (const b of boards) {
    const board = await db.prepare("SELECT state_json FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = 'main'").bind(viewer.org, viewer.email, b.canvas).first();
    states.set(b.canvas, board ? sharedState(JSON.parse(board.state_json)) : {});
  }
  const one = canvas ? states.get(canvas) || {} : null;
  const cards = one ? [...cardsOf(one)].map(([id, entry]) => {
    const seenBy = whoOf(itemsOf('card_seen', id)).size, actedBy = whoOf(itemsOf('card_acted', id)).size;
    return { material_id: id, label: cardName(entry), seen: protect(seenBy, seenBy), interacted: protect(actedBy, actedBy) };
  }) : null;
  const conceptIds = [...new Set(items.filter(r => r.kind.startsWith('concept_')).map(r => r.item_id))].sort();
  const concepts = conceptIds.map(id => {
    const saw = whoOf(itemsOf('concept_seen', id));
    return { concept_id: id, label: id, seen: protect(saw.size, saw.size), explored_rate: rate(within(whoOf(itemsOf('concept_explored', id)), saw), saw.size), deeper_rate: rate(within(whoOf(itemsOf('concept_deeper', id)), saw), saw.size) };
  });
  const shown = itemsOf('step_shown'), chosen = itemsOf('step_selected'), stepCohort = whoOf(shown).size;
  const sumN = list => list.reduce((n, r) => n + r.n, 0);
  const nextSteps = { impressions: protect(sumN(shown), stepCohort), selections: protect(sumN(chosen), stepCohort),
    positions: [1, 2, 3].map(p => { const i = sumN(shown.filter(r => r.extra === p)), s = sumN(chosen.filter(r => r.extra === p)); return { position: p, impressions: protect(i, stepCohort), selections: protect(s, stepCohort), rate: protect(ratio(s, i), stepCohort) }; }) };
  const resources = one ? boardSources(one).map(s => { const by = whoOf(itemsOf('resource', sourceKey(s))).size; return { resource_id: sourceKey(s), label: s.title, opens: protect(by, by) }; }) : null;
  // Friction: a visitor's first recorded answer on a quiz card (their earliest day), never a later retry.
  const firstTry = new Map();
  for (const r of itemsOf('quiz').sort((a, b) => a.day.localeCompare(b.day))) { const k = `${r.canvas}|${r.item_id}|${r.who}`; if (!firstTry.has(k)) firstTry.set(k, r.extra); }
  const quizzes = new Map();
  for (const [k, correct] of firstTry) { const [c, id] = k.split('|'); const q = quizzes.get(`${c}|${id}`) || { canvas: c, material_id: id, assessed: 0, incorrect: 0 }; q.assessed += 1; q.incorrect += correct ? 0 : 1; quizzes.set(`${c}|${id}`, q); }
  const friction = [...quizzes.values()].map(q => ({ canvas: q.canvas, material_id: q.material_id, label: cardName(cardsOf(states.get(q.canvas) || {}).get(q.material_id)),
    assessed: protect(q.assessed, q.assessed), incorrect: protect(q.incorrect, q.assessed), incorrect_rate: rate(q.incorrect, q.assessed) }));

  // Before / after a revision (one board): the latest card-set segment against the one before it, over two periods of
  // equal length meeting at the revision, each cohort suppressed on its own.
  let revisions = null;
  if (canvas) {
    const segments = [...new Set(allDays.map(r => r.segment))].sort((a, b) => a - b);
    if (segments.length < 2) revisions = { status: 'none', before: null, after: null, note: 'No recorded change of this board\'s cards yet. A comparison needs two revision periods with enough visitors in each.' };
    else {
      const [prev, last] = segments.slice(-2);
      const at = (await db.prepare('SELECT first_seen_at FROM publication_revisions WHERE org = ? AND canvas = ? AND segment = ? ORDER BY version LIMIT 1').bind(viewer.org, canvas, last).first())?.first_seen_at.slice(0, 10) ?? today;
      const length = Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${at}T00:00:00Z`)) / 86400e3) + 1);
      const side = (segment, start, end) => {
        const d = allDays.filter(r => r.segment === segment && r.day >= start && r.day <= end), who = whoOf(d);
        const st = whoOf(allItems.filter(r => r.kind === 'start' && r.segment === segment && r.day >= start && r.day <= end));
        return { segment, from: start, to: end, visitors: protect(who.size, who.size), avg_active_seconds: avgActive(d, who.size), start_rate: rate(within(st, who), who.size), size: who.size };
      };
      const before = side(prev, dayPlus(at, -length), dayPlus(at, -1)), after = side(last, at, today);
      const comparable = before.size >= THRESHOLD && after.size >= THRESHOLD;
      delete before.size; delete after.size;
      revisions = { status: comparable ? 'comparable' : 'insufficient', before, after, note: DEFINITIONS.revisions };
    }
  }

  // Sources: each visitor's first observed source in scope and range.
  const firstSource = new Map(), campaignsOf = new Map(), hostsOf = new Map();
  for (const r of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    if (r.source && !firstSource.has(r.who)) { firstSource.set(r.who, r.source); if (r.referrer_host) hostsOf.set(r.who, r.referrer_host); }
    if (r.campaign) (campaignsOf.get(r.campaign) || campaignsOf.set(r.campaign, new Set()).get(r.campaign)).add(r.who);
  }
  const bySource = SOURCES.map(source => { const n = [...firstSource.values()].filter(s => s === source).length; return { source, metric: protect(n, n) }; });
  if (visitors.size >= THRESHOLD) complement(bySource);
  const hostCounts = new Map();
  for (const h of hostsOf.values()) hostCounts.set(h, (hostCounts.get(h) || 0) + 1);
  // A host needs ten visitors of its own. The named hosts must also leave no small remainder of the other-referrer total, which
  // subtraction would reveal: the smallest named host is withheld until the remainder is 0 or at least ten.
  const named = [...hostCounts].filter(([, n]) => n >= THRESHOLD).sort((a, b) => b[1] - a[1]);
  const otherTotal = [...firstSource.values()].filter(s => s === 'other_referrer').length;
  while (named.length) {
    const left = otherTotal - named.reduce((n, [, c]) => n + c, 0);
    if (left === 0 || left >= THRESHOLD) break;
    named.pop();
  }
  const referrers = named.map(([host, n]) => ({ host, visitors: { value: n, reason: null } }));
  const campaigns = [...campaignsOf].map(([campaign, who]) => ({ campaign, visitors: protect(who.size, who.size), start_rate: rate(within(starters, who), who.size) }))
    .filter(c => c.visitors.value !== null).sort((a, b) => b.visitors.value - a.visitors.value);

  // Insights: deterministic rules over shown aggregates only (contract "Insights"); none means no clear signal.
  const insights = [];
  const curious = concepts.filter(c => c.deeper_rate.value !== null && c.deeper_rate.value >= 0.2).sort((a, b) => b.deeper_rate.value - a.deeper_rate.value || b.seen.value - a.seen.value)[0];
  if (curious) insights.push({ type: 'interest', canvas: canvas ?? items.find(r => r.kind === 'concept_deeper' && r.item_id === curious.concept_id)?.canvas ?? null, subject_id: curious.concept_id, label: curious.label, numerator: Math.round(curious.deeper_rate.value * curious.seen.value), denominator: curious.seen.value, rate: curious.deeper_rate.value, material_id: null });
  const stuck = friction.filter(f => f.incorrect_rate.value !== null && f.incorrect_rate.value >= 0.3).sort((a, b) => b.incorrect_rate.value - a.incorrect_rate.value)[0];
  if (stuck) insights.push({ type: 'friction', canvas: stuck.canvas, subject_id: stuck.material_id, label: stuck.label, numerator: stuck.incorrect.value, denominator: stuck.assessed.value, rate: stuck.incorrect_rate.value, material_id: stuck.material_id });

  const live = note => ({ readiness: 'live', started_at: started, note });
  const metric = (value, cohort) => protect(value, cohort);
  return {
    scope: { kind: canvas ? 'publication' : 'creator', canvas, title: canvas ? boards[0]?.title ?? null : null },
    range, period: { from, to: today, timezone: 'UTC', partial: from < startDay }, threshold: THRESHOLD,
    // Active only when this read succeeded and the newest ingest did not fail after the newest success.
    collection: { status: meta.last_ingest_error_at && !(meta.last_ingest_at > meta.last_ingest_error_at) ? 'degraded' : 'active', started_at: started, last_ingest_at: meta.last_ingest_at ?? null, checked_at: now, own_visits_excluded: true, synthetic_excluded: syntheticCount },
    producers: {
      visits: live(null), active_time: live(null), cards: live(null), concepts: live('Only cards that carry concept ids report concepts.'), resources: live(null),
      next_steps: live('Suggestions are shown only when a signed-in visitor asks for them.'), conversions: live(null), revisions: live(null), sources: live(null),
      stars: { readiness: 'live', started_at: stars.collection_started_at, note: null },
      outcomes: { readiness: 'partial', started_at: started, note: 'Quiz cards only. Tutor-graded answers are not collected on public boards.' },
    },
    overview: {
      total_opens: pub(days.reduce((n, r) => n + r.opens, 0)), unique_visitors: metric(visitors.size, visitors.size),
      signed_in_visitors: visitors.size >= THRESHOLD ? split[0].metric : hidden('insufficient_cohort'), anonymous_visitors: visitors.size >= THRESHOLD ? split[1].metric : hidden('insufficient_cohort'),
      avg_active_seconds: avgActive(days, visitors.size), engaged_visitors: metric([...perWho.values()].filter(s => s >= 120).length, visitors.size),
      returning_visitors: metric([...daysOf.values()].filter(s => s.size >= 2).length, visitors.size),
      rabbit_holes_started: pub(new Set(starts.map(r => r.item_id)).size), start_rate: rate(within(starters, visitors), visitors.size),
      stars_now: pub(boards.reduce((n, b) => n + b.stars, 0)), stars_from_owner: pub(boards.reduce((n, b) => n + b.owner_stars, 0)), stars_from_audience: pub(boards.reduce((n, b) => n + b.stars - b.owner_stars, 0)),
      canonical_forks: pub(boards.reduce((n, b) => n + b.forks, 0)), audience_forks: pub(new Set(forks.map(r => r.item_id)).size), audience_fork_rate: rate(within(forkers, visitors), visitors.size),
      public_boards: pub(boards.filter(b => b.published).length),
    },
    stars: { additions: periodSum('additions'), removals: periodSum('voluntary_removals'), net: periodSum('net_change'), opens_from_stars: pub(opensFromStars) },
    trend: Array.from({ length: Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400e3) + 1) }, (_, i) => dayPlus(from, i))
      .map(day => ({ day, opens: pub(days.filter(r => r.day === day).reduce((n, r) => n + r.opens, 0)) })),
    boards: boardRows,
    learning: { cards, concepts, next_steps: nextSteps, resources, friction, revisions },
    sources: { visitors: bySource.map(s => ({ source: s.source, visitors: s.metric })), campaigns, referrers },
    insights, definitions: DEFINITIONS,
  };
}
