// A finished Motion render on the canvas is the existing video block (packages/web/src/
// LearningBlocks.jsx BLOCK_TYPES.video / VideoBody), played through the existing LearnVideos
// job: operation motion_render names the render, `motion` carries the §18 provenance.
import { blockProvenance } from './contracts.js';

export function motionVideoBlock({ brief, renderId, jobId }) {
  const { motion_job_id, ...provenance } = blockProvenance({ id: jobId, prompt_spec_version: brief.prompt_spec_version, source_refs: brief.source_refs, brief });
  return {
    type: 'video',
    mode: 'generate',
    title: brief.title,
    src: '',
    caption: '',
    operation: { op: 'motion_render', render_id: renderId },
    motion: { job_id: motion_job_id, duration_seconds: brief.duration.seconds, renderer: 'remotion', teaching_mode: brief.teaching_mode, ...provenance },
    status: 'idle',
  };
}
