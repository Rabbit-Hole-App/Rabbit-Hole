// Contract tests for the draft roadmap limits (src/roadmap/roadmap-policy.js; contracts/planning.md 13). Pure and offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/roadmap/roadmap-policy.js';
import { DEPTHS } from '../src/roadmap/roadmap-contract.js';

const L = P.ROADMAP_LIMITS;
const clone = () => JSON.parse(JSON.stringify(L));

test('the shipped policy is internally consistent and versioned', () => {
  assert.deepEqual(P.validateLimits(), []);
  assert.equal(L.version, P.ROADMAP_POLICY_VERSION);
  assert.ok(Object.isFrozen(L) && Object.isFrozen(L.deadlineMs) && Object.isFrozen(L.stepCeiling), 'the policy cannot be edited at run time');
});

test('step ceilings are provisional maxima by Depth, cards per step start at one', () => {
  assert.deepEqual(L.stepCeiling, { overview: 5, standard: 10, deep: 15 });
  for (const d of DEPTHS) assert.equal(P.ceilingFor(d), L.stepCeiling[d]);
  assert.equal(P.ceilingFor('nonsense'), 10, 'an unknown Depth reads as standard');
  assert.equal(L.cardsPerStep.ceiling, 3);
  assert.equal(L.cardsPerStep.r4Default, 1);
  assert.match(P.LIMIT_BASIS.stepCeiling[1], /not quotas/);
});

test('every numeric limit says whether it is existing (with its source) or proposed', () => {
  for (const path of P.leafPaths()) assert.ok(P.basisOf(path), `${path} has no basis`);
  for (const path of ['source.passageChars', 'source.instructionChars', 'source.requestBodyBytes', 'maxTokens.artifact', 'calls.generationPerCard',
    'deadlineMs.safetyFetch', 'retries.safetyFetch', 'hold.artifactSeconds']) assert.equal(P.basisOf(path).status, 'existing', path);
  for (const path of ['source.chars', 'deadlineMs.draft', 'quotas.perHour.plan', 'stepCeiling.deep']) assert.equal(P.basisOf(path).status, 'proposed', path);
});

test('the overall checking deadline includes the admitted screening retry and the adjudication', () => {
  // askJev retries a 429/529 once after at most 1 s and each fetch has the 20 s timeout: one screen is 41 s, not 20 s and not 30 s.
  assert.equal(P.safetyScreenMs(), 20000 * 2 + 1000);
  assert.equal(P.checkingBudgetMs(), 30000 * 2 + 41000 + 45000);
  assert.ok(L.deadlineMs.checking >= P.checkingBudgetMs());
  assert.ok(L.deadlineMs.checking > L.deadlineMs.safetyFetch * 2, 'two 20 s fetches alone already exceed any 30 s envelope');
  assert.ok(L.deadlineMs.readiness >= L.deadlineMs.proposal + P.checkingBudgetMs());
  assert.ok(L.deadlineMs.stepWork >= P.stepWorkBudgetMs());
  assert.ok(L.deadlineMs.stepWork < L.hold.artifactSeconds * 1000 / 2, 'the step stays inside the usage hold window');
});

test('a policy whose deadline hides an unaccounted retry or adjudication is refused', () => {
  const noRetryRoom = clone(); noRetryRoom.deadlineMs.checking = 60000;
  assert.ok(P.validateLimits(noRetryRoom).some(p => /checking deadline/.test(p)));
  const thirty = clone(); thirty.deadlineMs.readiness = 30000;
  assert.ok(P.validateLimits(thirty).some(p => /readiness deadline/.test(p)), 'a 30 s whole-proposal promise cannot hold repeated 20 s screens');
  const longer = clone(); longer.deadlineMs.adjudication = 120000;
  assert.ok(P.validateLimits(longer).some(p => /checking deadline/.test(p)), 'raising one stage forces the overall deadline up');
  const more = clone(); more.retries.safetyFetch = 2;
  assert.ok(P.validateLimits(more).some(p => /checking deadline/.test(p)));
  const hold = clone(); hold.deadlineMs.stepWork = 3600000;
  assert.ok(P.validateLimits(hold).some(p => /hold window/.test(p)));
});

test('bounds a step depends on are consistent', () => {
  const big = clone(); big.source.passageChars = 9000;
  assert.ok(P.validateLimits(big).some(p => /adapter context cap/.test(p)));
  const small = clone(); small.source.chars = 4000;
  assert.ok(P.validateLimits(small).some(p => /source bound/.test(p)));
  const retries = clone(); retries.calls.automaticRetriesPerCard = 2;
  assert.ok(P.validateLimits(retries).some(p => /one automatic retry/.test(p)));
  const ceilings = clone(); ceilings.stepCeiling.standard = 3;
  assert.ok(P.validateLimits(ceilings).some(p => /grow with Depth/.test(p)));
  const bad = clone(); bad.quotas.perHour.plan = -1;
  assert.ok(P.validateLimits(bad).some(p => /non-negative/.test(p)));
});

test('the 1 to 2 second next-proposal target is a measurement, not a limit', () => {
  assert.ok(!('nextProposalTargetMs' in L.deadlineMs));
  assert.ok(Math.min(...Object.values(L.deadlineMs)) >= 1000);
});
