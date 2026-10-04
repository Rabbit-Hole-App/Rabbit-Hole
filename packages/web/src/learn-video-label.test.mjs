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
