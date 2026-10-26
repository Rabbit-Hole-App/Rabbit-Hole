// /api/owner/telemetry: the owner dashboard's API (docs/features/telemetry.md; brief Tasks 17-18). Every request passes ownerOnly
// first; anyone else gets the same plain 404 for every path and method. Read-only on LEARN_DB; the only writes are the
// accounting projection and the owner access log, both in TELEMETRY_DB. Amounts are integer micro-USD, owner-only.
//   GET  /access                 200 for the owner: whether telemetry storage is configured here, and this environment
//   GET  /overview?days=1..30    events by name and outcome; attempts by cost state and payer class (never summed across states)
//   GET  /actions/<action id>    one action from LEARN_DB with its attempts, and its telemetry events
//   GET  /health                 delivery health, projection cursors and this isolate's emit counts
//   GET  /client-errors?days=    browser failures grouped by fingerprint, route and release, with occurrences and affected accounts
//   GET  /support/<ref>          a support reference: its report, the client errors it saw, and the server events and actions they link to
//   GET  /learning?days=         the Tutor and learning view: evidence metrics, milestones, hook funnel and decision sequences, each with its definition
//   POST /project                one bounded projection pass: accounting, the Tutor's learning evidence, then the Stars events
import { ownerOnly, ownerNotFound } from './owner-guard.js';
import { telemetryEnvironment } from './telemetry-contract.js';
import { deliveryCounts, emitTelemetry } from './telemetry-delivery.js';
import { deliverStarEvents } from './canvas-star-events.js';
import { projectAccounting } from './telemetry-projection.js';
import { projectLearning } from './telemetry-learning-projection.js';
import { learningMetrics } from './telemetry-learning-metrics.js';

const PREFIX = '/api/owner/telemetry/';
const ACTION_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
// Browser failures by what failed: the payload fields are read from the stored event, over a bounded window.
const CLIENT_ERRORS = `SELECT json_extract(body, '$.payload.fingerprint') AS fingerprint, json_extract(body, '$.payload.kind') AS kind,
    json_extract(body, '$.payload.route') AS route, release_sha, COUNT(*) AS events,
    SUM(COALESCE(json_extract(body, '$.payload.count'), 1)) AS occurrences, COUNT(DISTINCT user_ref) AS accounts, MAX(occurred_at) AS last_seen, MAX(trace_id) AS trace_id
  FROM telemetry_events WHERE environment = ? AND event_name = 'client.error' AND occurred_at >= ?
  GROUP BY fingerprint, kind, route, release_sha ORDER BY occurrences DESC LIMIT 50`;
const REF = /^RH-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const rows = async statement => (await statement.all()).results || [];

// Every owner route is an entry of ROUTES and is reached only through ownerTelemetryRoute, whose first step is the owner guard. A
// later route (an export, a diagnostic download, a reconciliation upload, an archive retrieval) is added here, and so is guarded
// by construction; none of those exists yet. storage: true means the handler needs TELEMETRY_DB and an environment, and
// otherwise answers { configured: false }.
const ROUTES = {
  access: { method: 'GET', run: ({ configured, environment }) => json({ owner: true, configured, environment }) },
  actions: { method: 'GET', run: ({ env, id, configured }) => action(env, id, configured) },
  support: { method: 'GET', run: ({ env, id, configured, environment }) => support(env, id, configured, environment) },
  project: { method: 'POST', storage: true, run: ({ env, db }) => projection(env, db) },
  health: { method: 'GET', storage: true, run: ({ db, configured, environment }) => health(db, configured, environment) },
  'client-errors': { method: 'GET', storage: true, run: async ({ db, req, configured, environment }) => {
    const { days, sinceMs } = span(req);
    return json({ configured, environment, days, groups: await rows(db.prepare(CLIENT_ERRORS).bind(environment, sinceMs)) });
  } },
  learning: { method: 'GET', storage: true, run: async ({ db, req, environment }) => json(await learningMetrics(db, { environment, days: span(req).days })) },
  overview: { method: 'GET', storage: true, run: async ({ db, req, configured, environment }) => {
    const { days, sinceMs } = span(req);
    return json({ configured, environment, days,
      events: await rows(db.prepare('SELECT event_name, outcome, COUNT(*) AS n FROM telemetry_events WHERE environment = ? AND occurred_at >= ? GROUP BY event_name, outcome ORDER BY n DESC').bind(environment, sinceMs)),
      // Each cost state on its own row: measured (settled), estimated, unknown provider cost (an ended call: the learner is charged nothing and holds nothing; the platform guard keeps its bound) and
      // running calls (the learner's credits are reserved while they run). The dashboard shows them side by side and never adds them together.
      attempts: await rows(db.prepare(`SELECT t.cost_state, a.charge_class, COUNT(*) AS attempts, SUM(t.cost_micros) AS cost_micros, SUM(t.reserved_micros) AS reserved_micros
        FROM accounting_attempts t LEFT JOIN accounting_actions a ON a.action_id = t.action_id WHERE t.started_at >= ? GROUP BY t.cost_state, a.charge_class`).bind(Math.floor(sinceMs / 1000))),
      projectedAt: (await db.prepare('SELECT MAX(updated_at) AS at FROM projection_cursors').first())?.at ?? null });
  } },
};
// The registered routes and their methods, for tests: each one is asserted to be guarded.
export const OWNER_ROUTES = Object.freeze(Object.fromEntries(Object.entries(ROUTES).map(([name, route]) => [name, route.method])));
const span = req => {
  const days = Math.min(30, Math.max(1, Number.parseInt(new URL(req.url).searchParams.get('days'), 10) || 1));
  return { days, sinceMs: Date.now() - days * 86_400_000 };
};

export async function ownerTelemetryRoute(path, req, env, deps = {}) {
  if (!path.startsWith(PREFIX) && path !== PREFIX.slice(0, -1)) return null;
  const owner = await ownerOnly(req, env, deps); // the one guard: nothing below runs for anyone else
  if (!owner) return ownerNotFound();
  const db = env.TELEMETRY_DB, environment = telemetryEnvironment(env);
  const [name, id] = path.slice(PREFIX.length).split('/');
  if (!Object.hasOwn(ROUTES, name)) return ownerNotFound();
  const route = ROUTES[name];
  if (req.method !== route.method) return json({ error: `${route.method} required` }, 405);
  // Audit each authorized request, best effort (a refused one is never written: strangers cannot grow the table).
  if (db) await db.prepare('INSERT INTO owner_access_log (at, user_ref, route, method) VALUES (?, ?, ?, ?)').bind(Date.now(), owner.userId, name, req.method).run().catch(() => {});
  const configured = !!db && !!environment;
  if (route.storage && !configured) return json({ configured: false, environment, reason: !db ? 'TELEMETRY_DB is not bound on this deployment.' : 'TELEMETRY_ENVIRONMENT is not set on this deployment.' });
  return route.run({ req, env, db, id, owner, configured, environment });
}

// Star events (canvas_star_events, stars.md) go to the sink oldest first, each marked delivered only after emitTelemetry stored it. A
// LEARN_DB without the table, or a sink that refuses, leaves the rows pending and reports null: Stars never fails the pass.
const deliverStars = env => deliverStarEvents(env.LEARN_DB, async envelope => {
  if (!(await emitTelemetry(env, { ...envelope, service: 'control_plane' }))) throw new Error('The event was not stored');
}, { limit: 500 }).catch(() => null);

// One bounded projection pass (accounting, the Tutor's learning evidence, Stars events); each pass is also a delivery-health row (source 'projection').
async function projection(env, db) {
  if (!env.LEARN_DB) return json({ error: 'LEARN_DB is not bound on this deployment.' }, 503);
  const record = (delivered, failed, pending) => db.prepare('INSERT OR IGNORE INTO telemetry_delivery_health (source, observed_at, delivered, failed, pending) VALUES (?, ?, ?, ?, ?)')
    .bind('projection', Date.now(), delivered, failed, pending).run().catch(() => {});
  try {
    const accounting = await projectAccounting(env.LEARN_DB, db, { limit: 500 });
    const learning = await projectLearning(env.LEARN_DB, db, { limit: 500 });
    const stars = await deliverStars(env);
    const pass = { copied: { ...accounting.copied, ...learning.copied, stars: stars ? stars.sent : null }, done: accounting.done && learning.done && !stars?.pending };
    await record(Object.values(pass.copied).reduce((sum, n) => sum + (n || 0), 0), 0, pass.done ? 0 : 1);
    return json(pass);
  } catch (error) {
    await record(0, 1, null);
    return json({ error: 'The projection pass failed; nothing was half-applied.', detail: String(error?.message || error).slice(0, 200) }, 503);
  }
}

async function health(db, configured, environment) {
  return json({ configured, environment,
    delivery: await rows(db.prepare('SELECT * FROM telemetry_delivery_health ORDER BY observed_at DESC LIMIT 50')),
    cursors: await rows(db.prepare('SELECT source, cursor, updated_at FROM projection_cursors')),
    lastIngestedAt: (await db.prepare('SELECT MAX(ingested_at) AS at FROM telemetry_events WHERE environment = ?').bind(environment).first())?.at ?? null,
    isolate: { ...deliveryCounts } });
}

// The action explorer reads the authoritative records, so its totals reconcile with accounting by construction.
async function action(env, id, configured) {
  if (!id || !ACTION_ID.test(id)) return json({ error: 'Give an action id.' }, 400);
  if (!env.LEARN_DB) return json({ error: 'LEARN_DB is not bound on this deployment.' }, 503);
  const found = await env.LEARN_DB.prepare('SELECT action_id, user_id, payer, payer_reason, feature, charge_class, period, status, result, started_at, ended_at FROM usage_actions WHERE action_id = ?').bind(id).first();
  const attempts = found ? await rows(env.LEARN_DB.prepare(`SELECT attempt_id, kind, provider, model, reserved_micros, cost_micros, cost_state, status, input_tokens, output_tokens, started_at, settled_at
    FROM usage_attempts WHERE action_id = ? ORDER BY started_at`).bind(id)) : [];
  // Events of the action itself, and of the requests (traces) it ran under: a browser failure joins through its trace id.
  const events = configured ? await rows(env.TELEMETRY_DB.prepare(`SELECT event_id, event_name, occurred_at, ingested_at, outcome, error_code, trace_id, body FROM telemetry_events
    WHERE action_id = ?1 OR trace_id IN (SELECT trace_id FROM telemetry_events WHERE action_id = ?1 AND trace_id IS NOT NULL) ORDER BY occurred_at LIMIT 200`).bind(id)) : [];
  if (!found && !events.length) return json({ error: 'No action with that id.' }, 404);
  return json({ action: found, attempts, events: events.map(({ body, ...rest }) => ({ ...rest, payload: JSON.parse(body).payload })) });
}

// A support reference (learn-feedback.js): the report, then what the page saw before it. Reads telemetry only; the actions it
// names are looked up in the action explorer, which reads the accounting records.
async function support(env, ref, configured, environment) {
  if (!ref || !REF.test(ref)) return json({ error: 'Give a support reference like RH-7QK2-M9XD.' }, 400);
  if (!configured) return json({ error: 'Telemetry storage is not configured on this deployment.' }, 503);
  const db = env.TELEMETRY_DB;
  const report = await db.prepare("SELECT event_id, occurred_at, user_ref, body FROM telemetry_events WHERE environment = ? AND event_name = 'support.report' AND json_extract(body, '$.payload.ref') = ?").bind(environment, ref).first();
  if (!report) return json({ error: 'No report with that reference.' }, 404);
  const payload = JSON.parse(report.body).payload;
  const fingerprints = payload.fingerprints || [], traces = new Set(payload.traces || []);
  const clientErrors = report.user_ref && fingerprints.length
    ? await rows(db.prepare(`SELECT event_id, occurred_at, trace_id, body FROM telemetry_events WHERE environment = ? AND event_name = 'client.error' AND user_ref = ?
        AND occurred_at BETWEEN ? AND ? AND json_extract(body, '$.payload.fingerprint') IN (${fingerprints.map(() => '?').join(',')}) ORDER BY occurred_at LIMIT 20`)
      .bind(environment, report.user_ref, report.occurred_at - 3_600_000, report.occurred_at + 60_000, ...fingerprints)) : [];
  for (const event of clientErrors) if (event.trace_id) traces.add(event.trace_id);
  const linked = traces.size ? await rows(db.prepare(`SELECT event_id, event_name, occurred_at, action_id, trace_id, outcome, error_code FROM telemetry_events
      WHERE environment = ? AND trace_id IN (${[...traces].map(() => '?').join(',')}) AND event_name NOT LIKE 'client.%' ORDER BY occurred_at LIMIT 50`).bind(environment, ...traces)) : [];
  return json({ report: { ref, kind: payload.kind, at: report.occurred_at, account: report.user_ref, route: payload.route ?? null },
    clientErrors: clientErrors.map(({ body, ...rest }) => ({ ...rest, payload: JSON.parse(body).payload })),
    serverEvents: linked, actionIds: [...new Set(linked.map(event => event.action_id).filter(Boolean))] });
}
