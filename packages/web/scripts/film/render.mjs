// Film render: the frames of a screencast take (take/frames/*.jpg + frames.json + marks.json) -> a constant 30 fps timeline with the speed ramp -> H.264 (libx264, CRF 18, preset slow, yuv420p, +faststart).
// Ramp: FAST (1.4x) outside; 1.0x on every typing stretch (padded 0.15 s), card reveal, depth menu and hold. Marks: marks.json (script seconds since t0; frame time = timestamp - t0Epoch).
// Usage: node render.mjs <takeDir> <outPrefix>   env: FAST=1.4 FPS=30 PRESET=slow CRF=18 SIZE=854:480 (scale) TRIM=<hold s> REV=<s> DEAD=3 EXTRA=<cuts.json> FROM=<output s> TO=<output s> (a slice: one beat for a quick proof) DRY=1 (compute only)
// Needs FILM_FFMPEG (an ffmpeg with libx264) and sharp (packages/web or FILM_SHARP_FROM): see tools.mjs. Cuts: marks.cut + marks.dead (the take marks stretches with nothing visible changing) + frozen pages (LONGTASK > 3 s in requests.log) + frame gaps > DEAD s.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { loadSharp, FFMPEG } from './tools.mjs';
const sharp = loadSharp();
const [dir, outPrefix] = process.argv.slice(2);
const FPS = Number(process.env.FPS || 30), FAST = Number(process.env.FAST || 1.4), PRESET = process.env.PRESET || 'slow', CRF = process.env.CRF || '18';
const FROM = Number(process.env.FROM || 0), TO = Number(process.env.TO || Infinity);
const marks = JSON.parse(readFileSync(join(dir, 'marks.json'), 'utf8'));
const frames = JSON.parse(readFileSync(join(dir, 'frames.json'), 'utf8')).frames.map(f => ({ ...f, t: f.ts - marks.t0Epoch })).sort((a, b) => a.t - b.t);
const start = marks.start, end = marks.end;
// 1.0x windows, merged and clipped to [start, end]
const raw = [...marks.typing.map(([a, b]) => [a - 0.15, b + 0.15]), ...marks.reveal, ...marks.depth, ...(marks.hold || []), ...(marks.upload || [])]
  .map(([a, b]) => [Math.max(start, a), Math.min(end, b)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
const real = [];
for (const w of raw) { const last = real.at(-1); if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]); else real.push([...w]); }
let segments = [], cursor = start;
for (const [a, b] of real) { if (a > cursor) segments.push([cursor, a, FAST]); segments.push([Math.max(a, cursor), b, 1]); cursor = b; }
if (cursor < end) segments.push([cursor, end, FAST]);
// cuts (frames of moments the footage must not show) are removed from every segment
// dead time: a stretch where the screen did not change at all (no new frame for more than DEAD seconds: the page was busy or waiting) is cut down to 0.4 s, not played
const DEAD = Number(process.env.DEAD || 3.0), deadCuts = [];
for (let i = 1; i < frames.length; i++) { const g = frames[i].t - frames[i - 1].t; if (g > DEAD && frames[i].t > start && frames[i - 1].t < end) deadCuts.push([frames[i - 1].t + 0.4, frames[i].t - 0.05]); }
console.log(`dead cuts: ${deadCuts.length}, ${deadCuts.reduce((n, [a, b]) => n + b - a, 0).toFixed(1)} s removed`);
// frozen page (main thread blocked > 3 s: the browser keeps emitting identical frames, so no frame gap shows it): the take logs "LONGTASK <ms> at <page ms>"; page time ~ script time, so cut from 0.5 s in to 0.1 s before the end
const freezeCuts = process.env.NOFREEZE ? [] : [...readFileSync(join(dir, 'requests.log'), 'utf8').matchAll(/LONGTASK (\d+) ms at (\d+)/g)]
  .filter(m => Number(m[2]) > 1000 && Number(m[1]) > 3000).map(m => [Number(m[2]) / 1000 + 0.5, (Number(m[2]) + Number(m[1])) / 1000 - 0.1]);
console.log(`freeze cuts: ${freezeCuts.length}, ${freezeCuts.reduce((n, [a, b]) => n + b - a, 0).toFixed(1)} s removed`);
// TRIM=<hold s>: draft pass: every hold longer than TRIM loses its tail (the last hold, the overview, keeps its length); skeleton/menu windows of ~3 s keep REV s
const extraCuts = process.env.EXTRA ? JSON.parse(readFileSync(process.env.EXTRA, 'utf8')) : [];
const TRIM = Number(process.env.TRIM || 0), REV = Number(process.env.REV || 2.2), trimCuts = [];
if (TRIM) { for (const [a, b] of (marks.hold || [])) if (b - a > TRIM + 0.05 && b < end - 0.2) trimCuts.push([a + TRIM, b]); for (const [a, b] of [...marks.reveal, ...marks.depth]) if (b - a > REV + 0.4 && b - a < 4) trimCuts.push([a + REV, b]); }
console.log('trim cuts: ' + trimCuts.length + ', ' + trimCuts.reduce((n, [a, b]) => n + b - a, 0).toFixed(1) + ' s');
for (const [ca, cb] of [...(marks.cut || []), ...(marks.dead || []), ...deadCuts, ...freezeCuts, ...trimCuts, ...extraCuts]) {
  const next = [];
  for (const [a, b, s] of segments) { if (cb <= a || ca >= b) { next.push([a, b, s]); continue; } if (ca > a) next.push([a, ca, s]); if (cb < b) next.push([cb, b, s]); }
  segments = next;
}
const times = [];
for (const [a, b, speed] of segments) for (let t = a; t < b - 1e-9; t += speed / FPS) times.push(t);
const total = times.length / FPS;
writeFileSync(outPrefix + '.times.json', JSON.stringify(times.map(x => +x.toFixed(3)))); // output frame -> source second
const realSeconds = segments.filter(s => s[2] === 1).reduce((n, [a, b]) => n + b - a, 0);
console.log(`script ${(end - start).toFixed(1)} s -> ${total.toFixed(1)} s after the ramp (1.0x for ${realSeconds.toFixed(1)} s, ${FAST}x elsewhere); ${frames.length} screencast frames, ${times.length} output frames`);
if (process.env.DRY) process.exit(0);
const pick = [];
let p = 0;
for (const t of times) { while (p + 1 < frames.length && frames[p + 1].t <= t) p++; pick.push(frames[p].n); }
const from = Math.floor(FROM * FPS), to = Math.min(pick.length, Number.isFinite(TO) ? Math.ceil(TO * FPS) : pick.length);
const meta = await sharp(join(dir, 'frames', `f${String(pick[from]).padStart(6, '0')}.jpg`)).metadata();
console.log(`frame size ${meta.width}x${meta.height}; rendering output frames ${from}..${to} (${((to - from) / FPS).toFixed(1)} s) preset ${PRESET} crf ${CRF}`);
const out = `${outPrefix}.mp4`, t0 = Date.now();
const ff = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-', '-an', '-vf', `scale=${process.env.SIZE ? process.env.SIZE + ':flags=lanczos:' : ''}in_range=full:in_color_matrix=bt601:out_range=limited:out_color_matrix=bt709,format=yuv420p`, '-c:v', 'libx264', '-preset', PRESET, '-crf', CRF, '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0', '-r', String(FPS), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise(resolve => ff.on('close', resolve));
let last = -1, buf = null;
for (let i = from; i < to; i++) {
  if (pick[i] !== last) { const { readFile } = await import('node:fs/promises'); buf = await readFile(join(dir, 'frames', `f${String(pick[i]).padStart(6, '0')}.jpg`)); last = pick[i]; }
  if (!ff.stdin.write(buf)) await new Promise(resolve => ff.stdin.once('drain', resolve));
}
ff.stdin.end();
const code = await done;
if (code !== 0) throw new Error(`ffmpeg exit ${code}`);
const seconds = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`ok ${out} ${(statSync(out).size / 1048576).toFixed(1)} MiB, ${meta.width}x${meta.height}, ${((to - from) / FPS).toFixed(1)} s of video, encode ${seconds} s`);
writeFileSync(`${outPrefix}.render.json`, JSON.stringify({ out, width: meta.width, height: meta.height, seconds: (to - from) / FPS, encodeSeconds: Number(seconds), segments: segments.length, realSeconds, scriptSeconds: end - start, preset: PRESET, crf: CRF }, null, 1));
