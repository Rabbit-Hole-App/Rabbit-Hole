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

// The original SDK stamps for saved artifacts and fixtures.
export const PROGRAM_STAMPS = Object.freeze({
  runtimeVersion: ENGINE_VERSION,
  runtimePolicyVersion: RUNTIME_POLICY_VERSION,
  permissionProfileVersion: PERMISSION_PROFILE_VERSION,
  fingerprints: Object.freeze({ engine: ENGINE_FINGERPRINT, sdk: SDK_FINGERPRINT, renderer: RENDERER_VERSION }),
});
// The stateful contract (schema 2) on the same engine, SDK, renderer and policies.
export const STATEFUL_PROGRAM_STAMPS = Object.freeze({ ...PROGRAM_STAMPS, schemaVersion: 2 });

// New programs opt into the composable visual helpers. The old source and its fingerprint stay pinned.
export const VISUAL_SDK_VERSION = 'sdk-2';
const VISUAL_SDK_FINGERPRINT = 'a57c6921127c9ef2f7793d8b37641e8673ba0a99325b49e3e21cadef794958d1';
export const VISUAL_PROGRAM_STAMPS = Object.freeze({
  ...PROGRAM_STAMPS,
  sdkVersion: VISUAL_SDK_VERSION,
  fingerprints: Object.freeze({ ...PROGRAM_STAMPS.fingerprints, sdk: VISUAL_SDK_FINGERPRINT }),
});
export const STATEFUL_VISUAL_PROGRAM_STAMPS = Object.freeze({ ...VISUAL_PROGRAM_STAMPS, schemaVersion: 2 });

export const MEDIUM_CAPABILITY = 'medium_visuals';
export const MEDIUM_SDK_VERSION = 'sdk-4';
const MEDIUM_RENDERER_VERSION = 'renderer-3';
export const MEDIUM_PROGRAM_STAMPS = Object.freeze({
  ...VISUAL_PROGRAM_STAMPS,
  sdkVersion: MEDIUM_SDK_VERSION,
  rendererVersion: MEDIUM_RENDERER_VERSION,
  fingerprints: Object.freeze({ ...VISUAL_PROGRAM_STAMPS.fingerprints, sdk: '2cc86433d85c08ec6b622db40e3e56f7ea330b533fbda0ee11557ac9928b944e', renderer: MEDIUM_RENDERER_VERSION }),
});
export const STATEFUL_MEDIUM_PROGRAM_STAMPS = Object.freeze({ ...MEDIUM_PROGRAM_STAMPS, schemaVersion: 2 });

// Cyclic layouts append to, rather than mutate, the saved Medium SDK.
export const CYCLIC_CAPABILITY = 'cyclic_networks';
export const CYCLIC_SDK_VERSION = 'sdk-5';
export const CYCLIC_PROGRAM_STAMPS = Object.freeze({
  ...MEDIUM_PROGRAM_STAMPS,
  sdkVersion: CYCLIC_SDK_VERSION,
  fingerprints: Object.freeze({ ...MEDIUM_PROGRAM_STAMPS.fingerprints, sdk: '31d2a648fd3b26ab9369dd24cd51da972f7801622289a3abdfbaff78d357b083' }),
});
export const STATEFUL_CYCLIC_PROGRAM_STAMPS = Object.freeze({ ...CYCLIC_PROGRAM_STAMPS, schemaVersion: 2 });
// The heat-grid frame kind is an opt-in extension. Existing cards retain their original SDK bytes and renderer tuple.
export const HEAT_GRID_SDK_VERSION = 'sdk-3';
const HEAT_GRID_RENDERER_VERSION = 'renderer-2';
export const HEAT_GRID_PROGRAM_STAMPS = Object.freeze({
  ...VISUAL_PROGRAM_STAMPS,
  sdkVersion: HEAT_GRID_SDK_VERSION,
  rendererVersion: HEAT_GRID_RENDERER_VERSION,
  fingerprints: Object.freeze({ ...PROGRAM_STAMPS.fingerprints, sdk: 'db982cd2a515393b51723573cd7d1f89a5f61cafab0fd7b5aab158eb92ffa902', renderer: HEAT_GRID_RENDERER_VERSION }),
});
export const STATEFUL_HEAT_GRID_PROGRAM_STAMPS = Object.freeze({ ...HEAT_GRID_PROGRAM_STAMPS, schemaVersion: 2 });

// Raster pixels are numeric data rendered by the trusted shared renderer.
export const RASTER_CAPABILITY = 'raster_visuals';
export const RASTER_SDK_VERSION = 'sdk-6';
export const RASTER_PROGRAM_STAMPS = Object.freeze({
  ...CYCLIC_PROGRAM_STAMPS,
  sdkVersion: RASTER_SDK_VERSION,
  rendererVersion: 'renderer-4',
  fingerprints: Object.freeze({ ...CYCLIC_PROGRAM_STAMPS.fingerprints, sdk: 'fbfae318e08fc29cb9a6b8e3bbb69c5da3a9cd5d70ccf02d50526afa14170efa', renderer: 'renderer-4' }),
});
export const STATEFUL_RASTER_PROGRAM_STAMPS = Object.freeze({ ...RASTER_PROGRAM_STAMPS, schemaVersion: 2 });

// Every version tuple host.js will run, whole: an artifact runs only if all of these fields equal one entry exactly. No "same major",
// no field ignored. A new engine, SDK, renderer or policy is a new entry, added beside the old one while artifacts sealed with it remain.
const tuple = (schemaVersion, stamps) => Object.freeze({ schemaVersion, sdkVersion: 'sdk-1', rendererVersion: RENDERER_VERSION, ...stamps });
export const SUPPORTED_PROGRAM_TUPLES = Object.freeze([
  tuple(1, PROGRAM_STAMPS), tuple(2, STATEFUL_PROGRAM_STAMPS),
  tuple(1, VISUAL_PROGRAM_STAMPS), tuple(2, STATEFUL_VISUAL_PROGRAM_STAMPS),
  tuple(1, MEDIUM_PROGRAM_STAMPS), tuple(2, STATEFUL_MEDIUM_PROGRAM_STAMPS),
  tuple(1, CYCLIC_PROGRAM_STAMPS), tuple(2, STATEFUL_CYCLIC_PROGRAM_STAMPS),
  tuple(1, RASTER_PROGRAM_STAMPS), tuple(2, STATEFUL_RASTER_PROGRAM_STAMPS),
  tuple(1, HEAT_GRID_PROGRAM_STAMPS), tuple(2, STATEFUL_HEAT_GRID_PROGRAM_STAMPS),
]);
