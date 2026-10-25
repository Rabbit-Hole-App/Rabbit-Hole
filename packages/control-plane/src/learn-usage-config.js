// The one reader of the allowance settings (owner D3, 2026-10-16; 2,500 AI credits a month, owner 2026-10-23): every allowance
// figure comes from here, never a literal. AI_MONTHLY_ALLOWANCE_USD is the default every new account is granted each UTC month
// (25 USD = 2,500 credits). AI_LEGACY_ALLOWANCE_USD and AI_ALLOWANCE_CUTOVER_PERIOD ('YYYY-MM') keep the allowance an existing
// account already had for the cutover month and before (learn-entitlement.js); both unset means no transition.
// A finite decimal above 0 and at most 10000 USD; anything else is invalid, and invalid never means unlimited.
// GET /api/learn/usage reports it and admitSpend (learn-spend-ledger.js) enforces it (owner L12 2026-10-20).
const DECIMAL = /^\d+(\.\d{1,6})?$/;

// -> integer micro-USD, or null when missing or invalid.
const microsOf = raw => {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim();
  if (!DECIMAL.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  // Integer arithmetic on the digits, so no float ever reaches the amount.
  const micros = Number(whole) * 1e6 + Number(fraction.padEnd(6, '0'));
  return Number.isSafeInteger(micros) && micros > 0 && micros <= 10000 * 1e6 ? micros : null;
};

export const monthlyAllowanceMicros = env => microsOf(env?.AI_MONTHLY_ALLOWANCE_USD);
export const legacyAllowanceMicros = env => microsOf(env?.AI_LEGACY_ALLOWANCE_USD);
// The first UTC month that gets the new default for everyone; null when unset or malformed.
export const allowanceCutoverPeriod = env => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(env?.AI_ALLOWANCE_CUTOVER_PERIOD ?? '').trim()) ? String(env.AI_ALLOWANCE_CUTOVER_PERIOD).trim() : null);
