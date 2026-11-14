// Brief 22 task 2: a per-card frame object budget. A plan's scene.runtime may declare `frameObjects` (60 to the hard maximum, explain-program/frame-budget.js); the plan hash binds it, the template generator
// writes it into the sealed manifest, the composition refuses a program whose manifest differs, and the program contract (parseGuestResult, normalizeFrame) and the scene gate read it. A plan that
// does not declare it keeps 60 and every byte it had before. The sdk-8 fingerprint does not read any of this (stamps.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { parseScenePlan, planHash } from '../../web/src/interact-plan.js';
import { validateCompositionBindings } from '../../web/src/interact-composition.js';
import { parseGuestResult, parseFrame, parseManifest } from '../../web/src/explain-program/contract.js';
import { normalizeFrame } from '../../web/src/explain-program/frame.js';
import { FRAME_OBJECTS_DEFAULT, FRAME_OBJECTS_HARD_MAX } from '../../web/src/explain-program/frame-budget.js';
import { sdkFingerprint } from '../../web/src/explain-program/sdk.js';
import { SDK_FINGERPRINT } from '../../web/src/explain-program/stamps.js';
import { buildTemplate } from '../src/interact-template.js';
import { fixtureContext } from '../src/interact-fixtures.js';
import { clone } from './interact-design-fixture.js';

const fixtures = await interactFixtures(), capabilities = fixtures.referenceCapabilities, noModels = { ...fixtureContext(), adapters: {}, adapter: undefined };
const MAX = FRAME_OBJECTS_HARD_MAX, withBudget = (plan, n) => { const copy = clone(plan); copy.scene.runtime.frameObjects = n; return copy; };
const frameOf = n => ({ width: 960, height: 540, readouts: [], objects: Array.from({ length: n }, (_, i) => ({ kind: 'box', id: `box.${i}`, x: 10 + (i % 20) * 40, y: 10 + Math.floor(i / 20) * 20, w: 30, h: 12, role: 'neutral', opacity: 1, rotation: 0 })) });
const BASE_MANIFEST = { title: 't', summary: 's', assumptions: [], description: 'd', inputs: [], readouts: [], capabilities: [] };

test('the hard maximum is a number the measurement chose, the default is 60 and sdk-8 does not read either', async () => {
  assert.equal(FRAME_OBJECTS_DEFAULT, 60); assert.ok(MAX > 60 && MAX <= 160, `the hard maximum ${MAX} is between the default and the 160 the brief started from`);
  assert.equal(await sdkFingerprint(), SDK_FINGERPRINT, 'the SDK_SOURCE fingerprint is unchanged by the frame budget');
});

test('a plan declares frameObjects up to the hard maximum; above it or below the default it is refused with a plain line; the plan hash binds it', async () => {
  const plan = fixtures.referencePlans.tossOverview;
  assert.equal(parseScenePlan(plan, capabilities).ok, true, 'an undeclared budget is the plan as before');
  assert.equal(parseScenePlan(withBudget(plan, MAX), capabilities).ok, true);
  assert.equal(parseScenePlan(withBudget(plan, 60), capabilities).ok, true);
  const over = parseScenePlan(withBudget(plan, MAX + 1), capabilities);
  assert.equal(over.ok, false); assert.match(JSON.stringify(over.problems), new RegExp(`frameObjects is at most ${MAX} objects per frame`));
  assert.equal(parseScenePlan(withBudget(plan, 59), capabilities).ok, false);
  assert.equal(parseScenePlan(withBudget(plan, 100.5), capabilities).ok, false);
  assert.notEqual(await planHash(withBudget(plan, 100)), await planHash(plan), 'the approved plan is the plan that runs: the declared budget changes the hash');
  assert.equal(await planHash(clone(plan)), await planHash(plan), 'an undeclared budget leaves the hash as it was');
});

test('the template build carries the declared budget in the sealed manifest; a plan without it carries none', async () => {
  const base = fixtures.referencePlans.tossOverview, declared = withBudget(base, 100);
  const built = await buildTemplate({ id: 'budget-declared', plan: declared, planHash: await planHash(declared), capabilities }, noModels);
  assert.ok(built.artifacts, JSON.stringify(built.problems ?? built.details));
  assert.equal(built.artifacts.main.program.manifest.frameObjects, 100);
  assert.equal(parseManifest(built.artifacts.main.program.manifest, built.artifacts.main.program.schemaVersion).ok, true, 'the manifest schema takes the budget');
  const plain = await buildTemplate({ id: 'budget-undeclared', plan: base, planHash: await planHash(base), capabilities }, noModels);
  assert.ok(plain.artifacts); assert.equal('frameObjects' in plain.artifacts.main.program.manifest, false);
  assert.deepEqual(validateCompositionBindings(declared, built.artifacts), [], 'the approved budget and the sealed one agree');
});

test('the composition refuses a program sealed with a different budget than the plan approved', async () => {
  const declared = withBudget(fixtures.referencePlans.tossOverview, 100);
  const built = await buildTemplate({ id: 'budget-mismatch', plan: declared, planHash: await planHash(declared), capabilities }, noModels);
  const tampered = clone(built.artifacts); tampered.main.program.manifest.frameObjects = 80;
  assert.match(JSON.stringify(validateCompositionBindings(declared, tampered)), /frame_budget_mismatch/);
  const dropped = clone(built.artifacts); delete dropped.main.program.manifest.frameObjects;
  assert.match(JSON.stringify(validateCompositionBindings(declared, dropped)), /frame_budget_mismatch/, 'a program that does not carry the approved budget is refused too');
});

test('the program contract: the default budget refuses 61 objects; a manifest budget passes max-10 and refuses max+1, in parseGuestResult and parseFrame; normalizeFrame keeps the 60 of the scene gate', () => {
  const result = frame => ({ frame, quantities: {} });
  assert.equal(parseGuestResult(result(frameOf(60)), BASE_MANIFEST).ok, true);
  const sixtyOne = parseGuestResult(result(frameOf(61)), BASE_MANIFEST);
  assert.equal(sixtyOne.ok, false); assert.match(sixtyOne.issue, /objects/);
  assert.equal(parseGuestResult(result(frameOf(61)), null).ok, false, 'no manifest is the default budget');
  const budgeted = { ...BASE_MANIFEST, frameObjects: MAX };
  assert.equal(parseGuestResult(result(frameOf(MAX - 10)), budgeted).ok, true, `${MAX - 10} objects pass a ${MAX} budget`);
  assert.equal(parseGuestResult(result(frameOf(MAX)), budgeted).ok, true);
  assert.equal(parseGuestResult(result(frameOf(MAX + 1)), budgeted).ok, false, `${MAX + 1} objects fail a ${MAX} budget`);
  assert.equal(parseGuestResult(result(frameOf(MAX - 10)), { ...BASE_MANIFEST, frameObjects: 70 }).ok, false, 'a smaller declared budget is the limit');
  assert.equal(parseGuestResult(result(frameOf(70)), { ...BASE_MANIFEST, frameObjects: MAX + 50 }).ok, false, 'a budget above the hard maximum is not honoured (the default applies)');
  assert.equal(parseFrame(frameOf(61)).ok, false); assert.equal(parseFrame(frameOf(MAX), budgeted).ok, true);
  assert.equal(normalizeFrame(frameOf(61), BASE_MANIFEST).ok, false, 'the card path (manifest without a budget) still stops at 60 objects');
  // ponytail: the card's own scene gate (validateScene in animation-scene.js, a file the static-render fingerprint hashes) still caps a drawn frame at 60: raising it needs the one-line patch in
  // evidence/2026-11-14-frame-budget/scene-gate.patch and re-fingerprinted static renders (an owner decision). This assertion flips when that lands.
  const gated = normalizeFrame(frameOf(MAX - 10), budgeted);
  assert.equal(gated.ok, false); assert.match(gated.issue, /at most 60/);
});
