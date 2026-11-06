// Tutor ladder R2: learn-migrations/0037 and the Depth and Auto-suggest store and route (learn-user-settings.js), on node:sqlite behind
// the D1 slice the stores use. Depth is per learner and canvas, Auto-suggest per learner; neither reaches another learner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { learnDb } from './learn-grade-fixture.js';
import { DEFAULT_SETTINGS, readDepth, readSettings, saveSettings, userSettingsRoute } from '../src/learn-user-settings.js';

const MIGRATION = readFileSync(new URL('../learn-migrations/0037-learn-user-settings.sql', import.meta.url), 'utf8');
const SCHEMA = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const MARK = '-- learn-migrations/0037-learn-user-settings.sql';
// A learn database as it is before 0037 (the repository schema up to its mirror), and one that has it.
const BEFORE_0037 = SCHEMA.slice(0, SCHEMA.indexOf(MARK));

const A = { org: 'ws', userId: 'u-ana', app: 'canvas-0000aaaa', board: 'main' };
const B = { ...A, userId: 'u-ben' };
const A2 = { ...A, app: 'canvas-0000bbbb' };
const env = db => ({ LEARN_DB: db.LEARN_DB });

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
  assert.throws(() => sqlite.prepare("INSERT INTO learn_canvas_depth VALUES ('o', 'u', 'a', 'main', 'shallow', 'now')").run(), /CHECK/);
  assert.throws(() => sqlite.prepare("INSERT INTO learn_user_settings VALUES ('o', 'u', 2, 'now')").run(), /CHECK/);
});

test('defaults: Standard and Auto-suggest on, with no row written by reading', async t => {
  const db = learnDb(t);
  assert.deepEqual(await readSettings(env(db), A), DEFAULT_SETTINGS);
  assert.equal(await readDepth(env(db), A), 'standard');
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM learn_canvas_depth').get().n + db.sqlite.prepare('SELECT count(*) AS n FROM learn_user_settings').get().n, 0);
});

test('store: Depth is kept per learner and canvas; Auto-suggest per learner across canvases; a change to one field keeps the other', async t => {
  const e = env(learnDb(t));
  await saveSettings(e, A, { depth: 'deep' });
  assert.deepEqual(await readSettings(e, A), { depth: 'deep', autoSuggest: true });
  assert.deepEqual(await readSettings(e, A2), { depth: 'standard', autoSuggest: true }, 'a second canvas keeps its own Depth');
  await saveSettings(e, A2, { depth: 'overview' });
  await saveSettings(e, A, { autoSuggest: false });
  assert.deepEqual(await readSettings(e, A), { depth: 'deep', autoSuggest: false });
  assert.deepEqual(await readSettings(e, A2), { depth: 'overview', autoSuggest: false }, 'Auto-suggest is the learner\'s on every canvas');
  await saveSettings(e, A, { depth: 'standard', autoSuggest: true });
  assert.deepEqual(await readSettings(e, A), { depth: 'standard', autoSuggest: true });
  assert.equal(await readDepth(e, A2), 'overview');
});

test('isolation: one learner\'s Depth and Auto-suggest never change another learner\'s, on the same canvas', async t => {
  const e = env(learnDb(t));
  await saveSettings(e, A, { depth: 'deep', autoSuggest: false });
  assert.deepEqual(await readSettings(e, B), DEFAULT_SETTINGS);
  await saveSettings(e, B, { depth: 'overview' });
  assert.deepEqual(await readSettings(e, A), { depth: 'deep', autoSuggest: false });
  assert.deepEqual(await readSettings(e, B), { depth: 'overview', autoSuggest: true });
  assert.equal(await readDepth(e, { ...A, org: 'other' }), 'standard', 'the organization is part of the key');
});

test('readDepth never throws: no identity, no database and a database without 0037 are Standard', async t => {
  assert.equal(await readDepth({}, A), 'standard');
  assert.equal(await readDepth(env(learnDb(t)), { ...A, userId: null }), 'standard');
  assert.equal(await readDepth(env(learnDb(t, BEFORE_0037)), A), 'standard');
});

// The route as the app Worker serves it, with the board authorization injected (as the coaching route's tests).
const route = (e, { user = 'u-ana', kind = 'canvas', org = 'ws', origin = null } = {}) => async (method, body, path = '/api/learn/user-settings') => {
  const query = method === 'GET' ? `?app=${body.app}&board=${encodeURIComponent(body.board)}` : '';
  const req = new Request(`https://app.test${path}${query}`, { method, headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
  const res = await userSettingsRoute(path, req, e, { authorize: async () => ({ kind, org, user_id: user, name: body.app }) });
  return res && { status: res.status, body: await res.json() };
};

test('route: GET and POST of the learner\'s own settings, a partial change, a second canvas, another learner', async t => {
  const e = env(learnDb(t));
  const ana = route(e), ben = route(e, { user: 'u-ben' });
  const got = await ana('GET', { app: A.app, board: 'main' });
  assert.deepEqual([got.status, got.body.settings], [200, DEFAULT_SETTINGS]);
  assert.match(got.body.learner, /^[0-9a-f]{16}$/);
  assert.equal(JSON.stringify(got.body).includes('u-ana'), false, 'users.id never leaves the server');
  assert.deepEqual((await ana('POST', { app: A.app, board: 'main', depth: 'deep' })).body.settings, { depth: 'deep', autoSuggest: true });
  assert.deepEqual((await ana('POST', { app: A.app, board: 'main', autoSuggest: false })).body.settings, { depth: 'deep', autoSuggest: false }, 'a field left out keeps its value');
  assert.deepEqual((await ana('GET', { app: A.app, board: 'main' })).body.settings, { depth: 'deep', autoSuggest: false }, 'reload');
  assert.deepEqual((await ana('GET', { app: A2.app, board: 'main' })).body.settings, { depth: 'standard', autoSuggest: false }, 'a second canvas');
  const other = await ben('GET', { app: A.app, board: 'main' });
  assert.deepEqual(other.body.settings, DEFAULT_SETTINGS);
  assert.notEqual(other.body.learner, got.body.learner, 'the learner key tells two accounts in one browser apart');
  await ben('POST', { app: A.app, board: 'main', depth: 'overview' });
  assert.deepEqual((await ana('GET', { app: A.app, board: 'main' })).body.settings, { depth: 'deep', autoSuggest: false }, 'another learner\'s change does not reach this one');
});

test('route: refusals are 400, 401, 403, 405 and unrouted paths are not ours', async t => {
  const e = env(learnDb(t));
  const ana = route(e);
  assert.equal((await ana('POST', { app: A.app, board: 'main', depth: 'shallow' })).status, 400);
  assert.equal((await ana('POST', { app: A.app, board: 'main', autoSuggest: 'yes' })).status, 400);
  assert.equal((await ana('POST', { app: A.app, board: 'main' })).status, 400, 'a change names depth or autoSuggest');
  assert.equal((await ana('POST', { app: A.app, board: 'a:b', depth: 'deep' })).status, 400, 'a parked board name');
  assert.equal((await route(e, { kind: 'repo' })('GET', { app: A.app, board: 'main' })).status, 400, 'canvases only');
  assert.equal((await route(e, { user: null })('GET', { app: A.app, board: 'main' })).status, 401);
  assert.equal((await route(e, { origin: 'https://evil.test' })('POST', { app: A.app, board: 'main', depth: 'deep' })).status, 403);
  assert.equal((await ana('GET', { app: A.app, board: 'main' }, '/api/learn/coaching')), null);
  const denied = await userSettingsRoute('/api/learn/user-settings', new Request('https://app.test/api/learn/user-settings?app=x&board=main'), e, { authorize: async () => Response.json({ error: 'Sign in first.' }, { status: 401 }) });
  assert.equal(denied.status, 401);
  assert.equal((await userSettingsRoute('/api/learn/user-settings', new Request('https://app.test/api/learn/user-settings', { method: 'DELETE' }), e)).status, 405);
  assert.deepEqual(await readSettings(e, A), DEFAULT_SETTINGS, 'no refused request wrote anything');
});

test('route: a database without 0037 reads as the defaults, marked unsaved, and refuses a write so no change is claimed saved', async t => {
  const e = env(learnDb(t, BEFORE_0037));
  const ana = route(e);
  const got = await ana('GET', { app: A.app, board: 'main' });
  assert.deepEqual([got.status, got.body.settings, got.body.unsaved], [200, DEFAULT_SETTINGS, true]);
  const saved = await ana('POST', { app: A.app, board: 'main', depth: 'deep' });
  assert.deepEqual([saved.status, saved.body.error], [503, 'settings_unavailable']);
});
