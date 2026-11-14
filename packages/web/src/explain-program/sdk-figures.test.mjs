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
  assert.equal(sdk.callout(0, 0, ['a', 'b', 'c', 'd', 'e']).length, 4, 'a fifth line is cut, the helper does not refuse (it fits, owner 2026-11-13)');
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

// ---- sdk.vector under sdk-8 (interact scene look): the label sits beside the shaft's midpoint, 10 px clear, never at the tip --------------------------------------------------------------
test('sdk.vector under sdk-8 puts its label beside the middle of the arrow, 10 px clear of the shaft, on the right of its direction (left with side), and passes the layout clearance rule', () => {
  const [arrow, label] = sdk.vector('v', { x: 100, y: 200 }, { dx: 0, dy: -60 }, { label: 'v', role: 'input' });
  assert.deepEqual([arrow.kind, arrow.from.y, arrow.to.y, arrow.role], ['arrow', 200, 140, 'input']);
  assert.deepEqual([label.kind, label.id, label.align, label.role], ['text', 'vL', 'middle', 'input']);
  assert.ok(label.x > 110 && label.x < 125 && label.y === 170, `right of the middle of the shaft (${label.x}, ${label.y})`);
  const [, left] = sdk.vector('v', { x: 100, y: 200 }, { dx: 0, dy: -60 }, { label: 'v', side: 'left' });
  assert.ok(left.x < 90, 'side: left puts it on the other side');
  const [, down] = sdk.vector('g', { x: 100, y: 100 }, { dx: 0, dy: 40 }, { label: 'a' });
  assert.ok(down.x < 90, 'a down arrow takes its right-hand side, the left of the picture');
  assert.equal(sdk.vector('w', { x: 0, y: 0 }, { dx: 40, dy: 0 }).length, 1, 'no label, no text');
  assert.throws(() => sdk.vector('v', { x: 0, y: 0 }, { dx: 40, dy: 0 }, { label: 'v', side: 'up' }), /sdk\.vector: side is left or right/);
  assert.deepEqual(layoutProblems({ objects: sdk.vector('v', { x: 100, y: 200 }, { dx: 0, dy: -60 }, { label: 'v = 4' }), width: 640, height: 420 }), []);
  assert.deepEqual(layoutProblems({ objects: sdk.vector('h', { x: 100, y: 200 }, { dx: 80, dy: 0 }, { label: 'Gravity' }), width: 640, height: 420 }), []);
});

// ---- bodies (interact scene look): the renderer colours a body by order, so a role on a body is ignored (owner 2026-11-13 14:20: never refused; it was refused in aff5cf4f8) ----------------
test('a body with role observed is NOT refused: the frame parses, the role is simply not what colours the body (the 2026-11-13 google-low f1 run: circle "ball.toss" with role "observed")', () => {
  const manifest = { ...MANIFEST, capabilities: ['time_playback', 'figures'] };
  const parse = (objects, version = 'sdk-8') => parseGuestResult({ frame: { width: 640, height: 420, objects, readouts: [] }, quantities: {} }, manifest, version);
  for (const role of ['observed', 'input', undefined]) assert.equal(parse([sdk.circle('ball.toss', 100, 100, 24, role ? { role } : undefined)]).ok, true, String(role));
  assert.equal(parse([sdk.circle('dot', 100, 100, 8, { role: 'observed' })]).ok, true, 'a mark is a measured-data dot');
  assert.equal(parse([sdk.circle('ball', 100, 100, 24, { role: 'observed' })], 'sdk-7').ok, true);
});

// ---- the helpers fit, they never refuse (owner 2026-11-13, the google-low night's failures: sdk.panel "lane too narrow", readout "needs more room for its label", plot "<=24 items") ----
test('sdk.panel fits a title and a state in a narrow lane: the title keeps its width, the state is shortened with an ellipsis, and under 60 px of room it goes on a second line', () => {
  const wide = sdk.panel({ id: 'toss', x: 40, y: 60, w: 300, h: 200, title: 'Toss', state: 'Still for an instant' });
  assert.equal(wide[2].text, 'Still for an instant', 'room enough: the state is whole, beside the title');
  const tight = sdk.panel({ id: 'toss', x: 40, y: 60, w: 150, h: 200, title: 'Toss', state: 'Still for an instant' });   // the night's lane: 150 - 56 - 24 = 70 px of room, 'Still for an instant' needs 216
  assert.deepEqual(tight.map(object => object.id), ['toss', 'toss.title', 'toss.state'], 'still the three objects of a lane');
  assert.equal(tight[1].text, 'Toss');
  assert.ok('Still for an instant'.startsWith(tight[2].text) && tight[2].text.length < 'Still for an instant'.length && !tight[2].text.includes('…'), tight[2].text);
  assert.equal(tight[2].text, 'Still', 'cut at a word boundary, no ellipsis');
  assert.equal(tight[2].y, tight[1].y, 'the heading is still one line');
  const narrow = sdk.panel({ id: 'toss', x: 40, y: 60, w: 100, h: 200, title: 'Toss', state: 'Still for an instant' });   // 100 - 56 - 24 = 20 px: under 60, so the state moves under the title
  assert.equal(narrow[1].x, narrow[2].x, 'the state starts where the title starts');
  assert.ok(narrow[2].y > narrow[1].y && narrow[2].y < 60, 'a second line under the title, still above the lane');
  assert.ok(narrow[2].text.length < 'Still for an instant'.length && !narrow[2].text.includes('…'), 'cut to the lane width: 100 px, no ellipsis');
  assert.doesNotThrow(() => sdk.panel({ x: 0, y: 30, w: 20, h: 100, title: 'A long title here', state: 'Held' }));
});

test('sdk.readout fits its label to the box and keeps the value whole; only a box too small for the value too is drawn as it is', () => {
  const whole = sdk.readout('g', { x: 0, y: 0, w: 300, h: 30, label: 'Gravitational force', value: 9.8, unit: 'N', decimals: 1 });
  assert.equal(whole[0].text, 'Gravitational force: 9.8 N');
  const fitted = sdk.readout('g', { x: 0, y: 0, w: 150, h: 30, label: 'Gravitational force', value: 9.8, unit: 'N', decimals: 1 })[0];   // the night's "readout needs more room for its label"
  assert.ok(fitted.text.endsWith(': 9.8 N') && fitted.text.length < whole[0].text.length && !fitted.text.includes('…'), fitted.text);
  assert.ok(/^Gravit[a-z]*: 9\.8 N$/.test(fitted.text) && !fitted.text.includes('…'), fitted.text);
  assert.deepEqual([fitted.kind, fitted.id, fitted.w, fitted.role], ['box', 'g', 150, 'output']);
  const tiny = sdk.readout('g', { x: 0, y: 0, w: 40, h: 30, label: 'Gravitational force', value: 9.8, unit: 'N' })[0];
  assert.equal(tiny.text, '9.80 N', 'the value is whole even when nothing else fits, and there is no ellipsis');
  assert.throws(() => sdk.readout('g', { x: 0, y: 0, w: 150, h: 30, label: 'x', value: Infinity }), /finite value/, 'a bad value is still refused: that is not a fit');
});

test('sdk.plot keeps at most 3 series of 24 points, sampled evenly with the first and last point kept; axis ticks are capped at 12', () => {
  const points = Array.from({ length: 61 }, (_, i) => ({ x: i / 10, y: i * i }));   // the night's r11 plot: more than 24 points
  const plot = sdk.plot('p', { x: 40, y: 20, w: 400, h: 260, axes: { x: { label: 'Time', min: 0, max: 6 }, y: { label: 'Height', min: 0, max: 4000 } }, series: [{ label: 'a', kind: 'line', points }, { label: 'b', kind: 'line', points }, { label: 'c', kind: 'line', points }, { label: 'd', kind: 'line', points }] });
  assert.equal(plot.series.length, 3);
  const kept = plot.series[0].points;
  assert.equal(kept.length, 24);
  assert.deepEqual([kept[0], kept.at(-1)], [points[0], points.at(-1)]);
  assert.ok(kept.every((point, i) => i === 0 || point.x > kept[i - 1].x), 'in order, no repeats');
  const short = sdk.plot('p', { x: 40, y: 20, w: 400, h: 260, axes: { x: { label: 'T', min: 0, max: 1 }, y: { label: 'H', min: 0, max: 1 } }, series: [{ label: 'a', kind: 'line', points: points.slice(0, 5) }] });
  assert.deepEqual(short.series[0].points, points.slice(0, 5), 'a series within the cap comes back as it was');
  const axis = sdk.axis('t', { x: 80, y: 300, length: 400, orientation: 'x', min: 0, max: 30, label: 'Time', ticks: Array.from({ length: 31 }, (_, i) => i) });
  assert.equal(axis.ticks.length, 12);
  assert.deepEqual([axis.ticks[0], axis.ticks.at(-1)], [0, 30]);
});

test('a guest frame built from a narrow lane, a long-labelled readout and a 61-point plot is a valid frame that draws, with no layout overlap', async () => {
  const source = `export function evaluate() {
    const pts = []; for (let i = 0; i <= 60; i += 1) pts.push({ x: i / 10, y: i });
    const objects = [...sdk.panel({ id: 'lane.toss', x: 30, y: 60, w: 150, h: 300, title: 'Toss', state: 'Still for an instant' }),
      ...sdk.readout('r', { x: 200, y: 60, w: 130, h: 30, label: 'Gravitational force', value: 9.8, unit: 'N' }),
      sdk.plot('plot.vt', { x: 360, y: 40, w: 260, h: 220, axes: { x: { label: 'Time', min: 0, max: 6 }, y: { label: 'Velocity', min: 0, max: 60 } }, series: [{ label: 'v', kind: 'line', points: pts }] })];
    return { frame: { width: 640, height: 420, objects, readouts: [] }, quantities: {} };
  }`;
  const artifact = await buildProgramArtifact({ manifest: { ...MANIFEST, capabilities: ['time_playback', 'figures'] }, source });
  const out = runProgram({ source: artifact.source, sdkVersion: artifact.sdkVersion, operation: 'evaluate', request: { requestId: 'p', inputs: {}, time: 0, seed: 1, state: null } });
  assert.equal(out.ok, true, out.detail);
  assert.equal(parseGuestResult(out.value, artifact.manifest, artifact.sdkVersion).ok, true);
  assert.equal(normalizeFrame(out.value.frame, artifact.manifest).ok, true);
});
