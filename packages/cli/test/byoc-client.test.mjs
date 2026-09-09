import test from 'node:test';
import assert from 'node:assert/strict';
import { createAwsClient } from '../lib/byoc-client.mjs';

const origin = 'https://abcdefghijklmnopqrst.lambda-url.us-east-1.on.aws/';
test('business inputs go directly to AWS and never to the grant issuer', async (t) => {
  const requests = [], grants = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { requests.push({ url, ...options }); return Response.json({ run_id: 'example' }); });
  const aws = createAwsClient(async (...args) => { grants.push(args); return { api_url: origin, token: 'scoped-token', expires_at: Date.now() / 1000 + 180 }; }, origin);
  await aws('/runs', { method: 'POST', body: { inputs: { label: 'PRIVATE_INPUT' } } });
  assert.deepEqual(grants, [[]]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, origin + 'runs');
  assert.equal(requests[0].credentials, 'omit');
  assert.equal(requests[0].redirect, 'error');
  assert.ok(requests[0].body.includes('PRIVATE_INPUT'));
});
test('changed API origin fails closed before sending any content or grant', async (t) => {
  let called = false;
  t.mock.method(globalThis, 'fetch', async () => { called = true; });
  const aws = createAwsClient(async () => ({ api_url: 'https://attacker.example/', token: 'secret', expires_at: 9999999999 }), origin);
  await assert.rejects(aws('/runs', { method: 'POST', body: { inputs: 'private' } }), /connection changed/);
  assert.equal(called, false);
});
test('expired API access is refreshed once without changing the destination', async (t) => {
  let attempts = 0, grants = 0;
  t.mock.method(globalThis, 'fetch', async () => ++attempts === 1 ? Response.json({ error: 'expired' }, { status: 401 }) : Response.json({ ok: true }));
  const aws = createAwsClient(async () => { grants++; return { api_url: origin, token: 'renewed', expires_at: Date.now() / 1000 + 180 }; }, origin);
  assert.deepEqual(await aws('/job'), { ok: true });
  assert.equal(grants, 2);
  assert.equal(attempts, 2);
});
