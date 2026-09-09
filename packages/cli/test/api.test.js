'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { call, fetchRaw, selectWorkspace } = require('../lib/api');

test('workspace selection reaches JSON, form and binary requests; login remains unscoped', async (t) => {
  const before = { SMALL_API: process.env.SMALL_API, SMALL_TOKEN: process.env.SMALL_TOKEN };
  Object.assign(process.env, { SMALL_API: 'https://small.example', SMALL_TOKEN: 'fixture' });
  t.after(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, ...options });
    if (url.endsWith('/api/workspaces')) return Response.json({ active: options.headers['X-Small-Workspace'], workspaces: [{ slug: 'w-team' }] });
    if (url.endsWith('/file')) return new Response('output bytes');
    return Response.json({});
  });
  await call('GET', '/api/apps');
  assert.equal(requests.at(-1).headers['X-Small-Workspace'], undefined);
  await selectWorkspace('w-team');
  await call('POST', '/api/byoc/grant', {});
  const form = new FormData();
  form.append('name', 'fixture');
  await call('POST', '/api/run', form);
  assert.equal(requests.at(-1).headers['Content-Type'], undefined);
  assert.equal((await fetchRaw('/file')).toString(), 'output bytes');
  for (const req of requests.slice(-3)) assert.equal(req.headers['X-Small-Workspace'], 'w-team');
  await call('POST', '/api/cli/login', { email: 'fixture@example.com' }, { auth: false });
  assert.equal(requests.at(-1).headers['X-Small-Workspace'], undefined);
  assert.equal(requests.at(-1).headers.Authorization, undefined);
});
