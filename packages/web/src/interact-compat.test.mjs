// I3 (docs/features/interact.md INT-10-C04, INT-12-C02): exact SDK compatibility. Every program tuple the host runs still runs (the legacy sdk-1 sealings
// included), a composed card runs only on the tuple its plan approved, and the card and the capture page ask the program for the same frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgramHost } from './explain-program/host.js';
import { LIMITS } from './explain-program/limits.js';
import { loadEngine, runProgram } from './explain-program/runtime.js';
import { sealProgram } from './explain-program/contract.js';
import { SUPPORTED_PROGRAM_TUPLES } from './explain-program/stamps.js';
import { evaluateRequestFor } from './explain-program/program-card.js';
import { FIXTURE_DRAFTS, sealEnvelope } from './interact-build-fixtures.js';
import { interactFixtures } from './interact-plan-fixtures.js';
import { compileCardComposition, validateCompositionBindings } from './interact-composition.js';

const engine = loadEngine();
const standIn = () => {
  const worker = {
    terminate() { worker.dead = true; },
    postMessage({ id, operation, source, request, sdkVersion }) { engine.then(e => { const out = runProgram(e, { source, request, operation, sdkVersion }, { ...LIMITS, interruptMs: 400 }); setTimeout(() => !worker.dead && worker.onmessage?.({ data: { id, ...out } }), 0); }); },
  };
  engine.then(() => setTimeout(() => worker.onmessage?.({ data: { ready: true } }), 0));
  return worker;
};

const bundle = { manifest: { title: 'Compat', summary: 'One text.', assumptions: [], description: 'One line of text.', inputs: [], readouts: [], capabilities: [] },
  source: "export function evaluate() { return { frame: { width: 640, height: 400, objects: [{ kind: 'text', id: 't', x: 20, y: 30, text: 'compatible' }], readouts: [] }, quantities: {} }; }" };

test('every supported schema 1 tuple, the legacy sdk-1 sealings included, still runs a program through the real host', async () => {
  const tuples = SUPPORTED_PROGRAM_TUPLES.filter(t => t.schemaVersion === 1);
  assert.ok(tuples.some(t => t.sdkVersion === 'sdk-1') && tuples.some(t => t.sdkVersion === 'sdk-2'), 'both SDK generations are supported side by side');
  for (const tuple of tuples) {
    const sealed = await sealProgram(bundle, tuple);
    assert.equal(sealed.ok, true, `${tuple.sdkVersion} ${tuple.runtimeVersion}: ${sealed.issue}`);
    const host = createProgramHost({ artifact: sealed.value, createWorker: standIn });
    try {
      const reply = await host.evaluate({ requestId: 'r', inputs: {}, time: 0, seed: 0, state: null });
      assert.equal(reply.frame.objects[0].text, 'compatible', `${tuple.sdkVersion} runs`);
    } finally { host.dispose(); }
  }
  const tampered = await sealProgram(bundle, { ...tuples[0], sdkVersion: 'sdk-9' });
  const host = createProgramHost({ artifact: tampered.ok ? tampered.value : { ...(await sealProgram(bundle, tuples[0])).value, sdkVersion: 'sdk-9' }, createWorker: standIn });
  await assert.rejects(host.evaluate({ requestId: 'r', inputs: {}, time: 0, seed: 0, state: null }), error => error.code === 'version_unavailable' || error.code === 'invalid_program', 'a tuple the host does not list never runs');
  host.dispose();
});

test('a composed card runs only on the tuple its plan approved: a program sealed with another SDK is refused rather than switched', async () => {
  const { plans } = await interactFixtures();
  const draft = structuredClone(FIXTURE_DRAFTS.standard), approved = await sealEnvelope(draft);
  assert.deepEqual(validateCompositionBindings(plans.standard, approved), [], 'the approved sdk-2 sealing passes');
  for (const tuple of SUPPORTED_PROGRAM_TUPLES.filter(t => t.schemaVersion === 1 && t.sdkVersion !== plans.standard.scene.runtime.sdkVersion)) {
    const other = await sealProgram(draft.main.program, tuple);
    assert.equal(other.ok, true);
    const problems = validateCompositionBindings(plans.standard, { ...approved, main: { kind: 'program', program: other.value } });
    assert.ok(problems.some(p => p.code === 'tuple_mismatch'), `${tuple.sdkVersion} ${tuple.runtimeVersion} was refused as a tuple mismatch, got ${problems.map(p => p.code).join(', ')}`);
  }
});

test('the card and the capture page ask the program for the same frame: the same inputs and the same elapsed time for each launch speed', async () => {
  const { plans } = await interactFixtures();
  const sealed = await sealEnvelope(FIXTURE_DRAFTS.deep), composition = await compileCardComposition(plans.deep, sealed), manifest = sealed.main.program.manifest;
  const host = createProgramHost({ artifact: sealed.main.program, createWorker: standIn });
  try {
    for (const [speed, time] of [[5, 0.6], [3, 0.6], [3, 0.2]]) {
      const card = evaluateRequestFor(manifest, { id: 'b', inputs: { launchSpeed: speed }, time: 0 }, time, 7, null, composition);        // ProgramScene's scheduler
      const capture = evaluateRequestFor(manifest, { inputs: { launchSpeed: speed }, seed: 0 }, time, 1, null, composition);              // program-render.jsx and the fixture capture seam
      assert.deepEqual([card.inputs, card.time, card.seed], [capture.inputs, capture.time, capture.seed], `speed ${speed}, time ${time}`);
      const played = await host.evaluate(card), source = sealed.main.program;
      const captured = runProgram(await engine, { source: source.source, request: capture, sdkVersion: source.sdkVersion }, { ...LIMITS, interruptMs: 400 });
      assert.equal(captured.ok, true);
      assert.deepEqual(JSON.parse(JSON.stringify(played.quantities)), captured.value.quantities, 'the player and the capture engine agree on every quantity');
    }
  } finally { host.dispose(); }
});
