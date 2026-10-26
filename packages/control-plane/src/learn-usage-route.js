// GET /api/learn/usage (contract with the UI in C:/s/spec/credits-phase1-design.md "Summary endpoint"; enforcement owner L12
// 2026-10-20). The signed-in user's own month, from the session only: no user id parameter is read. remainingMicros is
// exactly what admission (learn-spend-ledger.js admitSpend) lets the next request reserve: the same sums, the same period.
// enforced is true wherever admission enforces the allowance. Indexed sums (in total and by feature), no AI call.
import { devIdentity } from './dev-forwarding.js';
import { spendEnforced } from './learn-spend-ledger.js';
import { allowanceFor } from './learn-entitlement.js';
import { monthlyAllowanceMicros } from './learn-usage-config.js';
import { periodOf, periodReset, usageByFeature, usageTotals } from './learn-usage.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function usageFetch(req, env, { identity = devIdentity, now = Math.floor(Date.now() / 1000) } = {}) {
  if (req.method !== 'GET') return json({ error: 'GET required' }, 405);
  const user = await identity(req, env);
  if (user instanceof Response) return user.status === 403 ? user : json({ error: 'Sign in to see your AI usage.' }, 401);
  const userId = user?.userId || user?.email;
  if (!userId) return json({ error: 'Sign in to see your AI usage.' }, 401);
  // The subscription bridge (dev only) sends no paid request through admission; everywhere else the allowance is enforced.
  const enforced = spendEnforced(env) && env.SUBSCRIPTION_ONLY !== 'true';
  const period = periodOf(now);
  // The same function admission uses (learn-entitlement.js), so the screen shows exactly what the gate enforces.
  if (monthlyAllowanceMicros(env) == null) return json({ enforced, unavailable: 'config' }); // never unlimited: chargeable AI is refused
  const allowance = await allowanceFor(env.LEARN_DB, env, userId, period);
  if (allowance == null) return json({ enforced, unavailable: 'accounting' }, 503);
  let totals, byFeature;
  try { [totals, byFeature] = await Promise.all([usageTotals(env.LEARN_DB, userId, period, now), usageByFeature(env.LEARN_DB, userId, period, now)]); }
  catch { return json({ enforced, unavailable: 'accounting' }, 503); }
  return json({ enforced, currency: 'USD', period, resetsAt: periodReset(period), allowanceMicros: allowance,
    usedMicros: totals.used, reservedMicros: totals.reserved, estimatedMicros: totals.estimated,
    remainingMicros: Math.max(0, allowance - totals.used - totals.reserved),
    // Unknown cost is never silently 0: how many finished attempts have no known cost, and the largest they could have cost. They are
    // charged nothing and hold nothing: reservedMicros is only what is still running.
    unknownAttempts: totals.unknownAttempts, unknownReservedMicros: totals.unknownReserved, byFeature });
}
