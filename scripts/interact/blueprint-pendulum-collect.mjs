#!/usr/bin/env node
// Briefs 41 to 43: collects the five "what changes a pendulum swing" runs through the live blueprint design kind (8879, Deep, all ten checks) into docs/features/interact/benchmarks/blueprint-mvp3/.
//   node scripts/interact/blueprint-pendulum-collect.mjs --runs <drive-local out dir>[,...] [--log <app.log>] [--out <dir>]
// A drive-local run leaves results.jsonl (id pendulum-<n>, jobId); the job's `interact_blueprint` log line holds its run record and, once the run passed, its final blueprint (parsed).
//   design/pendulum-<n>.json   the final blueprint of a run that passed (the model's answer that passed all ten checks, parsed)
//   records/pendulum-<n>.txt   the print command's --full output for the run (every answer exactly as returned, every checker output)
//   table.md                   table 1: one row per live run (seed, dice pick, P1 / P2 / F<check>, the check that failed and its sentence, seconds, cost);
//                              table 2: check 10 run OFFLINE ($0) on the five stored brief-41 blueprints (design-brief41/, labels still with `at`) with the new label rule: Build places each label around its point
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBlueprint } from '../../packages/web/src/interact-blueprint-check.js';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '..', '..');
const argv = process.argv.slice(2), opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i < 0 ? dflt : argv[i + 1]; };
const RUNS = (opt('runs', '') || '').split(',').filter(Boolean), LOG = opt('log', 'C:/s/spec/owner-local/persist-8879/app.log'), OUT = resolve(REPO, opt('out', 'docs/features/interact/benchmarks/blueprint-mvp3'));
if (!RUNS.length) { console.log('usage: node scripts/interact/blueprint-pendulum-collect.mjs --runs <drive-local out dir>[,...] [--log <app.log>] [--out <dir>]'); process.exit(2); }
mkdirSync(join(OUT, 'design'), { recursive: true }); mkdirSync(join(OUT, 'records'), { recursive: true });

const results = new Map();
for (const dir of RUNS) {
  const file = join(dir, 'results.jsonl'); if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) { try { const row = JSON.parse(line); results.set(row.id, row); } catch { /* a cut line */ } }
}
const logged = new Map();
for (const line of readFileSync(LOG, 'utf8').split(/\r?\n/)) {
  const at = line.indexOf('{"event":"interact_blueprint"'); if (at < 0) continue;
  try { const { jobId, record, final } = JSON.parse(line.slice(at)); if (jobId && record) logged.set(jobId, { record, final: final ?? null }); } catch { /* a cut line */ }
}

const cell = text => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const IDS = ['pendulum-1', 'pendulum-2', 'pendulum-3', 'pendulum-4', 'pendulum-5'];
const rows = []; let total = 0, p1 = 0, p2 = 0;
for (const id of IDS) {
  const result = results.get(id), got = result?.jobId ? logged.get(result.jobId) : null;
  if (!got) { rows.push(`| ${id} | - | - | - | no blueprint record: ${cell(result ? `${result.stage}, ${result.failure}` : 'no job was made')} | - | - | - |`); continue; }
  const { record, final } = got, pick = record.dice?.ids?.join(', ') ?? '-', of = record.dice?.controlQuantities?.join(', ') ?? '-';
  writeFileSync(join(OUT, 'records', `${id}.txt`), spawnSync(process.execPath, [join(HERE, 'print-blueprint.mjs'), result.jobId, '--full', '--log', LOG], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout);
  if (final) writeFileSync(join(OUT, 'design', `${id}.json`), `${JSON.stringify(final, null, 2)}\n`);
  total += record.costUsd;
  const last = record.checks[record.blueprint.corrected ? 'corrected' : 'first'];
  const verdict = record.passed ? (record.blueprint.final === 'first' ? 'P1' : 'P2') : `F${last?.failed ?? 0}`;
  if (verdict === 'P1') p1++; if (verdict === 'P2') p2++;
  const sentence = record.passed ? '-' : `check ${last?.failed ?? '?'}: ${(last?.problems ?? []).slice(0, 2).map(problem => problem.message).join(' / ') || record.problems[0] || '?'}`;
  rows.push(`| ${id} | ${record.seed} | ${cell(`${pick} (of ${of})`)} | ${verdict} | ${cell(sentence)} | ${record.seconds} | $${record.costUsd.toFixed(4)} | ${final ? `design/${id}.json` : '-'} |`);
}

// table 2: check 10 offline on the five stored brief-41 blueprints (a label still has `at`: Build places it around that point)
const offline = [];
for (const id of IDS) {
  const file = join(OUT, 'design-brief41', `${id}.json`);
  if (!existsSync(file)) { offline.push(`| ${id} | - | - | no stored blueprint | - |`); continue; }
  const blueprint = JSON.parse(readFileSync(file, 'utf8')), checked = await checkBlueprint(blueprint, { legacyLabels: true });
  offline.push(`| ${id} | failed check 10: a label overlapped a part | ${checked.ok ? 'passes all ten checks' : `F${checked.failed}`} | ${cell(checked.ok ? '-' : `check ${checked.failed}: ${checked.problems.slice(0, 2).map(problem => problem.message).join(' / ')}`)} | ${cell(checked.notes.length ? checked.notes.slice(0, 4).join('; ') : '-')} |`);
}
writeFileSync(join(OUT, 'table.md'), [
  '# Blueprint MVP 3: five pendulum blueprints through all ten checks (brief 43)', '',
  '## Table 1: five live runs', '',
  'Made by `scripts/interact/blueprint-pendulum-collect.mjs` from the job records of five runs of "what changes a pendulum swing" at Deep on the local interactive stack (8879): the blueprint design kind, Gemini 4 Hydrogen at high, checks 1 to 10, one correction. A label names the part it is near (`near`) and the program places it (brief 43). The seed is minted per run when the job starts; the dice pick is the control quantities the run kept. P1: the first answer passed all ten checks; P2: it passed after the one correction; F<n>: the check that failed last. Seconds and cost are of the whole design phase.', '',
  '| Run | Seed | Dice pick (of the control quantities) | Result | Check that failed and its sentence | Seconds | Cost | Final blueprint |', '|---|---|---|---|---|---|---|---|', ...rows, '',
  `P1: ${p1}. P2: ${p2}. Failed: ${IDS.length - p1 - p2}. Total cost: $${total.toFixed(4)}.`, '',
  '## Table 2: check 10 offline on the five stored brief-41 blueprints', '',
  'Run at $0 on `design-brief41/` (the five blueprints of brief 41, whose labels still have `at`): the checker with the new label rule (Build places a label around its point by the same rule as one that is near a part). They failed check 10 in brief 41 because a label overlapped a part; every check is run, 1 to 10.', '',
  '| Blueprint | Brief 41 result | Now | Check that failed and its sentence | Labels left out (notes) |', '|---|---|---|---|---|', ...offline, '',
].join('\n'));
console.log(`live: P1 ${p1}, P2 ${p2}, failed ${IDS.length - p1 - p2}, $${total.toFixed(4)}; wrote ${OUT}`);
