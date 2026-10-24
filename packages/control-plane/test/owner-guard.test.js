// The owner guard, exhaustively (telemetry owner decision 4.6; coordinator clarification 2026-10-23: the owner is
// Yudhisteer.chin@gmail.com and yudhisteer.chin01@gmail.com is a different identity that must never match).
// Sessions are read through the real devIdentity against a fake control plane that answers /api/me by session cookie, as the real
// one does. Denied callers must never reach a handler: the databases are spies that throw if touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ownerEmail, ownerOnly } from '../src/owner-guard.js';
import { OWNER_ROUTES, ownerTelemetryRoute } from '../src/owner-telemetry-routes.js';
import { d1, migration, telemetryDb } from './telemetry-fixture.js';

const OWNER_CONFIG = 'Yudhisteer.chin@gmail.com'; // as the owner may type it into the secret
const OWNER = 'yudhisteer.chin@gmail.com';        // the form the auth path stores and /api/me returns
const OTHER = 'yudhisteer.chin01@gmail.com';

const SESSIONS = {
  owner: { email: OWNER, org: 'o', user_id: 'user-owner' },
  'owner-upper': { email: 'YUDHISTEER.CHIN@GMAIL.COM', org: 'o', user_id: 'user-owner' },
  'owner-spaced': { email: '  yudhisteer.chin@gmail.com  ', org: 'o', user_id: 'user-owner' },
  chin01: { email: OTHER, org: 'o', user_id: 'user-chin01' },
  learner: { email: 'learner@example.com', org: 'o', user_id: 'user-learner' },
};
const controlPlane = (table = SESSIONS) => ({ fetch: async req => {
  const session = /(?:^|;\s*)small_session=([\w-]+)/.exec(req.headers.get('cookie') || '')?.[1];
  return new URL(req.url).pathname === '/api/me' && table[session] ? Response.json(table[session]) : Response.json({ error: 'Sign in' }, { status: 401 });
} });
const trap = label => new Proxy({}, { get: (_, property) => { throw new Error(`${label} touched (${String(property)}) by a caller who is not the owner`); } });

function envFor(t, extra = {}) {
  const telemetry = telemetryDb(t);
  const learn = new DatabaseSync(':memory:');
  t.after(() => learn.close());
  learn.exec(migration('learn-migrations/0022-usage-accounting.sql'));
  return { telemetry, env: { CONTROL_PLANE: controlPlane(), SUBSCRIPTION_OWNER_EMAIL: OWNER_CONFIG, TELEMETRY_DB: telemetry.db, TELEMETRY_ENVIRONMENT: 'dev', LEARN_DB: d1(learn), ...extra } };
}
const request = (path, { session, method = 'GET', headers = {}, body } = {}) => new Request(`https://rabbit.test${path}`, { method,
  headers: { ...(session ? { cookie: `small_session=${session}` } : {}), ...headers }, ...(body && !/^(GET|HEAD)$/.test(method) ? { body: JSON.stringify(body) } : {}) });
const call = (env, path, options) => { const req = request(path, options); return ownerTelemetryRoute(new URL(req.url).pathname, req, env); };
const pathOf = name => `/api/owner/telemetry/${name}${{ actions: '/act-1', support: '/RH-7QK2-M9XD' }[name] || ''}`;
const hidden = async (response, label) => {
  assert.equal(response.status, 404, label);
  assert.equal(await response.text(), 'Not found', label);
  assert.equal(response.headers.get('cache-control'), 'no-store', label);
};

test('the configured owner is compared as the application normalizes emails: case and spaces fold, nothing else does', async () => {
  assert.equal(ownerEmail({ SUBSCRIPTION_OWNER_EMAIL: OWNER_CONFIG }), OWNER);
  assert.equal(ownerEmail({ SUBSCRIPTION_OWNER_EMAIL: `  ${OWNER_CONFIG}\n` }), OWNER);
  const req = request('/x');
  const as = email => ownerOnly(req, { SUBSCRIPTION_OWNER_EMAIL: OWNER_CONFIG }, { identity: async () => ({ email, userId: 'u' }) });
  for (const allowed of [OWNER, OWNER_CONFIG, 'YUDHISTEER.CHIN@GMAIL.COM', `  ${OWNER}  `]) assert.deepEqual(await as(allowed), { email: OWNER, userId: 'u' }, allowed);
  const denied = [OTHER, 'yudhisteer.chin+rh@gmail.com', 'yudhis.teer.chin@gmail.com', 'yudhisteer.chin@googlemail.com', 'yudhisteer.chin@gmail.com.evil.example',
    'xyudhisteer.chin@gmail.com', 'yudhisteer.chin@gmail.co', 'learner@example.com', '"Y" <yudhisteer.chin@gmail.com>', `${OWNER},${OTHER}`, `${OWNER}\n`.replace(/\s/g, '') + '.invalid',
    '', '   ', null, undefined, 0, {}, [], [OWNER], true];
  for (const email of denied) assert.equal(await as(email), null, JSON.stringify(email));
});

test('missing, empty or malformed owner configuration fails closed for everyone, without reading a session', async t => {
  for (const configured of [undefined, null, '', '   ', 'not an address', 'yudhisteer.chin', `${OWNER},${OTHER}`, 'x@y', 0, {}, [OWNER], true, 'owner@example.invalid']) {
    let reads = 0;
    const { env } = envFor(t, { SUBSCRIPTION_OWNER_EMAIL: configured, CONTROL_PLANE: { fetch: async (...args) => { reads++; return controlPlane().fetch(...args); } } });
    for (const session of ['owner', 'owner-upper', 'chin01', 'learner', undefined]) await hidden(await call(env, pathOf('access'), { session }), `${JSON.stringify(configured)} / ${session}`);
    assert.equal(reads, 0, `no session read for ${JSON.stringify(configured)}`);
  }
  const { env } = envFor(t, { SUBSCRIPTION_OWNER_EMAIL: undefined });
  assert.equal(await ownerOnly(request('/x'), { SUBSCRIPTION_OWNER_EMAIL: undefined }, { identity: async () => ({ email: undefined }) }), null, 'undefined never equals undefined');
  assert.equal(await ownerOnly(request('/x'), env, { identity: async () => ({ email: undefined }) }), null);
});

for (const mode of ['true', 'false', 'TRUE', '', undefined]) {
  test(`SUBSCRIPTION_ONLY ${JSON.stringify(mode)}: the owner, in any case, is admitted; chin01, another account and a signed-out caller are not`, async t => {
    const { env } = envFor(t, mode === undefined ? {} : { SUBSCRIPTION_ONLY: mode });
    for (const session of ['owner', 'owner-upper', 'owner-spaced']) assert.equal((await call(env, pathOf('access'), { session })).status, 200, session);
    for (const session of ['chin01', 'learner', undefined, 'unknown-session']) await hidden(await call({ ...env, TELEMETRY_DB: trap('TELEMETRY_DB'), LEARN_DB: trap('LEARN_DB') }, pathOf('access'), { session }), `${mode} / ${session}`);
  });
}

test('every registered owner route is guarded: any method, no session, chin01 or another account gets one identical 404 and reaches no handler', async t => {
  const { env } = envFor(t);
  const spies = { ...env, TELEMETRY_DB: trap('TELEMETRY_DB'), LEARN_DB: trap('LEARN_DB') };
  assert.deepEqual(Object.keys(OWNER_ROUTES).sort(), ['access', 'actions', 'client-errors', 'health', 'learning', 'overview', 'project', 'support'],
    'a new owner route is added to ROUTES, which is guarded; update this list and review what it exposes');
  const names = [...Object.keys(OWNER_ROUTES), 'export', 'diagnostics', 'reconciliation', 'archive', 'nothing', 'a%2fb'];
  for (const name of names) for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) for (const session of [undefined, 'chin01', 'learner']) {
    await hidden(await call(spies, pathOf(name), { session, method, ...(method === 'GET' ? {} : { body: { email: OWNER } }) }), `${method} ${name} ${session}`);
  }
  assert.equal(await call(spies, '/api/owner/telemetry/../health', { session: 'owner' }), null, 'a path that normalizes outside the prefix is not handled here');
  await hidden(await call(spies, '/api/owner/telemetry', { session: 'chin01' }), 'bare prefix');
  await hidden(await call(spies, '/api/owner/telemetry/', { session: 'chin01' }), 'prefix with slash');
});

test('forged identity input does not make any caller the owner, on any route', async t => {
  const { env } = envFor(t);
  const spies = { ...env, TELEMETRY_DB: trap('TELEMETRY_DB'), LEARN_DB: trap('LEARN_DB') };
  for (const name of Object.keys(OWNER_ROUTES)) {
    const method = OWNER_ROUTES[name];
    const forged = [
      { path: `${pathOf(name)}?email=${encodeURIComponent(OWNER)}&owner=true&user_id=user-owner` },
      { path: pathOf(name), headers: { 'x-small-email': OWNER, 'x-forwarded-email': OWNER, 'x-rh-usage-payer': JSON.stringify({ email: OWNER, userId: 'user-owner' }), authorization: `Bearer ${OWNER}`, 'x-user-email': OWNER, 'x-small-workspace': 'o' } },
      { path: pathOf(name), body: { email: OWNER, owner: true, user_id: 'user-owner' } },
      { path: pathOf(name), headers: { cookie: `email=${OWNER}; owner=true; small_session=made-up-session` } },
    ];
    for (const { path, ...options } of forged) {
      await hidden(await call(spies, path, { method, ...options }), `anonymous ${method} ${path}`);
      await hidden(await call(spies, path, { method, session: 'chin01', ...options, headers: { ...options.headers, cookie: `small_session=chin01; email=${OWNER}` } }), `chin01 ${method} ${path}`);
      await hidden(await call(spies, path, { method, session: 'learner', ...options, headers: { ...options.headers, cookie: `small_session=learner; email=${OWNER}` } }), `learner ${method} ${path}`);
    }
  }
});

test('the owner reaches every registered route with its method, and only that method', async t => {
  const { env } = envFor(t);
  for (const [name, method] of Object.entries(OWNER_ROUTES)) {
    const ok = await call(env, pathOf(name), { session: 'owner-upper', method });
    // A handler may answer 404 with a JSON body (no such action); the guard's refusal is the plain text 'Not found'.
    assert.ok(ok.status !== 405 && !(ok.status === 404 && (await ok.clone().text()) === 'Not found'), `${name} is registered for the owner: ${ok.status}`);
    const wrong = await call(env, pathOf(name), { session: 'owner', method: method === 'GET' ? 'DELETE' : 'GET' });
    assert.equal(wrong.status, 405, `${name} refuses the wrong method for the owner`);
  }
  assert.equal((await call(env, pathOf('export'), { session: 'owner' })).status, 404, 'an unregistered route is 404 even for the owner');
});

test('there is one entry: nothing but ownerTelemetryRoute is exported, it calls the guard before dispatching, and no other file serves /api/owner', () => {
  const src = new URL('../src/', import.meta.url);
  const routes = readFileSync(new URL('owner-telemetry-routes.js', src), 'utf8');
  assert.deepEqual([...routes.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map(m => m[1]).sort(), ['OWNER_ROUTES', 'ownerTelemetryRoute']);
  const entry = routes.slice(routes.indexOf('export async function ownerTelemetryRoute'));
  assert.ok(entry.indexOf('await ownerOnly(') > 0 && entry.indexOf('await ownerOnly(') < entry.indexOf('ROUTES[name]') && entry.indexOf('await ownerOnly(') < entry.indexOf('route.run('), 'the guard runs before any handler is looked up or run');
  assert.equal([...routes.matchAll(/route\.run\(/g)].length, 1, 'handlers are only run from the dispatcher');
  // Any module that names an owner API path must go through the guard module; today only the registry and the worker's dispatch do.
  const named = readdirSync(src).filter(file => file.endsWith('.js') && /\/api\/owner/.test(readFileSync(new URL(file, src), 'utf8')));
  assert.deepEqual(named, ['owner-telemetry-routes.js'], 'a new owner API module must use the owner guard and be reviewed here');
  const worker = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  const dispatch = [...worker.matchAll(/^.*\/api\/owner.*$/gm)].map(m => m[0].trim()).filter(line => !line.startsWith('//'));
  assert.equal(dispatch.length, 1, 'the worker names the owner API once');
  assert.match(dispatch[0], /ownerTelemetryRoute\(path, req, env\)/);
  assert.equal(/\/api\/owner/.test(readFileSync(new URL('../../web/app-worker.js', import.meta.url), 'utf8')), false, 'the production worker adds no owner route of its own');
  assert.match(readFileSync(new URL('owner-guard.js', src), 'utf8'), /^import .*loginEmail.*auth\.js/m);
  assert.equal(/subscriptionOwnerRefusal|SUBSCRIPTION_ONLY/.test(readFileSync(new URL('owner-guard.js', src), 'utf8').replace(/^\/\/.*$/gm, '')), false, 'the guard never consults subscription mode');
});
