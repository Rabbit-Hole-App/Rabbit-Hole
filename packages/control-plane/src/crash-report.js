// Crash alerts (docs/features/telemetry.md "Crash alerts"). A page that crashes sends one report to two endpoints:
//   POST /api/telemetry/crash  (app Worker, crashRoute): anonymous allowed; logged, and sent to Sentry when SENTRY_DSN is a secret there.
//   POST /api/crash/notify     (control plane, crashNotify): session only; mailed to CRASH_NOTIFY_TO (the only Worker with RESEND_API_KEY).
// Unlike client.error events (telemetry-client-route.js) a crash report carries the error message, a stack and the signed-in account,
// so the owner can see what happened, to whom and where. Every field is bounded and scrubbed again here: the browser is untrusted.
import { telemetryEnvironment } from './telemetry-contract.js';
import { tokenBucket } from './telemetry-limit.js';
import { deliverable } from './feedback-mail.js';

export const CRASH_PATH = '/api/telemetry/crash';
export const NOTIFY_PATH = '/api/crash/notify';
const KINDS = ['boundary', 'render_failed', 'uncaught', 'server'];
const ARTIFACT = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i;
const BODY_MAX = 16_000;
const HOUR_MS = 3_600_000;
const MAIL_CAP = 20;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Nothing that identifies a person or grants access survives: URLs keep only their path (a stack frame's file and line), a share
// link's token, an email address and any long token-like run are replaced.
export const scrub = value => String(value ?? '')
  .replace(/\bhttps?:\/\/[^\s/)]+(\/[^\s)?#]*)?(?:[?#][^\s)]*)?/g, (match, path) => path || '[url]')
  .replace(/(\/b\/)[^/?#\s)]+/g, '$1[token]')
  .replace(/[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/g, '[email]')
  .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]');
// Control characters out (a newline is kept in a stack, never in a one-line field).
const clean = (value, max, multiline = false) => scrub(value).replace(multiline ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').slice(0, max).trim();
const fnv = text => { let h = 0x811c9dc5; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0; return h.toString(16).padStart(8, '0'); }; // 8 hex: a server fingerprint is sync
const hex = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');

// The first stack frame with its line, column and the bundler's content hash removed, so one failure is one fingerprint across reloads.
export const topFrame = stack => (String(stack || '').split('\n').map(line => line.trim()).find(line => /^at\s/.test(line) || line.includes('@')) || '')
  .replace(/:\d+(?::\d+)?/g, '').replace(/-[A-Za-z0-9_]{6,}(\.m?js)/g, '$1').slice(0, 200);

// -> the bounded report, or null when the body is not a crash report. Unknown keys are dropped.
export async function parseCrash(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !KINDS.includes(body.kind)) return null;
  const word = (value, fallback) => (typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(value) ? value : fallback);
  const report = {
    kind: body.kind,
    artifact: typeof body.artifact === 'string' && ARTIFACT.test(body.artifact) ? body.artifact : null,
    name: word(body.name, 'NonError'),
    message: clean(body.message, 300),
    stack: clean(body.stack, 2000, true),
    component_stack: clean(body.component_stack, 1000, true),
    route: clean(body.route, 200),
    release: typeof body.release === 'string' && /^[A-Za-z0-9._-]{1,40}$/.test(body.release) ? body.release : null,
    browser: { browser: word(body.browser?.browser, 'other').toLowerCase(), device: word(body.browser?.device, 'desktop').toLowerCase() },
    online: typeof body.online === 'boolean' ? body.online : null,
  };
  // The server's own fingerprint (the browser's is not trusted for dedupe): what failed and where, not when.
  report.fingerprint = (await hex(`${report.name}|${report.artifact}|${report.kind}|${topFrame(report.stack)}`)).slice(0, 16);
  return report;
}

export const uaClass = (ua = '') => ({
  browser: /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox' : /Chrome\/|CriOS\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other',
  device: /iPad|Tablet/.test(ua) ? 'tablet' : /Mobi|Android|iPhone/.test(ua) ? 'mobile' : 'desktop',
});

// One structured line for Workers Logs: what, where, who. Never a secret.
const logLine = (event, report, facts) => { try { console.log(JSON.stringify({ event, ...report, ...facts })); } catch { /* never worth a failed request */ } };

// ---- Sentry (no SDK: one envelope POST) ----
// DSN https://<key>@<host>/<project> -> { url, key } or null.
export function parseDsn(dsn) {
  const match = /^https:\/\/([^@/:\s]+)@([^/\s]+)\/(?:(.*)\/)?(\d+)$/.exec(String(dsn || '').trim());
  return match ? { url: `https://${match[2]}/${match[3] ? `${match[3]}/` : ''}api/${match[4]}/envelope/`, key: match[1], dsn: String(dsn).trim() } : null;
}
// "at fn (file:1:2)", "at file:1:2" and "fn@file:1:2" -> Sentry frames, oldest first.
export function framesOf(stack) {
  return String(stack || '').split('\n').map(line => line.trim()).map(line => /^at\s+(?:(.*?)\s+\()?(.*?):(\d+):(\d+)\)?$/.exec(line) || /^(.*?)@(.*?):(\d+):(\d+)$/.exec(line))
    .filter(Boolean).map(([, fn, file, line, col]) => ({ function: fn || '?', filename: file, lineno: Number(line), colno: Number(col) })).reverse();
}
export function sentryEvent(report, { environment, userId, time = Date.now(), eventId = crypto.randomUUID().replace(/-/g, '') }) {
  return {
    event_id: eventId, timestamp: time / 1000, platform: 'javascript', level: report.kind === 'boundary' || report.kind === 'server' ? 'fatal' : 'error', logger: 'crash-report',
    environment, ...(report.release ? { release: report.release } : {}), fingerprint: [report.fingerprint],
    exception: { values: [{ type: report.name, value: report.message, stacktrace: { frames: framesOf(report.stack) } }] },
    tags: { artifact: report.artifact || 'none', kind: report.kind, route: report.route || 'unknown', fingerprint: report.fingerprint, browser: report.browser?.browser || 'none', device: report.browser?.device || 'none' },
    ...(userId ? { user: { id: userId } } : {}), ...(report.component_stack ? { extra: { component_stack: report.component_stack } } : {}),
  };
}
// Never throws and never waits on the caller's behalf: resolves false with no DSN, a bad DSN or a failed POST.
export async function sendToSentry(env, report, facts = {}, { fetchImpl = globalThis.fetch } = {}) {
  const dsn = parseDsn(env?.SENTRY_DSN);
  if (!dsn) return false;
  try {
    const event = sentryEvent(report, { environment: telemetryEnvironment(env) || 'unknown', userId: facts.account || null, time: facts.at });
    const body = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date(event.timestamp * 1000).toISOString(), dsn: dsn.dsn })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
    const response = await fetchImpl(dsn.url, { method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=rabbit-hole-crash/1` }, body });
    return !!response?.ok;
  } catch { return false; }
}

// ---- POST /api/telemetry/crash (app Worker) ----
const limiter = tokenBucket({ capacity: 10, refillPerSec: 1 / 6 }); // a crash loop sends a handful, never a stream
// identity(req, env) -> { userId } | Response | null: the dev worker's devIdentity; any failure is an anonymous caller.
export async function crashRoute(req, env, ctx, { identity, now = Date.now, limit = limiter, fetchImpl } = {}) {
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (env.TELEMETRY_CLIENT_DISABLED === 'true') return new Response(null, { status: 204 });
  const site = req.headers.get('sec-fetch-site');
  if ((site && !['same-origin', 'same-site', 'none'].includes(site)) || (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin)) return json({ error: 'Invalid origin' }, 403);
  const length = Number(req.headers.get('content-length'));
  if (Number.isFinite(length) && length > BODY_MAX) return json({ error: 'Too large' }, 413);
  const text = await req.text();
  if (text.length > BODY_MAX) return json({ error: 'Too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400); }
  let account = null;
  try { const who = await identity?.(req, env); if (who && !(who instanceof Response)) account = who.userId || null; } catch { /* anonymous */ }
  const taken = limit.take(account ? `u:${account}` : `a:${req.headers.get('cf-connecting-ip') || 'unknown'}`);
  if (!taken.ok) return json({ error: 'Slow down' }, 429);
  const report = await parseCrash(body);
  if (!report) return json({ error: 'Invalid crash report' }, 400);
  const facts = { account, at: now(), environment: telemetryEnvironment(env) || 'unknown', ua: uaClass(req.headers.get('user-agent') || '') };
  logLine('client_crash', report, facts);
  const sent = sendToSentry(env, report, facts, { fetchImpl });
  if (ctx?.waitUntil) ctx.waitUntil(sent);
  return new Response(null, { status: 204 });
}

// An uncaught server exception (app-worker.js): logged and sent to Sentry, no email (there is no session to mail through).
export function captureServerError(env, ctx, req, error, { fetchImpl } = {}) {
  try {
    const report = { kind: 'server', artifact: 'worker', name: /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error?.name) ? error.name : 'NonError', message: clean(error?.message, 300), stack: clean(error?.stack, 2000, true),
      component_stack: '', route: clean(new URL(req.url).pathname, 200), release: null, browser: null, online: null };
    report.fingerprint = fnv(`${report.name}|${topFrame(report.stack)}`);
    const facts = { account: null, at: Date.now(), environment: telemetryEnvironment(env) || 'unknown' };
    logLine('server_crash', report, facts);
    const sent = sendToSentry(env, report, facts, { fetchImpl });
    if (ctx?.waitUntil) ctx.waitUntil(sent);
  } catch { /* the original error is what the caller rethrows */ }
}

// ---- POST /api/crash/notify (control plane) ----
const oneLine = (value, max) => clean(value, max);
export function composeCrashMail(report, user, { environment = 'unknown', at = Date.now() } = {}) {
  const rows = [
    ['What', `${report.name}: ${report.message || 'no message'}`],
    ['Where', `${report.artifact || 'page'} (${report.kind}) on ${report.route || 'unknown route'}`],
    ['Component stack', report.component_stack || 'none'],
    ['Who', `${user?.uid || 'unknown'} <${user?.email || 'unknown'}> workspace ${user?.org || 'unknown'}`],
    ['Build', `${report.release || 'unknown'} (${environment})`],
    ['Browser', `${report.browser?.browser || 'unknown'} ${report.browser?.device || ''}${report.online === false ? ', offline' : ''}`.trim()],
    ['Time', new Date(at).toISOString()], ['Fingerprint', report.fingerprint], ['Stack', report.stack || 'none'],
  ];
  return { subject: `[Rabbit Hole CRASH] ${report.artifact || report.kind}: ${report.name} ${oneLine(report.message, 60)}`.trim(), text: rows.map(([label, value]) => `${label}: ${value}`).join('\n') };
}

// One mail per fingerprint per hour (Cache API; where it is missing the mail is sent) and MAIL_CAP mails per hour per isolate.
let mailWindow = { hour: 0, sent: 0 };
export async function crashNotify(req, env, user, { sendEmail, cache = globalThis.caches?.default, now = Date.now } = {}) {
  if (!deliverable(env.CRASH_NOTIFY_TO)) return json({ sent: false, reason: 'not_configured' });
  const text = await req.text();
  if (text.length > BODY_MAX) return json({ error: 'Too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const report = await parseCrash(body);
  if (!report) return json({ error: 'Invalid crash report' }, 400);
  const at = now(), hour = Math.floor(at / HOUR_MS), environment = telemetryEnvironment(env) || 'unknown';
  logLine('client_crash', report, { account: user?.uid ?? null, at, environment, via: 'notify' });
  const mark = new Request(`https://crash-dedupe.invalid/${report.fingerprint}`);
  try { if (cache && await cache.match(mark)) return json({ sent: false, reason: 'duplicate' }); } catch { /* the cache is an optimisation */ }
  if (mailWindow.hour !== hour) mailWindow = { hour, sent: 0 };
  if (mailWindow.sent >= MAIL_CAP) return json({ sent: false, reason: 'capped' });
  mailWindow.sent++;
  const mail = composeCrashMail(report, user, { environment, at });
  let sent = false;
  try { sent = await sendEmail(env, env.CRASH_NOTIFY_TO, mail.subject, mail.text, { idempotencyKey: `crash-${report.fingerprint}-${hour}` }); } catch { /* answered below */ }
  if (!sent) return json({ sent: false }, 502);
  try { await cache?.put(mark, new Response(null, { headers: { 'Cache-Control': 'max-age=3600' } })); } catch { /* the next crash may mail again */ }
  return json({ sent: true });
}
export const resetCrashMailForTests = () => { mailWindow = { hour: 0, sent: 0 }; };
