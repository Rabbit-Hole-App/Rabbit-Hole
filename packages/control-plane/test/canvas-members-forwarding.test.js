// The invitation family and the members subtree belong to the control plane (docs/features/canvas-comments.md C4): on
// production's app worker both reach it unchanged; on a guarded dev binding (the P0-B barrier) both are refused and
// never cross. The app worker's own comment routes never answer them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appWorker, devWorker } from './worker-import.js';
import { memoryBucket, liveDb, liveRuns } from './live-storage-spy.js';

const BOARD = '6f1c9a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const ROUTES = [['POST', '/api/learn/invites/preview'], ['POST', '/api/learn/invites/code'], ['POST', '/api/learn/invites/accept'], ['POST', '/api/learn/invites/cancel'],
  ['GET', `/api/learn/c/${BOARD}/members`], ['POST', `/api/learn/c/${BOARD}/members`], ['POST', `/api/learn/c/${BOARD}/members/m1/resend`], ['DELETE', `/api/learn/c/${BOARD}/members/m1`]];
const recorder = () => {
  const sent = [];
  const live = { sent, fetch: async req => { sent.push(`${req.method} ${new URL(req.url).pathname}`); return Response.json({ answered: 'control plane' }); } };
  return new Proxy(live, { get: (target, key) => (key in target ? target[key] : typeof key === 'string' ? () => {} : undefined) });
};

test('production: every invitation and members route reaches the control plane unchanged', async () => {
  const app = (await appWorker()).default;
  const env = { LEARN_MEDIA: memoryBucket(), CONTROL_PLANE: recorder() };
  for (const [method, path] of ROUTES) {
    const res = await app.fetch(new Request(`https://digrabbithole.com${path}`, { method, headers: { Origin: 'https://digrabbithole.com', 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: '{"token":"x"}' }) }), env, { waitUntil() {} });
    assert.deepEqual(await res.json(), { answered: 'control plane' }, `${method} ${path}`);
  }
  assert.deepEqual(env.CONTROL_PLANE.sent, ROUTES.map(([method, path]) => `${method} ${path}`));
});

test('a guarded dev binding refuses them all; nothing crosses', async () => {
  const dev = (await devWorker()).default;
  const env = { LEARN_MEDIA: memoryBucket(), DB: liveDb(), RUNS: liveRuns(), CONTROL_PLANE: recorder() };
  for (const [method, path] of ROUTES) {
    const res = await dev.fetch(new Request(`https://small-cp-dev-x.example${path}`, { method, headers: { cookie: 'small_session=s', 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: '{"token":"x"}' }) }), env, { waitUntil() {} });
    assert.equal(res.status, 403, `${method} ${path}`);
  }
  assert.deepEqual(env.CONTROL_PLANE.sent, []);
});
