// The Motion result rides the existing canvas video block, with its own metadata and none of
// the maths-animation sample's copy. node --test, no rendering, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { motionVideoBlock } from './video-block.js';

const brief = JSON.parse(readFileSync(new URL('./fixtures/demo-a/brief.json', import.meta.url), 'utf8'));

test('Demo A becomes a video block with a motion_render operation and Motion provenance', () => {
  const block = motionVideoBlock({ brief, renderId: '0123456789abcdef0123456789abcdef', jobId: 'motion-job-demo-a' });
  assert.equal(block.type, 'video');
  assert.equal(block.mode, 'generate');
  assert.equal(block.status, 'idle');
  assert.equal(block.title, 'How softmax turns attention scores into weights');
  assert.deepEqual(block.operation, { op: 'motion_render', render_id: '0123456789abcdef0123456789abcdef' });
  assert.deepEqual({ ...block.motion, source_refs: undefined }, {
    job_id: 'motion-job-demo-a', duration_seconds: 15, renderer: 'remotion', teaching_mode: 'mechanism_first',
    prompt_spec_version: 'motion-v1.0', source_refs: undefined, claim_ids: ['C1', 'C2', 'C3'],
  });
  assert.deepEqual(block.motion.source_refs.map(r => `${r.path}:${r.start_line}-${r.end_line}`), ['model.py:44-45', 'model.py:62-64', 'model.py:65-71', 'model.py:48-50']);
  assert.doesNotMatch(JSON.stringify(block), /manim|sigmoid|maths animation/i);
});
