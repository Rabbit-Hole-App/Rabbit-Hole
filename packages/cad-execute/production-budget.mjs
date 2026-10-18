import { readFileSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { durableWrite, requirePersistentMount } from './pilot-budget.mjs';
const IDENTITY = 'rabbit-hole-cad-prod';
const MAXIMUM = 2 * 1024 ** 3;
// 600s execution + 5s launcher kill + 18s cleanup polls + 10s final callback,
// with 7s scheduling margin. Reserve both months for this complete wire window.
const EXECUTION_WINDOW_MS = 640000;
const month = (timestamp) => new Date(timestamp).toISOString().slice(0, 7);
export function productionConfig(env) {
  const file = env.CAD_PRODUCTION_LEDGER_FILE;
  const maximum = Number(env.CAD_PRODUCTION_MAX_BYTES);
  if (
    !file ||
    !isAbsolute(file) ||
    file.endsWith('/') ||
    !Number.isSafeInteger(maximum) ||
    maximum <= 0 ||
    maximum > MAXIMUM
  )
    throw Error('Invalid CAD production budget configuration');
  return { file, maximum };
}
export function initializeProduction(
  env,
  { verifyMount = requirePersistentMount, now = Date.now } = {},
) {
  const config = productionConfig(env);
  verifyMount(config.file);
  const timestamp = now();
  if (!Number.isFinite(timestamp)) throw Error('Invalid accounting clock');
  durableWrite(
    config.file,
    {
      schema: 'cad-production-budget/1',
      identity: IDENTITY,
      maximum: config.maximum,
      months: {},
      lastReservationAt: timestamp,
    },
    { exclusive: true },
  );
}
export class ProductionBudget {
  constructor(
    env,
    { verifyMount = requirePersistentMount, now = Date.now } = {},
  ) {
    this.config = productionConfig(env);
    this.alertToken = env.CAD_BUDGET_ALERT_TOKEN;
    this.now = now;
    verifyMount(this.config.file);
    try {
      const info = lstatSync(this.config.file);
      if (!info.isFile() || info.isSymbolicLink()) throw Error();
      this.state = JSON.parse(readFileSync(this.config.file, 'utf8'));
    } catch {
      throw Error(
        'CAD production ledger missing or invalid; explicit initialization required',
      );
    }
    const state = this.state;
    if (
      state.schema !== 'cad-production-budget/1' ||
      state.identity !== IDENTITY ||
      state.maximum !== this.config.maximum ||
      !Number.isFinite(state.lastReservationAt) ||
      !state.months ||
      Array.isArray(state.months) ||
      typeof state.months !== 'object'
    )
      throw Error('CAD production ledger identity or limits do not match');
    for (const [key, entry] of Object.entries(state.months)) {
      if (
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(key) ||
        !entry ||
        !Number.isSafeInteger(entry.reservedBytes) ||
        entry.reservedBytes < 0 ||
        entry.reservedBytes > state.maximum ||
        !Number.isSafeInteger(entry.reservations) ||
        entry.reservations < 0
      )
        throw Error('CAD production month accounting invalid');
    }
  }
  reserve(key, bytes) {
    const timestamp = this.now();
    if (!Number.isFinite(timestamp) || timestamp < this.state.lastReservationAt)
      throw Error('CAD accounting clock moved backwards');
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw Error('Invalid CAD transfer reservation');
    const allowance = bytes + 1024 ** 2;
    if (!Number.isSafeInteger(allowance))
      throw Error('Invalid CAD transfer reservation');
    const periods = [
      ...new Set([month(timestamp), month(timestamp + EXECUTION_WINDOW_MS)]),
    ];
    const next = structuredClone(this.state);
    for (const period of periods) {
      const entry = next.months[period] || {
        reservedBytes: 0,
        reservations: 0,
      };
      if (allowance > this.config.maximum - entry.reservedBytes) {
        this.deniedMonth = period;
        throw Error('production_egress_limit');
      }
      next.months[period] = {
        reservedBytes: entry.reservedBytes + allowance,
        reservations: entry.reservations + 1,
      };
    }
    next.lastReservationAt = timestamp;
    // Charge every redispatch and both possible months; no refunds or rollover reset.
    durableWrite(this.config.file, next);
    this.state = next;
  }
  async notifyExhausted() {
    const period = month(this.now());
    if (
      !this.deniedMonth ||
      !this.alertToken ||
      this.notifying ||
      this.state.notifiedMonths?.[period]
    )
      return;
    this.notifying = true;
    try {
      const response = await fetch(
        'https://digrabbithole.com/internal/cad-budget-alert',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.alertToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ month: period, kind: 'transfer' }),
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        },
      );
      await response.body?.cancel();
      if (!response.ok) return;
      const next = {
        ...this.state,
        notifiedMonths: { ...this.state.notifiedMonths, [period]: true },
      };
      durableWrite(this.config.file, next);
      this.state = next;
    } catch {
      /* Admission stays denied; retry notification on a later denial. */
    } finally {
      this.notifying = false;
    }
  }
  expired() {
    return false;
  }
  summary() {
    const period = month(this.now());
    const entry = this.state.months[period] || {
      reservedBytes: 0,
      reservations: 0,
    };
    return {
      mode: 'production',
      identity: IDENTITY,
      month: period,
      ...entry,
      maximumBytes: this.config.maximum,
    };
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (
    process.argv[2] !== 'init' ||
    process.env.CAD_BUDGET_MODE !== 'production'
  )
    throw Error('Use production mode and explicit init');
  initializeProduction(process.env);
  console.log(
    'CAD monthly production ledger initialized; existing ledgers are never reset',
  );
}
