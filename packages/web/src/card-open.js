// Selecting and opening a learning-canvas card (docs/features/canvas-card-selection.md). A click only
// selects; double-click, Enter and the selected card's Open pill open it: its reader when it has one,
// otherwise its Rabbit Hole, made first when it has none. Pure, so the rules are tested without a canvas.
import { resolveTarget } from './learn-target.js';

// What opening this block does. portal: its Rabbit Hole, if one exists; dive: Rabbit Holes are available
// here; readers: the page can open the side readers. null: nothing to open (a chat card never opens).
export function openTarget(block, { portal = null, dive = false, readers = false } = {}) {
  if (!block) return null;
  if (readers && block.type === 'wiki' && block.title) return { kind: 'reader', label: 'Open in reader', action: 'wiki-reader', payload: { title: block.title, section: block.section || 0 } };
  if (readers && block.type === 'paper' && block.paper?.id) return { kind: 'reader', label: 'Open in reader', action: 'paper-reader', payload: { id: block.paper.id, title: block.title, page: block.paper.page || 1 } };
  if (readers && block.type === 'pdf' && block.assetKey?.startsWith('pdf:')) return { kind: 'reader', label: 'Open in reader', action: 'pdf-reader', payload: { id: block.assetKey.slice(4), title: block.label } };
  // A YouTube moment has no reader panel (its embed is the card); its viewer is YouTube, at the moment.
  if (block.type === 'video' && block.videoId) return { kind: 'external', label: 'Open on YouTube', url: `https://www.youtube.com/watch?v=${block.videoId}${block.start ? `&t=${Math.floor(block.start)}s` : ''}` };
  if (portal) return { kind: 'enter', label: `Enter the Rabbit Hole: ${portal.title}`, name: portal.name };
  if (dive) return { kind: 'start', label: 'Start a Rabbit Hole from this card' };
  return null;
}

// A double-click on one of the card's own controls belongs to that control, never to Open: form fields,
// buttons, links, players, drawing surfaces and anything that sets its own pointer cursor (a draggable point,
// a slider thumb). The card's drag strip opens even though it shows a grab cursor.
const CONTROLS = 'input, textarea, select, button, a, label, summary, iframe, video, audio, canvas, [contenteditable="true"], [role="slider"], [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="option"], [role="textbox"], [data-sketch], [data-own-pointer]';
export function opensFrom(target, cursorOf = element => getComputedStyle(element).cursor) {
  if (!target?.closest) return false;
  if (target.closest('[data-drag-zone]')) return true;
  if (target.closest(CONTROLS)) return false;
  return ['auto', 'default', ''].includes(cursorOf(target));
}

// The one selected-card context (owner rule, 2026-10-06): the card's identities kept apart as the
// existing resolver names them (card_id is the authored card, null on a learner's own card; block_id is
// the canvas block), plus its title and material type. It rides the composer target; the request still
// carries the temporary browser-resolved { id, kind, title, text } until the server can resolve a card
// by id (canvas content is browser-only today).
export function selectedCardContext(block, title = null) {
  const { block_id, scene_id, card_id, concept_ids } = resolveTarget(block);
  return {
    card_id, block_id,
    ...(scene_id ? { scene_id } : {}),
    ...(concept_ids.length ? { concept_ids } : {}),
    ...(title ? { title } : {}),
    material_type: block.type,
  };
}
