// The /animation behavior runtime (plan section 5, AN-04): a typed adapter over the audited /explain QuickJS Worker. The generated
// program runs only in explain-program/worker.js (runProgram: fresh context per operation, seeded Math.random, no host functions);
// this file owns admission, deadlines, ordering and the atomic commit. explain_program admission (host.js) is not used or widened:
// an animation artifact is admitted here by the animation contract, its exact program tuple and its recomputed sourceHash.
//
//   createAnimationRuntime({ artifact, workerFactory?, onFrame(frame, { time, stamp }), onError(error), saved?, inputs?, clock? }) ->
//     (inputs: the starting parameter values, invalid ones replaced by defaults; reset always returns to the defaults)
//     ready: Promise          admitted, initial (or hydrated) state committed and its frame published; rejects an AnimationRuntimeError
//     dispatch(event)         -> Promise<{ accepted: true, snapshot } | { accepted: false, reason, issues? }>
//     play() / pause()        -> { accepted, reason? }   a timeline (watch) loops or stops; a stepped rules scene ticks at 1/30 s
//     reset()                 -> Promise<result>         defaults + initialState again; a failed reset keeps the last good state
//     seek(time)              -> Promise<result>         prescribed/analytical with a timeline only
//     advance(ticks)          -> Promise<result>         stepped scenes only: the host runs `ticks` fixed steps now (review capture)
//     setSpeed(speed)         -> { accepted, reason? }   prescribed/analytical with a timeline only; a capabilities.speeds value
//     snapshot()              -> the committed snapshot (contract.js SNAPSHOT_SCHEMA) with the live time and paused flag, or null
//     dispose()
// Rules: one operation in flight; transitions run in order (at most QUEUE_CAP waiting; consecutive changes of one parameter and
// consecutive moves of one drag coalesce, newest wins); a result commits only through state.js commitAnimationStep, so a stale
// (reset, disposed, superseded) or invalid result changes nothing. Playback frames are presentation: evaluated at the clock's time
// for the committed state, never committed, and only the newest wanted time waits.
import { stateProblem } from '../explain-program/contract.js';
import { LIMITS } from '../explain-program/limits.js';
import { ANIMATION_CAPABILITIES } from './capabilities.js';
import { ANIMATION_PROGRAM_VERSIONS, hashProgramSource, resolveAnimationInputs, validateAnimationArtifact, validateAnimationEvent, validateAnimationFrame } from './contract.js';
import { commitAnimationStep } from './state.js';

export const QUEUE_CAP = 16;
export const MAX_STEPS_PER_FRAME = 2;
export const OVERLOAD_STEPS = 15; // half a second of simulation owed: sustained overload, pause instead of catching up
export const MAX_OVERRUNS = 3;
export const MAX_ADVANCE_TICKS = 120; // advance(): four seconds of steps, above the review's 90 // playback frames skipped in a row for the program's own deadline before the scene stops
const MAX_ELAPSED_MS = 250; // one displayed frame never owes more than this (a long frame is clamped, not replayed)

const MESSAGES = Object.freeze({
  invalid_artifact: 'This animation could not load.',
  invalid_program: 'This animation could not run. Your saved version is kept.',
  runtime_error: 'This animation could not run. Your saved version is kept.',
  invalid_output: 'This animation could not run. Your saved version is kept.',
  runtime_limit: 'This animation stopped because it exceeded its runtime limit.',
  overloaded: 'This animation paused because it could not keep up. Press Play to continue.',
  disposed: 'This animation was closed.',
});
// The learner sees the fixed message for the code; diagnostic (bounded, non-enumerable) is for logs only.
export class AnimationRuntimeError extends Error {
  // phase: where a program failure happened (load, setup, initialize, reduce, evaluate, engine), for review and repair; never shown.
  constructor(code, diagnostic, phase) {
    const known = Object.hasOwn(MESSAGES, code) ? code : 'runtime_error';
    super(MESSAGES[known]);
    this.name = 'AnimationRuntimeError';
    this.code = known;
    Object.defineProperty(this, 'diagnostic', { value: typeof diagnostic === 'string' ? diagnostic.slice(0, 500) : undefined, enumerable: false });
    Object.defineProperty(this, 'phase', { value: phase, enumerable: false });
  }
}
const frameOverrun = error => error?.code === 'runtime_limit' && error.diagnostic === 'time limit'; // runProgram's own 50 ms deadline

const defaultWorker = () => new Worker(new URL('../explain-program/worker.js', import.meta.url), { type: 'module' });
const defaultClock = {
  now: () => performance.now(),
  request: callback => requestAnimationFrame(callback),
  cancel: handle => cancelAnimationFrame(handle),
};

// ---- worker channel: one Worker per runtime, boot deadline, watchdog, at most LIMITS.activeRuntimes live animation Workers --------
// shortcut: this budget is separate from host.js's /explain pool (its `live` set is private), so a board can hold 2 + 2 Workers;
// share one pool when explain-program exports it (patch for P).
const live = new Set();
const waiters = [];
const wake = () => waiters.splice(0).forEach(resolve => resolve());
export const liveAnimationWorkers = () => live.size;

function createChannel({ workerFactory, limits, source }) {
  let worker = null, booting = null, busy = false, dead = false, idleTimer, count = 0, pending = null;
  const member = { busy: () => busy, release: () => stop() };
  function stop(error) {
    clearTimeout(idleTimer);
    if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); }
    worker = booting = null;
    if (error && pending) pending(error);
    if (live.delete(member)) wake();
  }
  async function acquire() {
    while (!live.has(member) && live.size >= limits.activeRuntimes) {
      const idle = [...live].find(other => !other.busy());
      if (idle) idle.release();
      else await new Promise(resolve => waiters.push(resolve));
      if (dead) throw new AnimationRuntimeError('disposed');
    }
    live.delete(member);
    live.add(member); // most recently used last
  }
  const boot = () => booting ??= new Promise((resolve, reject) => {
    const started = workerFactory();
    worker = started;
    const timer = setTimeout(() => { if (worker === started) stop(); reject(new AnimationRuntimeError('runtime_limit', 'engine boot deadline')); }, limits.bootMs);
    const failed = () => { clearTimeout(timer); if (worker === started) stop(); reject(new AnimationRuntimeError('invalid_program', 'engine did not load')); };
    started.onmessage = ({ data }) => (data?.ready ? (clearTimeout(timer), resolve(started)) : failed());
    started.onerror = failed;
  });
  const send = (target, operation, request) => new Promise((resolve, reject) => {
    const id = `a${++count}`;
    const done = (outcome, value) => { clearTimeout(timer); pending = null; outcome(value); };
    pending = error => done(reject, error);
    const timer = setTimeout(() => { if (worker === target) stop(); done(reject, new AnimationRuntimeError('runtime_limit', 'host watchdog: Worker terminated', operation)); }, limits.watchdogMs);
    target.onerror = () => { if (worker === target) stop(); done(reject, new AnimationRuntimeError('runtime_error', 'Worker failed', 'engine')); };
    target.onmessage = ({ data }) => {
      if (data?.id !== id || data.operation !== operation) return; // a late or foreign message
      if (data.phase === 'engine' && worker === target) stop(); // the Worker closed itself
      if (data.ok) done(resolve, data.value);
      else done(reject, new AnimationRuntimeError(data.code, data.detail, data.phase === 'serialize' ? operation : data.phase));
    };
    target.postMessage({ id, operation, source, request });
  });
  return {
    async call(operation, request) {
      if (dead) throw new AnimationRuntimeError('disposed');
      busy = true;
      clearTimeout(idleTimer);
      try {
        await acquire();
        return await send(await boot(), operation, request);
      } finally {
        busy = false;
        wake();
        if (!dead && worker) idleTimer = setTimeout(() => stop(), limits.idleMs);
      }
    },
    dispose() { dead = true; stop(new AnimationRuntimeError('disposed')); wake(); },
  };
}

// ---- runtime --------------------------------------------------------------------------------------------------------------------

export function createAnimationRuntime({
  artifact: raw, workerFactory = defaultWorker, onFrame = () => {}, onError = () => {}, saved = null, inputs: initialInputs = {},
  capabilities = ANIMATION_CAPABILITIES, limits = LIMITS, clock = defaultClock,
}) {
  let artifact = null, channel = null, committed = null, dead = false, generation = 0, stateful = false;
  let queue = [], busy = null, frameWanted = null, overruns = 0;
  let playing = false, speed = 1, anchor = { now: 0, time: 0 }, rafHandle = null, owed = 0, lastNow = 0;
  const dt = capabilities.stepSeconds;
  const report = error => { if (!dead && error?.code !== 'disposed') onError(error); };
  const settle = (job, result) => { for (const resolve of job.resolvers) resolve(result); job.resolvers = []; };
  const refused = reason => ({ accepted: false, reason });
  const seekable = () => !!artifact?.timeline && capabilities.seekBehaviors.includes(artifact.behavior);

  const call = (operation, request) => channel.call(operation, { seed: artifact.seed, ...request });
  const newState = async (operation, request) => {
    const state = await call(operation, request);
    const problem = stateProblem(state);
    if (problem) throw new AnimationRuntimeError('invalid_output', problem, operation);
    return state;
  };
  const evaluate = (inputs, time, state) => call('evaluate', { inputs, time, state });

  function currentTime() {
    if (!artifact || artifact.stepped || !artifact.timeline) return committed?.snapshot.time ?? 0;
    if (!playing) return anchor.time;
    const { duration, loop } = artifact.timeline, time = anchor.time + (clock.now() - anchor.now) / 1000 * speed;
    return loop ? time % duration : Math.min(time, duration); // from the anchor, so looping never accumulates drift
  }
  const reanchor = time => { anchor = { now: clock.now(), time }; };

  async function initialCandidate(inputs) {
    const state = stateful ? await newState('initialize', { inputs }) : null;
    return { snapshot: { inputs, state, seed: artifact.seed, time: 0, tick: 0, paused: true }, frame: await evaluate(inputs, 0, state) };
  }

  function commit(candidate, base, gen) {
    if (dead || gen !== generation) return { ok: false, reason: 'stale' };
    const result = commitAnimationStep(committed, { ...candidate, snapshot: { ...candidate.snapshot, paused: !playing } }, base ? base.snapshot.stamp : null);
    if (!result.ok) return result;
    committed = result.value;
    onFrame(committed.frame, { time: committed.snapshot.time, stamp: committed.snapshot.stamp });
    return result;
  }

  const ready = (async () => {
    const parsed = validateAnimationArtifact(raw, capabilities);
    if (!parsed.ok) throw new AnimationRuntimeError('invalid_artifact', JSON.stringify(parsed.issues.slice(0, 3)));
    const candidateArtifact = parsed.value, { program } = candidateArtifact;
    if (program) {
      if (Object.entries(ANIMATION_PROGRAM_VERSIONS).some(([key, value]) => program[key] !== value)) throw new AnimationRuntimeError('invalid_program', 'unsupported program tuple');
      if (await hashProgramSource(program.source) !== program.sourceHash) throw new AnimationRuntimeError('invalid_program', 'sourceHash does not match the source');
    }
    if (dead) throw new AnimationRuntimeError('disposed');
    artifact = candidateArtifact;
    stateful = artifact.actions.length > 0 || artifact.stepped || artifact.scene.nodes.some(node => node.selectable || node.drag);
    const gen = generation;
    if (!program) { // a static inspect scene: nothing runs
      const result = commit({ artifact, snapshot: { inputs: {}, state: null, seed: artifact.seed, time: 0, tick: 0 }, frame: {} }, null, gen);
      if (!result.ok) throw new AnimationRuntimeError('invalid_artifact', JSON.stringify(result.issues ?? result.reason));
      return;
    }
    channel = createChannel({ workerFactory, limits, source: program.source });
    // A saved snapshot is restored as it is (paused, no initialize) when it still validates with its own frame; otherwise start fresh.
    if (saved) {
      try {
        const frame = await evaluate(saved.inputs, saved.time, saved.state);
        if (commit({ artifact, snapshot: saved, frame }, null, gen).ok) { reanchor(committed.snapshot.time); return; }
      } catch (error) { if (error?.code === 'disposed') throw error; }
    }
    const result = commit({ artifact, ...(await initialCandidate(resolveAnimationInputs(artifact, initialInputs))) }, null, gen);
    if (!result.ok) throw new AnimationRuntimeError(result.reason === 'stale' ? 'disposed' : 'invalid_output', JSON.stringify(result.issues ?? []), 'evaluate');
  })().finally(() => pump());
  ready.catch(error => { channel?.dispose(); report(error); }); // a runtime that never got ready holds no Worker; the card makes a new one to retry

  async function pump() {
    if (busy || dead || !committed) return;
    let job = queue.shift();
    if (!job && frameWanted !== null) { job = { kind: 'frame', time: frameWanted, resolvers: [] }; frameWanted = null; }
    if (!job) return;
    busy = job;
    const gen = generation, base = committed;
    try {
      if (job.kind === 'frame') {
        const frame = validateAnimationFrame(await evaluate(base.snapshot.inputs, job.time, base.snapshot.state), artifact);
        if (!frame.ok) throw new AnimationRuntimeError('invalid_output', JSON.stringify(frame.issues.slice(0, 3)), 'evaluate');
        if (!dead && gen === generation && committed === base) { overruns = 0; onFrame(frame.value, { time: job.time, stamp: base.snapshot.stamp }); }
      } else {
        const result = commit(await job.compute(base), base, gen);
        settle(job, result.ok ? { accepted: true, snapshot: snapshot() } : { accepted: false, reason: result.reason, issues: result.issues });
        if (result.reason === 'invalid') { stopPlayback(); report(new AnimationRuntimeError('invalid_output', JSON.stringify(result.issues.slice(0, 3)), 'evaluate')); }
      }
    } catch (error) {
      settle(job, refused(error?.code ?? 'runtime_error'));
      if (gen === generation && !(job.kind === 'frame' && frameOverrun(error) && ++overruns < MAX_OVERRUNS)) { stopPlayback(); report(error); }
    } finally {
      busy = null;
      pump();
    }
  }
  const enqueue = (kind, compute) => new Promise(resolve => { queue.push({ kind, compute, resolvers: [resolve] }); pump(); });
  const want = time => { frameWanted = time; pump(); };

  // ---- playback ---------------------------------------------------------------------------------------------------------------
  function stopPlayback() {
    if (!playing) return;
    reanchor(currentTime());
    playing = false;
    owed = 0;
    if (rafHandle !== null) clock.cancel(rafHandle);
    rafHandle = null;
  }
  const schedule = () => { rafHandle = clock.request(displayFrame); };
  function displayFrame() {
    rafHandle = null;
    if (!playing || dead) return;
    const now = clock.now();
    if (artifact.stepped) {
      // Fixed dt, never dropped or merged: at most MAX_STEPS_PER_FRAME new steps per displayed frame, and none while earlier ones wait.
      owed += Math.min(now - lastNow, MAX_ELAPSED_MS) / 1000 / dt;
      lastNow = now;
      if (owed > OVERLOAD_STEPS) { stopPlayback(); report(new AnimationRuntimeError('overloaded', `${Math.floor(owed)} steps behind`)); return; }
      const waiting = queue.some(job => job.kind === 'step') || busy?.kind === 'step';
      for (let i = 0, due = waiting ? 0 : Math.min(MAX_STEPS_PER_FRAME, Math.floor(owed)); i < due; i += 1) { owed -= 1; enqueue('step', stepCandidate); }
    } else {
      const time = currentTime();
      if (!artifact.timeline.loop && time >= artifact.timeline.duration) { stopPlayback(); want(artifact.timeline.duration); return; }
      want(time);
    }
    schedule();
  }
  async function stepCandidate(base) {
    const { inputs } = base.snapshot, tick = base.snapshot.tick + 1, time = tick * dt;
    const state = await newState('reduce', { state: base.snapshot.state, event: { type: 'step', tick }, inputs, time });
    return { snapshot: { ...base.snapshot, state, tick, time }, frame: await evaluate(inputs, time, state) };
  }

  function snapshot() {
    return committed ? { ...committed.snapshot, time: currentTime(), paused: !playing } : null;
  }

  const api = {
    ready,
    dispatch(event) {
      if (dead) return Promise.resolve(refused('disposed'));
      if (!committed) return ready.then(() => api.dispatch(event), () => refused('not_ready'));
      const checked = validateAnimationEvent(event, artifact);
      if (!checked.ok) return Promise.resolve({ accepted: false, reason: 'invalid_event', issues: checked.issues });
      const next = checked.value;
      if (next.type === 'step') return Promise.resolve(refused('host_owned')); // the host owns the tick
      if (!artifact.program) return Promise.resolve(refused('not_interactive'));
      return new Promise(resolve => {
        const last = queue.at(-1), lastEvent = last?.kind === 'event' ? last.event : null;
        const sameParameter = next.type === 'parameter' && lastEvent?.type === 'parameter' && lastEvent.parameter === next.parameter;
        const sameDrag = (next.type === 'drag_move' || next.type === 'drag_end') && lastEvent?.type === 'drag_move' && lastEvent.node === next.node;
        if (sameParameter || sameDrag) { last.event = next; last.resolvers.push(resolve); return; }
        // ponytail: no slot is reserved for a drag's end as explain interaction.js does; a refused end is the card's to resend.
        if (queue.length >= QUEUE_CAP) { resolve(refused('busy')); return; }
        const job = { kind: 'event', event: next, resolvers: [resolve] };
        job.compute = async base => {
          const { event: current } = job, time = currentTime();
          const inputs = current.type === 'parameter' ? { ...base.snapshot.inputs, [current.parameter]: current.value } : base.snapshot.inputs;
          const state = stateful ? await newState('reduce', { state: base.snapshot.state, event: current, inputs, time }) : base.snapshot.state;
          return { snapshot: { ...base.snapshot, inputs, state, time }, frame: await evaluate(inputs, time, state) };
        };
        queue.push(job);
        pump();
      });
    },
    play() {
      if (dead || !committed) return refused('not_ready');
      if (!artifact.timeline && !artifact.stepped) return refused('unsupported');
      if (playing) return { accepted: true };
      if (artifact.timeline && !artifact.timeline.loop && anchor.time >= artifact.timeline.duration) anchor.time = 0;
      reanchor(anchor.time);
      lastNow = clock.now();
      owed = 0;
      playing = true;
      schedule();
      return { accepted: true };
    },
    pause() {
      if (!playing) return { accepted: true };
      stopPlayback();
      if (!artifact.stepped) want(anchor.time); // settle the picture on the exact paused moment
      return { accepted: true };
    },
    reset() {
      if (dead) return Promise.resolve(refused('disposed'));
      if (!committed) return ready.then(() => api.reset(), () => refused('not_ready'));
      generation += 1; // anything in flight or waiting is now stale
      queue.splice(0).forEach(job => settle(job, refused('reset')));
      frameWanted = null;
      stopPlayback();
      reanchor(0);
      return enqueue('reset', async () => initialCandidate(resolveAnimationInputs(artifact)));
    },
    seek(time) {
      if (dead || !committed) return Promise.resolve(refused('not_ready'));
      if (!seekable()) return Promise.resolve(refused('unsupported'));
      if (!(typeof time === 'number' && time >= 0 && time <= artifact.timeline.duration)) return Promise.resolve(refused('invalid_time'));
      reanchor(time);
      return enqueue('seek', async base => ({ snapshot: { ...base.snapshot, time }, frame: await evaluate(base.snapshot.inputs, time, base.snapshot.state) }));
    },
    // The host advancing a stepped scene by `ticks` fixed steps, in order, outside playback (the review capture uses it).
    // -> the last step's result; stops at the first refusal.
    async advance(ticks) {
      if (dead || !committed) return refused('not_ready');
      if (!artifact.stepped) return refused('unsupported');
      if (!(Number.isInteger(ticks) && ticks >= 0 && ticks <= MAX_ADVANCE_TICKS)) return refused('invalid_ticks');
      let result = { accepted: true, snapshot: snapshot() };
      for (let i = 0; i < ticks && result.accepted; i += 1) result = await enqueue('step', stepCandidate);
      return result;
    },
    setSpeed(next) {
      if (dead || !committed) return refused('not_ready');
      if (!seekable()) return refused('unsupported');
      if (!capabilities.speeds.includes(next)) return refused('invalid_speed');
      reanchor(currentTime());
      speed = next;
      return { accepted: true };
    },
    snapshot,
    dispose() {
      if (dead) return;
      stopPlayback();
      dead = true;
      queue.splice(0).forEach(job => settle(job, refused('disposed')));
      channel?.dispose();
    },
  };
  return api;
}
