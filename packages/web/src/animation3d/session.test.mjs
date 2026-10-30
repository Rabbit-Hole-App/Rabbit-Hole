// One card's session (plan section 5 "State and recovery rules", AN-03/AN-04 UI half). The fixture behavior runs in lane R's real
// runtime (runtime.js over the pinned QuickJS engine, in-process Worker); ordering and refusal cases use a held stub runtime.
// Checked: late answers never replace newer state, retry repeats only the failed stage, a refused change returns the control to
// the accepted value, Reset keeps the camera and Reset view keeps the scene, settled snapshots and the presentation reach persist.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createCardSession } from './session.js';
import { deferred, experimentArtifact, gameArtifact, loadEngine, realRuntimes, stubRenderers, stubRuntimes, validated, watchArtifact } from './testdata/ui-stubs.mjs';

before(loadEngine);
const settle = async (rounds = 40) => { for (let i = 0; i < rounds; i += 1) await new Promise(resolve => setImmediate(resolve)); };
const DEFAULTS = { leftMass: 4, leftDistance: 1.5, rightMass: 2, rightDistance: 2 };
const values = state => Object.fromEntries(state.readouts.map(r => [r.id, r.value]));

function harness({ artifact = experimentArtifact(), runtimes = realRuntimes(), renderer = {}, loadScene = null, sim = null, view = null } = {}) {
  const renderers = stubRenderers(renderer), sims = [], views = [], loads = [];
  const session = createCardSession({
    loadScene: loadScene ?? (async (block, how) => { loads.push({ block, signal: how.signal }); return { artifact: structuredClone(artifact), sim, view }; }),
    createRuntime: runtimes.factory, createRenderer: renderers.factory,
    persist: { simulation: s => sims.push(s), view: v => views.push(v) },
    timers: { setTimeout: (fn, ms) => setTimeout(fn, ms) },
  });
  const block = { id: 'c1', type: 'animation3d', fixtureId: 'beam-balance-experiment' };
  return { session, runtimes, renderers, sims, views, loads, block, state: () => session.state() };
}
const started = async (h, { attach = true } = {}) => { if (attach) h.session.attach({ tag: 'host' }); await h.session.start(h.block); await settle(); };

test('start (real runtime): the fixture\'s defaults and its readouts; the renderer gets that frame and the saved camera', async () => {
  const h = harness({ view: { revision: 0, camera: { position: [9, 9, 9], target: [0, 0, 0], fov: 50 }, selection: null } });
  await started(h);
  const state = h.state();
  assert.equal(state.runtime, 'ready');
  assert.equal(state.renderer, 'ready');
  assert.deepEqual(state.inputs, DEFAULTS);
  assert.deepEqual(values(state), { leftMoment: 6, rightMoment: 4, tilt: 10 }, 'the fixture\'s defaults: left heavier');
  const renderer = h.renderers.made[0];
  assert.deepEqual(renderer.options.container, { tag: 'host' });
  assert.deepEqual(renderer.cameras, [{ position: [9, 9, 9], target: [0, 0, 0], fov: 50 }], 'the saved camera, not the preset');
  assert.ok(renderer.frames.length >= 1, 'the current frame is drawn once loaded');
  assert.equal(state.poster, 'data:image/webp;base64,AAAA', 'a poster is kept for when the slot is given back');
  assert.equal(state.changed, false);
  h.session.dispose();
});

test('a parameter change (real runtime): geometry and readouts from the same accepted state; the snapshot is persisted', async () => {
  const h = harness();
  await started(h);
  assert.equal(await h.session.setParameter('leftMass', 2), true);
  await settle();
  assert.equal(h.state().inputs.leftMass, 2);
  assert.deepEqual(values(h.state()), { leftMoment: 3, rightMoment: 4, tilt: -5 });
  const frame = h.renderers.made[0].frames.at(-1);
  assert.equal(frame.readouts.tilt, -5, 'the renderer drew the frame the readouts came from');
  assert.ok(frame.nodes.beam.quaternion, 'and the beam moved with it');
  assert.equal(h.state().changed, true);
  assert.equal(h.sims.at(-1).inputs.leftMass, 2);
  assert.equal(h.sims.at(-1).schema, 'animation-snapshot/1', 'the contract snapshot storage.js saves');
  h.session.dispose();
});

test('a value the contract refuses (out of range) is not sent on: the control keeps the accepted value, with a notice', async () => {
  const h = harness();
  await started(h);
  assert.equal(await h.session.setParameter('leftMass', 60), false);
  assert.equal(h.state().pending, null);
  assert.equal(h.state().inputs.leftMass, 4);
  assert.match(h.state().notice, /not accepted/);
  assert.equal(h.sims.length, 0, 'nothing saved for a refused change');
  h.session.dispose();
});

test('an older answer never clears a newer pending value (held stub runtime)', async () => {
  const runtimes = stubRuntimes({ hold: true });
  const h = harness({ runtimes });
  await started(h);
  const first = h.session.setParameter('leftMass', 3);
  const second = h.session.setParameter('leftMass', 5);
  assert.equal(h.state().pending.leftMass, 5);
  runtimes.waiting[0].resolve();
  await first;
  assert.equal(h.state().pending.leftMass, 5, 'still the newer value');
  runtimes.release();
  await second;
  assert.equal(h.state().pending, null);
  assert.equal(h.state().inputs.leftMass, 5);
});

test('a late scene from an earlier start never replaces the newer one', async () => {
  const first = deferred(), second = deferred(), answers = [first, second];
  const h = harness({ loadScene: () => answers.shift().promise, runtimes: stubRuntimes() });
  const a = h.session.start({ id: 'c1', fixtureId: 'orbit-watch' });
  const b = h.session.start({ id: 'c1', fixtureId: 'grid-robot-game' });
  second.resolve({ artifact: gameArtifact() });
  await b;
  first.resolve({ artifact: watchArtifact() });
  await a;
  await settle();
  assert.equal(h.state().model.experience, 'game');
  assert.equal(h.runtimes.made.length, 1, 'no runtime for the stale scene');
});

test('frames and errors from a replaced runtime are dropped', async () => {
  const runtimes = stubRuntimes();
  const h = harness({ runtimes });
  await started(h);
  const old = runtimes.made[0];
  await h.session.start({ ...h.block });
  await settle();
  const before = h.state().readouts;
  old.options.onFrame({ readouts: { leftMoment: 999 } }, { time: 0 });
  old.options.onError(new Error('late crash'));
  assert.deepEqual(h.state().readouts, before);
  assert.equal(h.state().failure, null);
});

test('a malformed artifact never reaches the runtime or renderer: it fails as unreadable, with the contract issue', async () => {
  const h = harness({ artifact: { ...experimentArtifact(), scene: { ...experimentArtifact().scene, shader: 'void main(){}' } } });
  await started(h);
  assert.equal(h.state().failure.stage, 'artifact');
  assert.equal(h.state().failure.code, 'invalid_artifact');
  assert.equal(h.runtimes.made.length, 0);
  assert.equal(h.renderers.made.length, 0);
});

test('a scene that cannot be read: recovery; Retry reads it again', async () => {
  let fail = true;
  const h = harness({ runtimes: stubRuntimes(), loadScene: async () => { if (fail) throw Object.assign(new Error('This animation\'s saved scene is no longer available.'), { code: 'missing', retry: true }); return { artifact: experimentArtifact() }; } });
  await started(h, { attach: false });
  assert.equal(h.state().failure.stage, 'artifact');
  assert.equal(h.state().failure.code, 'missing');
  fail = false;
  await h.session.retry();
  await settle();
  assert.equal(h.state().failure, null);
  assert.equal(h.state().runtime, 'ready');
});

test('a renderer that fails: recovery for the 3D view only; the runtime keeps working; Retry rebuilds only the renderer', async () => {
  let fail = true;
  const h = harness({ runtimes: stubRuntimes(), renderer: { load: () => Promise.resolve(fail ? { ok: false, code: 'invalid_artifact', issues: [{ message: 'too many triangles' }] } : { ok: true }) } });
  await started(h);
  assert.equal(h.state().failure.stage, 'renderer');
  assert.equal(h.state().failure.code, 'invalid_artifact');
  assert.equal(h.state().renderer, 'off');
  assert.equal(h.renderers.made[0].disposed, true, 'a failed renderer is freed');
  assert.equal(await h.session.setParameter('leftDistance', 2), true, 'the controls still work');
  fail = false;
  await h.session.retry();
  await settle();
  assert.equal(h.state().failure, null);
  assert.equal(h.state().renderer, 'ready');
  assert.equal(h.runtimes.made.length, 1, 'the runtime was not restarted');
  assert.equal(h.loads.length, 1, 'the scene was not read again');
  assert.equal(h.renderers.made.length, 2);
});

test('a lost graphics context is a renderer failure with Retry 3D view; an aborted load is not', async () => {
  const h = harness({ runtimes: stubRuntimes() });
  await started(h);
  h.renderers.made[0].options.onLost();
  assert.equal(h.state().failure.stage, 'renderer');
  assert.equal(h.state().failure.code, 'context_lost');
  const quiet = harness({ runtimes: stubRuntimes(), renderer: { load: () => Promise.resolve({ ok: false, code: 'aborted' }) } });
  await started(quiet);
  assert.equal(quiet.state().failure, null);
});

test('a runtime that stops: recovery keeps the last readouts and the 3D view; Restart scene rebuilds only the runtime from its last state', async () => {
  const runtimes = stubRuntimes();
  const h = harness({ runtimes });
  await started(h);
  await h.session.setParameter('leftMass', 6);
  const readouts = h.state().readouts;
  runtimes.made[0].fail(Object.assign(new Error('watchdog'), { code: 'runtime_limit' }));
  assert.equal(h.state().failure.stage, 'runtime');
  assert.deepEqual(h.state().readouts, readouts);
  assert.equal(h.state().renderer, 'ready');
  await h.session.retry();
  await settle();
  assert.equal(runtimes.made.length, 2);
  assert.equal(runtimes.made[1].options.saved.inputs.leftMass, 6, 'restarted from the last good state');
  assert.equal(h.renderers.made.length, 1);
  assert.equal(h.state().runtime, 'ready');
});

test('Reset (real runtime) restores the defaults and keeps the camera; Reset view changes only the camera', async () => {
  const h = harness();
  await started(h);
  const renderer = h.renderers.made[0];
  renderer.options.onCameraChange({ position: [5, 5, 5], target: [0, 0, 0], fov: 50 });
  await h.session.setParameter('leftMass', 8);
  assert.equal(await h.session.reset(), true);
  await settle();
  assert.deepEqual(h.state().inputs, DEFAULTS);
  assert.deepEqual(values(h.state()), { leftMoment: 6, rightMoment: 4, tilt: 10 });
  assert.equal(h.state().changed, false);
  assert.deepEqual(h.state().camera.position, [5, 5, 5], 'Reset keeps the camera');
  assert.equal(renderer.cameras.length, 0, 'Reset does not move the camera');
  await h.session.setParameter('leftMass', 7);
  h.session.resetView();
  assert.deepEqual(renderer.cameras.at(-1), validated(experimentArtifact()).camera);
  assert.equal(h.state().inputs.leftMass, 7, 'Reset view keeps the scene');
  assert.deepEqual(h.views.at(-1), { camera: validated(experimentArtifact()).camera, selection: null });
  assert.equal(h.sims.at(-1).inputs.leftMass, 7);
  h.session.dispose();
});

test('watch (real runtime): play advances time from frames, pause holds it, a seekable restart goes back to 0; speed only among the declared ones', async () => {
  const runtimes = realRuntimes();
  const h = harness({ artifact: watchArtifact(), runtimes });
  h.block = { id: 'w', fixtureId: 'orbit-watch' };
  await started(h);
  assert.equal(h.state().model.loop.duration, 8);
  h.session.setSpeed(2);
  h.session.setSpeed(7);
  assert.equal(h.state().speed, 2);
  h.session.play();
  assert.equal(h.state().playing, true);
  runtimes.clock.frame(1000);
  await settle();
  assert.ok(Math.abs(h.state().time - 2) < 1e-6, `two seconds of scene time at 2x: ${h.state().time}`);
  assert.equal(values(h.state()).angle, 90, 'the readout at that moment');
  h.session.pause();
  await settle();
  const paused = h.state().time;
  runtimes.clock.frame(1000);
  await settle();
  assert.equal(h.state().time, paused, 'pause keeps the moment');
  assert.ok(h.sims.length >= 1, 'the paused moment is saved');
  await h.session.restart();
  await settle();
  assert.equal(h.state().time, 0);
  h.session.dispose();
});

test('the grid game (real runtime): moves and outcome come from the program; a rule-based restart is a reset (no fake rewind)', async () => {
  const h = harness({ artifact: gameArtifact() });
  h.block = { id: 'g', fixtureId: 'grid-robot-game' };
  await started(h);
  assert.deepEqual(h.state().goal, { status: 'playing', message: 'Reach the target.' });
  await h.session.action('north');
  await settle();
  assert.deepEqual(values(h.state()), { moves: 1 }, 'a blocked move still counts');
  for (const move of ['east', 'east', 'east', 'south', 'south']) await h.session.action(move);
  await settle();
  assert.deepEqual(h.state().goal, { status: 'won', message: 'On target.' });
  assert.deepEqual(values(h.state()), { moves: 6 });
  await h.session.restart();
  await settle();
  assert.deepEqual(h.state().goal, { status: 'playing', message: 'Reach the target.' }, 'progress resets with the world');
  assert.deepEqual(values(h.state()), { moves: 0 });
  h.session.dispose();
});

test('a saved snapshot is restored as it was (real runtime: its state kept)', async () => {
  const first = harness({ artifact: gameArtifact() });
  first.block = { id: 'g', fixtureId: 'grid-robot-game' };
  await started(first);
  for (const move of ['east', 'east']) await first.session.action(move);
  const sim = first.sims.at(-1);
  first.session.dispose();
  const again = harness({ artifact: gameArtifact(), sim });
  again.block = { id: 'g', fixtureId: 'grid-robot-game' };
  await started(again);
  assert.deepEqual(values(again.state()), { moves: 2 });
  assert.equal(again.state().changed, true, 'a restored state offers Reset');
  again.session.dispose();
});

test('a drag end refused as busy is resent until the runtime takes it', async () => {
  const runtimes = stubRuntimes();
  const h = harness({ runtimes });
  await started(h);
  let refusals = 2;
  const real = runtimes.made[0].dispatch;
  runtimes.made[0].dispatch = async event => (event.type === 'drag_end' && refusals-- > 0 ? { accepted: false, reason: 'busy' } : real(event));
  h.renderers.made[0].options.onGesture({ type: 'drag_end', node: 'beam', value: 0.5 });
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(runtimes.log.filter(event => event.type === 'drag_end').length, 1, 'accepted on the third try');
  assert.equal(refusals, -1);
});

test('camera changes are presentation: persisted, no runtime call; selection only for a selectable node', async () => {
  const runtimes = stubRuntimes();
  const h = harness({ runtimes });
  await started(h);
  const before = runtimes.log.length;
  for (let i = 0; i < 5; i++) h.renderers.made[0].options.onCameraChange({ position: [i, 0, 0], target: [0, 0, 0], fov: 50 });
  assert.equal(runtimes.log.length, before);
  assert.deepEqual(h.views.at(-1).camera.position, [4, 0, 0]);
  assert.equal(await h.session.select('beam'), false, 'the beam is not declared selectable');
  assert.equal(runtimes.log.length, before);
});

test('detach (slot given back) keeps a poster and the camera; attach restores them; dispose stops everything', async () => {
  const runtimes = stubRuntimes();
  const h = harness({ runtimes });
  await started(h);
  await h.session.detach();
  assert.equal(h.renderers.made[0].disposed, true);
  assert.equal(h.state().renderer, 'off');
  assert.deepEqual(h.state().camera, { position: [1, 2, 3], target: [0, 0, 0], fov: 50 });
  assert.ok(h.state().poster);
  await h.session.attach({});
  await settle();
  assert.deepEqual(h.renderers.made[1].cameras, [{ position: [1, 2, 3], target: [0, 0, 0], fov: 50 }]);
  h.session.dispose();
  assert.ok(runtimes.log.includes('dispose'));
  assert.equal(h.renderers.made[1].disposed, true);
  assert.equal(await h.session.setParameter('leftMass', 6), false, 'nothing runs after dispose');
});

test('interaction reaches the renderer: interact on enter and exit; a release drops a held gesture and keeps an active one', async () => {
  const h = harness({ runtimes: stubRuntimes() });
  await started(h);
  h.session.interact(true);
  h.session.releaseGestures(true);
  h.session.interact(false);
  assert.deepEqual(h.renderers.made[0].interactive, [true, false, true, false]);
});

// CI fast-e2e 41141201411 (animation-mvp steps 17-20): after a reload the board's context arrives after mount, so the card starts a
// second time; a runtime of the first start that settles late (it was waiting for one of the two animation Workers) let that old
// start go on to build a renderer, which dropped the new start's ready one and never reported ready itself: the card stayed at
// "Preparing the scene" with its poster showing. A superseded start must stop once its runtime settles.
test('a superseded start whose runtime settles late never replaces the current renderer', async () => {
  const late = deferred();
  let made = 0;
  const base = stubRuntimes();
  const runtimes = { made: base.made, factory: options => {
    const runtime = base.factory(options);
    if (++made === 1) runtime.ready = late.promise; // the first start's runtime waits (no Worker yet)
    return runtime;
  } };
  const h = harness({ runtimes });
  h.session.attach({ tag: 'host' });
  const first = h.session.start(h.block);
  await settle();
  await h.session.start({ ...h.block }); // the board context arrived: start again
  await settle();
  assert.equal(h.state().renderer, 'ready');
  const shown = h.renderers.made.filter(r => !r.disposed);
  assert.equal(shown.length, 1);
  late.reject(Object.assign(new Error('disposed'), { code: 'disposed' })); // the old runtime finally settles
  await first;
  await settle();
  assert.equal(h.state().renderer, 'ready', 'still ready');
  assert.deepEqual(h.renderers.made.filter(r => !r.disposed), shown, 'the current renderer was kept, and no stale one was built');
  assert.equal(h.state().failure, null);
});

test('detach clears the viewport at once, so a slot given back and taken again restarts the 3D view', async () => {
  const h = harness({ runtimes: stubRuntimes() });
  await started(h);
  const detaching = h.session.detach();
  const again = h.session.attach({ tag: 'host-2' });
  await detaching; await again; await settle();
  assert.equal(h.state().renderer, 'ready');
  assert.deepEqual(h.renderers.made.at(-1).options.container, { tag: 'host-2' });
  assert.ok(h.state().poster);
});
