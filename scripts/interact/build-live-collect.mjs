#!/usr/bin/env node
// Brief 48: collects the live runs of "/interactive what changes a pendulum swing" at Deep on 8879 (the whole path: Design, Build, the Program writer, validate, headless run, frame rules, seal, canvas) into docs/features/interact/benchmarks/build-mvp3/.
//   node scripts/interact/build-live-collect.mjs --runs <drive-local out dir>,<...> [--canvases <canvas file>,<...>] [--log <app.log>] [--out <dir>]
// Per run N (the Nth directory): run-N/blueprint.json (the final blueprint, parsed), build-schema.json (the final build-schema, parsed), program.js (the Program the writer writes from them), checks.json (the frame checks: the job's own record of the
// Build stage and the same checks run again offline with per-frame results), record.txt (the print command's --full output of the design record), viewport-t0.3s.png (the whole-viewport shot at t = 0.3 s); table.md: one row per run.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBuilt } from '../../packages/web/src/interact-build-frames.js';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '..', '..');
const argv = process.argv.slice(2), opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i < 0 ? dflt : argv[i + 1]; };
const RUNS = (opt('runs', '') || '').split(',').filter(Boolean), CANVASES = (opt('canvases', '') || '').split(',').filter(Boolean), LOG = opt('log', 'C:/s/spec/owner-local/persist-8879/app.log'), OUT = resolve(REPO, opt('out', 'docs/features/interact/benchmarks/build-mvp3'));
if (!RUNS.length) { console.log('usage: node scripts/interact/build-live-collect.mjs --runs <drive-local out dir>[,...] [--canvases <file>[,...]] [--log <app.log>] [--out <dir>]'); process.exit(2); }
const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const logged = new Map();
for (const line of readFileSync(LOG, 'utf8').split(/\r?\n/)) {
  const at = line.indexOf('{"event":"interact_blueprint"'); if (at < 0) continue;
  try { const { jobId, record, final } = JSON.parse(line.slice(at)); if (jobId && record) logged.set(jobId, { record, final: final ?? null }); } catch { /* a cut line */ }
}
const cell = text => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const rows = []; let total = 0;
for (const [index, dir] of RUNS.entries()) {
  const n = index + 1, runDir = join(OUT, `run-${n}`); mkdirSync(runDir, { recursive: true });
  const results = existsSync(join(dir, 'results.jsonl')) ? readFileSync(join(dir, 'results.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)).at(-1) : null;
  const canvas = CANVASES[index] ? readJson(CANVASES[index]) : null, address = canvas?.app ? `http://127.0.0.1:8879/apps/${canvas.app}` : '-';
  const got = results?.jobId ? logged.get(results.jobId) : null, record = got?.record ?? null, build = record?.build ?? null;
  let programNote = '-';
  if (got?.final) writeFileSync(join(runDir, 'blueprint.json'), `${JSON.stringify(got.final, null, 2)}\n`);
  if (build?.final) writeFileSync(join(runDir, 'build-schema.json'), `${JSON.stringify(build.final, null, 2)}\n`);
  let offline = null;
  if (got?.final && build?.final) {
    offline = await checkBuilt({ blueprint: got.final, buildSchema: build.final });
    if (offline.source) { writeFileSync(join(runDir, 'program.js'), `${offline.source}\n`); programNote = `${offline.bytes} B`; }
    const { source, ...saved } = offline; writeFileSync(join(runDir, 'checks.json'), `${JSON.stringify({ live: { first: build.first?.checks ?? null, repair: build.repair, repairAttempt: build.repairAttempt?.checks ?? null, final: build.checks ?? null }, offline: saved }, null, 2)}\n`);
  }
  if (results?.jobId && record) writeFileSync(join(runDir, 'record.txt'), spawnSync(process.execPath, [join(HERE, 'print-blueprint.mjs'), results.jobId, '--full', '--log', LOG], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout);
  const shot = ['page-t1.png', 'page-t2.png'].map(name => existsSync(join(dir, `${results?.id}-${name}`)) ? join(dir, `${results?.id}-${name}`) : null).find(Boolean);
  if (shot) copyFileSync(shot, join(runDir, 'viewport-t0.3s.png'));
  const designCost = record?.costUsd ?? 0, buildCost = build?.costUsd ?? 0; total += designCost + buildCost;
  rows.push({ n, seed: record?.seed ?? '-', pick: record?.dice?.ids?.join(', ') ?? '-', of: record?.dice?.controlQuantities?.join(', ') ?? '-', designSeconds: record?.seconds ?? '-', designCost, buildSeconds: build?.seconds ?? '-', buildCost,
    repair: build ? build.repair : '-', stage: results?.stage ?? '-', failure: results?.failure ?? null, seconds: results?.promptToCardMs ? Math.round(results.promptToCardMs / 100) / 10 : '-', address, shot: shot ? `run-${n}/viewport-t0.3s.png` : '-', program: programNote, designProblems: record && !record.passed ? record.problems.slice(0, 1).join('') : null, buildProblems: build?.problems?.length ? build.problems[0] : null });
}
writeFileSync(join(OUT, 'table.md'), [
  '# Build MVP 3: the whole path live (brief 48)', '',
  '"/interactive what changes a pendulum swing" at Deep on the local interactive stack (8879), no hand in between: Design (Gemini 4 Hydrogen at high: the quantities call, the dice, the blueprint call, checks 1 to 9, one correction), then the Build call (Hydrogen at high: build-mvp1\'s prompts and measurements), the Program writer, validate, the headless run and the frame rules (inside the design stage, one repair call to the Build model on a failure that is not motion decoration), then the job\'s own validate, headless run, frame rules, seal and canvas. Made by `scripts/interact/build-live-collect.mjs`. Seconds: design and build are the phases\' own (build includes the measurements and the frame check); total is from the prompt sent to the card ready. Each run\'s blueprint, build-schema, Program (as the writer writes it from them), checks and the whole-viewport shot at t = 0.3 s are in `run-N/`.', '',
  '| Run | Seed | Dice pick (of the control quantities) | Design s / $ | Build s / $ | Repair | Total s | Result | Canvas | Shot | Program |', '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(row => `| ${row.n} | ${row.seed} | ${cell(`${row.pick} (of ${row.of})`)} | ${row.designSeconds} s / $${row.designCost.toFixed(3)} | ${row.buildSeconds} s / $${row.buildCost.toFixed(3)} | ${row.repair} | ${row.seconds} | ${cell(row.stage === 'ready' ? 'card ready' : `${row.stage}: ${row.designProblems ?? row.buildProblems ?? row.failure ?? ''}`)} | ${row.address} | ${row.shot} | ${row.program} |`), '',
  `Total model cost: $${total.toFixed(3)}.`, '',
].join('\n'));
console.log(`${rows.length} runs, $${total.toFixed(3)}; wrote ${OUT}`);
