// Creator analytics (publication-analytics.js, learn-migrations/0035): ingest from a public board, the start and fork
// conversions, and the owner's reads, on the shared-canvas fixture (LEARN_DB as node:sqlite). ana owns the board; ben and
// cara visit signed in; anonymous browsers visit with only a visitor id. No model is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup as fixture, BOARD } from './shared-canvas-fixture.js';
import { handle } from './stars-helpers.js';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { analyticsRoute } from '../src/publication-analytics.js';
import { accountKey, cleanupHealth, deleteLearnerSql, firstRetainedDay, LEARNER_TABLES, RETENTION_DAYS, retentionCutoff, runCleanup, visitorKey } from '../src/publication-analytics-purge.js';
import { APPROVED_CAMPAIGNS } from '../../web/src/analytics-campaigns.js';

const CONSENT = 'rh_analytics_consent=accepted; rh_analytics_consent_v=2';
const consentCookie = as => `${CONSENT}${as ? `; small_session=${as}` : ''}`;
// The fixture, with a start or fork made as a consenting visitor unless a test says otherwise (consent: false).
const setup = t => {
  const f = fixture(t), call = f.call;
  f.call = (method, path, options = {}) => (/\/rabbit-hole$|\/boards\/fork$/.test(path) && options.consent !== false ? call(method, path, { ...options, as: undefined, headers: { cookie: consentCookie(options.as) } }) : call(method, path, options));
  return f;
};

const STATE = { ...BOARD, blocks: [...BOARD.blocks,
  { id: 'z1', type: 'quiz', question: 'Which way is downhill?', options: [{ key: 'a', text: 'Against the gradient', correct: true }, { key: 'b', text: 'Along it' }], why: 'The gradient points uphill.' },
  { id: 'c1', type: 'interactive', title: 'Learning rate', spec: { id: 'lr', conceptIds: ['learning-rate'] } }] };
const uuid = () => crypto.randomUUID();
const ev = (type, extra = {}) => ({ id: uuid(), type, ...extra });

async function board(f, { title = 'Gradient descent', publish = true, state = STATE } = {}) {
  if (!f.sqlite.prepare('SELECT 1 FROM user_handles WHERE email = ?').get('ana@test')) handle(f, 'ana@test', 'ana');
  const canvas = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title } })).body;
  await f.call('PUT', `/api/learn/boards/${canvas.name}/main`, { as: 'ana', body: { state } });
  const token = publish ? (await f.call('POST', `/api/apps/${canvas.name}/publish`, { as: 'ana' })).body.publication_token : null;
  return { canvas: canvas.name, token };
}
const send = (f, token, { as, visitor = uuid(), session = uuid(), synthetic, events, consent = true, headers = {} }) =>
  f.call('POST', `/api/learn/boards/shared/${token}/events`, { ...(consent ? { headers: { cookie: consentCookie(as), ...headers } } : { as, headers }), body: { visitor_id: visitor, session_id: session, ...(synthetic ? { synthetic: true } : {}), events } });
async function read(f, path, as) {
  const req = new Request(`https://app.test${path}`, { headers: as ? { cookie: `small_session=${as}` } : {} });
  const res = await analyticsRoute(new URL(req.url).pathname, req, f.env);
  return { status: res.status, body: await res.json() };
}
// n anonymous visits, each its own browser, opening the board and seeing card b1.
async function crowd(f, token, n, extra = () => []) {
  for (let i = 0; i < n; i += 1) assert.equal((await send(f, token, { events: [ev('open', { source: 'linkedin', campaign: 'LinkedIn-Launch' }), ev('seen', { material_id: 'b1' }), ...extra(i)] })).body.accepted >= 2, true);
}

test('an anonymous visit is collected, counted as an open, and shown to the owner without exposing a small audience', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  const visit = await send(f, token, { events: [ev('open', { source: 'other_referrer', referrer_host: 'News.Example.com', campaign: 'jane.doe' }), ev('seen', { material_id: 'b1' }), ev('acted', { material_id: 'c1' }), ev('resource', { resource_id: 'video:kCc8FmEb1nY' })] });
  assert.deepEqual(visit.body, { accepted: 4, ignored: 0 });
  const one = await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana');
  assert.equal(one.status, 200);
  assert.deepEqual(one.body.overview.total_opens, { value: 1, reason: null, public: true });
  assert.deepEqual(one.body.overview.unique_visitors, { value: null, reason: 'insufficient_cohort' }, 'one visitor is hidden, never 0');
  assert.equal(one.body.collection.status, 'active');
  assert.ok(one.body.collection.started_at && one.body.collection.last_ingest_at);
  assert.deepEqual(one.body.learning.cards.find(c => c.material_id === 'b1').seen, { value: null, reason: 'insufficient_cohort' });
  assert.deepEqual(one.body.trend.at(-1).opens.value, 1);
  // Nothing personal is stored: no email, users.id, visitor id, host path or raw token in any analytics table.
  const dump = JSON.stringify(['publication_events', 'publication_learners', 'publication_sessions', 'publication_learner_days', 'publication_learner_items'].map(tb => f.sqlite.prepare(`SELECT * FROM ${tb}`).all()));
  assert.doesNotMatch(dump, /@test|u-ana|u-ben|example\.com|jane\.doe/, 'no referrer host, and an unapproved campaign value is ignored');
  assert.ok(!dump.includes(token), 'the token is never stored');
  assert.match(dump, /other_referrer/, 'only the category is kept');
});

test('only live public /e publications collect: a share link, an unpublished board and a dead token answer 404', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  const { token: share } = await f.shareProject();
  assert.equal((await send(f, share, { events: [ev('open')] })).status, 404, 'an unlisted share link collects nothing');
  assert.equal((await send(f, 'x'.repeat(30), { events: [ev('open')] })).status, 404);
  await f.call('POST', `/api/apps/${canvas}/unpublish`, { as: 'ana' });
  assert.equal((await send(f, token, { events: [ev('open')] })).status, 404, 'unpublished');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM publication_events').get().n, 0);
});

test('bounds: batch size, body size, ids and fields are validated; unknown cards, resources and steps are ignored', async t => {
  const f = setup(t);
  const { token } = await board(f);
  assert.equal((await send(f, token, { events: [] })).status, 400);
  assert.equal((await send(f, token, { events: Array.from({ length: 51 }, () => ev('open')) })).status, 400);
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/events`, { headers: { cookie: CONSENT }, body: { visitor_id: 'not-a-uuid', session_id: uuid(), events: [ev('open')] } })).status, 400);
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/events`, { raw: 'x'.repeat(70 * 1024) })).status, 413);
  const mixed = await send(f, token, { events: [ev('open'), ev('seen', { material_id: 'nope' }), ev('resource', { resource_id: 'paper:9999' }), ev('steps_shown', { suggestions: [{ id: 'bad id!', position: 1 }] }),
    ev('step_selected', { suggestion_id: 's1', position: 9 }), ev('quiz', { material_id: 'b1', choice: 'a' }), ev('mystery'), { type: 'open' }] });
  assert.deepEqual(mixed.body, { accepted: 1, ignored: 7 });
});

test('the creator\'s own signed-in visit is dropped and writes no audience row', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  const own = await send(f, token, { as: 'ana', events: [ev('open'), ev('active', { active_seconds: 30 })] });
  assert.deepEqual(own.body, { accepted: 0, ignored: 2, dropped: 'own_visit' });
  assert.equal((await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana')).body.overview.total_opens.value, 0);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM publication_learner_days').get().n, 0);
});

test('retries and replays: the same event ids add nothing; a reload in the same visit adds no open', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  const visitor = uuid(), session = uuid(), events = [ev('open'), ev('seen', { material_id: 'b1' })];
  assert.equal((await send(f, token, { visitor, session, events })).body.accepted, 2);
  assert.deepEqual((await send(f, token, { visitor, session, events })).body, { accepted: 0, ignored: 2 }, 'a resent beacon');
  assert.equal((await send(f, token, { visitor, session, events: [ev('open')] })).body.accepted, 1, 'a reload is accepted');
  assert.equal((await send(f, token, { visitor, session: uuid(), events: [ev('open')] })).body.accepted, 1, 'a new visit');
  const body = (await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana')).body;
  assert.equal(body.overview.total_opens.value, 2, 'two visits, whatever the reloads and retries');
  assert.equal(f.sqlite.prepare("SELECT n FROM publication_learner_items WHERE kind = 'card_seen'").get().n, 1);
});

test('active time: heartbeats add nothing, a claim is capped by wall-clock time, and two tabs cannot double a second', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-02T10:00:00Z') });
  const visitor = uuid(), tabA = uuid(), tabB = uuid();
  await send(f, token, { visitor, session: tabA, events: [ev('open')] });
  await send(f, token, { visitor, session: tabB, events: [ev('open')] });
  const active = async (session, seconds) => send(f, token, { visitor, session, events: [ev('active', { active_seconds: seconds })] });
  t.mock.timers.tick(60_000);
  await active(tabA, 60);
  await active(tabB, 60); // the same minute, from the other tab: nothing left to credit
  t.mock.timers.tick(30_000);
  await active(tabA, 60); // a heartbeat: no new activity
  await active(tabB, 10_000); // an inflated claim: 30 s of wall clock since the last credited second
  t.mock.timers.tick(30_000);
  await active(tabA, 90); // 30 more seconds of its own, inside the next half-minute of wall clock
  t.mock.timers.tick(600_000);
  await active(tabB, 10_001); // ten idle minutes later, one new second: the clipped seconds of its earlier reports do not come back
  const seconds = f.sqlite.prepare('SELECT sum(active_seconds) AS s FROM publication_learner_days').get().s;
  assert.equal(seconds, 121, 'the 120 s of wall clock the tabs shared, plus the one new second');
  const sessions = f.sqlite.prepare('SELECT credited_active FROM publication_sessions ORDER BY credited_active').all().map(r => r.credited_active);
  assert.deepEqual(sessions, [31, 90]);
  // A heartbeat-only visit creates no activity row on a new day.
  t.mock.timers.tick(86400e3);
  await active(tabA, 90);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM publication_learner_days WHERE day = ?').get('2026-11-03').n, 0);
  t.mock.timers.reset();
  assert.ok((await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana')).status === 200);
});

test('ten visitors make protected metrics visible; segments under ten stay hidden, with complementary suppression', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  await crowd(f, token, 12, i => (i < 10 ? [ev('active', { active_seconds: 0 })] : []));
  // Two more visitors from Explore: a hidden category beside visible ones.
  for (let i = 0; i < 2; i += 1) await send(f, token, { events: [ev('open', { source: 'explore' })] });
  const body = (await read(f, `/api/analytics/publications/${canvas}?range=30d`, 'ana')).body;
  assert.deepEqual(body.overview.unique_visitors, { value: 14, reason: null });
  assert.deepEqual(body.overview.total_opens.value, 14);
  assert.deepEqual(body.learning.cards.find(c => c.material_id === 'b1').seen, { value: 12, reason: null });
  const sources = Object.fromEntries(body.sources.visitors.map(s => [s.source, s.visitors]));
  assert.deepEqual(sources.linkedin, { value: null, reason: 'complementary' }, '14 - 12 would reveal the two from Explore');
  assert.deepEqual(sources.explore, { value: null, reason: 'insufficient_cohort' });
  assert.deepEqual(body.sources.campaigns, [{ campaign: 'linkedin-launch', visitors: { value: 12, reason: null }, start_rate: { value: 0, reason: null } }]);
  // No one signed in: nothing small to recover, and the zero itself stays hidden.
  assert.deepEqual([body.overview.signed_in_visitors, body.overview.anonymous_visitors], [{ value: null, reason: 'insufficient_cohort' }, { value: 14, reason: null }]);
  await send(f, token, { as: 'ben', events: [ev('open', { source: 'direct' })] });
  const one = (await read(f, `/api/analytics/publications/${canvas}?range=30d`, 'ana')).body.overview;
  assert.deepEqual([one.signed_in_visitors.reason, one.anonymous_visitors.reason], ['insufficient_cohort', 'complementary'], 'one signed-in visitor cannot be worked out from 15 - 14');
});

test('a shared browser never counts as the wrong person: sign-out and account switching stay apart, and signed-in visits dedupe across boards and days', async t => {
  const f = setup(t);
  const a = await board(f, { title: 'One' }), b = await board(f, { title: 'Two' });
  const browser = uuid(), tab = uuid();
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T23:59:00Z') });
  await send(f, a.token, { as: 'ben', visitor: browser, session: tab, events: [ev('open')] });
  t.mock.timers.tick(60_000);
  await send(f, a.token, { as: 'ben', visitor: browser, session: tab, events: [ev('active', { active_seconds: 60 })] });
  // ben signs out in the same tab, then cara signs in on it: each is a new visit, and none of ben's time or history moves.
  t.mock.timers.tick(60_000);
  await send(f, a.token, { visitor: browser, session: tab, events: [ev('open')] });
  await send(f, a.token, { as: 'cara', visitor: browser, session: tab, events: [ev('open'), ev('active', { active_seconds: 120 })] });
  await send(f, b.token, { as: 'ben', visitor: uuid(), events: [ev('open')] }); // ben again: another board, another browser, the next UTC day
  const keys = { ben: await accountKey({ userId: 'u-ben-9a2b' }), cara: await accountKey({ userId: 'u-cara-71f0' }), anon: await visitorKey(browser) };
  const opens = key => f.sqlite.prepare('SELECT sum(opens) AS n FROM publication_learner_days WHERE learner_key = ?').get(key).n;
  assert.deepEqual([opens(keys.ben), opens(keys.anon), opens(keys.cara)], [2, 1, 1], 'each identity keeps its own visits');
  assert.equal(f.sqlite.prepare('SELECT sum(active_seconds) AS s FROM publication_learner_days WHERE learner_key = ?').get(keys.ben).s, 60);
  assert.equal(f.sqlite.prepare('SELECT sum(active_seconds) AS s FROM publication_learner_days WHERE learner_key = ?').get(keys.anon).s, 0, 'the signed-out visit took none of his time');
  assert.equal(f.sqlite.prepare('SELECT sum(active_seconds) AS s FROM publication_learner_days WHERE learner_key = ?').get(keys.cara).s, 0, 'nor did the next account, at the same instant');
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name LIKE '%link%' AND name LIKE 'publication%'").get().n, 0, 'no browser-to-account link exists');
  for (let i = 0; i < 7; i += 1) await send(f, a.token, { events: [ev('open')] });
  const all = (await read(f, '/api/analytics/creator?range=all', 'ana')).body;
  t.mock.timers.reset();
  assert.deepEqual(all.overview.unique_visitors, { value: 10, reason: null }, 'ben once, cara, the browser and seven more: never a sum of boards or days');
  assert.equal(all.overview.returning_visitors.value, 1);
});

test('rate limits: a session over its cap is refused', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  const { sha256Hex } = await import('../src/learn-grade-jev.js');
  const visitor = uuid(), session = uuid(), learner = await visitorKey(visitor);
  const key = await sha256Hex(`${learner}:${session}`);
  const add = f.sqlite.prepare('INSERT INTO publication_events (event_id, org, canvas, session_key, learner_key, type, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 3000; i += 1) add.run(`e${i}`, 'ana-ws', canvas, key, learner, 'seen', new Date().toISOString());
  const limited = await send(f, token, { visitor, session, events: [ev('open')] });
  assert.deepEqual([limited.status, limited.body.limited], [429, true]);
});

test('consent: without acceptance, after rejection, after withdrawal and under a privacy signal nothing is written, and no identifier is linked', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  const counts = () => [...LEARNER_TABLES, 'publication_board_days', 'publication_revisions', 'analytics_meta'].map(table => f.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n);
  const before = counts();
  const refused = async (options, label) => { const r = await send(f, token, { events: [ev('open')], ...options }); assert.deepEqual([r.status, r.body.accepted, r.body.dropped], [200, 0, 'no_consent'], label); assert.deepEqual(counts(), before, label); };
  await refused({ consent: false }, 'no signal, signed out');
  await refused({ consent: false, as: 'ben' }, 'no signal, signed in');
  await refused({ consent: false, headers: { cookie: 'rh_analytics_consent=rejected' } }, 'rejected');
  await refused({ consent: false, headers: { cookie: 'rh_analytics_consent=' } }, 'withdrawn: the cookie is cleared');
  await refused({ consent: false, headers: { cookie: 'x_rh_analytics_consent=accepted; x_rh_analytics_consent_v=2' } }, 'a look-alike cookie');
  await refused({ consent: false, headers: { cookie: 'rh_analytics_consent=accepted' } }, 'an acceptance from before this measurement covered PostHog only');
  await refused({ consent: false, headers: { cookie: 'rh_analytics_consent=accepted; rh_analytics_consent_v=1' } }, 'an earlier version');
  await refused({ consent: false, headers: { cookie: 'rh_analytics_consent_v=2' } }, 'a version without the acceptance');
  await refused({ headers: { 'Sec-GPC': '1' } }, 'Global Privacy Control overrides acceptance');
  await refused({ headers: { DNT: '1' } }, 'Do Not Track overrides acceptance');
  assert.equal((await send(f, token, { events: [ev('open')] })).body.accepted, 1, 'accepted: collected');
  // A start and a fork still work without consent, or with only the old acceptance, and record nothing.
  const after = counts();
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/rabbit-hole`, { as: 'ben', consent: false, body: { origin: null } })).status, 201);
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'cara', consent: false, body: { source: { token }, key: 'fork-key-0020' } })).status, 201);
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { consent: false, headers: { cookie: 'rh_analytics_consent=accepted; small_session=cara' }, body: { source: { token }, key: 'fork-key-0021' } })).status, 201);
  assert.deepEqual(counts(), after, 'the action succeeded, uncounted');
  const body = (await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana')).body;
  assert.equal(body.coverage, 'consenting_visitors');
  assert.match(body.definitions.coverage, /accepted analytics/);
  assert.deepEqual([body.overview.rabbit_holes_started.value, body.overview.audience_forks.value], [0, 0]);
});

test('retention: visitor-level rows past 90 days are ignored by reads even before a purge, then purged; the person-free counters stay', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  assert.equal(RETENTION_DAYS, 90);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-08-01T12:00:00Z') });
  for (let i = 0; i < 10; i += 1) await send(f, token, { events: [ev('open', { source: 'stars' }), ev('seen', { material_id: 'b1' })] });
  const rowsOf = () => LEARNER_TABLES.map(table => f.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n);
  assert.ok(rowsOf().every(n => n > 0));
  t.mock.timers.tick(89 * 86400e3);
  assert.equal((await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana')).body.overview.unique_visitors.value, 10, 'day 89: still counted');
  t.mock.timers.tick(2 * 86400e3);
  // No purge can run: every batch fails. The rows are there, and the read still answers and still ignores them.
  const original = f.env.LEARN_DB.batch;
  f.env.LEARN_DB.batch = async () => { throw new Error('D1 unavailable'); };
  const unpurged = (await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana')).body;
  f.env.LEARN_DB.batch = original;
  assert.ok(rowsOf().every(n => n > 0), 'not purged yet');
  assert.deepEqual(unpurged.overview.unique_visitors, { value: null, reason: 'insufficient_cohort' }, 'expired rows are never counted');
  assert.equal(unpurged.learning.cards.find(c => c.material_id === 'b1').seen.value, null);
  assert.deepEqual([unpurged.overview.total_opens.value, unpurged.stars.opens_from_stars.value], [10, 10], 'the counters outlive them');
  assert.equal(unpurged.period.audience_from, '2026-08-03');
  await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana');
  assert.deepEqual(rowsOf(), [0, 0, 0, 0, 0], 'a read purges');
  t.mock.timers.reset();
});

test('the daily cleanup expires records with no new visit and no report read, and records its run', async t => {
  const f = setup(t);
  const { token } = await board(f);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-08-01T12:00:00Z') });
  for (let i = 0; i < 3; i += 1) await send(f, token, { events: [ev('open', { source: 'stars' }), ev('seen', { material_id: 'b1' })] });
  const rowsOf = () => LEARNER_TABLES.map(table => f.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n);
  const statementsBefore = f.statements.length;
  t.mock.timers.tick(91 * 86400e3);
  await runCleanup(f.env.LEARN_DB); // the scheduled handler's whole body: no request, no read
  assert.deepEqual(rowsOf(), [0, 0, 0, 0, 0]);
  assert.equal(f.statements.slice(statementsBefore).filter(s => /^SELECT/i.test(s)).length, 0, 'it reads nothing');
  assert.equal(f.sqlite.prepare("SELECT value FROM analytics_meta WHERE key = 'last_cleanup_ok_at'").get().value, new Date().toISOString());
  assert.equal(f.sqlite.prepare('SELECT sum(opens) AS n FROM publication_board_days').get().n, 3, 'the person-free totals stay');
  t.mock.timers.reset();
});

test('the cleanup records whether it deleted anything: a good run with nothing eligible says 0 and keeps the last deletion time', async t => {
  const f = setup(t);
  const { token } = await board(f);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-08-01T12:00:00Z') });
  const metaOf = key => f.sqlite.prepare('SELECT value FROM analytics_meta WHERE key = ?').get(key)?.value ?? null;
  await send(f, token, { events: [ev('open', { source: 'stars' }), ev('seen', { material_id: 'b1' })] });
  const held = LEARNER_TABLES.map(table => f.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n).reduce((a, b) => a + b, 0);
  assert.ok(held > 0);
  await runCleanup(f.env.LEARN_DB);
  assert.equal(metaOf('last_cleanup_ok_at'), new Date().toISOString(), 'it ran and succeeded');
  assert.equal(metaOf('last_cleanup_deleted_rows'), '0', 'with nothing eligible');
  assert.equal(metaOf('last_cleanup_deleted_at'), null, 'and has never deleted');
  t.mock.timers.tick(91 * 86400e3);
  const deletedAt = new Date().toISOString();
  await runCleanup(f.env.LEARN_DB);
  assert.equal(metaOf('last_cleanup_deleted_rows'), String(held), 'it counts exactly the rows it removed');
  assert.equal(metaOf('last_cleanup_deleted_at'), deletedAt);
  t.mock.timers.tick(86400e3);
  await runCleanup(f.env.LEARN_DB);
  assert.equal(metaOf('last_cleanup_ok_at'), new Date().toISOString(), 'the next run succeeds');
  assert.equal(metaOf('last_cleanup_deleted_rows'), '0', 'and had nothing left to delete');
  assert.equal(metaOf('last_cleanup_deleted_at'), deletedAt, 'the last deletion time is kept');
  t.mock.timers.reset();
});

test('a visitor returning after 90 days keeps no history older than 90 days: no first-seen date, and the old day is gone', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-08-01T12:00:00Z') });
  const visitor = uuid();
  await send(f, token, { visitor, events: [ev('open'), ev('seen', { material_id: 'b1' })] });
  t.mock.timers.tick(100 * 86400e3);
  await send(f, token, { visitor, events: [ev('open')] });
  const key = await visitorKey(visitor);
  assert.deepEqual(f.sqlite.prepare('SELECT DISTINCT day FROM publication_learner_days WHERE learner_key = ?').all(key).map(r => r.day), ['2026-11-09'], 'only the retained day');
  const row = { ...f.sqlite.prepare('SELECT * FROM publication_learners WHERE learner_key = ?').get(key) };
  assert.ok(!Object.keys(row).some(column => /first/.test(column)), 'no column keeps the first visit');
  assert.equal(row.last_seen_at, new Date().toISOString());
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM publication_learner_items WHERE kind = 'card_seen'").get().n, 0);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM publication_sessions WHERE learner_key = ? AND started_at < ?').get(key, retentionCutoff(new Date().toISOString())).n, 0);
  const body = (await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana')).body;
  assert.equal(body.overview.returning_visitors.value, null, 'hidden below ten');
  t.mock.timers.reset();
});

test('the exact boundary: timestamps at exactly 90 days stay and one millisecond more goes; a daily rollup goes before any of its day passes 90 days', async t => {
  assert.equal(RETENTION_DAYS, 90);
  assert.equal(retentionCutoff('2026-11-30T00:00:00.000Z'), '2026-09-01T00:00:00.000Z');
  assert.equal(firstRetainedDay('2026-11-30T00:00:00.000Z'), '2026-09-01', 'at midnight, the whole of that day is exactly within 90 days');
  assert.equal(firstRetainedDay('2026-11-30T00:00:00.001Z'), '2026-09-02', 'a millisecond later its first moment is past 90 days');
  assert.equal(firstRetainedDay('2026-11-30T23:59:59.999Z'), '2026-09-02');
  const f = setup(t);
  const { canvas } = await board(f);
  const seedAt = (name, at, day) => {
    f.sqlite.prepare("INSERT INTO publication_events (event_id, org, canvas, session_key, learner_key, type, received_at) VALUES (?, 'ana-ws', ?, ?, ?, 'open', ?)").run(name, canvas, name, name, at);
    f.sqlite.prepare("INSERT INTO publication_sessions (session_key, org, canvas, learner_key, started_at) VALUES (?, 'ana-ws', ?, ?, ?)").run(name, canvas, name, at);
    f.sqlite.prepare("INSERT INTO publication_learners (org, canvas, learner_key, last_seen_at) VALUES ('ana-ws', ?, ?, ?)").run(canvas, name, at);
    f.sqlite.prepare("INSERT INTO publication_learner_days (org, canvas, learner_key, day, segment) VALUES ('ana-ws', ?, ?, ?, 1)").run(canvas, name, day);
    f.sqlite.prepare("INSERT INTO publication_learner_items (org, canvas, learner_key, day, segment, kind, item_id) VALUES ('ana-ws', ?, ?, ?, 1, 'card_seen', 'b1')").run(canvas, name, day);
  };
  seedAt('exactly', '2026-09-01T00:00:00.000Z', '2026-09-01');
  seedAt('past', '2026-08-31T23:59:59.999Z', '2026-08-31');
  await runCleanup(f.env.LEARN_DB, '2026-11-30T00:00:00.000Z');
  const left = table => f.sqlite.prepare(`SELECT learner_key AS k FROM ${table} ORDER BY k`).all().map(r => r.k);
  for (const table of LEARNER_TABLES) assert.deepEqual(left(table), ['exactly'], table);
  await runCleanup(f.env.LEARN_DB, '2026-11-30T00:00:00.001Z');
  for (const table of ['publication_learner_days', 'publication_learner_items', 'publication_events', 'publication_sessions', 'publication_learners']) assert.deepEqual(left(table), [], table);
});

test('a failed cleanup is recorded and surfaced, reads keep working and keep excluding, and the next good run recovers', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  const at = iso => t.mock.timers.setTime(Date.parse(iso));
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-08-01T12:00:00Z') });
  const cleanup = async () => (await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana')).body.collection.cleanup;
  assert.deepEqual(await cleanup(), { healthy: null, last_ok_at: null, last_error_at: null }, 'before the first run: not yet known');
  await runCleanup(f.env.LEARN_DB);
  assert.equal((await cleanup()).healthy, true);
  await send(f, token, { events: [ev('open')] });
  at('2026-11-05T04:00:00Z');
  const original = f.env.LEARN_DB.batch, logged = t.mock.method(console, 'error', () => {});
  f.env.LEARN_DB.batch = async () => { throw new Error('D1 unavailable'); };
  await assert.rejects(runCleanup(f.env.LEARN_DB), /D1 unavailable/, 'the platform sees the invocation fail');
  const failed = await cleanup();
  f.env.LEARN_DB.batch = original;
  assert.equal(failed.healthy, false);
  assert.equal(failed.last_error_at, new Date().toISOString());
  assert.ok(logged.mock.callCount() >= 1, 'logged');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM publication_learner_days').get().n, 1, 'still stored after the failure');
  at('2026-11-05T04:30:00Z');
  await runCleanup(f.env.LEARN_DB);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM publication_learner_days').get().n, 0, 'recovered: the expired rows go');
  assert.equal((await cleanup()).healthy, true, 'and the status clears');
  t.mock.timers.reset();
  // Overdue counts as failing too: no run for over two days.
  assert.equal(cleanupHealth({ last_cleanup_ok_at: '2026-11-01T04:00:00.000Z' }, '2026-11-03T03:59:59.000Z').healthy, true);
  assert.equal(cleanupHealth({ last_cleanup_ok_at: '2026-11-01T04:00:00.000Z' }, '2026-11-03T04:00:01.000Z').healthy, false);
});

test('the long-lived tables cannot identify a visitor: their columns hold no person, and every per-person table is under retention and deletion', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../learn-migrations/0035-publication-analytics.sql', import.meta.url), 'utf8'));
  const columns = table => db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  assert.deepEqual(columns('publication_board_days'), ['org', 'canvas', 'day', 'opens', 'opens_from_stars', 'rabbit_holes_started', 'audience_forks']);
  assert.deepEqual(columns('publication_revisions'), ['org', 'canvas', 'version', 'card_set_key', 'segment', 'first_seen_at']);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'analytics_meta'").all().map(r => r.name);
  const personal = tables.filter(table => columns(table).some(c => /learner|session|visitor|user|email|event/.test(c)));
  assert.deepEqual(personal.sort(), [...LEARNER_TABLES].sort(), 'each is deleted by learner key and expired by purgeExpired');
  for (const table of LEARNER_TABLES) assert.ok(columns(table).includes('learner_key'), table);
  assert.ok(!tables.some(table => columns(table).some(c => /referrer|host|ip|agent|query|url/.test(c))), 'no free-form address column');
  db.close();
});

test('deletion by account and by visitor identifier removes exactly that person, across boards; other people and the counters stay', async t => {
  const f = setup(t);
  const a = await board(f, { title: 'One' }), b = await board(f, { title: 'Two' });
  const browser = uuid();
  await send(f, a.token, { visitor: browser, events: [ev('open'), ev('seen', { material_id: 'b1' })] });
  await send(f, b.token, { visitor: browser, events: [ev('open')] });
  await send(f, a.token, { as: 'ben', events: [ev('open'), ev('seen', { material_id: 'b1' })] });
  await f.call('POST', `/api/learn/boards/shared/${a.token}/rabbit-hole`, { as: 'ben', body: { origin: null } });
  await send(f, a.token, { as: 'cara', events: [ev('open')] });
  const ben = await accountKey({ userId: 'u-ben-9a2b' }), anon = await visitorKey(browser), cara = await accountKey({ userId: 'u-cara-71f0' });
  const rowsFor = key => LEARNER_TABLES.reduce((n, table) => n + f.sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE learner_key = ?`).get(key).n, 0);
  assert.ok(rowsFor(ben) > 0 && rowsFor(anon) > 0 && rowsFor(cara) > 0);
  f.sqlite.exec(deleteLearnerSql(ben).join('\n'));
  assert.deepEqual([rowsFor(ben) === 0, rowsFor(anon) > 0, rowsFor(cara) > 0], [true, true, true], 'by account');
  f.sqlite.exec(deleteLearnerSql(anon).join('\n'));
  assert.deepEqual([rowsFor(anon) === 0, rowsFor(cara) > 0], [true, true], 'by visitor identifier, on both boards');
  assert.equal(f.sqlite.prepare('SELECT sum(opens) AS n FROM publication_board_days').get().n, 4, 'the counters hold no person and stay');
  assert.throws(() => deleteLearnerSql("x'; DROP TABLE canvases; --"), /not a learner key/);
});

test('campaigns: only an approved id is stored and shown, whatever the case; an unknown value or a person is ignored', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  assert.ok(APPROVED_CAMPAIGNS.includes('linkedin-launch'));
  for (const campaign of ['LinkedIn-Launch', 'jane.doe', 'jane@example.com', 'launch?x=1', 42, null]) await send(f, token, { events: [ev('open', { source: 'linkedin', campaign })] });
  assert.deepEqual(f.sqlite.prepare('SELECT DISTINCT campaign FROM publication_learner_days ORDER BY campaign').all().map(r => r.campaign), [null, 'linkedin-launch']);
  f.sqlite.exec("UPDATE publication_learner_days SET campaign = 'retired-tag' WHERE campaign IS NULL");
  for (let i = 0; i < 10; i += 1) await send(f, token, { events: [ev('open', { campaign: 'LinkedIn-Launch' })] });
  const { campaigns } = (await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana')).body.sources;
  assert.deepEqual(campaigns.map(c => c.campaign), ['linkedin-launch'], 'a stored tag no longer approved is not shown');
});

test('starts and forks are recorded on their success paths only: once each, never on a replay, never for the owner', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  const start = await f.call('POST', `/api/learn/boards/shared/${token}/rabbit-hole`, { as: 'ben', body: { origin: { block_id: 'c1' } } });
  assert.equal(start.status, 201);
  const again = await f.call('POST', `/api/learn/boards/shared/${token}/rabbit-hole`, { as: 'ben', body: { origin: { block_id: 'c1' } } });
  assert.equal(again.status, 200, 'entering the existing hole');
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/rabbit-hole`, { body: { origin: null } })).status, 401, 'signed out: nothing starts');
  await f.call('POST', `/api/learn/boards/shared/${token}/rabbit-hole`, { as: 'ana', body: { origin: null } });
  const fork = await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body: { source: { token }, key: 'fork-key-0001' } });
  assert.equal(fork.status, 201);
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body: { source: { token }, key: 'fork-key-0001' } })).body.replayed, true);
  await f.call('POST', '/api/learn/boards/fork', { as: 'ana', body: { source: { token }, key: 'fork-key-0002' } });
  const kinds = f.sqlite.prepare('SELECT kind, count(*) AS n FROM publication_learner_items GROUP BY kind ORDER BY kind').all().map(r => [r.kind, r.n]);
  assert.deepEqual(kinds, [['concept_deeper', 1], ['fork', 1], ['start', 1]], 'one start (with its card\'s concept), one fork; the owner\'s are not audience');
  const body = (await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana')).body;
  assert.deepEqual([body.overview.rabbit_holes_started.value, body.overview.audience_forks.value, body.overview.canonical_forks.value], [1, 1, 2], 'canonical forks include the owner\'s; audience forks do not');
  // A share-link fork is not a publication conversion.
  const { token: share } = await f.shareProject();
  await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token: share }, key: 'fork-key-0003' } });
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM publication_learner_items WHERE kind = 'fork'").get().n, 1);
});

test('a failed fork records no conversion (same transaction)', async t => {
  const f = setup(t);
  const { token } = await board(f);
  const original = f.env.LEARN_DB.batch;
  f.env.LEARN_DB.batch = async list => { if (list.length > 3) throw new Error('D1 unavailable'); return original(list); };
  const failed = await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body: { source: { token }, key: 'fork-key-0009' } });
  f.env.LEARN_DB.batch = original;
  assert.equal(failed.status, 500);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM publication_learner_items WHERE kind = 'fork'").get().n, 0);
});

test('learning producers: quiz outcomes are decided on the server from the first try; Next Steps by position; concepts', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  await crowd(f, token, 10, i => [ev('quiz', { material_id: 'z1', choice: i < 4 ? 'b' : 'a' }), ev('quiz', { material_id: 'z1', choice: 'a' }),
    ev('seen', { material_id: 'c1' }), ...(i < 3 ? [ev('acted', { material_id: 'c1' })] : []),
    ev('steps_shown', { suggestions: [{ id: 'ns_0000000a.1', position: 1 }, { id: 'ns_0000000a.2', position: 2 }, { id: 'ns_0000000a.3', position: 3 }] }),
    ...(i < 5 ? [ev('step_selected', { suggestion_id: 'ns_0000000a.1', position: 1, concept_ids: ['learning-rate', 'not-on-this-board'] })] : [])]);
  const body = (await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana')).body;
  const quiz = body.learning.friction.find(q => q.material_id === 'z1');
  assert.deepEqual([quiz.assessed.value, quiz.incorrect.value, quiz.incorrect_rate.value], [10, 4, 0.4], 'a later right answer does not erase a first wrong one');
  assert.deepEqual(body.learning.next_steps.impressions.value, 30);
  assert.deepEqual(body.learning.next_steps.positions.map(p => [p.position, p.selections.value, p.rate.value]), [[1, 5, 0.5], [2, 0, 0], [3, 0, 0]]);
  const concept = body.learning.concepts.find(c => c.concept_id === 'learning-rate');
  assert.deepEqual([concept.seen.value, concept.explored_rate.value, concept.deeper_rate.value], [10, 0.3, 0.5]);
  assert.ok(!body.learning.concepts.some(c => c.concept_id === 'not-on-this-board'), 'a concept the board does not carry is dropped');
  assert.deepEqual(body.insights.map(i => [i.type, i.subject_id]), [['interest', 'learning-rate'], ['friction', 'z1']]);
  assert.doesNotMatch(JSON.stringify(f.sqlite.prepare('SELECT * FROM publication_learner_items').all()), /"b"|Along it/, 'the chosen option is not stored');
});

test('owner-only reads: 401 signed out, 404 for another creator\'s board, and the creator view holds only your own boards', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  await send(f, token, { events: [ev('open')] });
  assert.equal((await read(f, `/api/analytics/publications/${canvas}?range=7d`)).status, 401);
  assert.equal((await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ben')).status, 404);
  assert.equal((await read(f, '/api/analytics/publications/canvas-00000000?range=7d', 'ana')).status, 404);
  assert.equal((await read(f, `/api/analytics/publications/${canvas}?range=1y`, 'ana')).status, 400);
  const bens = (await read(f, '/api/analytics/creator?range=all', 'ben')).body;
  assert.deepEqual([bens.boards, bens.overview.total_opens.value], [[], 0]);
});

test('synthetic checks are identifiable and never audience; the owner can read them apart', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  await send(f, token, { synthetic: true, events: [ev('open', { source: 'direct' })] });
  const real = (await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana')).body;
  assert.deepEqual([real.overview.total_opens.value, real.collection.synthetic_excluded], [0, 1]);
  const checks = (await read(f, `/api/analytics/publications/${canvas}?range=7d&synthetic=only`, 'ana')).body;
  assert.equal(checks.overview.total_opens.value, 1);
});

test('stars come from the Stars read model: current counts, owner against audience, additions and removals, opens from Stars', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  const before = (await read(f, '/api/analytics/creator?range=7d', 'ana')).body;
  assert.deepEqual(before.stars.additions, { value: null, reason: 'not_collected' }, 'no star event yet: not collected, not zero');
  await f.call('PUT', `/api/learn/boards/shared/${token}/star`, { as: 'ben' });
  await f.call('PUT', `/api/learn/boards/shared/${token}/star`, { as: 'cara' });
  await f.call('DELETE', `/api/learn/boards/shared/${token}/star`, { as: 'cara' });
  await send(f, token, { events: [ev('open', { source: 'stars' })] });
  const body = (await read(f, '/api/analytics/creator?range=7d', 'ana')).body;
  assert.deepEqual([body.overview.stars_now.value, body.overview.stars_from_audience.value, body.stars.additions.value, body.stars.removals.value, body.stars.net.value, body.stars.opens_from_stars.value], [1, 1, 2, 1, 1, 1]);
  const row = body.boards.find(b => b.canvas === canvas);
  assert.deepEqual([row.stars_now.value, row.star_additions.value, row.star_removals.value, row.star_net.value], [1, 2, 1, 1]);
});

test('coverage: a range that starts before collection is partial; all time starts at collection; a storage failure is a 503, never zeros', async t => {
  const f = setup(t);
  const { canvas } = await board(f);
  const week = (await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana')).body;
  assert.equal(week.period.partial, true);
  assert.equal(week.period.timezone, 'UTC');
  const all = (await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana')).body;
  assert.deepEqual([all.period.partial, all.period.from], [false, all.collection.started_at.slice(0, 10)]);
  f.sqlite.exec('DROP TABLE publication_learner_items');
  const failed = await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana');
  assert.deepEqual([failed.status, failed.body.code], [503, 'analytics_unavailable']);
});

test('history is the canvas\'s: a republish keeps it under a new token; a permanent delete removes it', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  await send(f, token, { events: [ev('open')] });
  await f.call('POST', `/api/apps/${canvas}/unpublish`, { as: 'ana' });
  const again = (await f.call('POST', `/api/apps/${canvas}/publish`, { as: 'ana' })).body.publication_token;
  assert.notEqual(again, token);
  await send(f, again, { events: [ev('open')] });
  assert.equal((await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana')).body.overview.total_opens.value, 2);
  assert.equal((await f.call('DELETE', `/api/apps/${canvas}`, { as: 'ana' })).status, 200);
  for (const table of [...LEARNER_TABLES, 'publication_board_days', 'publication_revisions']) assert.equal(f.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0, table);
});

test('collection status is verified: a failed ingest batch turns it degraded until a later batch succeeds', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-02T10:00:00Z') });
  const status = async () => (await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana')).body.collection.status;
  assert.equal(await status(), 'active');
  const original = f.env.LEARN_DB.batch;
  f.env.LEARN_DB.batch = async () => { throw new Error('D1 unavailable'); };
  assert.equal((await send(f, token, { events: [ev('open')] })).status, 503);
  f.env.LEARN_DB.batch = original;
  assert.equal(await status(), 'degraded');
  t.mock.timers.tick(1000);
  assert.equal((await send(f, token, { events: [ev('open')] })).status, 200);
  assert.equal(await status(), 'active');
  t.mock.timers.reset();
});

test('a creator-scope interest insight names the board its concept came from, for the follow-up prompt', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  await crowd(f, token, 10, () => [ev('seen', { material_id: 'c1' }), ev('step_selected', { suggestion_id: 'ns_00000000.1', position: 1, concept_ids: ['learning-rate'] })]);
  const insight = (await read(f, '/api/analytics/creator?range=7d', 'ana')).body.insights.find(i => i.type === 'interest');
  assert.deepEqual([insight.canvas, insight.subject_id, insight.denominator], [canvas, 'learning-rate', 10]);
});

test('review regressions: Stars opens by the visit, a visit over midnight is not returning, the first answer stays first, hidden rows are absent, a bad id is ignored', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T23:59:00Z') });
  const browser = uuid(), late = uuid();
  await send(f, token, { visitor: browser, session: late, events: [ev('open', { source: 'direct' })] });
  t.mock.timers.tick(120_000);
  await send(f, token, { visitor: browser, session: late, events: [ev('active', { active_seconds: 100 })] });
  await send(f, token, { visitor: browser, events: [ev('open', { source: 'stars' })] });
  await send(f, token, { visitor: browser, events: [ev('open', { source: 'direct' })] });
  for (let i = 0; i < 9; i += 1) await send(f, token, { events: [ev('open', { source: 'stars' }), ev('quiz', { material_id: 'z1', choice: 'b' })] });
  const before = (await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana')).body;
  assert.equal(before.stars.opens_from_stars.value, 10, 'the Stars visits only, whatever the day\'s first source');
  assert.deepEqual(before.learning.friction, [], 'nine answers: no row at all');
  const midnight = uuid(), oneVisit = uuid();
  await send(f, token, { visitor: midnight, session: oneVisit, events: [ev('open', { source: 'direct' })] });
  t.mock.timers.tick(86400e3);
  assert.equal((await send(f, token, { visitor: midnight, session: oneVisit, events: [ev('active', { active_seconds: 60 })] })).body.accepted, 1);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM publication_learner_days WHERE opens = 0 AND active_seconds = 60").get().n, 1, 'the visit ran into a new day');
  assert.equal((await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana')).body.overview.returning_visitors.value, 1, 'only the browser that opened on two days; one visit past midnight is not a return');
  const quizzer = uuid();
  await send(f, token, { visitor: quizzer, events: [ev('quiz', { material_id: 'z1', choice: 'b' })] });
  t.mock.timers.tick(8 * 86400e3);
  await send(f, token, { visitor: quizzer, events: [ev('quiz', { material_id: 'z1', choice: 'a' })] });
  const week = await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana');
  assert.deepEqual(week.body.learning.friction, [], 'a retry in this range is not this range\'s first answer');
  assert.deepEqual((await send(f, token, { events: [ev('step_selected', { position: 1 }), ev('steps_shown', { suggestions: [{ position: 1 }] })] })).body, { accepted: 0, ignored: 2 });
  t.mock.timers.reset();
});

test('analytics never costs a start or a fork: if preparing its row fails, the action succeeds uncounted', async t => {
  const f = setup(t);
  const { token } = await board(f);
  f.sqlite.exec('DROP TABLE publication_revisions');
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/rabbit-hole`, { as: 'ben', body: { origin: null } })).status, 201);
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body: { source: { token }, key: 'fork-key-0010' } })).status, 201);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM publication_learner_items').get().n, 0);
});

test('revisions: a change of the card set starts a new segment; a text edit does not', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  await send(f, token, { events: [ev('open')] });
  const edited = { ...STATE, blocks: STATE.blocks.map(b => (b.id === 'b1' ? { ...b, body: 'Reworded.' } : b)) };
  await f.call('PUT', `/api/learn/boards/${canvas}/main`, { as: 'ana', body: { state: edited } });
  await send(f, token, { events: [ev('open')] });
  await f.call('PUT', `/api/learn/boards/${canvas}/main`, { as: 'ana', body: { state: { ...edited, blocks: [...edited.blocks, { id: 'n1', type: 'explanation', title: 'New card', body: 'x' }] } } });
  await send(f, token, { events: [ev('open')] });
  const segments = f.sqlite.prepare('SELECT version, segment FROM publication_revisions ORDER BY version').all().map(r => [r.version, r.segment]);
  assert.equal(segments[0][1], segments[1][1], 'a text edit keeps the segment');
  assert.notEqual(segments[2][1], segments[1][1], 'a new card starts one');
  const rev = (await read(f, `/api/analytics/publications/${canvas}?range=all`, 'ana')).body.learning.revisions;
  assert.equal(rev.status, 'insufficient');
  assert.deepEqual(rev.after.visitors, { value: null, reason: 'insufficient_cohort' });
});

test('learn 0035 is CREATE-only, re-runnable and mirrored verbatim at the end of repository-schema.sql', () => {
  const migration = readFileSync(new URL('../learn-migrations/0035-publication-analytics.sql', import.meta.url), 'utf8').replace(/\r/g, '');
  const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8').replace(/\r/g, '');
  for (const s of migration.replace(/--.*$/gm, '').split(';').map(x => x.trim()).filter(Boolean)) assert.match(s, /^CREATE (TABLE|(UNIQUE )?INDEX) IF NOT EXISTS /);
  assert.ok(schema.trimEnd().endsWith(migration.trim()));
  const db = new DatabaseSync(':memory:');
  db.exec(migration); db.exec(migration);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(r => r.name), ['analytics_meta', 'publication_board_days', 'publication_events', 'publication_learner_days', 'publication_learner_items', 'publication_learners', 'publication_revisions', 'publication_sessions']);
  db.close();
});
