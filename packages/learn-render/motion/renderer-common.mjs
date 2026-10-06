// What every Motion renderer shares (M7B): the base class with the renderer-neutral steps (the
// contact sheet built from stills, the final MP4's validation), and the media helpers behind them.
// Both backends use Remotion's bundled Chrome Headless Shell and FFmpeg, so the same binaries
// judge the same contract whichever renderer produced the MP4. Moved here unchanged from
// remotion-renderer.mjs, which re-exports them.
import { RenderInternals } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { STAGE } from './contracts.js';
import { contactFrames, nonblankFrames } from './render-coverage.js';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));

export const RENDERER_METHODS = ['validateSource', 'renderPreview', 'renderStills', 'probeFrames', 'renderFinal', 'validateFinal', 'collectDiagnostics'];
export const OUTPUT_MAX_BYTES = 25 * 1024 * 1024; // the math renderer's cap
// The stage loads these woff2 files (assets/fonts). A changed font changes every frame
// hash, so updating one is a deliberate re-pin, never a silent drift.
export const FONT_PINS = {
  'Inter-Regular.woff2': 'e06f6b1bc553aaea4e4668023ed0ab0a147129c3107f511bc7d03d361b0ae085',
  'Inter-Medium.woff2': '0ff3e94614e1493eb556314fd247ae6c4a85a7783b4cc86be539940cf83f2a48',
  'Virgil.woff2': '9976295bfe709bdea64839a4d4e9a1d436dd6eb67538399a5a0e8b8fadbcf1cf',
  // JetBrains Mono 2.304, Regular only (OFL-1.1, JetBrainsMono-OFL.txt): the v2.304 GitHub release zip
  'JetBrainsMono-Regular.woff2': 'a9cb1cd82332b23a47e3a1239d25d13c86d16c4220695e34b243effa999f45f2',
};
// The faces the stage registers: [family, file, weight].
export const FONT_FACES = [
  ['Inter', 'Inter-Regular.woff2', '400'],
  ['Inter', 'Inter-Medium.woff2', '500'],
  ['Virgil', 'Virgil.woff2', '400'],
  ['JetBrains Mono', 'JetBrainsMono-Regular.woff2', '400'],
];
// The page may load only from its own origin, the local server. Every other request (fetch, XHR,
// WebSocket, EventSource, beacon, images, fonts, media, frames, other loopback ports) is refused
// inside the page. ponytail: CSP does not cover navigation, window.open or WebRTC; static
// validation bans those names and the Linux network namespace (motion/linux/) is the boundary.
export const CSP = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self' data:", "media-src 'self' data: blob:", "connect-src 'self'",
  "worker-src 'self' blob:", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');

export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const pixelHash = file => sha256(PNG.sync.read(readFileSync(file)).data);
export { contactFrames };
export const beatAt = (storyboard, frame) => storyboard.beats.find(b => frame / STAGE.fps >= b.start_time && frame / STAGE.fps < b.end_time) || storyboard.beats.at(-1);

// The pinned fonts, checked before any render.
export function checkFontPins() {
  for (const [f, pin] of Object.entries(FONT_PINS)) {
    const got = sha256(readFileSync(join(PKG, 'assets', 'fonts', f)));
    if (got !== pin) throw new Error(`font ${f} changed (sha256 ${got}); re-pin FONT_PINS deliberately`);
  }
}

// The renderer-neutral steps. A backend implements prepare, renderPreview, renderFinal,
// renderStills(job, frames, {scale, dir}) -> [{frame, file, pixels_sha256}], probeFrames and close.
export class MotionRendererBase {
  async time(name, fn) {
    const t0 = performance.now();
    try { return await fn(); } finally { this.timings[name] = +((performance.now() - t0) / 1000).toFixed(2); }
  }

  // One PNG grid at preview scale, each tile labelled "B<n> <t>s #<frame>", plus a manifest.
  async contactSheet(job) {
    const frames = contactFrames(job.brief, job.storyboard);
    const stills = await this.renderStills(job, frames, { scale: job.brief.output_requirements.preview_scale, dir: join(job.dir, 'contact') });
    const tiles = stills.map(s => ({ ...s, png: PNG.sync.read(readFileSync(s.file)), label: `${beatAt(job.storyboard, s.frame).id} ${(s.frame / STAGE.fps).toFixed(1)}s #${s.frame}` }));
    const w = tiles[0].png.width, h = tiles[0].png.height, cols = 4, gut = 16, strip = 44;
    const rows = Math.ceil(tiles.length / cols);
    const sheet = new PNG({ width: cols * w + (cols + 1) * gut, height: rows * (h + strip) + (rows + 1) * gut });
    for (let i = 0; i < sheet.data.length; i += 4) sheet.data.set([0xe3, 0xe2, 0xe0, 255], i);
    tiles.forEach((t, i) => {
      const x0 = gut + (i % cols) * (w + gut), y0 = gut + Math.floor(i / cols) * (h + strip + gut);
      drawText(sheet, t.label, x0 + 4, y0 + 8, 4);
      for (let y = 0; y < h; y++) t.png.data.copy(sheet.data, ((y0 + strip + y) * sheet.width + x0) * 4, y * w * 4, (y + 1) * w * 4);
    });
    const file = join(job.dir, 'contact-sheet.png');
    writeFileSync(file, PNG.sync.write(sheet));
    const manifest = tiles.map(({ frame, label, pixels_sha256 }) => ({ frame, time: +(frame / STAGE.fps).toFixed(3), beat: label.split(' ')[0], pixels_sha256 }));
    writeFileSync(join(job.dir, 'contact-sheet.json'), JSON.stringify(manifest, null, 2));
    return { file, manifest };
  }

  // §11.3 automatic checks on the final MP4: ffprobe from Remotion's bundled compositor
  // (no system ffmpeg needed), nonblank frames at the contact-sheet times, the last frame and
  // (M5) every beat and transition frame the coverage samples (render-coverage.js), and the
  // decoded keyframe hashes recorded for the job. M5 runs it again on the artifacts the caller received.
  async validateFinal(job) { return validateFinalVideo(job); }
}

export async function validateFinalVideo(job) {
  const file = join(job.dir, 'final.mp4');
  const checks = finalChecks(await probe(file), job.brief.duration.seconds);
  const sample = nonblankFrames(job.brief, job.storyboard);
  const keyframes = (await decodeFrames(file, sample, join(job.dir, 'final-frames'))).map(({ frame, pixels_sha256, luma_stddev }) => ({ frame, pixels_sha256, luma_stddev }));
  checks.push(nonblankCheck(keyframes, sample));
  const result = { ok: checks.every(c => c[1]), checks: checks.map(([name, ok, detail]) => ({ name, ok, detail })), keyframe_hashes: keyframes };
  writeFileSync(join(job.dir, 'final-validation.json'), JSON.stringify(result, null, 2));
  return result;
}

// The final MP4 contract from ffprobe output: [name, ok, detail] rows.
export function finalChecks({ v, duration, size }, seconds) {
  const frames = seconds * STAGE.fps, video = Number(v.duration);
  return [
    // the video stream, not the container: an AAC narration track pads the container by ~60 ms
    ['duration', Math.abs(video - seconds) <= 1 / STAGE.fps + 1e-6 && duration <= 30 + 1e-6, `video ${video}s, container ${duration}s (want ${seconds}s within one frame, <= 30s)`],
    ['frame count', Number(v.nb_read_frames) === frames, `${v.nb_read_frames} (want ${frames})`],
    ['fps', v.r_frame_rate === `${STAGE.fps}/1`, v.r_frame_rate],
    ['resolution', v.width === STAGE.width && v.height === STAGE.height, `${v.width}x${v.height}`],
    ['codec', v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.color_space === 'bt709', `${v.codec_name} ${v.pix_fmt} ${v.color_space}`],
    ['size', size <= OUTPUT_MAX_BYTES, `${size} bytes (cap ${OUTPUT_MAX_BYTES})`],
  ];
}

export const ffmpeg = (bin, args) => RenderInternals.callFf({ bin, args, indent: false, logLevel: 'error', binariesDirectory: null });
export async function probe(file) {
  const out = JSON.parse((await ffmpeg('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=codec_name,pix_fmt,color_space,width,height,r_frame_rate,nb_read_frames,duration:format=duration,size', '-of', 'json', file])).stdout);
  return { v: out.streams[0], duration: Number(out.format.duration), size: Number(out.format.size) };
}
export const ffmpegVersion = async () => (await ffmpeg('ffmpeg', ['-version'])).stdout.split('\n')[0].trim();
export const chromeVersion = () => { try { return readFileSync(join(PKG, 'node_modules', '.remotion', 'chrome-headless-shell', 'VERSION'), 'utf8').trim(); } catch { return 'unknown'; } };

// Remotion's ffmpeg build has no select filter: one accurate seek per frame, a quarter frame
// early so the first frame at or after the seek point is exactly frame n. Decoding a video runs
// no composition code, so the orchestrator may do it outside the sandbox (M6 preview frames).
export async function decodeFrames(file, frames, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (const n of frames) {
    const f = join(dir, `frame-${String(n).padStart(4, '0')}.png`);
    await ffmpeg('ffmpeg', ['-v', 'error', '-ss', Math.max(0, (n - 0.25) / STAGE.fps).toFixed(4), '-i', file, '-frames:v', '1', '-y', f]);
    const png = PNG.sync.read(readFileSync(f));
    out.push({ frame: n, file: f, pixels_sha256: sha256(png.data), luma_stddev: +lumaStddev(png).toFixed(2) });
  }
  return out;
}

// A blank or near-blank frame: luma standard deviation at or under 2 (the M1 rule). The final
// and (M6) the preview are judged by this one check.
export const NONBLANK_MIN_LUMA_STDDEV = 2;
export const nonblankCheck = (frames, sample) => ['nonblank frames', frames.length === sample.length && frames.every(k => k.luma_stddev > NONBLANK_MIN_LUMA_STDDEV), frames.map(k => `#${k.frame}:${k.luma_stddev}`).join(' ')];

export function lumaStddev(png) {
  let n = 0, sum = 0, sq = 0;
  for (let i = 0; i < png.data.length; i += 16) {
    const y = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
    n++; sum += y; sq += y * y;
  }
  return Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
}

// 5x7 bitmap glyphs for contact-sheet labels (no font rendering on this side).
const GLYPHS = {
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [30, 1, 1, 14, 1, 1, 30],
  4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12], '.': [0, 0, 0, 0, 0, 12, 12], s: [0, 0, 15, 16, 14, 1, 30],
  B: [30, 17, 17, 30, 17, 17, 30], '#': [10, 10, 31, 10, 31, 10, 10], ' ': [0, 0, 0, 0, 0, 0, 0],
};
function drawText(png, str, x, y, scale) {
  [...str].forEach((ch, i) => (GLYPHS[ch] || GLYPHS[' ']).forEach((row, r) => {
    for (let c = 0; c < 5; c++) if (row & (16 >> c)) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      png.data.set([0x37, 0x35, 0x2f, 255], ((y + r * scale + dy) * png.width + x + i * 6 * scale + c * scale + dx) * 4);
    }
  }));
}
