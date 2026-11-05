// W1.1: the /whiteboard contracts (roadmap v1 section 6.4) against hand-written fixtures. Offline, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalHash, manifestHash, planHash, validateFailure, validateManifest, validatePlan, validateResult, validateScene, validateTimings, whiteboardVersions } from '../src/whiteboard-schema.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/whiteboard/${name}`, import.meta.url), 'utf8'));
const has = (issues, pattern) => assert.ok(issues.some(issue => pattern.test(issue)), `expected ${pattern} in ${JSON.stringify(issues)}`);

// A valid plan for d seconds with n equal scenes (windows in whole seconds, the last takes the rest).
function planFor(d, n) {
  const base = fixture('plan-60.json'), each = Math.floor(d / n) * 30;
  const scenes = Array.from({ length: n }, (_, i) => ({ ...base.scenes[0], id: `s${i + 1}`, startFrame: i * each, endFrame: i === n - 1 ? d * 30 : (i + 1) * each }));
  return { ...base, durationSeconds: d, scenes };
}
const scenesFor = plan => plan.scenes.map((s, i) => ({ ...fixture(i % 2 ? 'scene-2.json' : 'scene-1.json'), sceneId: s.id }));

test('the fixtures are valid', () => {
  for (const name of ['plan-10.json', 'plan-60.json']) assert.deepEqual(validatePlan(fixture(name)), [], name);
  for (const name of ['scene-1.json', 'scene-2.json']) assert.deepEqual(validateScene(fixture(name)), [], name);
  assert.deepEqual(validateResult(fixture('result-60.json')), []);
  const plan = fixture('plan-60.json');
  assert.deepEqual(validateManifest({ plan, scenes: scenesFor(plan) }), []);
});

test('every duration 10 to 120 in steps of 10 is a valid plan; 0, 9, 11, 61 and 121 are not', () => {
  for (let d = 10; d <= 120; d += 10) assert.deepEqual(validatePlan(planFor(d, 1)), [], `${d} s`);
  for (const d of [0, 9, 11, 61, 121]) has(validatePlan({ ...planFor(60, 1), durationSeconds: d }), /^durationSeconds:/);
});

test('a plan has at most min(8, ceil(d / 15)) scenes', () => {
  assert.deepEqual(validatePlan(planFor(60, 4)), []);
  has(validatePlan(planFor(60, 5)), /at most 4 scenes/);
  assert.deepEqual(validatePlan(planFor(120, 8)), []);
  has(validatePlan(planFor(10, 2)), /a 10 s video has at most 1 scenes/);
  has(validatePlan(planFor(120, 9)), /^scenes: must have 1 to 8/);
});

test('scene windows: contiguous from 0, multiples of 30 frames, at least 150, summing to d x 30', () => {
  const plan = fixture('plan-60.json'), at = (i, patch) => ({ ...plan, scenes: plan.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  has(validatePlan(at(3, { endFrame: 1770 })), /must end at frame 1800/);
  has(validatePlan(at(0, { endFrame: 465 })), /multiple of 30/);
  has(validatePlan(at(0, { startFrame: 30 })), /startFrame: must be 0/);
  const short = { ...plan, scenes: [{ ...plan.scenes[0], startFrame: 0, endFrame: 120 }, { ...plan.scenes[1], startFrame: 120, endFrame: 1800 }] };
  has(validatePlan(short), /at least 150/);
});

test('numbers are finite numbers: NaN, Infinity and a string where a number goes are refused', () => {
  const plan = fixture('plan-60.json'), scene = fixture('scene-1.json');
  for (const bad of [NaN, Infinity, -Infinity, '450']) has(validatePlan({ ...plan, scenes: [{ ...plan.scenes[0], endFrame: bad }, ...plan.scenes.slice(1)] }), /scenes\.0\.endFrame: must be a finite number/);
  for (const bad of [NaN, Infinity, '1440']) has(validateScene({ ...scene, primitives: [{ ...scene.primitives[1], cx: bad }, ...scene.primitives.slice(2)], beats: [{ ...scene.beats[0], reveals: ['dot'] }] }), /primitives\.0\.cx: must be a finite number/);
  has(validatePlan({ ...plan, durationSeconds: '60' }), /^durationSeconds:/);
});

test('a field the contract does not name is refused, at any depth', () => {
  const plan = fixture('plan-60.json'), scene = fixture('scene-1.json');
  has(validatePlan({ ...plan, model: 'x' }), /^model: is not a field/);
  has(validatePlan({ ...plan, scenes: [{ ...plan.scenes[0], code: 'x' }, ...plan.scenes.slice(1)] }), /^scenes\.0\.code: is not a field/);
  has(validateScene({ ...scene, primitives: [{ ...scene.primitives[0], onload: 'alert(1)' }, ...scene.primitives.slice(1)] }), /primitives\.0\.onload: is not a field/);
  has(validateScene(JSON.parse(JSON.stringify(scene).replace('"sceneId"', '"__proto__":{"x":1},"sceneId"'))), /__proto__: is not a field/);
  has(validateResult({ ...fixture('result-60.json'), extra: 1 }), /^extra: is not a field/);
  has(validateFailure({ code: 'render_failed', stage: 'rendering', reason: 'the drawing could not be rendered', previousRevisionAvailable: false, why: 'x' }), /^why:/);
});

test('scene bounds: primitive kinds and geometry, reveals of known primitives, beats, narration and pauses', () => {
  const scene = fixture('scene-2.json');
  has(validateScene({ ...scene, primitives: [...scene.primitives, { id: 'c', kind: 'code', color: '#000000', width: 2 }] }), /kind: must be one of/);
  has(validateScene({ ...scene, primitives: [...scene.primitives, { id: 'r', kind: 'rect', color: '#000000', width: 2, x: 0, y: 0, w: 10 }] }), /\.h: is required/);
  has(validateScene({ ...scene, beats: [{ ...scene.beats[0], reveals: ['ghost'] }] }), /ghost is not a primitive/);
  has(validateScene({ ...scene, beats: [scene.beats[0], { ...scene.beats[1], reveals: ['box'] }] }), /box is revealed twice/);
  has(validateScene({ ...scene, beats: Array.from({ length: 5 }, (_, i) => ({ ...scene.beats[2], id: `b${i}`, reveals: [] })) }), /^beats: must have 1 to 4/);
  has(validateScene({ ...scene, beats: [{ ...scene.beats[0], narration: 'a'.repeat(601) }] }), /narration: must be 0 to 600/);
  has(validateScene({ ...scene, beats: [{ ...scene.beats[2], pauseFrames: 91 }] }), /pauseFrames: must be 0 to 90/);
  has(validateScene({ ...scene, primitives: Array.from({ length: 81 }, (_, i) => ({ ...scene.primitives[0], id: `p${i}` })), beats: [{ ...scene.beats[0], reveals: [] }] }), /^primitives: must have 1 to 80/);
  const path = { id: 'p', kind: 'path', color: '#000000', width: 2, points: Array.from({ length: 1001 }, (_, i) => [i, 10]) };
  has(validateScene({ ...scene, primitives: [path], beats: [{ ...scene.beats[0], reveals: ['p'] }] }), /points: must have 2 to 1000/);
});

test('a manifest: the plan\'s scenes in order, per-video totals, timing inside windows, at most 256 KiB', () => {
  const plan = fixture('plan-60.json'), scenes = scenesFor(plan);
  has(validateManifest({ plan, scenes: [...scenes].reverse() }), /the plan's scenes, in order/);
  const long = planFor(120, 8); // 8 x 80 = 640 primitives: the per-video 400 binds (roadmap 6.5 as written)
  const fat = scenesFor(long).map(s => ({ ...s, primitives: [...s.primitives, ...Array.from({ length: 80 - s.primitives.length }, (_, i) => ({ ...s.primitives[0], id: `p${i}` }))] }));
  has(validateManifest({ plan: long, scenes: fat }), /at most 400 primitives per video/);
  const timing = { schema: 'whiteboard-timing/1', fps: 30, totalFrames: 1800, beats: [{ id: 'b1', sceneId: 's1', startFrame: 0, audioKey: 'audio/b1.mp3', audioFrames: 120 }] };
  assert.deepEqual(validateManifest({ plan, scenes, timing }), []);
  has(validateManifest({ plan, scenes, timing: { ...timing, totalFrames: 1770 } }), /totalFrames: must be 1800/);
  has(validateManifest({ plan, scenes, timing: { ...timing, beats: [{ ...timing.beats[0], startFrame: 400, audioFrames: 60 }] } }), /inside its scene's window/);
  // 256 KiB + 1 serialised is refused before anything else is read; exactly 256 KiB is not refused for its size.
  const sized = bytes => { const m = { plan, scenes, pad: '' }; m.pad = 'x'.repeat(bytes - Buffer.byteLength(JSON.stringify(m))); return m; };
  has(validateManifest(sized(256 * 1024 + 1)), /over 262144 bytes/);
  assert.ok(!validateManifest(sized(256 * 1024)).some(issue => /over 262144 bytes/.test(issue)));
  assert.deepEqual(validateManifest(sized(256 * 1024)), ['pad: is not a field of this contract']);
});

test('the timing line: wall seconds per stage, finite and not negative, 1 to 24 render segments', () => {
  const line = fixture('result-60.json').timings;
  assert.deepEqual(validateTimings(line), []);
  assert.deepEqual(validateTimings({ ...line, render: Array(24).fill(10) }), []);
  for (const bad of [-1, NaN, Infinity, '3']) has(validateTimings({ ...line, author: bad }), /^author:/);
  has(validateTimings({ ...line, render: [] }), /^render: must have 1 to 24/);
  has(validateTimings({ ...line, render: Array(25).fill(1) }), /^render: must have 1 to 24/);
  has(validateTimings({ ...line, render: [1, -0.5] }), /^render\.1:/);
  has(validateTimings({ ...line, review: 1 }), /^review: is not a field/);
  has(validateResult({ ...fixture('result-60.json'), timings: undefined }), /^timings: is required/);
});

test('a failure names one of the approved reasons', () => {
  const failure = { code: 'tts_failed', stage: 'narrating', reason: 'the narration could not be made', previousRevisionAvailable: false };
  assert.deepEqual(validateFailure(failure), []);
  has(validateFailure({ ...failure, reason: 'something broke' }), /^reason:/);
});

test('hashes: stable under key order; change on any content or version change; id and revision are not content', async () => {
  const plan = fixture('plan-60.json');
  const reordered = Object.fromEntries(Object.entries(plan).reverse().map(([k, v]) => [k, k === 'scenes' ? v.map(s => Object.fromEntries(Object.entries(s).reverse())) : v]));
  assert.equal(await planHash(reordered), await planHash(plan));
  assert.equal(await planHash({ ...plan, planId: 'wp_other', revision: 7 }), await planHash(plan));
  assert.notEqual(await planHash({ ...plan, goal: `${plan.goal}!` }), await planHash(plan));
  assert.notEqual(await planHash({ ...plan, scenes: [{ ...plan.scenes[0], facts: [{ ...plan.scenes[0].facts[0], value: 1 }] }, ...plan.scenes.slice(1)] }), await planHash(plan));
  assert.notEqual(await planHash({ ...plan, schema: 'whiteboard-plan/2' }), await planHash(plan));
  assert.match(await canonicalHash(plan), /^[0-9a-f]{64}$/);

  const parts = { plan, scenes: scenesFor(plan), assets: { 'audio/b1.mp3': 'a'.repeat(64) } }, v = whiteboardVersions();
  const base = await manifestHash(parts);
  assert.equal(await manifestHash({ ...parts, plan: reordered }), base);
  assert.notEqual(await manifestHash({ ...parts, scenes: [{ ...parts.scenes[0], beats: [{ ...parts.scenes[0].beats[0], narration: 'Changed.' }] }, ...parts.scenes.slice(1)] }), base);
  assert.notEqual(await manifestHash({ ...parts, assets: { 'audio/b1.mp3': 'b'.repeat(64) } }), base);
  for (const changed of [{ ...v, renderer: 'whiteboard-renderer-2' }, { ...v, policy: 2 }, { ...v, voice: 'other' }, { ...v, models: { ...v.models, author: 'claude-sonnet-5-5' } }]) assert.notEqual(await manifestHash(parts, changed), base);
});
