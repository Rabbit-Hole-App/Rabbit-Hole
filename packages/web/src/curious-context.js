// Curious where this goes? (docs/features/professor-next-steps.md 2.8, owner task 2): what the planner reads of a canvas,
// through the shared semantic snapshot (canvas-semantics.js). Its own small module, so the canvas chunk that computes it
// never loads the planner. Pure.
import { cardText, semanticSnapshot } from './canvas-semantics.js';

// What Curious reads of a canvas: lesson cards and native objects through the shared snapshot, in a smaller
// budget, never chat cards (their answers are never hook input, and a streaming answer must not re-plan). board:
// AdaptiveCanvas semanticBoard(), the open editor's words overlaid. focus: recent edits, then the selection.
export const CURIOUS_BUDGET = Object.freeze({ objects: 40, chars: 2500 });
export const curiousSnapshot = (board, focus = []) => semanticSnapshot({ ...board, exchanges: [] }, { budget: CURIOUS_BUDGET, focus: { ids: focus } });

// Recent meaningful edits, newest first: the ids whose words or kind changed, which arrived, or which a new or changed link
// touches, since the last read (previous: the last result; null reads the baseline). A move changes none of these.
const RECENT = 12;
export function recentEdits(previous, board) {
  const sigs = new Map(), words = entity => [entity.kind ?? entity.type, entity.text ?? entity.label ?? entity.latex ?? '', entity.type ? cardText(entity) : ''].join('\u0001');
  for (const entity of [...(board.shapes || []), ...(board.items || []), ...(board.blocks || [])]) sigs.set(entity.id, words(entity));
  const links = new Map((board.links || []).map(link => [link.id, link]));
  for (const link of links.values()) sigs.set(link.id, JSON.stringify([link.from, link.to, link.label ?? '', link.kind ?? '']));
  if (!previous) return { sigs, ids: [] };
  const touched = [...sigs].filter(([id, sig]) => previous.sigs.get(id) !== sig).flatMap(([id]) => (links.has(id) ? [links.get(id).from, links.get(id).to] : [id]));
  return { sigs, ids: [...new Set([...touched, ...previous.ids])].filter(id => sigs.has(id)).slice(0, RECENT) };
}
