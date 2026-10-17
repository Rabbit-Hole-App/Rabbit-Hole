// Lane 3 media formats (docs/features/canvas-file-imports.md, Media section): what a dropped image, SVG, audio or video
// file actually is, read from its bytes. Pure, no DOM: the drop path, the card and the tests share it. The extension picks
// the family; these readers confirm the structure and pull out what the card needs before it renders (size, orientation,
// codec), so the card reserves its shape and a wrong label is refused instead of shown as a broken player.
import { AUDIO_EXTENSIONS } from './media-family.js';

const ascii = (b, at, text) => b.length >= at + text.length && [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
const u16be = (b, at) => (b[at] << 8) | b[at + 1];
const u32be = (b, at) => ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
const u16le = (b, at) => b[at] | (b[at + 1] << 8);
const u24le = (b, at) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const u32le = (b, at) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + ((b[at + 3] << 24) >>> 0);
const indexOf = (b, text, from = 0, to = b.length) => {
  const first = text.charCodeAt(0);
  for (let i = from; i <= Math.min(to, b.length) - text.length; i++) if (b[i] === first && ascii(b, i, text)) return i;
  return -1;
};

// Decoded-complexity limits, measured 2026-10-16 on this machine (Windows 11, Chrome 155, Playwright Chromium 1234,
// Firefox 1538): a 20000 x 20000 PNG decodes in every engine but drawing it took 2.3-4.2 s in Chrome/Chromium; 11585 x
// 11585 (134 MP) drew in 0.85-1.1 s. 100 MP (about 400 MB decoded RGBA) keeps a card under a second and still takes a
// 48-50 MP phone photo. Byte caps stay the registry's (image 5 MiB, GIF 10 MiB, video 50 MiB).
export const IMAGE_MAX_PIXELS = 100_000_000;
export const IMAGE_MAX_SIDE = 16384;

// ---- images -----------------------------------------------------------------------------------------------------------

function jpegInfo(b) {
  let at = 2, orientation = 1, width = 0, height = 0;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1];
    if (marker === 0xff) { at++; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { at += 2; continue; }
    const length = u16be(b, at + 2);
    if (length < 2) return null;
    if (marker === 0xe1 && ascii(b, at + 4, 'Exif\0\0')) orientation = exifOrientation(b, at + 10, at + 2 + length) || orientation;
    // SOF0-15, not DHT (C4), JPG (C8) or DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      height = u16be(b, at + 5); width = u16be(b, at + 7);
      break;
    }
    if (marker === 0xda) break; // start of scan without a frame header: not a JPEG we can size
    at += 2 + length;
  }
  return width && height ? { width, height, orientation } : null;
}

function exifOrientation(b, tiff, end) {
  const le = ascii(b, tiff, 'II');
  if (!le && !ascii(b, tiff, 'MM')) return 0;
  const r16 = at => (le ? u16le(b, at) : u16be(b, at));
  const r32 = at => (le ? u32le(b, at) : u32be(b, at));
  const ifd = tiff + r32(tiff + 4);
  if (ifd + 2 > end) return 0;
  const count = r16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return 0;
    if (r16(entry) === 0x0112) { const value = r16(entry + 8); return value >= 1 && value <= 8 ? value : 0; }
  }
  return 0;
}

function gifInfo(b) {
  const width = u16le(b, 6), height = u16le(b, 8);
  let at = 13, frames = 0;
  if (b[10] & 0x80) at += 3 * (1 << ((b[10] & 7) + 1));
  const skipBlocks = from => { let p = from; while (p < b.length && b[p] !== 0) p += b[p] + 1; return p + 1; };
  while (at < b.length) {
    const kind = b[at];
    if (kind === 0x3b) break;
    if (kind === 0x21) { at = skipBlocks(at + 2); continue; }
    if (kind !== 0x2c) break; // damaged: report what was counted
    frames++;
    let p = at + 10;
    if (b[at + 9] & 0x80) p += 3 * (1 << ((b[at + 9] & 7) + 1));
    at = skipBlocks(p + 1);
  }
  return { width, height, frames: Math.max(frames, 1) };
}

function pngInfo(b) {
  if (!ascii(b, 12, 'IHDR')) return null;
  const width = u32be(b, 16), height = u32be(b, 20);
  // APNG: an acTL chunk before the first IDAT.
  let at = 8, frames = 1;
  while (at + 8 <= b.length) {
    const length = u32be(b, at);
    if (ascii(b, at + 4, 'acTL')) { frames = u32be(b, at + 8) || 1; break; }
    if (ascii(b, at + 4, 'IDAT')) break;
    at += 12 + length;
  }
  return { width, height, frames };
}

function webpInfo(b) {
  if (ascii(b, 12, 'VP8 ')) return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, frames: 1 };
  if (ascii(b, 12, 'VP8L')) {
    const bits = u32le(b, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, frames: 1 };
  }
  if (ascii(b, 12, 'VP8X')) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, frames: b[20] & 0x02 ? 2 : 1 };
  return null;
}

// { format, width, height, displayWidth, displayHeight, orientation, frames } for PNG/JPEG/WebP/GIF, else null.
// displayWidth/Height are what the browsers show: JPEG EXIF orientation 5-8 swaps the sides (applied by Chrome, Chromium,
// Firefox and WebKit, measured); WebP EXIF orientation is ignored by all of them, so it is not applied here either.
export function imageInfo(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let format = null, info = null;
  if (b[0] === 0x89 && ascii(b, 1, 'PNG\r\n\x1a\n')) { format = 'png'; info = pngInfo(b); }
  else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) { format = 'jpeg'; info = jpegInfo(b); }
  else if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) { format = 'webp'; info = webpInfo(b); }
  else if (ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a')) { format = 'gif'; info = gifInfo(b); }
  if (!info || !info.width || !info.height) return null;
  const orientation = format === 'jpeg' ? info.orientation || 1 : 1;
  const swap = orientation >= 5;
  return { format, width: info.width, height: info.height, displayWidth: swap ? info.height : info.width, displayHeight: swap ? info.width : info.height, orientation, frames: info.frames || 1 };
}

// ---- audio and video --------------------------------------------------------------------------------------------------

const MP4_CODECS = { mp4a: 'mp4a.40.2', alac: 'alac', 'ac-3': 'ac-3', 'ec-3': 'ec-3', Opus: 'opus', fLaC: 'flac', '.mp3': 'mp3',
  avc1: 'avc1.42E01E', avc3: 'avc1.42E01E', hvc1: 'hvc1.1.6.L93.B0', hev1: 'hvc1.1.6.L93.B0', av01: 'av01.0.04M.08', vp09: 'vp09.00.10.08', mp4v: 'mp4v.20.9' };
const AUDIO_4CC = new Set(['mp4a', 'alac', 'ac-3', 'ec-3', 'Opus', 'fLaC', '.mp3']);

function mp4Codecs(b) {
  const codecs = [];
  let hasVideo = false;
  for (let p = indexOf(b, 'stsd'); p !== -1; p = indexOf(b, 'stsd', p + 4)) {
    const type = String.fromCharCode(b[p + 16], b[p + 17], b[p + 18], b[p + 19]);
    if (MP4_CODECS[type]) { codecs.push(type); if (!AUDIO_4CC.has(type)) hasVideo = true; }
  }
  return { codecs, hasVideo };
}

function mp3Frame(b, at) {
  if (b[at] !== 0xff || (b[at + 1] & 0xe0) !== 0xe0) return false;
  const version = (b[at + 1] >> 3) & 3, layer = (b[at + 1] >> 1) & 3, bitrate = b[at + 2] >> 4, rate = (b[at + 2] >> 2) & 3;
  return version !== 1 && layer !== 0 && bitrate !== 0xf && rate !== 3;
}

const WAV_CODECS = { 1: 'pcm', 3: 'float', 6: 'alaw', 7: 'mulaw', 2: 'ms-adpcm', 0x11: 'ima-adpcm', 0x55: 'mp3' };

// The container and codec of an audio or video file, from its first bytes (a few MiB is enough for every fixture; the
// MP4 sample description can sit at the end of a non-faststart file, so callers pass the whole file when it is small).
// { container, mime, codec, video, duration? } or null when the bytes are none of the supported containers.
export function mediaInfo(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (ascii(b, 4, 'ftyp')) {
    const brand = String.fromCharCode(...b.subarray(8, 12));
    const { codecs, hasVideo } = mp4Codecs(b);
    const video = hasVideo || (!codecs.length && !/^M4[ABP] $/.test(brand));
    const codec = codecs.map(c => MP4_CODECS[c]).join(', ') || null;
    return { container: 'mp4', mime: video ? 'video/mp4' : 'audio/mp4', codec, video, brand };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    const head = b.subarray(0, Math.min(b.length, 1 << 20));
    const ids = { V_VP8: 'vp8', V_VP9: 'vp9', V_AV1: 'av1', 'V_MPEG4/ISO/AVC': 'avc1.42E01E', V_MPEGH: 'hvc1.1.6.L93.B0', A_OPUS: 'opus', A_VORBIS: 'vorbis', A_AAC: 'mp4a.40.2', A_FLAC: 'flac' };
    const found = Object.keys(ids).filter(id => indexOf(head, id) !== -1);
    const video = found.some(id => id.startsWith('V_'));
    return { container: indexOf(head, 'matroska') !== -1 ? 'matroska' : 'webm', mime: video ? 'video/webm' : 'audio/webm', codec: found.map(id => ids[id]).join(', ') || null, video };
  }
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE')) {
    let at = 12, codec = null, duration;
    let format = 0, rate = 0, byteRate = 0;
    while (at + 8 <= b.length) {
      const id = String.fromCharCode(...b.subarray(at, at + 4)), size = u32le(b, at + 4);
      if (id === 'fmt ') {
        format = u16le(b, at + 8); rate = u32le(b, at + 12); byteRate = u32le(b, at + 16);
        if (format === 0xfffe && size >= 40) format = u16le(b, at + 32); // WAVE_FORMAT_EXTENSIBLE: the sub-format GUID's first two bytes
        codec = WAV_CODECS[format] || `wav-${format}`;
      }
      if (id === 'data' && byteRate) duration = size / byteRate;
      at += 8 + size + (size & 1);
    }
    return { container: 'wav', mime: 'audio/wav', codec, video: false, rate, ...(duration ? { duration } : {}) };
  }
  if (ascii(b, 0, 'OggS')) {
    const payload = 27 + b[26];
    const codec = ascii(b, payload, '\x01vorbis') ? 'vorbis' : ascii(b, payload, 'OpusHead') ? 'opus' : ascii(b, payload, '\x7fFLAC') ? 'flac'
      : ascii(b, payload, 'Speex   ') ? 'speex' : ascii(b, payload, '\x80theora') ? 'theora' : null;
    return { container: 'ogg', mime: codec === 'theora' ? 'video/ogg' : 'audio/ogg', codec, video: codec === 'theora' };
  }
  if (ascii(b, 0, 'fLaC')) {
    // STREAMINFO is the first metadata block: sample rate (20 bits) and total samples (36 bits) give the duration.
    const s = 8;
    const rate = (b[s + 10] << 12) | (b[s + 11] << 4) | (b[s + 12] >> 4);
    const total = (b[s + 13] & 0x0f) * 2 ** 32 + u32be(b, s + 14);
    return { container: 'flac', mime: 'audio/flac', codec: 'flac', video: false, rate, ...(rate && total ? { duration: total / rate } : {}) };
  }
  let at = 0;
  if (ascii(b, 0, 'ID3')) at = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
  if (mp3Frame(b, at)) return { container: 'mp3', mime: 'audio/mpeg', codec: 'mp3', video: false };
  return null;
}

// The type string a media element's canPlayType gets: container MIME plus the codec when it is known.
export const playType = info => (info?.codec && !['mp3', 'pcm'].includes(info.codec) && info.container !== 'wav' ? `${info.mime}; codecs="${info.codec}"` : info?.mime || '');

// Whether a card plays the original or needs a playback copy. The probe (a media element reaching canplay, or failing) is
// the evidence; canPlayType is only a hint, because it is wrong both ways (measured: Chrome answers "" for float WAV it
// plays, Playwright WebKit on Windows answers "probably" for every type and plays none).
// probe: 'ok' | 'error' | 'timeout'. Returns 'native' | 'derivative'.
export function playbackPlan({ canPlay = '', probe }) {
  if (probe === 'ok') return 'native';
  if (probe === 'error') return 'derivative';
  return canPlay ? 'native' : 'derivative';
}

// ---- families ---------------------------------------------------------------------------------------------------------

// Lane 3's rows for file-capabilities.js (contract section 2): the measured limits and what is true now. Lane 1 owns the
// registry file; these are the values its svg and audio rows take, kept here until that file is on this branch.
// ponytail: move into file-capabilities.js FAMILIES when Lane 1 commits it; nothing else should hold these numbers then.
export const MEDIA_ROWS = {
  svg: { extensions: ['svg'], mime: ['image/svg+xml'], card: 'file:svg', limits: { bytes: 2 * 1024 * 1024, elements: 20000, depth: 128 },
    can: { store: true, preview: true, edit: false, download: true, context: false },
    notes: 'sanitized copy rendered as <img> (no scripts, handlers, foreignObject or external fetches); original downloads as a file; .svgz refused' },
  audio: { extensions: AUDIO_EXTENSIONS, mime: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/flac', 'audio/x-flac'],
    card: 'file:audio', limits: { bytes: 25 * 1024 * 1024, durationSec: 4 * 3600 },
    can: { store: true, preview: true, edit: false, download: true, context: false },
    notes: 'browser playback when a probe decodes it (MP3, PCM/float WAV, Ogg Vorbis/Opus/FLAC, FLAC, AAC M4A in Chrome and Firefox); ADPCM WAV, ALAC and AC-3 M4A need the audio-playback converter' },
};
