// Images a learner drops onto a Learn canvas. The card renders from the
// browser's own IndexedDB copy; this R2 copy exists for one reason - so a later
// question can put the image in front of the tutor as an image block, the way
// an uploaded PDF rides learn-paper.js. GIFs and video clips never come here:
// they stay browser-only by design, the tutor does not see them.
//
// ponytail: no lifecycle sweep, same as learn-papers. Add one when storage is
// measured.
import { sha256, randomHex, base64 } from './token.js';
import { learnMedia } from './learn-storage.js';

// Same ceiling as PDFs, for the same reason: the bytes are base64'd into every
// turn that asks about them.
export const MEDIA_UPLOAD_LIMIT = 5 * 1024 * 1024;

const MEDIA = /^media:[0-9a-f]{12}$/;

export const isUploadedMediaId = value => typeof value === 'string' && MEDIA.test(value);

const newUploadedMediaId = () => `media:${randomHex(6)}`;

// Trust the bytes, not the extension or the declared type. Only the three
// static formats the ask path will forward; a GIF here is a caller bug.
export function sniffImageType(bytes) {
  const at = (offset, text) => new TextDecoder().decode(bytes.slice(offset, offset + text.length)) === text;
  if (bytes.length > 8 && bytes[0] === 0x89 && at(1, 'PNG')) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 12 && at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  return null;
}

// Derived from the session, never from the request - the same rule as
// paperObjectKey, so one learner cannot name their way into another's image.
async function mediaObjectKey(identity, id) {
  if (!isUploadedMediaId(id)) throw new Error('Not an uploaded image id');
  const digest = await sha256(JSON.stringify([identity.org, identity.name, identity.email]));
  return `learn-media/${digest}/${id}`;
}

export function uploadedMediaTitle(name) {
  const clean = String(name ?? '').replace(/\p{Cc}/gu, ' ').trim();
  return clean ? clean.slice(0, 200) : 'Dropped image';
}

export async function putUploadedMedia(env, identity, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error('That file is empty');
  if (bytes.length > MEDIA_UPLOAD_LIMIT) throw new Error(`That image is larger than ${MEDIA_UPLOAD_LIMIT / (1024 * 1024)} MB`);
  const contentType = sniffImageType(bytes);
  if (!contentType) throw new Error('That file is not a PNG, JPEG, or WebP image');
  const id = newUploadedMediaId();
  const title = uploadedMediaTitle(file.name);
  await learnMedia(env).put(await mediaObjectKey(identity, id), bytes, {
    httpMetadata: { contentType },
    customMetadata: { title },
  });
  return { id, title };
}

export async function readUploadedMedia(env, identity, id) {
  const object = await learnMedia(env).get(await mediaObjectKey(identity, id));
  if (!object) throw new Error('That image is no longer stored');
  return {
    bytes: new Uint8Array(await object.arrayBuffer()),
    contentType: object.httpMetadata?.contentType || 'image/png',
    title: uploadedMediaTitle(object.customMetadata?.title),
  };
}

// The Anthropic image block for the ask path, plus the title the context JSON
// names it by.
export async function uploadedMediaAsImage(env, identity, id) {
  const { bytes, contentType, title } = await readUploadedMedia(env, identity, id);
  return { id, title, image: { type: 'image', source: { type: 'base64', media_type: contentType, data: base64(bytes) } } };
}
