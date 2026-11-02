// Creator analytics (publication-analytics.js, learn-migrations/0035): ingest from a public board, the start and fork
// conversions, and the owner's reads, on the shared-canvas fixture (LEARN_DB as node:sqlite). ana owns the board; ben and
// cara visit signed in; anonymous browsers visit with only a visitor id. No model is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { handle } from './stars-helpers.js';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { analyticsRoute } from '../src/publication-analytics.js';

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
const send = (f, token, { as, visitor = uuid(), session = uuid(), synthetic, events }) =>
  f.call('POST', `/api/learn/boards/shared/${token}/events`, { as, body: { visitor_id: visitor, session_id: session, ...(synthetic ? { synthetic: true } : {}), events } });
async function read(f, path, as) {
  const req = new Request(`https://app.test${path}`, { headers: as ? { cookie: `small_session=${as}` } : {} });
  const res = await analyticsRoute(new URL(req.url).pathname, req, f.env);
  return { status: res.status, body: await res.json() };
}
// n anonymous visits, each its own browser, opening the board and seeing card b1.
async function crowd(f, token, n, extra = () => []) {
  for (let i = 0; i < n; i += 1) assert.equal((await send(f, token, { events: [ev('open', { source: 'linkedin', campaign: 'Launch-Post' }), ev('seen', { material_id: 'b1' }), ...extra(i)] })).body.accepted >= 2, true);
}

test('an anonymous visit is collected, counted as an open, and shown to the owner without exposing a small audience', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  const visit = await send(f, token, { events: [ev('open', { source: 'other_referrer', referrer_host: 'News.Example.com', campaign: 'Spring_2026' }), ev('seen', { material_id: 'b1' }), ev('acted', { material_id: 'c1' }), ev('resource', { resource_id: 'video:kCc8FmEb1nY' })] });
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
  const dump = JSON.stringify(['publication_events', 'publication_learners', 'publication_sessions', 'publication_learner_days', 'publication_learner_items', 'publication_visitor_links'].map(tb => f.sqlite.prepare(`SELECT * FROM ${tb}`).all()));
  assert.doesNotMatch(dump, /@test|u-ana|u-ben|news\.example\.com\/|Spring_2026/);
  assert.ok(!dump.includes(token), 'the token is never stored');
  assert.match(dump, /news\.example\.com/, 'the hostname alone is kept for other referrers');
  assert.match(dump, /spring_2026/, 'a campaign tag is lowercased');
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
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/events`, { body: { visitor_id: 'not-a-uuid', session_id: uuid(), events: [ev('open')] } })).status, 400);
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/events`, { raw: 'x'.repeat(70 * 1024) })).status, 413);
  const mixed = await send(f, token, { events: [ev('open'), ev('seen', { material_id: 'nope' }), ev('resource', { resource_id: 'paper:9999' }), ev('steps_shown', { suggestions: [{ id: 'bad id!', position: 1 }] }),
    ev('step_selected', { suggestion_id: 's1', position: 9 }), ev('quiz', { material_id: 'b1', choice: 'a' }), ev('mystery'), { type: 'open' }] });
  assert.deepEqual(mixed.body, { accepted: 1, ignored: 7 });
});

test('the creator\'s own visits never count: signed in, and later anonymously on a browser they signed in on', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  const browser = uuid();
  const own = await send(f, token, { as: 'ana', visitor: browser, events: [ev('open'), ev('active', { active_seconds: 30 })] });
  assert.deepEqual(own.body, { accepted: 0, ignored: 2, dropped: 'own_visit' });
  const after = await send(f, token, { visitor: browser, events: [ev('open')] });
  assert.equal(after.body.dropped, 'own_visit', 'the same browser signed out is still the creator');
  const read7 = (await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana')).body;
  assert.equal(read7.overview.total_opens.value, 0);
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
  const seconds = f.sqlite.prepare('SELECT sum(active_seconds) AS s FROM publication_learner_days').get().s;
  assert.equal(seconds, 120, 'at most the 120 s of wall clock since the visit began, across both tabs');
  const sessions = f.sqlite.prepare('SELECT credited_active FROM publication_sessions ORDER BY credited_active').all().map(r => r.credited_active);
  assert.deepEqual(sessions, [30, 90]);
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
  assert.deepEqual(sources.linkedin, { value: 12, reason: null });
  assert.deepEqual(sources.explore, { value: null, reason: 'insufficient_cohort' });
  assert.deepEqual(body.sources.campaigns, [{ campaign: 'launch-post', visitors: { value: 12, reason: null }, start_rate: { value: 0, reason: null } }]);
  // Signed in 0 and anonymous 14: one cell under ten, so its complement is hidden too.
  assert.deepEqual([body.overview.signed_in_visitors.reason, body.overview.anonymous_visitors.reason], ['insufficient_cohort', 'complementary']);
});

test('a browser that signs in counts once, as the account; signed-in visits are deduplicated across boards and days', async t => {
  const f = setup(t);
  const a = await board(f, { title: 'One' }), b = await board(f, { title: 'Two' });
  const browser = uuid();
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T23:59:00Z') });
  await send(f, a.token, { visitor: browser, events: [ev('open')] });
  t.mock.timers.tick(120_000); // across the UTC midnight
  await send(f, a.token, { as: 'ben', visitor: browser, events: [ev('open')] });
  await send(f, b.token, { as: 'ben', visitor: uuid(), events: [ev('open')] });
  const raw = (await read(f, '/api/analytics/creator?range=7d', 'ana'));
  t.mock.timers.reset();
  assert.equal(raw.status, 200);
  const rows = f.sqlite.prepare('SELECT DISTINCT day FROM publication_learner_days ORDER BY day').all().map(r => r.day);
  assert.deepEqual(rows, ['2026-11-01', '2026-11-02'], 'each UTC day is its own row');
  // Nine other browsers bring the cohort to exactly ten only if ben's browser, his two boards and his two days count once.
  for (let i = 0; i < 9; i += 1) await send(f, a.token, { events: [ev('open')] });
  const all = (await read(f, '/api/analytics/creator?range=all', 'ana')).body;
  assert.deepEqual(all.overview.unique_visitors, { value: 10, reason: null }, 'never a sum of boards or days');
  assert.equal(all.overview.total_opens.value, 12);
  assert.equal(all.overview.returning_visitors.value, 1, 'ben: two distinct days, across the linked browser');
  assert.equal(all.boards.find(x => x.canvas === a.canvas).visitors.value, 10);
});

test('rate limits and retention: a session over its cap is refused; raw event ids older than 90 days are pruned, rollups stay', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  const { sha256Hex } = await import('../src/learn-grade-jev.js');
  const visitor = uuid(), session = uuid();
  const key = await sha256Hex(`${await sha256Hex(`publication-learner:v:${visitor}`)}:${session}`);
  const add = f.sqlite.prepare('INSERT INTO publication_events (event_id, org, canvas, session_key, type, received_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 3000; i += 1) add.run(`e${i}`, 'ana-ws', canvas, key, 'seen', new Date().toISOString());
  const limited = await send(f, token, { visitor, session, events: [ev('open')] });
  assert.deepEqual([limited.status, limited.body.limited], [429, true]);
  f.sqlite.exec('DELETE FROM publication_events');
  add.run('old', 'ana-ws', canvas, 'k', 'seen', new Date(Date.now() - 91 * 86400e3).toISOString());
  add.run('kept', 'ana-ws', canvas, 'k', 'seen', new Date(Date.now() - 89 * 86400e3).toISOString());
  assert.equal((await send(f, token, { events: [ev('open')] })).body.accepted, 1);
  assert.deepEqual(f.sqlite.prepare("SELECT event_id FROM publication_events WHERE event_id IN ('old', 'kept')").all().map(r => r.event_id), ['kept']);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM publication_learner_days').get().n, 1);
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
    ev('steps_shown', { suggestions: [{ id: 'step-a', position: 1 }, { id: 'step-b', position: 2 }, { id: 'step-c', position: 3 }] }),
    ...(i < 5 ? [ev('step_selected', { suggestion_id: 'step-a', position: 1, concept_ids: ['learning-rate', 'not-on-this-board'] })] : [])]);
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
  for (const table of ['publication_events', 'publication_learners', 'publication_sessions', 'publication_learner_days', 'publication_revisions']) assert.equal(f.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0, table);
});

test('referrer hosts leave no small remainder of the other-referrer total', async t => {
  const f = setup(t);
  const { canvas, token } = await board(f);
  for (let i = 0; i < 12; i += 1) await send(f, token, { events: [ev('open', { source: 'other_referrer', referrer_host: 'news.example.com' })] });
  const exact = (await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana')).body;
  assert.deepEqual(exact.sources.referrers, [{ host: 'news.example.com', visitors: { value: 12, reason: null } }]);
  await send(f, token, { events: [ev('open', { source: 'other_referrer', referrer_host: 'small.example.org' })] });
  const small = (await read(f, `/api/analytics/publications/${canvas}?range=7d`, 'ana')).body;
  assert.deepEqual(small.sources.referrers, [], 'naming the big host would reveal the one visitor left over');
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
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(r => r.name), ['analytics_meta', 'publication_events', 'publication_learner_days', 'publication_learner_items', 'publication_learners', 'publication_revisions', 'publication_sessions', 'publication_visitor_links']);
  db.close();
});
