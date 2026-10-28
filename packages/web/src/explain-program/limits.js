// The runtime resource policy for generated /explain programs (plan docs/superpowers/plans/2026-10-28-explain-sandbox.md, 5.3).
// Starting values to measure, not product guarantees: change one only with evidence and bump the contract's
// PROGRAM_VERSIONS.runtimePolicyVersion. Size and shape bounds come from contract.js (one authoritative constant each).
import { CONTRACT_LIMITS } from './contract.js';

// The pinned engine (package.json): the version an artifact names, and the SHA-256 of the WASM it runs
// (runtime.test.mjs checks it against the installed file). An artifact naming anything else is version_unavailable.
export const ENGINE_VERSION = 'quickjs-release-sync@0.32.0';
export const ENGINE_FINGERPRINT = '105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232';

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
  activeRuntimes: 2, // live Workers across all cards; an idle one is evicted for a card that needs to run
  idleMs: 30000, // a Worker unused this long is terminated (its card restarts it on the next evaluate)
});
if (!(LIMITS.outputBytes > 0 && LIMITS.sourceBytes > 0 && LIMITS.outputDepth > 0)) throw Error('contract.js does not export the runtime size limits');
