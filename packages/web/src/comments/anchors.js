// Comment anchors (docs/features/canvas-comments.md section 8): a card-relative offset that follows its object
// without a write, or a canvas point, in world units. Pure, so the canvas and the panel share one answer.

// The world-space top-left of an object on the board: a measured card (blocks and chat exchanges), a text or
// sticky item, or a drawn shape's box. null when the object is gone - the thread is then detached.
export function objectOrigin(id, { bounds = {}, items = [], shapes = [] }) {
  if (bounds[id]) return { x: bounds[id].x, y: bounds[id].y };
  const item = items.find(entry => entry.id === id);
  if (item) return { x: item.x, y: item.y };
  const shape = shapes.find(entry => entry.id === id);
  if (shape) return { x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2) };
  return null;
}

// Where a pin sits, or null for a detached thread (no pin; still readable, repliable and resolvable).
export function pinPoint(anchor, board) {
  if (anchor?.kind === 'point') return { x: anchor.x, y: anchor.y };
  if (anchor?.kind !== 'object') return null;
  const origin = objectOrigin(anchor.object_id, board);
  return origin ? { x: origin.x + anchor.dx, y: origin.y + anchor.dy } : null;
}

// The anchor a right-click makes: on the object under it, relative to the object's origin, else on the canvas.
export function anchorAt(world, hit, board) {
  const origin = hit ? objectOrigin(hit.id, board) : null;
  if (!origin) return { kind: 'point', x: Math.round(world.x), y: Math.round(world.y) };
  return { kind: 'object', object_id: hit.id, object_kind: hit.kind, dx: Math.round(world.x - origin.x), dy: Math.round(world.y - origin.y), label: (hit.label || '').trim().slice(0, 120) };
}

// "on Card B: bulges", "on the canvas", "Card deleted · bulges".
export function anchorText(anchor, live) {
  if (anchor?.kind !== 'object') return 'on the canvas';
  const label = anchor.label || 'a card';
  return live ? `on ${label}` : `Card deleted · ${label}`;
}

// A card's title for its anchor label: what the reader sees on it first.
export function objectLabel(entry) {
  if (!entry) return '';
  return String(entry.title || entry.question || entry.text || entry.label || entry.name || '').split('\n')[0];
}
