// Re-renders every committed viz-benchmarks generated/latest/static-00.png through the production render entry
// (renderStates over a fresh local build of THIS tree, Playwright Chromium) and writes each fingerprint right after
// its real render, as render-fingerprint.mjs requires. Run it on the exact candidate whose renderer files changed.
//   cd packages/web && node render/rerender-statics.mjs [--no-build]
// Builds into dist-render first so the pixels come from the same source the fingerprint hashes.
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rerenderAll } from '../e2e/rerender-benchmarks.mjs';
import { writeFingerprint } from '../scripts/render-fingerprint.mjs';
import { captureScene } from '../e2e/viz-benchmark-capture.mjs';

const WEB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(WEB_ROOT, 'dist-render');
if (!process.argv.includes('--no-build')) execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '--', '--outDir', 'dist-render'], { cwd: WEB_ROOT, stdio: 'inherit', shell: process.platform === 'win32' });

// rerenderAll's render step is synchronous, so collect the work first and render each case before fingerprinting it.
const jobs = [];
rerenderAll({ root: realpathSync(join(WEB_ROOT, '..', '..')), render: (spec, png) => jobs.push({ spec, png }), fingerprint: () => {}, log: () => {} });
for (const { spec, png } of jobs) {
  const raw = JSON.parse(readFileSync(spec, 'utf8'));
  const scene = raw.block?.scene || (raw.scene && Array.isArray(raw.scene.objects) ? raw.scene : raw);
  const out = await captureScene(scene, [{ id: 'static' }], { dist }); // the scene's own size, end time, light theme, dpr 2
  writeFileSync(png, out.captures[0].png);
  writeFingerprint(dirname(png), WEB_ROOT);
  console.log(`rendered + fingerprinted ${dirname(png)}`);
}
console.log(`${jobs.length} static render(s) refreshed`);
