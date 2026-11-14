// Brief 22 task 2: what a frame of N objects costs.
// Headless half: the pinned QuickJS engine runs a synthetic sdk-8 program that returns N toss-look objects (boxes, lines and texts, a third each) and the result goes through parseGuestResult with the
// approved budget, the path interact-checks.js headlessCaptureCard takes; ms per evaluate over 60 evaluations at different times (a scrub). The browser half is frame-budget-browser.mjs.
//   node scripts/interact/measure-frame-budget.mjs [--counts 30,60,100,130,160] [--out <json>]
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { loadEngine, runProgram } from '../../packages/web/src/explain-program/runtime.js';
import { parseGuestResult } from '../../packages/web/src/explain-program/contract.js';
import { FIGURES_SDK_VERSION } from '../../packages/web/src/explain-program/stamps.js';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? dflt : process.argv[i + 1]; };
const COUNTS = arg('counts', '30,60,100,130,160').split(',').map(Number), OUT = arg('out', null), RUNS = 60;
const sourceOf = n => `
export function evaluate({ inputs, time }) {
  const objects = [];
  for (let i = 0; i < ${n}; i++) {
    const k = i % 3, x = 20 + (i * 13) % 880, y = 30 + (i * 29) % 460, d = Math.sin(time * 3 + i) * 6;
    if (k === 0) objects.push(sdk.box('box.' + i, x, y + d, 36, 18, { role: i % 2 ? 'input' : 'neutral' }));
    else if (k === 1) objects.push(sdk.line('line.' + i, x, y, x + 40, y + 12 + d, { opacity: 0.6 }));
    else objects.push(sdk.text('text.' + i, x, y, 'n' + i));
  }
  return { frame: sdk.frame(objects, { width: 960, height: 540, readouts: [] }), quantities: {} };
}`;
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const engine = await loadEngine();
const rows = [];
for (const n of COUNTS) {
  const source = sourceOf(n), budget = Math.max(60, n), times = [];
  let failure = null;
  for (let r = 0; r < RUNS + 5; r++) { // five warm-up evaluations are not counted
    const t0 = performance.now();
    const out = runProgram(engine, { source, request: { requestId: '1', inputs: {}, time: r * 0.05, seed: 0, state: null }, sdkVersion: FIGURES_SDK_VERSION });
    if (!out.ok) { failure = `${out.code}: ${out.detail}`; break; }
    const parsed = parseGuestResult(out.value, { frameObjects: budget, readouts: [], capabilities: [] }, FIGURES_SDK_VERSION);
    const ms = performance.now() - t0;
    if (!parsed.ok) { failure = parsed.issue; break; }
    if (r >= 5) times.push(ms);
  }
  const sorted = [...times].sort((a, b) => a - b);
  rows.push({ objects: n, budget, failure, runs: times.length, meanMs: times.length ? +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2) : null, p95Ms: times.length ? +pct(sorted, 0.95).toFixed(2) : null, maxMs: times.length ? +sorted.at(-1).toFixed(2) : null });
}
console.table(rows);
if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 2));
