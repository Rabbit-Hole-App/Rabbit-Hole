// I2 (docs/features/interact.md INT-04-C14, INT-06-C12/C18; INT-10-C03): the Deep card's supporting comparison is a read-only snapshot that is recomputed for the
// main launch speed, runs through the page's one snapshot service, and never needs a third Worker. The programs are the sealed Deep fixture programs, run in the
// pinned QuickJS engine behind the real host (the Worker is a stand-in that answers from the engine; the pool, eviction and limits are the real ones).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgramHost, liveRuntimeCount } from './explain-program/host.js';
import { LIMITS } from './explain-program/limits.js';
import { loadEngine, runProgram } from './explain-program/runtime.js';
import { FIXTURE_DRAFTS, G, sealEnvelope } from './interact-build-fixtures.js';
import { interactFixtures } from './interact-plan-fixtures.js';
import { compileCardComposition } from './interact-composition.js';
import { compositionOf } from './interact-composition-adapter.js';
import { supportInputs } from './interact-card-layout.js';
import { artifactKey, createSnapshotService, programSnapshot } from './interact-support-snapshots.js';

const { plans } = await interactFixtures();
const artifacts = await sealEnvelope(FIXTURE_DRAFTS.deep);
const composition = compositionOf({ interact: { composition: await compileCardComposition(plans.deep, artifacts) } });
const main = artifacts.main.program, compare = artifacts.supporting[0].artifact.program, panel = composition.supports[0];
const engine = loadEngine();

let peak = 0, created = 0;
const standIn = () => {
  created += 1;
  const worker = {
    terminate() { worker.dead = true; },
    postMessage({ id, operation, source, request }) {
      peak = Math.max(peak, liveRuntimeCount());
      engine.then(e => { const out = runProgram(e, { source, request, operation }, { ...LIMITS, interruptMs: 400 }); setTimeout(() => !worker.dead && worker.onmessage?.({ data: { id, ...out } }), 0); });
    },
  };
  engine.then(() => setTimeout(() => worker.onmessage?.({ data: { ready: true } }), 0));
  return worker;
};
const createHost = ({ artifact }) => createProgramHost({ artifact, createWorker: standIn });
// A support readout reaches the page as its label (normalizeFrame keeps the text): the oracle tolerance for a label is half the display unit (here 3 decimals, 0.0005).
const HALF_UNIT = 0.5e-3;
const readout = (view, id) => Number(view.readouts.find(x => x.id === id).text.match(/-?\d+(?:\.\d+)?/)[0]);

test('the comparison is recomputed for the main launch speed through the plan binding: the trial peak follows the speed, each ball stays 0.049 m from its own top', async () => {
  const at = async speed => programSnapshot({ artifact: compare, inputs: supportInputs(panel, { launchSpeed: speed }), createHost });
  const slow = await at(3), fast = await at(5);
  assert.ok(Math.abs(readout(slow, 'trialPeak') - 9 / (2 * G)) < HALF_UNIT && Math.abs(readout(fast, 'trialPeak') - 25 / (2 * G)) < HALF_UNIT, 'u squared over 2g at 3.0 and at 5.0 m/s');
  assert.ok(Math.abs(readout(slow, 'referencePeak') - 9 / (2 * G)) < HALF_UNIT && Math.abs(readout(fast, 'referencePeak') - 9 / (2 * G)) < HALF_UNIT, 'the reference throw is fixed at 3.0 m/s');
  for (const view of [slow, fast]) for (const id of ['referenceOffset', 'trialOffset']) assert.ok(Math.abs(readout(view, id) - 0.049) < HALF_UNIT, `${id}: 0.20 s window, 0.049 m below its own peak`);
  assert.notDeepEqual(slow.scene.objects.map(o => o.initialState), fast.scene.objects.map(o => o.initialState), 'the drawing changed with the speed');
  assert.deepEqual(supportInputs(panel, {}), {}, 'a main input with no value yet binds nothing: no invented default');
});

test('dragging the launch speed: only the snapshot in flight and the last one run, a returned-to speed is a cache hit, and the Worker pool never exceeds two', async () => {
  peak = 0; created = 0;
  // The main card's player and another card hold both Workers; the snapshot must evict an idle one, never add a third.
  const mainHost = createHost({ artifact: main }), other = createHost({ artifact: main });
  const ask = host => host.evaluate({ requestId: 'r', inputs: { launchSpeed: 5 }, time: 0, seed: 0, state: null });
  await ask(mainHost); await ask(other);
  assert.equal(liveRuntimeCount(), 2);
  const service = createSnapshotService(), live = {}, ran = [];
  const request = speed => {
    const inputs = supportInputs(panel, { launchSpeed: speed }), key = String(speed);
    live[key] = true;
    return service.request({ artifact: artifactKey(panel), inputs, live: () => live[key], run: async () => { ran.push(speed); return programSnapshot({ artifact: compare, inputs, createHost }); } });
  };
  const first = request(5);
  while (service.stats().active === 0) await new Promise(r => setTimeout(r, 1)); // the first is running when the drag moves on
  const speeds = Array.from({ length: 19 }, (_, i) => Number((4.9 - i * 0.1).toFixed(1)));
  const pending = speeds.map((speed, i) => { const p = request(speed); if (i < speeds.length - 1) live[String(speed)] = false; return p; }); // each effect cleanup fences its predecessor
  const results = await Promise.all([first, ...pending]);
  assert.deepEqual(ran, [5, 3.1], 'the snapshot already running, then only the speed the drag ended on');
  assert.ok(Math.abs(readout(results.at(-1), 'trialPeak') - 3.1 ** 2 / (2 * G)) < HALF_UNIT, 'the frame that is drawn is the final speed');
  assert.deepEqual(results.slice(1, -1), pending.slice(0, -1).map(() => null), 'a fenced request never creates a host and draws nothing');
  const before = ran.length;
  live['5'] = true;
  const again = await service.request({ artifact: artifactKey(panel), inputs: supportInputs(panel, { launchSpeed: 5 }), live: () => live['5'], run: async () => { ran.push('again'); return null; } });
  assert.equal(ran.length, before, 'back at 5.0 m/s the cached frame is used: no program runs');
  assert.ok(Math.abs(readout(again, 'trialPeak') - 25 / (2 * G)) < HALF_UNIT);
  assert.equal(peak, LIMITS.activeRuntimes, 'the pool was full (two) and never went past it');
  assert.equal(service.stats().peak, 1, 'snapshots ran strictly one after another');
  mainHost.dispose(); other.dispose();
  assert.equal(liveRuntimeCount(), 0, 'every host, the transient ones included, released its Worker');
});
