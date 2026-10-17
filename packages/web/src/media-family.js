// Which Lane 3 family a file name names, by the registry's extensions (case-insensitive). The only media code the canvas
// loads up front: the parsers in media-formats.js and media-import.js load with the first media drop. MIME is a hint only
// (Windows drops often carry none), and the bytes decide after this.
import { familyOf } from './file-capabilities.js';

const MEDIA = new Set(['image', 'gif', 'svg', 'video', 'audio']);
export function mediaFamilyOf(name) {
  const found = familyOf({ name });
  if (found && MEDIA.has(found.id)) return found.id;
  return /\.svgz$/i.test(String(name || '')) ? 'svg' : null; // claimed so the drop says why it is refused
}
