// RemotionRenderer: the V1 MotionRenderer adapter (spec §9.4) over packages/learn-render.
// A render job is {id, dir, brief, storyboard, source}: the MotionJob fields rendering
// needs, the validated composition source, and a scratch directory for its files.
// No model calls, no credentials: this side only ever sees one job's source and assets.
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGE, validateBrief, validateStoryboard } from './contracts.js';
import { PROBE_PREFIX } from './render-coverage.js';
import { CSP, FONT_PINS, MotionRendererBase, checkFontPins, chromeVersion, pixelHash } from './renderer-common.mjs';
import { IMPORTS, checkComposition } from './static-check.js';
// M7B: the shared helpers moved to renderer-common.mjs; their names stay importable from here.
export { CSP, FONT_PINS, NONBLANK_MIN_LUMA_STDDEV, OUTPUT_MAX_BYTES, RENDERER_METHODS, beatAt, chromeVersion, contactFrames, decodeFrames, ffmpegVersion, finalChecks, lumaStddev, nonblankCheck, pixelHash, probe } from './renderer-common.mjs';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(PKG, '..', '..');
const version = name => JSON.parse(readFileSync(join(ROOT, 'node_modules', name, 'package.json'), 'utf8')).version;

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

export class RemotionRenderer extends MotionRendererBase {
  // cacheDir holds content-addressed bundles, previews and finals; fresh: true bypasses every cache
  // (the determinism check's "fresh context"). csp: false exists only for the network probe's control run.
  // inputProps reach the harness root only (src/motion/index.jsx): {probe: true} for the Author proof.
  constructor({ cacheDir = join(PKG, 'out', 'motion-cache'), fresh = false, csp = true, log = () => {}, inputProps = null } = {}) {
    super();
    Object.assign(this, { name: 'remotion', cacheDir, fresh, csp, log, inputProps, timings: {}, browserLogs: [] });
    this.version = `remotion@${version('remotion')}`;
  }

  validateSource(brief, storyboard, source) {
    const briefErrors = validateBrief(brief);
    if (briefErrors.length) return briefErrors;
    return [...validateStoryboard(storyboard, brief), ...checkComposition(source, { durationSeconds: brief.duration.seconds })];
  }

  key(job) {
    const h = createHash('sha256').update(this.version).update(job.source).update(String(this.csp));
    for (const f of ['src/motion/index.jsx', 'src/motion/fonts.jsx', 'src/motion/probe.jsx', 'src/motion/probe-dom.js', 'motion/remotion-renderer.mjs', 'motion/renderer-common.mjs', 'motion/static-check.js']) h.update(readFileSync(join(PKG, f)));
    for (const [f, pin] of Object.entries(FONT_PINS)) h.update(f).update(pin);
    return h.digest('hex').slice(0, 20);
  }

  async prepare(job) {
    if (this.serveUrl) return;
    checkFontPins();
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

  collectDiagnostics(job) {
    const files = existsSync(job.dir) ? readdirSync(job.dir).filter(f => statSync(join(job.dir, f)).isFile()).map(f => ({ file: f, bytes: statSync(join(job.dir, f)).size })) : [];
    return { renderer: this.version, chrome: chromeVersion(), timings: this.timings, cache_key: this.cacheKey, csp: this.csp, browser_logs: this.browserLogs.slice(-50), files };
  }

  // The coverage probe (render-coverage.js): src/motion/probe.jsx in a second renderer on the same
  // source, logging one MOTION_PROBE line per still. Moved here from service/child.mjs (M7B), so
  // each renderer probes its own pages.
  async probeFrames(job, frames, { scale = 0.25, dir = join(job.dir, 'probe') } = {}) {
    const observations = [];
    const prober = new RemotionRenderer({
      cacheDir: this.cacheDir, inputProps: { probe: true },
      log: l => { if (l.text?.startsWith(PROBE_PREFIX)) observations.push(JSON.parse(l.text.slice(PROBE_PREFIX.length))); },
    });
    try { await prober.renderStills({ ...job, dir: join(job.dir, 'job-probe') }, frames, { scale, dir }); }
    finally { await prober.close(); }
    return { observations, timings: prober.timings };
  }

  async close() { const b = this.browser; this.browser = null; await b?.close({ silent: true }); }
}
