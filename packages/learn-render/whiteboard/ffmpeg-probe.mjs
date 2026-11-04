// Roadmap W0.2: can Remotion's bundled ffmpeg (the only one in the renderer image) concatenate H.264 + AAC segments with -c copy?
// Reads the build's capabilities, then does the real thing on a file you give it. Mutates nothing outside a temp directory.
//   node packages/learn-render/whiteboard/ffmpeg-probe.mjs [some-h264.mp4]   (prints one JSON object; with a file it concatenates it with itself, -c copy,
//   and exits 1 unless the frame counts double; without one only the capabilities are read and stitchOk is null)
// This build has no video test source and no decoder for lavfi video, so the video must be a real file. If it has no audio, a sine track is encoded
// to AAC (audio lavfi sources work) and muxed on with the video copied, so the stitched file has the H.264 + AAC streams the whiteboard produces.
// Run it where the answer matters: inside the renderer image (fly ssh console), not on a developer machine.
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

const input = process.argv[2];
if (result.concatDemuxer && input) {
  const dir = mkdtempSync(join(tmpdir(), 'wb-ffmpeg-probe-'));
  const count = async file => JSON.parse(await text('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,nb_read_frames', '-of', 'json', file])).streams
    .map(s => ({ type: s.codec_type, codec: s.codec_name, frames: Number(s.nb_read_frames) }));
  try {
    let source = resolve(input);
    if (!(await count(source)).some(s => s.type === 'audio')) {
      const muxed = join(dir, 'with-audio.mp4');
      await ff('ffmpeg', ['-y', '-i', source, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=3', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', muxed]);
      source = muxed; result.audioAdded = 'sine encoded to AAC and muxed with the video copied';
    }
    const entry = `file '${source.split(sep).join('/')}'\n`;
    writeFileSync(join(dir, 'list.txt'), entry + entry);
    await ff('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-c', 'copy', join(dir, 'out.mp4')]);
    result.source = await count(source); result.stitched = await count(join(dir, 'out.mp4'));
    // Video frames double exactly; audio is kept (AAC frames add up, so only the codec and presence are compared).
    result.stitchOk = result.source.length > 1 && result.source.every((s, i) => result.stitched[i]?.codec === s.codec && (s.type === 'video' ? result.stitched[i].frames === s.frames * 2 : result.stitched[i].frames >= s.frames * 2 - 1));
  } catch (error) { result.stitchError = String(error.stderr || error.message).slice(-400); result.stitchOk = false; }
  finally { rmSync(dir, { recursive: true, force: true }); }
} else result.stitchOk = null;
console.log(JSON.stringify(result, null, 1));
process.exit(result.stitchOk === false ? 1 : 0);
