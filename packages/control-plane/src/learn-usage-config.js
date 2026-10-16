// The one reader of AI_MONTHLY_ALLOWANCE_USD (owner D3, 2026-10-16): every allowance figure comes from here, never a literal.
// A finite decimal above 0 and at most 10000 USD; anything else is invalid, and invalid never means unlimited.
// Phase 1 only reports it (GET /api/learn/usage); nothing enforces it yet.
const DECIMAL = /^\d+(\.\d{1,6})?$/;

// -> integer micro-USD, or null when missing or invalid.
export function monthlyAllowanceMicros(env) {
  const raw = env?.AI_MONTHLY_ALLOWANCE_USD;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim();
  if (!DECIMAL.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  // Integer arithmetic on the digits, so no float ever reaches the amount.
  const micros = Number(whole) * 1e6 + Number(fraction.padEnd(6, '0'));
  return Number.isSafeInteger(micros) && micros > 0 && micros <= 10000 * 1e6 ? micros : null;
}
