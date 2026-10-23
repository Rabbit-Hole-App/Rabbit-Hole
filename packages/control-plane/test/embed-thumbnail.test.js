// The thumbnail of a public view link (SHARE-04, owner decision 4; item T): GET /api/learn/boards/shared/<viewToken>/thumbnail.
// Authorized again on every request, never stored by a shared cache, the owner's chosen cover only (the snapshot is drawn in the
// owner's browser from their own view and may show what a public viewer must not see). Publications use the published route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './shared-canvas-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2]);

function fixture(t) {
  const f = setup(t), objects = new Map();
  // R2, with the conditional get the worker passes its request headers to (onlyIf): a matching If-None-Match comes back bodyless.
  f.env.LEARN_MEDIA = {
    put: async (key, bytes, { httpMetadata }) => { objects.set(key, { bytes: new Uint8Array(bytes), httpMetadata, httpEtag: `"${key}:${bytes.byteLength}"` }); },
    get: async (key, options) => { const o = objects.get(key); if (!o) return null; const same = options?.onlyIf?.get?.('if-none-match') === o.httpEtag; return { body: same ? undefined : o.bytes, httpMetadata: o.httpMetadata, httpEtag: o.httpEtag }; },
    delete: async key => { objects.delete(key); },
    list: async () => ({ objects: [], truncated: false }),
  };
  f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, NULL)').run('ana@test');
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run('ana@test', 'ana');
  const raw = async (method, path, { as, body, headers = {} } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { ...(as ? { cookie: `small_session=${as}` } : {}), ...headers }, ...(body ? { body } : {}) });
    const response = await learnBoardsRoute(path, req, f.env);
    return { status: response.status, headers: response.headers, bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  return { ...f, objects, raw };
}
const view = token => `/api/learn/boards/shared/${token}/thumbnail`;
const own = name => `/api/learn/boards/${name}/main/thumbnail`;

test('a public view link serves the owner\'s cover only, revalidated and never in a shared cache; the snapshot is not served', async t => {
  const f = fixture(t);
  const { canvas, token } = await f.shareProject();
  // Nothing chosen yet: 204, and the owner's drawn snapshot (which may show their answers) is not a fallback.
  await f.raw('PUT', own(canvas.name), { as: 'ana', body: PNG });
  assert.equal((await f.raw('GET', own(canvas.name), { as: 'ana' })).headers.get('x-thumbnail-source'), 'snapshot');
  const none = await f.raw('GET', view(token));
  assert.deepEqual([none.status, none.bytes.length], [204, 0]);
  await f.raw('PUT', `${own(canvas.name)}/custom`, { as: 'ana', body: JPEG });
  const cover = await f.raw('GET', view(token));
  assert.deepEqual([cover.status, cover.headers.get('content-type'), cover.headers.get('x-thumbnail-source'), cover.bytes], [200, 'image/jpeg', 'custom', JPEG]);
  assert.equal(cover.headers.get('cache-control'), 'private, no-cache', 'stored only by the one browser, revalidated every time');
  assert.equal(cover.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(cover.headers.get('content-security-policy'), "sandbox; default-src 'none'");
  const head = await f.raw('HEAD', view(token));
  assert.deepEqual([head.status, head.bytes.length], [200, 0]);
  assert.equal((await f.raw('POST', view(token), { body: PNG })).status, 405);
  assert.equal((await f.raw('PUT', view(token), { as: 'ana', body: PNG })).status, 405, 'read-only, even for the owner');
  // The same for a signed-in viewer: no account is read.
  assert.deepEqual((await f.raw('GET', view(token), { as: 'ben' })).bytes, JPEG);
  // Back to the snapshot (cover removed): nothing served again.
  await f.raw('DELETE', `${own(canvas.name)}/custom`, { as: 'ana' });
  assert.equal((await f.raw('GET', view(token))).status, 204);
});

test('revocation is immediate: a conditional request with the right ETag still gets 404, never 304', async t => {
  const f = fixture(t);
  const { canvas, token } = await f.shareProject();
  await f.raw('PUT', `${own(canvas.name)}/custom`, { as: 'ana', body: JPEG });
  const etag = (await f.raw('GET', view(token))).headers.get('etag');
  assert.ok(etag);
  const conditional = link => f.raw('GET', view(link), { headers: { 'if-none-match': etag } });
  assert.equal((await conditional(token)).status, 304, 'while authorized, a revalidation is cheap');
  const share = body => f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body });
  // Restricted to signed-in people: no longer public.
  await share({ shared: true, view: true, public_view: false });
  const restricted = await conditional(token);
  assert.deepEqual([restricted.status, restricted.headers.get('cache-control')], [404, 'no-store']);
  assert.equal((await f.raw('GET', view(token), { as: 'ana' })).status, 404, 'not even for the owner: it is the public picture');
  // Public again keeps its token; switching the link off and on makes a new one and the old stays dead.
  await share({ shared: true, view: true, public_view: true });
  assert.equal((await conditional(token)).status, 304);
  await share({ shared: false });
  assert.equal((await conditional(token)).status, 404, 'unshared');
  const renewed = (await share({ shared: true, view: true, public_view: true })).body.sharing.view;
  assert.notEqual(renewed, token);
  assert.equal((await conditional(token)).status, 404, 'the old token after a new link');
  assert.equal((await f.raw('GET', view(renewed))).status, 200);
  // Trash suspends it, Restore wakes it; an unknown or malformed token is 404.
  await f.call('POST', `/api/apps/${canvas.name}/trash`, { as: 'ana' });
  assert.equal((await f.raw('GET', view(renewed))).status, 404);
  await f.call('POST', `/api/apps/${canvas.name}/untrash`, { as: 'ana' });
  assert.equal((await f.raw('GET', view(renewed))).status, 200);
  assert.equal((await f.raw('GET', view('x'.repeat(32)))).status, 404);
  assert.equal((await f.raw('GET', view('short'))).status, 404);
});

test('a publication token and a non-main board are not served here; the Explore route serves the custom cover only, too', async t => {
  const f = fixture(t);
  const { canvas, token } = await f.shareProject();
  const pub = (await f.call('POST', `/api/apps/${canvas.name}/publish`, { as: 'ana' })).body.publication_token;
  await f.raw('PUT', own(canvas.name), { as: 'ana', body: PNG });
  assert.equal((await f.raw('GET', view(pub))).status, 404, 'a publication has its own route');
  const published = await f.raw('GET', `/api/learn/boards/published/${pub}/thumbnail`);
  assert.deepEqual([published.status, published.bytes.length], [204, 0], 'Explore no longer serves the snapshot');
  await f.raw('PUT', `${own(canvas.name)}/custom`, { as: 'ana', body: JPEG });
  assert.deepEqual((await f.raw('GET', `/api/learn/boards/published/${pub}/thumbnail`)).bytes, JPEG);
  assert.equal((await f.raw('GET', `/api/learn/boards/published/${token}/thumbnail`)).status, 404, 'a share token is not a publication');
  // Only a main board has one.
  f.sqlite.prepare("UPDATE learn_boards SET board = 'notes' WHERE view_token = ?").run(token);
  assert.equal((await f.raw('GET', view(token))).status, 404);
});
