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
  // R2, in memory: enough of put/get/list for board files.
  const objects = new Map();
  const RUNS = {
    put: async (key, bytes, { httpMetadata, customMetadata }) => { objects.set(key, { bytes: new Uint8Array(bytes), httpMetadata, customMetadata }); },
    get: async key => { const object = objects.get(key); return object ? { body: object.bytes, httpMetadata: object.httpMetadata, customMetadata: object.customMetadata } : null; },
    list: async ({ prefix }) => ({ objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({ key, customMetadata: object.customMetadata })), truncated: false }),
  };
  const env = { LEARN_DB, CONTROL_PLANE, RUNS };
  const call = async (method, path, { as, body, raw, headers: extra = {} } = {}) => {
    const headers = { 'Content-Type': 'application/json', ...extra, ...(as ? { cookie: `small_session=${as}` } : {}) };
    const response = await learnBoardsRoute(path, new Request(`https://dev.test${path}`, { method, headers, ...(raw !== undefined ? { body: raw } : body ? { body: JSON.stringify(body) } : {}) }), env);
    const type = response.headers.get('content-type') || '';
    return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : new Uint8Array(await response.arrayBuffer()) };
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

test('sharing makes a view link; turning it off revokes it and on again makes a new one', async t => {
  const { call } = setup(t);
  const on = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, edit: true, state: STATE } })).body.sharing;
  assert.ok(on.shared && on.view);
  assert.equal(on.edit, null, 'links are view-only: no edit link, even when asked');
  assert.equal((await call('GET', `/api/learn/boards/shared/${on.view}`, { as: 'friend' })).body.role, 'view');
  const viewOff = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: false } })).body.sharing;
  assert.equal(viewOff.view, null);
  assert.equal((await call('GET', `/api/learn/boards/shared/${on.view}`, { as: 'friend' })).status, 404);
  const viewAgain = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true } })).body.sharing;
  assert.notEqual(viewAgain.view, on.view);
  const off = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: false, view: true } })).body.sharing;
  assert.deepEqual(off, { shared: false, view: null, edit: null, public_view: false });
  assert.equal((await call('GET', `/api/learn/boards/shared/${viewAgain.view}`, { as: 'friend' })).status, 404);
});

test('a view link needs sign-in unless it is public', async t => {
  const { call } = setup(t);
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, state: STATE } })).body.sharing;
  const anonymous = await call('GET', `/api/learn/boards/shared/${links.view}`);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.signIn, true);
  const open = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, public_view: true } })).body.sharing;
  assert.equal(open.public_view, true);
  const read = await call('GET', `/api/learn/boards/shared/${open.view}`);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.state, STATE);
  assert.equal((await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: false, public_view: true } })).body.sharing.public_view, false, 'no view link, nothing public');
});

test('shared links never save: editing means forking', async t => {
  const { call, LEARN_DB } = setup(t);
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, state: STATE } })).body.sharing;
  const refused = await call('PUT', `/api/learn/boards/shared/${links.view}`, { as: 'friend', body: { state: { ...STATE, items: [{ id: 'n' }] }, version: 1 } });
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /Fork/);
  assert.equal((await call('PUT', `/api/learn/boards/shared/${links.view}/assets/${encodeURIComponent('drop:x')}`, { as: 'friend', raw: new Uint8Array([9]) })).status, 403);
  // an edit token from before links went view-only opens nothing
  await LEARN_DB.prepare("UPDATE learn_boards SET edit_token = 'old-edit-token-000000000000' WHERE app = 'demo-app'").bind().run();
  assert.equal((await call('GET', '/api/learn/boards/shared/old-edit-token-000000000000', { as: 'friend' })).status, 404);
  const ownerStale = await call('PUT', OWN, { as: 'owner', body: { state: STATE, version: 0 } });
  assert.equal(ownerStale.status, 409, 'a stale owner save is still refused');
});

test('bad input is refused plainly', async t => {
  const { call } = setup(t);
  assert.equal((await call('PUT', '/api/learn/boards/demo-app/..%2Fx', { as: 'owner', body: { state: STATE } })).status, 400);
  assert.equal((await call('PUT', OWN, { as: 'owner', body: { state: 'nope' } })).status, 400);
  assert.equal((await call('PUT', OWN, { as: 'owner', body: { state: { blob: 'x'.repeat(2_000_000) } } })).status, 413);
  assert.equal((await call('GET', '/api/learn/boards/shared/short')).status, 404);
});

test('board files: the owner uploads them; whoever can open a link can load them, nobody else', async t => {
  const { call } = setup(t);
  const key = encodeURIComponent('pdf:paper-1');
  assert.equal((await call('PUT', `${OWN}/assets/${key}`, { as: 'owner', raw: new Uint8Array([1, 2, 3]), headers: { 'Content-Type': 'application/pdf' } })).status, 404, 'no board row yet');
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, edit: true, state: STATE } })).body.sharing;
  assert.equal((await call('PUT', `${OWN}/assets/${key}`, { as: 'owner', raw: new Uint8Array([1, 2, 3]), headers: { 'Content-Type': 'application/pdf' } })).status, 200);
  await call('PUT', `${OWN}/assets/${encodeURIComponent('image:a cat')}`, { as: 'owner', raw: 'data:image/png;base64,AAAA', headers: { 'Content-Type': 'text/x-cached-string', 'X-Asset-Kind': 'string' } });
  assert.deepEqual((await call('GET', `${OWN}/assets`, { as: 'owner' })).body.keys.sort(), ['image:a cat', 'pdf:paper-1']);
  const viewed = await call('GET', `/api/learn/boards/shared/${links.view}/assets/${key}`, { as: 'friend' });
  assert.equal(viewed.status, 200);
  assert.deepEqual([...viewed.body], [1, 2, 3]);
  assert.equal(viewed.headers.get('content-type'), 'application/pdf');
  assert.equal((await call('GET', `/api/learn/boards/shared/${links.view}/assets/${encodeURIComponent('image:a cat')}`, { as: 'friend' })).headers.get('x-asset-kind'), 'string');
  assert.equal((await call('GET', `/api/learn/boards/shared/${links.view}/assets/${key}`)).status, 401, 'not public: sign in');
  assert.equal((await call('PUT', `/api/learn/boards/shared/${links.view}/assets/${key}`, { as: 'friend', raw: new Uint8Array([9]) })).status, 403, 'a view link adds no files');
  await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: false } });
  assert.equal((await call('GET', `/api/learn/boards/shared/${links.view}/assets/${key}`, { as: 'friend' })).status, 404, 'sharing off: files go with the link');
});

test('an uploaded file is never served as a page on this origin', async t => {
  const { call } = setup(t);
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, public_view: true, state: STATE } })).body.sharing;
  await call('PUT', `${OWN}/assets/${encodeURIComponent('drop:evil')}`, { as: 'owner', raw: '<script>alert(1)</script>', headers: { 'Content-Type': 'text/html' } });
  const served = await call('GET', `/api/learn/boards/shared/${links.view}/assets/${encodeURIComponent('drop:evil')}`);
  assert.equal(served.headers.get('content-type'), 'application/octet-stream');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  assert.match(served.headers.get('content-security-policy'), /sandbox/);
  assert.equal(served.headers.get('content-disposition'), 'attachment');
});
