// The one source of the stamps a generated /explain program is sealed with (control plane, card fixtures) and verified against
// (host.js). Deliberately imports nothing: the page and control-plane bundles take these strings without QuickJS or zod.
// stamps.test.mjs fails on drift: the engine fingerprint against the installed WASM, the SDK fingerprint against SDK_SOURCE
// (sdk.js), and the policy versions against the contract's PROGRAM_VERSIONS (contract.js).

// The pinned interpreter (packages/web/package.json: quickjs-emscripten-core and @jitl/quickjs-wasmfile-release-sync 0.32.0).
export const ENGINE_VERSION = 'quickjs-release-sync@0.32.0';
// SHA-256 of that variant's emscripten-module.wasm.
export const ENGINE_FINGERPRINT = '105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232';
// SHA-256 of sdk.js SDK_SOURCE (sdkFingerprint()).
export const SDK_FINGERPRINT = '055af456c39a33723545f654b4901f901758101579b2a9fbc92ecc01aea6efe2';
export const RENDERER_VERSION = 'renderer-1';
export const RUNTIME_POLICY_VERSION = 'policy-1';
export const PERMISSION_PROFILE_VERSION = 'perm-1';

// Pass as sealProgram(bundle, PROGRAM_STAMPS) (contract.js). The host accepts exactly these.
export const PROGRAM_STAMPS = Object.freeze({
  runtimeVersion: ENGINE_VERSION,
  runtimePolicyVersion: RUNTIME_POLICY_VERSION,
  permissionProfileVersion: PERMISSION_PROFILE_VERSION,
  fingerprints: Object.freeze({ engine: ENGINE_FINGERPRINT, sdk: SDK_FINGERPRINT, renderer: RENDERER_VERSION }),
});
