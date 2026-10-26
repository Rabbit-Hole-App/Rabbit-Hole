// Users see AI credits only (owner 2026-10-25; CLAUDE.md "Standing owner rules"). A scan of the user-facing response shapes that
// can be built without a Worker: no key naming dollars, micros or a currency and no dollar amount in any string. The endpoints that
// need a Durable Object or a stack are scanned in their own tests with the same helper (no-money.js): /api/learn/usage in
// learn-usage.test.js, the requester's image-job view in image-jobs.test.js, the inline code quote and job in inline-code-*.test.js,
// the inline image quote in inline-image-jobs.test.js, the Motion list in motion-allowance.test.js and motion-recovery.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCadJob } from '../src/cad-contract.js';
import { refusalBody } from '../src/learn-spend-ledger.js';
import { moneyLeaks, ledgerMicros } from './no-money.js';

test('the scanner itself: it names a money key, a micros key, a currency and a dollar string, and passes credits', () => {
  const leaks = moneyLeaks({ costUsd: 1, reservedMicros: 2, currency: 'EUR', text: 'Cost $4.50', list: [{ cost_usd: 0 }] });
  assert.deepEqual(leaks.sort(), ['$.costUsd', '$.currency', '$.list[0].cost_usd', '$.reservedMicros', '$.text = "Cost $4.50"']);
  assert.deepEqual(moneyLeaks({ allowanceCredits: 2500, estimate_credits: 12, reserve_credits: 40, usedCredits: 0.3, message: 'Not enough AI credits. Renews on October 31, 5:00 PM PDT.' }), []);
  assert.equal(ledgerMicros({ allowanceCredits: 1, usedCredits: 0, reservedCredits: 0, estimatedCredits: 0, remainingCredits: 1 }).allowanceMicros, 10_000);
});

test('a CAD job as the browser sees it carries no per-phase dollars', () => {
  const job = { id: 'cad_1', state: 'building', stage: 'building', attempt: 1, calls: 3, reservedUsd: 0.31, phaseUsd: { interpretation: 0.05, generation: 0.2 }, limits: { calls: 6, usd: 0.6 } };
  assert.deepEqual(moneyLeaks(publicCadJob(job)), []);
});

test('every allowance refusal body names a reason and a renewal time and no amount', () => {
  for (const reason of ['allowance_exhausted', 'allowance_insufficient', 'allowance_reserved', 'allowance_unavailable', 'payer_unavailable', 'daily_cap_reached', 'cap_unset']) {
    assert.deepEqual(moneyLeaks(refusalBody({ reason, period: '2026-10' })), [], reason);
  }
});
