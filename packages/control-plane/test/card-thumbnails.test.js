// Card thumbnails (docs/features/card-thumbnails.md) through the routes the app worker serves, on the shared-canvas
// fixture with an in-memory R2: the owner's snapshot and custom picture, the upload checks, and who may see one - the
// owner always (unless in Trash or archived), anyone else only while the canvas is in Explore.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { learnBoardsRoute, THUMBNAIL_LIMIT } from '../src/learn-boards.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2]);

function thumbs(t) {
  const f = setup(t);
  const objects = new Map();
  f.env.LEARN_MEDIA = {
    put: async (key, bytes, { httpMetadata, customMetadata }) => { objects.set(key, { bytes: new Uint8Array(bytes), httpMetadata, customMetadata, httpEtag: `"${key}:${bytes.byteLength}"` }); },
    get: async key => { const o = objects.get(key); return o ? { body: o.bytes, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata, httpEtag: o.httpEtag } : null; },
    delete: async key => { objects.delete(key); },
    list: async ({ prefix }) => ({ objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, o]) => ({ key, customMetadata: o.customMetadata })), truncated: false }),
  };
  // The raw response: an image is bytes, not JSON.
  const raw = async (method, path, { as, body, headers = {} } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { ...(as ? { cookie: `small_session=${as}` } : {}), ...headers }, ...(body ? { body } : {}) });
    const response = await learnBoardsRoute(path, req, f.env);
    return { status: response.status, headers: response.headers, bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  const canvas = async (title, state = BOARD) => {
    const made = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title } })).body;
    if (state) await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as: 'ana', body: { state } });
    return made;
  };
  f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, NULL)').run('ana@test');
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run('ana@test', 'ana');
  return { ...f, objects, raw, canvas };
}
const own = name => `/api/learn/boards/${name}/main/thumbnail`;

test('the owner: no thumbnail is 204; the snapshot, a custom picture that wins, and back to the snapshot', async t => {
  const f = thumbs(t);
  const c = await f.canvas('Why ice floats');
  const none = await f.raw('GET', own(c.name), { as: 'ana' });
  assert.deepEqual([none.status, none.bytes.length], [204, 0], 'nothing yet: no image and no error');
  assert.equal((await f.raw('PUT', own(c.name), { as: 'ana', body: PNG })).status, 200);
  const shot = await f.raw('GET', own(c.name), { as: 'ana' });
  assert.deepEqual([shot.status, shot.headers.get('content-type'), shot.headers.get('x-thumbnail-source'), shot.bytes], [200, 'image/png', 'snapshot', PNG]);
  assert.equal(shot.headers.get('cache-control'), 'private, no-cache', 'revalidated, never shared');
  assert.equal(shot.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await f.raw('PUT', `${own(c.name)}/custom`, { as: 'ana', body: JPEG })).status, 200);
  // A newer snapshot never replaces the owner's own picture.
  assert.equal((await f.raw('PUT', own(c.name), { as: 'ana', body: PNG })).status, 200);
  const custom = await f.raw('GET', own(c.name), { as: 'ana' });
  assert.deepEqual([custom.headers.get('content-type'), custom.headers.get('x-thumbnail-source'), custom.bytes], ['image/jpeg', 'custom', JPEG]);
  const head = await f.raw('HEAD', own(c.name), { as: 'ana' });
  assert.deepEqual([head.status, head.headers.get('x-thumbnail-source'), head.bytes.length], [200, 'custom', 0], 'HEAD: which one, without the bytes');
  assert.equal((await f.raw('DELETE', `${own(c.name)}/custom`, { as: 'ana' })).status, 200);
  assert.equal((await f.raw('GET', own(c.name), { as: 'ana' })).headers.get('x-thumbnail-source'), 'snapshot', 'Use canvas snapshot');
  const keys = [...f.objects.keys()];
  assert.ok(keys.every(key => /^learn-thumbnails\/[0-9a-f-]{36}\/(snapshot|custom)$/.test(key)), `keyed by the board row only: ${keys}`);
  assert.ok(!keys.some(key => key.includes('ana')), 'no email in a key');
});

test('uploads: PNG, JPEG or WebP by their bytes, at most 1 MB, a saved main board, from this origin', async t => {
  const f = thumbs(t);
  const c = await f.canvas('Board');
  const put = (body, extra = {}, path = own(c.name)) => f.raw('PUT', path, { as: 'ana', body, ...extra });
  assert.equal((await put(new TextEncoder().encode('<svg onload=alert(1)>'), { headers: { 'Content-Type': 'image/png' } })).status, 415, 'a declared type is not trusted');
  assert.equal((await put(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0, 0]))).status, 415, 'a GIF');
  const big = new Uint8Array(THUMBNAIL_LIMIT + 1); big.set(PNG);
  assert.equal((await put(big)).status, 413);
  assert.equal((await put(PNG, { headers: { origin: 'https://evil.test' } })).status, 403);
  assert.equal((await put(PNG, {}, `/api/learn/boards/${c.name}/notes/thumbnail`)).status, 404, 'only a main board');
  const bare = await f.canvas('Never opened', null);
  f.sqlite.prepare('DELETE FROM learn_boards WHERE app = ?').run(bare.name);
  assert.equal((await put(PNG, {}, own(bare.name))).status, 404, 'a snapshot follows a save');
  assert.equal((await put(PNG, {}, `${own(bare.name)}/custom`)).status, 200, 'a custom picture gives a board-less canvas its board');
  assert.equal((await f.raw('GET', own(bare.name), { as: 'ana' })).headers.get('x-thumbnail-source'), 'custom');
  assert.equal(f.objects.size, 1);
});

test('nobody else gets a private, unlisted, trashed or archived canvas thumbnail; Explore shows a published one', async t => {
  const f = thumbs(t);
  const c = await f.canvas('Why ice floats');
  await f.raw('PUT', own(c.name), { as: 'ana', body: PNG });
  // The owner route: signed out 401, another workspace 404, a colleague in the same workspace 403 - reads and writes.
  f.sqlite.exec(`INSERT INTO canvases(org,name,owner_email,title) VALUES('ana-ws','canvas-0000cafe','colleague@test','Theirs')`);
  assert.equal((await f.raw('GET', own(c.name))).status, 401);
  for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) assert.equal((await f.raw(method, own(c.name), { as: 'ben', ...(method === 'PUT' ? { body: PNG } : {}) })).status, 404, method);
  assert.equal((await f.raw('GET', own('canvas-0000cafe'), { as: 'ana' })).status, 403);
  // Unlisted: its share link opens the board, but a share token is not a publication.
  const view = (await f.call('POST', `/api/learn/boards/${c.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true } })).body.sharing.view;
  const published = token => `/api/learn/boards/published/${token}/thumbnail`;
  assert.equal((await f.raw('GET', published(view), { as: 'ben' })).status, 404, 'an unlisted canvas');
  assert.equal((await f.raw('GET', published('x'.repeat(32)))).status, 404);
  // Public: anyone, signed out too; the custom picture wins there as well.
  const token = (await f.call('POST', `/api/apps/${c.name}/publish`, { as: 'ana' })).body.publication_token;
  const open = await f.raw('GET', published(token));
  assert.deepEqual([open.status, open.headers.get('cache-control'), open.bytes], [200, 'private, no-cache', PNG]);
  await f.raw('PUT', `${own(c.name)}/custom`, { as: 'ana', body: JPEG });
  assert.deepEqual((await f.raw('GET', published(token), { as: 'ben' })).bytes, JPEG);
  assert.equal((await f.raw('PUT', published(token), { as: 'ben', body: PNG })).status, 405, 'read-only');
  // A published canvas with no picture yet: 204, like the owner's.
  const blank = await f.canvas('Blank');
  const blankToken = (await f.call('POST', `/api/apps/${blank.name}/publish`, { as: 'ana' })).body.publication_token;
  assert.equal((await f.raw('GET', published(blankToken))).status, 204);
  // Removed from Explore: gone for everyone else at once.
  await f.call('POST', `/api/apps/${c.name}/unpublish`, { as: 'ana' });
  assert.equal((await f.raw('GET', published(token))).status, 404);
  // Trash takes the publication with it; Trash and Archive hide it from the owner too.
  const again = (await f.call('POST', `/api/apps/${c.name}/publish`, { as: 'ana' })).body.publication_token;
  await f.call('POST', `/api/apps/${c.name}/trash`, { as: 'ana' });
  assert.deepEqual([(await f.raw('GET', published(again))).status, (await f.raw('GET', own(c.name), { as: 'ana' })).status], [404, 404]);
  await f.call('POST', `/api/apps/${c.name}/untrash`, { as: 'ana' });
  assert.equal((await f.raw('GET', own(c.name), { as: 'ana' })).status, 200, 'Restore brings it back');
  await f.call('POST', `/api/apps/${c.name}/archive`, { as: 'ana' });
  assert.equal((await f.raw('GET', own(c.name), { as: 'ana' })).status, 404, 'archived');
});

test('a project: its Main canvas board has the same thumbnail routes', async t => {
  const f = thumbs(t);
  const project = 'repo-0a1b2c3d-nanogpt';
  await f.call('PUT', `/api/learn/boards/${project}/main`, { as: 'ana', body: { state: BOARD } });
  assert.equal((await f.raw('PUT', own(project), { as: 'ana', body: PNG })).status, 200);
  assert.deepEqual((await f.raw('GET', own(project), { as: 'ana' })).bytes, PNG);
  assert.equal((await f.raw('GET', own(project), { as: 'ben' })).status, 404, 'not theirs');
});
