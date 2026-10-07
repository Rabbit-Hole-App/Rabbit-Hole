import { test } from 'node:test';
import assert from 'node:assert/strict';

// The repository stub must survive a check that closes its page mid-request (2026-10-07: an unhandled "Response has been
// disposed" crashed rabbit-hole-check LOCAL=1 and left its browser running), and must still fail on any other error.
// Run: node --test e2e/nanogpt-repository-fixture.test.mjs (FIXTURE=<path> tests another copy of the module).
const { routeRepository } = await import(process.env.FIXTURE || './nanogpt-repository-fixture.mjs');
const handlerFor = async () => { let handler; await routeRepository({ route: async (_pattern, fn) => { handler = fn; } }); return handler; };
const request = (path, method = 'GET') => ({ url: () => `http://127.0.0.1:8878${path}`, method: () => method, postData: () => null });
const closed = (what) => Promise.reject(new Error(`${what}: Target page, context or browser has been closed`));

test('a page closed between fetch and json: the disposed response is dropped, nothing throws', async () => {
  const handler = await handlerFor();
  const route = { request: () => request('/api/apps'), fetch: async () => ({ json: () => Promise.reject(new Error('apiResponse.json: Response has been disposed')) }), fulfill: () => assert.fail('nothing to answer') };
  await handler(route);
});

test('a page closed before fetch or fulfill: dropped too', async () => {
  const handler = await handlerFor();
  await handler({ request: () => request('/api/apps'), fetch: () => closed('route.fetch') });
  await handler({ request: () => request('/api/repositories/repo-3adf61e1-nanogpt/snapshot'), fulfill: () => closed('route.fulfill') });
  // Seen on the integration stack, 2026-10-07: a context closed while its fetch was in flight.
  const disposed = Object.assign(new Error('route.fetch: Request context disposed.'), { name: 'TargetClosedError' });
  await handler({ request: () => request('/api/apps'), fetch: () => Promise.reject(disposed) });
  await handler({ request: () => request('/api/apps'), fetch: () => Promise.reject(new Error('route.fetch: Request context disposed.')) });
});

test('any other error still fails the check', async () => {
  const handler = await handlerFor();
  await assert.rejects(handler({ request: () => request('/api/apps'), fetch: async () => ({ json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')) }) }), /Unexpected token/);
  await assert.rejects(handler({ request: () => request('/api/repositories/repo-3adf61e1-nanogpt/snapshot'), fulfill: () => Promise.reject(new Error('boom')) }), /boom/);
});

test('a live page still gets the stubbed project in /api/apps', async () => {
  const handler = await handlerFor();
  let sent;
  await handler({ request: () => request('/api/apps'), fetch: async () => ({ json: async () => ({ org: 'o', email: 'e@x', apps: [{ name: 'a' }] }) }), fulfill: async (r) => { sent = r.json; } });
  assert.deepEqual(sent.apps.map((a) => a.name), ['repo-3adf61e1-nanogpt', 'a']);
});
