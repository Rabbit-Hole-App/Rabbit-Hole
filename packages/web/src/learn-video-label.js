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

// What a Motion job does to the learner's allowance (owner messages 22 and 25): a temporary reservation of the amount the server
// says it holds (LearnVideos list motionHoldUsd, MOTION_JOB_RESERVATION_USD), actual AI usage charged, the rest released, and
// rendering covered by Rabbit Hole. No amount of the browser's own: without the server's, the note names none.
const money = usd => `$${usd.toFixed(2)}`;
const known = usd => Number.isFinite(usd) && usd > 0;
export const motionHoldNote = usd => `Temporarily reserves ${known(usd) ? `${money(usd)} from your available AI allowance` : 'part of your available AI allowance'}. Only actual AI usage is charged; the unused reservation is released once the final cost is confirmed. Rendering is covered by Rabbit Hole.`;
// Owner message 28: while the server pauses new Motion generation (LearnVideos list motionPaused) the confirmation says so; the
// server refuses the start itself with the same text.
export const MOTION_PAUSED = 'Motion generation is temporarily unavailable while we fix a reliability issue.';
// hold: what the server said (learn-scene-client.js motionHold): the reservation amount, 'paused', or null.
export const motionConfirm = hold => (hold === 'paused' ? MOTION_PAUSED : `This uses paid generation. ${motionHoldNote(hold)}`);
// The card's reservation line from the job's hold ({usd, state} in the LearnVideos list): reserved while it runs, pending while
// its final cost is not confirmed, nothing once released.
export function motionHoldStatus(hold) {
  if (!hold || !known(hold.usd)) return null;
  if (hold.state === 'reserved') return `${money(hold.usd)} of your AI allowance is reserved until the final cost is confirmed. Only actual AI usage is charged.`;
  if (hold.state === 'pending') return `Reconciliation pending: the ${money(hold.usd)} reservation stays until the final cost is confirmed.`;
  return null;
}

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
