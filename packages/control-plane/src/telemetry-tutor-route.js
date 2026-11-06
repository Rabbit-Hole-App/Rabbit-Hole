// POST /api/telemetry/tutor: the Tutor evidence events of a signed-in learner (docs/features/telemetry.md "Tutor evidence"; brief
// Task 12). Unlike the anonymous error route this one refuses a caller with no session, accepts only the tutor namespace
// (INGEST_NAMESPACES.tutor) and trusts the browser for nothing but the event's own ids, enums and counts: the account, time,
// environment and event id are the server's; the learner's goal, activity and criteria come from the server's own coaching
// records; and a canvas reference survives only where the account owns that canvas (and never for a shared scope).
//   Idempotent: the stored id is derived from the account and the browser's event id, so a retry or replay is one row.
//   Order: the events of one batch are spaced one millisecond apart in batch order, so a sequence reads in the order it happened.
//   Bounds as the error route: same origin, 64 KB, 20 events a batch, a per-account bucket, 204 where telemetry is not provisioned.
import { INGEST_NAMESPACES, LIMITS, makeEvent, telemetryEnvironment, validateBatch, validateEvent } from './telemetry-contract.js';
import { tokenBucket } from './telemetry-limit.js';
import { writeEvents } from './telemetry-delivery.js';
import { sha256 } from './token.js';
import { devIdentity } from './dev-forwarding.js';

export const TUTOR_PATH = '/api/telemetry/tutor';
export const TUTOR_BATCH = 20;
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
// A learner's turns and hook sets are few: 40 events at once, then two a second.
const limiter = tokenBucket({ capacity: 40, refillPerSec: 2 });

// The server's own record of where the learner is on a canvas they own: null when they do not own it (or nothing can be read).
async function place(db, who, app, board) {
  if (!db || !app || !board) return null;
  try {
    const owned = await db.prepare('SELECT 1 AS ok FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = ? LIMIT 1').bind(who.org, who.email, app, board).first()
      ?? await db.prepare('SELECT 1 AS ok FROM learn_coaching_state WHERE org = ? AND owner_user_id = ? AND app = ? AND board = ? LIMIT 1').bind(who.org, who.userId, app, board).first();
    if (!owned) return null;
    const state = await db.prepare('SELECT active_goal_id, active_activity_id FROM learn_coaching_state WHERE org = ? AND owner_user_id = ? AND app = ? AND board = ?').bind(who.org, who.userId, app, board).first().catch(() => null);
    const out = { goal_id: state?.active_goal_id || undefined };
    if (state?.active_activity_id) {
      const activity = await db.prepare('SELECT id, revision, response_kind, criterion_refs_json FROM learn_activities WHERE id = ? AND owner_user_id = ?').bind(state.active_activity_id, who.userId).first().catch(() => null);
      if (activity) {
        out.activity_id = activity.id; out.activity_revision = activity.revision; out.activity_type = activity.response_kind;
        try { out.criteria = JSON.parse(activity.criterion_refs_json).slice(0, 5).map(ref => `${ref.criterionId}:${ref.version}`); } catch { /* unreadable refs: none */ }
      }
    }
    return out;
  } catch { return null; }
}

export async function tutorTelemetryRoute(path, req, env, { identity = devIdentity, now = Date.now, limit = limiter } = {}) {
  if (path !== TUTOR_PATH) return null;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405, { Allow: 'POST' });
  const site = req.headers.get('sec-fetch-site');
  if ((site && !['same-origin', 'same-site', 'none'].includes(site)) || (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin)) return json({ error: 'Invalid origin' }, 403);
  // The session first: an anonymous caller is refused whether or not telemetry storage is provisioned here.
  let who = null;
  try { const user = await identity(req, env); if (user && !(user instanceof Response) && user.userId) who = user; } catch { /* no session */ }
  if (!who) return json({ error: 'Sign in' }, 401);
  const environment = telemetryEnvironment(env);
  if (!env.TELEMETRY_DB || !environment) return new Response(null, { status: 204 });
  const length = Number(req.headers.get('content-length'));
  if (Number.isFinite(length) && length > LIMITS.batchBytes) return json({ error: 'Too large' }, 413);
  const text = await req.text();
  if (text.length > LIMITS.batchBytes) return json({ error: 'Too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!Array.isArray(body?.events) || body.events.length > TUTOR_BATCH) return json({ error: 'Invalid batch' }, 400);
  const batch = validateBatch(body.events.map(event => (event && typeof event === 'object' ? { ...event, environment, service: 'web' } : event)));
  if (!batch.ok) return json({ error: 'Invalid batch' }, 400);
  const taken = limit.take(`u:${who.userId}`, Math.max(1, batch.events.length));
  if (!taken.ok) return json({ error: 'Slow down' }, 429, { 'Retry-After': String(Math.ceil(taken.retryAfterMs / 1000)) });

  const at = now(), places = new Map();
  const events = [];
  let rejected = batch.rejected;
  for (const event of batch.events) {
    if (!INGEST_NAMESPACES.tutor.includes(event.event_name.split('.')[0])) { rejected++; continue; }
    const payload = { ...event.payload };
    // A canvas reference only for the learner's own canvas, never for a shared scope; the goal, activity and criteria only from the server's records.
    for (const key of ['goal_id', 'activity_id', 'activity_revision', 'activity_type', 'criteria']) delete payload[key];
    if (payload.scope === 'shared') delete payload.canvas_ref;
    if (payload.canvas_ref) {
      const key = `${payload.canvas_ref}|${payload.board || ''}`;
      if (!places.has(key)) places.set(key, await place(env.LEARN_DB, who, payload.canvas_ref, payload.board));
      const found = places.get(key);
      if (!found) { delete payload.canvas_ref; delete payload.board; }
      else if (event.event_name === 'tutor.decision') Object.assign(payload, Object.fromEntries(Object.entries(found).filter(([, value]) => value !== undefined)));
    }
    const id = (await sha256(`${who.userId}|${event.event_id}`)).slice(0, 24);
    const stored = makeEvent(event.event_name, { event_id: `tv-${id}`, user_ref: who.userId, feature: 'tutor', ...(event.turn_id ? { turn_id: event.turn_id } : {}),
      ...(event.versions ? { versions: event.versions } : {}), payload }, { environment, service: 'web', now: at + events.length, release: /^[0-9a-f]{7,40}$/.test(env.RELEASE_SHA || '') ? env.RELEASE_SHA : null });
    const checked = validateEvent(stored);
    if (checked.ok) events.push(checked.event); else rejected++;
  }
  let accepted = 0;
  try { accepted = await writeEvents(env.TELEMETRY_DB, events, at); }
  catch { return json({ error: 'Unavailable' }, 503); }
  return json({ accepted, rejected, deduped: events.length - accepted }, 202);
}
