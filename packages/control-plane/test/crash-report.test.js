// Crash alerts (crash-report.js): the report is bounded and scrubbed again on the server, logged, sent to Sentry when a DSN is set and
// mailed once per fingerprint per hour. Doubles only: no network, no mail, no Cache API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureServerError, composeCrashMail, crashNotify, crashRoute, framesOf, parseCrash, parseDsn, resetCrashMailForTests, scrub, sendToSentry, topFrame } from '../src/crash-report.js';

const SOURCE = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const ORIGIN = 'https://digrabbithole.com';
const DSN = 'https://publickey123@o4500.ingest.sentry.io/6789';
const USER = { uid: 'u_123', email: 'learner@example.test', org: 'workspace-a' };
const STACK = 'TypeError: Cannot read properties of undefined (reading \'left\')\n    at tu (https://digrabbithole.com/static/CanvasPage-DJZ8n_fa.js:12:28025)\n    at nu (https://digrabbithole.com/static/CanvasPage-DJZ8n_fa.js:12:28526)';
const body = (over = {}) => ({ v: 1, kind: 'boundary', artifact: 'roadmap_canvas', name: 'TypeError', message: 'Cannot read properties of undefined (reading \'left\')', stack: STACK, component_stack: '\n    at nu\n    at div', route: '/apps/:id', release: '8deb778fa', fingerprint: '0123456789abcdef', browser: { browser: 'chrome', device: 'desktop' }, online: true, ...over });
const post = (path, payload, headers = {}) => new Request(ORIGIN + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });
const quiet = t => { const lines = [], log = console.log; console.log = line => { lines.push(String(line)); }; t.after(() => { console.log = log; }); return lines; };
const fetchDouble = (reply = { ok: true }) => { const calls = []; const fetchImpl = async (url, init) => { calls.push({ url, init }); if (reply instanceof Error) throw reply; return reply; }; fetchImpl.calls = calls; return fetchImpl; };
const wait = () => { const pending = []; return { waitUntil: promise => pending.push(promise), done: () => Promise.all(pending), pending }; };

test('parseCrash: every field is bounded, unknown keys are dropped, a non-report is refused', async () => {
  const report = await parseCrash({ ...body({ message: 'x'.repeat(900), stack: 'at a (f.js:1:1)\n'.repeat(400), component_stack: 'y'.repeat(5000), route: '/r'.repeat(300), name: 'Bad name!' }), password: 'hunter2', extra: { a: 1 } });
  assert.deepEqual(Object.keys(report).sort(), ['artifact', 'browser', 'component_stack', 'fingerprint', 'kind', 'message', 'name', 'online', 'release', 'route', 'stack']);
  assert.ok(report.message.length <= 300 && report.stack.length <= 2000 && report.component_stack.length <= 1000 && report.route.length <= 200);
  assert.equal(report.name, 'NonError', 'a name that is not a plain identifier');
  assert.match(report.fingerprint, /^[0-9a-f]{16}$/);
  for (const bad of [null, 'x', [], {}, { kind: 'nope' }, { ...body(), kind: 'client.error' }]) assert.equal(await parseCrash(bad), null, JSON.stringify(bad)?.slice(0, 40));
  const odd = await parseCrash(body({ artifact: 'not valid!', release: 'a b', online: 'yes', browser: { browser: '<script>', device: 5 } }));
  assert.deepEqual([odd.artifact, odd.release, odd.online, odd.browser], [null, null, null, { browser: 'other', device: 'desktop' }]);
});

test('scrub: URL query strings and origins, share tokens, emails and long token-like runs never survive; a stack frame keeps its file and line', () => {
  const out = scrub('failed at https://digrabbithole.com/b/SECRETSHARETOKEN123?token=abc&x=1#frag for learner@example.test with 0123456789abcdef0123456789abcdef0123 and https://digrabbithole.com/static/Canvas-DJZ8n_fa.js:12:28025');
  assert.doesNotMatch(out, /SECRETSHARETOKEN|token=|learner@|0123456789abcdef0123|digrabbithole\.com|#frag/);
  assert.match(out, /\/b\/\[token\]/);
  assert.match(out, /\[email\]/);
  assert.match(out, /\/static\/Canvas-DJZ8n_fa\.js:12:28025/, 'the frame keeps its file and position');
});

test('fingerprint: one failure is one fingerprint across reloads and releases; another place or error is another', async () => {
  const a = await parseCrash(body());
  const reload = await parseCrash(body({ message: 'different words', stack: STACK.replace(/28025/g, '99999').replace('DJZ8n_fa', 'NEWHASH12'), component_stack: '' }));
  assert.equal(reload.fingerprint, a.fingerprint);
  assert.notEqual((await parseCrash(body({ artifact: 'slot_card' }))).fingerprint, a.fingerprint);
  assert.notEqual((await parseCrash(body({ name: 'RangeError' }))).fingerprint, a.fingerprint);
  assert.equal(topFrame(STACK), 'at tu (https://digrabbithole.com/static/CanvasPage.js)');
});

test('Sentry: the DSN parses, the envelope carries the exception, tags, user and release, and every failure is silent', async () => {
  assert.deepEqual(parseDsn(DSN), { url: 'https://o4500.ingest.sentry.io/api/6789/envelope/', key: 'publickey123', dsn: DSN });
  assert.equal(parseDsn('https://k@host/prefix/12').url, 'https://host/prefix/api/12/envelope/');
  for (const bad of [undefined, '', 'http://k@host/1', 'https://host/1', 'not a dsn']) assert.equal(parseDsn(bad), null, String(bad));
  const report = await parseCrash(body());
  const fetchImpl = fetchDouble();
  assert.equal(await sendToSentry({ SENTRY_DSN: DSN, TELEMETRY_ENVIRONMENT: 'production' }, report, { account: 'u_123', at: Date.UTC(2026, 10, 7) }, { fetchImpl }), true);
  const [{ url, init }] = fetchImpl.calls;
  assert.equal(url, 'https://o4500.ingest.sentry.io/api/6789/envelope/');
  assert.match(init.headers['X-Sentry-Auth'], /sentry_key=publickey123/);
  const [header, item, event] = init.body.split('\n').map(line => JSON.parse(line));
  assert.deepEqual([header.dsn, item.type], [DSN, 'event']);
  assert.deepEqual([event.platform, event.level, event.environment, event.release, event.user, event.fingerprint], ['javascript', 'fatal', 'production', '8deb778fa', { id: 'u_123' }, [report.fingerprint]]);
  assert.deepEqual(event.tags, { artifact: 'roadmap_canvas', kind: 'boundary', route: '/apps/:id', fingerprint: report.fingerprint, browser: 'chrome', device: 'desktop' });
  const [exception] = event.exception.values;
  assert.deepEqual([exception.type, exception.value], ['TypeError', report.message]);
  assert.deepEqual(exception.stacktrace.frames.map(frame => [frame.function, frame.lineno, frame.colno]), [['nu', 12, 28526], ['tu', 12, 28025]], 'frames oldest first: the caller nu, then tu where it threw');
  assert.doesNotMatch(init.body, /digrabbithole\.com\/static|@example/, 'the envelope carries only scrubbed text');
  assert.deepEqual(framesOf('fn@https://x.test/a.js:3:4'), [{ function: 'fn', filename: 'https://x.test/a.js', lineno: 3, colno: 4 }]);
  // No DSN: no request. A failing or refusing Sentry: false, never a throw.
  const none = fetchDouble();
  assert.equal(await sendToSentry({}, report, {}, { fetchImpl: none }), false);
  assert.equal(await sendToSentry({ SENTRY_DSN: 'garbage' }, report, {}, { fetchImpl: none }), false);
  assert.equal(none.calls.length, 0);
  assert.equal(await sendToSentry({ SENTRY_DSN: DSN }, report, {}, { fetchImpl: fetchDouble(new Error('network down')) }), false);
  assert.equal(await sendToSentry({ SENTRY_DSN: DSN }, report, {}, { fetchImpl: fetchDouble({ ok: false, status: 429 }) }), false);
});

test('POST /api/telemetry/crash: anonymous is accepted, the account is attached, it is logged and sent to Sentry after the answer', async t => {
  const lines = quiet(t);
  const fetchImpl = fetchDouble(), ctx = wait();
  const anonymous = await crashRoute(post('/api/telemetry/crash', body(), { 'sec-fetch-site': 'same-origin' }), { SENTRY_DSN: DSN }, ctx, { identity: async () => Response.json({ error: 'no session' }, { status: 401 }), fetchImpl });
  assert.equal(anonymous.status, 204);
  await ctx.done();
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(JSON.parse(fetchImpl.calls[0].init.body.split('\n')[2]).user, undefined, 'anonymous: no user');
  const signedIn = await crashRoute(post('/api/telemetry/crash', body({ artifact: 'slot_card' }), { 'user-agent': 'Mozilla/5.0 Chrome/120 Safari/537' }), { SENTRY_DSN: DSN, TELEMETRY_ENVIRONMENT: 'production' }, ctx, { identity: async () => ({ userId: 'u_123' }), fetchImpl });
  assert.equal(signedIn.status, 204);
  await ctx.done();
  assert.equal(JSON.parse(fetchImpl.calls[1].init.body.split('\n')[2]).user.id, 'u_123');
  const logged = lines.map(line => JSON.parse(line)).filter(line => line.event === 'client_crash');
  assert.deepEqual([logged.length, logged[1].account, logged[1].artifact, logged[1].ua, logged[1].message], [2, 'u_123', 'slot_card', { browser: 'chrome', device: 'desktop' }, body().message]);
  assert.ok(lines.every(line => !line.includes(DSN) && !line.includes('publickey123')), 'no secret in the log');
  // Without SENTRY_DSN the route still answers and logs; with no waitUntil it still answers.
  assert.equal((await crashRoute(post('/api/telemetry/crash', body()), {}, undefined, { identity: async () => null, fetchImpl })).status, 204);
  assert.equal(fetchImpl.calls.length, 2, 'no DSN: no Sentry request');
});

test('POST /api/telemetry/crash: same-origin only, bounded, rate limited, POST only, switchable off', async t => {
  quiet(t);
  const identity = async () => null;
  const env = { SENTRY_DSN: DSN };
  assert.equal((await crashRoute(post('/api/telemetry/crash', body(), { 'sec-fetch-site': 'cross-site' }), env, wait(), { identity })).status, 403);
  assert.equal((await crashRoute(post('/api/telemetry/crash', body(), { Origin: 'https://evil.test' }), env, wait(), { identity })).status, 403);
  assert.equal((await crashRoute(new Request(ORIGIN + '/api/telemetry/crash'), env, wait(), { identity })).status, 405);
  assert.equal((await crashRoute(post('/api/telemetry/crash', 'not json'), env, wait(), { identity })).status, 400);
  assert.equal((await crashRoute(post('/api/telemetry/crash', { kind: 'nope' }), env, wait(), { identity })).status, 400);
  assert.equal((await crashRoute(post('/api/telemetry/crash', body({ stack: 'z'.repeat(40000) })), env, wait(), { identity })).status, 413);
  assert.equal((await crashRoute(post('/api/telemetry/crash', body()), { TELEMETRY_CLIENT_DISABLED: 'true' }, wait(), { identity })).status, 204);
  const stingy = { take: () => ({ ok: false, retryAfterMs: 1000 }) };
  assert.equal((await crashRoute(post('/api/telemetry/crash', body()), env, wait(), { identity, limit: stingy })).status, 429);
  // The real bucket: a crash loop is cut off after its burst.
  let last = 204;
  for (let i = 0; i < 12; i++) last = (await crashRoute(post('/api/telemetry/crash', body(), { 'cf-connecting-ip': '203.0.113.9' }), {}, wait(), { identity })).status;
  assert.equal(last, 429);
});

test('captureServerError: an uncaught server exception is logged and sent to Sentry, and never throws', async t => {
  const lines = quiet(t);
  const fetchImpl = fetchDouble(), ctx = wait();
  const error = Object.assign(new TypeError('boom at https://digrabbithole.com/b/SHARETOKENVALUE?x=1'), { stack: 'TypeError: boom\n    at handler (worker.js:10:5)' });
  captureServerError({ SENTRY_DSN: DSN }, ctx, new Request(ORIGIN + '/api/learn/ask'), error, { fetchImpl });
  await ctx.done();
  const event = JSON.parse(fetchImpl.calls[0].init.body.split('\n')[2]);
  assert.deepEqual([event.level, event.tags.kind, event.tags.artifact, event.tags.route, event.exception.values[0].type], ['fatal', 'server', 'worker', '/api/learn/ask', 'TypeError']);
  assert.doesNotMatch(fetchImpl.calls[0].init.body, /SHARETOKENVALUE|x=1/);
  assert.ok(lines.some(line => JSON.parse(line).event === 'server_crash'));
  assert.doesNotThrow(() => captureServerError({}, undefined, new Request(ORIGIN + '/x'), undefined));
  assert.doesNotThrow(() => captureServerError({ SENTRY_DSN: DSN }, ctx, {}, 'a string'));
});

const cacheDouble = () => { const kept = new Set(); return { match: async request => (kept.has(request.url) ? new Response(null) : undefined), put: async request => { kept.add(request.url); }, kept }; };
const notify = (payload, env, deps) => crashNotify(post('/api/crash/notify', payload), env, USER, deps);
const ENV = { CRASH_NOTIFY_TO: 'hello@digrabbithole.com', TELEMETRY_ENVIRONMENT: 'production' };

test('POST /api/crash/notify: mailed to CRASH_NOTIFY_TO with what, where and who; nothing when the recipient is missing or invalid', async t => {
  quiet(t); resetCrashMailForTests();
  const sent = [];
  const sendEmail = async (...args) => { sent.push(args); return true; };
  for (const CRASH_NOTIFY_TO of [undefined, '', '  ', 'not an address', 'a@b.invalid']) {
    const none = await notify(body(), { ...ENV, CRASH_NOTIFY_TO }, { sendEmail, cache: cacheDouble() });
    assert.deepEqual([none.status, await none.json()], [200, { sent: false, reason: 'not_configured' }], String(CRASH_NOTIFY_TO));
  }
  assert.equal(sent.length, 0);
  assert.equal((await notify('not json', ENV, { sendEmail, cache: cacheDouble() })).status, 400);
  assert.equal((await notify({ kind: 'nope' }, ENV, { sendEmail, cache: cacheDouble() })).status, 400);
  const answer = await notify(body(), ENV, { sendEmail, cache: cacheDouble(), now: () => Date.UTC(2026, 10, 7, 12, 30) });
  assert.deepEqual([answer.status, await answer.json()], [200, { sent: true }]);
  const [[env, to, subject, text, options]] = sent;
  assert.equal(to, 'hello@digrabbithole.com');
  assert.equal(subject, `[Rabbit Hole CRASH] roadmap_canvas: TypeError ${body().message}`);
  assert.doesNotMatch(subject, /\n/);
  for (const row of ['What: TypeError: Cannot read properties of undefined', 'Where: roadmap_canvas (boundary) on /apps/:id', 'Component stack:', 'Who: u_123 <learner@example.test> workspace workspace-a', 'Build: 8deb778fa (production)', 'Browser: chrome desktop', 'Time: 2026-11-07T12:30:00.000Z', 'Fingerprint: ', 'Stack: TypeError']) assert.ok(text.includes(row), row);
  assert.match(options.idempotencyKey, /^crash-[0-9a-f]{16}-\d+$/);
  assert.equal(env.CRASH_NOTIFY_TO, ENV.CRASH_NOTIFY_TO);
  assert.doesNotMatch(text, /digrabbithole\.com\/static/, 'the mail carries scrubbed text only');
  assert.match(composeCrashMail({ ...(await parseCrash(body({ kind: 'uncaught', artifact: null }))) }, null).subject, /^\[Rabbit Hole CRASH\] uncaught: TypeError/);
});

test('POST /api/crash/notify: one mail per fingerprint per hour, a global cap per hour, and a failed send is answered 502 and tried again', async t => {
  quiet(t); resetCrashMailForTests();
  const sent = [];
  const sendEmail = async (...args) => { sent.push(args); return true; };
  const cache = cacheDouble(), at = Date.UTC(2026, 10, 7, 12, 0);
  assert.equal((await (await notify(body(), ENV, { sendEmail, cache, now: () => at })).json()).sent, true);
  assert.deepEqual(await (await notify(body({ message: 'same failure, other words' }), ENV, { sendEmail, cache, now: () => at + 1000 })).json(), { sent: false, reason: 'duplicate' });
  assert.equal(sent.length, 1, 'the repeat did not mail');
  assert.equal((await (await notify(body({ artifact: 'slot_card' }), ENV, { sendEmail, cache, now: () => at + 2000 })).json()).sent, true, 'another place is another mail');
  // The cap: 20 mails an hour in this isolate, then the next hour starts fresh.
  resetCrashMailForTests(); sent.length = 0;
  const fresh = cacheDouble(), results = [];
  for (let i = 0; i < 22; i++) results.push((await (await notify(body({ artifact: `card_${i}` }), ENV, { sendEmail, cache: fresh, now: () => at })).json()));
  assert.deepEqual([results.filter(r => r.sent).length, results.at(-1)], [20, { sent: false, reason: 'capped' }]);
  assert.equal((await (await notify(body({ artifact: 'card_next_hour' }), ENV, { sendEmail, cache: fresh, now: () => at + 3_600_000 })).json()).sent, true);
  // A failing mailer: 502 for a false and for a throw, no dedupe mark, so the next crash tries again.
  resetCrashMailForTests();
  const flaky = cacheDouble();
  assert.equal((await notify(body(), ENV, { sendEmail: async () => false, cache: flaky })).status, 502);
  assert.equal((await notify(body(), ENV, { sendEmail: async () => { throw new Error('resend down'); }, cache: flaky })).status, 502);
  assert.equal(flaky.kept.size, 0);
  assert.equal((await notify(body(), ENV, { sendEmail, cache: flaky })).status, 200);
  // Where the Cache API is missing or throws, the mail is still sent.
  resetCrashMailForTests();
  assert.equal((await notify(body(), ENV, { sendEmail, cache: undefined })).status, 200);
  assert.equal((await notify(body({ artifact: 'broken_cache' }), ENV, { sendEmail, cache: { match: async () => { throw new Error('x'); }, put: async () => { throw new Error('y'); } } })).status, 200);
});

test('wiring: the notify route sits behind the session, the app route is mounted, and only the recipient is a var (the DSN is a secret)', () => {
  const index = SOURCE('../src/index.js');
  const gate = index.indexOf('if (!user) return json({ error: \'run small login first\' }, 401);');
  const mount = index.indexOf('if (path === NOTIFY_PATH && req.method === \'POST\') return await crashNotify(req, env, user, { sendEmail });');
  assert.ok(gate > 0 && mount > gate, 'crash/notify is mounted after the session check');
  assert.ok(SOURCE('../../web/dev-worker.js').includes('if (path === CRASH_PATH) return crashRoute(req, env, ctx, { identity: devIdentity });'));
  assert.ok(SOURCE('../../web/app-worker.js').includes('captureServerError(env, ctx, req, error); throw error;'));
  const config = SOURCE('../wrangler.rabbit-hole-prod.jsonc');
  assert.match(config, /"CRASH_NOTIFY_TO": "hello@digrabbithole\.com"/);
  assert.doesNotMatch(config + SOURCE('../../web/wrangler.rabbit-hole-prod.jsonc'), /"SENTRY_DSN"\s*:/, 'the DSN is an owner-set secret, never a var');
});
