// stamps.js is the single source of seal/verify stamps: it imports nothing, every value matches what it names, and the host
// accepts exactly an artifact sealed with PROGRAM_STAMPS (the control plane's way) and refuses any single stamp changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as stamps from './stamps.js';
import { PROGRAM_VERSIONS, sealProgram } from './contract.js';
import { SDK_SOURCE, sdkFingerprint } from './sdk.js';
import { createProgramHost, programStamps } from './host.js';
import { loadEngine, runProgram } from './runtime.js';
import { dragFixture, growthFixture } from './fixtures.js';
import { LIMITS } from './limits.js';

test('stamps.js imports nothing, so neither the page nor the control plane pulls QuickJS or zod through it', () => {
  const text = readFileSync(new URL('./stamps.js', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /^\s*(import|export\s+\*|export\s+\{[^}]*\}\s+from)\b|\bimport\s*\(|\brequire\s*\(/m);
});

test('each stamp equals what it names: installed WASM, SDK source, contract versions', async () => {
  const wasm = createRequire(import.meta.url).resolve('@jitl/quickjs-wasmfile-release-sync/wasm');
  assert.equal(createHash('sha256').update(readFileSync(wasm)).digest('hex'), stamps.ENGINE_FINGERPRINT);
  const installed = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).dependencies;
  assert.equal(stamps.ENGINE_VERSION, `quickjs-release-sync@${installed['@jitl/quickjs-wasmfile-release-sync']}`);
  assert.equal(installed['quickjs-emscripten-core'], installed['@jitl/quickjs-wasmfile-release-sync']);
  assert.equal(stamps.SDK_FINGERPRINT, await sdkFingerprint(), 'SDK_SOURCE changed: update SDK_FINGERPRINT in stamps.js');
  assert.equal(stamps.SDK_FINGERPRINT, createHash('sha256').update(SDK_SOURCE).digest('hex'));
  assert.equal(stamps.RENDERER_VERSION, PROGRAM_VERSIONS.rendererVersion);
  assert.equal(stamps.RUNTIME_POLICY_VERSION, PROGRAM_VERSIONS.runtimePolicyVersion);
  assert.equal(stamps.PERMISSION_PROFILE_VERSION, PROGRAM_VERSIONS.permissionProfileVersion);
  assert.equal(await programStamps(), stamps.PROGRAM_STAMPS, 'the host verifies against stamps.js itself');
});

// A Worker stand-in on the real engine (test-only 250 ms interrupt), only to see whether the host lets the artifact run.
const engine = loadEngine();
const standIn = () => {
  const worker = { terminate() {}, postMessage({ id, source, request, operation, sdkVersion }) { engine.then(e => worker.onmessage?.({ data: { id, ...runProgram(e, { source, request, operation, sdkVersion }, { ...LIMITS, interruptMs: 250 }) } })); } };
  engine.then(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};
const outcome = async artifact => {
  const host = createProgramHost({ artifact, createWorker: standIn });
  try { return (await host.evaluate({ requestId: 'r1', inputs: { rate: 5, years: 10, mode: 'compound' }, time: 2, seed: 1, state: null })) && 'ran'; }
  catch (error) { return error.code; } finally { host.dispose(); }
};
const sealWith = async stampSet => {
  const sealed = await sealProgram({ manifest: growthFixture.manifest, source: growthFixture.source }, stampSet);
  assert.equal(sealed.ok, true, sealed.issue);
  return sealed.value;
};

test('the host runs an artifact sealed with PROGRAM_STAMPS and refuses one with any single stamp changed', async () => {
  assert.equal(await outcome(await sealWith(stamps.PROGRAM_STAMPS)), 'ran');
  const { fingerprints, ...top } = stamps.PROGRAM_STAMPS;
  const changes = [
    ...Object.keys(top).map(key => ({ ...stamps.PROGRAM_STAMPS, [key]: `${top[key]}-other` })),
    ...Object.keys(fingerprints).map(key => ({ ...stamps.PROGRAM_STAMPS, fingerprints: { ...fingerprints, [key]: `${fingerprints[key]}`.replace(/.$/, c => (c === '0' ? '1' : '0')) } })),
    { ...stamps.PROGRAM_STAMPS, sdkVersion: 'sdk-2' },
    { ...stamps.PROGRAM_STAMPS, rendererVersion: 'renderer-2' },
  ];
  for (const changed of changes) assert.equal(await outcome(await sealWith(changed)), 'version_unavailable', JSON.stringify(changed));
});

test('the physical-props SDK (sdk-7) is a new tuple beside sdk-2: its own fingerprint, sdk-2 bytes unchanged, both schemas supported', async () => {
  const { programSdkSource } = await import('./sdk.js');
  assert.equal(stamps.PROPS_SDK_VERSION, 'sdk-7');
  assert.equal(createHash('sha256').update(programSdkSource('sdk-7')).digest('hex'), stamps.PROPS_PROGRAM_STAMPS.fingerprints.sdk, 'update PROPS fingerprint in stamps.js when sdk-geometry.js PROPS_SOURCE changes');
  assert.equal(createHash('sha256').update(programSdkSource('sdk-2')).digest('hex'), stamps.VISUAL_PROGRAM_STAMPS.fingerprints.sdk, 'the saved sdk-2 source is untouched');
  assert.notEqual(stamps.PROPS_PROGRAM_STAMPS.fingerprints.sdk, stamps.VISUAL_PROGRAM_STAMPS.fingerprints.sdk);
  assert.ok(programSdkSource('sdk-7').startsWith(programSdkSource('sdk-2')), 'sdk-7 appends to sdk-2');
  assert.deepEqual(stamps.SUPPORTED_PROGRAM_TUPLES.filter(t => t.sdkVersion === 'sdk-7').map(t => t.schemaVersion), [1, 2]);
  assert.equal(stamps.STATEFUL_PROPS_PROGRAM_STAMPS.schemaVersion, 2);
});

test('the semantic-figures SDK (sdk-8) is a new tuple beside sdk-7: its own fingerprint and renderer, sdk-2 and sdk-7 bytes unchanged, both schemas supported', async () => {
  const { programSdkSource } = await import('./sdk.js');
  assert.equal(stamps.FIGURES_SDK_VERSION, 'sdk-8');
  assert.equal(stamps.FIGURES_CAPABILITY, 'figures');
  assert.equal(createHash('sha256').update(programSdkSource('sdk-8')).digest('hex'), stamps.FIGURES_PROGRAM_STAMPS.fingerprints.sdk, 'update the FIGURES fingerprint in stamps.js when sdk-figures.js changes');
  assert.equal(createHash('sha256').update(programSdkSource('sdk-2')).digest('hex'), stamps.VISUAL_PROGRAM_STAMPS.fingerprints.sdk);
  assert.equal(createHash('sha256').update(programSdkSource('sdk-7')).digest('hex'), stamps.PROPS_PROGRAM_STAMPS.fingerprints.sdk);
  assert.notEqual(stamps.FIGURES_PROGRAM_STAMPS.fingerprints.sdk, stamps.PROPS_PROGRAM_STAMPS.fingerprints.sdk);
  assert.equal(stamps.FIGURES_PROGRAM_STAMPS.rendererVersion, 'renderer-5', 'the new frame kinds are a new renderer');
  assert.equal(stamps.FIGURES_PROGRAM_STAMPS.fingerprints.renderer, 'renderer-5');
  assert.deepEqual(stamps.SUPPORTED_PROGRAM_TUPLES.filter(t => t.sdkVersion === 'sdk-8').map(t => t.schemaVersion), [1, 2]);
  assert.equal(stamps.SUPPORTED_PROGRAM_TUPLES.filter(t => t.sdkVersion === 'sdk-7').length, 2, 'sdk-7 is still supported beside it');
});

test('a sealed program uses the SDK named in its verified stamps', async () => {
  const { programSdkSource } = await import('./sdk.js');
  assert.equal(createHash('sha256').update(programSdkSource('sdk-2')).digest('hex'), stamps.VISUAL_PROGRAM_STAMPS.fingerprints.sdk);
  const source = `export function evaluate({ time }) {
    const objects = sdk.grid('cells', { x: 12, y: 12, w: 220, h: 42, rows: [[1, 2]], active: [[0, time > 1 ? 1 : 0]] });
    return { frame: { width: 280, height: 100, objects }, quantities: {} };
  }`;
  const bundle = { manifest: growthFixture.manifest, source };
  const current = await sealProgram(bundle, stamps.VISUAL_PROGRAM_STAMPS);
  const legacy = await sealProgram(bundle, stamps.PROGRAM_STAMPS);
  assert.equal(current.ok, true, current.issue);
  assert.equal(await outcome(current.value), 'ran');
  assert.equal(legacy.ok, true, legacy.issue);
  assert.equal(await outcome(legacy.value), 'runtime_error', 'saved sdk-1 programs do not get new globals');
});

test('stateful sdk-2 programs use the new helpers on initialize, reduce, and evaluate', async () => {
  const box = "sdk.readout('weight', { x: 12, y: 12, w: 200, h: 40, label: 'Weight', value: 2 })";
  const manifest = { ...dragFixture.manifest, actions: [{ id: 'reset', label: 'Reset' }], targets: [] };
  const source = `export function initialState() { return { n: ${box}[0].w }; }
    export function reduce({ state }) { return { n: state.n + ${box}.length }; }
    export function evaluate() {
      return { frame: { width: ${manifest.viewport.width}, height: ${manifest.viewport.height}, objects: ${box} }, quantities: {} };
    }`;
  const sealed = await sealProgram({ manifest, source }, stamps.STATEFUL_VISUAL_PROGRAM_STAMPS);
  assert.equal(sealed.ok, true, sealed.issue);
  const host = createProgramHost({ artifact: sealed.value, createWorker: standIn });
  const base = { requestId: 'test', inputs: {}, seed: 1 };
  try {
    const init = await host.initialize(base);
    assert.deepEqual(init.state, { n: 200 });
    const update = await host.reduce({ ...base, time: 0, state: init.state, event: { type: 'action', action: 'reset' } });
    assert.deepEqual(update.state, { n: 201 });
    const value = await host.evaluate({ ...base, time: 0, state: update.state });
    assert.equal(value.frame.objects[0].text, 'Weight: 2.00');
  } finally { host.dispose(); }
});
