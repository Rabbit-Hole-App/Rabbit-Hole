// The runtime resource policy for generated /explain programs (plan docs/superpowers/plans/2026-10-28-explain-sandbox.md, 5.3).
// Starting values to measure, not product guarantees: change one only with evidence and bump RUNTIME_POLICY_VERSION.
// Size and shape bounds that the contract also enforces come from contract.js (one authoritative constant each).
import { CONTRACT_LIMITS } from './contract.js';

export const RUNTIME_POLICY_VERSION = 1;

export const LIMITS = Object.freeze({
  sourceBytes: CONTRACT_LIMITS.sourceBytes,
  outputBytes: CONTRACT_LIMITS.maxOutputBytes, // the complete guest result, UTF-8, bounded inside the guest while it serializes
  outputDepth: CONTRACT_LIMITS.depth,
  stateBytes: 32 * 1024,
  heapBytes: 16 * 1024 * 1024, // guest heap (QuickJS runtime memory limit; not reliable alone, see wasmBytes)
  wasmBytes: 32 * 1024 * 1024, // hard cap on the engine's WASM linear memory, per Worker (16 MiB initial)
  stackBytes: 256 * 1024,
  interruptMs: 50, // one whole operation: source load, evaluate and serialization, inside the guest
  watchdogMs: 250, // host: then Worker.terminate
  bootMs: 2000, // host: cold engine boot
  activeRuntimes: 2,
});
if (!(LIMITS.outputBytes > 0 && LIMITS.sourceBytes > 0 && LIMITS.outputDepth > 0)) throw Error('contract.js does not export the runtime size limits');
