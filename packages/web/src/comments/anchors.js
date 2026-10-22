// Comment anchors (docs/features/canvas-comments.md section 8): a card-relative offset that follows its object
// without a write, or a canvas point, in world units. Pure, so the canvas and the panel share one answer.

// The world-space top-left of an object on the board: a measured card (blocks and chat exchanges), a text or
// sticky item, a drawn shape's box, or a group's members together (groups: group id -> member ids), so a group's pin
// follows the group. null when the object is gone - the thread is then detached.
export function objectOrigin(id, board) {
  const { bounds = {}, items = [], shapes = [], groups = {} } = board;
  if (bounds[id]) return { x: bounds[id].x, y: bounds[id].y };
  const item = items.find(entry => entry.id === id);
  if (item) return { x: item.x, y: item.y };
  const shape = shapes.find(entry => entry.id === id);
  if (shape) return { x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2) };
  const origins = (groups[id] || []).map(member => objectOrigin(member, { ...board, groups: {} })).filter(Boolean);
  return origins.length ? { x: Math.min(...origins.map(o => o.x)), y: Math.min(...origins.map(o => o.y)) } : null;
}

// Where a pin sits, or null for a detached thread (no pin; still readable, repliable and resolvable).
export function pinPoint(anchor, board) {
  if (anchor?.kind === 'point') return { x: anchor.x, y: anchor.y };
  if (anchor?.kind !== 'object') return null;
  const origin = objectOrigin(anchor.object_id, board);
  return origin ? { x: origin.x + anchor.dx, y: origin.y + anchor.dy } : null;
}

// Where an object's pin sits on screen (owner, 2026-10-13: "every comment icon should have a minimal contact to the
// shape/cafrd etc it is attached to"). box: the object's on-screen box { left, top, right, bottom }; row: the screen width
// kept clear at its top right for its selection actions; index: this pin among the object's pins; size, gap: the pins';
// lead: the screen width kept clear at its top left (a group's name chip).
// On the object's top edge, just left of that row (and right of the lead), its tail INTO px into the object: past the gap
// between two cards of a column at 100%, so it never reads as hanging from the card above, and short of a text box's first
// line. The pins that do not fit there (a narrow object, a low zoom) hang on its left edge from just below its top down,
// under the row's level, so never beneath a bar or a chip above it. Then clamped, so every pin overlaps its object by at least
// CONTACT on both axes at any size and zoom. tail: the bubble's pointed corner, the one on the object.
export const CONTACT = 4, INTO = 10;
export function pinSpot(box, row, index, size, gap, lead = 0) {
  const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
  const from = lead ? box.left + lead + gap : box.left + CONTACT - size; // where the top edge's room for pins starts
  const fit = Math.max(0, Math.floor((box.right - row - from) / (size + gap)));
  const onTop = index < fit;
  const left = onTop ? box.right - row - (index + 1) * (size + gap) : box.left + CONTACT - size;
  // ponytail: a stack taller than a short object piles up at its bottom edge; fine for the few threads one object gets.
  const top = onTop ? box.top + INTO - size : box.top + 2 * CONTACT + (index - fit) * (size + gap);
  return { left: clamp(left, box.left + CONTACT - size, box.right - CONTACT), top: clamp(top, box.top + CONTACT - size, box.bottom - CONTACT), tail: onTop ? 'bl' : 'br' };
}

// An object's pins sit at the top centre of its screen box (owner, 2026-10-21: "the comments [icon] should be top middle of
// the card irrespective of whether we zoom or not"): the first pin's centre is the box's top-centre, at the pins' constant
// screen size, so zoom, pan, drag and resize never move it off that point. Pins after the first line up to its right.
// ponytail: a second or third thread on one card shifts right of centre; fine for the few threads one object gets.
export function pinTopCentre(box, index, size, gap) {
  return { left: (box.left + box.right) / 2 - size / 2 + index * (size + gap), top: box.top - size / 2, tail: 'bl' };
}

// The anchor a right-click makes: on the object under it, relative to the object's origin, else on the canvas.
export function anchorAt(world, hit, board) {
  const origin = hit ? objectOrigin(hit.id, board) : null;
  if (!origin) return { kind: 'point', x: Math.round(world.x), y: Math.round(world.y) };
  return { kind: 'object', object_id: hit.id, object_kind: hit.kind, dx: Math.round(world.x - origin.x), dy: Math.round(world.y - origin.y), label: (hit.label || '').trim().slice(0, 120) };
}

// "on Card B: bulges", "on the canvas", "Card deleted · bulges", "on a shape", "Group removed · Setup".
const NOUNS = { shape: ['a shape', 'Shape deleted'], group: ['a group', 'Group removed'] };
export function anchorText(anchor, live) {
  if (anchor?.kind !== 'object') return 'on the canvas';
  const [noun, gone] = NOUNS[anchor.object_kind] || ['a card', 'Card deleted'];
  if (!live) return anchor.label ? `${gone} · ${anchor.label}` : gone;
  return `on ${anchor.label || noun}`;
}

// What a pin says (owner, 2026-10-08): its thread's live message count, capped so it fits the pin without resizing it.
export const pinCount = count => (count > 99 ? '99+' : String(count));

// A card's title for its anchor label: what the reader sees on it first.
export function objectLabel(entry) {
  if (!entry) return '';
  return String(entry.title || entry.question || entry.text || entry.label || entry.name || '').split('\n')[0];
}
