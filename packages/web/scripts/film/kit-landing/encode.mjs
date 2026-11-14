// Trims a recorded take to its marks and writes the web video: silent VP8 WebM, the only encoder in the ffmpeg Playwright
// installs with Chromium (no H.264 encoder and no MP4 muxer there; no system ffmpeg on this machine). The phone take is
// cropped to its 9:8 centre (marks.json crop) and scaled to 720 x 640.
// Usage: node C:/s/spec/landing-tutor/capture/encode.mjs <wide|phone> [takeDir] [outFile]
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TAKE = process.argv[2] === 'phone' ? 'phone' : 'wide';
const DIR = process.argv[3] || `C:/s/spec/landing-tutor/take-${TAKE}`;
const OUT = process.argv[4] || join(DIR, `ai-tutor-demo${TAKE === 'phone' ? '-phone' : ''}-v2.webm`);
const root = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const dir = readdirSync(root).filter(name => /^ffmpeg-\d+$/.test(name)).sort().pop();
const ffmpeg = process.env.FFMPEG || join(root, dir, readdirSync(join(root, dir)).find(name => /^ffmpeg.*\.exe$/.test(name)));
const { start, end, crop } = JSON.parse(readFileSync(join(DIR, 'marks.json'), 'utf8'));
if (!(end > start)) throw Error('marks.json needs start < end');
const k = 1440 / crop.viewport, even = n => Math.round(n / 2) * 2; // the raw video is the viewport scaled to 1440 wide
const vf = TAKE === 'phone' ? ['-vf', `crop=${even(crop.w * k)}:800:${even(crop.x * k)}:0,scale=720:640`] : [];
const run = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(start), '-to', String(end), '-i', join(DIR, 'raw.webm'), ...vf,
  '-an', '-c:v', 'libvpx', '-b:v', '700k', '-crf', '18', '-qmin', '2', '-qmax', '30', '-deadline', 'good', '-cpu-used', '2', '-auto-alt-ref', '0', OUT], { encoding: 'utf8' });
if (run.status !== 0) throw Error(`ffmpeg failed: ${String(run.stderr).slice(0, 600)}`);
console.log(`ok ${OUT} ${(statSync(OUT).size / 1048576).toFixed(2)} MiB, ${(end - start).toFixed(1)} s`);
