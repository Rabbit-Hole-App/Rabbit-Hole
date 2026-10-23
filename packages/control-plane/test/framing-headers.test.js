// Who may frame what (SHARE-04, owner decision 6): every response carries frame-ancestors 'self' and X-Frame-Options
// SAMEORIGIN, except the GET/HEAD HTML shell of /embed/b/<token> and /embed/e/<token>, which any site may frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appWorker, devWorker } from './worker-import.js';
import { memoryBucket } from './live-storage-spy.js';
import { withFraming, EMBED_SHELL } from '../src/framing-headers.js';

const ORIGIN = 'https://digrabbithole.com';
const TOKEN = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6';
const SELF = "frame-ancestors 'self'";

const app = (await appWorker()).default, dev = (await devWorker()).default;
const control = { fetch: async req => (new URL(req.url).pathname.endsWith('.js') ? new Response('1', { headers: { 'Content-Type': 'text/javascript' } }) : new Response('<p>cp</p>', { headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'a=1', 'X-Frame-Options': 'ALLOWALL' } })) };
const assets = { fetch: async () => new Response('asset', { headers: { 'Content-Type': 'image/svg+xml' } }) };
const env = () => ({ LEARN_MEDIA: memoryBucket(), CONTROL_PLANE: control, ASSETS: assets });
const send = (worker, method, path, headers = {}) => worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers, redirect: 'manual' }), env(), { waitUntil() {} });
const blocked = (response, what) => {
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN', what);
  assert.match(response.headers.get('content-security-policy'), /(^|; )frame-ancestors 'self'(;|$)/, what);
  assert.doesNotMatch(response.headers.get('content-security-policy'), /frame-ancestors \*/, what);
};

test('only the /embed/b and /embed/e shells may be framed by anyone: frame-ancestors *, no X-Frame-Options, and nothing else widened', async () => {
  for (const worker of [app, dev]) {
    for (const kind of ['b', 'e']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await send(worker, method, `/embed/${kind}/${TOKEN}`);
        assert.equal(response.status, 200, `${method} /embed/${kind}`);
        assert.match(response.headers.get('content-type'), /^text\/html/);
        assert.equal(response.headers.get('content-security-policy'), 'frame-ancestors *', 'one directive, nothing else loosened');
        assert.equal(response.headers.get('x-frame-options'), null);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('set-cookie'), null, 'the shell sets no cookie');
      }
    }
  }
});

test('every other response is refused to foreign frames: pages, shells, API answers, redirects, errors and assets', async () => {
  const cases = [['GET', '/'], ['GET', '/sign-in'], ['GET', '/pricing'], ['GET', '/apps'], ['GET', '/library'], ['GET', '/explore'], ['GET', `/b/${TOKEN}`], ['GET', `/e/${TOKEN}`],
    ['GET', `/c/00000000-0000-4000-8000-000000000000`], ['GET', '/i'], ['GET', '/@ana'], ['GET', '/api/learn/boards/embed-session'], ['POST', '/api/learn/boards/embed-session'],
    ['GET', `/api/learn/boards/shared/${TOKEN}`], ['GET', `/api/learn/boards/shared/${TOKEN}/thumbnail`], ['GET', `/api/learn/boards/published/${TOKEN}/thumbnail`], ['GET', '/api/me'],
    ['GET', '/static/x.svg'], ['GET', '/nope'], ['GET', '/login'], ['GET', '/a/x'],
    // Near misses of the embed shell are ordinary responses: other methods, a short or longer token, other kinds, a trailing path.
    ['POST', `/embed/b/${TOKEN}`], ['GET', '/embed/b/short'], ['GET', '/embed/x/' + TOKEN], ['GET', `/embed/b/${TOKEN}/more`], ['GET', '/embed'], ['GET', `/embed/c/${TOKEN}`]];
  for (const worker of [app, dev]) {
    for (const [method, path] of cases) blocked(await send(worker, method, path), `${worker === app ? 'app' : 'dev'} ${method} ${path}`);
  }
  // The app worker's own early answers (before the dev worker) carry it too.
  blocked(await send(app, 'GET', '/internal/cad-budget-alert'), 'app early service answer');
  assert.equal((await send(app, 'GET', '/login')).status, 302);
});

test('withFraming merges into an existing CSP instead of overwriting it, and keeps cookies, status and body', async () => {
  const req = new Request(`${ORIGIN}/api/learn/boards/x/main/thumbnail`);
  const sandboxed = withFraming(req, new Response('png', { status: 200, headers: { 'Content-Security-Policy': "sandbox; default-src 'none'", 'Set-Cookie': 'k=v', 'Content-Type': 'image/png' } }));
  assert.equal(sandboxed.headers.get('content-security-policy'), "sandbox; default-src 'none'; frame-ancestors 'self'");
  assert.deepEqual([sandboxed.status, await sandboxed.text(), sandboxed.headers.get('set-cookie'), sandboxed.headers.get('content-type')], [200, 'png', 'k=v', 'image/png']);
  // A route that set its own looser frame-ancestors or X-Frame-Options outside /embed is overridden; twice is the same as once.
  const loose = withFraming(req, new Response('x', { headers: { 'Content-Security-Policy': "script-src 'self'; frame-ancestors *", 'X-Frame-Options': 'ALLOWALL' } }));
  assert.equal(loose.headers.get('content-security-policy'), "script-src 'self'; frame-ancestors 'self'");
  assert.equal(loose.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(withFraming(req, loose).headers.get('content-security-policy'), "script-src 'self'; frame-ancestors 'self'");
  // Immutable headers (a redirect, a fetched response) and a no-body status are handled; a failed embed shell is not exempt.
  const redirect = withFraming(req, Response.redirect(`${ORIGIN}/sign-in`, 302));
  assert.deepEqual([redirect.status, redirect.headers.get('location'), redirect.headers.get('x-frame-options')], [302, `${ORIGIN}/sign-in`, 'SAMEORIGIN']);
  assert.equal(withFraming(req, new Response(null, { status: 304 })).status, 304);
  blocked(withFraming(new Request(`${ORIGIN}/embed/b/${TOKEN}`), new Response('gone', { status: 404 })), 'a 404 at an embed address');
  assert.ok(EMBED_SHELL.test(`/embed/e/${TOKEN}`) && !EMBED_SHELL.test(`/embed/e/${TOKEN}/`));
});
