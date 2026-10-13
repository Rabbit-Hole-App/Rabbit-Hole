import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { treeBoard, flowBoard } from '../src/inline-ai-fixtures.js';

// The A3 benchmark, MOCKED provider (docs/features/inline-ai-editor.md A3, A5): the real canvas and editor in the Vite
// harness, the scripted transport's fixed latencies (first chunk 200 ms, 35 ms per word, routing 120 ms) - so its
// provider stages measure this code, never a model. Browser responsiveness and the local stages are real measurements.
// Every request's row goes through the real writer (/api/learn/inline/telemetry on a LOCAL stack) tagged source
// benchmark, run_id, sha and fixture; e2e/inline-ai-report.mjs computes the tables from those rows.
// usage: node e2e/inline-ai-bench.mjs --runs 20 --base http://127.0.0.1:8893 --cp http://127.0.0.1:8894 --vars <cp .dev.vars> --app <canvas name>
const arg = (name, fallback = null) => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : fallback; };
const HARNESS = process.env.HARNESS || 'http://127.0.0.1:5397/e2e/inline-ai-harness.html';
const RUNS = Number(arg('runs', 20)), BASE = arg('base'), CP = arg('cp'), APP = arg('app');
const SHA = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const RUN = `bench-mocked-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
const both = () => { const tree = treeBoard(), flow = flowBoard(); return { strokes: [], areas: [], shapes: [...tree.shapes, ...flow.shapes], links: [...tree.links, ...flow.links], items: [...tree.items, ...flow.items], blocks: flow.blocks, groups: flow.groups }; };
// A representative larger board: the review board plus 600 more objects - 360 shapes, 180 links, 60 notes.
const large = () => {
  const board = both();
  for (let i = 0; i < 360; i += 1) board.shapes.push({ id: `bulk${i}`, kind: i % 3 ? 'rect' : 'ellipse', x1: 1400 + (i % 30) * 140, y1: 100 + Math.floor(i / 30) * 120, x2: 1500 + (i % 30) * 140, y2: 170 + Math.floor(i / 30) * 120, color: '#37352f', width: 2, text: `item ${i}` });
  for (let i = 0; i < 180; i += 1) board.links.push({ id: `bulkl${i}`, from: `bulk${i}`, fromSide: 'right', to: `bulk${i + 1}`, toSide: 'left', color: '#37352f' });
  for (let i = 0; i < 60; i += 1) board.items.push({ id: `bulkt${i}`, kind: 'text', x: 1400 + (i % 10) * 300, y: 1700 + Math.floor(i / 10) * 60, w: 260, text: `note ${i} about something unrelated`, color: '#37352f', opacity: 1 });
  return board;
};
const VARIANTS = [
  { fixture: 'tree-note', board: both, target: 'n23', prompt: 'Explain this node', accept: true },
  { fixture: 'tree-note-prep-at-send', board: both, target: 'n23', prompt: 'Explain this node', accept: true, query: '&prep=0' },
  { fixture: 'tree-note-jev', board: both, target: 'n23', prompt: 'How does this fit in?', accept: true },
  { fixture: 'flow-diagram-direct', board: both, target: 'check', prompt: '/diagram this flow', accept: true },
  { fixture: 'tree-motion-media', board: both, target: 'n23', prompt: '/motion explain this tree in 20s', decline: true },
  { fixture: 'code-edit', board: both, item: 'code1', mode: 'edit', prompt: 'Fix this function', accept: true },
  { fixture: 'group-note', board: both, target: 'g1', prompt: 'Explain this', accept: true },
  { fixture: 'large-note', board: large, target: 'n23', prompt: 'Explain this node', accept: true },
  { fixture: 'large-note-prep-at-send', board: large, target: 'n23', prompt: 'Explain this node', accept: true, query: '&prep=0' },
  { fixture: 'tree-note-render-every-chunk', board: both, target: 'n23', prompt: 'Explain this node', accept: true, query: '&flush=0' },
];
const ONLY = arg('only');

const browser = await chromium.launch();
const rows = [];
for (const variant of VARIANTS.filter(v => !ONLY || v.fixture.includes(ONLY))) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await context.newPage();
  await page.route('**/api/**', route => (route.request().method() !== 'GET' ? route.abort() : route.continue()));
  const key = `harness:bench-${variant.fixture}`;
  await page.goto(`${HARNESS}?board=bench-${variant.fixture}${variant.query || ''}`);
  await page.evaluate(([key, board]) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(board)); }, [key, variant.board()]);
  await page.goto(`${HARNESS}?board=bench-${variant.fixture}${variant.query || ''}`);
  await page.locator('[data-canvas-surface]').waitFor();
  await page.waitForTimeout(500);
  const locator = variant.item ? page.locator(`[data-item-id="${variant.item}"]`) : page.locator(`[data-shape-id="${variant.target}"]`).first();
  for (let i = 0; i < 6; i += 1) {
    const b = await locator.boundingBox();
    if (b && b.y > 80 && b.y + b.height < 700 && b.x > 360 && b.x + b.width < 1200) break;
    await page.mouse.move(750, 380); await page.mouse.wheel(b ? Math.round(b.x - 750) : 0, b ? Math.round(b.y - 380) : 0); await page.waitForTimeout(150);
  }
  let failures = 0;
  const frames = [];
  for (let run = 0; run < RUNS; run += 1) {
    try {
      const b = await locator.boundingBox();
      await page.keyboard.press('Escape');
      await page.mouse.click(b.x + (variant.item ? 8 : b.width / 2), b.y + b.height / 2);
      await page.keyboard.press('Control+k');
      await page.locator('[data-inline-ai]').waitFor();
      if (variant.mode === 'edit') await page.locator('[data-inline-mode="edit"]').click();
      // Each Ctrl+K opens a fresh editor session, so the same words make a new request (reuse is per session).
      await page.locator('[data-inline-prompt]').fill(variant.prompt);
      // Frame gaps and long tasks from Enter to the finished preview: the canvas's responsiveness while this request runs.
      await page.evaluate(() => { window.__frames = []; let last = performance.now(); window.__sampling = true; const tick = now => { window.__frames.push(now - last); last = now; if (window.__sampling) requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__longTasks = []; window.__lt = new PerformanceObserver(list => window.__longTasks.push(...list.getEntries().map(e => e.duration))); window.__lt.observe({ type: 'longtask' }); });
      await page.locator('[data-inline-prompt]').press('Enter');
      await page.waitForFunction(() => ['preview', 'proposal', 'error', 'clarify'].includes(document.querySelector('[data-inline-ai]')?.dataset.status), null, { timeout: 15000 });
      frames.push(await page.evaluate(() => { window.__sampling = false; window.__lt.disconnect(); const f = window.__frames.slice(2).sort((a, b) => a - b); return { frameP95: Math.round(f[Math.floor(f.length * 0.95)] || 0), frameMax: Math.round(f.at(-1) || 0), longTasks: window.__longTasks.length, longTaskMs: Math.round(window.__longTasks.reduce((a, b) => a + b, 0)) }; }));
      const status = await page.locator('[data-inline-ai]').getAttribute('data-status');
      if (status === 'preview' && variant.accept) { await page.locator('[data-inline-accept]').click(); await page.waitForTimeout(700); await page.mouse.click(60, 900); await page.keyboard.press('Control+z'); }
      else if (status === 'proposal') await page.locator('[data-paid-cancel]').click();
      else { failures += 1; await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); }
      await page.waitForTimeout(150);
    } catch (error) { failures += 1; console.log(`${variant.fixture} run ${run}: ${error.message.split('\n')[0]}`); await page.keyboard.press('Escape').catch(() => {}); }
  }
  // Unmounting the canvas flushes every queued row (the harness's sendTelemetry keeps them in the page).
  await page.evaluate(() => window.__switchBoard('bench-flush'));
  await page.waitForTimeout(300);
  const got = await page.evaluate(() => window.__inlineMock.telemetry);
  // Rows leave the page in request order, one per run: each takes its run's frame sample.
  got.forEach((row, index) => rows.push({ ...row, source: 'benchmark', run_id: RUN, sha: SHA, fixture: variant.fixture, mocked: true, metrics: { ...row.metrics, counts: { ...row.metrics.counts, ...(frames[index] || {}) } } }));
  console.log(`${variant.fixture}: ${got.length} rows, ${failures} failed runs`);
  await context.close();
}
await browser.close();

// The rows go through the real writer on the local stack (the same insert-or-ignore, the same content-free allowlist).
if (BASE && CP && APP) {
  const secret = readFileSync(arg('vars'), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
  const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'inline-ai-owner@example.com', secret }) })).json();
  let kept = 0, skipped = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const response = await fetch(`${BASE}/api/learn/inline/telemetry`, { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify({ app: APP, rows: rows.slice(i, i + 50) }) });
    const body = await response.json();
    kept += body.kept || 0; skipped += body.skipped || 0;
  }
  console.log(JSON.stringify({ run: RUN, sha: SHA, rows: rows.length, kept, skipped }));
} else console.log(JSON.stringify({ run: RUN, rows: rows.length, written: false }));
