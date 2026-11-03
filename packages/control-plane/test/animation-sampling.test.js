// Review capture sampling against the saved last draft of job aj_ad936ec1 (dev, 2026-11-02): a stepped SGD experiment with learning-rate
// and batch-size parameters and a Keep Path action. Its first review sampled the initial state, Keep Path and four Keep Paths, so both
// parameter extremes were omitted and Keep Path fired at tick 0 on an empty trail. The sealed draft runs on the REAL pinned engine (an
// in-process stand-in for the capture page's blob: Worker, as web animation3d/review.test.mjs), no model call.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sealArtifact } from '../src/animation-author.js';
import { enabledCapabilities } from '../src/animation-brief.js';
import { captureManifest } from '../src/animation-render.js';
import { candidatesOf } from '../animation-sgd-qualification.mjs';
import { reviewTicksOf } from '../../web/src/animation3d/review.js';
import { fitProblems } from '../src/animation-repair.js';
import { validateAnimationArtifact } from '../../web/src/animation3d/contract.js';
import { canonicalJson, sha256Hex } from '../../web/src/explain-program/contract.js';
import { runReviewProgram } from '../../web/src/animation3d/review.js';
import { createAnimationRuntime } from '../../web/src/animation3d/runtime.js';
import { steppedGameArtifact } from '../../web/src/animation3d/testdata/stepped-game.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/animation-aj_ad936ec1.json', import.meta.url), 'utf8'));
const sealed = async (draft = fixture.draft) => {
  const out = await sealArtifact(draft, { artifactId: fixture.resultId, revision: fixture.revision, planHash: fixture.planHash, model: fixture.servedModel, createdAt: fixture.createdAt, caps: enabledCapabilities() });
  const checked = validateAnimationArtifact(out, enabledCapabilities(), { draft: true });
  assert.ok(checked.ok, JSON.stringify(checked.issues?.slice(0, 3)));
  return checked.value;
};

let engineModule = null;
try { engineModule = await import('../../web/src/explain-program/runtime.js'); } catch { engineModule = null; }
const run = engineModule ? test : test.skip;
let engine;
before(async () => { if (engineModule) engine = await engineModule.loadEngine(); });
after(() => engine?.dispose?.());
const workerFactory = () => {
  const worker = {
    terminated: false, terminate() { worker.terminated = true; },
    postMessage: message => queueMicrotask(() => { if (!worker.terminated) worker.onmessage?.({ data: { id: message.id, ...engineModule.runProgram(engine, message) } }); }),
  };
  queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};
// One manifest entry through the capture page's program half, with the program state it ended in.
const capture = async (artifact, entry) => {
  let state;
  const createRuntime = options => { const runtime = createAnimationRuntime(options), dispose = runtime.dispose; runtime.dispose = () => { state = runtime.snapshot().state; dispose(); }; return runtime; };
  const done = await runReviewProgram({ artifact, artifactHash: await sha256Hex(canonicalJson(artifact)), view: entry.view, inputs: entry.inputs, time: entry.time, events: entry.events, leadTicks: entry.leadTicks, ticks: entry.ticks, seed: artifact.seed, theme: 'light', width: entry.width, height: entry.height }, { workerFactory, createRuntime });
  assert.equal(done.ok, true, JSON.stringify(done));
  return { ...done, state };
};
const byLabel = (manifest, label) => manifest.entries.find(e => e.view.name === 'default' && e.label === label);

// Owner 2026-11-02 (MVP1 correction): the main control one setting at a time, the others at their defaults: the initial state, the middle
// setting with Keep Path after steps, the high end; the low end and the joint extremes are listed as not sampled (checked offline).
test('the saved SGD draft seals to the reviewed artifact, and its sampling has the initial state, Keep Path after steps at the middle setting and the high end', async () => {
  const artifact = await sealed();
  assert.equal(await sha256Hex(canonicalJson(artifact)), fixture.artifactHash);
  assert.deepEqual(fixture.recordedCoverage.omitted, ['every parameter at its low end', 'every parameter at its high end'], 'the recorded first review omitted both extremes');
  const manifest = captureManifest(artifact);
  assert.deepEqual(manifest.coverage.sampled, [
    { label: 'initial', time: 0, events: 0, ticks: 0 },
    { label: 'learningRate at 0.08: 60 steps, then keepPath, then 30 steps', time: 0, events: 1, leadTicks: 60, ticks: 30 },
    { label: 'learningRate at its high end (0.6), after keepPath, then 90 steps', time: 0, events: 1, ticks: 90 },
  ]);
  assert.deepEqual(manifest.coverage.omitted, ['learningRate at its low end (0.01), after keepPath, then 90 steps', 'every parameter at its low end', 'every parameter at its high end', '60 steps, then action keepPath, then 30 steps', 'sequence of 4 events'], 'what is left out is listed, never claimed');
  assert.equal(manifest.entries.length, 6, 'the per-round budget is unchanged: 2 views x 3 states');
  assert.ok(manifest.entries.every(e => e.events.length <= 4 && e.leadTicks + e.ticks <= 90));
  const middle = byLabel(manifest, 'learningRate at 0.08: 60 steps, then keepPath, then 30 steps').inputs, high = byLabel(manifest, 'learningRate at its high end (0.6), after keepPath, then 90 steps').inputs;
  assert.deepEqual([middle, high], [{ ...high, learningRate: 0.08 }, { learningRate: 0.6, batchSize: '4', showTrueGradient: true }], 'only the learning rate varies; the comparison arrow stays on');
  // The review and repair requests still fit with this manifest's real ids, labels, inputs, events and ticks.
  assert.deepEqual(fitProblems({ ANTHROPIC_API_KEY: 'offline' }, artifact, { prompt: fixture.prompt, plan: fixture.plan, evidence: [] }, undefined, fixture.draft), []);
});

run('on the real engine: Keep Path acts on a nonempty trail, so the draft\'s no-op shows and a working one saves a path', async () => {
  const artifact = await sealed(), manifest = captureManifest(artifact), entry = byLabel(manifest, 'learningRate at 0.08: 60 steps, then keepPath, then 30 steps');
  const before = await capture(artifact, { ...entry, events: [], leadTicks: 0, ticks: entry.leadTicks });
  assert.ok(before.state.tr.length > 0, 'the trail Keep Path is pressed on is not empty');
  // The draft reads event.id; the host sends { type: 'action', action } (DIAGNOSIS 1f), so Keep Path does nothing. The capture now shows
  // it: no saved path, and the run did not restart (15 steps, not 5).
  const draft = await capture(artifact, entry);
  assert.equal(draft.trace.ticks, 90, 'the trace counts the steps before and after the action');
  assert.deepEqual([draft.state.kp.length, draft.trace.readouts.stepN], [0, 15]);
  // The same draft reading event.action saves a nonempty path and restarts; the old order (action, then steps) saved an empty one.
  const source = fixture.draft.program.source.replace("event.id==='keepPath'", "event.action==='keepPath'");
  assert.notEqual(source, fixture.draft.program.source);
  const working = await sealed({ ...fixture.draft, program: { ...fixture.draft.program, source } });
  const kept = await capture(working, entry);
  assert.ok(kept.state.kp.length > 0, `the saved path has ${kept.state.kp.length} points`);
  assert.equal(kept.trace.readouts.stepN, 5);
  const old = await capture(working, { ...entry, leadTicks: 0 });
  assert.equal(old.state.kp.length, 0);
  const highEntry = byLabel(manifest, 'learningRate at its high end (0.6), after keepPath, then 90 steps'), high = await capture(artifact, highEntry);
  const low = await capture(artifact, { ...highEntry, inputs: { ...highEntry.inputs, learningRate: 0.01 } }); // the low end, checked offline (not model-reviewed)
  assert.ok(low.state.k > 0 && high.state.k > 0, 'both extremes took steps');
  assert.notEqual(low.trace.stateHash, high.trace.stateHash);
  assert.deepEqual([low.state.div, high.state.div], [false, true], 'the high learning rate reaches the diverged state the plan promises');
});

run('a stepped game keeps its action and win paths covered, initial state first', async () => {
  const artifact = await steppedGameArtifact(), manifest = captureManifest(artifact);
  assert.deepEqual(manifest.coverage.sampled.map(s => s.label), ['initial', '60 steps, then action launch, then 30 steps', 'sequence of 4 events']);
  assert.deepEqual(manifest.coverage.omitted, []);
  const [initial, launched, sequence] = await Promise.all(manifest.coverage.sampled.map(s => capture(artifact, byLabel(manifest, s.label))));
  assert.equal(initial.trace.goal.status, 'playing');
  assert.equal(launched.trace.goal.status, 'won', 'Launch runs, then its steps land it');
  assert.equal(sequence.trace.goal.status, 'won');
});

// Round 4 (acceptance sequence 2, aj_0b6ca2b): a stepped experiment whose Run action starts the motion was sampled with the host's steps
// alone, so its high-rate state showed no run, no trail and no divergence ("Run was never pressed in the high-rate sample"). The action that
// starts motion (declares nothing or startsMotion true) is pressed once, last among the events, before the ticks; the others (Step, Save
// path, Clear trail declare startsMotion false) are unchanged and a scene with no such action is sampled as before.
const generated = JSON.parse(readFileSync(new URL('./fixtures/animation-aj_0b6ca2b.json', import.meta.url), 'utf8'));
const generatedArtifact = async () => (await candidatesOf(generated))[0].artifact;

test('a stepped experiment with a Run action is sampled after Run: the middle state ends with it, the high end presses it before the ticks, within the limits', async () => {
  const artifact = await generatedArtifact(), manifest = captureManifest(artifact);
  assert.deepEqual(artifact.actions.map(a => [a.id, a.startsMotion]), [['stepOnce', false], ['run', undefined], ['savePath', false], ['clearTrail', false]]);
  const [initial, middle, high] = manifest.coverage.sampled;
  assert.equal(initial.label, 'initial');
  // The comparison state: Run, let it run, the other actions in declared order (room for two), resume the motion if idle, run again (see the real-engine test below).
  assert.deepEqual(byLabel(manifest, middle.label).events.map(e => (e.type === 'action' ? e.action : e.type)), ['run', 'advance', 'stepOnce', 'savePath', 'resume']);
  const top = byLabel(manifest, high.label);
  assert.deepEqual([top.events.map(e => e.action), top.leadTicks, top.ticks], [['run'], 0, 90], `the high end presses Run, then 90 steps: ${high.label}`);
  assert.equal(manifest.entries.length, 6);
  assert.ok(manifest.entries.every(e => e.events.filter(x => x.type !== 'advance').length <= 4 && reviewTicksOf(e) <= 90), 'the capture limits hold across every phase');
});

run('on the real engine: the high-rate state now shows a run (steps taken, diverged) and the middle state ends in a run in progress with a trail', async () => {
  const artifact = await generatedArtifact(), manifest = captureManifest(artifact), [, middle, high] = manifest.coverage.sampled;
  const top = await capture(artifact, byLabel(manifest, high.label)), mid = await capture(artifact, byLabel(manifest, middle.label));
  assert.ok(top.state.step > 0 && top.state.status === 3, `high end: step ${top.state.step}, status ${top.state.status} (diverged)`);
  assert.ok(mid.state.step > 0 && mid.state.trail.length > 0 && mid.state.on, `middle: step ${mid.state.step}, trail ${mid.state.trail.length}, running ${mid.state.on}`);
  const before = await capture(artifact, { ...byLabel(manifest, high.label), events: [] }); // what the old sampler captured
  assert.deepEqual([before.state.step, before.state.status], [0, 0], 'without Run the host steps move nothing');
});

test('a stepped scene whose actions all declare startsMotion false, and a stepped game with only its Launch, are sampled as before', async () => {
  const sgd = JSON.parse(readFileSync(new URL('./fixtures/animation-mvp1-correction-artifact.json', import.meta.url), 'utf8'));
  assert.ok(sgd.actions.every(a => a.startsMotion === false));
  const high = captureManifest(sgd).coverage.sampled.find(s => /high end/.test(s.label));
  assert.deepEqual([high.label, high.events], ['learningRate at its high end (2.5), after 90 steps', 0], 'no action is added to the ticks');
  const manifest = captureManifest(await steppedGameArtifact());
  assert.deepEqual(manifest.coverage.sampled.map(s => s.label), ['initial', '60 steps, then action launch, then 30 steps', 'sequence of 4 events']);
});

// Owner finding 2026-11-03 on ca45900a2: the comparison capture gave a paused scene 60 lead ticks BEFORE any action (they accomplish nothing: the scene
// starts paused), then Step, Save path, Clear trail, Run, 30 ticks: the saved path was 1 point (the Step) and the current path 5. A comparison needs motion
// BEFORE the save: Run, let it run, Save path, restart the motion, let it run again. Replayed here on the committed generated program (animation-aj_0b6ca2b.json)
// through captureManifest and the real engine: motion occurs before the save, several points are saved, the next run draws beside them and leaves them alone.
run('on the real engine: the comparison capture runs before it saves, saves a multi-point path, restarts the motion and keeps the saved path while the new run draws', async () => {
  const artifact = await generatedArtifact(), manifest = captureManifest(artifact), [, middle] = manifest.coverage.sampled;
  const entry = byLabel(manifest, middle.label), end = await capture(artifact, entry);
  const save = entry.events.findIndex(e => e.action === 'savePath');
  assert.ok(save > 0, 'Save path is not the first thing pressed');
  const before = await capture(artifact, { ...entry, events: entry.events.slice(0, save), leadTicks: 0, ticks: 0 }); // the state just before Save path
  assert.ok(before.state.trail.length >= 5, `motion occurred before the save: ${before.state.trail.length} points drawn`);
  assert.ok(end.state.saved.length >= 5, `several points are saved, not one dot: ${end.state.saved.length}`);
  assert.deepEqual([end.state.trail.length, end.state.saved.length], [5, 9], 'the comparison capture of the generated program: 5 current-path points beside 9 saved-path points');
  assert.deepEqual(end.state.saved, before.state.trail, 'the saved path is exactly what the first run drew');
  assert.ok(end.state.trail.length >= 3 && end.state.on, `the motion restarted and the new run draws beside it: ${end.state.trail.length} points, running ${end.state.on}`);
  assert.ok(entry.events.filter(e => e.type !== 'advance').length <= 4 && reviewTicksOf(entry) <= 90, 'four actions and 90 ticks in all, across every phase');
});
