// The one versioned resource policy for generated /explain programs (plan docs/superpowers/plans/2026-10-28-explain-sandbox.md, 5.3).
// Starting values to measure, not product guarantees: change one only with evidence and bump RUNTIME_POLICY_VERSION.
export const RUNTIME_POLICY_VERSION = 1;

export const LIMITS = Object.freeze({
  sourceBytes: 16 * 1024,
  manifestBytes: 4 * 1024,
  stateBytes: 32 * 1024,
  outputBytes: 256 * 1024,
  outputDepth: 32,
  heapBytes: 16 * 1024 * 1024, // guest heap (QuickJS runtime memory limit; not reliable alone, see wasmBytes)
  wasmBytes: 32 * 1024 * 1024, // hard cap on the engine's WASM linear memory, per Worker (16 MiB initial)
  stackBytes: 256 * 1024,
  interruptMs: 50, // one whole operation: source load, evaluate and serialization, inside the guest
  watchdogMs: 250, // host: then Worker.terminate
  bootMs: 2000, // host: cold engine boot
  objects: 240,
  objectsPerPart: 60,
  polylinePoints: 10000,
  controls: 4,
  inputStates: 64,
  activeRuntimes: 2,
});
