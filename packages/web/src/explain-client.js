// /explain v2 jobs in the browser (EXP-T20 slice 1; server API C:/s/spec/explain/job-api-c.md, Lane C explain-job.js).
// The card is placed before the job runs, under a card id chosen once per press; polling only observes the job, and the
// result attaches to that card on that canvas, never another. The server never writes boards.
export const EXPLAIN_ROOT = '/api/learn/explain/jobs';

// What the card says while the job works: the server's stage, never a guess. No ellipses (UI copy rule).
const STAGES = {
  queued: 'Queued', preparing: 'Reading the request', awaiting_approval: 'Review the brief in Chat', authoring: 'Writing the explanation',
  validating: 'Checking it', rendering: 'Rendering it', reviewing: 'Reviewing the render', repairing: 'Fixing what the review found',
  ready: 'Ready', cancelled: 'Stopped',
};
export const explainStage = job => (job?.stage === 'failed' ? job.failure?.message || 'The explanation could not be made.' : STAGES[job?.stage] || 'Checking status');
// Polled while the server is working; a brief awaiting approval waits on the learner, not on a timer.
export const explainRunning = job => !!job && !job.terminal && job.stage !== 'awaiting_approval';

export function explainClient(api, boardId) {
  const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify({ boardId, ...body }) });
  return {
    create: request => post(EXPLAIN_ROOT, request),
    get: id => api(`${EXPLAIN_ROOT}/${encodeURIComponent(id)}?board=${encodeURIComponent(boardId)}`),
    action: (id, action, body = {}) => post(`${EXPLAIN_ROOT}/${encodeURIComponent(id)}/${action}`, body),
  };
}

// The server answers 404 explain_disabled where /explain v2 is off: the caller keeps today's /explain.
export const explainDisabled = error => error?.status === 404 && (error.data?.code === 'explain_disabled' || !error.data?.code);

// The card a submitted job holds until its result arrives: an Explanation card with no scene yet. Its id is the job's cardId.
export const explainPendingBlock = ({ job, title, prompt }) => ({
  id: job.cardId, type: 'animation', title: String(title || prompt || 'Explanation').slice(0, 200), scene: null,
  explainJob: { id: job.id, boardId: job.boardId, stage: job.stage },
});

const LAYOUT = ['dx', 'dy', 'w', 'h', 'space', 'cardLayout', 'locked', 'prompt'];
// The job's result as this card, or null when it is not this card's result on this canvas: a different card id, another
// board, a job this card is not waiting on, or a result without its identity. Placement and the card's saved prompt stay.
export function explainResultBlock(card, job, block) {
  const waiting = card?.explainJob;
  if (!waiting || job?.stage !== 'ready' || !block?.scene || !job.result) return null;
  if (job.id !== waiting.id || job.cardId !== card.id || block.id !== card.id || job.result.cardId !== card.id) return null;
  if (job.boardId !== waiting.boardId || job.result.canvas?.boardId !== waiting.boardId) return null;
  const kept = Object.fromEntries(LAYOUT.filter(key => Object.hasOwn(card, key)).map(key => [key, card[key]]));
  const { explainJob: _waiting, ...rest } = { ...card, ...block, ...kept, explain: job.result };
  return { ...rest, time: block.time ?? block.scene.duration, selectedObject: null, marked: null };
}
