// MP3 duration in the Worker (roadmap v1 W1.3; no ffprobe here): the MPEG audio frame headers are walked from the first frame to the last, and
// the duration is the frame count x samples per frame / sample rate, by MPEG version and layer. An ID3v2 tag at the start and an ID3v1 tag at
// the end are skipped; a Xing/Info header frame (an encoder's table, no audio) is not counted, as ffprobe does not count it. The renderer
// measures again with ffprobe and fails the render if a beat differs by more than 50 ms, so an error here is caught, never shipped.
const KBPS = {
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] };
const VERSION = { 0: 2.5, 2: 2, 3: 1 }, LAYER = { 1: 3, 2: 2, 3: 1 };

// One frame header at i. -> { length, samples, rate, sideInfo, mono } | null
export function frameAt(b, i) {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const version = VERSION[(b[i + 1] >> 3) & 3], layer = LAYER[(b[i + 1] >> 1) & 3];
  const bitrateIndex = b[i + 2] >> 4, rateIndex = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1, mono = (b[i + 3] >> 6) === 3;
  if (!version || !layer || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null; // reserved, free-format or bad
  const kbps = KBPS[`${version === 1 ? 1 : 2}-${version === 1 ? layer : layer === 1 ? 1 : 2}`][bitrateIndex], rate = RATES[version][rateIndex];
  const samples = layer === 1 ? 384 : layer === 2 || version === 1 ? 1152 : 576;
  const length = layer === 1 ? (Math.floor((12 * kbps * 1000) / rate) + pad) * 4 : Math.floor(((samples / 8) * kbps * 1000) / rate) + pad;
  const sideInfo = layer !== 3 ? 0 : version === 1 ? (mono ? 17 : 32) : mono ? 9 : 17;
  return { length, samples, rate, sideInfo, mono };
}

const id3v2 = b => (b.length >= 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33 ? 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]) + (b[5] & 0x10 ? 10 : 0) : 0);
const tagAt = (b, i, tag) => [...tag].every((c, k) => b[i + k] === c.charCodeAt(0));

// -> { frames, sampleRate, samplesPerFrame, seconds }; throws when the bytes are not one continuous MPEG audio stream.
export function mp3Duration(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let i = id3v2(b), frames = 0, samples = 0, rate = null, first = true;
  while (i < b.length) {
    if (b.length - i === 128 && tagAt(b, i, 'TAG')) break; // ID3v1
    const f = frameAt(b, i);
    if (!f) throw Object.assign(new Error(`not an MPEG audio frame at byte ${i}`), { code: 'mp3_invalid' });
    if (rate != null && f.rate !== rate) throw Object.assign(new Error('the sample rate changes inside the stream'), { code: 'mp3_invalid' });
    if (i + f.length > b.length) break; // a truncated last frame is not counted
    rate = f.rate;
    const info = 4 + f.sideInfo;
    if (!(first && (tagAt(b, i + info, 'Xing') || tagAt(b, i + info, 'Info')))) { frames++; samples += f.samples; }
    first = false;
    i += f.length;
  }
  if (!frames) throw Object.assign(new Error('no MPEG audio frames'), { code: 'mp3_invalid' });
  return { frames, sampleRate: rate, samplesPerFrame: samples / frames, seconds: samples / rate };
}
