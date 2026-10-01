// Production Rabbit Hole's public origin (packages/web/app-worker.js, docs/features/rabbit-hole-production.md).
// rabbit-hole-app serves no hosted app (/a/*): an app's JS on https://digrabbithole.com would be same-origin with
// the session and could call /api/* as the signed-in person. Everything else keeps its route, and what crosses
// to rabbit-hole-cp keeps the public URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appWorker } from './worker-import.js';
import { memoryBucket } from './live-storage-spy.js';

const app = (await appWorker()).default;
const ORIGIN = 'https://digrabbithole.com';

// rabbit-hole-cp as a deployed service binding: an RPC stub, so every property name reads as a method.
// It answers like the hosted-app proxy would, so a leak would show up as app HTML or JS.
function controlPlane() {
  const sent = [];
  const live = {
    sent,
    fetch: async req => {
      sent.push(`${req.method} ${req.url}`);
      if (new URL(req.url).pathname.endsWith('.js')) return new Response('fetch("/api/me")', { headers: { 'Content-Type': 'text/javascript' } });
      return new Response('<script>fetch("/api/me")</script>', { headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'x=1' } });
    },
  };
  return new Proxy(live, { get: (target, key) => key in target ? target[key] : typeof key === 'string' ? () => {} : undefined });
}

const fixture = () => {
  const env = { LEARN_MEDIA: memoryBucket(), CONTROL_PLANE: controlPlane() };
  const send = (method, path, headers = {}) => app.fetch(new Request(`${ORIGIN}${path}`, { method, headers, redirect: 'manual' }), env, { waitUntil() {} });
  return { send, sent: env.CONTROL_PLANE.sent };
};

test('rabbit-hole-app answers /a and /a/* itself with a bare 404; nothing reaches the control plane', async () => {
  const f = fixture();
  for (const path of ['/a', '/a/', '/a/x/y', '/a/x/y/', '/a/x/y/app.js', '/a/x/y/page?q=1'])
    for (const method of ['GET', 'POST', 'HEAD'])
      for (const accept of [undefined, 'text/html']) {
        const res = await f.send(method, path, accept ? { accept } : {});
        const what = `${method} ${path} ${accept || ''}`;
        assert.equal(res.status, 404, what);
        assert.equal(res.headers.get('content-type'), 'text/plain;charset=utf-8', what);
        assert.equal(res.headers.get('cache-control'), 'no-store', what);
        assert.equal(res.headers.get('set-cookie'), null, what);
        assert.equal([...res.headers.keys()].find(k => k.startsWith('access-control-')), undefined, what);
        assert.doesNotMatch(await res.text(), /<|script|fetch/i, what);
      }
  // No same-origin app script exists, so none can call /api/* with the session.
  assert.deepEqual(f.sent, []);
});

test('/ is Landing on rabbit-hole-app, never the control plane\'s /apps redirect', async () => {
  const f = fixture();
  for (const method of ['GET', 'HEAD']) {
    const res = await f.send(method, '/');
    assert.equal(res.status, 200, method);
    assert.match(res.headers.get('content-type'), /^text\/html/, method);
    if (method === 'GET') assert.match(await res.text(), /dist-dev\/design\/rabbit-hole-hero\.html$/);
  }
  assert.deepEqual(f.sent, []);
});

test('Landing pages and the SPA shell stay on rabbit-hole-app', async () => {
  const f = fixture();
  for (const [path, page] of [['/sign-in', 'design/rabbit-hole-auth.html'], ['/apps', 'index.html'], ['/apps/canvas-0a1b2c3d', 'index.html'], ['/pricing', 'design/rabbit-hole-pricing.html']]) {
    const res = await f.send('GET', path);
    assert.equal(res.status, 200, path);
    assert.ok((await res.text()).endsWith(`/dist-dev/${page}`), path);
  }
  assert.deepEqual(f.sent, []);
});

test('sign-in, sign-out and account routes reach rabbit-hole-cp with the public URL, not an internal host', async () => {
  const f = fixture();
  const crossing = [['GET', '/auth/google/start?next=%2Fapps'], ['GET', '/auth/session'], ['POST', '/auth/email/start'], ['POST', '/logout'], ['POST', '/api/workspaces'], ['POST', '/api/cli/login']];
  for (const [method, path] of crossing) assert.equal((await f.send(method, path)).status, 200, `${method} ${path}`);
  assert.deepEqual(f.sent, crossing.map(([method, path]) => `${method} ${ORIGIN}${path}`));
});
