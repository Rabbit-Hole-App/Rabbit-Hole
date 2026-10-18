import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PilotBudget,
  initializePilot,
  pilotConfig,
  requirePersistentMount,
  configuredBudget,
} from './pilot-budget.mjs';
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'cad-pilot-'));
  const now = () => Date.parse('2030-01-01T00:00:00Z');
  const env = {
    CAD_BUDGET_MODE: 'pilot',
    CAD_PILOT_ID: 'pilot-one',
    CAD_PILOT_STARTED_AT: '2030-01-01T00:00:00Z',
    CAD_PILOT_DEADLINE: '2030-01-31T00:00:00Z',
    CAD_PILOT_MAX_BYTES: String(3 * 1024 ** 2),
    CAD_PILOT_LEDGER_FILE: join(dir, 'usage.json'),
  };
  try {
    run(env, { now, verifyMount: () => {} });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test('pilot requires explicit initialization; reservations survive restart; initializer cannot reset', () =>
  fixture((env, options) => {
    assert.throws(() => new PilotBudget(env, options), /initialization/);
    initializePilot(env, options);
    const a = new PilotBudget(env, options);
    a.reserve('first', 10);
    const b = new PilotBudget(env, options);
    assert.equal(b.summary().reservedBytes, 1048586);
    b.reserve('first', 10);
    assert.equal(b.summary().reservations, 2);
    assert.throws(() => b.reserve('third', 10), /egress_limit/);
    assert.throws(() => initializePilot(env, options), /EEXIST/);
    assert.equal(
      new PilotBudget(env, options).summary().reservedBytes,
      2097172,
    );
  }));
test('pilot rejects invalid caps and terms, changed identity, corrupt or missing ledger', () =>
  fixture((env, options) => {
    for (const value of [
      '0',
      '-1',
      'NaN',
      'Infinity',
      '1.1',
      '9007199254740992',
    ])
      assert.throws(
        () => pilotConfig({ ...env, CAD_PILOT_MAX_BYTES: value }),
        /configuration/,
      );
    assert.throws(
      () => pilotConfig({ ...env, CAD_PILOT_DEADLINE: '2030-02-01T00:00:00Z' }),
      /configuration/,
    );
    initializePilot(env, options);
    assert.throws(
      () => new PilotBudget({ ...env, CAD_PILOT_ID: 'another' }, options),
      /does not match/,
    );
    writeFileSync(env.CAD_PILOT_LEDGER_FILE, 'broken');
    assert.throws(() => new PilotBudget(env, options), /invalid/);
  }));
test('pilot refuses pre-start, deadline margin, and invalid reservation without modifying ledger', () =>
  fixture((env, options) => {
    initializePilot(env, options);
    const before = readFileSync(env.CAD_PILOT_LEDGER_FILE, 'utf8');
    const b = new PilotBudget(env, {
      ...options,
      now: () => Date.parse(env.CAD_PILOT_DEADLINE) - 600000,
    });
    assert.throws(() => b.reserve('one', 1), /expired/);
    const p = new PilotBudget(env, {
      ...options,
      now: () => Date.parse(env.CAD_PILOT_STARTED_AT) - 1,
    });
    assert.throws(() => p.reserve('one', 1), /expired/);
    const a = new PilotBudget(env, options);
    assert.throws(() => a.reserve('one', -1), /Invalid/);
    assert.equal(readFileSync(env.CAD_PILOT_LEDGER_FILE, 'utf8'), before);
  }));
test('persistent mount guard rejects rootfs and ephemeral mount; config cannot silently fallback', () => {
  assert.throws(
    () =>
      requirePersistentMount(
        '/var/cad/budget/usage.json',
        '1 0 0:1 / / rw - ext4 /dev/vda rw',
      ),
    /persistent volume/,
  );
  assert.throws(
    () =>
      requirePersistentMount(
        '/var/cad/budget/usage.json',
        '1 0 0:1 / /var/cad/budget rw - tmpfs tmpfs rw',
      ),
    /persistent volume/,
  );
  assert.throws(
    () => configuredBudget({ CAD_BUDGET_MODE: 'production' }),
    /Unknown/,
  );
});
