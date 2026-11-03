// One card's session (plan section 5 "State and recovery rules", AN-03/AN-04 UI half). The fixture behavior runs in lane R's real
// runtime (runtime.js over the pinned QuickJS engine, in-process Worker); ordering and refusal cases use a held stub runtime.
// Checked: late answers never replace newer state, retry repeats only the failed stage, a refused change returns the control to
// the accepted value, Reset keeps the camera and Reset view keeps the scene, settled snapshots and the presentation reach persist.
import test, { before } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { REFIT_MS, createCardSession } from './session.js';
import { visibleControls } from './card.js';
import { steppedGameArtifact, steppedStudyArtifact } from './testdata/stepped-game.mjs';
import { deferred, experimentArtifact, gameArtifact, loadEngine, realRuntimes, stubRenderers, stubRuntimes, validated, watchArtifact } from './testdata/ui-stubs.mjs';

before(loadEngine);
const settle = async (rounds = 40) => { for (let i = 0; i < rounds; i += 1) await new Promise(resolve => setImmediate(resolve)); };
const DEFAULTS = { leftMass: 4, leftDistance: 1.5, rightMass: 2, rightDistance: 2 };
const values = state => Object.fromEntries(state.readouts.map(r => [r.id, r.value]));

function harness({ artifact = experimentArtifact(), runtimes = realRuntimes(), renderer = {}, loadScene = null, sim = null, view = null, fitView = undefined } = {}) {
  const renderers = stubRenderers(renderer), sims = [], views = [], loads = [];
  const session = createCardSession({
    loadScene: loadScene ?? (async (block, how) => { loads.push({ block, signal: how.signal }); return { artifact: structuredClone(artifact), sim, view }; }),
    createRuntime: runtimes.factory, createRenderer: renderers.factory,
    persist: { simulation: s => sims.push(s), view: v => views.push(v) },
    timers: { setTimeout: (fn, ms) => setTimeout(fn, ms) },
    ...(fitView ? { fitView } : {}),
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

test('the grid game (real runtime): moves and outcome come from the program; restart cannot rewind it and changes nothing; Reset does', async () => {
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
  assert.deepEqual(values(h.state()), { moves: 6 }, 'no fake rewind and no hidden reset');
  await h.session.reset();
  await settle();
  assert.deepEqual(h.state().goal, { status: 'playing', message: 'Reach the target.' }, 'progress resets with the world');
  assert.deepEqual(values(h.state()), { moves: 0 });
  h.session.dispose();
});

// Owner canvas 2026-11-02: a stepped game's Launch said "In flight" forever, because only Play starts the host's steps and the card
// showed none. A stepped scene offers Play and Pause, and an accepted action starts its steps when they are paused.
test('a stepped game (real runtime): Play and Pause are offered; Launch starts the host steps and the motion lands; Pause holds it', async () => {
  const runtimes = realRuntimes();
  const h = harness({ artifact: await steppedGameArtifact(), runtimes });
  h.block = { id: 's', type: 'animation3d' };
  await started(h);
  const show = visibleControls(h.state().model);
  assert.equal(show.transport, true, 'Play and Pause');
  assert.equal(show.speed, false, 'no speed: the host step is fixed');
  assert.equal(h.state().model.loop, null, 'no rewind (Restart needs a seekable loop)');
  assert.equal(h.state().playing, false, 'nothing moves before it is asked');
  const frames = async n => { for (let i = 0; i < n; i += 1) { runtimes.clock.frame(34); await settle(5); } };
  await frames(5);
  assert.deepEqual(values(h.state()), { distance: 0 }, 'no steps before Launch');
  assert.equal(await h.session.action('launch'), true);
  assert.equal(h.state().playing, true, 'Launch started the step clock');
  await frames(4);
  const moving = values(h.state()).distance;
  assert.ok(moving > 0 && moving < 3, `in flight: ${moving}`);
  h.session.pause();
  await frames(4);
  assert.equal(values(h.state()).distance, moving, 'Pause holds it');
  h.session.play();
  await frames(40);
  assert.deepEqual(values(h.state()), { distance: 3 });
  assert.deepEqual(h.state().goal, { status: 'won', message: 'Landed on the target.' });
  await h.session.reset();
  await settle();
  assert.deepEqual([values(h.state()), h.state().playing], [{ distance: 0 }, false], 'Reset: back home, the clock stopped until the next Launch');
  h.session.dispose();
});

// aj_086fd46 owner review: "Take one step" clicked three times recorded step 11, because every accepted action of a stepped scene
// started the step clock. An action that declares startsMotion false changes the state once and a paused scene stays paused; one that
// declares nothing (Launch) still starts the steps. The same scene holds both, so the difference is the declaration and nothing else.
test('a stepped scene (real runtime): a startsMotion false action advances exactly once per press and stays paused; Launch still plays', async () => {
  const runtimes = realRuntimes();
  const h = harness({ artifact: await steppedStudyArtifact(), runtimes });
  h.block = { id: 's', type: 'animation3d' };
  await started(h);
  const frames = async n => { for (let i = 0; i < n; i += 1) { runtimes.clock.frame(34); await settle(5); } };
  assert.deepEqual(values(h.state()), { taken: 0, ticks: 0, distance: 0 });
  assert.equal(await h.session.action('nudge'), true);
  await frames(60); // two seconds of frames: a runaway would add ticks
  assert.deepEqual([values(h.state()), h.state().playing], [{ taken: 1, ticks: 0, distance: 0 }, false], 'one press: one step, still paused, no host ticks');
  for (let i = 0; i < 2; i += 1) assert.equal(await h.session.action('nudge'), true);
  await frames(60);
  assert.deepEqual([values(h.state()), h.state().playing], [{ taken: 3, ticks: 0, distance: 0 }, false], 'three presses: three steps, still paused');
  assert.equal(await h.session.action('launch'), true);
  assert.equal(h.state().playing, true, 'an action that declares nothing starts the step clock, as before');
  await frames(6);
  const moved = values(h.state());
  assert.ok(moved.ticks > 0 && moved.distance > 0 && moved.taken === 3, `Launch plays: ${JSON.stringify(moved)}`);
  h.session.pause();
  const held = values(h.state());
  await frames(10);
  assert.deepEqual(values(h.state()), held, 'Pause holds it');
  // A single-step press while playing leaves the clock running (it never stops what the learner started).
  h.session.play();
  assert.equal(await h.session.action('nudge'), true);
  assert.equal(h.state().playing, true, 'a startsMotion false press does not pause a running scene');
  h.session.dispose();
});

// The same rule on the SGD correction fixture itself (its sealed artifact, the real session and the real runtime): the step count is the
// number of accepted Take one step presses, never more, and the card stays paused (aj_086fd46 owner review: three clicks read step 11).
test('the SGD correction fixture: Take one step is exactly one step per press, still paused seconds later; New run, keep old path starts the clock', async () => {
  const artifact = JSON.parse(readFileSync(new URL('../../../control-plane/test/fixtures/animation-mvp1-correction-artifact.json', import.meta.url), 'utf8'));
  const runtimes = realRuntimes();
  const h = harness({ artifact, runtimes });
  h.block = { id: 's', type: 'animation3d' };
  await started(h);
  const frames = async n => { for (let i = 0; i < n; i += 1) { runtimes.clock.frame(34); await settle(5); } };
  const stepNo = () => values(h.state()).stepNo;
  assert.equal(stepNo(), 0);
  for (let clicks = 1; clicks <= 3; clicks += 1) {
    assert.equal(await h.session.action('oneStep'), true);
    await frames(90); // three seconds of frames: with the old rule the clock ran on from the first press
    assert.deepEqual([stepNo(), h.state().playing], [clicks, false], `${clicks} accepted press(es): step ${clicks}, paused`);
  }
  assert.equal(await h.session.action('keepPath'), true);
  assert.equal(h.state().playing, true, 'a new run declares nothing: it starts the clock');
  h.session.dispose();
});

// The rule changes nothing for what already exists: no shipped fixture declares startsMotion and no shipped fixture is a stepped scene
// with an action, except the stepped Launch game, which keeps starting its steps (the test above this one's neighbour).
test('startsMotion: no shipped fixture or test scene other than the study scene declares it', async () => {
  const { ANIMATION_FIXTURES } = await import('./fixtures.js');
  const artifacts = ANIMATION_FIXTURES.map(fixture => fixture.artifact);
  assert.equal(artifacts.length, 3, 'the shipped watch, experiment and game fixtures');
  for (const artifact of artifacts) assert.ok(artifact.actions.every(action => !('startsMotion' in action)), `${artifact.title}: declares nothing, so its actions behave as before`);
  assert.ok((await steppedGameArtifact()).actions.every(action => !('startsMotion' in action)), 'the stepped Launch game declares nothing: Launch starts its steps');
});

// The fitted view (framing.js, lane R2): asked once per scene when no camera was saved, with the viewport's aspect, the shown frame
// and the session's own runtime factory; a saved camera wins; Reset view returns to the fitted camera, never to the authored one.
const FIT = { position: [0, 1, 6], target: [0, 0.5, 0], fov: 40 };
const box = { clientWidth: 600, clientHeight: 300 };
test('fitted view: applied when no camera was saved; Reset view returns to it; a saved camera wins and nothing is fitted', async () => {
  const asked = [];
  const fitView = async options => { asked.push(options); return FIT; };
  const h = harness({ runtimes: stubRuntimes(), fitView });
  h.session.attach(box); await h.session.start(h.block); await settle();
  assert.equal(asked.length, 1);
  assert.equal(asked[0].aspect, 2);
  assert.equal(asked[0].createRuntime, h.runtimes.factory);
  assert.equal(asked[0].artifact.artifactId, validated(experimentArtifact()).artifactId);
  assert.deepEqual(asked[0].frame, h.state().frame, 'the frame the card shows, the subject if the sampler gets none');
  const renderer = h.renderers.made[0];
  assert.deepEqual(renderer.cameras, [FIT], 'the fitted camera, after load');
  renderer.options.onCameraChange({ position: [9, 9, 9], target: [0, 0, 0], fov: 40 });
  h.session.resetView();
  assert.deepEqual(renderer.cameras.at(-1), FIT, 'Reset view: the fitted camera, not the authored one');
  assert.notDeepEqual(FIT, validated(experimentArtifact()).camera);
  h.session.dispose();

  const saved = { position: [7, 7, 7], target: [0, 0, 0], fov: 50 }, again = [];
  const s = harness({ runtimes: stubRuntimes(), view: { revision: 0, camera: saved, selection: null }, fitView: async options => { again.push(options); return FIT; } });
  s.session.attach(box); await s.session.start(s.block); await settle();
  assert.deepEqual(s.renderers.made[0].cameras, [saved], 'the saved camera wins');
  assert.equal(again.length, 0, 'nothing fitted over a saved camera');
  s.session.dispose();
});

// CI fast-e2e 5c79023f7: a fit that landed after the scene was shown moved an idle scene (steps 17 and 19), and a sampler started
// beside the card's own runtime slowed the restore of its saved state (step 28).
test('fitted view: asked only once the card\'s runtime is ready, and the scene is first drawn already fitted; once per scene', async () => {
  const held = deferred(), asked = [], late = deferred();
  const base = stubRuntimes();
  const runtimes = { made: base.made, factory: options => { const runtime = base.factory(options); const shown = runtime.ready; runtime.ready = held.promise.then(() => shown); return runtime; } };
  const h = harness({ runtimes, fitView: options => { asked.push(options); return late.promise; } });
  h.session.attach(box);
  const starting = h.session.start(h.block);
  await settle();
  assert.equal(asked.length, 0, 'no sampler while the card\'s own runtime starts');
  held.resolve(); await starting; await settle();
  assert.equal(asked.length, 1);
  assert.equal(h.renderers.made.length, 0, 'nothing drawn while the fit is asked');
  assert.notEqual(h.state().renderer, 'ready');
  late.resolve(FIT); await settle();
  assert.deepEqual(h.renderers.made[0].cameras, [FIT], 'the first camera shown is the fitted one');
  assert.equal(h.state().renderer, 'ready');
  h.renderers.made[0].options.onLost();
  await h.session.retry(); await settle();
  assert.deepEqual(h.renderers.made[1].cameras, [FIT], 'a rebuilt 3D view is fitted again');
  assert.equal(asked.length, 1, 'without a new sample');
  h.session.dispose();
});

test('fitted view: a fit given up on with the slot (detach) draws nothing; no fit keeps the authored camera', async () => {
  const late = deferred();
  const h = harness({ runtimes: stubRuntimes(), fitView: () => late.promise });
  h.session.attach(box); await h.session.start(h.block); await settle();
  h.session.detach();
  late.resolve(FIT); await settle();
  assert.equal(h.renderers.made.length, 0, 'the late fit builds no renderer for a slot given back');
  h.session.dispose();
  const n = harness({ runtimes: stubRuntimes(), fitView: async () => null });
  n.session.attach(box); await n.session.start(n.block); await settle();
  n.session.resetView();
  assert.deepEqual(n.renderers.made[0].cameras, [validated(experimentArtifact()).camera], 'Reset view: the authored camera');
  n.session.dispose();
});

// Owner 2026-11-01 (aj_283c19f): the default view is fitted to the defaults; a parameter change is fitted again once the controls
// settle and moves the camera only for a substantial change; an action waits for that fit; a camera the learner moved is kept.
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
test('fitted view: a settled parameter change is fitted again with its inputs; only a substantial change moves the camera', async () => {
  const asked = [], FAR = { position: [0, 1, 12], target: [0, 0.5, 0], fov: 40 }, NEAR = { position: [0, 1, 6.3], target: [0, 0.5, 0], fov: 40 };
  const fitView = async options => { asked.push(options); return options.inputs?.leftDistance === 3 ? FAR : options.inputs?.leftDistance === 1.6 ? NEAR : FIT; };
  const h = harness({ runtimes: stubRuntimes(), fitView });
  h.session.attach(box); await h.session.start(h.block); await settle();
  const renderer = h.renderers.made[0];
  assert.deepEqual(renderer.cameras, [FIT]);
  await h.session.setParameter('leftDistance', 2); await h.session.setParameter('leftDistance', 3); await settle();
  assert.equal(asked.length, 1, 'nothing fitted while the controls move');
  await wait(REFIT_MS + 50); await settle();
  assert.equal(asked.length, 2, 'one fit for the settled value');
  assert.equal(asked[1].inputs.leftDistance, 3);
  assert.deepEqual(renderer.cameras, [FIT, FAR], 'the wider bounds moved the camera once');
  h.session.resetView();
  assert.deepEqual(renderer.cameras.at(-1), FAR, 'Reset view: the fit of the current inputs');
  h.session.dispose();
  // A small change keeps the camera still.
  const n = harness({ runtimes: stubRuntimes(), fitView });
  n.session.attach(box); await n.session.start(n.block); await settle();
  await n.session.setParameter('leftDistance', 1.6); await wait(REFIT_MS + 50); await settle();
  assert.deepEqual(n.renderers.made[0].cameras, [FIT]);
  n.session.dispose();
});

test('fitted view: an action waits for the pending fit; a camera the learner moved is never refitted until Reset view', async () => {
  const FAR = { position: [0, 1, 12], target: [0, 0.5, 0], fov: 40 }, order = [];
  const fitView = async options => { order.push('fit'); return options.inputs?.leftDistance === 3 ? FAR : FIT; };
  const base = stubRuntimes();
  const runtimes = { made: base.made, factory: options => { const runtime = base.factory(options); const dispatch = runtime.dispatch.bind(runtime); runtime.dispatch = event => { order.push(event.type); return dispatch(event); }; return runtime; } };
  const h = harness({ runtimes, fitView });
  h.session.attach(box); await h.session.start(h.block); await settle();
  await h.session.setParameter('leftDistance', 3);
  await h.session.action('noop'); await settle();
  assert.deepEqual(order, ['fit', 'parameter', 'fit', 'action'], 'the fit ran before the action was sent');
  assert.deepEqual(h.renderers.made[0].cameras, [FIT, FAR]);
  const moved = { position: [9, 9, 9], target: [0, 0, 0], fov: 40 };
  h.renderers.made[0].options.onCameraChange(moved);
  await h.session.setParameter('leftDistance', 1.5); await wait(REFIT_MS + 50); await settle();
  assert.equal(order.filter(step => step === 'fit').length, 2, 'no fit over a camera the learner moved');
  h.session.dispose();
});

test('optional labels: the renderer says whether it has any; the choice is applied to it and to the next renderer', async () => {
  const h = harness({ runtimes: stubRuntimes(), renderer: { optionalLabels: true } });
  await started(h);
  assert.equal(h.state().optionalLabels, true);
  assert.deepEqual(h.renderers.made[0].labels, [true]);
  h.session.setLabels(false);
  assert.equal(h.state().labels, false);
  assert.deepEqual(h.renderers.made[0].labels, [true, false]);
  h.session.detach();
  await h.session.attach({}); await settle();
  assert.deepEqual(h.renderers.made[1].labels, [false], 'a retaken slot keeps the choice');
  h.session.dispose();
  const none = harness({ runtimes: stubRuntimes() });
  await started(none);
  assert.equal(none.state().optionalLabels, false);
  assert.deepEqual(none.renderers.made[0].labels, [], 'nothing to toggle');
  none.session.dispose();
});

test('a loop that plays to its end and stops itself shows as paused (the runtime\'s own play state)', async () => {
  const runtimes = realRuntimes(), artifact = watchArtifact();
  artifact.timeline.loop = false;
  const h = harness({ artifact, runtimes });
  h.block = { id: 'w2', fixtureId: 'orbit-watch' };
  await started(h);
  h.session.play();
  assert.equal(h.state().playing, true);
  for (let i = 0; i < 6; i++) { runtimes.clock.frame(2000); await settle(); }
  assert.equal(h.state().playing, false, 'stopped at its end');
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
