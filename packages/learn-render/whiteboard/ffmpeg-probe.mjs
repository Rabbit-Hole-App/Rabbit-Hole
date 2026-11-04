// Roadmap W0.2: can Remotion's bundled ffmpeg (the only one in the renderer image) concatenate H.264 segments with -c copy?
// Reads the build's capabilities, then does the real thing on a file you give it. Mutates nothing outside a temp directory.
//   node packages/learn-render/whiteboard/ffmpeg-probe.mjs [some-h264.mp4]   (prints one JSON object; with a file it concatenates it with itself, -c copy, and
//   exits 1 unless the frame counts double; without one only the capabilities are read and stitchOk is null)
import { RenderInternals } from '@remotion/renderer';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const ff = (bin, args) => RenderInternals.callFf({ bin, args, indent: false, logLevel: 'error', binariesDirectory: null });
const text = async (bin, args) => (await ff(bin, args)).stdout;
const result = { version: (await text('ffmpeg', ['-version'])).split('\n')[0].trim() };
const has = (listing, name) => new RegExp(`(^|\\s)${name}(\\s|$)`, 'm').test(listing);

const formats = await text('ffmpeg', ['-hide_banner', '-formats']), bsfs = await text('ffmpeg', ['-hide_banner', '-bsfs']), encoders = await text('ffmpeg', ['-hide_banner', '-encoders']);
result.concatDemuxer = has(formats, 'concat');
result.h264Mp4toannexb = has(bsfs, 'h264_mp4toannexb');
result.aacEncoder = has(encoders, 'aac');
result.libx264 = has(encoders, 'libx264');
result.lavfiSource = has(formats, 'lavfi');

// The functional test needs a real H.264 MP4 (this build has no video test source and no decoder for lavfi video): pass one as the argument.
const input = process.argv[2];
if (result.concatDemuxer && input) {
  const dir = mkdtempSync(join(tmpdir(), 'wb-ffmpeg-probe-'));
  const count = async file => JSON.parse(await text('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,nb_read_frames', '-of', 'json', file])).streams
    .map(s => ({ type: s.codec_type, codec: s.codec_name, frames: Number(s.nb_read_frames) }));
  try {
    const entry = `file '${resolve(input).split(sep).join('/')}'\n`;
    writeFileSync(join(dir, 'list.txt'), entry + entry);
    await ff('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-c', 'copy', join(dir, 'out.mp4')]);
    result.source = await count(resolve(input)); result.stitched = await count(join(dir, 'out.mp4'));
    result.stitchOk = result.source.length > 0 && result.source.every((s, i) => result.stitched[i]?.codec === s.codec && result.stitched[i]?.frames === s.frames * 2);
  } catch (error) { result.stitchError = String(error.stderr || error.message).slice(-400); result.stitchOk = false; }
  finally { rmSync(dir, { recursive: true, force: true }); }
} else result.stitchOk = null;
console.log(JSON.stringify(result, null, 1));
process.exit(result.stitchOk === false ? 1 : 0);
