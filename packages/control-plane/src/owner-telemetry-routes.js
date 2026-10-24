// /api/owner/telemetry: the owner dashboard's API (docs/features/telemetry.md; brief Tasks 17-18). Every request passes ownerOnly
// first; anyone else gets the same plain 404 for every path and method. Read-only on LEARN_DB; the only writes are the
// accounting projection and the owner access log, both in TELEMETRY_DB. Amounts are integer micro-USD, owner-only.
//   GET  /access                 200 for the owner: whether telemetry storage is configured here, and this environment
//   GET  /overview?days=1..30    events by name and outcome; attempts by cost state and payer class (never summed across states)
//   GET  /actions/<action id>    one action from LEARN_DB with its attempts, and its telemetry events
//   GET  /health                 delivery health, projection cursors and this isolate's emit counts
//   POST /project                one bounded accounting projection pass
import { ownerOnly, ownerNotFound } from './owner-guard.js';
import { telemetryEnvironment } from './telemetry-contract.js';
import { deliveryCounts } from './telemetry-delivery.js';
import { projectAccounting } from './telemetry-projection.js';

const PREFIX = '/api/owner/telemetry/';
const ACTION_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const rows = async statement => (await statement.all()).results || [];

export async function ownerTelemetryRoute(path, req, env, deps = {}) {
  if (!path.startsWith(PREFIX) && path !== PREFIX.slice(0, -1)) return null;
  const owner = await ownerOnly(req, env, deps);
  if (!owner) return ownerNotFound();
  const db = env.TELEMETRY_DB, environment = telemetryEnvironment(env);
  const [route, id] = path.slice(PREFIX.length).split('/');
  const known = { access: 'GET', overview: 'GET', actions: 'GET', health: 'GET', project: 'POST' };
  if (!Object.hasOwn(known, route)) return ownerNotFound();
  if (req.method !== known[route]) return json({ error: `${known[route]} required` }, 405);
  // Audit each authorized request, best effort (a refused one is never written: strangers cannot grow the table).
  if (db) await db.prepare('INSERT INTO owner_access_log (at, user_ref, route, method) VALUES (?, ?, ?, ?)').bind(Date.now(), owner.userId, route, req.method).run().catch(() => {});
  const configured = !!db && !!environment;
  if (route === 'access') return json({ owner: true, configured, environment });
  if (route === 'actions') return action(env, id, configured);
  if (!configured) return json({ configured: false, environment, reason: !db ? 'TELEMETRY_DB is not bound on this deployment.' : 'TELEMETRY_ENVIRONMENT is not set on this deployment.' });
  if (route === 'project') {
    if (!env.LEARN_DB) return json({ error: 'LEARN_DB is not bound on this deployment.' }, 503);
    try { return json(await projectAccounting(env.LEARN_DB, db, { limit: 500 })); }
    catch (error) { return json({ error: 'The projection pass failed; nothing was half-applied.', detail: String(error?.message || error).slice(0, 200) }, 503); }
  }
  if (route === 'health') return json({ configured, environment,
    delivery: await rows(db.prepare('SELECT * FROM telemetry_delivery_health ORDER BY observed_at DESC LIMIT 50')),
    cursors: await rows(db.prepare('SELECT source, cursor, updated_at FROM projection_cursors')),
    lastIngestedAt: (await db.prepare('SELECT MAX(ingested_at) AS at FROM telemetry_events WHERE environment = ?').bind(environment).first())?.at ?? null,
    isolate: { ...deliveryCounts } });
  const days = Math.min(30, Math.max(1, Number.parseInt(new URL(req.url).searchParams.get('days'), 10) || 1));
  const sinceMs = Date.now() - days * 86_400_000;
  return json({ configured, environment, days,
    events: await rows(db.prepare('SELECT event_name, outcome, COUNT(*) AS n FROM telemetry_events WHERE environment = ? AND occurred_at >= ? GROUP BY event_name, outcome ORDER BY n DESC').bind(environment, sinceMs)),
    // Each cost state on its own row: measured (settled), estimated, unknown exposure (its held reservation) and outstanding
    // reservations (running). The dashboard shows them side by side and never adds them together.
    attempts: await rows(db.prepare(`SELECT t.cost_state, a.charge_class, COUNT(*) AS attempts, SUM(t.cost_micros) AS cost_micros, SUM(t.reserved_micros) AS reserved_micros
      FROM accounting_attempts t LEFT JOIN accounting_actions a ON a.action_id = t.action_id WHERE t.started_at >= ? GROUP BY t.cost_state, a.charge_class`).bind(Math.floor(sinceMs / 1000))),
    projectedAt: (await db.prepare('SELECT MAX(updated_at) AS at FROM projection_cursors').first())?.at ?? null });
}

// The action explorer reads the authoritative records, so its totals reconcile with accounting by construction.
async function action(env, id, configured) {
  if (!id || !ACTION_ID.test(id)) return json({ error: 'Give an action id.' }, 400);
  if (!env.LEARN_DB) return json({ error: 'LEARN_DB is not bound on this deployment.' }, 503);
  const found = await env.LEARN_DB.prepare('SELECT action_id, user_id, payer, payer_reason, feature, charge_class, period, status, result, started_at, ended_at FROM usage_actions WHERE action_id = ?').bind(id).first();
  const attempts = found ? await rows(env.LEARN_DB.prepare(`SELECT attempt_id, kind, provider, model, reserved_micros, cost_micros, cost_state, status, input_tokens, output_tokens, started_at, settled_at
    FROM usage_attempts WHERE action_id = ? ORDER BY started_at`).bind(id)) : [];
  const events = configured ? await rows(env.TELEMETRY_DB.prepare('SELECT event_id, event_name, occurred_at, ingested_at, outcome, error_code, body FROM telemetry_events WHERE action_id = ? ORDER BY occurred_at LIMIT 200').bind(id)) : [];
  if (!found && !events.length) return json({ error: 'No action with that id.' }, 404);
  return json({ action: found, attempts, events: events.map(({ body, ...rest }) => ({ ...rest, payload: JSON.parse(body).payload })) });
}
