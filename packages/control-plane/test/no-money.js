// Users see AI credits only (owner 2026-10-25; CLAUDE.md "Standing owner rules"): a user-facing response carries no dollar amount,
// no dollar micros and no currency. -> the paths of every offending key or string in a JSON value, [] when clean. A key is
// offending when it names money (usd, micros, currency, dollar, cents, price in dollars); a string when it holds a dollar amount.
const KEY = /(^|[_-])(usd|micros|currency|dollars?|cents)([_-]|$)|(Usd|USD|Micros|Currency|Dollars?|Cents)([A-Z_]|$)/;
const AMOUNT = /\$\s*\d|\b\d+(\.\d+)?\s*(USD|dollars?)\b|\bUSD\b/i;
export function moneyLeaks(value, path = '$') {
  if (Array.isArray(value)) return value.flatMap((item, index) => moneyLeaks(item, `${path}[${index}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => [...(KEY.test(key) ? [`${path}.${key}`] : []), ...moneyLeaks(item, `${path}.${key}`)]);
  return typeof value === 'string' && AMOUNT.test(value) ? [`${path} = ${JSON.stringify(value.slice(0, 60))}`] : [];
}

// Test-side only: a credits body read back in the ledger's micros (1 credit = 10,000), so a test can compare it with ledger rows.
export const ledgerMicros = body => (body && body.allowanceCredits !== undefined ? { ...body,
  allowanceMicros: Math.round(body.allowanceCredits * 10_000), usedMicros: Math.round(body.usedCredits * 10_000), reservedMicros: Math.round(body.reservedCredits * 10_000),
  estimatedMicros: Math.round(body.estimatedCredits * 10_000), remainingMicros: Math.round(body.remainingCredits * 10_000) } : body);
