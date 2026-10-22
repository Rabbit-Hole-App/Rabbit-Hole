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
// An ungrounded Motion video (learn-render contracts.js NO_SOURCE) is labelled, never shown as sourced.
const notGrounded = block => (block.motion?.grounding?.status === 'not_in_source' ? `Not grounded in ${block.motion.grounding.searched.join(', ')}`
  : block.motion?.grounding ? 'Not grounded in a source' : null);

// Owner message 30 (replacing message 25's wording): the learner never sees the reservation amount or how it is held. The server
// still holds it and returns it (LearnVideos list motionHoldUsd) for internal tools only.
// Owner message 28: while the server pauses new Motion generation (LearnVideos list motionPaused) the confirmation says so; the
// server refuses the start itself with the same text.
export const MOTION_PAUSED = 'Motion generation is temporarily unavailable while we fix a reliability issue.';
// hold: what the server said (learn-scene-client.js motionHold): 'paused', its estimate in credits (owner message 32), or null, which
// leaves PaidConfirm's default.
export const motionConfirm = hold => (hold === 'paused' ? MOTION_PAUSED
  : Number.isInteger(hold) && hold > 0 ? `This uses paid generation · about ${hold} credit${hold === 1 ? '' : 's'}` : 'This uses paid generation.');

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
      detail: [seconds && `${seconds}s`, 'Motion explainer', renderedBy(block), notGrounded(block)].filter(Boolean).join(' · '),
      button: 'Generate the explainer', progress: 'Planning, reviewing and rendering', expected: 900, stoppable: true,
      ...(block.motion ? { sources: (block.motion.source_refs || []).map(where) } : {}),
    };
  }
  if (op?.op === 'motion_render') {
    const seconds = block.motion?.duration_seconds;
    return {
      detail: [seconds && `${seconds}s`, 'Motion explainer', renderedBy(block), notGrounded(block)].filter(Boolean).join(' · '),
      button: 'Add the rendered video', progress: 'Fetching the render', expected: 30,
      sources: (block.motion?.source_refs || []).map(where),
    };
  }
  return { detail: `${op?.duration || 4}s · ${op?.aspectRatio || '16:9'} · ${op?.purpose?.replace('_', ' ') ?? ''}`, button: 'Generate the video', progress: 'Generating the clip', expected: 180 };
}
