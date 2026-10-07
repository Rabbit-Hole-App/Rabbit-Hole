import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

// The repository stub must survive a check that closes its page mid-request (2026-10-07: an unhandled "Response has been
// disposed" crashed rabbit-hole-check LOCAL=1 and left its browser running), but only when the page or the context is really
// closed: the same wording from a live page, and any other error, must still fail the check.
// Run: node --test e2e/nanogpt-repository-fixture.test.mjs (FIXTURE=<path> tests another copy of the module). Part of the gate.
const { routeRepository, CLOSE_WAIT_MS } = await import(process.env.FIXTURE || './nanogpt-repository-fixture.mjs');

// A context and a page with the lifecycle the fixture reads: isClosed() and a 'close' event.
const lifecycle = () => {
  const context = Object.assign(new EventEmitter(), { route: async (_pattern, fn) => { context.handler = fn; } });
  const page = Object.assign(new EventEmitter(), { closed: false, isClosed: () => page.closed });
  const close = (target) => { if (target === page) page.closed = true; target.emit('close'); };
  return { context, page, close };
};
const setup = async () => { const life = lifecycle(); await routeRepository(life.context); return life; };
const request = (path, page) => ({ url: () => `http://127.0.0.1:8878${path}`, method: () => 'GET', postData: () => null, frame: () => ({ page: () => page }) });
const closedError = (what) => Object.assign(new Error(`${what}: Target page, context or browser has been closed`), { name: 'TargetClosedError' });
const SNAPSHOT_PATH = '/api/repositories/repo-3adf61e1-nanogpt/snapshot';

test('the page is closed: a disposed json() and a closed fulfill are dropped', async () => {
  const { context, page, close } = await setup();
  close(page);
  await context.handler({ request: () => request('/api/apps', page), fetch: async () => ({ json: () => Promise.reject(new Error('apiResponse.json: Response has been disposed')) }), fulfill: () => assert.fail('nothing to answer') });
  await context.handler({ request: () => request(SNAPSHOT_PATH, page), fulfill: () => Promise.reject(closedError('route.fulfill')) });
});

test('the close event lands just after the rejection (seen on the integration stack): dropped once it lands', async () => {
  const { context, page, close } = await setup();
  const disposed = Object.assign(new Error('route.fetch: Request context disposed.'), { name: 'TargetClosedError' });
  const answered = context.handler({ request: () => request('/api/apps', page), fetch: () => Promise.reject(disposed) });
  setTimeout(() => close(context), 50);
  await answered;
});

test('teardown wording while the page and the context are still open fails the check', async () => {
  const { context, page } = await setup();
  const started = Date.now();
  await assert.rejects(context.handler({ request: () => request('/api/apps', page), fetch: () => Promise.reject(closedError('route.fetch')) }), /has been closed/);
  assert.ok(Date.now() - started >= CLOSE_WAIT_MS - 50, 'it waited for a close event that never came');
  await assert.rejects(context.handler({ request: () => request('/api/apps', page), fetch: async () => ({ json: () => Promise.reject(new Error('apiResponse.json: Response has been disposed')) }) }), /disposed/);
});

test('any other error fails the check, even on a closed page', async () => {
  const { context, page, close } = await setup();
  await assert.rejects(context.handler({ request: () => request('/api/apps', page), fetch: async () => ({ json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')) }) }), /Unexpected token/);
  close(page);
  await assert.rejects(context.handler({ request: () => request(SNAPSHOT_PATH, page), fulfill: () => Promise.reject(new Error('boom')) }), /boom/);
});

test('a live page still gets the stubbed project in /api/apps', async () => {
  const { context, page } = await setup();
  let sent;
  await context.handler({ request: () => request('/api/apps', page), fetch: async () => ({ json: async () => ({ org: 'o', email: 'e@x', apps: [{ name: 'a' }] }) }), fulfill: async (r) => { sent = r.json; } });
  assert.deepEqual(sent.apps.map((a) => a.name), ['repo-3adf61e1-nanogpt', 'a']);
});
