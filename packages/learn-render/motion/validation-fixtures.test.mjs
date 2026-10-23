// The validation fixtures are valid motion-render/1 jobs for every scene, ratio and the duration extremes, and the matrix is the plan's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stageFor } from './contracts.js';
import { checkComposition } from './static-check.js';
import { MATRIX, MOTION_RATIOS, SCENES, buildFixture, fixtureErrors } from './validation-fixtures.js';

test('every scene passes the service\'s static checks and the Author contract at every ratio, at 5, 30 and 60 s', () => {
  assert.equal(MOTION_RATIOS.length, 9);
  let n = 0;
  for (const scene of Object.keys(SCENES)) for (const ratio of MOTION_RATIOS) for (const seconds of [5, 30, 60]) {
    const f = buildFixture({ scene, ratio, seconds });
    assert.deepEqual(fixtureErrors(f), [], `${scene} ${ratio} ${seconds}s`);
    assert.deepEqual(checkComposition(f.source, { durationSeconds: seconds, stage: stageFor(ratio) }), [], `${scene} ${ratio} ${seconds}s static check`);
    const { width, height } = stageFor(ratio);
    assert.match(f.source, new RegExp(`stage = \{ width: ${width}, height: ${height}, fps: 30, durationInFrames: ${seconds * 30} \}`));
    assert.equal(f.storyboard.beats.at(-1).end_time, seconds);
    assert.ok(f.source.length < 64 * 1024);
    n++;
  }
  assert.equal(n, 81);
});

test('the checks bite: a fixture is refused at another ratio or duration, and a broken source fails', () => {
  const f = buildFixture({ scene: 'medium', ratio: '16:9', seconds: 15 });
  const wrongRatio = { ...f, ratio: '9:16' };
  assert.ok(fixtureErrors(wrongRatio).some(e => /stage\.width must be the literal 1080/.test(e)));
  assert.ok(fixtureErrors({ ...f, seconds: 30 }).some(e => /durationInFrames must be the literal 900/.test(e)));
  const broken = { ...f, source: f.source.replace("'remotion'", "'react-dom'") };
  assert.ok(fixtureErrors(broken).length > 0);
  const noText = { ...f, source: f.source.replace(/TEXT\[CAPTIONS\[beat\]\]/, '"Some new prose in the code"') };
  assert.ok(fixtureErrors(noText).length > 0);
});

test('scenes differ in load, and the layer count can be overridden', () => {
  const at = scene => buildFixture({ scene, ratio: '16:9', seconds: 15 });
  assert.deepEqual(['simple', 'medium', 'heavy'].map(s => at(s).layers), [0, 40, 160]);
  assert.deepEqual(['simple', 'medium', 'heavy'].map(s => at(s).storyboard.beats.length), [3, 5, 8]); // 15 s allows floor(15 / 1.5) = 10 beats; each scene caps it
  assert.equal(buildFixture({ scene: 'heavy', ratio: '16:9', seconds: 60 }).storyboard.beats.length, 8);
  assert.equal(buildFixture({ scene: 'heavy', ratio: '16:9', seconds: 5 }).storyboard.beats.length, 3); // 5 s: floor(5 / 1.5)
  assert.match(at('heavy').source, /const LAYERS = 160;/);
  assert.match(at('heavy').source, /boxShadow/);
  const tuned = buildFixture({ scene: 'heavy', ratio: '1:1', seconds: 15, layers: 300 });
  assert.match(tuned.source, /const LAYERS = 300;/);
  assert.deepEqual(fixtureErrors(tuned), []);
  for (const bad of [{ scene: 'huge' }, { ratio: '7:5' }, { seconds: 4 }, { seconds: 61 }, { seconds: 7.5 }, { layers: -1 }, { layers: 401 }]) assert.throws(() => buildFixture({ scene: 'medium', ratio: '16:9', seconds: 15, ...bad }), /scene|ratio|seconds|layers/);
});

test('the matrix is the plan\'s 21 deterministic runs, all buildable and valid, covering all nine ratios', () => {
  assert.deepEqual(MATRIX.map(r => r.id), Array.from({ length: 21 }, (_, i) => `D${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(new Set(MATRIX.filter(r => r.seconds === 15 && r.scene === 'medium').map(r => r.ratio)), new Set(MOTION_RATIOS));
  assert.deepEqual(MATRIX.filter(r => r.stage === 'preview').map(r => r.id), ['D21']);
  assert.deepEqual(MATRIX.filter(r => r.seconds === 60).map(r => r.id), ['D13', 'D14', 'D15', 'D16', 'D19', 'D20', 'D21']);
  for (const r of MATRIX) assert.deepEqual(fixtureErrors(buildFixture(r)), [], r.id);
});
