// Roadmap W0.2: can Remotion's bundled ffmpeg (the only one in the renderer image) concatenate H.264 + AAC segments with -c copy?
// Reads the build's capabilities, then does the real thing on a file you give it. Mutates nothing outside a temp directory.
//   node packages/learn-render/whiteboard/ffmpeg-probe.mjs [some-h264.mp4]   (prints one JSON object; exits 1 unless the stitched frame counts double)
// This build has no video test source and no decoder for lavfi video, (and the Linux build has no bmp decoder), so without an argument the probe makes its own video: one second of a
// blank PNG, looped at 30 fps and encoded to H.264. A sine track is then encoded to AAC (audio lavfi sources work) and muxed on with the video
// copied, so the stitched file has the H.264 + AAC streams the whiteboard produces.
// Run it where the answer matters: inside the renderer image (fly ssh console), not on a developer machine.
import { RenderInternals } from '@remotion/renderer';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
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
const decoders = await text('ffmpeg', ['-hide_banner', '-decoders']);
result.imageDecoders = ['png', 'bmp', 'mjpeg', 'gif'].filter(d => has(decoders, d));   // the Windows and Linux builds differ here

const input = process.argv[2] ?? null;
if (result.concatDemuxer) {
  const dir = mkdtempSync(join(tmpdir(), 'wb-ffmpeg-probe-'));
  const count = async file => JSON.parse(await text('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,nb_read_frames', '-of', 'json', file])).streams
    .map(s => ({ type: s.codec_type, codec: s.codec_name, frames: Number(s.nb_read_frames) }));
  try {
    let source;
    if (input) source = resolve(input);
    else {
      // A 320x180 grey PNG (the image2 demuxer and png decoder are in the builds seen so far), looped for one second at 30 fps.
      const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body)); const n = Buffer.alloc(4); n.writeUInt32BE(data.length); return Buffer.concat([n, body, c]); };
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(320, 0); ihdr.writeUInt32BE(180, 4); ihdr[8] = 8; ihdr[9] = 0;
      const rows = Buffer.alloc(180 * (1 + 320), 0x80); for (let y = 0; y < 180; y++) rows[y * 321] = 0;
      writeFileSync(join(dir, 'blank.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
      source = join(dir, 'blank.mp4');
      await ff('ffmpeg', ['-y', '-loop', '1', '-framerate', '30', '-t', '1', '-i', join(dir, 'blank.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source]);
      result.videoMade = 'one second of a blank PNG looped at 30 fps and encoded to H.264';
    }
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
} else result.stitchOk = false;
console.log(JSON.stringify(result, null, 1));
process.exit(result.stitchOk === false ? 1 : 0);
