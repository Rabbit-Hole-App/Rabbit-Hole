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
import { growthFixture } from './fixtures.js';
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
  const worker = { terminate() {}, postMessage({ id, source, request }) { engine.then(e => worker.onmessage?.({ data: { id, ...runProgram(e, { source, request }, { ...LIMITS, interruptMs: 250 }) } })); } };
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
