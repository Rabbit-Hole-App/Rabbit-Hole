import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLUEPRINT_FAILED_MESSAGE, authorDesign, freshDesign } from '../src/interact-design.js';
import { InteractModelError } from '../src/interact-model-adapters.js';
import { ExplainJobs } from '../src/explain-job.js';

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

// Release brief follow-up (owner, 2026-11-24): the second place. A template build (the fast template path and the blueprint card) that fails a check stops as template_error with the same fixed wording; the problem keeps its text in the job record.
test('a template build that fails a check stops with fixed wording: no check code, case name or engine text; the problem stays in the job record', async () => {
  const problem = '[program_error] the program failed at "endpoint" (runtime_limit): time limit';
  let stopped = null;
  const self = { state: { storage: { put: async () => {}, delete: async () => {} } }, stopWith: async (job, stopReason, category, message) => { stopped = { stopReason, category, message }; }, repairOrStop: async () => { throw new Error('a template build has no repair loop'); }, recordRenders: async () => {} };
  const job = { id: 'ej_test', round: 1, findings: [], build: { kind: 'template' }, timing: { stages: [] } };
  await ExplainJobs.prototype.applyBuild.call(self, job, 'rendering', { ms: { run: 1, check: 1 }, problems: [problem], renders: [] });
  assert.deepEqual([stopped.stopReason, stopped.category, stopped.message], ['template_error', 'spec', BLUEPRINT_FAILED_MESSAGE]);
  assert.doesNotMatch(stopped.message, /program_error|runtime_limit|endpoint|time limit|\[|\]/);
  assert.deepEqual(job.findings.at(-1).problems, [problem], 'the detail is in job.findings (owner diagnostics, the ledger repairCauses)');
  assert.deepEqual(job.build.failure.problems, [problem], 'and in job.build.failure');
});
