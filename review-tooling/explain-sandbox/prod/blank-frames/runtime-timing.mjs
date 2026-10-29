// Node only, no browser, no model. The saved cooling card's program run through the real packaged engine (runtime.js at
// c59bae962, worktree C:/s/wt-blank-frames) at every 60 fps playback moment, exactly as the card's Worker runs it:
//  - per call: ok / error code + phase, and the guest's own ms (metrics.ms)
//  - every ok frame through normalizeFrame (the card's validation): any time t that yields an invalid frame?
// Usage: node runtime-timing.mjs <label> [passes] [interruptMs override: the program-phase deadline, default LIMITS.interruptMs]   -> writes timing-<label>.json next to this file.
import fs from 'node:fs';
const WEB = 'file:///C:/s/wt-blank-frames/packages/web/src/explain-program/';
const { loadEngine, runProgram } = await import(WEB + 'runtime.js');
const { LIMITS } = await import(WEB + 'limits.js');
const { normalizeFrame } = await import(WEB + 'frame.js');
const { evaluateRequestFor } = await import(WEB + 'program-card.js');

const label = process.argv[2] || 'idle', passes = Number(process.argv[3] || 1);
const limits = { ...LIMITS, interruptMs: Number(process.argv[4] || LIMITS.interruptMs) };
const { artifact } = JSON.parse(fs.readFileSync('C:/s/spec/explain-sandbox/genuine/runs/sandbox-ex1-b/result-route.json', 'utf8'));
const engine = await loadEngine();
const block = { id: 'card-sandbox-ex1-b', inputs: {}, time: 0 };
const ms = [], fails = [], invalid = [];
let n = 0;
for (let p = 0; p < passes; p++) {
  for (let i = 0; i <= artifact.manifest.duration * 60; i++) {
    const t = i / 60, req = evaluateRequestFor(artifact.manifest, block, t, ++n);
    const out = runProgram(engine, { source: artifact.source, request: req }, limits);
    ms.push(out.metrics.ms);
    if (!out.ok) { fails.push({ t, code: out.code, phase: out.phase, detail: out.detail, ms: out.metrics.ms }); continue; }
    const frame = normalizeFrame(out.value.frame, artifact.manifest);
    if (!frame.ok) invalid.push({ t, issue: frame.issue });
  }
}
const s = [...ms].sort((a, b) => a - b), q = f => Number(s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(2));
const report = { label, at: new Date().toISOString(), node: process.version, interruptMs: limits.interruptMs, watchdogMs: LIMITS.watchdogMs,
  calls: ms.length, ok: ms.length - fails.length, fails: fails.length, invalidFrames: invalid.length,
  msTotalCall: { p50: q(0.5), p90: q(0.9), p99: q(0.99), max: q(1) }, over25: ms.filter(v => v > 25).length, over50: ms.filter(v => v > 50).length,
  failSamples: fails.slice(0, 20), invalidSamples: invalid.slice(0, 20) };
fs.writeFileSync(new URL(`./timing-${label}.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ...report, failSamples: report.failSamples.length, invalidSamples: report.invalidSamples.length }));
