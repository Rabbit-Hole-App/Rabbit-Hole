// The render child: one already-validated job, run inside the sandbox (motion-sandbox: its own
// user, no network, a private /tmp, the service's files hidden, the renderer read-only). It gets
// no secrets and no options; everything comes from <jobDir>/job.json, written by the service
// after validation. It writes <jobDir>/out/{result.json, final.mp4, preview.mp4,
// contact-sheet.png, poster.png} (a preview job, M6: result.json, preview.mp4, contact-sheet.png)
// and exits 0. A non-zero exit means the child itself crashed.
//
//   node motion/service/child.mjs <jobDir>
import { RenderInternals } from '@remotion/renderer';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { STAGE } from '../contracts.js';
import { HF_NET_PROBE, NET_PROBE, NET_PROBE_PREFIX } from '../probes.js';
import { RemotionRenderer } from '../remotion-renderer.mjs';
import { compactProbe, coverageFrames, determinismFrames } from '../render-coverage.js';
import { chromeVersion, contactFrames, ffmpegVersion, probe } from '../renderer-common.mjs';
import { rendererClass } from '../renderers.mjs';
import { selfLimits, unlimited } from './resource-control.mjs';
import { runPhaseProcess, runResourceProbe } from './stress-probe.mjs';

// Preview vs final (§11.3): the final frame downscaled to preview size against the preview frame.
// M5 keeps 6: Windows authoring renders of four Author-contract compositions measured 1.27-2.10
// (the Demo A authoring renders set it first). The Linux values come with Home's Fly proof.
export const PREVIEW_FINAL_MAX_MEAN_DIFF = 6;

const dir = resolve(process.argv[2] || '');
const out = join(dir, 'out');
mkdirSync(out, { recursive: true });
const job = JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'motion-work-'));
const write = result => writeFileSync(join(out, 'result.json'), JSON.stringify({ render_id: job.render_id, ...result }, null, 2));
const t0 = performance.now();
const ffmpeg = (bin, args) => RenderInternals.callFf({ bin, args, indent: false, logLevel: 'error', binariesDirectory: null });

// The child reports what it can see, every job. Inside the Linux sandbox it refuses to render
// when the boundary is not there: network reachable, root, the service's files visible, or a
// writable renderer.
async function sandboxReport() {
  const report = { mode: process.env.MOTION_SANDBOX || 'unknown', env_keys: Object.keys(process.env).sort() };
  if (process.getuid) Object.assign(report, { uid: process.getuid(), gid: process.getgid(), groups: process.getgroups() });
  if (report.mode !== 'linux') return report;
  report.network = await fetch('http://example.com/', { signal: AbortSignal.timeout(5000) }).then(() => 'reachable', e => `denied: ${e.cause?.code || e.message}`);
  const seen = p => { try { return readdirSync(p).length ? 'VISIBLE' : 'empty'; } catch (e) { return e.code; } };
  report.hidden = Object.fromEntries(['/var/motion', '/home', '/root', '/.fly'].map(p => [p, seen(p)]));
  report.processes = readdirSync('/proc').filter(n => /^\d+$/.test(n)).length;
  report.renderer_write = (() => { try { writeFileSync('/app/.motion-probe', 'x'); return 'WRITABLE'; } catch (e) { return e.code; } })();
  const { report: limits, cpuStat, pidsCurrent } = selfLimits();
  report.limits = { ...limits, ...rlimits() };
  cpuStatPath = cpuStat;
  pidsCurrentPath = pidsCurrent;
  const l = report.limits;
  report.breach = [
    report.network === 'reachable' && 'network reachable',
    report.uid === 0 && 'running as root',
    Object.entries(report.hidden).filter(([, v]) => v === 'VISIBLE').map(([p]) => `${p} visible`).join(', '),
    report.renderer_write === 'WRITABLE' && 'renderer writable',
    report.env_keys.some(k => /TOKEN|SECRET|KEY|PASSWORD|FLY_/i.test(k)) && 'service environment inherited',
    !l.backend && `no resource backend (${l.reason})`,
    !/^\/motion\/[0-9a-f]{32}$/.test(l.group || '') && 'not in one job group for every controller',
    [l.memory_bytes, l.pids_max].some(unlimited) && 'memory or task count unlimited',
    l.swap_bytes !== 0 && 'swap allowance above the memory limit',
    !(l.cpu_quota > 0) && 'CPU unlimited',
    (!l.rlimit_nproc || l.rlimit_nproc === 'unlimited') && 'RLIMIT_NPROC unlimited',
  ].filter(Boolean);
  return report;
}
let cpuStatPath = null, pidsCurrentPath = null;

// The rlimits sandbox-init set, read from the kernel (the cgroup limits come from selfLimits).
function rlimits() {
  const limits = readFileSync('/proc/self/limits', 'utf8');
  const soft = name => limits.match(new RegExp(`^${name}\\s+(\\S+)`, 'm'))?.[1] ?? null;
  return { rlimit_nproc: soft('Max processes'), rlimit_fsize: soft('Max file size'), rlimit_nofile: soft('Max open files') };
}

const readPng = f => PNG.sync.read(readFileSync(f));
// Area-average resample: each target pixel is the mean of the source pixels it covers.
function downscale(src, w, h) {
  const dst = new Uint8Array(w * h * 4), sx = src.width / w, sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const sum = [0, 0, 0];
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) for (let c = 0; c < 3; c++) sum[c] += src.data[(yy * src.width + xx) * 4 + c];
      const n = (y1 - y0) * (x1 - x0);
      for (let c = 0; c < 3; c++) dst[(y * w + x) * 4 + c] = Math.round(sum[c] / n);
    }
  }
  return dst;
}
function meanAbsDiff(a, b, pixels) {
  let total = 0;
  for (let i = 0; i < pixels * 4; i += 4) for (let c = 0; c < 3; c++) total += Math.abs(a[i + c] - b[i + c]);
  return total / (pixels * 3);
}

async function comparePreviewFinal(j, frames) {
  const dirOut = join(work, 'preview-frames');
  mkdirSync(dirOut, { recursive: true });
  const rows = [];
  for (const n of frames) {
    const p = join(dirOut, `frame-${String(n).padStart(4, '0')}.png`);
    await ffmpeg('ffmpeg', ['-v', 'error', '-ss', Math.max(0, (n - 0.25) / STAGE.fps).toFixed(4), '-i', join(j.dir, 'preview.mp4'), '-frames:v', '1', '-y', p]);
    const preview = readPng(p), final = readPng(join(j.dir, 'final-frames', `frame-${String(n).padStart(4, '0')}.png`));
    rows.push({ frame: n, mean_abs_diff: +meanAbsDiff(downscale(final, preview.width, preview.height), preview.data, preview.width * preview.height).toFixed(3) });
  }
  const max = Math.max(...rows.map(r => r.mean_abs_diff));
  return { method: 'final frame area-downscaled to preview size vs the preview frame, mean |RGB difference| (0-255)', threshold: PREVIEW_FINAL_MAX_MEAN_DIFF, max, ok: max <= PREVIEW_FINAL_MAX_MEAN_DIFF, frames: rows };
}

// Proof-only (Linux service tests): the network probe composition, with the page CSP off so
// only the OS boundary is left. Reachable only by writing job.json directly, never over HTTP.
// M7B: job.renderer "hyperframes" runs the same attempts from a HyperFrames page
// (probes.js HF_NET_PROBE); job.csp true keeps the page CSP on (the authoring-host proof).
async function networkProbe(sandbox) {
  const csp = job.csp === true;
  if (job.renderer === 'hyperframes') {
    const { HyperFramesRenderer } = await import('../hyperframes-renderer.mjs');
    const r = new HyperFramesRenderer({ fresh: true, csp });
    let browser = null;
    try {
      await r.renderStills({ id: 'net-probe', dir: join(work, 'probe'), brief: { duration: { seconds: 5 } }, source: HF_NET_PROBE }, [0]);
      for (let i = 0; i < 100 && !browser; i++) {
        const line = r.browserLogs.find(l => l.includes(NET_PROBE_PREFIX));
        if (line) browser = JSON.parse(line.slice(line.indexOf(NET_PROBE_PREFIX) + NET_PROBE_PREFIX.length));
        else await new Promise(done => setTimeout(done, 200));
      }
    } finally { await r.close(); }
    return write({ status: 'probe', probe: { browser, csp, renderer: 'hyperframes' }, sandbox });
  }
  const r = new RemotionRenderer({ fresh: true, csp });
  let browser = null;
  r.log = l => { if (l.text.startsWith(NET_PROBE_PREFIX)) browser = JSON.parse(l.text.slice(NET_PROBE_PREFIX.length)); };
  try { await r.renderStills({ id: 'net-probe', dir: join(work, 'probe'), brief: { duration: { seconds: 5 } }, source: NET_PROBE }, [0]); }
  finally { await r.close(); }
  write({ status: 'probe', probe: { browser, csp }, sandbox });
}

// Proof-only (Linux service tests): stress each kernel limit in its own subprocess, settling
// the job's task count between phases (stress-probe.mjs). A probe failure is a result, not a crash.
async function resourceProbe(sandbox) {
  const readKeyed = file => Object.fromEntries(readFileSync(file, 'utf8').trim().split(/\r?\n/).map(l => l.split(' ')).map(([k, v]) => [k, Number(v)]));
  try {
    const probe = await runResourceProbe({
      runPhase: runPhaseProcess,
      pidsCurrent: () => { try { return Number(readFileSync(pidsCurrentPath, 'utf8').trim()); } catch { return null; } },
      cpuStat: () => readKeyed(cpuStatPath),
    });
    write({ status: 'probe', sandbox, probe });
  } catch (error) {
    write({ status: 'failed', error: 'probe_failed', detail: error.message, sandbox });
  }
}

// Beat and transition coverage (render-coverage.js): the harness probe (src/motion/probe-dom.js) on
// the same source through the job's own renderer, at a quarter scale. The orchestrator judges the
// observations against the storyboard.
async function coverageProbe(r, j) {
  const sample = coverageFrames(j.storyboard);
  const mids = new Set(sample.filter(s => s.roles.includes('mid')).map(s => s.frame));
  const { observations, timings } = await r.probeFrames(j, sample.map(s => s.frame), { scale: 0.25, dir: join(work, 'probe') });
  const how = r.name === 'hyperframes' ? 'probe-dom.js evaluated in the HyperFrames page after each seek' : 'harness probe (src/motion/probe.jsx)';
  return { coverage: { method: `${how} at each beat start, start + 1, middle and end - 1, a quarter scale; text kept at beat middles`, frames: sample, observations: observations.map(p => compactProbe(p, mids.has(p.frame))) }, timings };
}

// M6 (spec §11.1): the preview and the contact sheet only, for the review pass. They are review
// material, never a deliverable, so the caller gets them whatever they show; the caller judges
// blank frames on the decoded preview and the reviewers judge the rest. M7A: the coverage probe
// too, so a storyboard object missing from its beat is found while the repair round can fix it.
async function previewJob(r, j, sandbox, firstLine) {
  let preview, sheet, probed;
  try {
    preview = await r.renderPreview(j);
    sheet = await r.contactSheet(j);
    probed = await coverageProbe(r, j);
  } catch (error) {
    return write({ status: 'failed', error: 'runtime_error', detail: firstLine(error), sandbox });
  }
  for (const [from, to] of [[preview.file, 'preview.mp4'], [sheet.file, 'contact-sheet.png']]) copyFileSync(from, join(out, to));
  const { v: pv, size: psize } = await probe(join(out, 'preview.mp4'));
  write({
    status: 'ready', stage: 'preview',
    preview: { width: pv.width, height: pv.height, frame_count: Number(pv.nb_read_frames), bytes: psize, scale: j.brief.output_requirements.preview_scale },
    contact_sheet: sheet.manifest, coverage: probed.coverage, sandbox, fonts: r.browserLogs.find(l => l.includes('MOTION_FONTS')) || null,
    timings: { ...r.timings, coverage_probe: probed.timings, total: +((performance.now() - t0) / 1000).toFixed(2) },
    renderer: { name: r.name, version: r.version, chrome: chromeVersion(), ffmpeg: await ffmpegVersion() },
  });
}

async function main() {
  const sandbox = await sandboxReport();
  if (sandbox.breach?.length) return write({ status: 'failed', error: 'sandbox_breach', detail: sandbox.breach.join('; '), sandbox });
  if (job.probe === 'network') return networkProbe(sandbox);
  if (job.probe === 'resources') return resourceProbe(sandbox);

  const j = { id: job.render_id, dir: join(work, 'job'), brief: job.brief, storyboard: job.storyboard, source: job.composition.source };
  // M7B: the job names its renderer (server.mjs wrote it after validation); Remotion by default.
  const Renderer = await rendererClass(job.renderer || 'remotion');
  const r = new Renderer({ cacheDir: join(work, 'cache') });
  const errors = r.validateSource(j.brief, j.storyboard, j.source, { compositionId: job.composition.composition_id });
  if (errors.length) return write({ status: 'failed', error: 'invalid_job', errors, sandbox });
  // M5 failure categories: compile_failed (the composition did not bundle or load), runtime_error
  // (a frame threw while rendering); anything after rendering is the renderer's own failure.
  const firstLine = error => String(error?.message || error).split('\n')[0].slice(0, 500);
  let second;
  try {
    try { await r.prepare(j); }
    catch (error) { return write({ status: 'failed', error: 'compile_failed', detail: firstLine(error), sandbox }); }
    if (job.stage === 'preview') return await previewJob(r, j, sandbox, firstLine);
    const frames = determinismFrames(j.brief, j.storyboard);
    let preview, sheet, a, b, probed;
    try {
      preview = await r.renderPreview(j);
      sheet = await r.contactSheet(j);
      await r.renderFinal(j);
      // §8.3: the same frames from a second fresh context (its own bundle and browser).
      a = await r.renderStills(j, frames, { scale: 1, dir: join(work, 'det-1') });
      second = new Renderer({ fresh: true });
      b = await second.renderStills({ ...j, dir: join(work, 'job-2') }, frames, { scale: 1, dir: join(work, 'det-2') });
      await second.close();
      probed = await coverageProbe(r, j);
    } catch (error) {
      return write({ status: 'failed', error: 'runtime_error', detail: firstLine(error), sandbox });
    }
    const validation = await r.validateFinal(j);
    const determinism = { method: r.name === 'hyperframes' ? 'HyperFrames capture PNG, sha256 of decoded RGBA, two fresh contexts (separate project, server and browser)' : 'renderStill PNG, sha256 of decoded RGBA, two fresh contexts (separate bundle and browser)', identical: frames.every((_, i) => a[i].pixels_sha256 === b[i].pixels_sha256), frames: frames.map((f, i) => ({ frame: f, hashes: [a[i].pixels_sha256, b[i].pixels_sha256] })) };
    const { coverage } = probed;
    const comparison = await comparePreviewFinal(j, contactFrames(j.brief, j.storyboard));

    for (const [from, to] of [[join(j.dir, 'final.mp4'), 'final.mp4'], [preview.file, 'preview.mp4'], [sheet.file, 'contact-sheet.png'], [a.at(-1).file, 'poster.png']]) copyFileSync(from, join(out, to));
    const { v, size } = await probe(join(out, 'final.mp4'));
    const { v: pv, size: psize } = await probe(join(out, 'preview.mp4'));
    const failed = !validation.ok ? ['final_validation_failed', validation.checks.filter(c => !c.ok).map(c => `${c.name}: ${c.detail}`).join('; ')]
      : !determinism.identical ? ['nondeterministic', 'the same frames differ between two fresh render contexts']
      : !comparison.ok ? ['preview_final_mismatch', `final vs preview mean difference ${comparison.max} > ${comparison.threshold}`] : null;
    write({
      status: failed ? 'failed' : 'ready', ...(failed ? { error: failed[0], detail: failed[1] } : {}),
      duration_seconds: Number(v.duration), fps: STAGE.fps, width: v.width, height: v.height, frame_count: Number(v.nb_read_frames), output_bytes: size,
      final_validation: validation, determinism, preview: { width: pv.width, height: pv.height, frame_count: Number(pv.nb_read_frames), bytes: psize, scale: j.brief.output_requirements.preview_scale },
      preview_final_comparison: comparison, contact_sheet: sheet.manifest, coverage, sandbox,
      // The stage logs which bundled faces loaded (src/motion); proof that no system font stood in.
      fonts: r.browserLogs.find(l => l.includes('MOTION_FONTS')) || null,
      timings: { ...r.timings, determinism_second_context: second.timings, coverage_probe: probed.timings, total: +((performance.now() - t0) / 1000).toFixed(2) },
      renderer: { name: r.name, version: r.version, chrome: chromeVersion(), ffmpeg: await ffmpegVersion() },
    });
  } finally {
    await r.close();
    await second?.close();
  }
}

try {
  await main();
} catch (error) {
  write({ status: 'failed', error: 'renderer_failure', detail: String(error?.message || error).split('\n')[0].slice(0, 500) });
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(existsSync(join(out, 'result.json')) ? 0 : 1);
