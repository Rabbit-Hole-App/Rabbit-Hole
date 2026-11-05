// The whiteboard-render/1 static gate (roadmap v1 sections 6.2, 6.4, 6.5; W1.4): what may reach the renderer, and what never does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIMITS, RENDERER_VERSION, validateRenderRequest } from './contracts.mjs';
import { SERVER_POLICY, requestFor, sampleManifest, serverFixture, serverFixturesMissing, serverManifests, timingFor } from './test-requests.mjs';

const valid = () => requestFor(sampleManifest());
const rejects = (mutate, pattern) => {
  const body = valid();
  mutate(body);
  const errors = validateRenderRequest(body);
  assert.ok(errors.length, 'rejected');
  if (pattern) assert.ok(errors.some(e => pattern.test(e)), errors.join('\n'));
};
const prim = (body, id) => body.manifest.scenes[0].primitives.find(p => p.id === id);

test('the sample request drawing every W1 primitive kind is accepted', () => {
  assert.deepEqual(validateRenderRequest(valid()), []);
});

test('wb-server\'s fixture plans and scenes, mapped to render requests, are accepted', { skip: serverFixturesMissing }, () => {
  for (const manifest of serverManifests()) assert.deepEqual(validateRenderRequest(requestFor(manifest)), [], manifest.plan.planId);
  // The result fixture names the renderer version this service reports, and wb-server's policy pins the same string.
  assert.equal(serverFixture('result-60.json').rendererVersion, RENDERER_VERSION);
  assert.match(readFileSync(SERVER_POLICY, 'utf8'), new RegExp(`RENDERER_VERSION = '${RENDERER_VERSION}'`));
});

test('the renderer version is pinned', () => assert.equal(RENDERER_VERSION, 'whiteboard-renderer-1'));

test('a string where a number goes is refused, never coerced', () => {
  rejects(b => { prim(b, 'r').x = '100'; }, /primitives\.0\.x: must be a finite number/);
  rejects(b => { b.manifest.timing.beats[0].startFrame = '0'; }, /startFrame: must be a finite number/);
  rejects(b => { prim(b, 'g').points[0][1] = '16'; }, /points\.0\.1: must be a finite number/);
});

test('NaN and Infinity are refused', () => {
  rejects(b => { prim(b, 'e').rx = NaN; }, /rx: must be a finite number/);
  rejects(b => { prim(b, 'p').points[1][0] = Infinity; }, /must be a finite number/);
  rejects(b => { prim(b, 'g').domain[1] = -Infinity; }, /must be a finite number/);
});

test('a script-like key, an unknown field or a W2 kind is refused', () => {
  rejects(b => { prim(b, 't').onload = 'alert(1)'; }, /onload: is not a field of this contract/);
  rejects(b => { b.manifest.scenes[0].script = 'x'; }, /script: is not a field/);
  rejects(b => { Object.defineProperty(prim(b, 't'), '__proto__', { value: { polluted: true }, enumerable: true }); }, /__proto__: is not a field/);
  rejects(b => { b.extra = 1; }, /^extra: is not a field/);
  rejects(b => { b.manifest.plan.scenes[0].note = 'x'; }, /note: is not a field/);
  rejects(b => { b.manifest.scenes[0].primitives.push({ id: 'c', kind: 'code', color: '#000000', width: 2, x: 1, y: 1, size: 20, text: 'eval(1)' }); }, /kind: must be one of/);
  rejects(b => { b.manifest.scenes[0].illustration = { assetKey: 'k', regions: [] }; }, /illustration: is not a field/);
  rejects(b => { b.manifest.plan.scenes[0].illustration = true; }, /illustration: must be one of false/);
  rejects(b => { b.illustrations = [{ scene: 's1', b64: 'AAAA' }]; }, /illustrations: must have 0 to 0 items/);
});

test('geometry, colours, widths and strings are bounded', () => {
  rejects(b => { prim(b, 'r').color = 'red'; }, /color: has characters/);
  rejects(b => { prim(b, 'r').width = 13; }, /width: must be 1 to 12/);
  rejects(b => { prim(b, 'r').x = 1921; }, /x: must be 0 to 1920/);
  rejects(b => { prim(b, 't').text = 'x'.repeat(201); }, /text: must be 1 to 200 characters/);
  rejects(b => { b.manifest.scenes[0].beats[0].narration = 'x'.repeat(601); }, /narration: must be 0 to 600/);
  rejects(b => { b.job_id = '../etc'; }, /job_id: has characters/);
});

test('reveals name existing primitives, each once; ids are unique', () => {
  rejects(b => { b.manifest.scenes[0].beats[0].reveals.push('nope'); }, /nope is not a primitive/);
  rejects(b => { b.manifest.scenes[0].beats[1].reveals.push('r'); }, /r is revealed twice/);
  rejects(b => { prim(b, 'e').id = 'r'; }, /ids must be unique/);
});

test('over-cap counts are refused: primitives, path points, beats, scenes', () => {
  const many = n => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, kind: 'line', color: '#000000', width: 2, x1: 0, y1: 0, x2: 10, y2: 10 }));
  rejects(b => { b.manifest.scenes[0].primitives = many(LIMITS.primitivesPerScene + 1); }, /primitives: must have 1 to 80 items/);
  rejects(b => { prim(b, 'p').points = Array.from({ length: LIMITS.pointsPerPath + 1 }, () => [1, 1]); }, /points: must have 2 to 1000 items/);
  rejects(b => { prim(b, 'g').points = Array.from({ length: LIMITS.graphPoints + 1 }, () => [1, 1]); }, /points: must have 2 to 64 items/);
  rejects(b => { b.manifest.scenes[0].beats = Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, narration: '', reveals: [], pauseFrames: 0 })); }, /beats: must have 1 to 4 items/);
  rejects(b => { b.manifest.plan.scenes = Array(9).fill(b.manifest.plan.scenes[0]); }, /scenes: must have 1 to 8 items/);
  // Per video: 6 scenes of 70 primitives is 420 > 400; 13 paths of 1,000 points is 13,000 > 12,000.
  const video = scenes => {
    const plan = { ...sampleManifest().plan, durationSeconds: scenes.length * 10 };
    plan.scenes = scenes.map((_, i) => ({ ...plan.scenes[0], id: `s${i}`, startFrame: i * 300, endFrame: (i + 1) * 300 }));
    const sc = scenes.map((primitives, i) => ({ schema: 'whiteboard-scene/1', sceneId: `s${i}`, primitives, beats: [{ id: 'b1', narration: '', reveals: [], pauseFrames: 0 }] }));
    return validateRenderRequest(requestFor({ plan, scenes: sc, timing: timingFor(plan, sc) }));
  };
  assert.deepEqual(video(Array.from({ length: 6 }, () => many(66))), []); // 396
  assert.ok(video(Array.from({ length: 6 }, () => many(70))).some(e => /at most 400 primitives per video/.test(e)));
  const paths = n => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, kind: 'path', color: '#000000', width: 2, points: Array.from({ length: 1000 }, (_, k) => [k, k % 500]) }));
  assert.ok(video([paths(7), paths(6)]).some(e => /at most 12000 path points per video/.test(e)));
});

test('total frames must be exactly seconds x 30, and the windows must cover them', () => {
  rejects(b => { b.manifest.timing.totalFrames = 299; }, /totalFrames: must be 300/);
  rejects(b => { b.manifest.plan.scenes[0].endFrame = 290; }, /windows must end at frame 300/);
  rejects(b => { b.segment.endFrame = 290; }, /segment: must be frames 0 to 300/);
});

test('one segment only in W1: of > 1 or index > 0 is refused', () => {
  rejects(b => { b.segment.of = 2; }, /W1 renders one segment/);
  rejects(b => { b.segment = { index: 1, of: 2, startFrame: 0, endFrame: 300 }; }, /W1 renders one segment/);
  rejects(b => { b.segment.of = 7; }, /of: must be 1 to 6/);
});

test('seconds outside W1 are refused: off the 10 s grid, or over 60 s', () => {
  rejects(b => { b.manifest.plan.durationSeconds = 15; }, /durationSeconds: must be one of/);
  rejects(b => { b.manifest.plan.durationSeconds = 0; }, /durationSeconds: must be one of/);
  rejects(b => { b.manifest.plan.durationSeconds = 130; }, /durationSeconds: must be one of/);
  rejects(b => { // a 70 s video, otherwise valid
    b.manifest.plan.durationSeconds = 70; b.manifest.plan.scenes[0].endFrame = 2100; b.manifest.timing.totalFrames = 2100; b.segment.endFrame = 2100;
  }, /W1 renders up to 60 s/);
});

test('timing must be the scenes\' beats in order, each beat\'s audio inside its window and after the previous one', () => {
  rejects(b => { b.manifest.timing.beats.reverse(); }, /must be the scenes' beats, in order/);
  rejects(b => { b.manifest.timing.beats[1].startFrame = 290; b.manifest.timing.beats[1].audioFrames = 20; }, /inside its scene's window/);
  rejects(b => { b.manifest.timing.beats[1].startFrame = 30; }, /after the previous beat's audio/);
  rejects(b => { b.manifest.timing.beats[0].audioFrames = 0; b.audio.shift(); }, /a narrated beat has audio/);
});

test('audio: one base64 MP3 per narrated beat, named by its audioKey, at most 8 MiB decoded', () => {
  rejects(b => { b.audio.pop(); }, /one entry per narrated beat/);
  rejects(b => { b.audio.push({ ...b.audio[0] }); }, /one entry per narrated beat/);
  rejects(b => { b.audio[0].beat = 'whiteboard/other.mp3'; }, /one entry per narrated beat/);
  rejects(b => { b.audio[0].b64 = 'not base64!'; }, /must be non-empty base64/);
  rejects(b => { b.audio[0].b64 = ''; }, /must be non-empty base64/);
  rejects(b => { b.audio[0].b64 = 'A'.repeat(Math.ceil(LIMITS.beatAudioBytes / 3) * 4 + 4); }, /over 8388608/);
  assert.equal(LIMITS.bodyBytes, 16 * 1024 * 1024); // the whole body's cap, enforced while it is read (routes.test.mjs: 413)
});
