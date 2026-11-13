import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildProgramArtifact, programStampsFor } from '../../../control-plane/src/explain-program.js';
import { parseArtifact, parseGuestResult, resolveInputs, sealProgram, verifyHashes } from './contract.js';
import { normalizeFrame } from './frame.js';
import { frameOverlaps, layoutProblems } from './frame-overlap.js';
import { LIMITS as DEFAULT_LIMITS } from './limits.js';
import { loadEngine, runProgram as runWithDefaultLimits } from './runtime.js';
import { programSdkSource } from './sdk.js';
import * as stamps from './stamps.js';

// sdk-8 (capability figures): sdk.axis, sdk.plot with axes and sdk.diagram return ONE frame object each; sdk-2 and sdk-7 keep their bytes; the sealed cards of runs 10, 11, 13 and 15
// still parse, verify and run under their own tuples. Hand-authored programs only.
const sdk = new Function(`${programSdkSource('sdk-8')}\nreturn sdk;`)();
const spec = { version: 1, diagram: { kind: 'flow', title: 'Cache lookup', nodes: [{ id: 'a', label: 'Read cache', role: 'process' }, { id: 'b', label: 'Return value', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] } };
const sha = text => createHash('sha256').update(text).digest('hex');

test('sdk.axis returns the contract axis object, with the optional fields only when given', () => {
  const axis = sdk.axis('time', { x: 80, y: 300, length: 400, orientation: 'x', min: 0, max: 10, label: 'Time', unit: 's', role: 'input' });
  assert.deepEqual(axis, { kind: 'axis', id: 'time', x: 80, y: 300, length: 400, orientation: 'x', min: 0, max: 10, label: 'Time', unit: 's', role: 'input' });
  const bare = sdk.axis('h', { x: 80, y: 300, length: 200, orientation: 'y', min: 0, max: 5, label: 'Height', ticks: [0, 5] });
  assert.deepEqual(Object.keys(bare), ['kind', 'id', 'x', 'y', 'length', 'orientation', 'min', 'max', 'ticks', 'label']);
  assert.equal(Array.isArray(axis), false, 'one object, no expansion');
});

test('sdk.plot with axes returns the contract plot object; without axes it is the earlier plot, unchanged', () => {
  const plot = sdk.plot('p', { x: 40, y: 20, w: 400, h: 260, axes: { x: { label: 'Time', min: 0, max: 2 }, y: { label: 'Height', min: 0, max: 5 } }, series: [{ label: 'Ball', kind: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 5 }] }] });
  assert.equal(Array.isArray(plot), false);
  assert.deepEqual([plot.kind, plot.id, plot.w, plot.h, plot.series.length, plot.axes.x.label], ['plot', 'p', 400, 260, 1, 'Time']);
  const earlier = sdk.plot('old', { x: 20, y: 20, w: 320, h: 220, xDomain: [0, 4], yDomain: [0, 2], series: [{ id: 's', points: [[0, 0], [4, 2]] }] });
  assert.equal(Array.isArray(earlier), true, 'the earlier plot still expands into frame objects');
  assert.ok(earlier.length > 4 && earlier.every(object => object.kind !== 'plot'));
  assert.deepEqual(sdk.plot('old', { x: 20, y: 20, w: 320, h: 220, xDomain: [0, 4], yDomain: [0, 2], series: [{ id: 's', points: [[0, 0], [4, 2]] }] }), earlier, 'deterministic');
});

test('sdk.diagram takes the spec first, the box second, and an optional id', () => {
  assert.deepEqual(sdk.diagram(spec, { x: 20, y: 20, w: 400 }), { kind: 'diagram', id: 'diagram', x: 20, y: 20, w: 400, spec });
  assert.equal(sdk.diagram(spec, { x: 20, y: 20, w: 400, id: 'flow', role: 'output' }).id, 'flow');
  assert.equal(sdk.diagram(spec, { x: 20, y: 20, w: 400, id: 'flow', role: 'output' }).role, 'output');
});

test('a missing field or an unknown role is refused where the call is made, naming the helper', () => {
  assert.throws(() => sdk.axis('a', { x: 1, y: 1, length: 5, orientation: 'x', min: 0, max: 1 }), /sdk\.axis: label is required/);
  assert.throws(() => sdk.axis('a'), /sdk\.axis: options are required/);
  assert.throws(() => sdk.plot('p', { axes: {}, x: 1, y: 1, w: 200, h: 160 }), /sdk\.plot: series is required/);
  assert.throws(() => sdk.diagram(spec, { x: 1, y: 1 }), /sdk\.diagram: w is required/);
  assert.throws(() => sdk.axis('a', { x: 1, y: 1, length: 5, orientation: 'x', min: 0, max: 1, label: 'T', role: 'rainbow' }), /sdk\.axis: invalid role/);
});

test('sdk-8 is a new tuple beside sdk-2 and sdk-7: its own fingerprint, their bytes unchanged, both schemas supported', () => {
  assert.equal(stamps.FIGURES_SDK_VERSION, 'sdk-8');
  assert.equal(sha(programSdkSource('sdk-8')), stamps.FIGURES_PROGRAM_STAMPS.fingerprints.sdk, 'update the FIGURES fingerprint in stamps.js when sdk-figures.js changes');
  assert.equal(sha(programSdkSource('sdk-2')), stamps.VISUAL_PROGRAM_STAMPS.fingerprints.sdk, 'the saved sdk-2 source is untouched');
  assert.equal(sha(programSdkSource('sdk-7')), stamps.PROPS_PROGRAM_STAMPS.fingerprints.sdk, 'the saved sdk-7 source is untouched');
  assert.ok(programSdkSource('sdk-8').startsWith(programSdkSource('sdk-7')), 'sdk-8 appends to sdk-7');
  assert.equal(new Set(Object.values(stamps).filter(value => value?.fingerprints).map(value => value.fingerprints.sdk)).size, 8, 'sdk-1 to sdk-8 each have their own fingerprint (a stateful twin shares its sdk)');
  assert.deepEqual(stamps.SUPPORTED_PROGRAM_TUPLES.filter(tuple => tuple.sdkVersion === 'sdk-8').map(tuple => [tuple.schemaVersion, tuple.rendererVersion]), [[1, 'renderer-5'], [2, 'renderer-5']]);
  assert.equal(stamps.STATEFUL_FIGURES_PROGRAM_STAMPS.schemaVersion, 2);
  assert.equal(programStampsFor(['time_playback', 'figures'], false), stamps.FIGURES_PROGRAM_STAMPS);
  assert.equal(programStampsFor(['time_playback', 'figures'], true), stamps.STATEFUL_FIGURES_PROGRAM_STAMPS);
  assert.equal(programStampsFor(['time_playback', 'props'], false), stamps.PROPS_PROGRAM_STAMPS, 'a props card is still sealed under sdk-7');
});

const engine = await loadEngine();
const runProgram = (input) => runWithDefaultLimits(engine, input, { ...DEFAULT_LIMITS, interruptMs: 5000 });
const MANIFEST = {
  title: 'A figure card', summary: 'An axis, a plot and a diagram.', assumptions: [], description: 'A time axis, a height plot and a small flow.', inputs: [], duration: 2,
  readouts: [], capabilities: ['time_playback', 'figures'],
};
const SOURCE = `export function evaluate({ time }) {
  const objects = [
    sdk.axis('t', { x: 60, y: 300, length: 300, orientation: 'x', min: 0, max: 2, label: 'Time', unit: 's' }),
    sdk.plot('h', { x: 20, y: 10, w: 360, h: 170, axes: { x: { label: 'Time', min: 0, max: 2, unit: 's' }, y: { label: 'Height', min: 0, max: 5, unit: 'm' } },
      series: [{ label: 'Ball', kind: 'line', points: [{ x: 0, y: 0 }, { x: time, y: 5 * time / 2 }] }] }),
    sdk.diagram(${JSON.stringify(spec)}, { x: 400, y: 20, w: 220 }),
  ];
  return { frame: { width: 640, height: 420, objects, readouts: [] }, quantities: {} };
}`;

test('a card using the figure helpers seals under sdk-8, verifies, runs in the isolated runtime and draws through the frame contract', async () => {
  const artifact = await buildProgramArtifact({ manifest: MANIFEST, source: SOURCE });
  assert.deepEqual([artifact.sdkVersion, artifact.rendererVersion, artifact.schemaVersion], ['sdk-8', 'renderer-5', 1]);
  assert.equal(await verifyHashes(artifact), true);
  assert.equal(parseArtifact(artifact).ok, true);
  const out = runProgram({ source: artifact.source, sdkVersion: artifact.sdkVersion, operation: 'evaluate', request: { requestId: 'f', inputs: {}, time: 1, seed: 1, state: null } });
  assert.equal(out.ok, true, out.detail);
  const parsed = parseGuestResult(out.value, artifact.manifest, artifact.sdkVersion);
  assert.equal(parsed.ok, true, parsed.issue);
  assert.deepEqual(parsed.value.frame.objects.map(object => object.kind), ['axis', 'plot', 'diagram']);
  assert.equal(normalizeFrame(out.value.frame, artifact.manifest).ok, true);
  // the same frame under an older SDK tuple is refused: the figure kinds belong to sdk-8 and the capability only
  assert.equal(parseGuestResult(out.value, artifact.manifest, 'sdk-7').ok, false);
  assert.equal(parseGuestResult(out.value, { ...artifact.manifest, capabilities: ['time_playback'] }, 'sdk-8').ok, false);
});

test('a program that calls sdk.axis under sdk-7 fails in the guest: the helper does not exist there', async () => {
  const out = runProgram({ source: SOURCE, sdkVersion: 'sdk-7', operation: 'evaluate', request: { requestId: 'f', inputs: {}, time: 1, seed: 1, state: null } });
  assert.equal(out.ok, false);
});

test('a card declaring both props and figures is one sdk-8 card (it has the sdk-7 helpers and the figure ones)', async () => {
  const artifact = await buildProgramArtifact({ manifest: { ...MANIFEST, capabilities: ['time_playback', 'props', 'figures'] }, source: SOURCE.replace('const objects = [', 'const objects = [...sdk.vector(\'v\', { x: 100, y: 100 }, { dx: 40, dy: 0 }),') });
  assert.equal(artifact.sdkVersion, 'sdk-8');
  assert.equal(parseArtifact(artifact).ok, true);
});

// ---- the sealed cards of the real runs on the dev clone still parse, seal to the same hashes and run under their own tuples ----------------------------------------------------
const RUNS = ['10-pinned-controls-READY', '11-pinned-controls-640x440-READY', '13-fix2-rebuild-READY', '15-boundary-capture-fix-READY'];
const evidence = run => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../docs/features/interact/evidence/2026-11-12-clone-runs/runs/${run}/result-artifact.json`, import.meta.url)), 'utf8')).artifact;
for (const run of RUNS) {
  test(`the sealed artifact of run ${run} parses, verifies, re-seals to the same hashes and runs under its own tuple`, async () => {
    const artifact = evidence(run);
    assert.equal(parseArtifact(artifact).ok, true, 'parses');
    assert.equal(await verifyHashes(artifact), true, 'verifies');
    const tuple = { schemaVersion: artifact.schemaVersion, sdkVersion: artifact.sdkVersion, rendererVersion: artifact.rendererVersion, runtimeVersion: artifact.runtimeVersion, runtimePolicyVersion: artifact.runtimePolicyVersion, permissionProfileVersion: artifact.permissionProfileVersion, fingerprints: artifact.fingerprints };
    assert.ok(stamps.SUPPORTED_PROGRAM_TUPLES.some(supported => Object.entries(tuple).every(([key, value]) => JSON.stringify(supported[key]) === JSON.stringify(value))), 'the host still runs its tuple');
    const resealed = await sealProgram({ manifest: artifact.manifest, source: artifact.source }, { ...tuple, dependencies: artifact.dependencies });
    assert.equal(resealed.ok, true, resealed.issue);
    assert.deepEqual([resealed.value.sourceHash, resealed.value.manifestHash, resealed.value.bundleHash], [artifact.sourceHash, artifact.manifestHash, artifact.bundleHash], 'sealing the same bundle gives the same hashes');
    const inputs = resolveInputs(artifact.manifest, {});
    for (const time of [0, (artifact.manifest.duration ?? 1) / 2]) {
      const out = runProgram({ source: artifact.source, sdkVersion: artifact.sdkVersion, operation: 'evaluate', request: { requestId: 'c', inputs, time, seed: 1, state: null } });
      assert.equal(out.ok, true, `t = ${time}: ${out.detail}`);
      const parsed = parseGuestResult(out.value, artifact.manifest, artifact.sdkVersion);
      assert.equal(parsed.ok, true, `t = ${time}: ${parsed.issue}`);
      assert.equal(normalizeFrame(out.value.frame, artifact.manifest).ok, true);
    }
  });
}

// ---- sdk.callout and sdk.panel (sprint 2): existing frame object kinds only, no new kind ----------------------------------------------------------------------------------------
test('sdk.callout stacks one box per line (at most four), equally wide, each with its own text and the given role', () => {
  const out = sdk.callout(300, 40, ['Height 4.50 m', 'Velocity 0.00 m/s'], { id: 'tossed', role: 'output' });
  assert.deepEqual(out.map(object => [object.kind, object.id, object.x, object.y, object.h, object.text, object.role]), [['box', 'tossed.l0', 300, 40, 28, 'Height 4.50 m', 'output'], ['box', 'tossed.l1', 300, 68, 28, 'Velocity 0.00 m/s', 'output']]);
  assert.equal(new Set(out.map(object => object.w)).size, 1, 'equally wide');
  assert.equal(sdk.callout(0, 0, ['a', 'b', 'c', 'd']).length, 4);
  assert.equal(sdk.callout(0, 0, ['a'])[0].id, 'callout.l0');
  assert.equal('role' in sdk.callout(0, 0, ['a'])[0], false, 'no role unless given');
  assert.throws(() => sdk.callout(0, 0, []), /sdk\.callout: lines is one to four strings/);
  assert.throws(() => sdk.callout(0, 0, ['a', 'b', 'c', 'd', 'e']), /one to four/);
  assert.throws(() => sdk.callout(0, 0, ['x'.repeat(41)]), /sdk\.callout: text is 1 to 40 characters/);
  assert.throws(() => sdk.callout(0, 0, ['a'], { role: 'rainbow' }), /sdk\.callout: invalid role/);
});

test('sdk.panel returns exactly three frame objects: the lane box tinted by role, its title and its state beside it', () => {
  const out = sdk.panel({ id: 'toss', x: 40, y: 60, w: 420, h: 300, title: 'Toss', state: 'Moving up', role: 'input' });
  assert.deepEqual(out.map(object => [object.kind, object.id, object.role]), [['box', 'toss', 'input'], ['text', 'toss.title', 'neutral'], ['text', 'toss.state', 'neutral']]);
  assert.deepEqual([out[0].x, out[0].y, out[0].w, out[0].h], [40, 60, 420, 300]);
  assert.ok(out[1].y < 60 && out[2].y === out[1].y, 'the heading line is above the lane, one line');
  assert.ok(out[2].x > out[1].x, 'the state follows the title');
  assert.equal(sdk.panel({ x: 0, y: 30, w: 300, h: 100, title: 'Drop', state: 'Held' })[0].role, 'neutral');
  assert.throws(() => sdk.panel({ x: 0, y: 30, w: 100, h: 100, title: 'Toss', state: 'Still for an instant' }), /too narrow/);
  assert.throws(() => sdk.panel({ x: 0, y: 30, w: 300, h: 100, title: 'Toss' }), /sdk\.panel: state is required/);
  assert.throws(() => sdk.panel(), /sdk\.panel: options are required/);
});

test('a frame of two panels and a callout, built in the guest, is a valid frame, draws, and has no layout overlap', async () => {
  const source = `export function evaluate() {
    const objects = [...sdk.panel({ id: 'toss', x: 40, y: 50, w: 420, h: 300, title: 'Toss', state: 'Moving up' }), ...sdk.panel({ id: 'drop', x: 500, y: 50, w: 420, h: 300, title: 'Drop', state: 'Gravity pulls down', role: 'output' }),
      sdk.circle('ball', 230, 200, 30, { role: 'input' }), ...sdk.callout(270, 150, ['Height 4.50 m', 'Velocity 0.00 m/s'], { id: 'tossedReadout', role: 'output' })];
    return { frame: { width: 960, height: 400, objects, readouts: [] }, quantities: {} };
  }`;
  const artifact = await buildProgramArtifact({ manifest: { ...MANIFEST, capabilities: ['time_playback', 'figures'] }, source });
  const out = runProgram({ source: artifact.source, sdkVersion: artifact.sdkVersion, operation: 'evaluate', request: { requestId: 'p', inputs: {}, time: 0, seed: 1, state: null } });
  assert.equal(out.ok, true, out.detail);
  assert.equal(parseGuestResult(out.value, artifact.manifest, artifact.sdkVersion).ok, true);
  assert.equal(normalizeFrame(out.value.frame, artifact.manifest).ok, true);
  assert.equal(out.value.frame.objects.length, 3 + 3 + 1 + 2, 'two panels (3 each), the ball and a two-line callout');
  assert.deepEqual(frameOverlaps(out.value.frame), []);
  assert.deepEqual(layoutProblems(out.value.frame), []);
});

test('the guest has the new helpers under sdk-8 only; sdk-7 does not define them', () => {
  assert.equal(typeof sdk.callout, 'function');
  assert.equal(typeof sdk.panel, 'function');
  const old = new Function(`${programSdkSource('sdk-7')}
return sdk;`)();
  assert.equal(old.callout, undefined);
  assert.equal(old.panel, undefined);
});
