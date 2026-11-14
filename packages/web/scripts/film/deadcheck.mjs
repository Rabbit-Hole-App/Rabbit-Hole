// Dead-scene check on the OUTPUT video: frame-to-frame change at 10 fps on a 192x108 gray copy. A frame "changes" when >= 3 pixels move by > 24 grey levels (a gliding cursor, typing, a camera move,
// the skeleton shimmer all count as change; a held picture does not). Prints every still stretch longer than MIN seconds with its output timestamps, and the longest one.
// Usage: node deadcheck.mjs <video.mp4> [MIN=0.8]    (this ffmpeg build has no rawvideo muxer, so the frames go through PNG files in a temp folder)
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSharp, FFMPEG } from './tools.mjs';
const sharp = loadSharp();
const [video, min = '0.8'] = process.argv.slice(2), MIN = Number(min), W = 192, H = 108, FPS = 10;
const dir = mkdtempSync(join(tmpdir(), 'deadcheck-'));
const r = spawnSync(FFMPEG, ['-v', 'error', '-i', video, '-vf', `scale=${W}:${H}`, '-r', String(FPS), join(dir, 'f%05d.png')], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
const files = readdirSync(dir).sort();
let prev = null, still = null; const stills = [];
for (let n = 0; n < files.length; n++) {
  const { data } = await sharp(readFileSync(join(dir, files[n]))).greyscale().raw().toBuffer({ resolveWithObject: true });
  let moved = 0;
  if (prev) for (let i = 0; i < data.length; i++) if (Math.abs(data[i] - prev[i]) > 24) moved++;
  const changed = prev ? moved >= 3 : true, t = n / FPS;
  if (!changed) { if (!still) still = { from: t - 1 / FPS, to: t }; else still.to = t; }
  else if (still) { if (still.to - still.from >= MIN) stills.push(still); still = null; }
  prev = data;
}
if (still && still.to - still.from >= MIN) stills.push(still);
rmSync(dir, { recursive: true, force: true });
console.log(`${video}: ${(files.length / FPS).toFixed(1)} s, ${stills.length} still stretches >= ${MIN} s`);
for (const s of stills) console.log(`  ${s.from.toFixed(1)}-${s.to.toFixed(1)} s (${(s.to - s.from).toFixed(1)} s)`);
const longest = [...stills].sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
console.log(longest ? `longest still stretch: ${(longest.to - longest.from).toFixed(1)} s at ${longest.from.toFixed(1)} s` : 'no still stretch');
