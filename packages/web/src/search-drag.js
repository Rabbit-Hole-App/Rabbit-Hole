// Search results dragged onto the canvas (UI-13, owner brief 2026-10-21 message 21 item 2). A result that is an object on
// this canvas moves that same object; a linked canvas adds a link card (the canvas's own insertRefCard, Link to canvas...),
// or moves the link card already here, so a drop never duplicates one. A view-only canvas or a locked object refuses with a
// reason. Pure apart from the one drag in progress: a dragover cannot read the dragged data, so the page keeps it here.
import { REF_CARD } from './canvas-refs-model.js';

export const SEARCH_DRAG = 'application/x-rh-search-result';

let active = null;
export const searchDrag = {
  start: payload => (active = { payload, outcome: null, refusal: null }),
  current: () => active,
  end: () => { const done = active; active = null; return done; },
};

// What a result carries when dragged, or null when it cannot be placed (a comment, a document block, an unavailable canvas).
export function searchDragPayload(result) {
  if (result?.kind === 'link') return !result.link?.unavailable && result.target?.id ? { kind: 'link', target: result.target.id, title: result.title } : null;
  if (['card', 'item', 'shape'].includes(result?.kind) && result.objectId) return { kind: 'object', id: result.objectId, title: result.title };
  return null;
}

// The link card already on this canvas for a target canvas, if any.
export const linkCardFor = (blocks, target) => (blocks || []).find(block => block?.type === 'canvas-ref' && block.refs?.[0]?.target === target) || null;

// What a drop at a world point does. canvas: { readOnly, locked: Set, blocks: [], box(id) -> { x, y, w, h } | null }.
// size: the box drawn at the drop point - the card lands centred on the pointer, its top edge at it.
export function searchDropPlan(payload, canvas) {
  if (canvas.readOnly) return { action: 'refuse', reason: 'This canvas is view-only, so nothing can be moved or added.' };
  let id = payload?.kind === 'object' ? payload.id : null, message = null;
  if (payload?.kind === 'link') {
    const existing = linkCardFor(canvas.blocks, payload.target);
    if (!existing) return { action: 'link', target: payload.target, size: REF_CARD, label: 'Add link card here' };
    id = existing.id; message = 'Moved the link card already on this canvas.';
  }
  if (!id) return { action: 'refuse', reason: 'This result cannot be placed on the canvas.' };
  if (canvas.locked?.has(id)) return { action: 'refuse', reason: 'This card is locked. Unlock it to move it.' };
  const box = canvas.box(id);
  if (!box) return { action: 'refuse', reason: 'This result is no longer on the canvas.' };
  return { action: 'move', id, size: { w: box.w, h: box.h }, label: message ? 'Move the existing link card here' : 'Move here', ...(message ? { message } : {}) };
}

// The top-left of the box a plan lands at a world point.
export const dropSpot = (plan, at) => ({ x: at.x - plan.size.w / 2, y: at.y });

// Do the plan through the canvas api (moveTo, insertRefCard: each one undo step). Returns what the Search panel says.
export function applySearchDrop(api, plan, at) {
  if (plan.action === 'move') return api?.moveTo?.(plan.id, dropSpot(plan, at)) ? { id: plan.id, message: plan.message || null } : { message: 'This card could not be moved.' };
  if (plan.action === 'link') { const id = api?.insertRefCard?.(plan.target, null, dropSpot(plan, at)); return id ? { id, message: null } : { message: 'This canvas cannot take a link card.' }; }
  return { message: plan.reason };
}

// The drop outline over the canvas (screen pixels in the surface), or hidden with plan null. view: the camera { x, y, z }.
export function paintSearchDrop(element, plan, at, view) {
  if (!element) return;
  element.hidden = !plan;
  if (!plan) return;
  // A refusal is a note at the pointer in screen pixels, readable at any zoom; a placement is the landing box at the zoom.
  const refused = plan.action === 'refuse', spot = refused ? { x: at.x, y: at.y } : dropSpot(plan, at);
  Object.assign(element.style, { left: `${view.x + spot.x * view.z - (refused ? 120 : 0)}px`, top: `${view.y + spot.y * view.z}px`,
    width: refused ? '240px' : `${plan.size.w * view.z}px`, height: refused ? '' : `${plan.size.h * view.z}px` });
  element.dataset.searchDrop = plan.action;
  element.firstChild.textContent = refused ? plan.reason : plan.label;
}
