// GET /api/learn/usage (credits Phase 1; contract with the UI lane in C:/s/spec/credits-phase1-design.md "Summary endpoint").
// The signed-in user's own month, from the session only: no user id parameter is read. Accounting, not enforcement:
// enforced is always false here. Two indexed sums, no AI call.
import { devIdentity } from './dev-forwarding.js';
import { monthlyAllowanceMicros } from './learn-usage-config.js';
import { periodOf, periodReset, usageTotals } from './learn-usage.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function usageFetch(req, env, { identity = devIdentity, now = Math.floor(Date.now() / 1000) } = {}) {
  if (req.method !== 'GET') return json({ error: 'GET required' }, 405);
  const user = await identity(req, env);
  if (user instanceof Response) return user.status === 403 ? user : json({ error: 'Sign in to see your AI usage.' }, 401);
  const userId = user?.userId || user?.email;
  if (!userId) return json({ error: 'Sign in to see your AI usage.' }, 401);
  const allowance = monthlyAllowanceMicros(env);
  if (allowance == null) return json({ enforced: false, unavailable: 'config' }); // never unlimited
  const period = periodOf(now);
  let totals;
  try { totals = await usageTotals(env.LEARN_DB, userId, period); }
  catch { return json({ unavailable: 'accounting' }, 503); }
  return json({ enforced: false, currency: 'USD', period, resetsAt: periodReset(period), allowanceMicros: allowance,
    usedMicros: totals.used, reservedMicros: totals.reserved, estimatedMicros: totals.estimated,
    remainingMicros: Math.max(0, allowance - totals.used - totals.reserved),
    // Unknown cost is never silently 0: how many finished attempts have no known cost, and the part of reservedMicros they hold.
    unknownAttempts: totals.unknownAttempts, unknownReservedMicros: totals.unknownReserved });
}
