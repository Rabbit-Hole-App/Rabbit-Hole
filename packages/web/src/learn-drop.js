// What a file dropped on the canvas becomes. Pure so the routing is testable:
// the caller owns caching, uploading, and the card.
//
// Limits, and why: images ride to the tutor base64'd into a turn, so they share
// the 5 MB paper ceiling. GIFs and clips never leave this browser (IndexedDB
// only), so their ceilings are about not wedging the asset store.
const MB = 1024 * 1024;
export const DROP_LIMITS = { image: 5 * MB, gif: 10 * MB, clip: 50 * MB, pdf: 5 * MB };

const KIND_BY_TYPE = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image',
  'image/gif': 'gif',
  'video/mp4': 'clip', 'video/webm': 'clip',
  'application/pdf': 'pdf',
};
const LIMIT_TEXT = {
  image: 'images up to 5 MB (png, jpg, webp)',
  gif: 'GIFs up to 10 MB',
  clip: 'videos up to 50 MB (mp4, webm)',
  pdf: 'PDFs up to 5 MB',
};

// One file in, one decision out: { kind } or { error } - the error is the
// visible one-line reason, already carrying the file's name.
export function classifyDrop(file) {
  const kind = KIND_BY_TYPE[file.type] || (/\.pdf$/i.test(file.name || '') ? 'pdf' : null);
  if (!kind) return { error: `${file.name || 'That file'}: drop an image, GIF, video, PDF, notebook (.ipynb) or Python file (.py)` };
  if (!file.size) return { error: `${file.name || 'That file'}: the file is empty` };
  if (file.size > DROP_LIMITS[kind]) return { error: `${file.name || 'That file'}: ${LIMIT_TEXT[kind]}` };
  return { kind };
}
