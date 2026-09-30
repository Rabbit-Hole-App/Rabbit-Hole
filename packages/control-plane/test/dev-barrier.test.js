// The dev/review write barrier (docs/features/dev-prod-write-barrier.md), driven through the real
// dev-worker.js fetch(). Every production touch is recorded: CONTROL_PLANE requests, DB statements and
// RUNS calls. A route is either answered on the dev worker or refused; only allowlisted reads cross.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { devWorker } from './worker-import.js';
import { liveDb, liveRuns, memoryBucket } from './live-storage-spy.js';
import { productionAllows } from '../src/dev-forwarding.js';

const worker = (await devWorker()).default;

// Production as the dev worker sees it. Answers every request so a forwarded one is visible,
// and records it: the assertions below decide what may have crossed.
function production() {
  const sent = [];
  return {
    sent,
    fetch: async req => {
      const path = new URL(req.url).pathname;
      sent.push(`${req.method} ${path}`);
      if (path === '/api/apps' || path === '/api/me') return Response.json({ org: 'team', email: 'owner@test', orgName: 'Team', apps: [] });
      return Response.json({ forwarded: path });
    },
  };
}

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Mine')");
  const LEARN_DB = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; }, batch: async s => Promise.all(s.map(x => x.run())) };
  const env = { LEARN_DB, LEARN_MEDIA: memoryBucket(), DB: liveDb(), RUNS: liveRuns(), CONTROL_PLANE: production() };
  const send = (method, path, body, headers = {}) => worker.fetch(new Request(`https://small-cp-dev-x.example${path}`, {
    method, headers: { cookie: 'small_session=s', ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
  }), env, { waitUntil() {} });
  // Zero production writes: no DB statement, no RUNS call, and every request that reached
  // production is a GET the allowlist names, or sign-in.
  t.after(() => {
    assert.deepEqual(env.DB.calls, [], 'the dev worker touched production D1');
    assert.deepEqual(env.RUNS.calls, [], 'the dev worker touched production small-runs');
    for (const call of env.CONTROL_PLANE.sent) {
      const [method, path] = call.split(' ');
      assert.ok(productionAllows(method, path) || call === 'GET /api/apps' || call === 'GET /api/me', `crossed to production: ${call}`);
    }
  });
  return { env, send, sent: env.CONTROL_PLANE.sent };
}

const blocked = async (response, what) => {
  assert.equal(response.status, 403, what);
  assert.deepEqual(await response.json(), { error: 'Blocked on this preview: it would change live state.' }, what);
};

test('state-changing requests the dev worker does not answer are refused and never reach production', async t => {
  const f = fixture(t);
  const refused = [
    ['POST', '/api/deploy', {}], ['POST', '/api/runs', { app: 'counter' }], ['POST', '/api/runs/r-1/stop', {}], ['POST', '/api/schedule', {}],
    ['POST', '/api/ask', { scope: { app: 'counter' }, message: 'hi' }], ['POST', '/api/ask/approve', { id: 'p-1' }], ['POST', '/api/ask/reject', { id: 'p-1' }],
    ['POST', '/api/ask/file', {}], ['POST', '/api/ask/threads/7/rename', { title: 'x' }], ['POST', '/api/ask/threads/7/delete', {}],
    ['POST', '/api/apps/counter/learn-course', { action: 'draft' }], ['POST', '/api/apps/counter/request-access', {}], ['POST', '/api/apps/counter/duplicate', {}],
    ['POST', '/api/apps/find', { q: 'x' }], ['POST', '/api/runs/find', { q: 'x' }], ['POST', '/api/runbook', {}], ['POST', '/api/review/run', {}], ['POST', '/api/image', {}],
    ['POST', '/api/workspaces', { name: 'x' }], ['POST', '/api/org/ai', { provider: 'anthropic' }], ['POST', '/api/share', {}], ['POST', '/api/folders', {}],
    ['POST', '/api/teams', {}], ['POST', '/api/members', { email: 'a@b.c' }], ['POST', '/api/watch/1/dismiss', {}],
    ['POST', '/api/cli/login', { email: 'a@b.c' }], ['POST', '/api/cli/verify', {}], ['POST', '/api/runtime/aws-creds', {}], ['POST', '/api/runs/r-1/log', {}],
    ['POST', '/api/apps/counter/request-log', {}], ['POST', '/test/watch', {}], ['POST', '/test/openai/chat/completions', {}],
    ['POST', '/slack/events', {}], ['POST', '/slack/command', {}], ['POST', '/slack/interact', {}], ['POST', '/a/team/counter/submit', {}],
    ['PUT', '/api/runbook', {}], ['PATCH', '/api/apps/counter', { visibility: 'domain' }], ['DELETE', '/api/apps/counter'],
  ];
  for (const [method, path, body] of refused) await blocked(await f.send(method, path, body), `${method} ${path}`);
  assert.deepEqual(f.sent, []);
});

test('side-effectful and customer-facing GETs are refused too', async t => {
  const f = fixture(t);
  for (const path of ['/api/logs?app=counter', '/slack/oauth?code=c&state=s', '/slack/install', '/api/runs?app=counter', '/api/apps/counter/s3-list',
    '/api/apps/counter/s3-object?key=a', '/api/apps/counter/role', '/api/runs/r-1/inputs/in.csv', '/a/team/counter/', '/a/team/counter/page', '/nothing-here'])
    await blocked(await f.send('GET', path), `GET ${path}`);
  await blocked(await f.send('HEAD', '/api/workspaces'), 'HEAD');
  assert.deepEqual(f.sent, []);
});

test('each allowlisted production read and the sign-in bridge still reach production, unchanged', async t => {
  const f = fixture(t);
  const reads = ['/', '/api/workspaces', '/api/watch', '/api/ask/threads', '/api/ask/threads/42', '/api/runs/r-1', '/api/runs/r-1/outputs', '/api/runs/r-1/outputs/chart.png',
    '/api/apps/counter', '/api/apps/counter/deploys', '/api/apps/counter/runbook', '/api/apps/counter/learn-course', '/api/trash', '/api/org/ai', '/api/teams', '/api/members',
    '/api/request-logs', '/api/review', '/login', '/auth', '/logout'];
  for (const path of reads) assert.deepEqual(await (await f.send('GET', path)).json(), { forwarded: path }, path);
  for (const path of ['/login', '/test/session']) assert.deepEqual(await (await f.send('POST', path, {})).json(), { forwarded: path }, path);
  assert.deepEqual(f.sent, [...reads.map(path => `GET ${path}`), 'POST /login', 'POST /test/session']);
});

test('writes the dev worker answers itself stay on dev storage', async t => {
  const f = fixture(t);
  assert.equal((await f.send('POST', '/api/canvases', { title: 'New' })).status, 201);
  assert.equal((await f.send('PATCH', '/api/apps/canvas-0a1b2c3d', { title: 'Renamed' })).status, 200);
  assert.equal((await f.send('DELETE', '/api/apps/canvas-0a1b2c3d')).status, 200);
  assert.ok(f.sent.every(call => call === 'GET /api/apps' || call === 'GET /api/me'), f.sent.join());
});

test('dev-worker.js sends every fall-through through the barrier', () => {
  const source = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  assert.equal(source.match(/CONTROL_PLANE\.fetch/g), null, 'dev-worker.js calls CONTROL_PLANE directly');
  assert.match(source, /return forwardToProduction\(req, env\);\s*\},\s*\};\s*$/, 'the barrier is the last line of fetch()');
});

test('a canvas Learn ask with an @-mention runs on dev storage and reads nothing from production D1', async t => {
  const f = fixture(t), original = globalThis.fetch, prompts = [];
  f.env.ANTHROPIC_API_KEY = 'test';
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).hostname, 'api.anthropic.com');
    prompts.push(init.body);
    return Response.json({ content: [{ type: 'text', text: 'Answer.' }], stop_reason: 'end_turn' });
  };
  t.after(() => { globalThis.fetch = original; });
  const response = await f.send('POST', '/api/learn/ask', { scope: { app: 'canvas-0a1b2c3d' }, message: 'compare', mentions: ['counter'] });
  assert.match(await response.text(), /event: done/);
  assert.match(prompts.join(), /Mentioned app counter: not available to this chat \(live apps are not read on this preview\)/);
});
