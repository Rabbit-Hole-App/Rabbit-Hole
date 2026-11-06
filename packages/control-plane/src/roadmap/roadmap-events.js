// R4.05 durable event outbox over learn_roadmap_outbox. An event is committed with the fact it reports (eventStatement in roadmap-store.js, inside
// the originating batch), so a crash can lose the notification but never the fact. A consumer CLAIMS an event with a lease (a claim is not
// completion), applies its effect, and marks it processed in the same batch as the state change it makes. A claim whose lease lapsed is claimable
// again, so a crash between claim and effect loses nothing. Retries are scheduled by next_at with a bounded backoff and a deadline.
// shortcut: handlers are registered per kind in-process (registerRoadmapHandler); the Tools lane registers the generation handler for step_accepted.
const nowSeconds = () => Math.floor(Date.now() / 1000);
export const LEASE_SECONDS = 60;
export const BACKOFF_SECONDS = attempts => Math.min(300, 5 * 2 ** Math.max(0, attempts - 1));

const handlers = new Map();
export const registerRoadmapHandler = (kind, fn) => handlers.set(kind, fn);
export const roadmapHandler = kind => handlers.get(kind) || null;

// -> events whose time has come and that nobody holds. Scans the pending index (processed_at, next_at), never idle roadmaps.
export async function dueRoadmapEvents(db, { now = nowSeconds(), limit = 25, scope = null } = {}) {
  const own = scope ? 'AND org = ? AND owner_user_id = ? AND board_id = ?' : '';
  const { results } = await db.prepare(`SELECT * FROM learn_roadmap_outbox WHERE processed_at IS NULL AND next_at <= ? AND (lease_until IS NULL OR lease_until <= ?) ${own} ORDER BY next_at LIMIT ?`)
    .bind(now, now, ...(scope ? [scope.org, scope.ownerUserId, scope.boardId] : []), limit).all();
  return results || [];
}

// -> true when this caller now holds the lease. A held, unexpired lease or a processed event changes nothing.
export async function claimRoadmapEvent(db, { eventId, leaseToken, leaseUntil, now = nowSeconds() }) {
  const done = await db.prepare(`UPDATE learn_roadmap_outbox SET lease_token = ?, lease_until = ?, attempts = attempts + 1
    WHERE event_id = ? AND processed_at IS NULL AND (lease_until IS NULL OR lease_until <= ?)`).bind(leaseToken, leaseUntil, eventId, now).run();
  return done.meta?.changes === 1;
}

// The effect and the processed marker share one batch. effects(guard) returns statements ending `AND ${guard.and}` with `...guard.binds`: they run
// only while this caller still holds the lease on a not yet processed event. -> true when the event was completed by this call.
export async function commitRoadmapEventEffect(db, { eventId, leaseToken, effects = () => [], now = nowSeconds() }) {
  const guard = { and: 'EXISTS (SELECT 1 FROM learn_roadmap_outbox WHERE event_id = ? AND lease_token = ? AND processed_at IS NULL)', binds: [eventId, leaseToken] };
  const marker = db.prepare('UPDATE learn_roadmap_outbox SET processed_at = ?, lease_token = NULL, lease_until = NULL WHERE event_id = ? AND lease_token = ? AND processed_at IS NULL').bind(now, eventId, leaseToken);
  const out = await db.batch([...effects(guard), marker]);
  return out[out.length - 1].meta?.changes === 1;
}

// A handler that could not finish: release the lease and schedule the retry. Past its deadline the event stays pending but stops being rescheduled
// automatically (attempts keep counting) so the failure is visible to an operator scan rather than looping.
export async function retryRoadmapEvent(db, { eventId, leaseToken, now = nowSeconds() }) {
  const row = await db.prepare('SELECT attempts, deadline_at FROM learn_roadmap_outbox WHERE event_id = ? AND lease_token = ? AND processed_at IS NULL').bind(eventId, leaseToken).first();
  if (!row) return false;
  const next = now + BACKOFF_SECONDS(row.attempts);
  await db.prepare('UPDATE learn_roadmap_outbox SET lease_token = NULL, lease_until = NULL, next_at = ? WHERE event_id = ? AND lease_token = ?').bind(row.deadline_at < now ? now + 3600 : next, eventId, leaseToken).run();
  return true;
}

// The earliest moment this scope has work again, for the alarm: a due or backoff time, or a lease that will lapse. null = nothing scheduled, no alarm.
export async function nextRoadmapWake(db, { scope = null } = {}) {
  const own = scope ? 'AND org = ? AND owner_user_id = ? AND board_id = ?' : '';
  const row = await db.prepare(`SELECT MIN(CASE WHEN lease_until IS NOT NULL AND lease_until > next_at THEN lease_until ELSE next_at END) AS at FROM learn_roadmap_outbox WHERE processed_at IS NULL ${own}`)
    .bind(...(scope ? [scope.org, scope.ownerUserId, scope.boardId] : [])).first();
  return row?.at ?? null;
}

// The bounded recurring scan that closes the commit-before-notify gap: boards that have due events and may have lost their notification.
// A scheduler (cron or any durable timer) calls this and kicks each board's RoadmapJobs. ponytail: the Cloudflare cron has missed ticks
// before, so the DO also re-arms its own alarm while work is pending; the Lead owns the scheduler wiring.
export async function boardsWithDueEvents(db, { now = nowSeconds(), limit = 50 } = {}) {
  const { results } = await db.prepare(`SELECT DISTINCT org, owner_user_id, board_id FROM learn_roadmap_outbox WHERE processed_at IS NULL AND next_at <= ? AND (lease_until IS NULL OR lease_until <= ?) LIMIT ?`).bind(now, now, limit).all();
  return (results || []).map(r => ({ org: r.org, ownerUserId: r.owner_user_id, boardId: r.board_id }));
}
