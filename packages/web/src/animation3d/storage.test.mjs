// AN-06: the animation3d card's board envelope, its bounded save and navigation flush, hydration with no model or job call (checked
// by the real contract against AN-01's fixtures), and the late-result guards (deleted or replaced card, board switch, cancelled or
// failed regeneration, newer learner edits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SNAPSHOT_SCHEMA as CONTRACT_SNAPSHOT_SCHEMA, resolveAnimationInputs } from './contract.js';
import { experimentFixture } from './fixtures.js';
import {
  ANIMATION3D, ENVELOPE_VERSION, MESSAGES, SAVE_DELAY, SAVE_MAX_WAIT, SNAPSHOT_SCHEMA, animationSavesPending, artifactIdentity, cancelAnimationJob,
  createAnimationSaver, freshEnvelope, hydrateAnimation, landHydration, nextView, readEnvelope, resetView, settleAnimationJob, withFlushedAnimations,
  withJob, withSimulation, withView,
} from './storage.js';

// The beam balance fixture with its beam selectable, so a saved selection is a valid one.
const ARTIFACT = structuredClone(experimentFixture.artifact);
ARTIFACT.scene.nodes.find(node => node.id === 'beam').selectable = true;
const REF = { ...artifactIdentity(ARTIFACT), boardId: 'board_A', cardId: 'card_1' };
const CAMERA = { position: [1, 2, 3], target: [0, 0, 0], fov: 50 };
const sim = (stamp, inputs = {}, extra = {}) => ({ schema: SNAPSHOT_SCHEMA, artifactId: REF.artifactId, revision: REF.revision, inputs: { ...resolveAnimationInputs(ARTIFACT), ...inputs }, state: null, seed: 1, time: 1.5, tick: 0, stamp, paused: true, ...extra });
const card = (envelope = { ...freshEnvelope(REF), sim: sim(3, { leftMass: 3 }), view: { revision: 2, camera: CAMERA, selection: 'beam' } }) => ({ id: 'card_1', type: ANIMATION3D, title: 'Beam balance', dx: 10, dy: 20, animation3d: envelope });
const OWNER = { kind: 'owner', boardId: 'board_A' };
const serve = (artifact = ARTIFACT) => async () => structuredClone(artifact);

// Timers under test control: now() and pending callbacks, run by advance(ms).
function fakeTimers() {
  let now = 1000, seq = 0;
  const due = new Map();
  return {
    set: (fn, ms) => { const id = ++seq; due.set(id, { at: now + ms, fn }); return id; },
    clear: id => due.delete(id),
    now: () => now,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...due.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        due.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = end;
    },
  };
}
// A card's write: the canvas's quiet change, applied to the latest block it holds.
function liveCard(block = card()) {
  const box = { block, writes: 0 };
  box.write = apply => { box.writes += 1; box.block = apply(box.block); };
  return box;
}

test('the snapshot schema matches the contract, and the reference pins plan, source and the runtime tuple', () => {
  assert.equal(SNAPSHOT_SCHEMA, CONTRACT_SNAPSHOT_SCHEMA);
  assert.equal(REF.sourceHash, ARTIFACT.program.sourceHash);
  assert.equal(REF.stamps.sdkVersion, 'animation-sdk-1');
  assert.equal(REF.stamps.source, undefined);
});

test('the board envelope holds a reference and state only: a scene, program or source on it is refused', () => {
  assert.equal(readEnvelope(card()).ok, true);
  for (const extra of [{ program: { source: 'x' } }, { scene: { nodes: [] } }, { source: 'export function evaluate() {}' }]) {
    assert.equal(readEnvelope(card({ ...card().animation3d, ...extra })).ok, false, Object.keys(extra)[0]);
  }
  assert.equal(readEnvelope(card({ ...card().animation3d, ref: { ...REF, source: 'x' } })).ok, false);
  assert.equal(readEnvelope({ ...card(), id: 'card_2' }).ok, false, 'a reference naming another card');
  assert.equal(readEnvelope(card({ ...card().animation3d, v: ENVELOPE_VERSION + 1 })).ok, false);
  assert.equal(readEnvelope(card({ ...card().animation3d, sim: sim(1, {}, { state: { big: 'x'.repeat(41000) } }) })).ok, false, 'over 40 KiB');
  assert.equal(readEnvelope(card({ ...card().animation3d, sim: sim(1, {}, { time: Infinity }) })).ok, false);
  assert.equal(readEnvelope(card({ ...card().animation3d, view: { revision: 1, camera: { position: [NaN, 0, 0] }, selection: null } })).ok, false);
  assert.ok(!JSON.stringify(card()).includes('export function'));
});

test('two fast parameter edits: one board write, the newer snapshot', () => {
  const timers = fakeTimers(), box = liveCard();
  const saver = createAnimationSaver({ boardId: 'board_A', cardId: 'card_1', write: box.write, timers });
  saver.simulation(sim(4, { leftMass: 5 }));
  timers.advance(100);
  saver.simulation(sim(5, { leftMass: 6 }));
  timers.advance(SAVE_DELAY - 1);
  assert.equal(box.writes, 0, 'not yet settled');
  timers.advance(1);
  assert.equal(box.writes, 1);
  assert.equal(box.block.animation3d.sim.inputs.leftMass, 6);
  assert.equal(box.block.animation3d.sim.stamp, 5);
  assert.equal(box.block.dx, 10, 'the card layout is untouched');
  saver.dispose();
});

test('continuous changes still save within the bounded wait, not on every change', () => {
  const timers = fakeTimers(), box = liveCard();
  const saver = createAnimationSaver({ boardId: 'board_A', cardId: 'card_1', write: box.write, timers });
  let revision = 2;
  for (let t = 0; t < SAVE_MAX_WAIT + 200; t += 50) { saver.view({ revision: ++revision, camera: { ...CAMERA, position: [t / 100, 0, 5] }, selection: null }); timers.advance(50); }
  assert.ok(box.writes >= 1 && box.writes <= 2, `writes: ${box.writes}`);
  saver.dispose();
});

test('save while navigating: the canvas flush takes a pending change into the board it saves, before the timer', () => {
  const timers = fakeTimers(), box = liveCard();
  const saver = createAnimationSaver({ boardId: 'board_A', cardId: 'card_1', write: box.write, timers });
  saver.simulation(sim(4, { leftMass: 9 }));
  assert.equal(animationSavesPending(), true);
  // The canvas's unmount / pagehide flush (patch a-canvas-flush.patch) runs before the card's own unmount.
  const other = { id: 'card_9', type: 'text' };
  const blocks = [card(), other];
  const flushed = withFlushedAnimations(blocks);
  assert.notEqual(flushed, blocks);
  assert.equal(flushed[0].animation3d.sim.inputs.leftMass, 9);
  assert.equal(flushed[1], other);
  assert.equal(box.writes, 1, 'the card state is told too');
  assert.equal(animationSavesPending(), false);
  timers.advance(SAVE_MAX_WAIT);
  assert.equal(box.writes, 1, 'no second write after the flush');
  assert.equal(withFlushedAnimations(flushed), flushed, 'nothing pending: same array');
  saver.dispose();
});

test('a flush never brings back a deleted card, never writes a card made on another canvas, and dispose flushes', () => {
  const timers = fakeTimers(), box = liveCard();
  const saver = createAnimationSaver({ boardId: 'board_A', cardId: 'card_1', write: box.write, timers });
  saver.simulation(sim(4));
  const elsewhere = card(freshEnvelope({ ...REF, boardId: 'board_B' }));
  assert.deepEqual(withFlushedAnimations([elsewhere]), [elsewhere], 'same card id, made on another board');
  assert.deepEqual(withFlushedAnimations([{ id: 'card_9' }]), [{ id: 'card_9' }], 'deleted card stays deleted');
  assert.equal(animationSavesPending(), true, 'still pending for its own board');
  saver.simulation(sim(5));
  saver.dispose();
  assert.equal(box.block.animation3d.sim.stamp, 5);
  assert.equal(animationSavesPending(), false);
  saver.simulation(sim(6));
  timers.advance(SAVE_MAX_WAIT);
  assert.equal(box.block.animation3d.sim.stamp, 5, 'a disposed saver writes nothing');
});

test('simulation commits only go forward and only for the saved artifact revision', () => {
  const block = card();
  assert.equal(withSimulation(block, sim(3)).reason, 'stale');
  assert.equal(withSimulation(block, sim(2)).reason, 'stale');
  assert.equal(withSimulation(block, sim(4, {}, { revision: REF.revision + 1 })).reason, 'other_artifact');
  assert.equal(withSimulation(block, sim(4, {}, { artifactId: 'other' })).reason, 'other_artifact');
  assert.match(withSimulation(block, sim(4, {}, { seed: -1 })).reason, /^invalid/);
  assert.equal(withSimulation(block, sim(4)).applied, true);
  assert.equal(withSimulation({ id: 'card_1' }, sim(4)).reason, 'no_envelope');
});

test('Scene Reset restores simulation defaults and keeps the camera; Reset view changes only the camera', () => {
  const block = card();
  const reset = withSimulation(block, sim(4, {}, { time: 0 }));
  assert.equal(reset.applied, true);
  assert.deepEqual(reset.block.animation3d.view, block.animation3d.view);
  assert.deepEqual(reset.block.animation3d.sim.inputs, resolveAnimationInputs(ARTIFACT));
  const view = resetView(reset.block, ARTIFACT.camera);
  assert.equal(view.applied, true);
  assert.deepEqual(view.block.animation3d.view.camera, ARTIFACT.camera);
  assert.equal(view.block.animation3d.view.selection, 'beam');
  assert.deepEqual(view.block.animation3d.sim, reset.block.animation3d.sim);
});

test('a worker reply never replaces a newer orbit or selection', () => {
  const block = card(); // view revision 2
  const worker = { revision: 3, camera: CAMERA, selection: null }; // computed against revision 2
  const orbit = withView(block, nextView(block, { camera: { ...CAMERA, position: [9, 9, 9] } })).block; // learner: revision 3
  assert.equal(withView(orbit, worker).reason, 'stale');
  assert.equal(orbit.animation3d.view.selection, 'beam');
  assert.deepEqual(orbit.animation3d.sim, block.animation3d.sim, 'a camera save needs no simulation change');
});

test('reload: restored paused at the saved state and time, with one artifact read and zero model or job calls', async () => {
  const calls = { read: 0, job: 0, model: 0 };
  const api = { readArtifact: async ref => { calls.read += 1; assert.deepEqual(ref, REF); return structuredClone(ARTIFACT); }, createJob: () => { calls.job += 1; }, getJob: () => { calls.job += 1; }, model: () => { calls.model += 1; } };
  const block = card({ ...card().animation3d, sim: sim(3, { leftMass: 3 }, { paused: false }) });
  const out = await hydrateAnimation(block, { context: OWNER, readArtifact: api.readArtifact });
  assert.equal(out.status, 'ready', out.message);
  assert.equal(out.playing, false);
  assert.equal(out.sim.paused, true, 'restored paused even if saved while playing');
  assert.equal(out.sim.time, 1.5);
  assert.equal(out.sim.inputs.leftMass, 3);
  assert.deepEqual(out.view, block.animation3d.view);
  assert.equal(out.artifact.artifactId, REF.artifactId);
  assert.deepEqual(calls, { read: 1, job: 0, model: 0 });
});

test('a saved state or view the contract refuses is dropped and the artifact still loads', async () => {
  const badInputs = card({ ...card().animation3d, sim: sim(3, { leftMass: 999 }) });
  const out = await hydrateAnimation(badInputs, { context: OWNER, readArtifact: serve() });
  assert.equal(out.status, 'ready');
  assert.equal(out.sim, null);
  assert.ok(out.dropped);
  const badSelection = card({ ...card().animation3d, view: { revision: 2, camera: CAMERA, selection: 'pivot' } }); // not selectable
  const view = await hydrateAnimation(badSelection, { context: OWNER, readArtifact: serve() });
  assert.equal(view.status, 'ready');
  assert.equal(view.view, null, 'the artifact camera instead');
  assert.ok(view.sim);
});

test('missing artifact: an honest placeholder, the saved card untouched', async () => {
  const block = card();
  const before = JSON.stringify(block);
  for (const readArtifact of [async () => null, async () => { throw Object.assign(new Error('gone'), { status: 404 }); }]) {
    const out = await hydrateAnimation(block, { context: OWNER, readArtifact });
    assert.equal(out.status, 'missing');
    assert.equal(out.message, MESSAGES.missing);
  }
  const offline = await hydrateAnimation(block, { context: OWNER, readArtifact: async () => { throw Object.assign(new Error('x'), { status: 503 }); } });
  assert.equal(offline.status, 'error');
  assert.equal(offline.retry, true);
  assert.equal(JSON.stringify(block), before);
});

test('artifact, hash or runtime-stamp mismatch is refused with a recoverable state', async () => {
  const edit = change => { const copy = structuredClone(ARTIFACT); change(copy); return copy; };
  const cases = {
    'tampered source': edit(a => { a.program.source += '\n// changed'; }),
    'other revision': edit(a => { a.revision = 2; }),
    'other artifact': edit(a => { a.artifactId = 'fixture-other'; }),
    'other plan': edit(a => { a.planHash = 'f'.repeat(64); }),
    'foreign program tuple': edit(a => { a.program.rendererVersion = 'animation-renderer-2'; }),
    'unknown capability version': edit(a => { a.capabilityVersion = 'animation-capabilities/9'; }),
    'not an artifact': { hello: 'world' },
  };
  for (const [name, artifact] of Object.entries(cases)) {
    const out = await hydrateAnimation(card(), { context: OWNER, readArtifact: serve(artifact) });
    assert.equal(out.status, 'mismatch', name);
    assert.equal(out.retry, true);
    assert.equal(out.message, MESSAGES.mismatch);
    assert.equal(out.artifact, undefined, `${name}: nothing to run`);
  }
  // The saved reference itself pins a tuple this build does not run.
  const pinned = card({ ...card().animation3d, ref: { ...REF, stamps: { ...REF.stamps, sdkVersion: 'animation-sdk-0' } } });
  assert.equal((await hydrateAnimation(pinned, { context: OWNER, readArtifact: serve() })).status, 'mismatch');
});

test('share links, publications and forks get the unavailable placeholder and never reach the owner read', async () => {
  let reads = 0;
  const readArtifact = async () => { reads += 1; return structuredClone(ARTIFACT); };
  for (const kind of ['share', 'publication', 'embed', undefined]) {
    const out = await hydrateAnimation(card(), { context: { kind, boardId: 'board_A' }, readArtifact });
    assert.equal(out.status, 'unavailable');
    assert.equal(out.message, MESSAGES.shared);
  }
  const fork = await hydrateAnimation(card(), { context: { kind: 'fork', boardId: 'board_F' }, readArtifact });
  assert.equal(fork.message, MESSAGES.copied);
  // A card copied into the owner's other canvas still names the canvas it was made on.
  const copied = await hydrateAnimation(card(), { context: { kind: 'owner', boardId: 'board_B' }, readArtifact });
  assert.equal(copied.status, 'unavailable');
  assert.equal(copied.message, MESSAGES.copied);
  assert.equal(reads, 0);
  for (const message of Object.values(MESSAGES)) assert.ok(!/\.\.\.|…/.test(message), message);
});

test('late hydration: the learner edits made while it loaded win, and it never lands on another card or canvas', async () => {
  let release;
  const block = card();
  const loading = hydrateAnimation(block, { context: OWNER, readArtifact: () => new Promise(resolve => { release = resolve; }) });
  // Meanwhile the learner changes a parameter and orbits.
  const live = withView(withSimulation(block, sim(4, { leftMass: 5 })).block, nextView(block, { camera: { ...CAMERA, position: [0, 9, 0] } })).block;
  release(structuredClone(ARTIFACT));
  const out = await loading;
  const landed = landHydration(live, out, { boardId: 'board_A' });
  assert.equal(landed.ok, true);
  assert.equal(landed.sim.inputs.leftMass, 5);
  assert.deepEqual(landed.view.camera.position, [0, 9, 0]);
  assert.equal(landHydration(null, out, { boardId: 'board_A' }).reason, 'card_deleted');
  assert.equal(landHydration(live, out, { boardId: 'board_B' }).reason, 'board_switched');
  const replaced = { ...live, animation3d: freshEnvelope({ ...REF, revision: REF.revision + 1 }) };
  assert.equal(landHydration(replaced, out, { boardId: 'board_A' }).reason, 'replaced');
  assert.equal(landHydration({ ...live, id: 'card_2' }, out, { boardId: 'board_A' }).reason, 'other_card');
});

test('an aborted hydration (card hidden or closed) reports aborted, never ready', async () => {
  const controller = new AbortController();
  const out = await hydrateAnimation(card(), { context: OWNER, readArtifact: async () => { controller.abort(); return structuredClone(ARTIFACT); }, signal: controller.signal });
  assert.equal(out.status, 'aborted');
});

// ---- jobs ----
const JOB = { id: 'job_2', boardId: 'board_A', cardId: 'card_1', requestId: 'req_2', stage: 'authoring' };
const NEXT = { artifactId: 'fixture-beam-balance-2', revision: 2, planHash: 'a'.repeat(64), sourceHash: 'b'.repeat(64), stamps: REF.stamps };
const RESULT = { ...NEXT, cardId: 'card_1', canvas: { boardId: 'board_A' }, sourceKey: '[]', baseRevision: REF.revision };
const regenerating = () => withJob(card(), { job: JOB, boardId: 'board_A', requestId: 'req_2', sourceKey: '[]', baseRevision: REF.revision });

test('a regeneration result lands on its own card with the new version, its own camera and initial state', () => {
  const progress = settleAnimationJob(regenerating(), { ...JOB, stage: 'reviewing' }, { boardId: 'board_A' });
  assert.equal(progress.action, 'progress');
  assert.equal(progress.block.animation3dJob.stage, 'reviewing');
  const out = settleAnimationJob(progress.block, { ...JOB, stage: 'ready', result: RESULT }, { boardId: 'board_A' });
  assert.equal(out.action, 'apply');
  assert.equal(out.block.animation3dJob, undefined);
  assert.deepEqual(out.block.animation3d, freshEnvelope({ ...NEXT, boardId: 'board_A', cardId: 'card_1' }));
  assert.equal(out.block.dx, 10);
  assert.equal(readEnvelope(out.block).ok, true);
});

test('failed or cancelled regeneration keeps the current good version', () => {
  const failed = settleAnimationJob(regenerating(), { ...JOB, stage: 'failed', failure: { message: 'The scene could not be made.' } }, { boardId: 'board_A' });
  assert.equal(failed.action, 'keep');
  assert.deepEqual(failed.block.animation3d, card().animation3d);
  assert.equal(failed.block.animation3dJob.message, 'The scene could not be made.');
  // A result that arrives after the failure is refused.
  assert.equal(settleAnimationJob(failed.block, { ...JOB, stage: 'ready', result: RESULT }, { boardId: 'board_A' }).reason, 'failed');
  // Stop on the card: the late result never lands.
  const stopped = cancelAnimationJob(regenerating());
  const late = settleAnimationJob(stopped, { ...JOB, stage: 'ready', result: RESULT }, { boardId: 'board_A' });
  assert.equal(late.action, 'ignore');
  assert.equal(late.reason, 'cancelled');
  assert.deepEqual(stopped.animation3d, card().animation3d);
});

test('deleted or replaced card, board switch and foreign results are ignored', () => {
  const ready = { ...JOB, stage: 'ready', result: RESULT };
  assert.equal(settleAnimationJob(null, ready, { boardId: 'board_A' }).reason, 'card_deleted');
  assert.equal(settleAnimationJob(card(), ready, { boardId: 'board_A' }).reason, 'not_waiting');
  assert.equal(settleAnimationJob(regenerating(), ready, { boardId: 'board_B' }).reason, 'board_switched');
  assert.equal(settleAnimationJob(regenerating(), { ...ready, id: 'job_3' }, { boardId: 'board_A' }).reason, 'other_job');
  // The card asked again (a new request replaced the job binding): the old request's answer is refused.
  assert.equal(settleAnimationJob(regenerating(), { ...ready, requestId: 'req_1' }, { boardId: 'board_A' }).reason, 'replaced');
  // Another version was accepted meanwhile.
  const moved = { ...regenerating(), animation3d: freshEnvelope({ ...REF, revision: 9 }) };
  assert.equal(settleAnimationJob(moved, ready, { boardId: 'board_A' }).reason, 'stale_base');
  for (const result of [{ ...RESULT, cardId: 'card_2' }, { ...RESULT, canvas: { boardId: 'board_B' } }, { ...RESULT, sourceKey: '["file_1@r2"]' }, { ...RESULT, baseRevision: 0 }]) {
    assert.equal(settleAnimationJob(regenerating(), { ...ready, result }, { boardId: 'board_A' }).reason, 'other_result');
  }
  assert.match(settleAnimationJob(regenerating(), { ...ready, result: { ...RESULT, planHash: 'https://x.test/a' } }, { boardId: 'board_A' }).reason, /^invalid_result/);
});

test('a first generation lands on its pending card', () => {
  const pending = withJob({ id: 'card_1', type: ANIMATION3D, title: 'Pendulum' }, { job: JOB, boardId: 'board_A', requestId: 'req_2', sourceKey: '[]' });
  const out = settleAnimationJob(pending, { ...JOB, stage: 'ready', result: { ...RESULT, baseRevision: null } }, { boardId: 'board_A' });
  assert.equal(out.action, 'apply');
  assert.equal(out.block.animation3d.ref.revision, 2);
});
