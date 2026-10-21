// Render fairness (owner message 6, 2026-10-21) for platform-funded rendering (owner 5A decision C): the platform pays for our
// own renderers' compute (scene worker, Manim), so a render never touches the learner's AI allowance. It is bounded instead,
// per authenticated learner across every canvas, on the 'render' rows fix A already writes (usage_actions / usage_attempts,
// charge_class 'free', never in BALANCE_SCOPE). A render takes its slot in one D1 transaction (a conditional INSERT, as
// admitSpend does) as a running attempt, and gives it back when its job is ready or failed. A running attempt older than its
// job's queue wait counts for nothing, so a lost Durable Object, alarm or release holds a slot no longer than that wait.
import { usageFromForwarded, usagePayer } from './learn-usage.js';

// Server vars with safe defaults (owner: configurable request/compute limits). Each counts one renderer (provider).
// RENDER_LEARNER_ACTIVE: one learner's queued or rendering jobs, all canvases together: each learner waits with one job.
// RENDER_QUEUE_MAX: every learner's queued or rendering jobs. The scene worker holds 10 jobs and compiles one at a time for at
//   most 90 s, so 8 finish inside the 15-minute queue wait.
// Fair share of the queue (owner, 2026-10-21): a learner with nothing queued is admitted whenever a position is free. A learner
//   who already holds positions takes another only while (theirs + 1) x (learners holding positions) <= RENDER_QUEUE_MAX - 1:
//   one position always stays free for a learner with none, and once others are queued, a heavy learner cannot refill the
//   positions their finished jobs free, so those go to the others. Inert at RENDER_LEARNER_ACTIVE 1.
// RENDER_LEARNER_DAY: renders one learner starts in a rolling 24 hours (the request limit).
// RENDER_PLATFORM_DAY: renders all learners start in a rolling 24 hours (the compute limit: at most this many times the
//   per-render cap, 90 s for a scene and 420 s for Manim).
const DEFAULTS = { RENDER_LEARNER_ACTIVE: 1, RENDER_QUEUE_MAX: 8, RENDER_LEARNER_DAY: 30, RENDER_PLATFORM_DAY: 400 };
export function renderLimits(env) {
  // A whole number (0 stops new renders); anything else is the default, never unlimited.
  const read = name => { const n = Number(String(env?.[name] ?? '').trim() || NaN); return Number.isSafeInteger(n) && n >= 0 ? n : DEFAULTS[name]; };
  return Object.fromEntries(Object.keys(DEFAULTS).map(name => [name, read(name)]));
}

// One renderer's held slots (running attempts) and its last day's render attempts; a cancelled one (admitted, then nothing
// rendered) counts for nothing. Each part reads usage_attempts_status (status, started_at), not every attempt ever recorded.
// A held slot counts for its job's whole wait, or until it is released when the renderer has no enforced limit (activeSince 0).
// Binds: user, activeSince, provider, user, user, daySince, provider.
const COUNTS = `SELECT r.mine_active, r.active, r.learners, d.mine_day, d.day, d.mine_first, d.first FROM
  (SELECT COUNT(CASE WHEN a.user_id = ? THEN 1 END) AS mine_active, COUNT(*) AS active, COUNT(DISTINCT a.user_id) AS learners
    FROM usage_attempts t JOIN usage_actions a ON a.action_id = t.action_id
    WHERE t.status = 'running' AND t.started_at > ? AND t.provider = ? AND a.feature = 'render') r,
  (SELECT COUNT(CASE WHEN a.user_id = ? AND t.status <> 'cancelled' THEN 1 END) AS mine_day,
      COUNT(CASE WHEN t.status <> 'cancelled' THEN 1 END) AS day,
      MIN(CASE WHEN a.user_id = ? AND t.status <> 'cancelled' THEN t.started_at END) AS mine_first,
      MIN(CASE WHEN t.status <> 'cancelled' THEN t.started_at END) AS first
    FROM usage_attempts t JOIN usage_actions a ON a.action_id = t.action_id
    WHERE t.status IN ('running', 'settled', 'failed', 'cancelled') AND t.started_at > ? AND t.provider = ? AND a.feature = 'render') d`;
const ADMIT_ACTION = `INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at)
  SELECT ?, ?, ?, ?, 'render', ?, ?, 'running', ? FROM (${COUNTS})
  WHERE mine_active < ? AND active < ? AND (mine_active = 0 OR (mine_active + 1) * learners <= ? - 1) AND mine_day < ? AND day < ?`;
const ADMIT_ATTEMPT = `INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, model, cost_state, status, started_at)
  SELECT ?, ?, 'media', ?, ?, 'unknown', 'running', ? WHERE EXISTS (SELECT 1 FROM usage_actions WHERE action_id = ?)`;

const DAY = 86400;
const wait = seconds => { const minutes = Math.max(1, Math.ceil(seconds / 60)); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`; };
function busy(reason, label, limits, retryAfter, count = 0) {
  const Label = label[0].toUpperCase() + label.slice(1);
  const error = {
    learner_active: `Your other ${label} is still rendering. Each learner renders ${limits.RENDER_LEARNER_ACTIVE === 1 ? 'one' : limits.RENDER_LEARNER_ACTIVE} at a time across all canvases, so everyone gets a turn. Try again in about a minute, when it has finished.`,
    fair_share: `You already have ${count} ${label} renders waiting. One place in the queue stays free for other learners, so the renderer is shared fairly. Try again in about a minute, when one has finished.`,
    queue_full: `The ${label} renderer is busy with other learners' work. Try again in about a minute.`,
    learner_day: `You've started ${limits.RENDER_LEARNER_DAY} ${label} renders in the last 24 hours, the daily limit. Try again in ${wait(retryAfter)}.`,
    platform_day: `${Label} rendering has reached its daily platform limit. Try again in ${wait(retryAfter)}.`,
    unavailable: `${Label} rendering is temporarily unavailable: its limits cannot be checked right now. Try again in about a minute.`,
  }[reason];
  return Response.json({ error, code: 'render_limited', reason, retryAfterSeconds: retryAfter },
    { status: reason === 'unavailable' ? 503 : 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) } });
}

// Takes one render slot for the learner the worker forwarded, before any render is queued. Returns { slot } to store on the
// job, or { refused } with the busy response, which says why and when to retry. Fails closed: no learner, no LEARN_DB or a
// failed read refuses. Only a job that will render calls this: a duplicate or a finished (cached) result never does.
// waitSeconds: how long a held slot can matter, proven by the renderer's own enforced limit; null when there is none, so a
// slot counts until it is released.
export async function admitRender(env, req, { provider, model = null, label, waitSeconds }) {
  const limits = renderLimits(env), db = env?.LEARN_DB;
  const payer = await usagePayer(usageFromForwarded(env, req, 'render'));
  if (!db || !payer?.userId) return { refused: busy('unavailable', label, limits, 60) };
  const now = Math.floor(Date.now() / 1000), counts = [payer.userId, waitSeconds == null ? 0 : now - waitSeconds, provider, payer.userId, payer.userId, now - DAY, provider];
  const action = `act-${crypto.randomUUID()}`, attempt = `att-${crypto.randomUUID()}`;
  try {
    const [admitted, recorded] = await db.batch([
      db.prepare(ADMIT_ACTION).bind(action, payer.userId, payer.payer, payer.payerReason, payer.chargeClass, payer.period, now, ...counts,
        limits.RENDER_LEARNER_ACTIVE, limits.RENDER_QUEUE_MAX, limits.RENDER_QUEUE_MAX, limits.RENDER_LEARNER_DAY, limits.RENDER_PLATFORM_DAY),
      db.prepare(ADMIT_ATTEMPT).bind(attempt, action, provider, model, now, action),
    ]);
    if (admitted.meta?.changes === 1 && recorded.meta?.changes === 1) return { slot: { attempt, action } };
    // Why, for the learner only; it never admits. A count that moved since is the queue's.
    const row = await db.prepare(COUNTS).bind(...counts).first();
    if (row.mine_active >= limits.RENDER_LEARNER_ACTIVE) return { refused: busy('learner_active', label, limits, 60) };
    if (row.mine_day >= limits.RENDER_LEARNER_DAY) return { refused: busy('learner_day', label, limits, Math.max(60, (row.mine_first ?? now) + DAY - now)) };
    if (row.day >= limits.RENDER_PLATFORM_DAY) return { refused: busy('platform_day', label, limits, Math.max(60, (row.first ?? now) + DAY - now)) };
    if (row.mine_active > 0 && (row.mine_active + 1) * row.learners > limits.RENDER_QUEUE_MAX - 1) return { refused: busy('fair_share', label, limits, 60, row.mine_active) };
    return { refused: busy('queue_full', label, limits, 60) };
  } catch (error) {
    console.warn('render admission:', error?.message);
    return { refused: busy('unavailable', label, limits, 60) };
  }
}

// Gives a slot back once: 'settled' (its job is ready), 'failed' (failed, timed out or refused by the renderer) or 'cancelled'
// (admitted, then nothing rendered). Never throws: a release that fails holds the slot only until its queue wait expires.
const ENDED = { settled: 'completed', failed: 'failed', cancelled: 'cancelled' };
export async function releaseRender(env, slot, status) {
  const db = env?.LEARN_DB;
  if (!db || !slot?.attempt) return;
  const now = Math.floor(Date.now() / 1000);
  try {
    await db.batch([
      db.prepare("UPDATE usage_attempts SET status = ?, settled_at = ? WHERE attempt_id = ? AND status = 'running'").bind(status, now, slot.attempt),
      db.prepare("UPDATE usage_actions SET status = ?, result = ?, ended_at = ? WHERE action_id = ? AND status = 'running'").bind(ENDED[status], status === 'settled' ? 'full' : 'none', now, slot.action),
    ]);
  } catch (error) { console.warn('render slot not released:', error?.message); }
}

// The renderer version a slot was admitted for, once the renderer has said it (admission comes before the renderer is asked).
export async function renderModel(env, slot, model) {
  try { await env.LEARN_DB.prepare('UPDATE usage_attempts SET model = ? WHERE attempt_id = ?').bind(model, slot.attempt).run(); }
  catch (error) { console.warn('render model not recorded:', error?.message); }
}
