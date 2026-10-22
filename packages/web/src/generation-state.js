// One generation-job state per card (UI changes brief section 2): the card and the Chat's "Generating on the canvas" indicator
// read the same thing, so they enter and leave their active state together. The card's block is the source: a CAD card's
// status is its job's state (cad-contract.js cadBlock, kept current by CadCard's poll); a paid video, maths animation or Blender
// scene card's status is its job's (LearningBlocks.jsx VideoBody, SceneBody). A card with no job is done when it lands.
// No percentage is invented: progress is null unless a card reports a real one (none does today), so the indicator spins.
//   phase: 'running' | 'waiting' (a CAD question) | 'idle' (a paid card not started) | 'done' | 'failed' | 'cancelled' | 'missing'
import { cadRunning, cadStage } from './cad-client.js';

const RUNNING = { queued: 'Queued', generating: 'Generating', rendering: 'Rendering' };

export function generationState(block) {
  if (!block) return { phase: 'missing', active: false, label: '', progress: null };
  if (block.type === 'cad') {
    const state = block.status || 'queued';
    if (cadRunning(state)) return { phase: 'running', active: true, label: cadStage(state), progress: null };
    return { phase: state === 'ready' ? 'done' : state === 'waiting_for_answer' ? 'waiting' : state, active: false, label: cadStage(state), progress: null };
  }
  // A paid card inserted already confirmed (learn-slash.js) starts on mount: it is running from the moment it lands.
  if (RUNNING[block.status] || (block.confirmedStart && block.status === 'idle')) return { phase: 'running', active: true, label: RUNNING[block.status] || 'Starting', progress: null };
  if (block.status === 'failed') return { phase: 'failed', active: false, label: 'Failed', progress: null };
  if (block.status === 'idle') return { phase: 'idle', active: false, label: 'Not started', progress: null };
  return { phase: 'done', active: false, label: 'Done', progress: null };
}

// The stable line a settled job shows (the indicator's words); active jobs say "Generating on the canvas".
export const SETTLED_TEXT = { done: 'Generated on the canvas', failed: 'Generation failed', cancelled: 'Generation cancelled', waiting: 'Waiting for your answer on the card', idle: 'Not started', missing: 'The card was removed' };

// The job a paid video or scene card starts, as the server keys it (control-plane learn-video.js, learn-scene.js: the card's
// operation). A /motion request is its own job per Generate press (request_id, owner message 37) or per approved proposal (one
// video each); one with neither has no fixed job, so it never matches. Whole-operation equality is conservative: two
// operations that differ only in a field the server ignores still get two cards, as before.
const jobOf = block => {
  const op = block?.operation;
  if (!op?.op || !['video', 'scene'].includes(block.type)) return null;
  if (op.op === 'motion_request') return op.proposal?.proposal_id ? `proposal:${op.proposal.proposal_id}` : op.request_id ? `press:${op.request_id}` : null;
  return `${block.type}:${JSON.stringify(op)}`;
};
// The card already on the canvas for the job `block` would start, once that card has started it (an unstarted sample with the
// same operation is not one): the server would answer with that card's job, so its card is reused, never a second card.
export function existingGeneration(blocks, block) {
  const job = jobOf(block);
  if (!job) return null;
  return (blocks || []).find(other => other !== block && jobOf(other) === job && (other.status !== 'idle' || other.confirmedStart || other.placementId)) || null;
}
