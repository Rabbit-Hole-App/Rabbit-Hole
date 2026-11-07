// Centralized browser errors (telemetry brief Task 11; docs/features/telemetry.md "Browser errors"). Uncaught errors, unhandled
// rejections, React boundaries, failed saves and loads, broken artifact renders, failed requests and long tasks become
// client.error events (control-plane/src/telemetry-events/client.js), validated against the same contract the server uses and
// posted in small batches to POST /api/telemetry/client. A plain module with its target, clock and transport injected, so node
// tests drive it without a browser.
//
// What leaves the page: the kind, a fingerprint, a route template, the error's constructor name, a browser and device class and
// counts. Never a message, a stack, a URL, a query string, a share token, an id from the path or any page content.
// Delivery is best effort and bounded: repeats of one failure fold into a count, at most RATE events a minute and PAGE_MAX a page
// are sent, and what the page had to drop is reported on the next event (payload.dropped), so the incompleteness is measured.
import { makeEvent, routeTemplate, validateEvent, LIMITS } from '../../control-plane/src/telemetry-contract.js';
import { tokenBucket } from '../../control-plane/src/telemetry-limit.js';

export const ENDPOINT = '/api/telemetry/client';
export const TRACE_HEADER = 'x-rh-trace';
export const DEDUP_MS = 60_000;          // the same failure again inside this window is counted, not sent
export const FLUSH_MS = 10_000;          // a queued event waits at most this long
export const PAGE_MAX = 50;              // events one page load may send
export const LONG_TASK_MS = 500;         // shorter tasks are not reported
export const PAUSE_MS = 60_000;          // after a 429 the page stays quiet this long

// 32-bit FNV-1a, twice with different seeds: 16 hex characters. A fingerprint, not a security hash.
export function hash16(text) {
  let a = 0x811c9dc5, b = 0x1b873593;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
    b ^= b >>> 13;
  }
  return a.toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

// The first stack frame with its URL, line, column, query and the bundler's content hash removed, so the same failure has the
// same fingerprint across reloads and releases that do not touch the function.
export function topFrame(stack) {
  const lines = String(stack || '').split('\n').map(line => line.trim());
  const frame = lines.find(line => /^at\s/.test(line) || line.includes('@')) || '';
  return frame.replace(/\bhttps?:\/\/[^\s)?#]*\/([^\s/)?#:]+)(?:[?#][^\s):]*)?/g, '$1').replace(/\bhttps?:\/\/[^\s/)]+/g, '').replace(/:\d+(?::\d+)?/g, '')
    .replace(/-[A-Za-z0-9_]{6,}(\.m?js)/g, '$1').slice(0, 200);
}
export const fingerprintOf = (...parts) => hash16(parts.map(part => String(part ?? '')).join('|'));
// The constructor name when it is a plain identifier, else a fixed word: a thrown string or object has none worth sending.
export const errorName = error => (typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name) ? error.name : 'NonError');
export const errorFingerprint = error => fingerprintOf(errorName(error), topFrame(error?.stack));

// Which kind a failed request is. A write to a saved thing is a failed save, a read of one a failed load, anything else a
// network failure; 4xx answers are the product speaking (sign-in, validation, refusals) and are never reported.
const SAVED = /^\/api\/(learn\/(boards|c|files|progress|coaching)|canvases|apps|library|repositories)(\/|$)/;
export function requestKind(method, pathname) {
  if (!SAVED.test(pathname)) return 'network';
  return /^(GET|HEAD)$/i.test(method || 'GET') ? 'load_failed' : 'save_failed';
}

export function browserClass(userAgent = '') {
  const browser = /Edg\//.test(userAgent) ? 'edge' : /Firefox\//.test(userAgent) ? 'firefox' : /Chrome\/|CriOS\//.test(userAgent) ? 'chrome' : /Safari\//.test(userAgent) ? 'safari' : 'other';
  const device = /iPad|Tablet/.test(userAgent) ? 'tablet' : /Mobi|Android|iPhone/.test(userAgent) ? 'mobile' : 'desktop';
  return { browser, device };
}

const RING = 5;
export function createReporter({ send, now = () => Date.now(), schedule = (fn, ms) => setTimeout(fn, ms), route = () => '/', env = {}, release = null } = {}) {
  const seen = new Map();                 // key -> { at, suppressed }
  const limiter = tokenBucket({ capacity: 10, refillPerSec: 1 / 6, now });
  const queue = [], recent = { fingerprints: [], traces: [] };
  let sent = 0, dropped = 0, timer = null, pausedUntil = 0;
  const remember = (list, value) => { if (value && !list.includes(value)) { list.push(value); if (list.length > RING) list.shift(); } };

  function enqueue(payload, traceId, count) {
    if (sent + queue.length >= PAGE_MAX || queue.length >= LIMITS.batchEvents) { dropped++; return; }
    const event = makeEvent('client.error', { ...(traceId ? { trace_id: traceId } : {}), payload: { ...payload, count, ...(dropped ? { dropped } : {}), ...(typeof env.online?.() === 'boolean' ? { online: env.online() } : {}) } },
      { environment: 'production', service: 'web', release });
    const checked = validateEvent(event); // the server's contract, in the browser; the server validates again
    if (!checked.ok) { dropped++; return; }
    queue.push(checked.event);
    remember(recent.fingerprints, payload.fingerprint);
    remember(recent.traces, traceId);
    if (!timer) timer = schedule(() => { timer = null; api.flush(); }, FLUSH_MS);
  }

  const api = {
    // One failure. fields: { kind, fingerprint, source?, error_name?, artifact?, status_code?, duration_ms? }, traceId optional.
    report(fields, traceId = null) {
      const at = now(), r = route(), key = `${fields.kind}|${fields.fingerprint}|${r}`;
      const entry = seen.get(key);
      if (entry && at - entry.at < DEDUP_MS) { entry.suppressed++; return false; }
      if (!limiter.take('page').ok) { dropped++; return false; }
      const count = 1 + (entry?.suppressed || 0);
      seen.set(key, { at, suppressed: 0 });
      if (seen.size > 200) seen.delete(seen.keys().next().value);
      enqueue({ ...fields, route: r, ...env.classes }, traceId, count);
      return true;
    },
    // Sends what is queued, plus one folded event for every failure that repeated since its last report.
    async flush({ beacon = false } = {}) {
      if (timer) { timer = null; }
      // Repeats are folded into one event when their window has ended, or when the page is leaving.
      for (const [key, entry] of seen) {
        if (!entry.suppressed || (!beacon && now() - entry.at < DEDUP_MS)) continue;
        const [kind, fingerprint, r] = key.split('|');
        enqueue({ kind, fingerprint, route: r, ...env.classes }, null, entry.suppressed);
        entry.suppressed = 0;
      }
      if (now() < pausedUntil) { dropped += queue.length; queue.length = 0; return; }
      if (!queue.length) return;
      const events = queue.splice(0, LIMITS.batchEvents);
      sent += events.length;
      let body = JSON.stringify({ events });
      while (body.length > LIMITS.batchBytes && events.length > 1) { dropped++; events.pop(); body = JSON.stringify({ events }); }
      try {
        const status = await send(body, { beacon });
        if (status === 429) { pausedUntil = now() + PAUSE_MS; dropped += events.length; }
        else if (!(status >= 200 && status < 300)) dropped += events.length;
      } catch { dropped += events.length; }
    },
    // One event of another browser-ingest namespace (weekly_top.*): checked against the contract here, queued with the errors under the
    // same page cap, batch and route (so a worker with no telemetry binding answers 204 and keeps nothing). Never folded: the server's
    // 10-minute id dedup absorbs an identical repeat. Returns whether it was queued.
    emit(name, payload) {
      const checked = validateEvent(makeEvent(name, { payload }, { environment: 'production', service: 'web', release }));
      if (!checked.ok || sent + queue.length >= PAGE_MAX || queue.length >= LIMITS.batchEvents) { dropped++; return false; }
      queue.push(checked.event);
      if (!timer) timer = schedule(() => { timer = null; api.flush(); }, FLUSH_MS);
      return true;
    },
    // What a support report carries: the page's latest fingerprints and failed-request trace ids.
    diagnostics: () => ({ fingerprints: [...recent.fingerprints], traces: [...recent.traces] }),
    stats: () => ({ sent, queued: queue.length, dropped }),
  };
  return api;
}

// A fresh trace id for one request: 16 hex characters from the page's random source.
export function newTraceId(random = globalThis.crypto) {
  const bytes = new Uint8Array(8);
  random.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

let installed = null;
// Wires one reporter into a browser window (or a test double). Idempotent. Returns the reporter.
export function installClientTelemetry(target = globalThis, { release = null, sender = null } = {}) {
  if (installed) return installed;
  const original = target.fetch?.bind(target);
  const location = () => target.location || { pathname: '/', origin: 'http://localhost' };
  const env = { online: () => target.navigator?.onLine, classes: browserClass(target.navigator?.userAgent) };
  const post = sender || (async (body, { beacon }) => {
    if (beacon && target.navigator?.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) return 202;
    return (await original(ENDPOINT, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true, credentials: 'same-origin' })).status;
  });
  const reporter = createReporter({ send: post, route: () => routeTemplate(location().pathname), env, release });
  installed = reporter;

  target.addEventListener?.('error', event => {
    // A resource that failed to load fires on its element and has no error; a script error without one is cross-origin noise.
    if (!event?.error) return;
    reporter.report({ kind: 'uncaught', fingerprint: errorFingerprint(event.error), source: 'window', error_name: errorName(event.error) });
  });
  target.addEventListener?.('unhandledrejection', event => {
    reporter.report({ kind: 'unhandled_rejection', fingerprint: errorFingerprint(event?.reason), source: 'window', error_name: errorName(event?.reason) });
  });
  target.addEventListener?.('pagehide', () => { reporter.flush({ beacon: true }); });
  target.document?.addEventListener?.('visibilitychange', () => { if (target.document.visibilityState === 'hidden') reporter.flush({ beacon: true }); });

  if (original && !original.clientTelemetryHook) {
    const hooked = async (input, init) => {
      let url = null;
      try { url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input?.url, location().href || location().origin); } catch { /* not a URL: pass through */ }
      const ours = url && url.origin === location().origin && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/telemetry/');
      const method = (init?.method || input?.method || 'GET').toUpperCase();
      let traceId = null, args = [input, init];
      if (ours && (typeof input === 'string' || input instanceof URL)) {
        traceId = newTraceId(target.crypto || globalThis.crypto);
        const headers = new Headers(init?.headers);
        headers.set(TRACE_HEADER, traceId);
        args = [input, { ...init, headers }];
      }
      try {
        const response = await original(...args);
        if (ours && response.status >= 500) {
          const kind = requestKind(method, url.pathname);
          reporter.report({ kind, fingerprint: fingerprintOf(kind, method, routeTemplate(url.pathname), response.status), source: 'fetch', status_code: response.status }, traceId);
        }
        return response;
      } catch (error) {
        if (ours && error?.name !== 'AbortError') {
          const kind = requestKind(method, url.pathname);
          reporter.report({ kind, fingerprint: fingerprintOf(kind, method, routeTemplate(url.pathname), 'thrown'), source: 'fetch', error_name: errorName(error) }, traceId);
        }
        throw error;
      }
    };
    hooked.clientTelemetryHook = true;
    target.fetch = hooked;
  }

  // Long tasks and slow interactions, where the browser reports them (Chromium). Unsupported types are skipped.
  const Observer = target.PerformanceObserver;
  const observe = (type, options, handle) => {
    if (!Observer?.supportedEntryTypes?.includes(type)) return;
    try { new Observer(list => { for (const entry of list.getEntries()) handle(entry); }).observe({ type, buffered: false, ...options }); } catch { /* unsupported options */ }
  };
  observe('longtask', {}, entry => { if (entry.duration >= LONG_TASK_MS) reporter.report({ kind: 'long_task', fingerprint: fingerprintOf('long_task', routeTemplate(location().pathname)), source: 'observer', duration_ms: Math.round(entry.duration) }); });
  observe('event', { durationThreshold: LONG_TASK_MS }, entry => {
    const type = /^[a-z]{2,20}$/.test(entry.name) ? entry.name : 'event';
    reporter.report({ kind: 'slow_interaction', fingerprint: fingerprintOf('slow_interaction', type, routeTemplate(location().pathname)), source: 'observer', duration_ms: Math.round(entry.duration) });
  });
  return reporter;
}

// For React boundaries and failed artifact renders: report from a component without importing the reporter's internals.
export function reportClientError(kind, error, { artifact = null, source = 'react' } = {}) {
  if (!installed) return false;
  return installed.report({ kind, fingerprint: errorFingerprint(error), source, error_name: errorName(error), ...(artifact && /^[a-z0-9][a-z0-9_.:-]{0,63}$/i.test(artifact) ? { artifact } : {}) });
}
// For a feature's own browser events (weekly_top.*): false, and nothing kept, when telemetry is not installed on this page.
export const reportClientEvent = (name, payload) => !!installed && installed.emit(name, payload);
export const supportDiagnostics = () => installed?.diagnostics() || { fingerprints: [], traces: [] };
export const resetClientTelemetryForTests = () => { installed = null; };
