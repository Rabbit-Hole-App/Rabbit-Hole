// RemotionRenderer: the V1 MotionRenderer adapter (spec §9.4) over packages/learn-render.
// A render job is {id, dir, brief, storyboard, source}: the MotionJob fields rendering
// needs, the validated composition source, and a scratch directory for its files.
// No model calls, no credentials: this side only ever sees one job's source and assets.
import { bundle } from '@remotion/bundler';
import { RenderInternals, openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { STAGE, validateBrief, validateStoryboard } from './contracts.js';
import { IMPORTS, checkComposition } from './static-check.js';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(PKG, '..', '..');
const version = name => JSON.parse(readFileSync(join(ROOT, 'node_modules', name, 'package.json'), 'utf8')).version;

export const RENDERER_METHODS = ['validateSource', 'renderPreview', 'renderStills', 'renderFinal', 'validateFinal', 'collectDiagnostics'];
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
// The bundle page may load only from its own origin, the local bundle server. Every other
// request (fetch, XHR, WebSocket, EventSource, beacon, images, fonts, media, frames,
// other loopback ports) is refused inside the page. ponytail: CSP does not cover
// navigation, window.open or WebRTC; static validation bans those names and the Linux
// network namespace (motion/linux/) is the boundary for all of them.
export const CSP = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self' data:", "media-src 'self' data: blob:", "connect-src 'self'",
  "worker-src 'self' blob:", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');

const sha256 = data => createHash('sha256').update(data).digest('hex');
export const pixelHash = file => sha256(PNG.sync.read(readFileSync(file)).data);

// Rejects any module the composition file asks for outside the allowlist, at bundle time,
// so a validator miss still cannot pull in fs, a CDN module or a primitive not approved.
class ImportAllowlist {
  constructor(file) { this.file = file.toLowerCase(); }
  apply(compiler) {
    compiler.hooks.normalModuleFactory.tap('MotionImportAllowlist', nmf => nmf.hooks.beforeResolve.tap('MotionImportAllowlist', data => {
      if ((data.contextInfo?.issuer || '').toLowerCase() === this.file && !(data.request in IMPORTS)) throw new Error(`motion: the composition imports "${data.request}", which is not on the allowlist (${Object.keys(IMPORTS).join(', ')})`);
    }));
  }
}

// Stills at the first frame, every beat start and middle, the last frame (the takeaway) and
// any brief keyframe_times (spec §11.2).
export function contactFrames(brief, storyboard) {
  const fps = STAGE.fps, last = brief.duration.seconds * fps - 1;
  const frames = [0, last, ...(brief.qa_requirements.keyframe_times || []).map(t => Math.round(t * fps))];
  for (const b of storyboard.beats) frames.push(Math.round(b.start_time * fps), Math.round(((b.start_time + b.end_time) / 2) * fps));
  return [...new Set(frames.map(f => Math.min(last, Math.max(0, f))))].sort((a, b) => a - b);
}
const beatAt = (storyboard, frame) => storyboard.beats.find(b => frame / STAGE.fps >= b.start_time && frame / STAGE.fps < b.end_time) || storyboard.beats.at(-1);

export class RemotionRenderer {
  // cacheDir holds content-addressed bundles, previews and finals; fresh: true bypasses every cache
  // (the determinism check's "fresh context"). csp: false exists only for the network probe's control run.
  // inputProps reach the harness root only (src/motion/index.jsx): {probe: true} for the Author proof.
  constructor({ cacheDir = join(PKG, 'out', 'motion-cache'), fresh = false, csp = true, log = () => {}, inputProps = null } = {}) {
    Object.assign(this, { cacheDir, fresh, csp, log, inputProps, timings: {}, browserLogs: [] });
    this.version = `remotion@${version('remotion')}`;
  }

  validateSource(brief, storyboard, source) {
    const briefErrors = validateBrief(brief);
    if (briefErrors.length) return briefErrors;
    return [...validateStoryboard(storyboard, brief), ...checkComposition(source, { durationSeconds: brief.duration.seconds })];
  }

  async time(name, fn) {
    const t0 = performance.now();
    try { return await fn(); } finally { this.timings[name] = +((performance.now() - t0) / 1000).toFixed(2); }
  }

  key(job) {
    const h = createHash('sha256').update(this.version).update(job.source).update(String(this.csp));
    for (const f of ['src/motion/index.jsx', 'src/motion/fonts.jsx', 'src/motion/probe.jsx', 'motion/remotion-renderer.mjs', 'motion/static-check.js']) h.update(readFileSync(join(PKG, f)));
    for (const [f, pin] of Object.entries(FONT_PINS)) h.update(f).update(pin);
    return h.digest('hex').slice(0, 20);
  }

  async prepare(job) {
    if (this.serveUrl) return;
    for (const [f, pin] of Object.entries(FONT_PINS)) {
      const got = sha256(readFileSync(join(PKG, 'assets', 'fonts', f)));
      if (got !== pin) throw new Error(`font ${f} changed (sha256 ${got}); re-pin FONT_PINS deliberately`);
    }
    mkdirSync(job.dir, { recursive: true });
    const entry = join(job.dir, 'composition.jsx');
    writeFileSync(entry, job.source);
    this.cacheKey = this.key(job);
    const outDir = this.fresh ? mkdtempSync(join(tmpdir(), 'motion-bundle-')) : join(this.cacheDir, `bundle-${this.cacheKey}`);
    if (this.fresh || !existsSync(join(outDir, 'index.html'))) {
      await this.time('bundle', () => bundle({
        entryPoint: join(PKG, 'src', 'motion', 'index.jsx'),
        publicDir: join(PKG, 'assets'),
        outDir,
        enableCaching: false, // content-addressed bundles below; no hidden webpack cache
        webpackOverride: config => ({
          ...config,
          resolve: { ...config.resolve, alias: { ...config.resolve?.alias, 'motion-composition': resolve(entry) }, modules: [...(config.resolve?.modules || ['node_modules']), join(PKG, 'node_modules'), join(ROOT, 'node_modules')] },
          plugins: [...(config.plugins || []), new ImportAllowlist(resolve(entry))],
        }),
      }));
      const html = join(outDir, 'index.html');
      if (this.csp) writeFileSync(html, readFileSync(html, 'utf8').replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${CSP}">`));
    } else this.timings.bundle = 0;
    this.serveUrl = outDir;
    this.browser = await this.time('browser', () => openBrowser('chrome', { logLevel: 'error' }));
    const composition = await selectComposition({ serveUrl: outDir, id: 'motion', puppeteerInstance: this.browser, logLevel: 'error', onBrowserLog: l => this.onLog(l), ...(this.inputProps ? { inputProps: this.inputProps } : {}) });
    // The runtime stage must match the brief, whatever the source claimed statically.
    const want = { ...STAGE, durationInFrames: job.brief.duration.seconds * STAGE.fps };
    for (const k of Object.keys(want)) if (composition[k] !== want[k]) throw new Error(`stage.${k} is ${composition[k]}, the brief needs ${want[k]}`);
    this.composition = composition;
  }

  onLog(l) {
    this.browserLogs.push(`${l.type}: ${l.text}`.slice(0, 2000));
    this.log(l);
  }

  common(job) {
    return { composition: this.composition, serveUrl: this.serveUrl, puppeteerInstance: this.browser, logLevel: 'error', timeoutInMilliseconds: 60000, onBrowserLog: l => this.onLog(l), ...(this.inputProps ? { inputProps: this.inputProps } : {}) };
  }

  async renderMedia(job, name, scale) {
    await this.prepare(job);
    const out = join(job.dir, `${name}.mp4`);
    const cached = join(this.cacheDir, `${name}-${this.cacheKey}.mp4`);
    if (!this.fresh && existsSync(cached)) { copyFileSync(cached, out); this.timings[name] = 0; return { file: out, cached: true }; }
    await this.time(name, () => renderMedia({ ...this.common(job), codec: 'h264', colorSpace: 'bt709', muted: job.brief.narration_policy === 'none', outputLocation: out, scale, overwrite: true }));
    if (!this.fresh) { mkdirSync(this.cacheDir, { recursive: true }); copyFileSync(out, cached); }
    return { file: out, cached: false };
  }

  // §11.1: the same composition and timing, Remotion output scale only.
  renderPreview(job) { return this.renderMedia(job, 'preview', job.brief.output_requirements.preview_scale); }
  renderFinal(job) { return this.renderMedia(job, 'final', 1); }

  async renderStills(job, frames, { scale = 1, dir = join(job.dir, 'stills') } = {}) {
    await this.prepare(job);
    mkdirSync(dir, { recursive: true });
    const out = [];
    await this.time(`stills@${scale}`, async () => {
      for (const frame of frames) {
        const file = join(dir, `frame-${String(frame).padStart(4, '0')}.png`);
        await renderStill({ ...this.common(job), frame, output: file, imageFormat: 'png', scale, overwrite: true });
        out.push({ frame, file, pixels_sha256: pixelHash(file) });
      }
    });
    return out;
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
  // (no system ffmpeg needed), nonblank frames at the contact-sheet times and the last
  // frame, and the decoded keyframe hashes recorded for the job.
  async validateFinal(job) {
    const file = join(job.dir, 'final.mp4');
    const { v, duration, size } = await probe(file);
    const seconds = job.brief.duration.seconds, frames = seconds * STAGE.fps, video = Number(v.duration);
    const checks = [
      // the video stream, not the container: an AAC narration track pads the container by ~60 ms
      ['duration', Math.abs(video - seconds) <= 1 / STAGE.fps + 1e-6 && duration <= 30 + 1e-6, `video ${video}s, container ${duration}s (want ${seconds}s within one frame, <= 30s)`],
      ['frame count', Number(v.nb_read_frames) === frames, `${v.nb_read_frames} (want ${frames})`],
      ['fps', v.r_frame_rate === `${STAGE.fps}/1`, v.r_frame_rate],
      ['resolution', v.width === STAGE.width && v.height === STAGE.height, `${v.width}x${v.height}`],
      ['codec', v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.color_space === 'bt709', `${v.codec_name} ${v.pix_fmt} ${v.color_space}`],
      ['size', size <= OUTPUT_MAX_BYTES, `${size} bytes (cap ${OUTPUT_MAX_BYTES})`],
    ];
    const sample = contactFrames(job.brief, job.storyboard);
    const dir = join(job.dir, 'final-frames');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    // Remotion's ffmpeg build has no select filter: one accurate seek per frame, a quarter
    // frame early so the first frame at or after the seek point is exactly frame n.
    const keyframes = [];
    for (const n of sample) {
      const f = join(dir, `frame-${String(n).padStart(4, '0')}.png`);
      await ffmpeg('ffmpeg', ['-v', 'error', '-ss', Math.max(0, (n - 0.25) / STAGE.fps).toFixed(4), '-i', file, '-frames:v', '1', '-y', f]);
      const png = PNG.sync.read(readFileSync(f));
      keyframes.push({ frame: n, pixels_sha256: sha256(png.data), luma_stddev: +lumaStddev(png).toFixed(2) });
    }
    checks.push(['nonblank frames', keyframes.length === sample.length && keyframes.every(k => k.luma_stddev > 2), keyframes.map(k => `#${k.frame}:${k.luma_stddev}`).join(' ')]);
    const result = { ok: checks.every(c => c[1]), checks: checks.map(([name, ok, detail]) => ({ name, ok, detail })), keyframe_hashes: keyframes };
    writeFileSync(join(job.dir, 'final-validation.json'), JSON.stringify(result, null, 2));
    return result;
  }

  collectDiagnostics(job) {
    const files = existsSync(job.dir) ? readdirSync(job.dir).filter(f => statSync(join(job.dir, f)).isFile()).map(f => ({ file: f, bytes: statSync(join(job.dir, f)).size })) : [];
    return { renderer: this.version, chrome: chromeVersion(), timings: this.timings, cache_key: this.cacheKey, csp: this.csp, browser_logs: this.browserLogs.slice(-50), files };
  }

  async close() { await this.browser?.close({ silent: true }); }
}

const ffmpeg = (bin, args) => RenderInternals.callFf({ bin, args, indent: false, logLevel: 'error', binariesDirectory: null });
export async function probe(file) {
  const out = JSON.parse((await ffmpeg('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=codec_name,pix_fmt,color_space,width,height,r_frame_rate,nb_read_frames,duration:format=duration,size', '-of', 'json', file])).stdout);
  return { v: out.streams[0], duration: Number(out.format.duration), size: Number(out.format.size) };
}
export const ffmpegVersion = async () => (await ffmpeg('ffmpeg', ['-version'])).stdout.split('\n')[0].trim();
export const chromeVersion = () => { try { return readFileSync(join(PKG, 'node_modules', '.remotion', 'chrome-headless-shell', 'VERSION'), 'utf8').trim(); } catch { return 'unknown'; } };

function lumaStddev(png) {
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
