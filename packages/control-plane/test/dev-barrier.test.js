// The dev/review write barrier (docs/features/dev-prod-write-barrier.md), driven through the real
// dev-worker.js fetch(). Every production touch is recorded: CONTROL_PLANE requests, DB statements and
// RUNS calls. A route is either answered on the dev worker or refused; only allowlisted reads cross.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { devWorker, productionWorker, appWorker } from './worker-import.js';
import { sign } from '../src/token.js';
import { liveDb, liveRuns, memoryBucket } from './live-storage-spy.js';
import { productionAllows, devIdentity, guardControlPlane } from '../src/dev-forwarding.js';

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
      if (path === '/api/me') return Response.json({ org: 'team', email: 'owner@test', orgName: 'Team' });
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
  // production is a GET the allowlist names (no production authentication ever crosses).
  t.after(() => {
    assert.deepEqual(env.DB.calls, [], 'the dev worker touched production D1');
    assert.deepEqual(env.RUNS.calls, [], 'the dev worker touched production small-runs');
    for (const call of env.CONTROL_PLANE.sent) {
      const [method, path] = call.split(' ');
      assert.ok(productionAllows(method, path) || call === 'GET /api/me', `crossed to production: ${call}`);
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

test('each allowlisted production read still reaches production, unchanged', async t => {
  const f = fixture(t);
  // '/' is Landing's page on the dev worker now (smart-landing-page); every other allowlisted read still forwards.
  const reads = ['/api/workspaces', '/api/watch', '/api/ask/threads', '/api/ask/threads/42', '/api/runs/r-1', '/api/runs/r-1/outputs', '/api/runs/r-1/outputs/chart.png',
    '/api/apps/counter', '/api/apps/counter/deploys', '/api/apps/counter/runbook', '/api/apps/counter/learn-course', '/api/trash', '/api/org/ai', '/api/teams', '/api/members',
    '/api/request-logs', '/api/review'];
  for (const path of reads) assert.deepEqual(await (await f.send('GET', path)).json(), { forwarded: path }, path);
  assert.deepEqual(f.sent, reads.map(path => `GET ${path}`));
});

// Production authentication never crosses (owner, 2026-09-30): the dedicated dev control plane is the
// replacement, not a production bridge. Zero forwarding, zero DB, zero RUNS for every method.
test('production sign-in, sign-out, magic links and test sessions are refused with every method', async t => {
  const f = fixture(t);
  for (const path of ['/login', '/auth', '/auth?token=t', '/logout', '/test/session'])
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) await blocked(await f.send(method, path, method === 'GET' || method === 'DELETE' ? undefined : {}), `${method} ${path}`);
  assert.deepEqual(f.sent, []);
  assert.deepEqual(f.env.DB.calls, []);
  assert.deepEqual(f.env.RUNS.calls, []);
});

test('writes the dev worker answers itself stay on dev storage', async t => {
  const f = fixture(t);
  assert.equal((await f.send('POST', '/api/canvases', { title: 'New' })).status, 201);
  assert.equal((await f.send('PATCH', '/api/apps/canvas-0a1b2c3d', { title: 'Renamed' })).status, 200);
  assert.equal((await f.send('DELETE', '/api/apps/canvas-0a1b2c3d')).status, 200);
  assert.ok(f.sent.every(call => call === 'GET /api/me'), f.sent.join());
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

// Identity without side effects. Production GET /api/me verifies the session and reads at most one
// workspace_members row; GET /api/apps, which the dev worker used before, runs an UPDATE first.
test('production GET /api/me answers who is signed in with reads only; GET /api/apps writes', async () => {
  const production = (await productionWorker()).default;
  const sql = [];
  const DB = { prepare: text => ({ bind: () => ({
    first: async () => { sql.push(text); return /workspace_members/.test(text) ? { slug: 'w-lab', name: 'Lab' } : /FROM users/.test(text) ? { session_epoch: 0 } : null; },
    all: async () => { sql.push(text); return { results: [] }; },
    run: async () => { sql.push(text); return { meta: { changes: 0 } }; },
  }), run: async () => { sql.push(text); return { meta: { changes: 0 } }; } }) };
  const env = { MASTER_KEY: 'test-master-key', DB };
  // a current session (auth.js): uid + epoch, checked against users with one SELECT
  const session = await sign({ t: 'sess', uid: 'u1', email: 'owner@team.test', ep: 0, exp: Math.floor(Date.now() / 1000) + 60 }, env.MASTER_KEY);
  const me = headers => production.fetch(new Request('https://small-cp.test/api/me', { headers }), env, {});
  assert.deepEqual(await (await me({ 'X-Small-Session': session })).json(), { email: 'owner@team.test', org: 'team-test', orgName: null });
  assert.deepEqual(await (await me({ 'X-Small-Session': session, 'X-Small-Workspace': 'w-lab' })).json(), { email: 'owner@team.test', org: 'w-lab', orgName: 'Lab' });
  assert.equal((await me({})).status, 401);
  assert.ok(sql.length && sql.every(text => /^\s*SELECT/i.test(text)), sql.join(' | '));
  sql.length = 0;
  await production.fetch(new Request('https://small-cp.test/api/apps', { headers: { 'X-Small-Session': session } }), env, {});
  assert.match(sql.find(text => !/FROM users/.test(text)), /^UPDATE runs/, 'GET /api/apps sweeps first (after the session check): why the dev worker no longer asks it');
});

test('dev identity asks GET /api/me, and falls back to two reads while production does not have it yet', async () => {
  const ask = routes => {
    const sent = [];
    const env = { CONTROL_PLANE: { fetch: async req => { const path = new URL(req.url).pathname; sent.push(`${req.method} ${path}`); return routes[path] ? Response.json(routes[path]) : Response.json({ error: 'no such endpoint' }, { status: 404 }); } } };
    return devIdentity(new Request('https://dev.test/api/canvases', { headers: { cookie: 'small_session=s' } }), env).then(user => ({ user, sent }));
  };
  const deployed = await ask({ '/api/me': { email: 'a@b.c', org: 'b-c', orgName: null } });
  assert.deepEqual(deployed, { user: { email: 'a@b.c', org: 'b-c', orgName: null }, sent: ['GET /api/me'] });
  const bridge = await ask({ '/api/workspaces': { active: 'w-lab', workspaces: [{ slug: 'b-c', name: null }, { slug: 'w-lab', name: 'Lab' }] }, '/api/trash': { trash: [], email: 'a@b.c' } });
  assert.deepEqual(bridge, { user: { email: 'a@b.c', org: 'w-lab', orgName: 'Lab' }, sent: ['GET /api/me', 'GET /api/workspaces', 'GET /api/trash'] });
  for (const call of bridge.sent.slice(1)) assert.ok(productionAllows(...call.split(' ')), call);
  const signedOut = await devIdentity(new Request('https://dev.test/'), { CONTROL_PLANE: { fetch: async () => Response.json({ error: 'run small login first' }, { status: 401 }) } });
  assert.equal(signedOut.status, 401);
});

test('the dev catalog lists dev apps only and asks production nothing but who is signed in', async t => {
  const f = fixture(t);
  const catalog = await (await f.send('GET', '/api/apps')).json();
  assert.deepEqual([catalog.org, catalog.email, catalog.folders, catalog.apps.map(app => app.name)], ['team', 'owner@test', [], ['canvas-0a1b2c3d']]);
  assert.deepEqual(f.sent, ['GET /api/me']);
});

// Review follow-up: the barrier wraps the CONTROL_PLANE binding itself, so a module call site (not only
// the fetch() fall-through) that sends a write or an unlisted read is refused and never reaches production.
test('every CONTROL_PLANE call on the dev worker passes the allowlist, whichever module makes it', async () => {
  const sent = [], live = { fetch: async req => { sent.push(`${req.method} ${new URL(req.url).pathname}`); return Response.json({ ok: true }); } };
  const env = guardControlPlane({ CONTROL_PLANE: live, LEARN_MEDIA: {} });
  assert.equal(guardControlPlane(env), env, 'wrapping twice is a no-op');
  for (const [method, path] of [['POST', '/api/apps'], ['POST', '/api/share'], ['DELETE', '/api/apps/x'], ['GET', '/api/logs'], ['GET', '/api/apps'], ['GET', '/api/future-thing'], ['PUT', '/api/runbook']]) {
    const res = await env.CONTROL_PLANE.fetch(new Request(`https://dev.test${path}`, { method }));
    assert.equal(res.status, 403, `${method} ${path}`);
  }
  assert.equal((await env.CONTROL_PLANE.fetch('https://dev.test/api/me')).status, 200);
  assert.equal((await env.CONTROL_PLANE.fetch(new Request('https://dev.test/api/apps/counter'))).status, 200);
  assert.deepEqual(sent, ['GET /api/me', 'GET /api/apps/counter']);
  const source = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(source, /async queue\(batch, env\) \{\n {4}env = guardControlPlane\(env\);/);
  assert.match(source, /async fetch\(req, env, ctx\) \{\n(?: {4}\/\/[^\n]*\n)? {4}env = guardControlPlane\(env\);/);
});

// A deployed service binding is an RPC stub: every property name reads as a method stub (a function),
// so a `binding.guarded` flag is always truthy there (checked under wrangler dev, 2026-10-01). The
// barrier must still wrap such a binding.
const rpcBinding = live => new Proxy(live, { get: (target, key) => key in target ? target[key] : typeof key === 'string' ? () => {} : undefined });

test('the barrier wraps a real service binding, whose every property reads as truthy', async () => {
  const live = rpcBinding(production());
  const env = guardControlPlane({ CONTROL_PLANE: live });
  assert.notEqual(env.CONTROL_PLANE, live, 'a binding with a truthy guarded property went unwrapped');
  assert.equal(guardControlPlane(env), env, 'wrapping twice is a no-op');
  await blocked(await env.CONTROL_PLANE.fetch(new Request('https://dev.test/api/workspaces', { method: 'POST' })), 'module call');
  assert.equal((await env.CONTROL_PLANE.fetch('https://dev.test/api/me')).status, 200);
  assert.deepEqual(live.sent, ['GET /api/me']);
});

// Production Rabbit Hole (packages/web/app-worker.js): CONTROL_PLANE is that deployment's own control
// plane, so sign-in and writes pass through; the dev worker given the same binding still refuses them.
test('the production app worker passes everything to its own control plane; the dev worker does not', async () => {
  const app = (await appWorker()).default;
  const live = rpcBinding(production());
  const env = { LEARN_MEDIA: memoryBucket(), CONTROL_PLANE: live };
  const send = (w, method, path) => w.fetch(new Request(`https://tryrabbithole.test${path}`, { method, redirect: 'manual' }), env, { waitUntil() {} });
  for (const [method, path] of [['POST', '/auth/email/start'], ['GET', '/auth/google/start'], ['GET', '/auth/session'], ['POST', '/logout'], ['POST', '/api/workspaces'], ['POST', '/api/cli/login']]) {
    assert.equal((await send(app, method, path)).status, 200, `app ${method} ${path}`);
    await blocked(await send(worker, method, path), `dev ${method} ${path}`);
  }
  assert.deepEqual(live.sent, ['POST /auth/email/start', 'GET /auth/google/start', 'GET /auth/session', 'POST /logout', 'POST /api/workspaces', 'POST /api/cli/login']);
  const login = await send(app, 'GET', '/login?next=%2Fapps&error=expired');
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), 'https://tryrabbithole.test/sign-in?next=%2Fapps&error=expired');
});
