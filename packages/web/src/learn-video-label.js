// What a generated video card (LearningBlocks.jsx VideoBody) says, by operation. Each
// operation keeps its own words, so a Motion render never borrows the maths copy.
// `sources` is set only for a Motion video: its provenance line under the ready video.
const where = ref => (!ref.path ? ref.card_id || ref.url || ref.id
  : !ref.start_line ? ref.path
  : `${ref.path}:${ref.start_line}${ref.end_line > ref.start_line ? `–${ref.end_line}` : ''}`);

// M7B: the backend that rendered a Motion video, from its provenance. A pending /motion request
// does not know it yet (the orchestrator decides), so its card names none until the video arrives.
const RENDERER_LABELS = { remotion: 'Remotion', hyperframes: 'HyperFrames' };
const renderedBy = block => RENDERER_LABELS[block.motion?.renderer] ?? null;

export function videoLabel(block) {
  const op = block.operation;
  if (op?.op === 'generate_math_animation') {
    return { detail: `${op.scene.steps.length} steps · ${op.scene.steps.map(step => step.kind).join(', ')} · rendered by manim`, button: 'Render the animation', progress: 'Rendering the animation', expected: 240 };
  }
  // A /motion request (development builds): planned, reviewed and rendered by the orchestrator. Only
  // this operation can be stopped once started; its title and provenance arrive with the video.
  if (op?.op === 'motion_request') {
    const seconds = block.motion?.duration_seconds;
    return {
      detail: [seconds && `${seconds}s`, 'Motion explainer', renderedBy(block)].filter(Boolean).join(' · '),
      button: 'Generate the explainer', progress: 'Planning, reviewing and rendering', expected: 900, stoppable: true,
      ...(block.motion ? { sources: (block.motion.source_refs || []).map(where) } : {}),
    };
  }
  if (op?.op === 'motion_render') {
    const seconds = block.motion?.duration_seconds;
    return {
      detail: [seconds && `${seconds}s`, 'Motion explainer', renderedBy(block)].filter(Boolean).join(' · '),
      button: 'Add the rendered video', progress: 'Fetching the render', expected: 30,
      sources: (block.motion?.source_refs || []).map(where),
    };
  }
  return { detail: `${op?.duration || 4}s · ${op?.aspectRatio || '16:9'} · ${op?.purpose?.replace('_', ' ') ?? ''}`, button: 'Generate the video', progress: 'Generating the clip', expected: 180 };
}
