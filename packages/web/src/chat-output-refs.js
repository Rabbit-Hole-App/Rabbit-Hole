// The cards a Chat prompt made (UI changes brief sections 1 and 5), kept on that prompt's saved user message (meta.outputs,
// chat-outputs-route.js) and shown under it (ChatOutputs.jsx). The shape and its limits are the server's (control-plane
// chat-outputs.js), checked here the same way, so what the Chat shows is what a refresh restores.
// A click on one never generates: an existing card is focused, a deleted one is put back once from its snapshot (a CAD card's
// jobs un-hidden first), and one with no usable snapshot says why.
import { api } from './api.js';
import { retried } from './chat-persist.js';
import { cadArtifact } from './cad-client.js';
import { generationState } from './generation-state.js';
import { checkOutput, mergeOutputs, THUMB } from '../../control-plane/src/chat-outputs.js';

export { mergeOutputs };
// What a snapshot never keeps: where the card sat (a restore lands where the learner looks) and the flags that would start
// work on mount (a confirmed paid start, an image card's automatic search).
export const snapshotBlock = ({ dx, dy, confirmedStart, autoSearch, ...block }) => block; // eslint-disable-line no-unused-vars
const thumbOf = block => {
  const url = block.type === 'cad' ? block.thumbnailUrl || cadArtifact(block.manifest, 'thumbnail')?.url : block.type === 'image' ? block.src : null;
  return typeof url === 'string' && THUMB.test(url) && !url.split(/[/?]/).includes('..') ? url : null;
};
// One card as an output, or null when it cannot be one (an id or type the server would refuse).
export function outputOf(block, { startedAt = null } = {}) {
  if (!block?.id || !block.type) return null;
  const title = typeof block.title === 'string' ? block.title : '';
  return checkOutput({ v: 1, cardId: block.id, kind: block.type, title, jobId: typeof block.jobId === 'string' ? block.jobId : null, thumb: thumbOf(block), startedAt, snapshot: { v: 1, block: snapshotBlock(block) } }).value ?? null;
}
export const sameOutput = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// One PUT per message at a time (the route merges what it already holds), retried with the same body.
const queues = new Map();
export function saveOutputs(messageId, outputs, call = api, waits) {
  const key = String(messageId);
  const sent = (queues.get(key) || Promise.resolve()).catch(() => {})
    .then(() => retried(() => call(`/api/learn/chat/messages/${encodeURIComponent(key)}/outputs`, { method: 'PUT', body: JSON.stringify({ outputs }) }), waits));
  queues.set(key, sent);
  sent.finally(() => { if (queues.get(key) === sent) queues.delete(key); }).catch(() => {});
  return sent;
}

// A card-id sink for one prompt: each id a command or Tutor turn reports is read from the canvas once it is drawn (waitMs),
// turned into an output, shown at once (onOutput) and saved on the prompt's message once that has its server id
// (messageId: a promise of it). An id reported twice is one output.
export function outputSink({ messageId, ops, onOutput, call = api, waitMs = 10000, now = () => new Date().toISOString(), later = setTimeout }) {
  const seen = new Set();
  return id => {
    if (!id || typeof id !== 'string' || seen.has(id)) return;
    seen.add(id);
    const startedAt = now(), end = Date.now() + waitMs;
    const read = () => {
      const block = ops?.block?.(id);
      if (!block) { if (Date.now() < end) later(read, 200); return; }
      const output = outputOf(block, { startedAt });
      if (!output) return;
      onOutput(output);
      Promise.resolve(messageId).then(saved => saved && saveOutputs(saved, [output], call)).catch(error => console.info('[chat] output not saved:', error.message));
    };
    read();
  };
}
// The canvas a command or Tutor turn inserts through, with each new card's id reported to sink. Only the inserting calls are
// wrapped (they return the card's id); a card already on the canvas that is only revealed is not this prompt's output.
export function withCardSink(canvas, sink) {
  if (!canvas || !sink) return canvas;
  const tap = name => (canvas[name] ? { [name]: (...args) => { const id = canvas[name](...args); if (typeof id === 'string') sink(id); return id; } } : {});
  return { ...canvas, ...tap('insertBlock'), ...tap('insertNotebook'), ...tap('insertImported'), ...tap('insertPaper') };
}

// Why a deleted card cannot come back, or null when its snapshot restores it.
export function restoreProblem(output) {
  if (output?.unavailable === 'too_large') return 'This card was too large to keep a copy, so it can only be opened while it is on the canvas.';
  if (output?.unavailable === 'unstable') return 'This card held temporary data, so no copy was kept to restore.';
  const block = output?.snapshot?.block;
  if (!block) return 'No copy of this card was saved, so it cannot be restored.';
  if (generationState(block).phase !== 'done') return 'This card was removed before it finished, so there is nothing to restore.';
  if (block.type === 'cad' && !block.revisionId) return 'This model has no finished revision to restore.';
  return null;
}

// A click on an output (ChatOutputs.jsx). ops: the Chat's canvasOps (LearnPage): hasBlock, locate, restoreCard, cadPlacement,
// canEdit. Resolves to { located } | { restored } | { problem }. Never a generation, a model call or an executor call.
// Restoring is once: clicks while a restore runs, and until the canvas has drawn the card it put back (DRAWN_MS at most), share
// it and then locate, so repeated clicks never add a second card. A card deleted again after that is restored again.
const restoring = new Map();
const DRAWN_MS = 3000;
const drawn = (ops, id, wait) => new Promise(done => {
  const end = Date.now() + DRAWN_MS;
  const look = () => (ops.hasBlock(id) || Date.now() > end ? done() : wait(look));
  look();
});
export async function openOutput(output, ops, wait = next => setTimeout(next, 50)) {
  const id = output.cardId;
  if (restoring.has(id)) { await restoring.get(id).catch(() => {}); ops.locate(id); return { located: id }; }
  if (ops.hasBlock(id)) { ops.locate(id); return { located: id }; }
  if (!ops.canEdit?.()) return { problem: 'This card is no longer on the canvas. Only the canvas owner can restore it.' };
  const problem = restoreProblem(output);
  if (problem) return { problem };
  const block = output.snapshot.block;
  const run = (async () => {
    // A deleted CAD card hid its jobs (AdaptiveCanvas deleteSelection); they are shown again before the card returns.
    if (block.type === 'cad' && block.jobId) await ops.cadPlacement(block.jobId, false);
    ops.restoreCard({ ...block, dx: 0, dy: 0 });
    await drawn(ops, id, wait);
  })();
  restoring.set(id, run);
  try { await run; } catch (error) { return { problem: `This card could not be restored: ${error.message}` }; }
  finally { restoring.delete(id); }
  ops.locate(id);
  return { restored: id };
}

// One look at the canvas for every output in the transcript (the Chat's watch, ChatOutputs.jsx useGenerationWatch).
//   entries: { key, prompt, output, gen } per output - its card's generation state now ('missing' once the card is gone);
//   updates: { messageId, output } - a settled card whose output changed (its finished snapshot, a CAD thumbnail), to show and
//   save. Only a message with its server id is updated, so an output changed before its message was saved is saved once it is.
export function watchOutputs(msgs, ops) {
  const entries = [], updates = [];
  for (const m of msgs) {
    if (m.role !== 'user' || !m.outputs?.length) continue;
    const saved = /^\d+$/.test(String(m.messageId ?? ''));
    for (const output of m.outputs) {
      const live = ops?.block?.(output.cardId) || null;
      const gen = generationState(live);
      entries.push({ key: output.cardId, prompt: m.content, output, gen });
      if (!live || gen.active || !saved) continue;
      const fresh = outputOf(live, { startedAt: output.startedAt });
      if (fresh && !sameOutput(fresh, output)) updates.push({ messageId: m.messageId, output: fresh });
    }
  }
  return { entries, updates };
}
export const withOutputUpdates = (msgs, updates) => (updates.length ? msgs.map(m => {
  const mine = updates.filter(update => update.messageId === m.messageId).map(update => update.output);
  return mine.length && m.role === 'user' ? { ...m, outputs: mergeOutputs(m.outputs, mine) } : m;
}) : msgs);
