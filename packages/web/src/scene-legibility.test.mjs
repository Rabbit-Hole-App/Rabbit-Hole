import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGIBILITY_FLOORS, MAX_SCENE_VIEWPORT, legibilityIssues, sceneLegibility, typographyClassesUsed } from './scene-layout.js';
import { transformerBlockScene, vlmScene, worldModelScene, codebaseOrientationScene } from './gallery-scenes.js';
import { causalAttentionScene } from './reference-scenes.js';

// The mechanical form of the spec's typography invariant (docs/superpowers/
// specs/2026-09-18-visual-language-and-motion-design.md): "If you need to zoom
// the canvas to read the lesson, the lesson rendering is wrong." A reviewer
// screenshotted this gallery at 146% zoom because the camera was fitting a
// 1240-unit scene into a 528px frame and every 13px annotation was arriving on
// screen at about 5. Framing was already fixed; this is the other half.
//
//   effectiveFontPx = authoredFontSize x finalSceneScale
//
// The check keys on the SEMANTIC TEXT CLASS only - never on a scene id, an
// object id or any label text - so no gallery content can reach it, and a new
// scene is covered the moment it is added to the list below.
const GALLERY = [causalAttentionScene, transformerBlockScene, vlmScene, worldModelScene, codebaseOrientationScene];

test('the gallery is the five canvases the app review graded', () => {
  assert.equal(GALLERY.length, 5);
  assert.deepEqual(GALLERY.map(scene => scene.id).sort(), [
    'causal-self-attention',
    'codebase-architecture-orientation',
    'nanogpt-transformer-block',
    'vlm-image-to-llm',
    'world-model-branching-futures',
  ]);
});

test('every text class in every gallery scene renders at or above its legibility floor, at 100% canvas zoom', () => {
  const failures = GALLERY.flatMap(scene => legibilityIssues(scene))
    .map(issue => `${issue.scene}: "${issue.textClass}" renders at ${issue.effectivePx}px effective (authored ${issue.authored}px), below its ${issue.floor}px floor`);
  assert.deepEqual(failures, [], `instructional text below its legibility floor:\n${failures.join('\n')}`);
});

// A scene that cannot be given the viewport its floors need is not a scene
// with small text - it is a scene authored wider than any lesson column can
// show. Clamping is the condition the gate above then fails on, so it must
// never be silently true for a shipped canvas.
test('no gallery scene needs a viewport wider than a lesson column can give it', () => {
  for (const scene of GALLERY) {
    const report = sceneLegibility(scene);
    assert.equal(report.clamped, false, `${scene.id} needs ${report.viewport.w.toFixed(0)}px of frame, past the ${MAX_SCENE_VIEWPORT.w}px cap - re-author the scene narrower`);
    assert.ok(report.scale >= 1 - 1e-9, `${scene.id} renders at scale ${report.scale.toFixed(3)}, so the camera is shrinking its text`);
  }
});

test('the classes checked are the ones each scene actually draws, resolved from object type alone', () => {
  assert.deepEqual(typographyClassesUsed(transformerBlockScene), ['annotation', 'body']);
  assert.deepEqual(typographyClassesUsed(vlmScene), ['annotation', 'body', 'caption', 'metadata']);
  // An object nothing on the timeline ever reveals contributes no class and no
  // bounds - see everDrawn.
  const hidden = { id: 'x', width: 100, height: 100, duration: 1, timeline: [], objects: [{ id: 'ghost', type: 'text', initialState: { text: 'never shown', x: 0, y: 0, opacity: 0, typography: 'display' } }] };
  assert.deepEqual(typographyClassesUsed(hidden), []);
});

// Mutation proof: the gate has to FAIL, by name, on the exact defect it exists
// to catch. Both directions - a scene too wide for its own floors (which is
// what the reviewer actually hit), and a floor raised above what the scene can
// deliver - because a gate that only fires on one of them would let the other
// ship.
test('mutation proof: a scene widened past its viewport fails the gate, naming the scene and the class', () => {
  const widened = {
    ...transformerBlockScene,
    id: 'mutant-too-wide',
    objects: transformerBlockScene.objects.map(object => (object.id === 'add2'
      ? { ...object, initialState: { ...object.initialState, x: object.initialState.x + 900 } }
      : object)),
  };
  const issues = legibilityIssues(widened);
  assert.ok(issues.length > 0, 'a scene 900 units wider than its frame must not pass');
  for (const issue of issues) {
    assert.equal(issue.scene, 'mutant-too-wide');
    assert.ok(['annotation', 'body'].includes(issue.textClass), `expected a named text class, got ${issue.textClass}`);
    assert.ok(issue.effectivePx < issue.floor);
  }
  assert.ok(issues.some(issue => issue.textClass === 'annotation'), 'the annotation class is the one the review found at ~5px - it must be named');
  // ...and the unmutated scene it was derived from still passes, so the proof
  // is about the mutation, not about the gate being broken for everything.
  assert.deepEqual(legibilityIssues(transformerBlockScene), []);
});

test('mutation proof: raising a floor above what a scene can deliver fails it, and restoring the floor passes it again', () => {
  const real = LEGIBILITY_FLOORS.annotation;
  assert.deepEqual(legibilityIssues(transformerBlockScene), []);
  // LEGIBILITY_FLOORS is frozen, so the mutation is applied from the other
  // side of the same arithmetic: shrink the frame instead of raising the
  // floor. effectiveFontPx = authored x scale either way.
  const report = sceneLegibility(transformerBlockScene);
  assert.ok(report.effective.annotation.effectivePx >= real);
  // A viewport half the size the scene needs is exactly "the camera shrank it".
  const halved = legibilityIssues(transformerBlockScene, { w: report.viewport.w / 2, h: report.viewport.h / 2 });
  assert.ok(halved.some(issue => issue.textClass === 'annotation' && issue.effectivePx < real), 'halving the frame must drop the annotation class below its floor');
  assert.deepEqual(legibilityIssues(transformerBlockScene), [], 'and the real viewport still passes');
});
