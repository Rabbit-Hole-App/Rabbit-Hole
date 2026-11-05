// The render child's whiteboard job (child.mjs, job.type 'whiteboard'; roadmap v1 section 6.2). The service has gated the request and written
// <job>/job.json and <job>/public/audio/*.mp3; this copies the pinned fonts into <job>/public/fonts, bundles src/whiteboard/index.jsx afresh
// with publicDir = <job>/public (a per-job bundle, never cached, so no job serves another's audio), renders final.mp4 (h264 yuv420p bt709,
// AAC), the poster (last frame) and the contact sheet, renders the first and last frame again in a second fresh bundle and browser, and checks
// the MP4 with ffprobe. Returns the result.json body. Inside the Linux sandbox it first proves the job directory is the only writable path.
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSP, FONT_PINS, MotionRendererBase, checkFontPins, chromeVersion, ffmpeg, ffmpegVersion, finalChecks, pixelHash, probe } from '../motion/renderer-common.mjs';
import { audioName } from '../src/whiteboard/timeline.js';
import { FPS, LIMITS, RENDERER_VERSION } from './contracts.mjs';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRY = join(PKG, 'src', 'whiteboard', 'index.jsx');
export const MAX_SECONDS = Math.max(...LIMITS.durations); // the whiteboard's duration cap (Motion's is 60 s)
export const AUDIO_TOLERANCE_S = 1 / FPS + 0.05; // timing carries whole frames: one frame of rounding plus the roadmap's 50 ms
// Paths outside the job that the child must not be able to write (the private /tmp and /dev/shm scratch are expected to be writable).
export const SEALED = ['/', '/app', '/etc', '/usr', '/var', '/var/motion', '/home', '/root'];

// Each path: 'WRITABLE' or the error code that refused the write. `/tmp/job/out` must be the writable one.
export function writableReport(paths = [...SEALED, '/tmp/job/out']) {
  return Object.fromEntries(paths.map(p => {
    const f = join(p, `.wb-probe-${process.pid}`);
    try { writeFileSync(f, 'x'); rmSync(f, { force: true }); return [p, 'WRITABLE']; } catch (e) { return [p, e.code || 'error']; }
  }));
}

// One fresh bundle + browser over the job's public dir. renderStills and time() serve MotionRendererBase.contactSheet.
class WhiteboardRenderer extends MotionRendererBase {
  constructor({ publicDir, work, inputProps }) {
    super();
    Object.assign(this, { name: 'whiteboard', publicDir, work, inputProps, timings: {}, browserLogs: [] });
  }

  async prepare() {
    if (this.serveUrl) return;
    const outDir = mkdtempSync(join(this.work, 'wb-bundle-'));
    await this.time('bundle', () => bundle({ entryPoint: ENTRY, publicDir: this.publicDir, outDir, enableCaching: false }));
    const html = join(outDir, 'index.html');
    writeFileSync(html, readFileSync(html, 'utf8').replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${CSP}">`));
    this.serveUrl = outDir;
    this.browser = await this.time('browser', () => openBrowser('chrome', { logLevel: 'error' }));
    this.composition = await selectComposition({ ...this.common(), id: 'whiteboard' });
  }

  common() {
    return { serveUrl: this.serveUrl, puppeteerInstance: this.browser, logLevel: 'error', timeoutInMilliseconds: 60000, inputProps: this.inputProps, onBrowserLog: l => this.browserLogs.push(`${l.type}: ${l.text}`.slice(0, 2000)), ...(this.composition ? { composition: this.composition } : {}) };
  }

  async renderFinal(file) {
    await this.prepare();
    await this.time('final', () => renderMedia({ ...this.common(), codec: 'h264', pixelFormat: 'yuv420p', colorSpace: 'bt709', audioCodec: 'aac', enforceAudioTrack: true, outputLocation: file, overwrite: true }));
  }

  async renderStills(_job, frames, { scale = 1, dir }) {
    await this.prepare();
    mkdirSync(dir, { recursive: true });
    const out = [];
    await this.time(`stills@${scale}`, async () => {
      for (const frame of frames) {
        const file = join(dir, `frame-${String(frame).padStart(4, '0')}.png`);
        await renderStill({ ...this.common(), frame, output: file, imageFormat: 'png', scale, overwrite: true });
        out.push({ frame, file, pixels_sha256: pixelHash(file) });
      }
    });
    return out;
  }

  async close() { const b = this.browser; this.browser = null; await b?.close({ silent: true }); }
}

// ffprobe rows for the final MP4: renderer-common's contract with the whiteboard's 120 s cap in place of Motion's duration row, plus AAC.
export async function whiteboardChecks(file, seconds) {
  const probed = await probe(file);
  const video = Number(probed.v.duration);
  const audio = JSON.parse((await ffmpeg('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'json', file])).stdout).streams?.[0]?.codec_name ?? null;
  const rows = finalChecks(probed, seconds).filter(([name]) => name !== 'duration');
  rows.unshift(['duration', Math.abs(video - seconds) <= 1 / FPS + 1e-6 && probed.duration <= MAX_SECONDS + 1 / FPS, `video ${video}s, container ${probed.duration}s (want ${seconds}s within one frame, <= ${MAX_SECONDS}s)`]);
  rows.push(['audio', audio === 'aac', `a:0 ${audio}`]);
  return { probed, checks: rows.map(([name, ok, detail]) => ({ name, ok, detail })) };
}

// Every narrated beat's MP3, measured by ffprobe against the frames timing gave it.
async function audioMismatches(publicDir, timing) {
  const bad = [];
  for (const [i, t] of timing.beats.entries()) {
    if (!t.audioFrames) continue;
    let got = NaN; // a file ffprobe cannot read is a mismatch, not a crash
    try { got = Number(JSON.parse((await ffmpeg('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', join(publicDir, audioName(i))])).stdout).format?.duration); } catch { /* reported below */ }
    if (!(Math.abs(got - t.audioFrames / FPS) <= AUDIO_TOLERANCE_S)) bad.push(`${t.sceneId}/${t.id}: ${got}s, timing ${t.audioFrames / FPS}s`);
  }
  return bad;
}

export async function renderWhiteboard({ job, dir, out, work, sandbox }) {
  const t0 = performance.now(), firstLine = e => String(e?.message || e).split('\n')[0].slice(0, 500);
  const fail = (error, detail, extra = {}) => ({ status: 'failed', error, detail, sandbox, ...extra });
  if (sandbox.mode === 'linux') {
    sandbox.writable = writableReport();
    const open = SEALED.filter(p => sandbox.writable[p] === 'WRITABLE');
    if (open.length || sandbox.writable['/tmp/job/out'] !== 'WRITABLE') return fail('sandbox_breach', `writable outside the job: ${open.join(', ') || 'none'}; job out: ${sandbox.writable['/tmp/job/out']}`);
  }
  const { manifest } = job, total = manifest.timing.totalFrames, seconds = total / FPS, last = total - 1;
  const publicDir = join(dir, 'public');
  checkFontPins();
  mkdirSync(join(publicDir, 'fonts'), { recursive: true });
  for (const f of Object.keys(FONT_PINS)) copyFileSync(join(PKG, 'assets', 'fonts', f), join(publicDir, 'fonts', f));
  const mismatched = await audioMismatches(publicDir, manifest.timing);
  if (mismatched.length) return fail('audio_mismatch', `beat audio differs from its timing by more than ${AUDIO_TOLERANCE_S.toFixed(3)} s: ${mismatched.join('; ')}`);

  const inputProps = { manifest };
  const a = new WhiteboardRenderer({ publicDir, work, inputProps });
  let b;
  try {
    try {
      await a.prepare();
      const c = a.composition;
      if (c.durationInFrames !== total || c.fps !== FPS || c.width !== 1920 || c.height !== 1080) return fail('compile_failed', `the composition is ${c.width}x${c.height} ${c.fps} fps ${c.durationInFrames} frames, the job needs 1920x1080 30 fps ${total}`);
    } catch (error) { return fail('compile_failed', firstLine(error)); }
    let first, second, sheet;
    const final = join(out, 'final.mp4');
    try {
      await a.renderFinal(final);
      first = await a.renderStills(null, [0, last], { dir: join(work, 'det-1') });
      // The contact sheet's tiles: frame 0, the last frame, each scene's first and middle frame, labelled with the scene id.
      const shim = { dir: join(work, 'sheet'), brief: { duration: { seconds }, qa_requirements: {}, output_requirements: { preview_scale: 0.25 } }, storyboard: { beats: manifest.plan.scenes.map(s => ({ id: s.id, start_time: s.startFrame / FPS, end_time: s.endFrame / FPS })) } };
      mkdirSync(shim.dir, { recursive: true });
      sheet = await a.contactSheet(shim);
      b = new WhiteboardRenderer({ publicDir, work, inputProps });
      second = await b.renderStills(null, [0, last], { dir: join(work, 'det-2') });
    } catch (error) { return fail('runtime_error', firstLine(error)); }
    copyFileSync(first[1].file, join(out, 'poster.png'));
    copyFileSync(sheet.file, join(out, 'contact-sheet.png'));
    // ponytail: stills/<scene>-{first,mid,last}.png are W2's review input; not emitted in W1 (the service's artifact list has no nested names)
    const { probed, checks } = await whiteboardChecks(final, seconds);
    const validation = { ok: checks.every(c => c.ok), checks };
    const differing = first.filter((s, i) => s.pixels_sha256 !== second[i].pixels_sha256).map(s => s.frame);
    const determinism = { method: 'renderStill PNG, sha256 of decoded RGBA, two fresh contexts (separate bundle and browser)', identical: !differing.length, differing, frames: first.map((s, i) => ({ frame: s.frame, hashes: [s.pixels_sha256, second[i].pixels_sha256] })) };
    const failed = !validation.ok ? ['final_validation_failed', checks.filter(c => !c.ok).map(c => `${c.name}: ${c.detail}`).join('; ')]
      : differing.length ? ['nondeterministic', `frames ${differing.join(', ')} differ between two fresh render contexts`] : null;
    return {
      status: failed ? 'failed' : 'ready', ...(failed ? { error: failed[0], detail: failed[1] } : {}),
      duration_seconds: Number(probed.v.duration), fps: FPS, width: probed.v.width, height: probed.v.height, frame_count: Number(probed.v.nb_read_frames), output_bytes: probed.size,
      final_validation: validation, determinism, contact_sheet: sheet.manifest, sandbox,
      fonts: a.browserLogs.find(l => l.includes('MOTION_FONTS')) || null,
      timings: { ...a.timings, determinism_second_context: b.timings, total: +((performance.now() - t0) / 1000).toFixed(2) },
      renderer: { name: 'whiteboard', version: RENDERER_VERSION, chrome: chromeVersion(), ffmpeg: await ffmpegVersion() },
    };
  } finally {
    await a.close();
    await b?.close();
  }
}
