import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_LIMITS, ERROR_MESSAGES, PROGRAM_KIND, RuntimeError, canonicalJson, computeHashes, parseArtifact, parseBundle, parseEvaluateRequest,
  parseFrame, parseGuestResult, parseManifest, resolveInputs, sealProgram, verifyHashes,
} from './contract.js';

// Hand-authored test data. It is not generation evidence: no model wrote any of it.
const manifest = (extra = {}) => ({
  title: 'A test program', summary: 'Two inputs and one curve.', assumptions: ['Everything is idealised.'], description: 'A curve and a marker.',
  inputs: [
    { type: 'number', id: 'amount', label: 'Amount', unit: 'u', default: 2, min: 0, max: 10, step: 0.5 },
    { type: 'select', id: 'mode', label: 'Mode', default: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  ],
  duration: 4, readouts: [{ id: 'total', label: 'Total', unit: 'u', decimals: 1 }], capabilities: ['time_playback', 'number_inputs', 'polyline'], ...extra,
});
const bundle = () => ({ manifest: manifest(), source: 'export function evaluate({inputs,time}){return {frame:{objects:[]},quantities:{}};}' });
const stamps = { runtimeVersion: 'engine-1', fingerprints: { engine: 'e1', sdk: 's1', renderer: 'r1' } };

test('a valid manifest parses and an unknown key is refused', () => {
  assert.equal(parseManifest(manifest()).ok, true);
  const bad = parseManifest({ ...manifest(), url: 'https://example.com' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'invalid_program');
});

test('an unknown capability is unsupported_capability, not a malformed program', () => {
  const result = parseManifest(manifest({ capabilities: ['time_playback', 'webgl'] }));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'unsupported_capability');
  assert.equal(result.error.message, ERROR_MESSAGES.unsupported_capability);
});

test('manifest bounds: defaults inside the domain, select combinations, markup and URLs in text', () => {
  assert.equal(parseManifest(manifest({ inputs: [{ type: 'number', id: 'x', label: 'X', default: 11, min: 0, max: 10 }] })).ok, false);
  assert.equal(parseManifest(manifest({ inputs: [{ type: 'number', id: 'x', label: 'X', default: 1, min: 5, max: 5 }] })).ok, false);
  const select = id => ({ type: 'select', id, label: id, default: '1', options: Array.from({ length: 5 }, (_, n) => ({ value: String(n + 1), label: String(n + 1) })) });
  assert.equal(parseManifest(manifest({ inputs: [select('p'), select('q'), select('r')], readouts: [] })).ok, false, '5*5*5 = 125 states');
  assert.equal(parseManifest(manifest({ summary: '<script>alert(1)</script>' })).ok, false);
  assert.equal(parseManifest(manifest({ summary: 'see https://example.com/x' })).ok, false);
  assert.equal(parseManifest(manifest({ summary: 'when a < b and b > c' })).ok, true, 'a comparison is not markup');
  assert.equal(parseManifest(manifest({ inputs: Array.from({ length: 5 }, (_, n) => ({ type: 'number', id: `n${n}`, label: 'n', default: 1, min: 0, max: 2 })) })).ok, false, 'at most four inputs');
  const twin = [{ type: 'number', id: 'same', label: 'a', default: 1, min: 0, max: 2 }, { type: 'number', id: 'same', label: 'b', default: 1, min: 0, max: 2 }];
  assert.equal(parseManifest(manifest({ inputs: twin })).ok, false, 'duplicate ids');
});

test('the source is bounded in UTF-8 bytes, and the model cannot supply versions or hashes', () => {
  assert.equal(parseBundle(bundle()).ok, true);
  assert.equal(parseBundle({ ...bundle(), source: 'x'.repeat(CONTRACT_LIMITS.sourceBytes + 1) }).ok, false);
  assert.equal(parseBundle({ ...bundle(), source: 'é'.repeat(CONTRACT_LIMITS.sourceBytes / 2 + 1) }).ok, false, 'bytes, not characters');
  assert.equal(parseBundle({ ...bundle(), sourceHash: 'a'.repeat(64) }).ok, false);
  assert.equal(parseBundle({ ...bundle(), runtimeVersion: 'engine-9' }).ok, false);
});

test('sealing computes hashes on the host; they bind source, manifest and every version', async () => {
  const sealed = await sealProgram(bundle(), stamps);
  assert.equal(sealed.ok, true, sealed.issue);
  const artifact = sealed.value;
  assert.equal(artifact.kind, PROGRAM_KIND);
  assert.equal(await verifyHashes(artifact), true);
  assert.equal(parseArtifact(artifact).ok, true);
  for (const change of [
    { source: `${artifact.source} ` }, { manifest: { ...artifact.manifest, title: 'Another' } }, { sdkVersion: 'sdk-2' }, { runtimeVersion: 'engine-2' },
    { fingerprints: { ...artifact.fingerprints, engine: 'e2' } }, { permissionProfileVersion: 'perm-2' }, { dependencies: ['helper@1'] },
  ]) assert.equal(await verifyHashes({ ...artifact, ...change }), false, JSON.stringify(Object.keys(change)));
  const again = await computeHashes(artifact);
  assert.deepEqual(again, { sourceHash: artifact.sourceHash, manifestHash: artifact.manifestHash, bundleHash: artifact.bundleHash });
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
});

test('EvaluateRequest is strict and bounded', () => {
  const ok = { requestId: 'r1', inputs: { amount: 2, mode: 'a' }, time: 1.5, seed: 7, state: null };
  assert.equal(parseEvaluateRequest(ok).ok, true);
  for (const change of [{ time: -1 }, { time: Number.NaN }, { time: 500 }, { seed: 1.5 }, { state: {} }, { requestId: '' }, { inputs: { amount: Infinity } }, { extra: 1 }]) {
    assert.equal(parseEvaluateRequest({ ...ok, ...change }).ok, false, JSON.stringify(change));
  }
});

const frame = (objects, extra = {}) => ({ objects, ...extra });
const curve = n => ({ kind: 'polyline', id: 'curve', points: Array.from({ length: n }, (_, i) => [i, i * 2]), role: 'prediction' });

test('a valid frame normalises defaults; wrong frames are invalid_output', () => {
  const result = parseFrame(frame([
    { kind: 'box', id: 'b', x: 0, y: 0, w: 100, h: 40, text: 'Block' },
    { kind: 'text', id: 't', x: 10, y: 10, runs: [{ kind: 'text', text: 'T = ' }, { kind: 'math', tex: '2\\pi\\sqrt{L/g}' }] },
    { kind: 'arrow', id: 'a', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }, curve(3),
  ]));
  assert.equal(result.ok, true, result.issue);
  assert.equal(result.value.width, 960);
  assert.equal(result.value.objects[0].role, 'neutral');
  const bad = [
    [{ kind: 'box', id: 'b', x: Number.NaN, y: 0, w: 1, h: 1 }], [{ kind: 'box', id: 'b', x: 0, y: 0, w: 1, h: 1, onclick: 'x' }],
    [{ kind: 'image', id: 'i', src: 'https://example.com/a.png', x: 0, y: 0 }], [{ kind: 'box', id: 'b', x: 0, y: 0, w: 1, h: 1, text: '<b>x</b>' }],
    [{ kind: 'text', id: 't', x: 0, y: 0, text: 'visit https://example.com' }], [{ kind: 'text', id: 't', x: 0, y: 0 }],
    [{ kind: 'text', id: 't', x: 0, y: 0, text: 'a', runs: [{ kind: 'text', text: 'a' }] }], [{ kind: 'box', id: 'b b', x: 0, y: 0, w: 1, h: 1 }],
    [{ kind: 'box', id: 'b', x: 0, y: 0, w: 1, h: 1 }, { kind: 'circle', id: 'b', x: 0, y: 0, w: 1 }], [{ kind: 'box', id: 'b', x: 0, y: 0, w: 1, h: 1, fn: () => 1 }],
    [{ kind: 'box', id: 'b', x: 1e9, y: 0, w: 1, h: 1 }], [{ kind: 'box', id: 'b', x: 0, y: 0, w: 1, h: 1, role: 'rainbow' }],
  ];
  for (const objects of bad) {
    const parsed = parseFrame(frame(objects));
    assert.equal(parsed.ok, false, JSON.stringify(objects));
    assert.equal(parsed.error.code, 'invalid_output');
  }
});

test('frame budgets: 60 objects, 2000 points each, 10000 points in total, finite points, a hostile key', () => {
  const boxes = n => Array.from({ length: n }, (_, i) => ({ kind: 'box', id: `b${i}`, x: i, y: 0, w: 4, h: 4 }));
  assert.equal(parseFrame(frame(boxes(60))).ok, true);
  assert.equal(parseFrame(frame(boxes(61))).ok, false);
  assert.equal(parseFrame(frame([curve(2000)])).ok, true);
  assert.equal(parseFrame(frame([curve(2001)])).ok, false);
  assert.equal(parseFrame(frame([curve(1), ])).ok, false, 'a polyline needs two points');
  const many = Array.from({ length: 6 }, (_, i) => ({ ...curve(2000), id: `c${i}` }));
  assert.equal(parseFrame(frame(many.slice(0, 5))).ok, true, '10000 points');
  assert.equal(parseFrame(frame(many)).ok, false, '12000 points');
  assert.equal(parseFrame(frame([{ ...curve(3), points: [[0, 0], [1, Infinity], [2, 2]] }])).ok, false);
  assert.equal(parseFrame(JSON.parse('{"objects":[],"__proto__":{"x":1}}')).ok, false, 'a __proto__ key is a forbidden key');
});

test('GuestResult needs finite named quantities; RuntimeError carries a stable code and only learner words', () => {
  assert.equal(parseGuestResult({ frame: frame([]), quantities: { total: 4.5 } }).ok, true);
  assert.equal(parseGuestResult({ frame: frame([]), quantities: { total: Number.NaN } }).ok, false);
  assert.equal(parseGuestResult({ frame: frame([]) }).value.quantities !== undefined, true);
  const error = new RuntimeError('runtime_limit');
  assert.deepEqual(error.toJSON(), { code: 'runtime_limit', message: 'This explanation stopped because it exceeded its runtime limit.' });
  assert.equal(new RuntimeError('made_up').code, 'runtime_error');
});

test('resolveInputs completes, clamps and falls back to defaults', () => {
  const m = manifest();
  assert.deepEqual(resolveInputs(m, {}), { amount: 2, mode: 'a' });
  assert.deepEqual(resolveInputs(m, { amount: 99, mode: 'b', stray: 1 }), { amount: 10, mode: 'b' });
  assert.deepEqual(resolveInputs(m, { amount: 'ten', mode: 'zzz' }), { amount: 2, mode: 'a' });
});
