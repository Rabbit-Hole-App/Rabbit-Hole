// What a shared canvas shows of its board (SHARE-01, owner brief 2026-10-22 section 7): the content deliberately placed on
// the canvas, never the creator's own learning state. Applied to every state a share link or publication answers with
// (GET /api/learn/boards/shared/:token) and to the source a link visitor forks, so neither the page nor a fork carries it.
//
// Kept: the canvas's content keys (as forkState copies them) and its document. Dropped: anything else a browser saved
// beside them (the Materials list `sources`, selection, view, any newer personal key), and on each card the creator's own
// answers, attempts, marks and highlights. The cards themselves, chat cards included, stay: they were placed on the canvas.
import { roleFor } from '../../web/src/canvas-permissions.js';

// toc: the Table of contents' own list (owner brief 2026-10-23), shown and forked without the creator's ticks.
const CONTENT = ['strokes', 'shapes', 'items', 'links', 'blocks', 'groups', 'areas', 'exchanges', 'toc'];
// The learner's state on a card, by card type (LearningBlocks.jsx bodies; scene-activity.js for every interactive card).
const LEARNER = {
  challenge: ['answer', 'attemptId', 'verdict', 'grading', 'sketch', 'sketchOpen', 'sketchSubmitted'],
  quiz: ['choice'],
  code: ['draft'],
  flashcards: ['marks'],
  paper: ['highlights'],
  heading: ['done'], // the creator's own section ticks (the Table of contents' checkboxes)
};
const EVERY_CARD = ['attemptLog', 'activityAnswer', 'activityOpen'];

function sharedBlock(block) {
  if (!block || typeof block !== 'object') return block;
  const drop = [...EVERY_CARD, ...(LEARNER[block.type] || [])];
  if (!drop.some(key => key in block)) return block;
  const copy = { ...block };
  for (const key of drop) delete copy[key];
  return copy;
}

export function sharedState(state) {
  const out = {};
  for (const key of CONTENT) if (Array.isArray(state?.[key])) out[key] = state[key];
  if (state?.doc && typeof state.doc === 'object' && !Array.isArray(state.doc)) out.doc = state.doc;
  if (out.blocks) out.blocks = out.blocks.map(sharedBlock);
  if (out.toc) out.toc = out.toc.map(entry => { if (!entry || typeof entry !== 'object' || !('done' in entry)) return entry; const { done: _done, ...copy } = entry; return copy; });
  return out;
}

// The visitor's access on a link, in the canvas-permissions model: the role, and which companion panels this link may
// show. Context (the Materials list) and Files are the creator's working set, not placed content: none is shareable yet.
export function linkAccess({ found, viewer = null, member = false }) {
  const role = roleFor({ signedIn: !!viewer, owner: viewer?.email === found.row.owner_email, member: !!member });
  return { role, shareable: { context: false, files: false } };
}

