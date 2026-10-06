// Creator attribution by @handle (docs/features/user-handles.md): read by reference from user_handles wherever a
// canvas is shown - Library/Home cards, the shared canvas, fork provenance - never copied onto a canvas and never an
// email. Through the routes the app worker serves (canvases, boards, profile), on LEARN_DB as node:sqlite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { profileFetch, profileRoute } from '../src/profile.js';

const PEOPLE = { alice: { email: 'alice@test', org: 'alice-ws' }, bob: { email: 'bob@test', org: 'bob-ws' }, cara: { email: 'cara@test', org: 'cara-ws' } };
const EMAILS = Object.values(PEOPLE).map(p => p.email);
const BOARD = { blocks: [{ id: 'b1', type: 'explanation', title: 'Self-attention' }], shapes: [], strokes: [], items: [], links: [] };

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
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls], [[], []], 'attribution touched production storage'));
  const call = async (method, path, { as, body } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const url = new URL(req.url);
    const response = profileRoute(url) ? await profileFetch(req, env) : canvasRoute(url) ? await canvasesFetch(req, env) : await learnBoardsRoute(path, req, env);
    return { status: response.status, body: await response.json() };
  };
  const claim = (as, handle, name) => call('PUT', '/api/profile', { as, body: { handle, ...(name ? { name } : {}) } });
  const card = async (as, name) => (await call('GET', '/api/canvases', { as })).body.canvases.find(c => c.name === name);
  const shareOf = async (as, title) => {
    const made = (await call('POST', '/api/canvases', { as, body: { title } })).body;
    const link = (await call('POST', `/api/learn/boards/${made.name}/main/share`, { as, body: { shared: true, view: true, public_view: true, state: BOARD } })).body.sharing.view;
    return { name: made.name, link };
  };
  return { sqlite, call, claim, card, shareOf };
}

test('the shared canvas names its creator by @handle (and display name), never by email; no handle, no creator line', async t => {
  const f = setup(t);
  const a = await f.shareOf('alice', 'Transformers');
  // Before Alice chooses a handle: no creator at all, and no email in its place - not even for a signed-out visitor.
  for (const as of ['bob', undefined]) {
    const seen = await f.call('GET', `/api/learn/boards/shared/${a.link}`, { as });
    assert.equal(seen.body.creator, null);
    assert.ok(!JSON.stringify(seen.body).includes('alice@test'), 'the owner email never reaches a viewer');
    assert.equal('owner' in seen.body, false);
  }
  await f.claim('alice', 'alice');
  assert.deepEqual((await f.call('GET', `/api/learn/boards/shared/${a.link}`)).body.creator, { handle: 'alice', name: null });
  await f.call('PUT', '/api/profile', { as: 'alice', body: { name: 'Alice Liddell' } });
  assert.deepEqual((await f.call('GET', `/api/learn/boards/shared/${a.link}`)).body.creator, { handle: 'alice', name: 'Alice Liddell' });
});

test('a fork belongs to the forker and credits the original owner\'s @handle; cards show each owner\'s handle', async t => {
  const f = setup(t);
  await f.claim('alice', 'alice'); await f.claim('bob', 'bob');
  const a = await f.shareOf('alice', 'Transformers');
  const fork = (await f.call('POST', '/api/learn/boards/fork', { as: 'bob', body: { source: { token: a.link }, key: 'handle-fork-0001' } })).body;
  const mine = await f.card('bob', fork.name);
  assert.deepEqual([mine.owner_email, mine.owner_handle, mine.forked_from_title, mine.forked_from_handle], ['bob@test', 'bob', 'Transformers', 'alice']);
  assert.deepEqual([(await f.card('alice', a.name)).owner_handle, (await f.card('alice', a.name)).forked_from_handle], ['alice', null]);
  // Nothing stored with the fork names Alice's email: the board's provenance carries no creator.
  const board = await f.call('GET', `/api/learn/boards/${fork.name}/main`, { as: 'bob' });
  assert.equal(board.body.forked_from.creator, null);
  assert.ok(!JSON.stringify(board.body).includes('alice@test'));
  // Bob's own private canvas (and a nested hole of his) carries his handle the same way.
  const hole = (await f.call('POST', `/api/learn/boards/shared/${a.link}/rabbit-hole`, { as: 'bob', body: { origin: null } })).body;
  assert.equal((await f.card('bob', hole.name)).owner_handle, 'bob');
  assert.equal(hole.source.creator, null);
  assert.ok(!JSON.stringify(hole).includes('alice@test'), 'the Rabbit Hole source names no owner email');
});

test('a changed handle shows everywhere at once, with no canvas rewritten; unrelated people stay apart', async t => {
  const f = setup(t);
  await f.claim('alice', 'alice'); await f.claim('bob', 'bob'); await f.claim('cara', 'cara');
  const a = await f.shareOf('alice', 'Transformers');
  const z = await f.shareOf('cara', 'Bridge loads');
  const fork = (await f.call('POST', '/api/learn/boards/fork', { as: 'bob', body: { source: { token: a.link }, key: 'handle-fork-0002' } })).body;
  const canvasesBefore = JSON.stringify(f.sqlite.prepare('SELECT * FROM canvases ORDER BY id').all());
  const forksBefore = JSON.stringify(f.sqlite.prepare('SELECT * FROM canvas_forks').all());
  assert.equal((await f.claim('alice', 'wonderland')).body.handle, 'wonderland');
  assert.equal((await f.card('alice', a.name)).owner_handle, 'wonderland');
  assert.equal((await f.card('bob', fork.name)).forked_from_handle, 'wonderland');
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${a.link}`)).body.creator.handle, 'wonderland');
  assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM canvases ORDER BY id').all()), canvasesBefore, 'no canvas row rewritten');
  assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM canvas_forks').all()), forksBefore, 'no fork row rewritten');
  // Cara's canvas and Bob's fork ownership are untouched by Alice's change.
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${z.link}`)).body.creator.handle, 'cara');
  assert.deepEqual([(await f.card('bob', fork.name)).owner_handle, (await f.card('bob', fork.name)).owner_email], ['bob', 'bob@test']);
  // The old handle is free; and no public response on either link carries any email.
  assert.equal((await f.claim('cara', 'alice')).status, 200);
  for (const link of [a.link, z.link]) {
    const seen = JSON.stringify((await f.call('GET', `/api/learn/boards/shared/${link}`)).body);
    for (const email of EMAILS) assert.ok(!seen.includes(email), email);
  }
});
