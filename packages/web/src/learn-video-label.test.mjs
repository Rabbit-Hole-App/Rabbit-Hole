import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { videoLabel } from './learn-video-label.js';
import { motionVideoBlock } from '../../learn-render/motion/video-block.js';

// The two samples' operations as BLOCK_TYPES.mathAnimation / videoGenerate build them (LearningBlocks.jsx).
const maths = { operation: { op: 'generate_math_animation', scene: { steps: [{ kind: 'equation' }, { kind: 'plot' }, { kind: 'plot' }] } } };
const clip = { operation: { op: 'generate_video', purpose: 'physical_process', duration: 4, aspectRatio: '16:9' } };
const brief = JSON.parse(readFileSync(new URL('../../learn-render/motion/fixtures/demo-a/brief.json', import.meta.url), 'utf8'));
const motion = motionVideoBlock({ brief, renderId: 'a'.repeat(32), jobId: 'motion-job-demo-a' });

test('a Motion render has its own copy: duration, Motion explainer, Remotion and its sources, never the maths words', () => {
  const label = videoLabel(motion);
  assert.deepEqual(label, {
    detail: '15s · Motion explainer · Remotion', button: 'Add the rendered video', progress: 'Fetching the render', expected: 30,
    sources: ['model.py:44–45', 'model.py:62–64', 'model.py:65–71', 'model.py:48–50'],
  });
  assert.doesNotMatch(JSON.stringify(label), /manim|sigmoid|maths/i);
});

test('the maths and generate_video copy is unchanged, and neither gets a Motion sources line', () => {
  assert.deepEqual(videoLabel(maths), { detail: '3 steps · equation, plot, plot · rendered by manim', button: 'Render the animation', progress: 'Rendering the animation', expected: 240 });
  assert.deepEqual(videoLabel(clip), { detail: '4s · 16:9 · physical process', button: 'Generate the video', progress: 'Generating the clip', expected: 180 });
});

// M7A: a /motion request (development builds) on the same video card.
test('a /motion request: its own copy, Stop allowed, and once ready the duration and sources it brought', () => {
  const request = { operation: { op: 'motion_request', request: '/motion 15s explain me softmax func', location: { concept: 'Attention' } } };
  assert.deepEqual(videoLabel(request), { detail: 'Motion explainer', button: 'Generate the explainer', progress: 'Planning, reviewing and rendering', expected: 900, stoppable: true });
  const ready = { ...request, motion: { duration_seconds: 15, renderer: 'remotion', source_refs: [{ path: 'model.py', start_line: 62, end_line: 64 }] } };
  assert.deepEqual(videoLabel(ready), { detail: '15s · Motion explainer · Remotion', button: 'Generate the explainer', progress: 'Planning, reviewing and rendering', expected: 900, stoppable: true, sources: ['model.py:62–64'] });
  for (const other of [motion, maths, clip]) assert.equal(videoLabel(other).stoppable, undefined, 'only a /motion request can be stopped');
});

// M7B: the card names the backend its provenance names; a pending request names none.
test('a Motion video names the renderer that made it: Remotion or HyperFrames', () => {
  const hf = motionVideoBlock({ brief, renderId: 'b'.repeat(32), jobId: 'motion-job-hf', renderer: 'hyperframes' });
  assert.equal(videoLabel(hf).detail, '15s · Motion explainer · HyperFrames');
  assert.equal(videoLabel(motion).detail, '15s · Motion explainer · Remotion');
  const ready = { operation: { op: 'motion_request', request: '/motion 15s explain me softmax func', location: {} }, motion: { duration_seconds: 15, renderer: 'hyperframes', source_refs: [] } };
  assert.equal(videoLabel(ready).detail, '15s · Motion explainer · HyperFrames');
});
