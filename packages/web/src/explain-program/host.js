// The page side of a generated /explain program (plan 5.2, Task 3). One host per card instance and artifact: it verifies the
// artifact (strict schema, host-computed hashes, pinned engine and contract versions) before anything runs, keeps one request
// in flight with only the newest waiting (older waiting requests are superseded), stops a Worker that misses its watchdog or
// boot deadline with Worker.terminate, and validates every result against the contract before returning it. Late or foreign
// messages are ignored. Across all cards at most LIMITS.activeRuntimes Workers live: an idle card's Worker is evicted for a
// card that needs to run, and an unused Worker is terminated after LIMITS.idleMs. Inputs and state live outside the guest
// (the caller keeps them), so terminating a Worker loses nothing.
//   createProgramHost({ artifact }) -> { evaluate({ requestId, inputs, time, seed, state }), dispose(reason) }; programStamps()
// evaluate resolves { requestId, frame, quantities, metrics } or rejects a contract RuntimeError; a superseded or disposed
// request rejects an AbortError (DOMException), which the card ignores.
import { PROGRAM_VERSIONS, RuntimeError, parseArtifact, parseEvaluateRequest, parseGuestResult, verifyHashes } from './contract.js';
import { ENGINE_FINGERPRINT, ENGINE_VERSION, LIMITS } from './limits.js';
import { sdkFingerprint } from './sdk.js';

const aborted = reason => new DOMException(reason, 'AbortError');
const defaultWorker = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

// The shared runtime budget: hosts holding a Worker, least recently used first, and hosts waiting for a slot.
const live = new Set();
const waiters = [];
const wake = () => waiters.splice(0).forEach(resolve => resolve());
export const liveRuntimeCount = () => live.size;

// The stamps this host runs, for sealProgram (contract.js). The engine is named, not imported: no QuickJS in the page bundle.
export const programStamps = async () => ({
  runtimeVersion: ENGINE_VERSION,
  fingerprints: { engine: ENGINE_FINGERPRINT, sdk: await sdkFingerprint(), renderer: PROGRAM_VERSIONS.rendererVersion },
});

async function verify(artifact) {
  const parsed = parseArtifact(artifact);
  if (!parsed.ok) throw parsed.error;
  const program = parsed.value;
  const stamps = await programStamps();
  const pinned = program.runtimeVersion === stamps.runtimeVersion && program.fingerprints.engine === stamps.fingerprints.engine
    && program.fingerprints.sdk === stamps.fingerprints.sdk && Object.entries(PROGRAM_VERSIONS).every(([key, value]) => program[key] === value);
  if (!pinned) throw new RuntimeError('version_unavailable', `artifact needs ${program.runtimeVersion}`);
  if (!(await verifyHashes(program))) throw new RuntimeError('invalid_program', 'stored hashes do not match the artifact');
  return program;
}

export function createProgramHost({ artifact, limits = LIMITS, createWorker = defaultWorker }) {
  const verified = verify(artifact);
  verified.catch(() => {}); // reported through evaluate
  let worker = null, booting = null, inFlight = null, pending = null, disposed = false, idleTimer;
  const host = { busy: false, release: () => stopWorker() };
  const settle = (job, outcome) => { if (!job.done) { job.done = true; outcome(); } }; // each promise settles exactly once

  function stopWorker() {
    clearTimeout(idleTimer);
    if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); }
    worker = booting = null;
    if (live.delete(host)) wake();
  }

  async function acquire() {
    while (!live.has(host) && live.size >= limits.activeRuntimes) {
      const idle = [...live].find(other => !other.busy);
      if (idle) idle.release();
      else await new Promise(resolve => waiters.push(resolve));
      if (disposed) throw aborted('disposed');
    }
    if (disposed) throw aborted('disposed');
    live.delete(host);
    live.add(host); // most recently used last
  }

  const boot = () => booting ??= new Promise((resolve, reject) => {
    const started = createWorker();
    worker = started;
    const fail = detail => { clearTimeout(timer); if (worker === started) stopWorker(); reject(new RuntimeError('version_unavailable', detail)); };
    const timer = setTimeout(() => { if (worker === started) stopWorker(); reject(new RuntimeError('runtime_limit', 'engine boot deadline')); }, limits.bootMs);
    started.onmessage = ({ data }) => (data?.ready ? (clearTimeout(timer), resolve(started)) : fail('engine did not load'));
    started.onerror = () => fail('engine did not load');
  });

  const send = (target, request, source) => new Promise((resolve, reject) => {
    const started = performance.now();
    const timer = setTimeout(() => { if (worker === target) stopWorker(); reject(new RuntimeError('runtime_limit', 'host watchdog: Worker terminated')); }, limits.watchdogMs);
    target.onerror = () => { clearTimeout(timer); if (worker === target) stopWorker(); reject(new RuntimeError('runtime_error', 'Worker failed')); };
    target.onmessage = ({ data }) => {
      if (data?.id !== request.requestId) return; // not the answer to this request
      clearTimeout(timer);
      if (data.phase === 'engine' && worker === target) stopWorker(); // the Worker closed itself
      if (!data.ok) return reject(new RuntimeError(data.code, data.detail));
      const result = parseGuestResult(data.value);
      if (!result.ok) return reject(new RuntimeError(result.error.code, result.issue));
      resolve({ requestId: request.requestId, ...result.value, metrics: { ms: performance.now() - started, outputBytes: data.metrics.outputBytes } });
    };
    const { inputs, time, seed, state } = request;
    target.postMessage({ id: request.requestId, source, request: { inputs, time, seed, state } });
  });

  async function pump() {
    if (host.busy || !pending || disposed) return;
    const job = pending;
    pending = null;
    inFlight = job;
    host.busy = true;
    clearTimeout(idleTimer);
    try {
      const program = await verified;
      await acquire();
      if (disposed) throw aborted('disposed');
      const value = await send(await boot(), job.request, program.source);
      settle(job, () => job.resolve(value));
    } catch (error) {
      settle(job, () => job.reject(error));
    } finally {
      host.busy = false;
      inFlight = null;
      wake(); // this host is idle now, so a card waiting for a slot may evict it
      if (!disposed) {
        if (worker) idleTimer = setTimeout(stopWorker, limits.idleMs);
        pump();
      }
    }
  }

  return {
    evaluate(raw) {
      if (disposed) return Promise.reject(aborted('disposed'));
      const parsed = parseEvaluateRequest(raw);
      if (!parsed.ok) return Promise.reject(parsed.error);
      return new Promise((resolve, reject) => {
        if (pending) settle(pending, () => pending.reject(aborted('superseded by newer inputs')));
        pending = { request: parsed.value, resolve, reject, done: false };
        pump();
      });
    },
    dispose(reason = 'disposed') {
      if (disposed) return;
      disposed = true;
      for (const job of [inFlight, pending]) if (job) settle(job, () => job.reject(aborted(reason)));
      pending = null;
      stopWorker();
      wake();
    },
  };
}
