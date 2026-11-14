// Speed ramp for an encoded take: FAST (default 1.5, owner 2026-10-27: 1.25) outside the two experiment runs, 1.0x inside them, so the swings stay in real
// time and agree with the card's "Time per swing" readouts. Playwright's ffmpeg has no setpts or concat, so the ramp is
// rendered frame by frame: each output frame (25 fps) is the source video seeked to its mapped time in a Playwright page
// (served by the local preview), then the JPEG stream is encoded to VP8 WebM as e2e/large-video-fixture.mjs does.
// Usage (from packages/web, preview on 5480, the take's webm copied under dist-dev/landing):
//   node C:/s/spec/landing-tutor/capture/retime.mjs <wide|phone>
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = createRequire(join(process.cwd(), 'package.json'))('@playwright/test');
const TAKE = process.argv[2] === 'phone' ? 'phone' : 'wide';
const DIR = `C:/s/spec/landing-tutor/take-${TAKE}`, NAME = `ai-tutor-demo${TAKE === 'phone' ? '-phone' : ''}-v2`;
const SRC = `http://127.0.0.1:5480/landing/${NAME}-trim.webm`, OUT = join(DIR, `${NAME}.webm`);
const FPS = 25, FAST = Number(process.env.FAST) || 1.5;
const m = JSON.parse(readFileSync(join(DIR, 'marks.json'), 'utf8'));
// Source segments (seconds into the trimmed take) and their speed.
const rel = t => t - m.start, end = m.end - m.start;
// Real time (1.0x) inside the two runs and while keys are typed (marks.typing, padded 0.15 s); FAST elsewhere.
const real = [[rel(m.run1), rel(m.run1End)], [rel(m.run2), rel(m.run2End)], ...(m.typing || []).map(([a, b]) => [rel(a) - 0.15, rel(b) + 0.15])]
  .map(([a, b]) => [Math.max(0, a), Math.min(end, b)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
const segments = [];
let cursor = 0;
for (const [a, b] of real) { if (a > cursor) segments.push([cursor, a, FAST]); const from = Math.max(a, cursor); if (b > from) { segments.push([from, b, 1]); cursor = b; } }
if (cursor < end) segments.push([cursor, end, FAST]);
const times = [];
for (const [a, b, speed] of segments) for (let t = a; t < b - 1e-9; t += speed / FPS) times.push(t);
const browser = await chromium.launch();
const { width, height } = TAKE === 'phone' ? { width: 720, height: 640 } : { width: 1440, height: 800 };
const page = await browser.newPage({ viewport: { width, height } });
await page.goto('http://127.0.0.1:5480/404');
await page.setContent(`<body style="margin:0;background:#fff"><video muted preload="auto" src="${SRC}" style="display:block;width:${width}px;height:${height}px"></video></body>`);
await page.evaluate(() => new Promise(resolve => { const v = document.querySelector('video'); if (v.readyState >= 1) resolve(); else v.onloadedmetadata = resolve; }));
const video = page.locator('video'), frames = [];
for (const t of times) {
  await page.evaluate(time => new Promise(resolve => { const v = document.querySelector('video'); v.onseeked = () => requestAnimationFrame(() => resolve()); v.currentTime = time; }), t);
  frames.push(await video.screenshot({ type: 'jpeg', quality: 92 }));
}
await browser.close();
const stream = join(DIR, `${NAME}.mjpeg`);
writeFileSync(stream, Buffer.concat(frames));
const root = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const dir = readdirSync(root).filter(name => /^ffmpeg-\d+$/.test(name)).sort().pop();
const ffmpeg = join(root, dir, readdirSync(join(root, dir)).find(name => /^ffmpeg.*\.exe$/.test(name)));
const run = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', stream,
  '-an', '-c:v', 'libvpx', '-b:v', '700k', '-crf', '18', '-qmin', '2', '-qmax', '30', '-deadline', 'good', '-cpu-used', '2', '-auto-alt-ref', '0', OUT], { encoding: 'utf8' });
rmSync(stream, { force: true });
if (run.status !== 0) throw Error(`ffmpeg failed: ${String(run.stderr).slice(0, 600)}`);
const runs = segments.filter(s => s[2] === 1).map(([a, b]) => (b - a).toFixed(1));
console.log(`segments: ${segments.length}, real-time ${segments.filter(s => s[2] === 1).reduce((n, [a, b]) => n + b - a, 0).toFixed(1)} s of ${end.toFixed(1)} s`);
console.log(`ok ${OUT} ${(statSync(OUT).size / 1048576).toFixed(2)} MiB, ${(times.length / FPS).toFixed(1)} s (from ${end.toFixed(1)} s; runs at 1.0x: ${runs.join(' s, ')} s)`);
