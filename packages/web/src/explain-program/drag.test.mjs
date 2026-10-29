// Task 8.4: generic drag targets. The contract admits a drag only on a declared drag target at a point inside the viewport; the controller
// merges a drag's moves (its end replaces a waiting move, a start needs room for its end) so the last position and the end always
// arrive; the drag fixture runs through the real host; the review's replay of a sampled drag uses the card's own rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvent, parseManifest, sealProgram } from './contract.js';
import { LIMITS } from './limits.js';
import { STATEFUL_PROGRAM_STAMPS } from './stamps.js';
import { createProgramHost } from './host.js';
import { loadEngine, runProgram } from './runtime.js';
import { createInteractionController, replayTransitions } from './interaction.js';
import { dragFixture } from './fixtures.js';

const engine = loadEngine();
const standIn = () => {
  const worker = {
    terminate() { worker.dead = true; },
    postMessage({ id, operation, source, request }) { engine.then(e => { const out = runProgram(e, { source, request, operation }, { ...LIMITS, interruptMs: 150 }); setTimeout(() => !worker.dead && worker.onmessage?.({ data: { id, ...out } }), 0); }); },
  };
  engine.then(() => setTimeout(() => worker.onmessage?.({ data: { ready: true } }), 0));
  return worker;
};
const seal = async () => (await sealProgram({ manifest: dragFixture.manifest, source: dragFixture.source }, STATEFUL_PROGRAM_STAMPS)).value;
const at = (type, x, y = 180, target = 'handle') => ({ type, target, x, y });

test('a drag is admitted only on a declared drag target, at a point inside the viewport, with nothing else attached', () => {
  const manifest = parseManifest({ ...dragFixture.manifest, targets: [...dragFixture.manifest.targets, { id: 'mark', label: 'Marker' }] }, 2).value;
  for (const type of ['drag_start', 'drag_move', 'drag_end']) {
    assert.equal(parseEvent(at(type, 0, 0), manifest).ok, true, `${type} at a corner`);
    assert.equal(parseEvent(at(type, 720, 360), manifest).ok, true, `${type} at the other corner`);
  }
  const refused = [
    at('drag_move', 721), at('drag_move', -1), at('drag_move', 100, 361), at('drag_start', 100, 180, 'mark'), at('drag_start', 100, 180, 'nope'),
    { type: 'drag_move', target: 'handle', x: 10 }, { ...at('drag_move', 10), pointerId: 1 }, { ...at('drag_move', 10), clientX: 4 }, at('drag_move', Number.NaN), at('drag_move', Infinity),
    { type: 'drag_cancel', target: 'handle', x: 1, y: 1 },
  ];
  for (const bad of refused) assert.equal(parseEvent(bad, manifest).ok, false, JSON.stringify(bad));
  assert.equal(parseManifest({ ...dragFixture.manifest, targets: [{ id: 'handle', label: 'Handle', drag: 'yes' }] }, 2).ok, false, 'drag is a boolean');
});

test('a fast drag sends its start, its merged moves and its end in order: the last position and the end always arrive', async () => {
  const artifact = await seal();
  const host = createProgramHost({ artifact, createWorker: standIn });
  const reduced = [], saved = [];
  const counted = { ...host, initialize: raw => host.initialize(raw), evaluate: (raw, options) => host.evaluate(raw, options), reduce: raw => (reduced.push(raw.event.type), host.reduce(raw)) };
  const controller = createInteractionController({ host: counted, bundleHash: artifact.bundleHash, seed: 0, publish: () => {}, persist: next => saved.push(next),
    check: async () => {} });
  controller.start({});
  assert.equal(controller.dispatch(at('drag_start', 100), { inputs: {} }), true);
  for (let x = 101; x <= 600; x++) assert.equal(controller.dispatch(at('drag_move', x), { inputs: {} }), true);
  assert.equal(controller.dispatch(at('drag_end', 610), { inputs: {} }), true);
  assert.ok(controller.pending() <= 2, `the queue stays small: ${controller.pending()}`);
  for (let i = 0; i < 40 && (controller.pending() || saved.at(-1)?.state.drops !== 1); i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(reduced[0], 'drag_start');
  assert.equal(reduced.at(-1), 'drag_end');
  assert.ok(reduced.length <= 4, `500 moves merged: ${reduced.join(', ')}`);
  assert.deepEqual([saved.at(-1).state.x, saved.at(-1).state.dragging, saved.at(-1).state.drops], [610, false, 1]);
  controller.dispose(); host.dispose();
});

test('a drag is begun only with room for its end; otherwise it is refused whole', async () => {
  const artifact = await seal();
  const host = createProgramHost({ artifact, createWorker: standIn });
  const controller = createInteractionController({ host, bundleHash: artifact.bundleHash, seed: 0, publish: () => {}, cap: 3 });
  controller.start({}); // nothing runs before initialization, so the queue fills
  assert.equal(controller.dispatch({ type: 'action', action: 'centre' }, { inputs: {} }), true);
  assert.equal(controller.dispatch({ type: 'action', action: 'centre' }, { inputs: {} }), true);
  assert.equal(controller.dispatch(at('drag_start', 100), { inputs: {} }), false, 'one slot left: the end could not follow');
  controller.dispose(); host.dispose();
});

test('the drag fixture through the host, and the review replay of a sampled drag uses the card\'s frame rule at every state', async () => {
  const artifact = await seal();
  const host = createProgramHost({ artifact, createWorker: standIn });
  try {
    const out = await replayTransitions({ host, manifest: artifact.manifest, inputs: {}, seed: 0, events: dragFixture.events });
    assert.deepEqual([out.state.x, out.state.dragging, out.state.drops, out.state.moves], [420, false, 1, 1]);
    assert.ok(out.reply.frame.objects.some(object => object.id === 'handle'), 'the target is drawn in every frame');
    assert.equal(out.view.readouts.find(readout => readout.id === 'position').text, '420');
  } finally { host.dispose(); }
});
