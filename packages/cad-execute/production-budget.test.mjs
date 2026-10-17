import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ProductionBudget,
  initializeProduction,
  productionConfig,
} from './production-budget.mjs';
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'cad-month-'));
  let time = Date.parse('2030-01-15T00:00:00Z');
  const env = {
    CAD_PRODUCTION_LEDGER_FILE: join(dir, 'production.json'),
    CAD_PRODUCTION_MAX_BYTES: String(3 * 1024 ** 2),
  };
  const options = { verifyMount: () => {}, now: () => time };
  try {
    run(env, options, (t) => (time = Date.parse(t)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test('explicit initialization and restart preserve reservations and prevent overwrite', () =>
  fixture((env, opt) => {
    assert.throws(() => new ProductionBudget(env, opt), /initialization/);
    initializeProduction(env, opt);
    const a = new ProductionBudget(env, opt);
    a.reserve('one', 10);
    const b = new ProductionBudget(env, opt);
    assert.equal(b.summary().reservedBytes, 1048586);
    assert.throws(() => initializeProduction(env, opt), /EEXIST/);
    b.reserve('one', 10);
    assert.throws(() => b.reserve('three', 10), /egress_limit/);
    assert.equal(b.expired(), false);
  }));
test('UTC month rollover preserves historical amounts and starts authorized new allowance', () =>
  fixture((env, opt, set) => {
    initializeProduction(env, opt);
    const a = new ProductionBudget(env, opt);
    a.reserve('jan', 1);
    set('2030-02-01T00:00:00Z');
    const b = new ProductionBudget(env, opt);
    assert.equal(b.summary().reservedBytes, 0);
    b.reserve('feb', 2);
    const state = JSON.parse(readFileSync(env.CAD_PRODUCTION_LEDGER_FILE));
    assert.equal(state.months['2030-01'].reservedBytes, 1048577);
    assert.equal(state.months['2030-02'].reservedBytes, 1048578);
  }));
test('pending cross-month attempt charges both months atomically and survives restart', () =>
  fixture((env, opt, set) => {
    set('2030-12-31T23:55:00Z');
    initializeProduction(env, opt);
    const a = new ProductionBudget(env, opt);
    a.reserve('cross', 10);
    set('2031-01-01T00:00:00Z');
    const b = new ProductionBudget(env, opt);
    assert.equal(b.summary().reservedBytes, 1048586);
    b.reserve('next', 10);
    const before = readFileSync(env.CAD_PRODUCTION_LEDGER_FILE, 'utf8');
    assert.throws(() => b.reserve('over', 10), /egress_limit/);
    assert.equal(readFileSync(env.CAD_PRODUCTION_LEDGER_FILE, 'utf8'), before);
  }));
test('invalid caps, changed identity/cap, malformed ledger and backwards time fail closed', () =>
  fixture((env, opt, set) => {
    for (const cap of ['0', '-1', 'NaN', '1.5', String(2 * 1024 ** 3 + 1)])
      assert.throws(
        () => productionConfig({ ...env, CAD_PRODUCTION_MAX_BYTES: cap }),
        /configuration/,
      );
    initializeProduction(env, opt);
    assert.throws(
      () =>
        new ProductionBudget({ ...env, CAD_PRODUCTION_MAX_BYTES: '10' }, opt),
      /identity/,
    );
    const b = new ProductionBudget(env, opt);
    set('2029-12-31T23:59:00Z');
    assert.throws(() => b.reserve('old', 1), /backwards/);
    const state = JSON.parse(readFileSync(env.CAD_PRODUCTION_LEDGER_FILE));
    state.identity = 'other';
    writeFileSync(env.CAD_PRODUCTION_LEDGER_FILE, JSON.stringify(state));
    assert.throws(() => new ProductionBudget(env, opt), /identity/);
  }));
test('full next month refuses cross-month reservation without charging current month', () =>
  fixture((env, opt, set) => {
    initializeProduction(env, opt);
    const state = JSON.parse(readFileSync(env.CAD_PRODUCTION_LEDGER_FILE));
    state.months['2030-02'] = { reservedBytes: state.maximum, reservations: 3 };
    writeFileSync(env.CAD_PRODUCTION_LEDGER_FILE, JSON.stringify(state));
    set('2030-01-31T23:59:00Z');
    const b = new ProductionBudget(env, opt);
    const before = readFileSync(env.CAD_PRODUCTION_LEDGER_FILE, 'utf8');
    assert.throws(() => b.reserve('cross', 1), /egress_limit/);
    assert.equal(readFileSync(env.CAD_PRODUCTION_LEDGER_FILE, 'utf8'), before);
  }));
test('notification retries failures, persists successful deduplication, and never refunds denied transfer', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cad-notify-'));
  const original = globalThis.fetch;
  const env = {
    CAD_PRODUCTION_LEDGER_FILE: join(dir, 'production.json'),
    CAD_PRODUCTION_MAX_BYTES: String(1024 ** 2),
    CAD_BUDGET_ALERT_TOKEN: 'x'.repeat(32),
  };
  const options = {
    verifyMount: () => {},
    now: () => Date.parse('2030-01-15T00:00:00Z'),
  };
  const requests = [];
  let fail = true;
  globalThis.fetch = async (url, request) => {
    requests.push([url, request]);
    return new Response('', { status: fail ? 503 : 200 });
  };
  try {
    initializeProduction(env, options);
    const budget = new ProductionBudget(env, options);
    assert.throws(() => budget.reserve('too-large', 1), /egress_limit/);
    await budget.notifyExhausted();
    assert.equal(requests.length, 1);
    fail = false;
    await budget.notifyExhausted();
    assert.equal(requests.length, 2);
    const restored = new ProductionBudget(env, options);
    assert.throws(() => restored.reserve('again', 1), /egress_limit/);
    await restored.notifyExhausted();
    assert.equal(requests.length, 2);
    assert.equal(restored.summary().reservedBytes, 0);
    assert.deepEqual(JSON.parse(requests[0][1].body), {
      month: '2030-01',
      kind: 'transfer',
    });
    assert.equal(requests[0][1].redirect, 'error');
    assert.equal(
      requests[0][0],
      'https://digrabbithole.com/internal/cad-budget-alert',
    );
    assert.equal(
      readFileSync(env.CAD_PRODUCTION_LEDGER_FILE, 'utf8').includes(
        env.CAD_BUDGET_ALERT_TOKEN,
      ),
      false,
    );
  } finally {
    globalThis.fetch = original;
    rmSync(dir, { recursive: true, force: true });
  }
});
