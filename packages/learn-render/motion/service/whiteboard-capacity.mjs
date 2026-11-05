// ponytail: W1.0 only (roadmap), deleted in the same lane before W1.4 lands; never ships to production.
// What one whiteboard render costs on THIS machine under THIS job's limits, with everything W1 will do per render: bundle, Chrome, the 1080p30
// H.264 yuv420p bt709 render, a silent AAC track muxed in, the ffprobe checks, the poster, the contact sheet, and the two determinism stills
// (first and last frame) in a second fresh bundle and browser. Runs inside the render child (child.mjs, job.type 'whiteboard-capacity').
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import script from '../../lectures/nms/script.json' with { type: 'json' };
import timing from '../../lectures/nms/timing.json' with { type: 'json' };
import { SECONDS, synthLecture } from '../../src/whiteboard-capacity/synth.js';
import { ffmpeg, probe } from '../renderer-common.mjs';

const PKG = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const CAPACITY_SECONDS = SECONDS;

// Sum of VmRSS over every process this sandbox can see (its own PID namespace). Linux only.
export function residentKb(proc = '/proc') {
  let total = 0;
  try {
    for (const name of readdirSync(proc).filter(n => /^\d+$/.test(n))) {
      try { total += Number(readFileSync(join(proc, name, 'status'), 'utf8').match(/^VmRSS:\s+(\d+) kB/m)?.[1] ?? 0); } catch { /* the process exited */ }
    }
  } catch { return null; }
  return total;
}

export function dirBytes(dir) {
  let total = 0;
  try {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      try { const s = statSync(p); total += s.isDirectory() ? dirBytes(p) : s.size; } catch { /* removed while walking */ }
    }
  } catch { /* gone */ }
  return total;
}

const hash = file => createHash('sha256').update(PNG.sync.read(readFileSync(file)).data).digest('hex');
const entry = join(PKG, 'src', 'whiteboard-capacity', 'index.jsx');

export async function measureRender({ seconds, work, outDir, now = () => performance.now() }) {
  if (!CAPACITY_SECONDS.includes(seconds)) throw new Error(`seconds must be one of ${CAPACITY_SECONDS.join(', ')}`);
  const input = synthLecture(seconds, { script, timing }), t = {}, tAll = now();
  const timed = async (name, f) => { const a = now(); try { return await f(); } finally { t[name] = +((now() - a) / 1000).toFixed(2); } };
  let peakKb = 0, peakTmp = 0;
  const sample = setInterval(() => { peakKb = Math.max(peakKb, residentKb() ?? 0); peakTmp = Math.max(peakTmp, dirBytes(work)); }, 1000);
  const progress = [], browsers = [];
  const open = async (dir) => {
    const serveUrl = await bundle({ entryPoint: entry, publicDir: join(PKG, 'assets'), outDir: dir, enableCaching: false });
    const browser = await openBrowser('chrome', { logLevel: 'error' }); browsers.push(browser);
    const common = { serveUrl, puppeteerInstance: browser, logLevel: 'error', timeoutInMilliseconds: 120000, inputProps: input };
    return { common, composition: await selectComposition({ ...common, id: 'capacity' }) };
  };
  const stills = async (ctx, frames, dir, scale = 1) => {
    mkdirSync(dir, { recursive: true });
    const out = [];
    for (const frame of frames) { const file = join(dir, `frame-${frame}.png`); await renderStill({ ...ctx.common, composition: ctx.composition, frame, output: file, imageFormat: 'png', scale, overwrite: true }); out.push({ frame, file }); }
    return out;
  };
  try {
    const A = await timed('bundle_and_browser', () => open(join(work, 'bundle-a')));
    if (A.composition.durationInFrames !== input.frames) throw new Error(`the composition has ${A.composition.durationInFrames} frames, expected ${input.frames}`);
    const video = join(work, 'video.mp4'), started = now();
    await timed('render', () => renderMedia({
      ...A.common, composition: A.composition, codec: 'h264', pixelFormat: 'yuv420p', colorSpace: 'bt709', muted: true, outputLocation: video, overwrite: true,
      onProgress: p => { if (p.renderedFrames % 150 === 0 || p.renderedFrames === input.frames) progress.push({ seconds: +((now() - started) / 1000).toFixed(1), rendered: p.renderedFrames, encoded: p.encodedFrames }); },
    }));
    const final = join(outDir, 'final.mp4');
    await timed('mux_silent_aac', () => ffmpeg('ffmpeg', ['-v', 'error', '-y', '-i', video, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '64k', '-shortest', final]));
    const last = input.frames - 1;
    const first = await timed('stills_first_context', () => stills(A, [0, last], join(work, 'det-1')));
    copyFileSync(first[1].file, join(outDir, 'poster.png'));
    await timed('contact_sheet', async () => {
      const frames = Array.from({ length: 12 }, (_, i) => Math.round((i / 11) * last)), tiles = (await stills(A, frames, join(work, 'contact'), 0.25)).map(s => PNG.sync.read(readFileSync(s.file)));
      const w = tiles[0].width, h = tiles[0].height, gut = 8, sheet = new PNG({ width: 4 * w + 5 * gut, height: 3 * h + 4 * gut });
      sheet.data.fill(0xe3);
      tiles.forEach((tile, i) => { const x0 = gut + (i % 4) * (w + gut), y0 = gut + Math.floor(i / 4) * (h + gut); for (let y = 0; y < h; y++) tile.data.copy(sheet.data, ((y0 + y) * sheet.width + x0) * 4, y * w * 4, (y + 1) * w * 4); });
      writeFileSync(join(outDir, 'contact-sheet.png'), PNG.sync.write(sheet));
    });
    const B = await timed('second_context_bundle_and_browser', () => open(join(work, 'bundle-b')));
    const second = await timed('stills_second_context', () => stills(B, [0, last], join(work, 'det-2')));
    t.deterministic = first.every((s, i) => hash(s.file) === hash(second[i].file));
    const { v, size } = await probe(final);
    const audio = JSON.parse((await ffmpeg('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'json', final])).stdout).streams?.[0]?.codec_name ?? null;
    t.total = +((now() - tAll) / 1000).toFixed(2);
    return {
      video_seconds: seconds, frames: input.frames, ffprobe: { codec: v.codec_name, pix_fmt: v.pix_fmt, color_space: v.color_space, width: v.width, height: v.height, frame_count: Number(v.nb_read_frames), audio_codec: audio },
      mp4_bytes: size, timings: t, render_fps: +(input.frames / t.render).toFixed(2), progress, density: input.stats,
      peak_rss_mib: peakKb ? +(peakKb / 1024).toFixed(0) : null, peak_tmp_mib: +(Math.max(peakTmp, dirBytes(work)) / 1048576).toFixed(0), exceeds_420s: t.total > 420,
    };
  } finally {
    clearInterval(sample);
    for (const b of browsers) await b.close({ silent: true });
  }
}
