// Node only. Rules in or out a DETERMINISTIC bad moment: the saved cooling program evaluated at a 1 ms time grid over its whole
// duration plus random float times (the clock asks arbitrary floats), for room 10 (the run's default) and room 20, through
// exactly the checks the card applies to an answer: runtime.js runProgram -> host.js parseGuestResult -> frame.js normalizeFrame.
// Generous deadline (interruptMs 1000) so a slow call is not counted here; deadline misses are measured in runtime-timing.mjs.
import fs from 'node:fs';
const WEB = 'file:///C:/s/wt-blank-frames/packages/web/src/explain-program/';
const { loadEngine, runProgram } = await import(WEB + 'runtime.js');
const { LIMITS } = await import(WEB + 'limits.js');
const { parseGuestResult } = await import(WEB + 'contract.js');
const { normalizeFrame } = await import(WEB + 'frame.js');
const { evaluateRequestFor } = await import(WEB + 'program-card.js');

const { artifact } = JSON.parse(fs.readFileSync('C:/s/spec/explain-sandbox/genuine/runs/sandbox-ex1-b/result-route.json', 'utf8'));
const engine = await loadEngine(), limits = { ...LIMITS, interruptMs: 1000, watchdogMs: 1000 };
const D = artifact.manifest.duration, bad = [];
let calls = 0, seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (const room of [10, 20]) {
  const block = { id: 'card-sandbox-ex1-b', inputs: { room }, time: 0 };
  const times = [...Array.from({ length: D * 1000 + 1 }, (_, i) => i / 1000), ...Array.from({ length: 5000 }, () => rnd() * D)];
  for (const t of times) {
    const out = runProgram(engine, { source: artifact.source, request: evaluateRequestFor(artifact.manifest, block, t, ++calls) }, limits);
    if (!out.ok) { bad.push({ room, t, stage: 'runProgram', code: out.code, detail: out.detail }); continue; }
    const result = parseGuestResult(out.value);
    if (!result.ok) { bad.push({ room, t, stage: 'parseGuestResult', code: result.error.code, issue: result.issue }); continue; }
    const frame = normalizeFrame(result.value.frame, artifact.manifest);
    if (!frame.ok) bad.push({ room, t, stage: 'normalizeFrame', code: frame.error.code, issue: frame.issue });
  }
}
const report = { at: new Date().toISOString(), calls, bad: bad.length, samples: bad.slice(0, 30) };
fs.writeFileSync(new URL('./output-scan.json', import.meta.url), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ calls, bad: bad.length }));
