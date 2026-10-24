// POST /api/telemetry/client: browser error batches (docs/features/telemetry.md "Browser errors"; brief Task 11). The browser is
// untrusted: of each event only the name (client namespace only), the trace id, a release hash and the payload are kept; the
// environment, service, time, account and event id are the server's. Anything that fails the contract is counted and dropped.
// Anonymous callers are accepted (a shared canvas page has no session), recorded with no account.
//   Bounds: 64 KB a request, 50 events a batch, a per-isolate token bucket per account (or per hashed network address), a
//   per-event dedup (below) and TELEMETRY_CLIENT_DISABLED=true as a kill switch. The buckets are per isolate, so the bound is
//   approximate across isolates; put a Cloudflare rate limiting rule on this path for a hard one (runbook).
//   Dedup: the stored event id is derived from (the payload without its counters, account or address, 10-minute bucket), so the same
//   failure from the same account in the same bucket is one row whatever the page does; INSERT OR IGNORE in writeEvents drops the
//   repeats. Counts of repeats inside one page ride in payload.count; repeats the sink ignores are reported as `deduped`.
import { BROWSER_NAMESPACES, LIMITS, makeEvent, telemetryEnvironment, validateBatch } from './telemetry-contract.js';
import { tokenBucket } from './telemetry-limit.js';
import { writeEvents } from './telemetry-delivery.js';
import { sha256 } from './token.js';
import { devIdentity } from './dev-forwarding.js';

export const CLIENT_PATH = '/api/telemetry/client';
const BUCKET_MS = 600_000;
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
// 120 events a minute burst 60 per account or address: a broken page sends at most 10 a minute (client-telemetry.js).
const limiter = tokenBucket({ capacity: 60, refillPerSec: 2 });

export async function clientTelemetryRoute(path, req, env, { identity = devIdentity, now = Date.now, limit = limiter } = {}) {
  if (path !== CLIENT_PATH) return null;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405, { Allow: 'POST' });
  if (env.TELEMETRY_CLIENT_DISABLED === 'true') return new Response(null, { status: 204 });
  // Same-origin only: a cross-site page must not be able to write rows under a visitor's account.
  const site = req.headers.get('sec-fetch-site');
  if ((site && !['same-origin', 'same-site', 'none'].includes(site)) || (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin)) return json({ error: 'Invalid origin' }, 403);
  const environment = telemetryEnvironment(env);
  if (!env.TELEMETRY_DB || !environment) return new Response(null, { status: 204 }); // not provisioned here: nothing to keep, nothing to retry
  const length = Number(req.headers.get('content-length'));
  if (Number.isFinite(length) && length > LIMITS.batchBytes) return json({ error: 'Too large' }, 413);
  const text = await req.text();
  if (text.length > LIMITS.batchBytes) return json({ error: 'Too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const batch = validateBatch(Array.isArray(body?.events) ? body.events.map(event => (event && typeof event === 'object' ? { ...event, environment, service: 'web' } : event)) : null);
  if (!batch.ok) return json({ error: 'Invalid batch' }, 400);

  // The account, from the session only; any failure or no session is an anonymous caller.
  let userRef = null;
  try { const who = await identity(req, env); if (who && !(who instanceof Response)) userRef = who.userId || null; } catch { /* anonymous */ }
  const address = req.headers.get('cf-connecting-ip') || 'unknown';
  const who = userRef ? `u:${userRef}` : `a:${(await sha256(address)).slice(0, 16)}`;
  const taken = limit.take(who, Math.max(1, batch.events.length));
  if (!taken.ok) return json({ error: 'Slow down' }, 429, { 'Retry-After': String(Math.ceil(taken.retryAfterMs / 1000)) });

  const at = now(), bucket = Math.floor(at / BUCKET_MS);
  const events = [];
  let rejected = batch.rejected;
  for (const event of batch.events) {
    if (!BROWSER_NAMESPACES.includes(event.event_name.split('.')[0])) { rejected++; continue; }
    // What identifies the failure: the payload without its counters, so a repeat with a different count is the same row.
    const { count, dropped, duration_ms, online, ...identity_ } = event.payload;
    const id = (await sha256(`${event.event_name}|${JSON.stringify(identity_)}|${who}|${bucket}`)).slice(0, 24);
    events.push(makeEvent(event.event_name, {
      event_id: `ce-${id}`, ...(event.trace_id ? { trace_id: event.trace_id } : {}), ...(userRef ? { user_ref: userRef } : {}),
      feature: 'client', payload: event.payload,
    }, { environment, service: 'web', now: at, release: /^[0-9a-f]{7,40}$/.test(env.RELEASE_SHA || '') ? env.RELEASE_SHA : (event.release_sha || null) }));
  }
  let accepted = 0;
  try { accepted = await writeEvents(env.TELEMETRY_DB, events, at); }
  catch { return json({ error: 'Unavailable' }, 503); } // the browser counts it as lost; it does not retry
  return json({ accepted, rejected, deduped: events.length - accepted }, 202);
}
