// The /whiteboard video card's block (type whiteboardVideo; roadmap 5.1 steps 3 and 8): pure reads and writes, so the card, the page and
// the tests share one mapping. A pending card carries its job (whiteboardJob: id, board, request, stage); a finished one carries its video
// (whiteboard: artifactId, revision, planHash, measured, status 'ready'), served by the assets route, so a reload never asks the job.
// The job is wb-server's publicWhiteboardJob (whiteboard-job.js: stage, title, plan.goal, failure.message, result).
// shortcut: result is assumed to be the 6.4 WhiteboardResult (artifactId, revision, planHash, measured) until W1.3 writes it.
export const WHITEBOARD_CARD = 'whiteboardVideo';
// The card's title until the plan names it: the command's approved label (roadmap 1.3).
export const WHITEBOARD_TITLE = 'Whiteboard';

// The stage words (roadmap 1.3), from the server's stage (6.1). A plan waiting on the learner says what to do, in the proposal's own
// heading. An unknown stage says nothing rather than guess.
const STAGE_WORDS = Object.freeze({
  queued: 'Planning', planning: 'Planning', awaiting_approval: 'Review your whiteboard', authoring: 'Writing', narrating: 'Narrating', timing: 'Narrating',
  reconciling: 'Narrating', rendering: 'Drawing', reviewing: 'Checking', repairing: 'Checking', ready: 'Ready',
});
export const stageWord = stage => STAGE_WORDS[stage] ?? null;

// The card placed when the job is created, under the job's own card id.
export const pendingBlock = (job, { boardId, requestId, threadId = null }) => ({
  id: job.cardId, type: WHITEBOARD_CARD, title: WHITEBOARD_TITLE,
  whiteboardJob: { id: job.id, boardId, requestId, stage: job.stage, ...(threadId ? { threadId } : {}) },
});
export const jobOf = block => block?.whiteboardJob ?? null;
export const videoOf = block => (block?.whiteboard?.status === 'ready' && typeof block.whiteboard.artifactId === 'string' ? block.whiteboard : null);

// A job read onto its card. -> { action: 'apply' (the video landed: an undo step), 'progress' (the stage, quietly), 'keep' (nothing),
// 'unreadable' (ready but naming no usable result) }, with the next block. A job for another card or board never lands.
export function settleWhiteboard(block, job) {
  const waiting = jobOf(block);
  if (!waiting || !job || job.id !== waiting.id || (job.cardId && job.cardId !== block.id) || (job.boardId && job.boardId !== waiting.boardId)) return { action: 'keep', block };
  if (job.stage === 'ready') {
    const r = job.result;
    if (typeof r?.artifactId !== 'string' || !r.artifactId || !Number.isSafeInteger(r.revision)) return { action: 'unreadable', block };
    const { whiteboardJob: _done, ...rest } = block;
    return { action: 'apply', block: { ...rest, title: String(job.title || block.title).slice(0, 200), ...(job.plan?.goal ? { goal: String(job.plan.goal).slice(0, 500) } : {}),
      whiteboard: { artifactId: r.artifactId, revision: r.revision, planHash: r.planHash ?? null, measured: r.measured ?? null, status: 'ready' } } };
  }
  const message = job.stage === 'failed' && job.failure?.message ? String(job.failure.message).slice(0, 300) : null;
  if (job.stage === waiting.stage && (message ?? null) === (waiting.message ?? null) && (!job.title || job.title === block.title)) return { action: 'keep', block };
  const { message: _old, ...kept } = waiting;
  return { action: 'progress', block: { ...block, ...(job.title ? { title: String(job.title).slice(0, 200) } : {}), whiteboardJob: { ...kept, stage: job.stage, ...(message ? { message } : {}) } } };
}

// The download's file name (roadmap 1.3): the card title as an ASCII slug of at most 60 characters, then .mp4.
export function downloadName(title) {
  const slug = String(title ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return `${slug || 'whiteboard'}.mp4`;
}

// What the Tutor reads about the card (LearningBlocks describeBlock): its title and goal (W5 adds the transcript).
export const describeWhiteboard = block => ({ kind: 'Whiteboard video', title: block.title,
  text: [`Narrated whiteboard video on the canvas: ${block.title}`, block.goal ? `Goal: ${block.goal}` : '', jobOf(block) ? `Generation status: ${jobOf(block).stage}` : ''].filter(Boolean).join('\n') });
