// The owner's crash alerts, browser side (client-crash.js): what a crash report carries, what is scrubbed out of it, how often it is sent, and where
// it is hooked in. Node only, no browser: the transport and the window are doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CRASH_ENDPOINTS, CRASH_PAGE_MAX, createCrashReporter, reportCrash, resetCrashReporterForTests, scrub } from './client-crash.js';
import { errorFingerprint, errorName, installClientTelemetry, reportClientError, resetClientTelemetryForTests } from './client-telemetry.js';

const settle = () => new Promise(resolve => setTimeout(resolve, 5));
const source = name => readFileSync(new URL('./' + name, import.meta.url), 'utf8');
const identify = error => ({ name: errorName(error), fingerprint: errorFingerprint(error) });
const throwing = (message = 'Cannot read properties of undefined (reading \'left\')') => { try { null.left; } catch (error) { error.message = message; return error; } };
function rig(over = {}) {
  const sent = [];
  const reporter = createCrashReporter({ send: (endpoint, body) => { sent.push([endpoint, JSON.parse(body)]); }, identify, route: () => '/apps/:id', release: 'abc1234', classes: { browser: 'chrome', device: 'desktop' }, ...over });
  return { reporter, sent };
}

test('a crash report is the contract body, sent to both endpoints', async () => {
  const { reporter, sent } = rig();
  const error = throwing();
  assert.equal(reporter.report(error, { kind: 'boundary', artifact: 'roadmap_canvas', componentStack: '\n    at nu (https://digrabbithole.com/static/CanvasPage-DJZ8n_fa.js:12:28136)' }), true);
  await settle();
  assert.deepEqual(sent.map(([endpoint]) => endpoint), CRASH_ENDPOINTS);
  const [, body] = sent[0];
  assert.deepEqual(Object.keys(body).sort(), ['artifact', 'browser', 'component_stack', 'fingerprint', 'kind', 'message', 'name', 'online', 'release', 'route', 'stack', 'v']);
  assert.deepEqual([body.v, body.kind, body.artifact, body.name, body.route, body.release, body.browser, body.online], [1, 'boundary', 'roadmap_canvas', 'TypeError', '/apps/:id', 'abc1234', { browser: 'chrome', device: 'desktop' }, true]);
  assert.match(body.fingerprint, /^[0-9a-f]{16}$/);
  assert.ok(body.message.includes('reading'), 'the words are sent');
  assert.ok(body.stack.includes('at ') && body.component_stack.includes('CanvasPage-DJZ8n_fa.js:12:28136'), 'stack frames keep file and line:column');
  assert.deepEqual(sent[1][1], body, 'the same body to both');
});

test('page content is scrubbed out of the words; code locations stay; every field is bounded', () => {
  assert.equal(scrub('failed at https://digrabbithole.com/b/AbCdEf123?token=secret#frag now', 500), 'failed at https://digrabbithole.com/b/[token] now');
  assert.equal(scrub('at f (https://digrabbithole.com/static/app-DfP9g6RO.js:116:30207)', 500), 'at f (https://digrabbithole.com/static/app-DfP9g6RO.js:116:30207)');
  assert.equal(scrub('user yudhisteer.chin@gmail.com sent it', 500), 'user [email] sent it');
  assert.equal(scrub('key 0123456789abcdef0123456789abcdef and ' + 'A'.repeat(40), 500), 'key [token] and [token]');
  assert.equal(scrub(undefined, 10), '');
  assert.equal(scrub('ab '.repeat(2000), 300).length, 300);
  const { reporter, sent } = rig();
  reporter.report(Object.assign(new Error('m '.repeat(450)), { stack: 's '.repeat(4500) }), { kind: 'uncaught', artifact: 'bad artifact!', componentStack: 'c '.repeat(2500) });
  return settle().then(() => {
    const body = sent[0][1];
    assert.deepEqual([body.message.length, body.stack.length, body.component_stack.length, body.artifact], [300, 2000, 1000, null]);
  });
});

test('one report per failure per page, at most five a page, and only crash kinds', async () => {
  const { reporter, sent } = rig();
  const error = throwing();
  assert.equal(reporter.report(error, { kind: 'boundary' }), true);
  assert.equal(reporter.report(error, { kind: 'boundary' }), false, 'the same failure again is not sent');
  assert.equal(reporter.report(throwing(), { kind: 'unhandled_rejection' }), false, 'a rejection is not a crash');
  assert.equal(reporter.report(throwing(), { kind: 'long_task' }), false);
  for (let i = 0; i < 10; i++) reporter.report(Object.assign(new Error('x' + i), { name: 'E' + i, stack: 'Error\n    at f' + i + ' (a.js:1:1)' }), { kind: 'render_failed' });
  await settle();
  assert.equal(sent.length / CRASH_ENDPOINTS.length, CRASH_PAGE_MAX);
});

test('a failing send never throws, in the render path or after it', async () => {
  for (const send of [() => { throw new Error('sync'); }, async () => { throw new Error('async'); }, () => Promise.reject(new Error('rejected'))]) {
    const { reporter } = rig({ send });
    assert.doesNotThrow(() => reporter.report(throwing(), { kind: 'boundary' }));
    await settle();
  }
  assert.equal(createCrashReporter({ send() {}, identify() { throw new Error('bad'); } }).report(throwing(), { kind: 'boundary' }), false, 'even a broken identify is swallowed');
});

test('installed with the client telemetry: boundaries, render failures and window errors are crashes; rejections are not; nothing before the install', async () => {
  resetClientTelemetryForTests(); resetCrashReporterForTests();
  assert.equal(reportCrash(throwing(), { kind: 'boundary' }), false, 'a no-op until installed');
  assert.equal(reportClientError('boundary', throwing()), false);
  const calls = [], listeners = {};
  const target = {
    location: { pathname: '/apps/canvas-0a1b2c3d', search: '', href: 'https://digrabbithole.com/apps/canvas-0a1b2c3d', origin: 'https://digrabbithole.com' },
    navigator: { userAgent: 'Mozilla/5.0 Chrome/124.0 Safari/537.36', onLine: true }, crypto: globalThis.crypto, document: { addEventListener() {}, visibilityState: 'visible' },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    fetch: async (url, init) => { calls.push([url, init]); return new Response('{}', { status: 200 }); },
  };
  installClientTelemetry(target, { release: 'abc1234', sender: async () => 202 });
  const crashes = () => calls.filter(([url]) => CRASH_ENDPOINTS.includes(url));
  reportClientError('boundary', throwing('one'), { componentStack: 'at A' });
  reportClientError('render_failed', Object.assign(throwing('two'), { name: 'RangeError' }), { artifact: 'slot_card' });
  await settle();
  assert.deepEqual(crashes().map(([url]) => url), [...CRASH_ENDPOINTS, ...CRASH_ENDPOINTS]);
  const first = JSON.parse(crashes()[0][1].body);
  assert.deepEqual([first.kind, first.component_stack, first.route, first.release], ['boundary', 'at A', '/apps/:id', 'abc1234']);
  assert.deepEqual([crashes()[0][1].keepalive, crashes()[0][1].credentials, crashes()[0][1].method], [true, 'same-origin', 'POST']);
  for (const fn of listeners.error) fn({ error: Object.assign(throwing('three'), { name: 'SyntaxError' }) });
  for (const fn of listeners.unhandledrejection) fn({ reason: Object.assign(throwing('four'), { name: 'AbortError' }) });
  await settle();
  const kinds = crashes().filter(([url]) => url === CRASH_ENDPOINTS[0]).map(([, init]) => JSON.parse(init.body).kind);
  assert.deepEqual(kinds, ['boundary', 'render_failed', 'uncaught'], 'the rejection is not reported as a crash');
  resetClientTelemetryForTests(); resetCrashReporterForTests();
});

test('the page root and every boundary hand the component stack to the crash report', () => {
  assert.match(source('main.jsx'), /reportClientError\('boundary', error, \{ componentStack: info\?\.componentStack \}\)/);
  for (const file of ['SurfaceBoundary.jsx', 'ChatMessages.jsx', 'GraphCard.jsx']) {
    assert.match(source(file), /componentDidCatch\(error, info\)/, file);
    assert.match(source(file), /componentStack: info\?\.componentStack/, file);
  }
  assert.match(source('client-telemetry.js'), /if \(kind === 'boundary' \|\| kind === 'render_failed'\) reportCrash\(error, \{ kind, artifact, componentStack \}\);/);
});
