// One card's session (plan section 5 "State and recovery rules", AN-03/AN-04 UI half) against stub runtimes and renderers:
// late answers never replace newer state, retry repeats only the failed stage, a rejected change returns the control to the
// accepted value, Reset keeps the camera and Reset view keeps the scene, saves are settled and debounced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardSession, createSaver } from './session.js';
import { deferred, experimentArtifact, gameArtifact, stubRenderers, stubRuntimes, watchArtifact } from './testdata/ui-stubs.mjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const settle = async (n = 5) => { for (let i = 0; i < n; i++) await tick(); };
// Timers the test advances by hand: the saver's debounce.
const manualTimers = () => { const queue = new Map(); let next = 0; return { setTimeout(fn) { queue.set(++next, fn); return next; }, clearTimeout(id) { queue.delete(id); }, run() { const fns = [...queue.values()]; queue.clear(); fns.forEach(fn => fn()); }, get size() { return queue.size; } }; };

function harness({ artifact = experimentArtifact(), runtime = {}, renderer = {}, loadArtifact = null, block = { id: 'c1', fixtureId: 'experiment' } } = {}) {
  const runtimes = stubRuntimes(runtime), renderers = stubRenderers(renderer), timers = manualTimers(), saves = [], loads = [];
  const session = createCardSession({
    loadArtifact: loadArtifact ?? (async (b, how) => { loads.push({ block: b, signal: how.signal }); return artifact; }),
    createRuntime: runtimes.factory, createRenderer: renderers.factory, save: saved => saves.push(saved), timers,
  });
  return { session, runtimes, renderers, timers, saves, loads, block, state: () => session.state() };
}

test('start: the artifact, then the runtime\'s first frame (readouts) and, with a container, the renderer with that frame and the saved camera', async () => {
  const h = harness({ block: { id: 'c1', fixtureId: 'experiment', camera: { position: [9, 9, 9] } } });
  h.session.attach({ tag: 'host' });
  await h.session.start(h.block);
  await settle();
  const state = h.state();
  assert.equal(state.runtime, 'ready');
  assert.equal(state.renderer, 'ready');
  assert.deepEqual(state.inputs, { left_mass: 2, left_distance: 1, show_forces: true });
  assert.deepEqual(state.readouts.map(r => [r.id, r.value]), [['torque', 2]]);
  const renderer = h.renderers.made[0];
  assert.deepEqual(renderer.options.container, { tag: 'host' });
  assert.deepEqual(renderer.cameras, [{ position: [9, 9, 9] }], 'the saved camera, not the preset');
  assert.equal(renderer.frames.length >= 1, true, 'the current frame is drawn once loaded');
  assert.equal(state.poster, 'data:image/png;base64,AAAA', 'a poster is kept for when the slot is given back');
  assert.equal(state.changed, false);
});

test('a late artifact from an earlier start never replaces the newer scene', async () => {
  const first = deferred(), second = deferred();
  const answers = [first, second];
  const h = harness({ loadArtifact: () => answers.shift().promise });
  const a = h.session.start({ id: 'c1', artifactRef: { id: 'old' } });
  const b = h.session.start({ id: 'c1', artifactRef: { id: 'new' } });
  second.resolve(gameArtifact());
  await b;
  first.resolve(watchArtifact());
  await a;
  await settle();
  assert.equal(h.state().model.experience, 'game');
  assert.equal(h.runtimes.made.length, 1, 'no runtime for the stale artifact');
});

test('frames from a disposed or replaced runtime are dropped', async () => {
  const h = harness();
  await h.session.start(h.block);
  await settle();
  const old = h.runtimes.made[0];
  await h.session.start({ ...h.block, fixtureId: 'experiment-2' });
  await settle();
  const before = h.state().readouts;
  old.options.onFrame({ readouts: [{ id: 'torque', label: 'Left torque', value: 999 }] });
  old.options.onError(new Error('late crash'));
  assert.deepEqual(h.state().readouts, before);
  assert.equal(h.state().failure, null);
});

test('a parameter change: shown at once, accepted from the runtime\'s snapshot, saved once settled', async () => {
  const h = harness({ runtime: { hold: true } });
  await h.session.start(h.block);
  await settle();
  const done = h.session.setParameter('left_mass', 4);
  assert.equal(h.state().pending.left_mass, 4, 'the control shows the learner\'s value while it is pending');
  assert.equal(h.state().inputs.left_mass, 2);
  h.runtimes.release();
  assert.equal(await done, true);
  assert.equal(h.state().pending, null);
  assert.equal(h.state().inputs.left_mass, 4);
  assert.deepEqual(h.state().readouts.map(r => r.value), [4]);
  assert.equal(h.state().changed, true);
  assert.equal(h.saves.length, 0, 'not saved on every change: debounced');
  h.timers.run();
  assert.equal(h.saves.length, 1);
  assert.equal(h.saves[0].snapshot.inputs.left_mass, 4);
});

test('a rejected change returns the control to the last accepted value, with a notice', async () => {
  const h = harness({ runtime: { reject: ['left_mass'] } });
  await h.session.start(h.block);
  await settle();
  assert.equal(await h.session.setParameter('left_mass', 9), false);
  assert.equal(h.state().pending, null);
  assert.equal(h.state().inputs.left_mass, 2);
  assert.match(h.state().notice, /not accepted/);
  h.timers.run();
  assert.equal(h.saves.length, 0, 'nothing saved for a rejected change');
});

test('an older answer never clears a newer pending value', async () => {
  const h = harness({ runtime: { hold: true } });
  await h.session.start(h.block);
  await settle();
  const first = h.session.setParameter('left_mass', 3);
  const second = h.session.setParameter('left_mass', 5);
  assert.equal(h.state().pending.left_mass, 5);
  h.runtimes.waiting[0].resolve();
  await first;
  assert.equal(h.state().pending.left_mass, 5, 'still the newer value');
  h.runtimes.release();
  await second;
  assert.equal(h.state().pending, null);
  assert.equal(h.state().inputs.left_mass, 5);
});

test('a renderer that fails: recovery for the 3D view only; the runtime keeps working; Retry rebuilds only the renderer', async () => {
  let fail = true;
  const h = harness({ renderer: { load: () => (fail ? Promise.reject(new Error('context lost')) : Promise.resolve({ ok: true })) } });
  h.session.attach({ tag: 'host' });
  await h.session.start(h.block);
  await settle();
  assert.equal(h.state().failure.stage, 'renderer');
  assert.equal(h.state().renderer, 'off');
  assert.equal(h.renderers.made[0].disposed, true, 'a failed renderer is freed');
  assert.equal(await h.session.setParameter('left_distance', 2), true, 'experiments still update their readouts');
  assert.deepEqual(h.state().readouts.map(r => r.value), [4]);
  fail = false;
  await h.session.retry();
  await settle();
  assert.equal(h.state().failure, null);
  assert.equal(h.state().renderer, 'ready');
  assert.equal(h.runtimes.made.length, 1, 'the runtime was not restarted');
  assert.equal(h.loads.length, 1, 'the artifact was not read again');
  assert.equal(h.renderers.made.length, 2);
});

test('a structured renderer error (load resolves { ok: false }) is a failure too', async () => {
  const h = harness({ renderer: { load: () => Promise.resolve({ ok: false, error: { code: 'budget', message: 'too many triangles' } }) } });
  h.session.attach({});
  await h.session.start(h.block);
  await settle();
  assert.equal(h.state().failure.stage, 'renderer');
  assert.equal(h.state().failure.code, 'budget');
});

test('a runtime that stops: recovery keeps the last frame; Restart scene rebuilds only the runtime', async () => {
  const h = harness();
  h.session.attach({});
  await h.session.start(h.block);
  await settle();
  await h.session.setParameter('left_mass', 6);
  const readouts = h.state().readouts;
  h.runtimes.made[0].fail(Object.assign(new Error('watchdog'), { code: 'runtime_limit' }));
  assert.equal(h.state().failure.stage, 'runtime');
  assert.deepEqual(h.state().readouts, readouts, 'the last good readouts stay');
  assert.equal(h.state().renderer, 'ready', 'the 3D view stays');
  await h.session.retry();
  await settle();
  assert.equal(h.runtimes.made.length, 2);
  assert.equal(h.renderers.made.length, 1);
  assert.equal(h.loads.length, 1);
  assert.equal(h.state().runtime, 'ready');
});

test('an artifact that cannot be read: recovery; Retry reads it again', async () => {
  let fail = true;
  const h = harness({ loadArtifact: async () => { if (fail) throw Object.assign(new Error('403'), { status: 403 }); return experimentArtifact(); } });
  await h.session.start(h.block);
  assert.equal(h.state().failure.stage, 'artifact');
  assert.equal(h.runtimes.made.length, 0);
  fail = false;
  await h.session.retry();
  await settle();
  assert.equal(h.state().failure, null);
  assert.equal(h.state().runtime, 'ready');
});

test('Reset restores the defaults and keeps the camera; Reset view changes only the camera', async () => {
  const h = harness();
  h.session.attach({});
  await h.session.start(h.block);
  await settle();
  const renderer = h.renderers.made[0];
  renderer.options.onCameraChange({ position: [5, 5, 5] });
  await h.session.setParameter('left_mass', 8);
  assert.equal(await h.session.reset(), true);
  assert.deepEqual(h.state().inputs, { left_mass: 2, left_distance: 1, show_forces: true });
  assert.equal(h.state().changed, false);
  assert.deepEqual(h.state().camera, { position: [5, 5, 5] }, 'Reset keeps the camera');
  assert.equal(renderer.cameras.length, 0, 'Reset does not move the camera');
  await h.session.setParameter('left_mass', 7);
  h.session.resetView();
  assert.deepEqual(renderer.cameras.at(-1), experimentArtifact().camera);
  assert.equal(h.state().inputs.left_mass, 7, 'Reset view keeps the scene');
  h.timers.run();
  assert.deepEqual(h.saves.at(-1).camera, experimentArtifact().camera);
  assert.equal(h.saves.at(-1).snapshot.inputs.left_mass, 7);
});

test('a reset that fails keeps the last good state', async () => {
  const h = harness();
  await h.session.start(h.block);
  await settle();
  await h.session.setParameter('left_mass', 8);
  h.runtimes.made[0].reset = async () => { throw new Error('initial state invalid'); };
  assert.equal(await h.session.reset(), false);
  assert.equal(h.state().inputs.left_mass, 8);
  assert.match(h.state().notice, /last good state is kept/);
});

test('watch: play, pause, a seekable restart keeps the inputs, speed only among the declared ones', async () => {
  const h = harness({ artifact: watchArtifact() });
  await h.session.start({ id: 'w', fixtureId: 'watch' });
  await settle();
  h.session.play();
  assert.equal(h.state().playing, true);
  await h.session.restart();
  h.session.setSpeed(2);
  h.session.setSpeed(7);
  h.session.pause();
  assert.equal(h.state().playing, false);
  assert.deepEqual(h.runtimes.log, ['play', ['seek', 0], ['speed', 2], 'pause']);
  assert.equal(h.state().speed, 2);
});

test('a rule-based game restarts by reset (no fake rewind); Check counts an attempt', async () => {
  const h = harness({ artifact: gameArtifact(), runtime: { goal: state => ({ status: state.last === 'check' && state.attempts > 1 ? 'success' : 'playing', attempts: state.attempts }) } });
  await h.session.start({ id: 'g', fixtureId: 'game' });
  await settle();
  await h.session.action('place_left');
  await h.session.action('check');
  assert.deepEqual(h.state().goal, { status: 'playing', attempts: 1, message: '' });
  await h.session.action('check');
  assert.equal(h.state().goal.status, 'success');
  await h.session.restart();
  assert.ok(h.runtimes.log.includes('reset'));
  assert.ok(!h.runtimes.log.some(entry => Array.isArray(entry) && entry[0] === 'seek'));
  assert.deepEqual(h.state().goal, { status: 'playing', attempts: 0, message: '' }, 'progress resets with the world');
});

test('camera changes are presentation: debounced saves, no runtime call', async () => {
  const h = harness();
  h.session.attach({});
  await h.session.start(h.block);
  await settle();
  const before = h.runtimes.log.length;
  for (let i = 0; i < 20; i++) h.renderers.made[0].options.onCameraChange({ position: [i, 0, 0] });
  assert.equal(h.runtimes.log.length, before);
  h.timers.run();
  assert.deepEqual(h.saves, [{ camera: { position: [19, 0, 0] } }]);
});

test('detach (slot given back) keeps a poster and the camera; attach restores them; dispose flushes the save and stops everything', async () => {
  const h = harness();
  h.session.attach({});
  await h.session.start(h.block);
  await settle();
  await h.session.detach();
  assert.equal(h.renderers.made[0].disposed, true);
  assert.equal(h.state().renderer, 'off');
  assert.deepEqual(h.state().camera, { position: [1, 2, 3], target: [0, 0, 0] });
  assert.ok(h.state().poster);
  await h.session.attach({});
  await settle();
  assert.deepEqual(h.renderers.made[1].cameras, [{ position: [1, 2, 3], target: [0, 0, 0] }]);
  await h.session.setParameter('left_mass', 5);
  h.session.dispose();
  assert.equal(h.saves.length, 1, 'flushed on dispose (navigation)');
  assert.equal(h.runtimes.made[0].options && h.runtimes.log.includes('dispose'), true);
  assert.equal(h.renderers.made[1].disposed, true);
  assert.equal(await h.session.setParameter('left_mass', 6), false, 'nothing runs after dispose');
});

test('the interaction hooks reach the renderer: interactive on enter, gestures cancelled on release', async () => {
  const h = harness();
  h.session.attach({});
  await h.session.start(h.block);
  await settle();
  h.session.interact(true);
  h.session.releaseGestures();
  h.session.interact(false);
  assert.deepEqual(h.renderers.made[0].interactive, [true, false]);
  assert.equal(h.renderers.made[0].cancelled, 1);
});

test('the saver: one write per settled burst, flush writes at once, cancel drops', () => {
  const timers = manualTimers(), saves = [];
  const saver = createSaver({ save: value => saves.push(value), timers });
  saver.queue({ snapshot: 1 });
  saver.queue({ camera: 2 });
  saver.queue({ snapshot: 3 });
  assert.equal(timers.size, 1);
  timers.run();
  assert.deepEqual(saves, [{ snapshot: 3, camera: 2 }]);
  saver.queue({ camera: 4 });
  saver.flush();
  assert.deepEqual(saves.at(-1), { camera: 4 });
  saver.flush();
  assert.equal(saves.length, 2, 'nothing pending, nothing written');
  saver.queue({ camera: 5 });
  saver.cancel();
  timers.run();
  assert.equal(saves.length, 2);
});
