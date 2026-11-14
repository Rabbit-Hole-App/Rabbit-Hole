// Brief 22 task 2 (owner-authorised ONE local browser measurement; no clone, no deploy): the per-frame cost in a real browser of a program card drawing N toss-look objects (boxes, lines, texts).
// It writes a throwaway harness page into packages/web, starts the repo's own Vite dev server on a local port, drives headless Chromium through Playwright (installed under C:/s/explain-layout-web),
// removes the page and stops the server it started. The harness takes each synthetic raw frame through the card's own path (normalizeFrame with the approved budget, then the shared Frame renderer
// in the interact look) and, for 60 scrub steps that move every object, records (a) normalize + validate, (b) React render and DOM commit (flushSync), (c) style and layout of the result
// (a forced layout read) and (d) the paint to the next animation frame. "Frame time" is a + b + c, the script work of one scrub step; d is reported beside it (vsync caps it near 16.7 ms).
//   node scripts/interact/frame-budget-browser.mjs [--counts 30,60,100,130,160] [--out <json>]
import { writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), WEB = join(REPO, 'packages', 'web'), PORT = 5199;
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? dflt : process.argv[i + 1]; };
const COUNTS = arg('counts', '30,60,100,130,160').split(',').map(Number), OUT = arg('out', null);
const HTML = join(WEB, 'frame-budget-harness.html'), JSX = join(WEB, 'frame-budget-harness.jsx');

writeFileSync(HTML, '<!doctype html><html><head><meta charset="utf-8"><title>frame budget</title></head><body style="margin:0;background:#fff"><div id="root" style="width:960px"></div><script type="module" src="/frame-budget-harness.jsx"></script></body></html>');
writeFileSync(JSX, `
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Frame } from './src/AnimatedScene.jsx';
import { normalizeFrame } from './src/explain-program/frame.js';
const root = createRoot(document.getElementById('root'));
const raw = (n, step) => {
  const objects = [];
  for (let i = 0; i < n; i++) {
    const k = i % 3, x = 20 + (i * 13) % 880, y = 30 + (i * 29) % 460, d = Math.sin(step / 4 + i) * 6;
    if (k === 0) objects.push({ kind: 'box', id: 'box.' + i, x, y: y + d, w: 36, h: 18, role: i % 2 ? 'input' : 'neutral', opacity: 1, rotation: 0 });
    else if (k === 1) objects.push({ kind: 'line', id: 'line.' + i, from: { x, y }, to: { x: x + 40, y: y + 12 + d }, role: 'neutral', opacity: 0.6 });
    else objects.push({ kind: 'text', id: 'text.' + i, x, y, text: 'n' + i, align: 'start', role: 'neutral', opacity: 1 });
  }
  return { width: 960, height: 540, objects, readouts: [] };
};
const raf = () => new Promise(resolve => requestAnimationFrame(resolve));
window.__measure = async (n, steps) => {
  const manifest = { readouts: [], frameObjects: Math.max(60, n) }, rows = [];
  for (let step = 0; step < steps + 5; step++) {
    const t0 = performance.now();
    const view = normalizeFrame(raw(n, step), manifest);
    if (!view.ok) return { error: view.issue };
    const t1 = performance.now();
    flushSync(() => root.render(<Frame interact scene={view.scene} state={view.state} selecting={false} marked={null} picked={null} pop={{ duration: 0 }} fixedView onPick={() => {}} onRegion={() => {}} />));
    const t2 = performance.now();
    document.getElementById('root').getBoundingClientRect(); document.querySelector('svg')?.getBBox?.();
    const t3 = performance.now();
    await raf();
    const t4 = performance.now();
    if (step >= 5) rows.push({ normalize: t1 - t0, render: t2 - t1, layout: t3 - t2, toNextFrame: t4 - t3 });
  }
  return { rows, nodes: document.querySelectorAll('svg *').length };
};
window.__ready = true;
`);

const require = createRequire('C:/s/explain-layout-web/package.json');
const { chromium } = require('playwright');
const vite = spawn(process.execPath, [join(REPO, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: WEB, stdio: ['ignore', 'pipe', 'pipe'] });
let serverUp = false;
vite.stdout.on('data', d => { if (String(d).includes('Local')) serverUp = true; });
vite.stderr.on('data', () => {});
const stats = values => { const sorted = [...values].sort((a, b) => a - b); const mean = values.reduce((a, b) => a + b, 0) / values.length; return { mean: +mean.toFixed(2), median: +sorted[Math.floor(sorted.length / 2)].toFixed(2), p95: +sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))].toFixed(2), max: +sorted.at(-1).toFixed(2) }; };
let browser;
try {
  for (let i = 0; i < 120 && !serverUp; i++) await new Promise(r => setTimeout(r, 500));
  if (!serverUp) throw new Error('the Vite server did not start');
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  page.on('pageerror', e => console.log('page error:', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/frame-budget-harness.html`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const table = [];
  for (const n of COUNTS) {
    const result = await page.evaluate(count => window.__measure(count, 60), n);
    if (result.error) { table.push({ objects: n, error: result.error }); continue; }
    const col = key => stats(result.rows.map(r => r[key])), total = stats(result.rows.map(r => r.normalize + r.render + r.layout));
    table.push({ objects: n, svgNodes: result.nodes, frameMs: total, normalizeMs: col('normalize').mean, renderMs: col('render').mean, layoutMs: col('layout').mean, toNextFrameMs: col('toNextFrame').mean });
  }
  console.log(JSON.stringify(table, null, 1));
  if (OUT) writeFileSync(OUT, JSON.stringify(table, null, 2));
} finally {
  await browser?.close().catch(() => {});
  vite.kill();
  rmSync(HTML, { force: true }); rmSync(JSX, { force: true });
}
