// 5-field cron (min hour dom mon dow), UTC only. Supports * lists ranges steps.
// ponytail: no seconds, no @daily aliases, no timezones - add when someone asks.
const BOUNDS = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7], // 7 = sunday, normalized to 0
];

export function parseCron(expr) {
  const fields = String(expr).trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`need 5 fields (min hour day month weekday), got ${fields.length}`);
  return fields.map((field, i) => {
    const [lo, hi] = BOUNDS[i];
    const set = new Set();
    for (const part of field.split(',')) {
      const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
      if (!m || m[2] === '0') throw new Error(`bad field "${part}"`);
      const step = m[2] ? Number(m[2]) : 1;
      let [a, b] = m[1] === '*' ? [lo, hi] : m[1].split('-').map(Number);
      if (b === undefined) b = m[2] ? hi : a; // "5/10" means "5-59/10", plain "5" means just 5
      if (a < lo || b > hi || a > b) throw new Error(`"${part}" out of range ${lo}-${hi}`);
      for (let v = a; v <= b; v += step) set.add(i === 4 && v === 7 ? 0 : v);
    }
    return { set, star: field === '*' };
  });
}

export function matches(parsed, date) {
  const [min, hour, dom, mon, dow] = parsed;
  if (!min.set.has(date.getUTCMinutes()) || !hour.set.has(date.getUTCHours()) || !mon.set.has(date.getUTCMonth() + 1)) return false;
  const domOk = dom.set.has(date.getUTCDate());
  const dowOk = dow.set.has(date.getUTCDay());
  // standard cron: when both day fields are restricted, either one matching fires
  return !dom.star && !dow.star ? domOk || dowOk : domOk && dowOk;
}

// Next matching minute strictly after fromMs, as epoch ms. Scans by day (skips
// non-matching days at midnight), 4 years max - catches "0 0 30 2 *" at deploy time.
export function nextRun(parsed, fromMs) {
  const [min, hour, dom, mon, dow] = parsed;
  let t = Math.floor(fromMs / 60000) * 60000 + 60000;
  for (let guard = 0; guard < 4 * 366 * 1440; guard++, t += 60000) {
    const d = new Date(t);
    const domOk = dom.set.has(d.getUTCDate());
    const dowOk = dow.set.has(d.getUTCDay());
    const dayOk = mon.set.has(d.getUTCMonth() + 1) && (!dom.star && !dow.star ? domOk || dowOk : domOk && dowOk);
    if (!dayOk) {
      t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - 60000;
      continue;
    }
    if (min.set.has(d.getUTCMinutes()) && hour.set.has(d.getUTCHours())) return t;
  }
  throw new Error('never fires (checked 4 years ahead)');
}
