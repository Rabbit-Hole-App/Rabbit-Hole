// Weekly Top 5 (docs/features/explore-weekly-top.md) on the shared-canvas fixture (LEARN_DB as node:sqlite built from
// repository-schema.sql). Fixture evidence only: it proves the SQL, week arithmetic, ordering, cache revalidation and privacy
// decisions, not a deployed D1 and not a browser. Stars and forks are seeded by SQL so their times are exact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { setup } from './shared-canvas-fixture.js';
import { canvasOf, handle } from './stars-helpers.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { weekOf, weeklyTop, weeklyTopFetch, resetWeeklyTopCache, WEEKLY_SQL } from '../src/weekly-top.js';
import { weeklyTopFixture, weeklyTopEmptyFixture } from '../../web/src/home/weekly-top-fixture.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0029-weekly-top.sql', import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-21T19:00:00Z'); // Wednesday noon in Los Angeles; the week began 2026-10-19T07:00Z
const IN = '2026-10-20T10:00:00.000Z', LATER = '2026-10-21T10:00:00.000Z', LAST = '2026-10-14T10:00:00.000Z';
const starAt = at => at.replace('T', ' ').replace('Z', '');
const iso = ms => new Date(ms).toISOString();

test('week: Monday 00:00 Los Angeles, UTC boundaries follow daylight saving, 167 and 169 hour weeks', () => {
  const w = ms => { const r = weekOf(Date.parse(ms)); return [iso(r.start), iso(r.end), (r.end - r.start) / 3600000, r.startLocal, r.endLocal]; };
  assert.deepEqual(w('2026-10-23T18:00:00Z'), ['2026-10-19T07:00:00.000Z', '2026-10-26T07:00:00.000Z', 168, '2026-10-19', '2026-10-26']);
  assert.deepEqual(w('2026-03-04T12:00:00Z'), ['2026-03-02T08:00:00.000Z', '2026-03-09T07:00:00.000Z', 167, '2026-03-02', '2026-03-09'], 'spring forward (Sunday 2026-03-08)');
  assert.deepEqual(w('2026-10-28T12:00:00Z'), ['2026-10-26T07:00:00.000Z', '2026-11-02T08:00:00.000Z', 169, '2026-10-26', '2026-11-02'], 'fall back (Sunday 2026-11-01)');
  assert.equal(w('2026-11-03T12:00:00Z')[0], '2026-11-02T08:00:00.000Z', 'the week after the change starts at 08:00Z (PST)');
  assert.equal(w('2026-10-19T07:00:00.000Z')[0], '2026-10-19T07:00:00.000Z', 'the start instant belongs to the new week');
  assert.equal(w('2026-10-19T06:59:59.999Z')[0], '2026-10-12T07:00:00.000Z', 'one ms earlier is still the old week');
  assert.equal(w('2026-10-19T03:00:00Z')[0], '2026-10-12T07:00:00.000Z', 'Monday in UTC can still be Sunday in Los Angeles');
});

test('0029 is additive, re-runnable, mirrored into the schema, and both week scans use their index', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(schema); sqlite.exec(migration); sqlite.exec(migration);
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration.replace(/--[^\n]*/g, ''), /\b(DROP|ALTER|DELETE|UPDATE|INSERT|CREATE TABLE)\b/i);
  for (const sql of Object.values(WEEKLY_SQL)) {
    const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all('a', 'b', 'c', 'd').map(r => r.detail).join('\n');
    assert.match(plan, /canvas_star_events_added_at/);
    assert.match(plan, /canvas_forks_at/);
  }
});

// A world: ana (A1, A2), ben (B1), cara (C1, never public). Stars and forks by invented people.
async function world(t) {
  resetWeeklyTopCache();
  const f = setup(t);
  handle(f, 'ana@test', 'ana', 'Ana Lee'); handle(f, 'ben@test', 'ben'); handle(f, 'cara@test', 'cara');
  const mk = async (as, title, publish = true) => { const { canvas, token } = await canvasOf(f, as, title, { publish }); return { org: `${as}-ws`, name: canvas.name, token, title }; };
  const c = { A1: await mk('ana', 'Ana one'), A2: await mk('ana', 'Ana two'), B1: await mk('ben', 'Ben one'), C1: await mk('cara', 'SECRET-TITLE private', false) };
  const db = f.sqlite;
  const event = (kind, cv, user, owner, at) => db.prepare('INSERT INTO canvas_star_events (event_id, kind, reason, org, canvas, user_id, owner_star, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), kind, 'voluntary', cv.org, cv.name, user, owner, starAt(at));
  // `adds` are the person's add times (a removal sits between adds); active: the star is held now.
  const star = (cv, user, adds, { active = true, owner = 0 } = {}) => {
    adds.forEach((at, i) => { if (i) event('removed', cv, user, owner, iso(Date.parse(at) - 1)); event('added', cv, user, owner, at); });
    if (active) db.prepare('INSERT INTO canvas_stars (org, canvas, user_id, user_email, created_at) VALUES (?, ?, ?, ?, ?)').run(cv.org, cv.name, user, `${user}@x.test`, starAt(adds.at(-1)));
    else event('removed', cv, user, owner, iso(Date.parse(adds.at(-1)) + 1));
  };
  // actor: the forker's email; live: the fork canvas still exists (a deleted fork keeps its canvas_forks row, as the app does).
  const fork = (cv, actor, at, { live = true, parent = cv } = {}) => {
    const name = `canvas-${crypto.randomUUID().slice(0, 8)}`, org = `${actor.split('@')[0]}-ws`;
    if (live) db.prepare('INSERT INTO canvases(org,name,owner_email,title,project,device_id) VALUES(?,?,?,?,NULL,NULL)').run(org, name, actor, 'a fork');
    db.prepare('INSERT INTO canvas_forks (org, canvas, owner_email, fork_key, forked_from_org, forked_from_canvas_id, root_org, root_canvas_id, forked_from_owner_id, forked_from_title, forked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(org, name, actor, crypto.randomUUID(), parent.org, parent.name, cv.org, cv.name, 'owner', cv.title, at);
    return { org, name, title: 'a fork' };
  };
  return { f, db, c, star, fork, top: (now = NOW) => weeklyTop(f.env.LEARN_DB, now) };
}

async function ranked(t) {
  const w = await world(t), { c, star, fork } = w;
  // A1: u1 (re-added within the week), u2, u3 count; the owner, an unstarred person and last week's first starrer do not.
  star(c.A1, 'u1', [IN, LATER]); star(c.A1, 'u2', [IN]); star(c.A1, 'u3', [IN]);
  star(c.A1, 'ana', [IN], { owner: 1 }); star(c.A1, 'gone', [IN], { active: false });
  star(c.A1, 'veteran', [LAST, IN]); // first star was last week: re-starring this week manufactures nothing
  const mine = fork(c.A1, 'u1@x.test', IN); fork(c.A1, 'ana@test', IN); // one real fork, one self-fork
  fork(c.A1, 'u8@x.test', IN, { parent: mine }); // a fork of u1's fork descends from A1 but is not a direct fork of A1
  // A2: three stars; u1 forked twice (one fork) and u5 once; u6 forked last week, deleted it and forked again; u7 forked then deleted.
  star(c.A2, 'u2', [IN]); star(c.A2, 'u3', [IN]); star(c.A2, 'u4', [IN]);
  fork(c.A2, 'u1@x.test', IN); fork(c.A2, 'u1@x.test', LATER); fork(c.A2, 'u5@x.test', IN);
  fork(c.A2, 'u6@x.test', LAST, { live: false }); fork(c.A2, 'u6@x.test', IN);
  fork(c.A2, 'u7@x.test', IN, { live: false });
  // B1 ties A2 on (3 stars, 2 forks): the lower canonical id wins, ana-ws before ben-ws.
  star(c.B1, 'u1', [IN]); star(c.B1, 'u2', [IN]); star(c.B1, 'u3', [IN]);
  fork(c.B1, 'u1@x.test', IN); fork(c.B1, 'u2@x.test', IN);
  // C1 is not public: heavy activity must not surface.
  for (const u of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']) { star(c.C1, u, [IN]); fork(c.C1, `${u}@x.test`, IN); }
  return w;
}

test('canvas ranking: stars, then forks, then canonical id; self, repeated, unstarred, re-starred and deleted-fork activity do not inflate', async t => {
  const { c, top } = await ranked(t);
  const body = await top();
  assert.deepEqual(body.canvases.entries.map(e => [e.rank, e.url, e.weekly_star_count, e.weekly_fork_count]),
    [[1, `/e/${c.A2.token}`, 3, 2], [2, `/e/${c.B1.token}`, 3, 2], [3, `/e/${c.A1.token}`, 3, 1]]);
  assert.equal(body.canvases.empty_message, null);
  assert.equal(body.star_history_since, '2026-10-14T10:00:00.000Z', 'the first recorded star transition');
});

test('creator ranking: distinct supporters across the creator\'s eligible canvases, each person once per metric', async t => {
  const { top } = await ranked(t);
  const { creators } = await top();
  // ana: stars u1 u2 u3 (A1) + u2 u3 u4 (A2) = u1..u4; forks u1 (both canvases, once) and u5. ben: u1 u2 u3 / u1 u2. cara never public.
  assert.deepEqual(creators.entries.map(e => [e.rank, e.handle, e.name, e.url, e.weekly_star_supporter_count, e.weekly_fork_supporter_count]),
    [[1, 'ana', 'Ana Lee', '/@ana', 4, 2], [2, 'ben', null, '/@ben', 3, 2]]);
});

test('week boundaries: a star at the start instant counts, one ms before it and the end instant do not (across the spring DST change)', async t => {
  const { c, star, fork, top } = await world(t);
  const start = '2026-03-09T07:00:00.000Z', before = '2026-03-09T06:59:59.999Z', now = Date.parse('2026-03-12T20:00:00Z');
  star(c.A1, 'on', [start]); star(c.A1, 'early', [before]); star(c.A1, 'next', ['2026-03-16T07:00:00.000Z']);
  fork(c.A1, 'f_on@x.test', start); fork(c.A1, 'f_early@x.test', before); fork(c.A1, 'f_next@x.test', '2026-03-16T07:00:00.000Z');
  const body = await top(now);
  assert.deepEqual([body.week_start, body.week_end], [start, '2026-03-16T07:00:00.000Z']);
  assert.deepEqual(body.canvases.entries.map(e => [e.weekly_star_count, e.weekly_fork_count]), [[1, 1]]);
});

test('fewer than five, and none: only entries with qualifying activity, a neutral message, no fake rows', async t => {
  const { c, star, top } = await world(t);
  const none = await top();
  assert.deepEqual([none.canvases.entries, none.creators.entries, none.star_history_since], [[], [], null]);
  assert.match(none.canvases.empty_message, /No canvases/); assert.match(none.creators.empty_message, /No creators/);
  assert.deepEqual(Object.keys(none), Object.keys(weeklyTopEmptyFixture), 'the empty answer has the committed fixture\'s shape');
  resetWeeklyTopCache();
  star(c.B1, 'u1', [IN]);
  const one = await top();
  assert.equal(one.canvases.entries.length, 1); assert.equal(one.creators.entries.length, 1);
  assert.deepEqual([one.canvases.empty_message, one.creators.empty_message], [null, null]);
});

test('at most five entries are returned', async t => {
  const { f, db, star, top } = await world(t);
  for (let i = 0; i < 7; i++) {
    handle(f, `p${i}@test`, `pp${i}`);
    db.prepare('INSERT INTO canvases(org,name,owner_email,title,project,device_id) VALUES(?,?,?,?,NULL,NULL)').run(`p${i}-ws`, `canvas-0000000${i}`, `p${i}@test`, `T${i}`);
    db.prepare('INSERT INTO canvas_publications (org, canvas, token) VALUES (?, ?, ?)').run(`p${i}-ws`, `canvas-0000000${i}`, `tok${i}`);
    star({ org: `p${i}-ws`, name: `canvas-0000000${i}` }, 'u1', [IN]);
  }
  const body = await top();
  assert.deepEqual([body.canvases.entries.length, body.creators.entries.length], [5, 5]);
  assert.deepEqual(body.canvases.entries.map(e => e.url), ['/e/tok0', '/e/tok1', '/e/tok2', '/e/tok3', '/e/tok4'], 'all tied: canonical id order');
});

test('eligibility on every return, cache included: unpublish, trash, archive and delete remove a canvas and its share of the creator at once', async t => {
  const { f, db, c, top } = await ranked(t);
  const first = await top(), again = await top(NOW + 30000);
  assert.equal(again, first, 'within the freshness window the same answer is served');
  const urls = body => body.canvases.entries.map(e => e.url);
  await f.call('POST', `/api/apps/${c.A2.name}/unpublish`, { as: 'ana' });
  const unpublished = await top(NOW + 31000);
  assert.deepEqual(urls(unpublished), [`/e/${c.B1.token}`, `/e/${c.A1.token}`], 'unpublished: gone before the 60 seconds are up');
  assert.deepEqual(unpublished.creators.entries.map(e => [e.handle, e.weekly_star_supporter_count, e.weekly_fork_supporter_count]), [['ana', 3, 1], ['ben', 3, 2]].sort((a, b) => b[1] - a[1] || b[2] - a[2]), 'ana\'s numbers no longer include the private canvas');
  assert.equal((await top(NOW + 32000)), unpublished, 'and the new answer is cached');
  db.prepare("INSERT INTO library_trash (org, name, trashed_at) VALUES (?, ?, '2026-10-21')").run(c.B1.org, c.B1.name);
  assert.deepEqual(urls(await top(NOW + 33000)), [`/e/${c.A1.token}`], 'trashed');
  db.prepare('UPDATE canvases SET archived_at = ? WHERE org = ? AND name = ?').run('2026-10-21', c.A1.org, c.A1.name);
  const archived = await top(NOW + 34000);
  assert.deepEqual([archived.canvases.entries, archived.creators.entries], [[], []], 'archived');
  assert.match(archived.canvases.empty_message, /No canvases/);
});

test('deleting a canvas or an owner losing the handle removes it from a cached answer', async t => {
  const { db, c, top } = await ranked(t);
  await top();
  db.prepare('DELETE FROM canvases WHERE org = ? AND name = ?').run(c.B1.org, c.B1.name);
  assert.equal((await top(NOW + 1000)).canvases.entries.some(e => e.url === `/e/${c.B1.token}`), false);
  db.prepare("DELETE FROM user_handles WHERE email = 'ana@test'").run();
  const body = await top(NOW + 2000);
  assert.deepEqual([body.canvases.entries, body.creators.entries], [[], []]);
});

test('the cache is explicit about staleness: a new star appears after max_age_seconds, not before; a new week recomputes', async t => {
  const { c, star, top } = await ranked(t);
  const first = await top();
  assert.equal(first.freshness.max_age_seconds, 60);
  star(c.B1, 'late', [LATER]);
  assert.equal((await top(NOW + 59000)).canvases.entries.find(e => e.url === `/e/${c.B1.token}`).weekly_star_count, 3, 'still the remembered counts');
  assert.equal((await top(NOW + 61000)).canvases.entries[0].url, `/e/${c.B1.token}`, 'recomputed: 4 stars now leads');
  const next = await top(Date.parse('2026-10-27T20:00:00Z'));
  assert.deepEqual([next.week_start_local, next.canvases.entries], ['2026-10-26', []], 'next week starts empty');
});

test('no leakage: no email, user id, private title or private token in any answer', async t => {
  const { f, c, top } = await ranked(t);
  const text = JSON.stringify(await top());
  // 'u1' is matched as a whole value: published tokens are random base64url, and a token can contain the two characters by chance.
  assert.equal(/(^|[^A-Za-z0-9_-])u1($|[^A-Za-z0-9_-])/.test(text), false, 'u1');
  for (const secret of ['@test', '@x.test', 'veteran', 'SECRET', 'x-ws', c.A1.org, c.A1.name, c.C1.name, 'view_token', 'owner_email']) assert.equal(text.includes(secret), false, secret);
  const route = await learnBoardsRoute('/api/learn/boards/published/weekly-top', new Request('https://app.test/api/learn/boards/published/weekly-top'), f.env);
  assert.deepEqual([route.status, route.headers.get('cache-control')], [200, 'no-store']);
});

test('the route: anonymous GET, committed fixture shape, 405 for other methods, 503 without the database, 500 on failure', async t => {
  const { f, c } = await ranked(t);
  const call = (method, env = f.env) => weeklyTopFetch(new Request('https://app.test/api/learn/boards/published/weekly-top', { method }), env);
  const ok = await call('GET'), body = await ok.json();
  assert.deepEqual([ok.status, ok.headers.get('cache-control')], [200, 'no-store']);
  assert.deepEqual(Object.keys(body), Object.keys(weeklyTopFixture));
  assert.deepEqual(Object.keys(body.canvases.entries[0]), Object.keys(weeklyTopFixture.canvases.entries[0]));
  assert.deepEqual(Object.keys(body.canvases.entries[0].creator), Object.keys(weeklyTopFixture.canvases.entries[0].creator));
  assert.deepEqual(Object.keys(body.creators.entries[0]), Object.keys(weeklyTopFixture.creators.entries[0]));
  assert.equal(body.canvases.entries[0].thumbnail_url, `/api/learn/boards/published/${c.A2.token}/thumbnail`);
  assert.equal((await call('POST')).status, 405);
  const noDb = await call('GET', {});
  assert.deepEqual([noDb.status, (await noDb.json()).code], [503, 'weekly_top_unavailable']);
  resetWeeklyTopCache();
  const broken = await call('GET', { LEARN_DB: { prepare: () => { throw new Error('d1 down'); } } });
  assert.deepEqual([broken.status, (await broken.json()).code], [500, 'weekly_top_failed']);
});
