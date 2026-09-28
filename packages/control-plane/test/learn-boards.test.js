// Learn board saving and sharing (docs/features/canvas-sharing.md) against
// learn_boards on node:sqlite, with a stub control plane that says who a
// cookie belongs to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';

const PEOPLE = { owner: { email: 'owner@test', org: 'team' }, friend: { email: 'friend@elsewhere', org: 'elsewhere' } };

function setup(t) {
  const { LEARN_DB } = learnDb(t);
  const CONTROL_PLANE = {
    fetch: async request => {
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      const path = new URL(request.url).pathname;
      if (path === '/api/apps') return Response.json({ ...who, apps: [] });
      if (path === '/api/apps/demo-app' && who === PEOPLE.owner) return Response.json({ name: 'demo-app', ...who });
      return new Response('no', { status: 404 });
    },
  };
  const env = { LEARN_DB, CONTROL_PLANE };
  const call = async (method, path, { as, body } = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) };
    const response = await learnBoardsRoute(path, new Request(`https://dev.test${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
    return { status: response.status, body: await response.json() };
  };
  return { call, LEARN_DB };
}

const STATE = { blocks: [{ id: 'b1', type: 'explanation', title: 'Softmax' }], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
const OWN = '/api/learn/boards/demo-app/main';

test('the owner saves a board and reads it back; versions count saves', async t => {
  const { call } = setup(t);
  assert.equal((await call('GET', OWN, { as: 'owner' })).status, 404);
  assert.deepEqual((await call('PUT', OWN, { as: 'owner', body: { state: STATE } })).body.version, 1);
  const again = await call('PUT', OWN, { as: 'owner', body: { state: { ...STATE, shapes: [{ id: 's' }] }, version: 1 } });
  assert.equal(again.body.version, 2);
  const read = await call('GET', OWN, { as: 'owner' });
  assert.equal(read.body.version, 2);
  assert.deepEqual(read.body.state.shapes, [{ id: 's' }]);
  assert.equal(read.body.sharing.shared, false);
});

test('only someone with access to the app can save or share it', async t => {
  const { call } = setup(t);
  assert.equal((await call('PUT', OWN, { body: { state: STATE } })).status, 401);
  assert.equal((await call('PUT', OWN, { as: 'friend', body: { state: STATE } })).status, 404);
  assert.equal((await call('POST', `${OWN}/share`, { as: 'friend', body: { shared: true, view: true } })).status, 404);
});

test('sharing makes view and edit links; turning a link off revokes it and on again makes a new one', async t => {
  const { call } = setup(t);
  const on = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, edit: true, state: STATE } })).body.sharing;
  assert.ok(on.shared && on.view && on.edit && on.view !== on.edit);
  assert.equal((await call('GET', `/api/learn/boards/shared/${on.view}`, { as: 'friend' })).body.role, 'view');
  assert.equal((await call('GET', `/api/learn/boards/shared/${on.edit}`, { as: 'friend' })).body.role, 'edit');
  const viewOff = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: false, edit: true } })).body.sharing;
  assert.equal(viewOff.view, null);
  assert.equal(viewOff.edit, on.edit, 'the edit link is untouched');
  assert.equal((await call('GET', `/api/learn/boards/shared/${on.view}`, { as: 'friend' })).status, 404);
  const viewAgain = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, edit: true } })).body.sharing;
  assert.notEqual(viewAgain.view, on.view);
  const off = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: false, view: true, edit: true } })).body.sharing;
  assert.deepEqual(off, { shared: false, view: null, edit: null, public_view: false });
  assert.equal((await call('GET', `/api/learn/boards/shared/${viewAgain.edit}`, { as: 'friend' })).status, 404);
});

test('a view link needs sign-in unless it is public; public never means edit', async t => {
  const { call } = setup(t);
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, edit: true, state: STATE } })).body.sharing;
  const anonymous = await call('GET', `/api/learn/boards/shared/${links.view}`);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.signIn, true);
  const open = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, edit: true, public_view: true } })).body.sharing;
  assert.equal(open.public_view, true);
  const read = await call('GET', `/api/learn/boards/shared/${open.view}`);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.state, STATE);
  assert.equal((await call('GET', `/api/learn/boards/shared/${open.edit}`)).status, 401, 'the edit link still needs sign-in');
  assert.equal((await call('PUT', `/api/learn/boards/shared/${open.edit}`, { body: { state: STATE, version: 1 } })).status, 401);
  assert.equal((await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: false, edit: true, public_view: true } })).body.sharing.public_view, false, 'no view link, nothing public');
});

test('an editor saves through the edit link; a stale save is refused, not overwritten', async t => {
  const { call } = setup(t);
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, edit: true, state: STATE } })).body.sharing;
  const opened = (await call('GET', `/api/learn/boards/shared/${links.edit}`, { as: 'friend' })).body;
  const saved = await call('PUT', `/api/learn/boards/shared/${links.edit}`, { as: 'friend', body: { state: { ...STATE, items: [{ id: 'n' }] }, version: opened.version } });
  assert.equal(saved.body.version, opened.version + 1);
  const stale = await call('PUT', `/api/learn/boards/shared/${links.edit}`, { as: 'friend', body: { state: STATE, version: opened.version } });
  assert.equal(stale.status, 409);
  const ownerStale = await call('PUT', OWN, { as: 'owner', body: { state: STATE, version: opened.version } });
  assert.equal(ownerStale.status, 409, 'the owner does not silently overwrite an editor either');
  assert.equal((await call('PUT', `/api/learn/boards/shared/${links.view}`, { as: 'friend', body: { state: STATE, version: saved.body.version } })).status, 403);
  const read = await call('GET', OWN, { as: 'owner' });
  assert.deepEqual(read.body.state.items, [{ id: 'n' }]);
  assert.equal(read.body.updated_by, 'friend@elsewhere');
});

test('bad input is refused plainly', async t => {
  const { call } = setup(t);
  assert.equal((await call('PUT', '/api/learn/boards/demo-app/..%2Fx', { as: 'owner', body: { state: STATE } })).status, 400);
  assert.equal((await call('PUT', OWN, { as: 'owner', body: { state: 'nope' } })).status, 400);
  assert.equal((await call('PUT', OWN, { as: 'owner', body: { state: { blob: 'x'.repeat(2_000_000) } } })).status, 413);
  assert.equal((await call('GET', '/api/learn/boards/shared/short')).status, 404);
});
