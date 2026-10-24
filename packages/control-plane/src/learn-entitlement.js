// The one entitlement function (owner credits brief 2026-10-23): how many micro-USD a person may spend in one UTC month. The
// usage screen (learn-usage-route.js) and server admission (admissionPayer in learn-usage.js, so admitSpend, allowanceFirst
// and Explain generation) both read it, so what the screen shows is what the gate enforces.
//
// A person's allowance for a month is a grant row (learn-migrations/0027), written once at the first admission of that month
// and never lowered: raising AI_MONTHLY_ALLOWANCE_USD raises it (the larger of the two applies), lowering never takes away
// what was granted, and usage is never erased. One grant per stable account id and month: signing in again, another device
// or a linked sign-in provider reaches the same user id and the same row. No timer or onboarding task: a month's grant is
// made on demand from the month boundary, so a person who was offline at the 1st gets the new month's allowance on return.
//
// The transition to the new default: an account with any earlier AI usage keeps AI_LEGACY_ALLOWANCE_USD for the months up to
// AI_ALLOWANCE_CUTOVER_PERIOD (exclusive), then the default from that month on; an account with no usage yet, and every new
// account, gets the default at once.
// shortcut: an account that never used AI before the cutover gets the default for the cutover month's remainder, since its
// account age is not known to this database; it loses no usage. Add the account's creation time to the session if that matters.
import { allowanceCutoverPeriod, legacyAllowanceMicros, monthlyAllowanceMicros } from './learn-usage-config.js';

async function firstGrant(db, env, userId, period) {
  const legacy = legacyAllowanceMicros(env), cutover = allowanceCutoverPeriod(env);
  const fresh = monthlyAllowanceMicros(env);
  if (legacy == null || cutover == null || period >= cutover) return { micros: fresh, source: 'default' };
  const used = await db.prepare('SELECT 1 AS found FROM usage_actions WHERE user_id = ? LIMIT 1').bind(userId).first();
  return used ? { micros: legacy, source: 'legacy_transition' } : { micros: fresh, source: 'default' };
}

// -> integer micro-USD, or null when the setting is invalid or the grants cannot be read (never unlimited). create: false
// reads what a grant would be without writing it (the usage screen); true writes it (admission). Never throws.
export async function allowanceFor(db, env, userId, period, { create = false, now = Math.floor(Date.now() / 1000) } = {}) {
  const fresh = monthlyAllowanceMicros(env);
  if (fresh == null || !db || !userId || !period) return null;
  try {
    let row = await db.prepare('SELECT allowance_micros FROM usage_grants WHERE user_id = ? AND period = ?').bind(userId, period).first();
    if (!row) {
      const grant = await firstGrant(db, env, userId, period);
      if (!create) return Math.max(grant.micros, fresh);
      await db.prepare('INSERT OR IGNORE INTO usage_grants (user_id, period, allowance_micros, source, granted_at) VALUES (?, ?, ?, ?, ?)')
        .bind(userId, period, grant.micros, grant.source, now).run();
      row = await db.prepare('SELECT allowance_micros FROM usage_grants WHERE user_id = ? AND period = ?').bind(userId, period).first();
    }
    return Math.max(Number(row.allowance_micros), fresh);
  } catch { return null; }
}
