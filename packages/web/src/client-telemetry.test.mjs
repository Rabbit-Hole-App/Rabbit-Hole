// client-telemetry.js: fingerprints, dedup, rate limits, batching and the window and fetch hooks, against a fake window. Fixture
// evidence only: no browser, so real error events, sendBeacon and PerformanceObserver behavior are covered by CI's browser check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBatch } from '../../control-plane/src/telemetry-contract.js';
import { ENDPOINT, TRACE_HEADER, createReporter, errorFingerprint, fingerprintOf, installClientTelemetry, requestKind, resetClientTelemetryForTests, supportDiagnostics, topFrame, browserClass, reportClientError } from './client-telemetry.js';

const chromeStack = (file, line) => `TypeError: Cannot read properties of undefined (reading 'secret-name')\n    at renderCard (https://digrabbithole.com/assets/CanvasPage-AbC123xYz.js:${line}:17)\n    at Object.react_stack_bottom_frame (https://digrabbithole.com/assets/vendor-9f8e7d6c.js:1:2)`;
const error = (stack, name = 'TypeError') => Object.assign(new Error('Cannot read properties of undefined (reading \'secret-name\')'), { name, stack });

test('a fingerprint ignores the message, line numbers, the bundle hash and the origin, and tells different failures apart', () => {
  const a = errorFingerprint(error(chromeStack('a', 120))), b = errorFingerprint(error(chromeStack('a', 987).replace('AbC123xYz', 'ZZZ999qqq')));
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, b, 'same function across a rebuild and a moved line');
  assert.equal(a, errorFingerprint({ name: 'TypeError', stack: chromeStack('a', 1).replace('Cannot read', 'Different message') }));
  assert.notEqual(a, errorFingerprint(error(chromeStack('a', 1).replace('renderCard', 'drawEquation'))));
  assert.notEqual(a, errorFingerprint(error(chromeStack('a', 1), 'RangeError')));
  assert.equal(topFrame(chromeStack('a', 5)), 'at renderCard (CanvasPage.js)');
  assert.equal(topFrame('renderCard@https://x.test/assets/index-abcdef12.js?v=3:10:5\nnext@y'), 'renderCard@index.js');
  assert.match(errorFingerprint('a thrown string'), /^[0-9a-f]{16}$/, 'a non-error still fingerprints');
  assert.equal(errorFingerprint('one string'), errorFingerprint('another string'), 'and never from its text');
});

test('requests are classified: writes to saved things fail a save, reads a load, the rest are network', () => {
  assert.equal(requestKind('PUT', '/api/learn/boards/canvas-1a2b3c4d/main'), 'save_failed');
  assert.equal(requestKind('POST', '/api/canvases'), 'save_failed');
  assert.equal(requestKind('GET', '/api/learn/boards/canvas-1a2b3c4d/main'), 'load_failed');
  assert.equal(requestKind('GET', '/api/learn/files/file_1'), 'load_failed');
  assert.equal(requestKind('POST', '/api/learn/ask'), 'network');
  assert.equal(requestKind('GET', '/api/me'), 'network');
});

test('browser and device classes are coarse', () => {
  assert.deepEqual(browserClass('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'), { browser: 'chrome', device: 'desktop' });
  assert.deepEqual(browserClass('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), { browser: 'safari', device: 'mobile' });
  assert.deepEqual(browserClass('Mozilla/5.0 Firefox/125.0'), { browser: 'firefox', device: 'desktop' });
});

function reporterWith(options = {}) {
  let clock = 1_000_000;
  const batches = [], timers = [];
  const reporter = createReporter({ send: async (body, meta) => { batches.push({ events: JSON.parse(body).events, ...meta }); return options.status ?? 202; },
    now: () => clock, schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, route: () => '/apps/:id', env: { classes: { browser: 'chrome', device: 'desktop' }, online: () => true } });
  return { reporter, batches, timers, advance: ms => { clock += ms; } };
}
const fail = (fingerprint, kind = 'uncaught') => ({ kind, fingerprint, source: 'window', error_name: 'TypeError' });

test('the same failure inside the window is counted, not sent again, and the count rides on the next event', async () => {
  const { reporter, batches, advance } = reporterWith();
  assert.equal(reporter.report(fail('aaaaaaaaaaaaaaaa')), true);
  for (let i = 0; i < 5; i++) assert.equal(reporter.report(fail('aaaaaaaaaaaaaaaa')), false);
  await reporter.flush();
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].events.map(e => e.payload.count), [1]);
  advance(61_000);
  assert.equal(reporter.report(fail('aaaaaaaaaaaaaaaa')), true, 'a new window reports again');
  await reporter.flush();
  assert.deepEqual(batches[1].events.map(e => e.payload.count), [6], 'the five suppressed repeats and this one');
});

test('repeats that never get a new window are folded into one event when the page leaves', async () => {
  const { reporter, batches } = reporterWith();
  reporter.report(fail('bbbbbbbbbbbbbbbb'));
  await reporter.flush();
  reporter.report(fail('bbbbbbbbbbbbbbbb')); reporter.report(fail('bbbbbbbbbbbbbbbb'));
  await reporter.flush();
  assert.equal(batches.length, 1, 'inside the window the timer flush sends nothing new');
  await reporter.flush({ beacon: true });
  assert.deepEqual([batches[1].beacon, batches[1].events.map(e => e.payload.count)], [true, [2]]);
});

test('a page may send ten distinct failures at once, then is rate limited, and reports what it dropped', async () => {
  const { reporter, batches, advance } = reporterWith();
  const sentFlags = Array.from({ length: 14 }, (_, i) => reporter.report(fail(String(i).padStart(16, '0'))));
  assert.equal(sentFlags.filter(Boolean).length, 10);
  await reporter.flush();
  assert.equal(batches[0].events.length, 10);
  advance(60_000);
  reporter.report(fail('ffffffffffffffff'));
  await reporter.flush();
  assert.equal(batches[1].events[0].payload.dropped, 4, 'the incompleteness is measured on the next event');
});

test('a page is capped at 50 events in total', async () => {
  const { reporter, batches, advance } = reporterWith();
  for (let i = 0; i < 12; i++) { for (let n = 0; n < 5; n++) reporter.report(fail(`${i}${n}`.padStart(16, '0'))); await reporter.flush(); advance(60_000); }
  assert.equal(batches.reduce((sum, b) => sum + b.events.length, 0), 50);
  assert.ok(reporter.stats().dropped > 0);
});

test('a 429 pauses the page for a minute; a transport failure drops the batch without throwing', async () => {
  const limited = reporterWith({ status: 429 });
  limited.reporter.report(fail('cccccccccccccccc'));
  await limited.reporter.flush();
  limited.advance(1000);
  limited.reporter.report(fail('dddddddddddddddd'));
  await limited.reporter.flush();
  assert.equal(limited.batches.length, 1, 'quiet while paused');
  assert.equal(limited.reporter.stats().dropped, 2);
  const lost = createReporter({ send: async () => { throw new Error('offline'); }, route: () => '/', env: { classes: {} } });
  lost.report(fail('eeeeeeeeeeeeeeee'));
  await lost.flush();
  assert.equal(lost.stats().dropped, 1);
});

test('every event the reporter builds passes the server contract', async () => {
  const { reporter, batches } = reporterWith();
  reporter.report({ ...fail('1234567890abcdef', 'render_failed'), artifact: 'chart', status_code: 500, duration_ms: 12 }, '0f3a9c21d4e5b678');
  await reporter.flush();
  const checked = validateBatch(batches[0].events);
  assert.deepEqual([checked.ok, checked.events.length, checked.rejected], [true, 1, 0]);
  assert.equal(batches[0].events[0].trace_id, '0f3a9c21d4e5b678');
  assert.equal(batches[0].events[0].payload.online, true);
});

function fakeWindow({ fetchImpl, path = '/b/AbCdEfGhIjKlMnOpQrStUv', search = '?token=secret' } = {}) {
  const listeners = {}, sent = [];
  const target = {
    location: { pathname: path, search, href: `https://digrabbithole.com${path}${search}`, origin: 'https://digrabbithole.com' },
    navigator: { userAgent: 'Mozilla/5.0 Chrome/124.0 Safari/537.36', onLine: true, sendBeacon: (url, blob) => { sent.push({ url, beacon: true, blob }); return true; } },
    crypto: globalThis.crypto,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    fetch: fetchImpl || (async () => new Response('{}', { status: 200 })),
    document: { addEventListener() {}, visibilityState: 'visible' },
  };
  return { target, listeners, sent, fire: (type, event) => (listeners[type] || []).forEach(fn => fn(event)) };
}
const events = batchBodies => batchBodies.flatMap(body => JSON.parse(body).events);

test('window errors and unhandled rejections are reported with a route template and no message', async () => {
  resetClientTelemetryForTests();
  const bodies = [];
  const win = fakeWindow();
  const reporter = installClientTelemetry(win.target, { sender: async body => { bodies.push(body); return 202; } });
  win.fire('error', { error: error(chromeStack('a', 1)), message: 'leaky message' });
  win.fire('error', { message: 'Script error.' }); // cross-origin noise: no error object
  win.fire('unhandledrejection', { reason: error(chromeStack('b', 1).replace('renderCard', 'saveCanvas'), 'RangeError') });
  win.fire('unhandledrejection', { reason: 'a string rejection with private words' });
  await reporter.flush();
  const sent = events(bodies);
  assert.deepEqual(sent.map(e => e.payload.kind), ['uncaught', 'unhandled_rejection', 'unhandled_rejection']);
  assert.deepEqual(sent.map(e => e.payload.route), ['/b/:token', '/b/:token', '/b/:token']);
  assert.deepEqual(sent.map(e => e.payload.error_name), ['TypeError', 'RangeError', 'NonError']);
  const text = bodies.join('');
  for (const secret of ['leaky message', 'secret-name', 'private words', 'AbCdEfGhIjKlMnOpQrStUv', 'token=secret', 'digrabbithole.com']) assert.equal(text.includes(secret), false, secret);
});

test('fetch: same-origin API calls get a trace header; a 5xx or a thrown request is reported with that trace; 4xx, aborts and others are not', async () => {
  resetClientTelemetryForTests();
  const calls = [], bodies = [];
  const answers = { '/api/learn/boards/canvas-1a2b3c4d/main': 503, '/api/learn/ask': 429, '/api/learn/files/f1': 502 };
  const win = fakeWindow({ fetchImpl: async (input, init) => {
    calls.push({ url: String(input), headers: init?.headers && Object.fromEntries(new Headers(init.headers)) });
    const path = new URL(String(input), 'https://digrabbithole.com').pathname;
    if (path === '/api/boom') throw new TypeError('Failed to fetch');
    if (path === '/api/abort') throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return new Response('{}', { status: answers[path] || 200 });
  } });
  const reporter = installClientTelemetry(win.target, { sender: async body => { bodies.push(body); return 202; } });
  await win.target.fetch('/api/learn/boards/canvas-1a2b3c4d/main', { method: 'PUT', body: '{}', headers: { 'content-type': 'application/json' } });
  await win.target.fetch('/api/learn/ask', { method: 'POST' });
  await win.target.fetch('/api/learn/files/f1');
  await win.target.fetch('/static/app.js');
  await win.target.fetch('https://api.other.example/api/x');
  await assert.rejects(win.target.fetch('/api/boom'), /Failed to fetch/, 'the caller still sees the original error');
  await assert.rejects(win.target.fetch('/api/abort'), /aborted/);
  await win.target.fetch(ENDPOINT, { method: 'POST', body: '{}' });
  await reporter.flush();
  const sent = events(bodies);
  assert.deepEqual(sent.map(e => [e.payload.kind, e.payload.status_code ?? null, e.payload.error_name ?? null]), [['save_failed', 503, null], ['load_failed', 502, null], ['network', null, 'TypeError']]);
  assert.ok(sent.every(e => /^[0-9a-f]{16}$/.test(e.trace_id)), 'each carries the failing request trace id');
  const put = calls.find(c => c.url.includes('boards'));
  assert.equal(put.headers[TRACE_HEADER], sent[0].trace_id, 'the same id went to the server');
  assert.equal(put.headers['content-type'], 'application/json', 'caller headers survive');
  assert.equal(calls.find(c => c.url === '/static/app.js').headers, undefined, 'non-API requests are untouched');
  assert.equal(calls.find(c => c.url.startsWith('https://api.other')).headers, undefined);
  assert.equal(calls.find(c => c.url === ENDPOINT).headers, undefined, 'the telemetry post never traces or reports itself');
  assert.deepEqual(supportDiagnostics().traces.length, 3);
});

test('a Request object is passed through untouched, and installing twice wraps fetch once', async () => {
  resetClientTelemetryForTests();
  const seen = [];
  const win = fakeWindow({ fetchImpl: async input => { seen.push(input); return new Response('{}', { status: 200 }); } });
  const first = installClientTelemetry(win.target, { sender: async () => 202 });
  assert.equal(installClientTelemetry(win.target), first);
  const request = new Request('https://digrabbithole.com/api/learn/ask', { method: 'POST', body: '{}' });
  await win.target.fetch(request);
  assert.equal(seen[0], request);
});

test('leaving the page sends what is queued by beacon; support diagnostics hold the latest fingerprints', async () => {
  resetClientTelemetryForTests();
  const win = fakeWindow();
  const reporter = installClientTelemetry(win.target); // default sender
  win.fire('error', { error: error(chromeStack('a', 1)) });
  win.fire('pagehide', {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(win.sent.length, 1);
  assert.equal(win.sent[0].url, ENDPOINT);
  assert.equal(supportDiagnostics().fingerprints.length, 1);
  assert.equal(reportClientError('render_failed', error(chromeStack('c', 1)), { artifact: 'chart' }), true);
  assert.equal(reportClientError('render_failed', error(chromeStack('c', 1)), { artifact: 'two words' }), false, 'repeat inside the window');
  assert.equal(reporter.stats().queued, 1);
});

test('fingerprintOf is stable and only hex', () => {
  assert.equal(fingerprintOf('save_failed', 'PUT', '/api/learn/boards/:id', 503), fingerprintOf('save_failed', 'PUT', '/api/learn/boards/:id', 503));
  assert.match(fingerprintOf('x'), /^[0-9a-f]{16}$/);
});

test('the scheduled flush sends the queue by itself after FLUSH_MS', async () => {
  const { reporter, batches, timers } = reporterWith();
  reporter.report(fail('9999999999999999'));
  assert.deepEqual(timers.map(t => t.ms), [10_000]);
  timers[0].fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(batches.length, 1);
});
