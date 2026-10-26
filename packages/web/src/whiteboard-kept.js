// The "kept from the original board" layer (migration rule 4, docs/features/tldraw-removal.md): the records of a tldraw
// snapshot the native sketch has no counterpart for (images, video, embeds, bookmarks, the three app shapes, anything unknown).
// They stay in `snapshot`, are listed with their positions, and are drawn read-only from the S1 reader's SVG: a picture, not a
// proof of fidelity. Pure; the snapshot is only read.
import { legacySnapshotToSvg, readLegacySnapshot, shapeBounds } from './legacy-whiteboard.js';
import { legacyTarget } from './whiteboard-sketch.js';

const NAMES = { image: 'Image', video: 'Video', embed: 'Embedded page', bookmark: 'Bookmark', card: 'Card' };
const nameOf = shape => (shape.kind === 'card' ? shape.label : shape.alt || NAMES[shape.kind] || `Unsupported ${shape.type}`);

const cache = new WeakMap();
// { items: [{ id, name, bounds }], picture: { src, x, y, width, height } | null }; empty when nothing was kept.
export function keptOf(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return { items: [], picture: null };
  if (cache.has(snapshot)) return cache.get(snapshot);
  const read = readLegacySnapshot(snapshot);
  const kept = read.ok ? read.shapes.filter(shape => shape.kind !== 'group' && legacyTarget(shape) === null) : [];
  const ids = new Set(kept.map(shape => shape.id));
  const svg = kept.length ? legacySnapshotToSvg(snapshot, { only: shape => ids.has(shape.id) }) : null;
  const result = {
    items: kept.map(shape => ({ id: shape.id, name: nameOf(shape), bounds: shapeBounds(shape) })),
    // An <img> keeps the picture inert: no script, no link, no request beyond the https images the reader allows.
    picture: svg?.ok && svg.shapes ? { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.svg)}`, x: svg.x, y: svg.y, width: svg.width, height: svg.height } : null,
  };
  cache.set(snapshot, result);
  return result;
}
