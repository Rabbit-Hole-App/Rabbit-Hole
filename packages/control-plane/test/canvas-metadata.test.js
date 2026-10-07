// Canvas metadata (docs/features/canvas-metadata.md): learn migration 0009 canvas_metadata - an optional description
// and updated_at, the canvas's last meaningful change - through the routes the app worker serves, on LEARN_DB as
// node:sqlite built from repository-schema.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0009-canvas-metadata.sql', import.meta.url), 'utf8');
const PEOPLE = { ana: { email: 'ana@test', org: 'ana-ws' }, ben: { email: 'ben@test', org: 'ben-ws' } };
const BOARD = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'b1', type: 'explanation', title: 'Softmax' }] };
const later = () => new Promise(resolve => setTimeout(resolve, 5));

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const CONTROL_PLANE = {
    fetch: async request => {
      if (request.method !== 'GET') throw new Error('live small-cp write');
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      return new URL(request.url).pathname === '/api/me' ? Response.json({ ...who, orgName: null }) : new Response('no', { status: 404 });
    },
  };
  const LEARN_MEDIA = { put: async () => {}, get: async () => null, list: async () => ({ objects: [], truncated: false }) };
  const DB = liveDb(), RUNS = liveRuns();
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA, DB, RUNS };
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls], [[], []], 'metadata touched production storage'));
  for (const [email, handle] of [['ana@test', 'ana'], ['ben@test', 'ben']]) {
    sqlite.prepare("INSERT INTO user_profiles (email, name) VALUES (?, '')").run(email);
    sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, handle);
  }
  const call = async (method, path, { as, body } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = canvasRoute(new URL(req.url)) ? await canvasesFetch(req, env) : await learnBoardsRoute(path, req, env);
    return { status: response.status, body: await response.json() };
  };
  const create = async (as, title) => (await call('POST', '/api/canvases', { as, body: { title } })).body;
  const app = async (as, name) => (await call('GET', `/api/apps/${name}`, { as })).body;
  const patch = (as, name, body) => call('PATCH', `/api/apps/${name}`, { as, body });
  const save = (as, name, state) => call('PUT', `/api/learn/boards/${name}/main`, { as, body: { state } });
  return { sqlite, call, create, app, patch, save };
}

test('0009 is additive, re-runnable and exactly what repository-schema.sql applies; it backfills nothing', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec("CREATE TABLE canvases (id INTEGER PRIMARY KEY, org TEXT, name TEXT, title TEXT); INSERT INTO canvases (org, name, title) VALUES ('o', 'canvas-0000000a', 'A');");
  sqlite.exec(migration); sqlite.exec(migration);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM canvas_metadata').get().n, 0, 'no row: description null, updated_at = created_at');
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(canvas_metadata)').all().map(c => c.name), ['org', 'canvas', 'description', 'updated_at'], 'metadata only: never a title, owner, publication, fork state or content');
});

test('with no row, a canvas reads no description and updated_at = created_at', async t => {
  const f = setup(t);
  const made = await f.app('ana', (await f.create('ana', 'Fresh')).name);
  assert.equal(made.description, null);
  assert.equal(made.updated_at, made.created_at);
});

test('a rename and a description edit are meaningful changes; the same title again is not', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'Gradients');
  const before = (await f.app('ana', c.name)).updated_at;
  assert.equal((await f.patch('ana', c.name, { title: 'Gradients' })).body.updated_at, before, 'no change, no bump');
  await later();
  const renamed = (await f.patch('ana', c.name, { title: 'Gradient descent' })).body;
  assert.equal(renamed.title, 'Gradient descent');
  assert.ok(renamed.updated_at > before, 'a rename bumps');
  await later();
  const described = (await f.patch('ana', c.name, { description: '  Why the step follows the slope.  ' })).body;
  assert.equal(described.description, 'Why the step follows the slope.');
  assert.ok(described.updated_at > renamed.updated_at, 'a description edit bumps');
  assert.equal(described.title, 'Gradient descent', 'a description edit never touches the title');
  assert.equal((await f.patch('ana', c.name, { description: '' })).body.description, null, 'an empty description clears it');
});

test('a description is plain text up to 500 characters, edited by its owner only', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'Limits');
  assert.equal((await f.patch('ana', c.name, { description: 'x'.repeat(500) })).body.description.length, 500);
  const long = await f.patch('ana', c.name, { description: 'x'.repeat(501) });
  assert.equal(long.status, 400);
  assert.match(long.body.error, /500 characters/);
  assert.equal((await f.patch('ana', c.name, { description: 42 })).status, 400);
  assert.equal((await f.patch('ben', c.name, { description: 'mine now' })).status, 404, 'another workspace never edits it');
});

test('a change to the saved content bumps; its first server copy and a save of the same content do not', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'Content');
  const created = (await f.app('ana', c.name)).updated_at;
  await later();
  await f.save('ana', c.name, BOARD);
  assert.equal((await f.app('ana', c.name)).updated_at, created, 'the first copy syncs what the browser had');
  await later();
  await f.save('ana', c.name, BOARD);
  assert.equal((await f.app('ana', c.name)).updated_at, created, 'the same content again');
  await later();
  await f.save('ana', c.name, { ...BOARD, blocks: [...BOARD.blocks, { id: 'b2', type: 'quiz', question: 'Why?' }] });
  assert.ok((await f.app('ana', c.name)).updated_at > created, 'a new card is a meaningful change');
});

test('passive use never bumps: opening, sharing, publishing, someone else\'s fork or Rabbit Hole, a handle change', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'Popular');
  await f.save('ana', c.name, BOARD);
  const before = (await f.app('ana', c.name)).updated_at;
  await later();
  await f.call('GET', `/api/apps/${c.name}`, { as: 'ana' });
  await f.call('GET', `/api/learn/boards/${c.name}/main`, { as: 'ana' });
  const share = (await f.call('POST', `/api/learn/boards/${c.name}/main/share`, { as: 'ana', body: { shared: true, view: true, state: BOARD } })).body.sharing.view;
  assert.equal((await f.call('POST', `/api/apps/${c.name}/publish`, { as: 'ana', body: {} })).status, 200);
  await f.call('GET', `/api/learn/boards/shared/${share}`, { as: 'ben' });
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token: share }, key: 'meta-fork-1' } })).status, 201);
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${share}/rabbit-hole`, { as: 'ben', body: {} })).status, 201);
  f.sqlite.prepare("UPDATE user_handles SET handle = 'ana_lima' WHERE email = 'ana@test'").run();
  assert.equal((await f.app('ana', c.name)).updated_at, before);
});

test('the Library lists the last meaningfully changed first, then the newer id', async t => {
  const f = setup(t);
  const first = await f.create('ana', 'First'), second = await f.create('ana', 'Second'), third = await f.create('ana', 'Third');
  await later();
  await f.patch('ana', first.name, { description: 'Edited last' });
  const order = (await f.call('GET', '/api/canvases', { as: 'ana' })).body.canvases.map(c => c.title);
  assert.deepEqual(order, ['First', 'Third', 'Second'], 'updated_at DESC; ties by id DESC (the three were made in one second)');
  assert.notEqual(second.name, third.name);
});

test('Duplicate carries the description; a fork and Explore read the canvas\'s own', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'Described');
  await f.patch('ana', c.name, { description: 'A short tour of softmax.' });
  const copy = (await f.call('POST', '/api/learn/boards/duplicate', { as: 'ana', body: { source: { canvas: c.name }, state: BOARD } })).body;
  assert.equal((await f.app('ana', copy.name)).description, 'A short tour of softmax.');
  await f.save('ana', c.name, BOARD);
  const share = (await f.call('POST', `/api/learn/boards/${c.name}/main/share`, { as: 'ana', body: { shared: true, view: true, state: BOARD } })).body.sharing.view;
  const fork = (await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token: share }, key: 'meta-fork-2' } })).body;
  assert.equal((await f.app('ben', fork.name)).description, null, 'a fork starts with no description of its own');
  await f.call('POST', `/api/apps/${c.name}/publish`, { as: 'ana', body: {} });
  const listed = (await f.call('GET', '/api/learn/boards/published')).body.canvases.find(entry => entry.title === 'Described');
  assert.equal(listed.description, 'A short tour of softmax.');
  assert.ok(listed.updated_at);
});
