import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Frame, CONTRACT_LIMITS } from '../../web/src/explain-program/contract.js';
import { loadEngine, runProgram } from '../../web/src/explain-program/runtime.js';
import { frameOverlaps } from '../../web/src/explain-program/frame-overlap.js';
import { generateProgram, TEMPLATES } from '../../web/src/interact-templates/generate.js';
import { registerFamily, INTERACT_FAMILIES } from '../src/interact-families.js';
import * as sceneTemplate from '../../web/src/interact-templates/stepper-scene.js';
import { stepperReferenceSource } from '../../web/src/interact-stepper-programs.js';
import { referenceModuleSource } from '../../../scripts/interact/stepper-reference-frames.mjs';
import { referenceComposition } from '../../web/src/interact-stepper-data.js';
import { stepperStates, referenceBrief, expandBrief, extractBrief } from '../../web/src/interact-family-stepper.js';
import { interactCapabilities } from '../../web/src/interact-control-catalogue.js';
import { parseScenePlan } from '../../web/src/interact-plan.js';
import { buildInput } from '../src/interact-build.js';
import { missingRows } from '../../../scripts/ci/gen-family-check-map.mjs';

const engine = await loadEngine();
const capabilities = await interactCapabilities({ renderers: ['program'], inputsV2: true });
const evaluate = (source, step) => {
  const out = runProgram(engine, { source, sdkVersion: 'sdk-8', operation: 'evaluate', request: { requestId: `step-${step}`, inputs: { step }, time: 0, seed: 1, state: null } });
  assert.equal(out.ok, true, JSON.stringify(out));
  return { ...out.value, frame: Frame.parse(out.value.frame) };
};
const proofDescriptor = () => stepperStates;

test('the scripted program is regenerated from the approved HTML with no production-part import', () => {
  const source = readFileSync(new URL('../../web/src/interact-stepper-programs.js', import.meta.url), 'utf8');
  assert.equal(source, referenceModuleSource());
  assert.doesNotMatch(source, /interact-templates/);
  assert.ok(Buffer.byteLength(stepperReferenceSource()) < CONTRACT_LIMITS.sourceBytes);
});

test('registered merge-sort Brief assembles into complete HTML-derived reference frames without a model', () => {
  const unregister = registerFamily(proofDescriptor());
  const originalFetch = globalThis.fetch;
  let modelCalls = 0;
  globalThis.fetch = () => { modelCalls++; throw new Error('The registered template proof must not call a provider or network'); };
  try {
    const brief = referenceBrief('merge-sort', 'brief');
    const plan = expandBrief(brief, 'brief', { catalogueHash: capabilities.catalogueHash });
    const program = generateProgram(plan, buildInput({}, plan, 'proof-only'));
    assert.ok(INTERACT_FAMILIES.some(family => family.id === stepperStates.id));
    assert.equal(TEMPLATES[plan.scene.template], sceneTemplate);
    assert.equal(program.manifest.inputs.length, 1);
    assert.equal(program.manifest.inputs[0].type, 'index');
    assert.equal(program.manifest.inputs[0].presentation, 'slider');
    assert.equal(program.manifest.inputs[0].items.length, 4);
    assert.equal(program.manifest.duration, undefined);
    assert.equal(program.manifest.timeline, undefined);
    assert.equal(plan.mode.timeline, null);
    assert.deepEqual(plan.scene.quantities, []);
    assert.deepEqual(plan.scene.slots, {});
    assert.deepEqual(extractBrief(plan), brief);
    assert.ok(Buffer.byteLength(program.source) < CONTRACT_LIMITS.sourceBytes);
    assert.ok(Buffer.byteLength(JSON.stringify(program.manifest)) < CONTRACT_LIMITS.manifestBytes);
    const rebuilt = expandBrief(extractBrief(plan), 'brief', { catalogueHash: capabilities.catalogueHash });
    const roundTrip = generateProgram(rebuilt, buildInput({}, rebuilt, 'proof-only'));
    const cases = [];
    for (let step = 0; step < referenceComposition('merge-sort', 'brief').data.variants[0].states.length; step++) {
      const actual = evaluate(program.source, step), expected = evaluate(stepperReferenceSource(), step);
      assert.deepEqual(actual, expected, `complete state ${step}`);
      assert.deepEqual(evaluate(roundTrip.source, step), actual, `round trip ${step}`);
      assert.deepEqual(frameOverlaps(actual.frame, 100), [], `layout ${step}`);
      cases.push({ step, stateId: plan.scene.data.data.variants[0].states[step].id, objects: actual.frame.objects.length,
        polylinePoints: actual.frame.objects.filter(object => object.kind === 'polyline').reduce((sum, object) => sum + object.points.length, 0),
        frameEqual: true, layoutProblems: 0 });
    }
    const receipt = JSON.parse(readFileSync(new URL('../../../docs/features/interact/references/stepper-merge-brief-proof.json', import.meta.url), 'utf8'));
    assert.deepEqual(receipt.cases, cases);
    assert.equal(receipt.sourceBytes, Buffer.byteLength(program.source));
    assert.equal(receipt.referenceSourceBytes, Buffer.byteLength(stepperReferenceSource()));
    assert.equal(receipt.manifestBytes, Buffer.byteLength(JSON.stringify(program.manifest)));
    assert.equal(receipt.modelCalls, modelCalls);
    assert.equal(modelCalls, 0);
  } finally { globalThis.fetch = originalFetch; unregister(); }
});

test('the family declares the six bound parts and all nine canonical composition data instances', () => {
  assert.deepEqual(Object.keys(stepperStates.parts), ['step-rail', 'fixed-picture', 'active-callout', 'readouts', 'ghost-previous', 'status-line']);
  for (const canonical of ['algorithm-over-collection', 'protocol-between-parties', 'cycle-of-phases']) {
    for (const depth of ['brief', 'balanced', 'detailed']) {
      assert.deepEqual(stepperStates.compositions[canonical][depth], referenceComposition(canonical, depth));
    }
  }
});

test('the pending family descriptor supplies CI rows even before built-in pick activation', () => {
  const map = JSON.parse(readFileSync(new URL('../../../scripts/ci/check-map.json', import.meta.url), 'utf8'));
  assert.deepEqual(missingRows(map, [stepperStates]), []);
});

test('typed ScenePlan admission is explicitly pending and is never replaced by JSON inside scene.words', () => {
  const unregister = registerFamily(proofDescriptor());
  try {
    const plan = expandBrief(referenceBrief('merge-sort', 'brief'), 'brief', { catalogueHash: capabilities.catalogueHash });
    const admitted = parseScenePlan(plan, capabilities);
    assert.equal(admitted.ok, false);
    assert.ok(admitted.problems.some(problem => problem.path === 'scene.data' && problem.code === 'unknown_field'), JSON.stringify(admitted.problems));
    assert.deepEqual(Object.keys(plan.scene.words).sort(), ['completed', 'current', 'heading', 'previous']);
    assert.ok(Object.values(plan.scene.words).every(word => word.length <= 40));
  } finally { unregister(); }
});
