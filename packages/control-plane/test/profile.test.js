import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { profileFetch, profileRoute, validateProfile, NAME_MAX } from '../src/profile.js';

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
  return { send };
}

test('a profile starts empty, saves a name and a PNG picture, and belongs to its owner only', async t => {
  const { send } = fixture(t);
  assert.equal(profileRoute(new URL('https://dev.test/api/profile')), true);
  assert.deepEqual((await send('GET')).body, { name: null, avatar: null });
  assert.deepEqual((await send('PUT', { name: '  Ada   Lovelace ' })).body, { name: 'Ada Lovelace', avatar: null });
  assert.deepEqual((await send('PUT', { avatar: PNG })).body, { name: 'Ada Lovelace', avatar: PNG }, 'a picture keeps the name');
  assert.deepEqual((await send('GET')).body, { name: 'Ada Lovelace', avatar: PNG });
  assert.deepEqual((await send('GET', null, { 'x-email': 'someone@else.test' })).body, { name: null, avatar: null }, 'another account sees its own row');
  assert.deepEqual((await send('PUT', { name: '', avatar: null })).body, { name: null, avatar: null }, 'both can be cleared');
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
