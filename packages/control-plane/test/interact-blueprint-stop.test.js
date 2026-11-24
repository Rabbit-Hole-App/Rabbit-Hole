import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLUEPRINT_FAILED_MESSAGE, authorDesign, freshDesign } from '../src/interact-design.js';
import { InteractModelError } from '../src/interact-model-adapters.js';

// Release brief (owner, 2026-11-24): a failed blueprint design stops the job with fixed wording; the learner never reads a model name, a role id, a status or a provider's billing text. The detail stays in the design record.
test('a provider failure in the blueprint path stops with fixed wording and keeps the detail in the record', async () => {
  const providerText = 'gemini-4-hydrogen for blueprint_quantities failed (HTTP 402). Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.';
  const job = { id: 'ej_test', prompt: 'what changes a pendulum swing', depth: 'detailed', flow: { seed: 7 }, design: freshDesign() };
  const ctx = { designKind: 'blueprint', env: {}, interact: async () => { throw new InteractModelError('http_error', providerText, { sent: true, providerStatus: 402 }); } };
  const out = await authorDesign(job, ctx);
  assert.equal(out.stop.reason, 'design_invalid');
  assert.equal(out.stop.message, BLUEPRINT_FAILED_MESSAGE);
  assert.doesNotMatch(out.stop.message, /gemini|hydrogen|blueprint_|quantities|HTTP|402|billing|credit|AI Studio/i);
  assert.equal(out.blueprint.passed, false);
  assert.match(JSON.stringify(out.blueprint), /HTTP 402/, 'the detail is kept in the record for the owner');
});
