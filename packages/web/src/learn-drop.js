// What a file dropped on the canvas becomes. Pure so the routing is testable:
// the caller owns caching, uploading, and the card.
//
// Kinds, types and limits come from the capability registry (file-capabilities.js), which the picker and the server's
// board file cap read too. Images ride to the tutor base64'd into a turn, so they share the 5 MiB paper ceiling; a video
// is a board file up to 50 MiB, the server's own cap for it.
import { FAMILIES, family, formatBytes } from './file-capabilities.js';

// Registry family -> the card kind this module has always returned.
const KIND_OF_FAMILY = { image: 'image', gif: 'gif', video: 'clip', pdf: 'pdf' };
export const DROP_LIMITS = Object.fromEntries(Object.entries(KIND_OF_FAMILY).map(([id, kind]) => [kind, family(id).limits.bytes]));

const KIND_BY_TYPE = Object.fromEntries(FAMILIES.filter(f => KIND_OF_FAMILY[f.id] && f.status === 'shipped').flatMap(f => f.mime.map(type => [type, KIND_OF_FAMILY[f.id]])));
const LIMIT_TEXT = {
  image: `images up to ${formatBytes(DROP_LIMITS.image)} (png, jpg, webp)`,
  gif: `GIFs up to ${formatBytes(DROP_LIMITS.gif)}`,
  clip: `videos up to ${formatBytes(DROP_LIMITS.clip)} (mp4, webm)`,
  pdf: `PDFs up to ${formatBytes(DROP_LIMITS.pdf)}`,
};

// One file in, one decision out: { kind } or { error } - the error is the
// visible one-line reason, already carrying the file's name.
export function classifyDrop(file) {
  const kind = KIND_BY_TYPE[file.type] || (/\.pdf$/i.test(file.name || '') ? 'pdf' : null);
  if (!kind) return { error: `${file.name || 'That file'}: drop an image, GIF, video, PDF, notebook (.ipynb), Python file (.py) or code file` };
  if (!file.size) return { error: `${file.name || 'That file'}: the file is empty` };
  if (file.size > DROP_LIMITS[kind]) return { error: `${file.name || 'That file'}: ${LIMIT_TEXT[kind]}` };
  return { kind };
}
