// Motion M1 render harness (spec §26 M1). No model calls: renders the hand-written Demo A
// composition and proves the deterministic render contract (§8, §11).
//   node scripts/motion.mjs prove [outDir]           every M1 proof -> <outDir>/report.json
//   node scripts/motion.mjs still <jobDir> <f,f,..>  stills from a fresh bundle + fresh browser (determinism child)
//   node scripts/motion.mjs net-probe [outDir]       runtime network denial, with and without the CSP
//   node scripts/motion.mjs net-denied               exits 0 only if an outbound request fails (Linux namespace check)
// Windows renders are authoring evidence only (§10.3); acceptance renders run in Linux (motion/linux/).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { durationDecision } from '../motion/duration.js';
import { CSP, RemotionRenderer, chromeVersion, ffmpegVersion, probe } from '../motion/remotion-renderer.mjs';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(PKG, '..', '..');
const FIX = join(PKG, 'motion', 'fixtures', 'demo-a');
const json = f => JSON.parse(readFileSync(f, 'utf8'));
const demoJob = dir => ({ id: 'demo-a1', dir, brief: json(join(FIX, 'brief.json')), storyboard: json(join(FIX, 'storyboard.json')), source: readFileSync(join(FIX, 'composition.jsx'), 'utf8') });
const secs = t0 => +((performance.now() - t0) / 1000).toFixed(2);
const [cmd, ...args] = process.argv.slice(2);

// A deliberately unvalidated composition: it tries the network every way it can and logs
// what happened. Static validation rejects it; this checks the runtime layer on its own.
const PROBE = `import { AbsoluteFill, continueRender, delayRender } from 'remotion';
import { useEffect, useState } from 'react';
export const stage = { width: 1920, height: 1080, fps: 30, durationInFrames: 150 };
const OUT = 'http://example.com/';
const wait = p => Promise.race([p, new Promise(r => setTimeout(() => r('timeout'), 8000))]);
const ev = make => wait(new Promise(r => { try { make(r); } catch (e) { r('threw: ' + e.name); } }));
export default function Probe() {
  const [h] = useState(() => delayRender('net probe'));
  useEffect(() => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective + ' ' + e.blockedURI));
    Promise.all([
      wait(fetch(OUT, { mode: 'no-cors' }).then(r => 'reached (' + r.type + ')', e => 'failed: ' + e.message)),
      ev(r => { const x = new XMLHttpRequest(); x.onload = () => r('reached ' + x.status); x.onerror = () => r('failed'); x.open('GET', OUT); x.send(); }),
      ev(r => { const w = new WebSocket('ws://example.com/'); w.onopen = () => r('reached'); w.onerror = () => r('failed'); }),
      ev(r => { const i = new Image(); i.onload = () => r('reached'); i.onerror = () => r('failed'); i.src = OUT + 'probe.png'; }),
      wait(fetch('http://127.0.0.1:59999/', { mode: 'no-cors' }).then(r => 'reached', e => 'failed: ' + e.message)),
      ev(r => r(navigator.sendBeacon(OUT, 'x') ? 'queued' : 'refused')),
      wait(fetch('/index.html').then(r => 'reached ' + r.status, e => 'failed: ' + e.message)),
    ]).then(([fetchOut, xhr, websocket, image, loopbackOtherPort, beacon, ownOrigin]) => {
      setTimeout(() => {
        console.log('MOTION_NET_PROBE ' + JSON.stringify({ fetchOut, xhr, websocket, image, loopbackOtherPort, beacon, ownOrigin, violations }));
        continueRender(h);
      }, 300);
    });
  }, []);
  return <AbsoluteFill style={{ backgroundColor: 'white' }} />;
}
`;

async function netProbe(out) {
  const brief = { duration: { seconds: 5 } };
  const host = await fetch('http://example.com/', { method: 'HEAD' }).then(r => `reached ${r.status}`, e => `failed: ${e.message}`);
  const result = { host_control: host, runs: {} };
  for (const csp of [true, false]) {
    const r = new RemotionRenderer({ fresh: true, csp });
    let line = null;
    r.log = l => { if (l.text.startsWith('MOTION_NET_PROBE ')) line = JSON.parse(l.text.slice(17)); };
    try { await r.renderStills({ id: 'net-probe', dir: join(out, `net-probe-${csp ? 'csp' : 'no-csp'}`), brief, source: PROBE }, [0]); }
    finally { await r.close(); }
    result.runs[csp ? 'with_csp' : 'without_csp_control'] = line;
  }
  return result;
}

// A composition that skips static validation and imports a real, installed, non-allowlisted
// package: the bundle-time allowlist must refuse it.
async function allowlistProbe(out) {
  const results = {};
  for (const mod of ['roughjs', 'node:fs']) {
    const source = `import x from '${mod}';\nexport const stage = { width: 1920, height: 1080, fps: 30, durationInFrames: 150 };\nexport default function P() { return String(!!x); }\n`;
    const r = new RemotionRenderer({ fresh: true });
    try { await r.renderStills({ id: 'allowlist', dir: join(out, `allowlist-${mod.replace(/\W/g, '')}`), brief: { duration: { seconds: 5 } }, source }, [0]); results[mod] = 'BUNDLED (allowlist not enforced)'; }
    catch (e) { results[mod] = (e.message.match(/motion: the composition imports[^\n]*/) || [e.message.split('\n')[0]])[0]; }
    finally { await r.close(); }
  }
  return results;
}

function dependencies() {
  const pkg = name => { const p = json(join(ROOT, 'node_modules', name, 'package.json')); return `${p.version} (${p.license && !/^SEE LICENSE/.test(p.license) ? p.license : 'Remotion License, LICENSE.md'})`; };
  const comp = `@remotion/compositor-${platform()}-${arch()}${platform() === 'win32' ? '-msvc' : platform() === 'linux' ? '-gnu' : ''}`;
  return {
    remotion: pkg('remotion'), '@remotion/bundler': pkg('@remotion/bundler'), '@remotion/renderer': pkg('@remotion/renderer'), '@remotion/cli': pkg('@remotion/cli'),
    [comp]: (() => { try { return pkg(comp); } catch { return 'not installed'; } })(),
    react: pkg('react'), 'react-dom': pkg('react-dom'), pngjs: pkg('pngjs'), '@babel/parser': pkg('@babel/parser'), esbuild: pkg('esbuild'), webpack: pkg('webpack'),
    'chrome-headless-shell': `${chromeVersion()} (Chrome for Testing, downloaded by Remotion)`,
    fonts: 'Inter 4.001 (OFL-1.1), Virgil 1.001 (OFL-1.1); assets/fonts, sha256-pinned',
  };
}

if (cmd === 'still') {
  const [dir, frames] = args;
  const r = new RemotionRenderer({ fresh: true });
  const stills = await r.renderStills(demoJob(resolve(dir)), frames.split(',').map(Number));
  await r.close();
  console.log(JSON.stringify({ pid: process.pid, bundle: r.serveUrl, stills: stills.map(({ frame, pixels_sha256 }) => ({ frame, pixels_sha256 })) }));
  process.exit(0);
}

if (cmd === 'net-denied') {
  const denied = await fetch('http://example.com/', { signal: AbortSignal.timeout(10000) }).then(() => null, e => e.cause?.code || e.message);
  console.log(denied ? `✓ network denied in the render namespace: ${denied}` : '✗ network reachable from the render namespace');
  process.exit(denied ? 0 : 1);
}

if (cmd === 'net-probe') {
  const out = resolve(args[0] || join(PKG, 'out', 'motion', 'net-probe'));
  console.log(JSON.stringify(await netProbe(out), null, 2));
  process.exit(0);
}

if (cmd === 'prove') {
  const out = resolve(args[0] || join(PKG, 'out', 'motion', 'demo-a'));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const report = { at: new Date().toISOString(), host: { platform: platform(), release: release(), arch: arch(), cpus: cpus().length, node: process.version }, decisions: [] };
  const say = line => { console.log(line); report.decisions.push(line); };
  const job = demoJob(join(out, 'job'));

  const errors = new RemotionRenderer().validateSource(job.brief, job.storyboard, job.source);
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  say(`✓ source: brief, storyboard and composition pass static validation (${job.source.length} bytes)`);
  say(durationDecision(job.brief.raw_user_request).line);

  // Cold: empty caches, fresh bundle. Cached: the same job again against the warm cache.
  const cacheDir = join(out, 'cache');
  const runs = {};
  for (const [name, dir] of [['cold', 'job'], ['cached', 'job-cached']]) {
    const j = demoJob(join(out, dir)), r = new RemotionRenderer({ cacheDir });
    const t0 = performance.now();
    const preview = await r.renderPreview(j);
    const sheet = await r.contactSheet(j);
    const final = await r.renderFinal(j);
    const validation = await r.validateFinal(j);
    runs[name] = { preview, sheet, final, validation, diagnostics: { ...r.collectDiagnostics(j), total: secs(t0) } };
    await r.close();
  }
  report.timings = { cold: runs.cold.diagnostics.timings, cold_total: runs.cold.diagnostics.total, cached: runs.cached.diagnostics.timings, cached_total: runs.cached.diagnostics.total, cached_hits: { preview: runs.cached.preview.cached, final: runs.cached.final.cached } };
  const { v: pv, duration: pd, size: ps } = await probe(join(out, 'job', 'preview.mp4'));
  report.preview = { file: join(out, 'job', 'preview.mp4'), width: pv.width, height: pv.height, fps: pv.r_frame_rate, frames: Number(pv.nb_read_frames), duration: pd, bytes: ps, scale: job.brief.output_requirements.preview_scale };
  say(`✓ preview: ${pv.width}x${pv.height} ${pv.r_frame_rate} fps, ${pv.nb_read_frames} frames: the same composition at output scale ${job.brief.output_requirements.preview_scale}`);
  report.contact_sheet = { file: runs.cold.sheet.file, tiles: runs.cold.sheet.manifest };
  say(`✓ contact sheet: ${runs.cold.sheet.manifest.length} stills -> ${runs.cold.sheet.file}`);
  report.final_validation = runs.cold.validation;
  say(`${runs.cold.validation.ok ? '✓' : '✗'} final: ${runs.cold.validation.checks.map(c => `${c.name} ${c.ok ? 'ok' : 'FAIL'}`).join(', ')}`);

  // §8.3: the same frames in two fresh contexts (separate processes, fresh bundles, fresh browsers).
  const frames = [0, 150, 270, 360, 449];
  const fresh = [1, 2].map(n => {
    const t0 = performance.now();
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'still', join(out, `fresh-${n}`), frames.join(',')], { cwd: PKG, encoding: 'utf8' });
    if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
    return { ...JSON.parse(r.stdout.trim().split('\n').at(-1)), seconds: secs(t0) };
  });
  const same = frames.every((_, i) => fresh[0].stills[i].pixels_sha256 === fresh[1].stills[i].pixels_sha256);
  report.determinism = { method: 'renderStill PNG, sha256 of decoded RGBA, two child processes each with a fresh bundle and a fresh browser', identical: same, contexts: fresh };
  say(`${same ? '✓' : '✗'} determinism: ${frames.length} frames identical across two fresh contexts (pids ${fresh[0].pid}, ${fresh[1].pid})`);

  report.network = await netProbe(out);
  report.network.csp = CSP;
  const blocked = report.network.runs.with_csp;
  say(`✓ network: with the CSP every non-self request failed (${blocked?.violations?.length} violations); own origin ${blocked?.ownOrigin}; host control ${report.network.host_control}`);
  report.import_allowlist_at_bundle = await allowlistProbe(out);
  say(`✓ bundle-time allowlist: ${Object.entries(report.import_allowlist_at_bundle).map(([k, v]) => `${k} -> ${/not on the allowlist/.test(v) ? 'refused' : v}`).join(', ')}`);
  report.dependencies = { ...dependencies(), ffmpeg: await ffmpegVersion() };
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`✓ report: ${join(out, 'report.json')}`);
  process.exit(runs.cold.validation.ok && same ? 0 : 1);
}

console.error('usage: node scripts/motion.mjs prove [outDir] | still <jobDir> <frames> | net-probe [outDir] | net-denied');
process.exit(2);
