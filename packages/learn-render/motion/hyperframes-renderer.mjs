// HyperFramesRenderer (M7B): the second MotionRenderer adapter, over @hyperframes/producer 0.8.137
// (Apache-2.0). Same job, same methods, same normalized result as RemotionRenderer; the service
// child, the orchestrator and the review loop do not care which one produced the MP4.
//
// A job's source is one index.html under the HyperFrames contract (hf-static-check.js). The harness
// stages it as a one-file project with the bundled fonts, adds the CSP, the @font-face rules and a
// zero page margin, and renders it with the producer (compile, seek every frame in Chrome Headless
// Shell, encode with FFmpeg). Stills and the coverage probe use the producer's own file server and
// capture engine, so they show exactly the frames the final shows.
//
// Binaries: Remotion's bundled Chrome Headless Shell (149) and FFmpeg, not puppeteer's download,
// so both renderers run on the same Chromium and are judged by the same ffprobe. No model calls,
// no credentials, and nothing leaves loopback (the CSP in the page; guardNodeNetwork in Node; the
// Linux network namespace around the child).
import { RenderInternals } from '@remotion/renderer';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { STAGE, validateBrief, validateStoryboard } from './contracts.js';
import { checkHyperFramesComposition } from './hf-static-check.js';
import { CSP, FONT_FACES, FONT_PINS, MotionRendererBase, checkFontPins, chromeVersion, ffmpeg, pixelHash } from './renderer-common.mjs';
import { probeDom } from '../src/motion/probe-dom.js';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(PKG, '..', '..');
const version = name => JSON.parse(readFileSync(join(ROOT, 'node_modules', name, 'package.json'), 'utf8')).version;
const FPS = { num: STAGE.fps, den: 1 };
const exe = process.platform === 'win32' ? '.exe' : '';

// Remotion's binaries, the same ones its own renders use.
export function hyperframesBinaries() {
  const chromePlatform = process.platform === 'win32' ? 'win64' : process.platform === 'darwin' ? (process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64') : process.arch === 'arm64' ? 'linux-arm64' : 'linux64';
  const bin = type => RenderInternals.getExecutablePath({ type, indent: false, logLevel: 'error', binariesDirectory: null });
  return {
    chrome: join(PKG, 'node_modules', '.remotion', 'chrome-headless-shell', chromePlatform, `chrome-headless-shell-${chromePlatform}`, `chrome-headless-shell${exe}`),
    ffmpeg: bin('ffmpeg'), ffprobe: bin('ffprobe'),
  };
}

// Node side: while a HyperFrames render runs in this process, fetch reaches loopback only. The
// producer can fetch remote fonts and media during compile; the contract leaves it nothing to fetch
// (bundled @font-face for every allowed family, no URLs), and this refuses anything else.
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
export function guardNodeNetwork() {
  if (globalThis.__motionNetworkGuard) return;
  const real = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    let host = '';
    try { host = new URL(typeof input === 'string' || input instanceof URL ? input : input.url).hostname; } catch { /* refused below */ }
    if (!LOOPBACK.has(host)) return Promise.reject(new Error(`motion: network request refused (${host || 'unparseable URL'}): a HyperFrames render reaches loopback only`));
    return real(input, init);
  };
  globalThis.__motionNetworkGuard = true;
}

// The harness's additions to the Author's <head>: CSP first, then the bundled faces and a zero margin.
export function stageHtml(source, { csp = true } = {}) {
  const faces = FONT_FACES.map(([family, file, weight]) => `@font-face { font-family: '${family}'; src: url('assets/fonts/${file}') format('woff2'); font-weight: ${weight}; font-style: normal; font-display: block; }`).join('\n');
  const head = `${csp ? `<meta http-equiv="Content-Security-Policy" content="${CSP}">` : ''}<style data-motion-harness>\n${faces}\nhtml, body { margin: 0; padding: 0; overflow: hidden; }\n</style>`;
  const m = /<head(\s[^>]*)?>/i.exec(source);
  if (!m) throw new Error('the composition has no <head>');
  return source.slice(0, m.index + m[0].length) + head + source.slice(m.index + m[0].length);
}

// What the page says about itself once loaded: the root's box, every animation's end, the faces.
function inspectPage() {
  const root = document.querySelector('[data-composition-id]');
  const r = root ? root.getBoundingClientRect() : { width: 0, height: 0 };
  const animations = document.getAnimations().map(a => {
    const t = a.effect?.getComputedTiming?.() || {};
    const target = a.effect?.target;
    return { name: a.animationName || a.id || '', end: t.endTime ?? null, iterations: t.iterations ?? null, target: target?.closest?.('[data-object]')?.getAttribute('data-object') || target?.id || target?.tagName?.toLowerCase() || '' };
  });
  const faces = [...document.fonts].map(f => ({ family: f.family.replace(/^['"]|['"]$/g, ''), weight: f.weight, status: f.status }));
  return { root: { width: r.width, height: r.height }, animations, faces, check: document.fonts.check('400 32px "JetBrains Mono"') };
}

export function inspectionErrors(page, durationSeconds) {
  const e = [];
  if (page.root.width !== STAGE.width || page.root.height !== STAGE.height) e.push(`the root is ${page.root.width}x${page.root.height}; it must be ${STAGE.width}x${STAGE.height}`);
  for (const a of page.animations) {
    if (a.iterations === null || a.iterations === Infinity || !Number.isFinite(a.end)) e.push(`animation ${a.name || '(unnamed)'} on ${a.target} never ends`);
    else if (a.end > durationSeconds * 1000 + 1e-6) e.push(`animation ${a.name || '(unnamed)'} on ${a.target} ends at ${(a.end / 1000).toFixed(2)} s, after the ${durationSeconds} s duration`);
  }
  for (const [family] of FONT_FACES) if (!page.faces.some(f => f.family === family && f.status === 'loaded') && page.usedFamilies?.includes(family)) e.push(`font ${family} did not load`);
  return e;
}

export class HyperFramesRenderer extends MotionRendererBase {
  // cacheDir holds content-addressed previews and finals; fresh: true bypasses every cache and
  // stages its own project with its own server and browser (the determinism check's "fresh
  // context"). csp: false exists only for the network probe's control run.
  constructor({ cacheDir = join(PKG, 'out', 'motion-cache'), fresh = false, csp = true, log = () => {} } = {}) {
    super();
    Object.assign(this, { name: 'hyperframes', cacheDir, fresh, csp, log, timings: {}, browserLogs: [], sessions: new Map(), producerLogs: [] });
    this.version = `hyperframes@${version('@hyperframes/producer')}`;
  }

  validateSource(brief, storyboard, source, { compositionId } = {}) {
    const briefErrors = validateBrief(brief);
    if (briefErrors.length) return briefErrors;
    return [...validateStoryboard(storyboard, brief), ...checkHyperFramesComposition(source, { compositionId, durationSeconds: brief.duration.seconds })];
  }

  key(job) {
    const h = createHash('sha256').update(this.version).update(job.source).update(String(this.csp));
    for (const f of ['motion/hyperframes-renderer.mjs', 'motion/renderer-common.mjs', 'motion/hf-static-check.js']) h.update(readFileSync(join(PKG, f)));
    for (const [f, pin] of Object.entries(FONT_PINS)) h.update(f).update(pin);
    return h.digest('hex').slice(0, 20);
  }

  config() {
    return { chromePath: this.bins.chrome, browserGpuMode: 'software', enableBrowserPool: false };
  }

  logger() {
    const keep = level => (message, meta) => { this.producerLogs.push(`${level}: ${message}${meta ? ` ${JSON.stringify(meta).slice(0, 300)}` : ''}`.slice(0, 600)); if (this.producerLogs.length > 300) this.producerLogs.shift(); };
    return { error: keep('error'), warn: keep('warn'), info: keep('info'), debug: () => {}, isLevelEnabled: level => level !== 'debug' };
  }

  async prepare(job) {
    if (this.server) return;
    checkFontPins();
    guardNodeNetwork();
    this.bins = hyperframesBinaries();
    if (!existsSync(this.bins.chrome)) throw new Error(`Chrome Headless Shell is missing at ${this.bins.chrome}: run \`npx remotion browser ensure\` in packages/learn-render`);
    process.env.HYPERFRAMES_FFMPEG_PATH = this.bins.ffmpeg;
    process.env.HYPERFRAMES_FFPROBE_PATH = this.bins.ffprobe;
    mkdirSync(job.dir, { recursive: true });
    this.cacheKey = this.key(job);
    const project = this.fresh ? mkdtempSync(join(tmpdir(), 'motion-hf-')) : join(job.dir, 'project');
    rmSync(project, { recursive: true, force: true });
    mkdirSync(join(project, 'assets', 'fonts'), { recursive: true });
    for (const f of Object.keys(FONT_PINS)) copyFileSync(join(PKG, 'assets', 'fonts', f), join(project, 'assets', 'fonts', f));
    writeFileSync(join(project, 'index.html'), stageHtml(job.source, { csp: this.csp }));
    this.project = project;
    const { createFileServer } = await import('@hyperframes/producer');
    this.server = await this.time('server', () => createFileServer({ projectDir: project, port: 0, fps: FPS }));
    // The page inspects itself before anything renders: a run-time contract break (an animation
    // past the duration, a wrong root size) fails here, as the composition's failure.
    await this.session(job, 1);
  }

  // A capture session per scale on the producer's file server: the engine seeks the page to the
  // frame's time and captures it. The first one also inspects the page (inspectionErrors).
  async session(job, scale) {
    await this.prepare(job);
    if (this.sessions.has(scale)) return this.sessions.get(scale);
    const { createCaptureSession, initializeSession } = await import('@hyperframes/producer');
    const out = mkdtempSync(join(tmpdir(), 'motion-hf-capture-'));
    const s = await this.time(`session@${scale}`, () => createCaptureSession(this.server.url, out, { width: STAGE.width, height: STAGE.height, fps: FPS, format: 'png', deviceScaleFactor: scale }, null, this.config()));
    s.page.on('console', m => { this.browserLogs.push(`${m.type()}: ${m.text()}`.slice(0, 2000)); if (this.browserLogs.length > 200) this.browserLogs.shift(); });
    await initializeSession(s);
    this.sessions.set(scale, { session: s, out });
    if (!this.inspected) {
      const page = await s.page.evaluate(inspectPage);
      page.usedFamilies = await s.page.evaluate(() => [...new Set([...document.querySelectorAll('body *')].map(el => getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '')))]);
      this.inspection = page;
      this.browserLogs.push(`MOTION_FONTS ${JSON.stringify({ faces: page.faces.filter(f => f.status === 'loaded'), check: page.check })}`);
      const errors = inspectionErrors(page, job.brief.duration.seconds);
      this.inspected = true;
      if (errors.length) throw new Error(`the composition breaks the HyperFrames contract at run time: ${errors.join('; ')}`);
    }
    return this.sessions.get(scale);
  }

  async renderStills(job, frames, { scale = 1, dir = join(job.dir, 'stills') } = {}) {
    const { captureFrame } = await import('@hyperframes/producer');
    const { session } = await this.session(job, scale);
    mkdirSync(dir, { recursive: true });
    const out = [];
    await this.time(`stills@${scale}`, async () => {
      for (const frame of frames) {
        const r = await captureFrame(session, frame, frame / STAGE.fps);
        const file = join(dir, `frame-${String(frame).padStart(4, '0')}.png`);
        copyFileSync(r.path, file);
        out.push({ frame, file, pixels_sha256: pixelHash(file) });
      }
    });
    return out;
  }

  // The coverage probe (render-coverage.js): seek and capture each frame, then measure the page
  // with the same probe-dom.js the Remotion stage runs.
  async probeFrames(job, frames, { scale = 0.25, dir = join(job.dir, 'probe') } = {}) {
    const { captureFrame } = await import('@hyperframes/producer');
    const { session } = await this.session(job, scale);
    mkdirSync(dir, { recursive: true });
    const observations = [];
    await this.time(`probe@${scale}`, async () => {
      for (const frame of frames) {
        await captureFrame(session, frame, frame / STAGE.fps);
        observations.push(await session.page.evaluate(probeDom, frame, null));
      }
    });
    return { observations, timings: { [`probe@${scale}`]: this.timings[`probe@${scale}`] } };
  }

  async renderVideo(job, name, quality) {
    await this.prepare(job);
    const out = join(job.dir, `${name}.mp4`);
    const cached = join(this.cacheDir, `hf-${name}-${this.cacheKey}.mp4`);
    if (!this.fresh && existsSync(cached)) { copyFileSync(cached, out); this.timings[name] = 0; return { file: out, cached: true }; }
    const { createRenderJob, executeRenderJob } = await import('@hyperframes/producer');
    const renderJob = createRenderJob({ fps: STAGE.fps, quality, format: 'mp4', entryFile: 'index.html', producerConfig: { ...(await import('@hyperframes/producer')).resolveConfig(this.config()) }, logger: this.logger() });
    await this.time(name, () => executeRenderJob(renderJob, this.project, out));
    if (!this.fresh) { mkdirSync(this.cacheDir, { recursive: true }); copyFileSync(out, cached); }
    return { file: out, cached: false };
  }

  renderFinal(job) { return this.renderVideo(job, 'final', 'standard'); }

  // §11.1: the same composition and timing at preview scale. The producer renders at the stage
  // size; the preview is that render scaled down (area average), re-encoded as the contract needs.
  async renderPreview(job) {
    const full = await this.renderVideo(job, 'preview-full', 'draft');
    const scale = job.brief.output_requirements.preview_scale;
    const file = join(job.dir, 'preview.mp4');
    await this.time('preview_scale', () => ffmpeg('ffmpeg', ['-v', 'error', '-i', full.file, '-vf', `scale=${Math.round(STAGE.width * scale)}:${Math.round(STAGE.height * scale)}:flags=area`,
      '-fps_mode', 'passthrough', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-an', '-y', file]));
    return { file, cached: full.cached };
  }

  collectDiagnostics(job) {
    const files = existsSync(job.dir) ? readdirSync(job.dir).filter(f => statSync(join(job.dir, f)).isFile()).map(f => ({ file: f, bytes: statSync(join(job.dir, f)).size })) : [];
    return { renderer: this.version, chrome: chromeVersion(), timings: this.timings, cache_key: this.cacheKey, csp: this.csp, inspection: this.inspection ?? null, browser_logs: this.browserLogs.slice(-50), producer_logs: this.producerLogs.slice(-50), files };
  }

  async close() {
    const { closeCaptureSession } = await import('@hyperframes/producer');
    for (const { session, out } of this.sessions.values()) { await closeCaptureSession(session).catch(() => {}); rmSync(out, { recursive: true, force: true }); }
    this.sessions.clear();
    this.server?.close();
    this.server = null;
    if (this.fresh && this.project) rmSync(this.project, { recursive: true, force: true });
  }
}
