// Tutor ladder R2: learn-migrations/0037 and the Depth and Auto-suggest store and route (learn-user-settings.js), on node:sqlite behind
// the D1 slice the stores use. Depth is per learner and canvas and its writes are revision-guarded; Auto-suggest is per learner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { learnDb } from './learn-grade-fixture.js';
import { DEFAULT_SETTINGS, readAutoSuggest, readDepth, readSettings, saveAutoSuggest, setDepth, userSettingsRoute } from '../src/learn-user-settings.js';

const MIGRATION = readFileSync(new URL('../learn-migrations/0037-learn-user-settings.sql', import.meta.url), 'utf8');
const SCHEMA = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const MARK = '-- learn-migrations/0037-learn-user-settings.sql';
// A learn database as it is before 0037 (the repository schema up to its mirror), and one that has it.
const BEFORE_0037 = SCHEMA.slice(0, SCHEMA.indexOf(MARK));

const A = { org: 'ws', userId: 'u-ana', app: 'canvas-0000aaaa', board: 'main' };
const B = { ...A, userId: 'u-ben' };
const A2 = { ...A, app: 'canvas-0000bbbb' };
const env = db => ({ LEARN_DB: db.LEARN_DB });
const DEFAULTS = { ...DEFAULT_SETTINGS, depthRevision: 0 };
let n = 0;
const act = () => `act-${String(++n).padStart(6, '0')}`;
// The next set_depth at the revision the caller last saw.
const set = (e, actor, depth, expectedRevision, actionId = act()) => setDepth(e, actor, { depth, expectedRevision, actionId });

test('0037 is CREATE-only, re-runnable, exactly what repository-schema.sql applies, and touches nothing that exists', t => {
  const statements = MIGRATION.replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
  assert.equal(statements.length, 2);
  for (const s of statements) assert.match(s, /^CREATE TABLE IF NOT EXISTS /);
  assert.doesNotMatch(MIGRATION, /^\s*(ALTER|DROP|DELETE|UPDATE|INSERT)\b/im);
  assert.ok(SCHEMA.replace(/\r/g, '').includes(MIGRATION.replace(/\r/g, '').trim()), 'repository-schema.sql holds 0037 verbatim');
  const { sqlite } = learnDb(t, BEFORE_0037);
  const before = sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(r => ({ ...r }));
  sqlite.exec(MIGRATION); sqlite.exec(MIGRATION);
  const after = sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(r => ({ ...r }));
  assert.deepEqual(after.filter(r => !before.some(b => b.name === r.name)).map(r => r.name), ['learn_canvas_depth', 'learn_user_settings']);
  assert.deepEqual(after.filter(r => before.some(b => b.name === r.name)), before, 'every earlier table is byte-identical, learn_coaching_state included');
  assert.throws(() => sqlite.prepare("INSERT INTO learn_canvas_depth (org, owner_user_id, app, board, depth, updated_at) VALUES ('o', 'u', 'a', 'main', 'shallow', 'now')").run(), /CHECK/);
  assert.throws(() => sqlite.prepare("INSERT INTO learn_user_settings VALUES ('o', 'u', 2, 'now')").run(), /CHECK/);
});

test('defaults: Standard, revision 0 and Auto-suggest on, with no row written by reading', async t => {
  const db = learnDb(t);
  assert.deepEqual(await readSettings(env(db), A), DEFAULTS);
  assert.equal(await readDepth(env(db), A), 'balanced');
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM learn_canvas_depth').get().n + db.sqlite.prepare('SELECT count(*) AS n FROM learn_user_settings').get().n, 0);
});

test('Depth differs across canvases', async t => {
  const e = env(learnDb(t));
  assert.equal(await set(e, A, 'detailed', 0), 'applied');
  assert.deepEqual(await readSettings(e, A2), DEFAULTS, 'a second canvas keeps its own Depth');
  assert.equal(await set(e, A2, 'brief', 0), 'applied');
  assert.deepEqual([await readDepth(e, A), await readDepth(e, A2)], ['detailed', 'brief']);
  assert.deepEqual([(await readSettings(e, A)).depthRevision, (await readSettings(e, A2)).depthRevision], [1, 1], 'a revision per (learner, canvas) row');
  assert.equal(await readDepth(e, { ...A, board: 'second' }), 'balanced', 'and per board');
});

test('Auto-suggest follows learner across canvases, and a change to it leaves Depth and its revision alone', async t => {
  const e = env(learnDb(t));
  await set(e, A, 'detailed', 0);
  await saveAutoSuggest(e, A, false);
  assert.deepEqual(await readSettings(e, A), { depth: 'detailed', autoSuggest: false, depthRevision: 1 });
  assert.deepEqual(await readSettings(e, A2), { depth: 'balanced', autoSuggest: false, depthRevision: 0 }, 'on every canvas');
  assert.deepEqual([await readAutoSuggest(e, A), await readAutoSuggest(e, B)], [false, true]);
  await saveAutoSuggest(e, A2, true);
  assert.equal(await readAutoSuggest(e, A), true);
});

test('other learner isolated: neither setting reaches another learner on the same canvas, and the organization is part of the key', async t => {
  const e = env(learnDb(t));
  await set(e, A, 'detailed', 0); await saveAutoSuggest(e, A, false);
  assert.deepEqual(await readSettings(e, B), DEFAULTS);
  assert.equal(await set(e, B, 'brief', 0), 'applied', 'Ben\'s first write is at revision 0 whatever Ana holds');
  assert.deepEqual(await readSettings(e, A), { depth: 'detailed', autoSuggest: false, depthRevision: 1 });
  assert.deepEqual(await readSettings(e, B), { depth: 'brief', autoSuggest: true, depthRevision: 1 });
  assert.equal(await readDepth(e, { ...A, org: 'other' }), 'balanced');
});

test('stale set_depth writes nothing', async t => {
  const db = learnDb(t), e = env(db);
  assert.equal(await set(e, A, 'detailed', 0), 'applied');            // revision 1
  assert.equal(await set(e, A, 'brief', 1), 'applied');        // revision 2
  const rows = () => db.sqlite.prepare('SELECT depth, revision, last_action_id, updated_at FROM learn_canvas_depth').all().map(r => ({ ...r }));
  const before = rows();
  for (const stale of [0, 1, 7]) assert.equal(await set(e, A, 'balanced', stale), 'stale', `expected revision ${stale}`);
  assert.deepEqual(rows(), before, 'not the depth, the revision, the action or the time');
  assert.equal(await set(e, A, 'balanced', 2), 'applied', 'the current revision still writes');
  assert.deepEqual(await readSettings(e, A), { depth: 'balanced', autoSuggest: true, depthRevision: 3 });
});

test('replayed action stable: the same action again writes nothing and answers the current state', async t => {
  const db = learnDb(t), e = env(db);
  assert.equal(await set(e, A, 'detailed', 0, 'action-deep-1'), 'applied');
  assert.equal(await set(e, A, 'detailed', 0, 'action-deep-1'), 'replayed', 'the first write ever, repeated');
  assert.equal(await set(e, A, 'brief', 1, 'action-over-2'), 'applied');
  const row = () => ({ ...db.sqlite.prepare('SELECT depth, revision, last_action_id, updated_at FROM learn_canvas_depth').get() });
  const before = row();
  assert.equal(await set(e, A, 'brief', 1, 'action-over-2'), 'replayed');
  assert.deepEqual(row(), before);
  assert.equal(await set(e, A, 'detailed', 0, 'action-deep-1'), 'stale', 'an older action is stale once a later one landed, not a replay');
  assert.equal(await set(e, A, 'detailed', 2, null), 'applied', 'an action without an id is never a replay');
  assert.equal(await set(e, A, 'balanced', 2, null), 'stale');
});

test('readDepth never throws: no identity, no canvas, no board, no database and a database without 0037 are Standard', async t => {
  assert.equal(await readDepth({}, A), 'balanced');
  const e = env(learnDb(t));
  await set(e, A, 'detailed', 0);
  assert.equal(await readDepth(e, { ...A, userId: null }), 'balanced');
  assert.equal(await readDepth(e, { ...A, board: undefined }), 'balanced', 'no silent main fallback');
  assert.equal(await readDepth(e, { ...A, app: null }), 'balanced');
  assert.equal(await readDepth(env(learnDb(t, BEFORE_0037)), A), 'balanced');
  for (const none of [{}, env(learnDb(t, BEFORE_0037))]) assert.equal(await readAutoSuggest(none, A), true, 'Auto-suggest defaults on and never throws');
});

test('no canvas\'s tutor_enabled is copied into the learner\'s Auto-suggest, and the coaching row is never written', async t => {
  const db = learnDb(t), e = env(db);
  db.sqlite.exec("INSERT INTO learn_coaching_state (org, owner_user_id, app, board, mode, tutor_enabled, suggestions_paused, revision, created_at, updated_at) VALUES ('ws', 'u-ana', 'canvas-0000aaaa', 'main', 'tutor', 0, 1, 4, 'then', 'then')");
  const row = () => ({ ...db.sqlite.prepare('SELECT * FROM learn_coaching_state').get() });
  const before = row();
  assert.equal(await readAutoSuggest(e, A), true, 'a canvas that turned its switch off does not turn the learner\'s preference off');
  await saveAutoSuggest(e, A, true); await set(e, A, 'detailed', 0);
  assert.deepEqual(row(), before, 'tutor_enabled, the pause and the revision are untouched');
});

// The route as the app Worker serves it, with the board authorization injected (as the coaching route's tests).
const route = (e, { user = 'u-ana', kind = 'canvas', org = 'ws', origin = null } = {}) => async (method, body, path = '/api/learn/user-settings') => {
  const query = method === 'GET' ? `?app=${body.app}&board=${encodeURIComponent(body.board)}` : '';
  const req = new Request(`https://app.test${path}${query}`, { method, headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
  const res = await userSettingsRoute(path, req, e, { authorize: async () => ({ kind, org, user_id: user, name: body.app }) });
  return res && { status: res.status, body: await res.json() };
};

test('route: GET and POST of the learner\'s own settings with the revision it hands back, a second canvas, another learner', async t => {
  const e = env(learnDb(t));
  const ana = route(e), ben = route(e, { user: 'u-ben' });
  const got = await ana('GET', { app: A.app, board: 'main' });
  assert.deepEqual([got.status, got.body.settings, got.body.depthRevision], [200, DEFAULT_SETTINGS, 0]);
  assert.match(got.body.learner, /^[0-9a-f]{16}$/);
  assert.equal(JSON.stringify(got.body).includes('u-ana'), false, 'users.id never leaves the server');
  const deep = await ana('POST', { app: A.app, board: 'main', depth: 'detailed', expectedRevision: 0, actionId: 'route-action-1' });
  assert.deepEqual([deep.status, deep.body.settings, deep.body.depthRevision], [200, { depth: 'detailed', autoSuggest: true }, 1]);
  const off = await ana('POST', { app: A.app, board: 'main', autoSuggest: false });
  assert.deepEqual([off.body.settings, off.body.depthRevision], [{ depth: 'detailed', autoSuggest: false }, 1], 'Auto-suggest does not move the Depth revision');
  assert.deepEqual((await ana('GET', { app: A.app, board: 'main' })).body.settings, { depth: 'detailed', autoSuggest: false }, 'reload');
  assert.deepEqual((await ana('GET', { app: A2.app, board: 'main' })).body.settings, { depth: 'balanced', autoSuggest: false }, 'a second canvas');
  const other = await ben('GET', { app: A.app, board: 'main' });
  assert.deepEqual(other.body.settings, DEFAULT_SETTINGS);
  assert.notEqual(other.body.learner, got.body.learner, 'the learner key tells two accounts in one browser apart');
  await ben('POST', { app: A.app, board: 'main', depth: 'brief', expectedRevision: 0 });
  assert.deepEqual((await ana('GET', { app: A.app, board: 'main' })).body.settings, { depth: 'detailed', autoSuggest: false }, 'another learner\'s change does not reach this one');
});

test('route: a stale write is 409 with the current state and writes nothing; the same action again is a 200 replay', async t => {
  const db = learnDb(t), ana = route(env(db));
  const first = { app: A.app, board: 'main', depth: 'detailed', expectedRevision: 0, actionId: 'route-action-1' };
  assert.equal((await ana('POST', first)).status, 200);
  const replay = await ana('POST', first);
  assert.deepEqual([replay.status, replay.body.replayed, replay.body.depthRevision, replay.body.settings.depth], [200, true, 1, 'detailed']);
  const stale = await ana('POST', { app: A.app, board: 'main', depth: 'brief', expectedRevision: 0, actionId: 'route-action-2' });
  assert.deepEqual([stale.status, stale.body.error, stale.body.depthRevision, stale.body.settings.depth], [409, 'stale_depth', 1, 'detailed']);
  assert.equal(db.sqlite.prepare('SELECT revision FROM learn_canvas_depth').get().revision, 1);
  const next = await ana('POST', { app: A.app, board: 'main', depth: 'brief', expectedRevision: stale.body.depthRevision, actionId: 'route-action-2' });
  assert.deepEqual([next.status, next.body.depthRevision, next.body.settings.depth], [200, 2, 'brief'], 'adopting the answered revision writes');
});

test('unauthenticated settings refused, and every other refusal is a 400, 403, 405 with nothing written', async t => {
  const db = learnDb(t), e = env(db);
  const ana = route(e), ok = { app: A.app, board: 'main', depth: 'detailed', expectedRevision: 0 };
  assert.equal((await route(e, { user: null })('GET', { app: A.app, board: 'main' })).status, 401);
  assert.equal((await route(e, { user: null })('POST', ok)).status, 401);
  const denied = await userSettingsRoute('/api/learn/user-settings', new Request('https://app.test/api/learn/user-settings?app=x&board=main'), e, { authorize: async () => Response.json({ error: 'Sign in first.' }, { status: 401 }) });
  assert.equal(denied.status, 401);
  for (const bad of [{ depth: 'shallow' }, { expectedRevision: undefined }, { expectedRevision: -1 }, { expectedRevision: '0' }, { actionId: 'x' },
    { depth: undefined, autoSuggest: 'yes' }, { depth: undefined }, { autoSuggest: false }, { board: 'a:b' }]) {
    assert.equal((await ana('POST', { ...ok, ...bad })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await route(e, { kind: 'repo' })('GET', { app: A.app, board: 'main' })).status, 400, 'canvases only');
  assert.equal((await route(e, { origin: 'https://evil.test' })('POST', ok)).status, 403);
  assert.equal((await ana('GET', { app: A.app, board: 'main' }, '/api/learn/coaching')), null);
  assert.equal((await userSettingsRoute('/api/learn/user-settings', new Request('https://app.test/api/learn/user-settings', { method: 'DELETE' }), e)).status, 405);
  assert.deepEqual(await readSettings(e, A), DEFAULTS, 'no refused request wrote anything');
});

test('route: a database without 0037 reads as the defaults, marked unsaved, and refuses a write so no change is claimed saved', async t => {
  const e = env(learnDb(t, BEFORE_0037));
  const ana = route(e);
  const got = await ana('GET', { app: A.app, board: 'main' });
  assert.deepEqual([got.status, got.body.settings, got.body.unsaved, got.body.depthRevision], [200, DEFAULT_SETTINGS, true, 0]);
  for (const body of [{ depth: 'detailed', expectedRevision: 0 }, { autoSuggest: false }]) {
    const saved = await ana('POST', { app: A.app, board: 'main', ...body });
    assert.deepEqual([saved.status, saved.body.error], [503, 'settings_unavailable']);
  }
});
