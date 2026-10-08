import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { profileFetch, profileRoute, validateProfile, DESCRIPTION_MAX, NAME_MAX } from '../src/profile.js';
import { normalizeHandle, RESERVED_HANDLES } from '../src/handle.js';

// Settings > Profile: a person's own name and PNG picture in LEARN_DB user_profiles, readable and
// writable only by that account. The live DB throws on any use, so passing proves it is never touched.
const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0002-user-profiles.sql', import.meta.url), 'utf8');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close()); sqlite.exec(schema); sqlite.exec(migration);
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, run: async () => stmt.run(...args) }; } };
  const env = { LEARN_DB: db, DB: { prepare() { throw Error('live D1 touched'); } },
    CONTROL_PLANE: { fetch: async req => Response.json({ org: 'team', email: req.headers.get('x-email') || 'owner@test', orgName: 'Team', apps: [] }) } };
  const send = async (method, body, headers = {}) => {
    const res = await profileFetch(new Request('https://dev.test/api/profile', { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
    return { status: res.status, body: await res.json() };
  };
  return { send, sqlite };
}

test('a profile starts empty, saves a name and a PNG picture, and belongs to its owner only', async t => {
  const { send } = fixture(t);
  assert.equal(profileRoute(new URL('https://dev.test/api/profile')), true);
  assert.deepEqual((await send('GET')).body, { name: null, avatar: null, handle: null, description: null });
  assert.deepEqual((await send('PUT', { name: '  Ada   Lovelace ' })).body, { name: 'Ada Lovelace', avatar: null, handle: null, description: null });
  assert.deepEqual((await send('PUT', { avatar: PNG })).body, { name: 'Ada Lovelace', avatar: PNG, handle: null, description: null }, 'a picture keeps the name');
  assert.deepEqual((await send('GET')).body, { name: 'Ada Lovelace', avatar: PNG, handle: null, description: null });
  assert.deepEqual((await send('GET', null, { 'x-email': 'someone@else.test' })).body, { name: null, avatar: null, handle: null, description: null }, 'another account sees its own row');
  assert.deepEqual((await send('PUT', { name: '', avatar: null })).body, { name: null, avatar: null, handle: null, description: null }, 'both can be cleared');
});

test('only text names up to the limit and PNG pictures are accepted, from this origin', async t => {
  const { send } = fixture(t);
  assert.equal((await send('PUT', { name: 'x'.repeat(NAME_MAX + 1) })).status, 400);
  assert.equal((await send('PUT', { avatar: 'data:image/jpeg;base64,AAAA' })).status, 400);
  assert.equal((await send('PUT', { avatar: 'https://example.com/me.png' })).status, 400);
  assert.equal((await send('PUT', {})).status, 400);
  assert.equal((await send('PUT', { name: 'Ada' }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await send('DELETE')).status, 405);
  assert.deepEqual(validateProfile({ name: null }), { value: { name: null } });
});

// The profile description (docs/features/creator-profile.md, owner 2026-10-08, learn migration 0013).
test('a description is plain text on one line, at most 160 characters, kept as typed (markup included), and cleared by deleting its row', async t => {
  const { send, sqlite } = fixture(t);
  const rows = () => sqlite.prepare('SELECT email, description FROM user_profile_descriptions').all().map(r => `${r.email}=${r.description}`);
  const saved = await send('PUT', { description: '  Teaches\nGPU\tkernels  ' });
  assert.deepEqual([saved.status, saved.body], [200, { name: null, avatar: null, handle: null, description: 'Teaches GPU kernels' }], 'line breaks and tabs are single spaces');
  assert.equal((await send('GET')).body.description, 'Teaches GPU kernels');
  assert.equal((await send('PUT', { name: 'Ada' })).body.description, 'Teaches GPU kernels', 'a name change keeps it');
  // Markup is text: stored and answered exactly as typed, for the page to render as text (never HTML or a link).
  const markup = '<b>hi</b> <a href="javascript:alert(1)">x</a> https://evil.test';
  assert.equal((await send('PUT', { description: markup })).body.description, markup);
  assert.equal((await send('PUT', { description: 'x'.repeat(DESCRIPTION_MAX) })).status, 200);
  assert.equal((await send('PUT', { description: 'x'.repeat(DESCRIPTION_MAX + 1) })).status, 400);
  assert.equal((await send('PUT', { description: 42 })).status, 400);
  assert.equal(validateProfile({ description: 'a\u0000b\u007fc' }).value.description, 'a b c', 'control characters are spaces');
  assert.deepEqual(rows(), [`owner@test=${'x'.repeat(DESCRIPTION_MAX)}`], 'one row per person; a refused write changed nothing');
  assert.equal((await send('PUT', { description: '   ' })).body.description, null);
  assert.deepEqual(rows(), [], 'an empty description deletes the row');
  assert.equal((await send('GET', null, { 'x-email': 'someone@else.test' })).body.description, null, 'only its owner writes it');
  // The database holds the cap too, and a description needs a profile row.
  assert.throws(() => sqlite.prepare("INSERT INTO user_profile_descriptions (email, description) VALUES ('owner@test', ?)").run('x'.repeat(161)), /CHECK/);
  assert.throws(() => sqlite.prepare("INSERT INTO user_profile_descriptions (email, description) VALUES ('nobody@test', 'hi')").run(), /FOREIGN KEY/);
});

test('0013 is additive, re-runnable and exactly what repository-schema.sql applies; it gives nobody a description', t => {
  const m13 = readFileSync(new URL('../learn-migrations/0013-user-profile-descriptions.sql', import.meta.url), 'utf8');
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration);
  sqlite.prepare("INSERT INTO user_profiles (email, name) VALUES ('old@test', 'Old User')").run();
  sqlite.exec(m13); sqlite.exec(m13);
  assert.deepEqual(sqlite.prepare('SELECT * FROM user_profile_descriptions').all(), [], 'an existing user has no description until they write one');
  assert.deepEqual(sqlite.prepare('SELECT email, name FROM user_profiles').all().map(r => ({ ...r })), [{ email: 'old@test', name: 'Old User' }], 'user_profiles untouched');
  assert.ok(schema.replace(/\r/g, '').includes(m13.replace(/\r/g, '').trim()));
  assert.doesNotMatch(m13, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im, 'no statement but CREATE ... IF NOT EXISTS');
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(user_profile_descriptions)').all().map(c => c.name), ['email', 'description']);
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_list(user_profile_descriptions)').all().map(k => [k.table, k.from, k.to, k.on_delete]), [['user_profiles', 'email', 'email', 'CASCADE']]);
});

// Public handles (docs/features/user-handles.md, migration 0008).
const handles = sqlite => sqlite.prepare('SELECT email, handle FROM user_handles ORDER BY email').all().map(r => `${r.email}=${r.handle}`);

test('0008 is additive, re-runnable and exactly what repository-schema.sql applies; it gives nobody a handle', t => {
  const m8 = readFileSync(new URL('../learn-migrations/0008-user-handles.sql', import.meta.url), 'utf8');
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration);
  sqlite.prepare("INSERT INTO user_profiles (email, name) VALUES ('old@test', 'Old User')").run();
  sqlite.exec(m8); sqlite.exec(m8);
  assert.deepEqual(handles(sqlite), [], 'an existing user has no handle until they choose one');
  assert.ok(schema.replace(/\r/g, '').includes(m8.replace(/\r/g, '').trim()));
  assert.doesNotMatch(m8, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im, 'no statement but CREATE ... IF NOT EXISTS');
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(user_handles)').all().map(c => c.name), ['email', 'handle'], 'handle identity only');
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_list(user_handles)').all().map(k => [k.table, k.from, k.to, k.on_delete]), [['user_profiles', 'email', 'email', 'CASCADE']]);
  // The database is the authority: a case variant of a taken handle cannot be stored, whatever the code above it does.
  sqlite.prepare("INSERT INTO user_profiles (email) VALUES ('new@test')").run();
  sqlite.prepare("INSERT INTO user_handles (email, handle) VALUES ('old@test', 'ada')").run();
  assert.throws(() => sqlite.prepare("INSERT INTO user_handles (email, handle) VALUES ('new@test', 'ADA')").run(), /UNIQUE/);
  assert.throws(() => sqlite.prepare("INSERT INTO user_handles (email, handle) VALUES ('nobody@test', 'zed')").run(), /FOREIGN KEY/, 'only a profile has a handle');
});

test('the handle rules: 3-30 of a-z, 0-9 and _, starting with a letter or digit, lowercase, no reserved word', () => {
  for (const [typed, handle] of [['ada', 'ada'], ['@Ada_Lovelace', 'ada_lovelace'], ['MLBuilder', 'mlbuilder'], ['9lives', '9lives'], ['a'.repeat(30), 'a'.repeat(30)]]) {
    assert.deepEqual(normalizeHandle(typed), { handle }, typed);
  }
  for (const typed of ['ab', 'a'.repeat(31), ' ada', 'ada ', 'a da', 'ada@mail.test', 'ad/a', 'ad.a', 'ad-a', '_ada', '@@ada', 'ada?x', 'ad%2Fa', '', null, 42]) {
    assert.ok(normalizeHandle(typed).error, String(typed));
  }
  for (const word of ['admin', 'API', 'Explore', '@rabbithole', 'support', 'system']) assert.match(normalizeHandle(word).error, /reserved/, word);
  assert.ok(RESERVED_HANDLES.every(word => normalizeHandle(word).error), 'every reserved word is refused');
});

test('claiming a handle: no row means none; a claim is stored lowercase and read back with the profile; the owner may change it', async t => {
  const { send, sqlite } = fixture(t);
  assert.equal((await send('GET')).body.handle, null);
  const claimed = await send('PUT', { handle: '@Ada_Lovelace', name: 'Ada Lovelace' });
  assert.deepEqual([claimed.status, claimed.body], [200, { name: 'Ada Lovelace', avatar: null, handle: 'ada_lovelace', description: null }]);
  assert.deepEqual((await send('GET')).body, { name: 'Ada Lovelace', avatar: null, handle: 'ada_lovelace', description: null }, 'one profile, two tables');
  assert.equal((await send('PUT', { handle: 'ADA_LOVELACE' })).status, 200, 'your own handle again is fine');
  // A change is one statement: the old handle is free at once for someone else.
  assert.equal((await send('PUT', { handle: 'countess' })).body.handle, 'countess');
  assert.deepEqual((await send('PUT', { handle: 'ada_lovelace' }, { 'x-email': 'other@test' })).body.handle, 'ada_lovelace');
  assert.deepEqual(handles(sqlite), ['other@test=ada_lovelace', 'owner@test=countess']);
  assert.equal((await send('PUT', { handle: 'admin' })).status, 400);
  assert.equal((await send('PUT', { handle: 'bad handle' })).status, 400);
  assert.equal((await send('GET')).body.handle, 'countess', 'a refused change keeps the handle');
});

test('a taken handle, in any case, is a clean 409 that changes nothing; two simultaneous claims have exactly one winner', async t => {
  const { send, sqlite } = fixture(t);
  await send('PUT', { handle: 'yudhisteer' }, { 'x-email': 'first@test' });
  for (const typed of ['yudhisteer', 'Yudhisteer', '@YUDHISTEER']) {
    const lost = await send('PUT', { handle: typed, name: 'Not Applied' }, { 'x-email': 'second@test' });
    assert.deepEqual([lost.status, lost.body.taken, lost.body.error], [409, true, '@yudhisteer is taken. Choose another.'], typed);
  }
  assert.deepEqual((await send('GET', null, { 'x-email': 'second@test' })).body, { name: null, avatar: null, handle: null, description: null }, 'the losing request changed nothing');
  const race = await Promise.all(['a@test', 'b@test', 'c@test'].map(email => send('PUT', { handle: 'mlbuilder' }, { 'x-email': email })));
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409, 409]);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM user_handles WHERE handle = 'mlbuilder'").get().n, 1);
  // Unrelated accounts keep their own rows.
  assert.deepEqual(handles(sqlite).filter(h => !h.endsWith('=mlbuilder')), ['first@test=yudhisteer']);
});
