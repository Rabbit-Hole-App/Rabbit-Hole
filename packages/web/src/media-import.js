// A dropped or picked image, GIF, SVG, audio or video file -> the card it becomes, decided from its bytes (Lane 3).
// Loaded on the first media drop, never with the canvas. One file in, one decision out: { kind, meta } or { error } -
// the error is the visible one-line reason, carrying the file's name. null: not a Lane 3 file (PDF, code...).
import { DROP_LIMITS } from './learn-drop.js';
import { IMAGE_MAX_PIXELS, IMAGE_MAX_SIDE, MEDIA_ROWS, imageInfo, mediaInfo } from './media-formats.js';
import { mediaFamilyOf } from './media-family.js';
import { SvgRefused, looksLikeSvg, sanitizeSvg } from './svg-sanitize.js';

const MiB = 1024 * 1024;
const mib = n => `${Number.isInteger(n / MiB) ? n / MiB : (n / MiB).toFixed(1)} MiB`;
const HEAD = 2 * MiB;
const bytesOf = async (file, from = 0, to = file.size) => new Uint8Array(await file.slice(from, to).arrayBuffer());

export const MEDIA_LIMITS = { image: DROP_LIMITS.image, gif: DROP_LIMITS.gif, svg: MEDIA_ROWS.svg.limits.bytes, audio: MEDIA_ROWS.audio.limits.bytes, video: DROP_LIMITS.clip };
const LABEL = { image: 'images', gif: 'GIFs', svg: 'SVGs', audio: 'audio files', video: 'videos' };

// The head, and for an MP4 whose sample descriptions were not in it (moov at the end), the tail too.
async function mediaHead(file) {
  const head = await bytesOf(file, 0, Math.min(file.size, HEAD));
  let info = mediaInfo(head);
  if (info?.container === 'mp4' && !info.codec && file.size > HEAD) {
    const tail = await bytesOf(file, Math.max(HEAD, file.size - HEAD));
    const both = new Uint8Array(head.length + tail.length); both.set(head); both.set(tail, head.length);
    info = mediaInfo(both);
  }
  return info;
}

export async function importMedia(file) {
  const family = mediaFamilyOf(file.name);
  if (!family) return null;
  const name = file.name || 'That file';
  if (!file.size) return { error: `${name}: the file is empty` };
  const cap = MEDIA_LIMITS[family];
  if (file.size > cap) return { error: `${name}: ${LABEL[family]} up to ${mib(cap)} (this one is ${mib(file.size)})` };
  const base = { name: file.name, size: file.size };

  if (family === 'image' || family === 'gif') {
    const info = imageInfo(await bytesOf(file));
    if (!info || (family === 'gif') !== (info.format === 'gif')) return { error: `${name}: this is not a PNG, JPEG, WebP or GIF image (its bytes do not match its name)` };
    const pixels = info.width * info.height;
    if (pixels > IMAGE_MAX_PIXELS || info.width > IMAGE_MAX_SIDE || info.height > IMAGE_MAX_SIDE) {
      return { error: `${name}: ${info.width} x ${info.height} px is too large to show; the canvas takes images up to ${IMAGE_MAX_PIXELS / 1e6} megapixels and ${IMAGE_MAX_SIDE} px a side` };
    }
    const type = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[info.format];
    return { kind: family === 'gif' ? 'gif' : 'image', meta: { ...base, type, width: info.displayWidth, height: info.displayHeight, ...(info.frames > 1 ? { frames: info.frames } : {}), ...(info.orientation > 1 ? { orientation: info.orientation } : {}) } };
  }

  if (family === 'svg') {
    const head = await bytesOf(file, 0, Math.min(file.size, 4096));
    if (head[0] === 0x1f && head[1] === 0x8b) return { error: `${name}: compressed SVG (.svgz) is not supported; save it as plain .svg` };
    const text = await file.text();
    if (!looksLikeSvg(text.slice(0, 64 * 1024))) return { error: `${name}: this is not an SVG drawing (no <svg> root)` };
    try {
      const { width, height, removed } = sanitizeSvg(text);
      return { kind: 'svg', meta: { ...base, type: 'image/svg+xml', width, height, ...(removed.length ? { removed } : {}) } };
    } catch (problem) {
      if (problem instanceof SvgRefused) return { error: `${name}: ${problem.message}` };
      throw problem;
    }
  }

  const info = await mediaHead(file);
  if (family === 'video') {
    if (!info || !['mp4', 'webm', 'matroska'].includes(info.container)) return { error: `${name}: this is not an MP4 or WebM video (its bytes do not match its name)` };
    if (!info.video) return { error: `${name}: this file has no video track; save it as .m4a, .mp3 or another audio format to add it as audio` };
    return { kind: 'clip', meta: { ...base, type: info.container === 'mp4' ? 'video/mp4' : 'video/webm', ...(info.codec ? { codec: info.codec } : {}) } };
  }
  // audio: the container its extension names, or a sibling the same card plays (an .ogg holding Opus, an .m4a's MP4).
  const expected = { mp3: ['mp3'], wav: ['wav'], ogg: ['ogg'], m4a: ['mp4'], flac: ['flac'] }[file.name.split('.').pop().toLowerCase()];
  if (!info || !expected.includes(info.container)) return { error: `${name}: its bytes are not ${file.name.split('.').pop().toUpperCase()} audio` };
  if (info.video) return { error: `${name}: this file holds video; add it as .mp4 to get a video card` };
  if (info.duration > MEDIA_ROWS.audio.limits.durationSec) return { error: `${name}: audio up to ${MEDIA_ROWS.audio.limits.durationSec / 3600} hours` };
  return { kind: 'audio', meta: { ...base, type: info.mime, container: info.container, ...(info.codec ? { codec: info.codec } : {}), ...(info.duration ? { duration: Math.round(info.duration * 100) / 100 } : {}) } };
}
