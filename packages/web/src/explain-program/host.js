// The page side of a generated /explain program (plan 5.2, Task 3). One host per card instance and artifact: it verifies the
// artifact (strict schema, host-computed hashes, one exactly supported version tuple) before anything runs, keeps one request
// in flight with only the newest waiting evaluate (older waiting evaluates are superseded; initialize and reduce are never
// superseded and run in the order asked), stops a Worker that misses its watchdog or boot deadline with Worker.terminate, and
// validates every result against the contract before returning it. Late or foreign messages are ignored. Across all cards at most
// LIMITS.activeRuntimes Workers live: an idle card's Worker is evicted for a card that needs to run, and an unused Worker is
// terminated after LIMITS.idleMs. Inputs and state live outside the guest (the caller keeps them), so terminating a Worker loses nothing.
//   createProgramHost({ artifact }) -> { evaluate(request, { supersede }), initialize(request), reduce(request), dispose(reason) }; programStamps()
// evaluate resolves { requestId, frame, quantities, metrics }; initialize({ requestId, inputs, seed }) and reduce({ requestId, state,
// event, inputs, time, seed }) resolve { requestId, state, metrics } and exist only for a schema 2 artifact (else unsupported_capability).
// Each rejects a contract RuntimeError; a superseded or disposed request rejects an AbortError (DOMException), which the card ignores.
import {
  RuntimeError, STATEFUL_SCHEMA_VERSION, parseArtifact, parseEvaluateRequest, parseGuestResult, parseInitializeRequest, parseReduceRequest,
  parseState, parseStatefulEvaluateRequest, verifyHashes,
} from './contract.js';
import { LIMITS } from './limits.js';
import { PROGRAM_STAMPS, SUPPORTED_PROGRAM_TUPLES } from './stamps.js';

const aborted = reason => new DOMException(reason, 'AbortError');
const defaultWorker = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

// The shared runtime budget: hosts holding a Worker, least recently used first, and hosts waiting for a slot.
const live = new Set();
const waiters = [];
const wake = () => waiters.splice(0).forEach(resolve => resolve());
export const liveRuntimeCount = () => live.size;

// The stamps this host's builds seal with (stamps.js), for sealProgram (contract.js). Async for the card's existing call.
export const programStamps = async () => PROGRAM_STAMPS;

// Every field of one supported tuple, exactly: schema, engine, SDK, renderer, both policies and all three fingerprints.
const supported = program => SUPPORTED_PROGRAM_TUPLES.some(({ fingerprints, ...versions }) =>
  Object.entries(versions).every(([key, value]) => program[key] === value)
  && Object.keys(program.fingerprints).length === Object.keys(fingerprints).length
  && Object.entries(fingerprints).every(([key, value]) => program.fingerprints[key] === value));

// The synchronous half of verification (schema and version), so a request can be checked against the manifest when it is made.
function admit(artifact) {
  const parsed = parseArtifact(artifact);
  if (!parsed.ok) return { error: parsed.error };
  if (!supported(parsed.value)) return { error: new RuntimeError('version_unavailable', `artifact needs ${parsed.value.runtimeVersion} (schema ${parsed.value.schemaVersion})`) };
  return { program: parsed.value };
}

// A request for this artifact's schema. Schema 1 has evaluate only, with state null, exactly as before.
function parseRequest(operation, raw, program) {
  if (program.schemaVersion !== STATEFUL_SCHEMA_VERSION) {
    return operation === 'evaluate' ? parseEvaluateRequest(raw) : { ok: false, error: new RuntimeError('unsupported_capability', `schema ${program.schemaVersion} has no ${operation}`) };
  }
  if (operation === 'initialize') return parseInitializeRequest(raw);
  if (operation === 'reduce') return parseReduceRequest(raw, program.manifest);
  return parseStatefulEvaluateRequest(raw);
}
// A Worker's value for this operation, validated: a frame (with a schema 2 viewport) or a state.
function parseResult(operation, value, program) {
  if (operation !== 'evaluate') {
    const state = parseState(value);
    return state.ok ? { ok: true, value: { state: state.value } } : state;
  }
  return parseGuestResult(value, program.manifest);
}

export function createProgramHost({ artifact, limits = LIMITS, createWorker = defaultWorker }) {
  const admission = admit(artifact);
  const verified = admission.error ? Promise.reject(admission.error)
    : verifyHashes(admission.program).then(ok => {
      if (!ok) throw new RuntimeError('invalid_program', 'stored hashes do not match the artifact');
      return admission.program;
    });
  verified.catch(() => {}); // reported through each request
  let worker = null, booting = null, inFlight = null, queue = [], disposed = false, idleTimer;
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

  // The Worker's runtime bounds source load, the call and serialization with one deadline (limits.interruptMs); this watchdog bounds the whole round trip.
  const send = (target, { operation, request }, program) => new Promise((resolve, reject) => {
    const started = performance.now();
    const timer = setTimeout(() => { if (worker === target) stopWorker(); reject(new RuntimeError('runtime_limit', 'host watchdog: Worker terminated')); }, limits.watchdogMs);
    target.onerror = () => { clearTimeout(timer); if (worker === target) stopWorker(); reject(new RuntimeError('runtime_error', 'Worker failed')); };
    target.onmessage = ({ data }) => {
      if (data?.id !== request.requestId || data.operation !== operation) return; // not the answer to this request
      clearTimeout(timer);
      if (data.phase === 'engine' && worker === target) stopWorker(); // the Worker closed itself
      // Where the run failed and how long it had been running (a load overrun is not an evaluate overrun): kept apart like the diagnostic, never in the message.
      if (!data.ok) return reject(Object.defineProperty(new RuntimeError(data.code, data.detail), 'where', { value: { phase: data.phase, ms: data.metrics?.ms ?? performance.now() - started }, enumerable: false }));
      const result = parseResult(operation, data.value, program);
      if (!result.ok) return reject(new RuntimeError(result.error.code, result.issue));
      resolve({ requestId: request.requestId, ...result.value, metrics: { ms: performance.now() - started, outputBytes: data.metrics.outputBytes } });
    };
    const { requestId, ...fields } = request;
    target.postMessage({ id: requestId, operation, source: program.source, request: fields });
  });

  async function pump() {
    if (host.busy || !queue.length || disposed) return;
    const job = queue.shift();
    inFlight = job;
    host.busy = true;
    clearTimeout(idleTimer);
    try {
      const program = await verified;
      await acquire();
      if (disposed) throw aborted('disposed');
      const value = await send(await boot(), job, program);
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

  // supersede: false is an evaluate that must answer (interaction.js checks a new state's frame with it); it neither replaces a
  // waiting frame nor is replaced.
  function request(operation, raw, { supersede = operation === 'evaluate' } = {}) {
    if (disposed) return Promise.reject(aborted('disposed'));
    if (admission.error) return Promise.reject(admission.error);
    const parsed = parseRequest(operation, raw, admission.program);
    if (!parsed.ok) return Promise.reject(parsed.error);
    return new Promise((resolve, reject) => {
      // Only a waiting frame request is superseded (a frame for older inputs is worthless); a state change is never dropped.
      if (supersede) queue = queue.filter(job => !job.supersede || (settle(job, () => job.reject(aborted('superseded by newer inputs'))), false));
      queue.push({ operation, supersede, request: parsed.value, resolve, reject, done: false });
      pump();
    });
  }

  return {
    evaluate: (raw, options) => request('evaluate', raw, options),
    initialize: raw => request('initialize', raw),
    reduce: raw => request('reduce', raw),
    dispose(reason = 'disposed') {
      if (disposed) return;
      disposed = true;
      for (const job of [inFlight, ...queue]) if (job) settle(job, () => job.reject(aborted(reason)));
      queue = [];
      stopWorker();
      wake();
    },
  };
}
