// R4.06 / D14: per-learner platform-work quota reservations over learn_roadmap_quota (one row per org, learner, scope and window start).
// reserveRoadmapQuota counts one platform call against the hour and the day window of its stage (invite, plan, propose, check) BEFORE the call.
// Concurrent callers each increment with a guarded UPDATE, so two contenders for the last slot cannot both win. The limits are the versioned,
// provisional ROADMAP_LIMITS.quotas (a counter, not a budget approval). A refused reservation means the call is not made.
// A platform model call reserves AFTER its local checks and its planned row, right before dispatch; releaseCallQuota hands the unit back for a call proven
// undispatched (row still 'planned'), once, keyed on that row. Unknown or dispatched outcomes keep the unit.
// shortcut: the hour counter is incremented first and compensated if the day window refuses, so a crash between the two leaves the hour over-counted by one
// (conservative); a single-statement dual-window increment waits for a measured need.
import { ROADMAP_LIMITS } from './roadmap-policy.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);
export const QUOTA_STAGES = Object.freeze(['invite', 'plan', 'propose', 'check']);

async function take(db, access, scope, windowStart, limit) {
  await db.prepare('INSERT OR IGNORE INTO learn_roadmap_quota (org, owner_user_id, scope, window_start, calls, micros) VALUES (?, ?, ?, ?, 0, 0)').bind(access.org, access.actorUserId, scope, windowStart).run();
  const done = await db.prepare('UPDATE learn_roadmap_quota SET calls = calls + 1 WHERE org = ? AND owner_user_id = ? AND scope = ? AND window_start = ? AND calls < ?').bind(access.org, access.actorUserId, scope, windowStart, limit).run();
  return done.meta?.changes === 1;
}
const give = (db, access, scope, windowStart) => db.prepare('UPDATE learn_roadmap_quota SET calls = MAX(0, calls - 1) WHERE org = ? AND owner_user_id = ? AND scope = ? AND window_start = ?').bind(access.org, access.actorUserId, scope, windowStart).run();

// -> { ok: true } | { ok: false, window: 'hour'|'day' }
export async function reserveRoadmapQuota(db, access, stage, { now = nowSeconds(), limits = ROADMAP_LIMITS } = {}) {
  if (!QUOTA_STAGES.includes(stage)) throw new Error(`unknown quota stage ${stage}`);
  const q = limits.quotas, hour = Math.floor(now / q.windowSeconds.hour) * q.windowSeconds.hour, day = Math.floor(now / q.windowSeconds.day) * q.windowSeconds.day;
  if (!await take(db, access, `${stage}.hour`, hour, q.perHour[stage])) return { ok: false, window: 'hour' };
  if (!await take(db, access, `${stage}.day`, day, q.perDay[stage])) { await give(db, access, `${stage}.hour`, hour); return { ok: false, window: 'day' }; }
  return { ok: true };
}

// Pruning is lazy and bounded: windows older than a day are dropped when a learner next reserves (no cron is relied on).
export const pruneRoadmapQuota = (db, access, now = nowSeconds()) => db.prepare('DELETE FROM learn_roadmap_quota WHERE org = ? AND owner_user_id = ? AND window_start < ?').bind(access.org, access.actorUserId, now - 2 * 86400).run();

// Records which reservation a planned call holds, so releaseCallQuota can undo exactly that one. quota_window is the reservation time: both windows derive from it.
export const recordCallQuota = (db, opId, stage, now) => db.prepare("UPDATE learn_roadmap_calls SET quota_scope = ?, quota_window = ? WHERE op_id = ? AND checkpoint = 'planned' AND quota_scope IS NULL").bind(stage, now, opId).run();

// Idempotent and replay-safe: only a call still 'planned' (nothing dispatched) is released, and only once. A refused reservation has no quota_scope, so only the row moves.
// -> true when this call released it.
export async function releaseCallQuota(db, access, opId, { now = nowSeconds(), limits = ROADMAP_LIMITS } = {}) {
  const row = await db.prepare("SELECT quota_scope, quota_window FROM learn_roadmap_calls WHERE op_id = ? AND checkpoint = 'planned'").bind(opId).first();
  if (!row) return false; // already released, or dispatched/unknown/settled: the unit stays
  const q = limits.quotas, stage = row.quota_scope;
  const windows = stage ? [['hour', q.windowSeconds.hour], ['day', q.windowSeconds.day]].map(([name, size]) => [`${stage}.${name}`, Math.floor(row.quota_window / size) * size]) : [];
  const out = await db.batch([
    ...windows.map(([scope, windowStart]) => db.prepare(`UPDATE learn_roadmap_quota SET calls = MAX(0, calls - 1) WHERE org = ? AND owner_user_id = ? AND scope = ? AND window_start = ?
      AND EXISTS (SELECT 1 FROM learn_roadmap_calls WHERE op_id = ? AND checkpoint = 'planned' AND quota_scope = ?)`).bind(access.org, access.actorUserId, scope, windowStart, opId, stage)),
    db.prepare("UPDATE learn_roadmap_calls SET checkpoint = 'released', settled_at = ? WHERE op_id = ? AND checkpoint = 'planned'").bind(now, opId),
  ]);
  return out[out.length - 1].meta?.changes === 1;
}
