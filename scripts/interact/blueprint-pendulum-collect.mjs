#!/usr/bin/env node
// Brief 41: collects the five "what changes a pendulum swing" runs through the live blueprint design kind (8879, Deep) into docs/features/interact/benchmarks/blueprint-mvp3/.
//   node scripts/interact/blueprint-pendulum-collect.mjs --runs <drive-local out dir>[,...] [--log <app.log>] [--out <dir>]
// A drive-local run leaves results.jsonl (id pendulum-<n>, jobId); the job's `interact_blueprint` log line holds its run record and its final blueprint (parsed, passed the full checker).
//   design/pendulum-<n>.json   the final blueprint exactly as the job saved it (design:<job>:<rev>:blueprint-final); a run that did not pass has none
//   records/pendulum-<n>.txt   the print command's --full output for the run (every answer exactly as returned, every checker output)
//   table.md                   one row per run: seed, dice pick, passed (first answer or after the correction) or the problems, seconds, cost; then the total
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
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
const rows = []; let total = 0, passed = 0, corrected = 0;
for (const id of ['pendulum-1', 'pendulum-2', 'pendulum-3', 'pendulum-4', 'pendulum-5']) {
  const result = results.get(id), got = result?.jobId ? logged.get(result.jobId) : null;
  if (!got) { rows.push(`| ${id} | - | - | no blueprint record: ${cell(result ? `${result.stage}, ${result.failure}` : 'no job was made')} | - | - | - |`); continue; }
  const { record, final } = got, pick = record.dice?.ids?.join(', ') ?? '-', of = record.dice?.controlQuantities?.join(', ') ?? '-';
  writeFileSync(join(OUT, 'records', `${id}.txt`), spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'print-blueprint.mjs'), result.jobId, '--full', '--log', LOG], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout);
  if (final) writeFileSync(join(OUT, 'design', `${id}.json`), `${JSON.stringify(final, null, 2)}\n`);
  if (record.passed) passed++; if (record.blueprint.final === 'corrected') corrected++; total += record.costUsd;
  const result_text = record.passed ? (record.blueprint.final === 'first' ? 'passed the full checker (first answer)' : 'passed the full checker (after the correction)') : `did not pass: ${record.problems.slice(0, 3).join(' / ')}`;
  rows.push(`| ${id} | ${record.seed} | ${cell(`${pick} (of ${of})`)} | ${cell(result_text)} | ${record.seconds} | $${record.costUsd.toFixed(4)} | ${record.passed ? `design/${id}.json` : '-'} |`);
}
writeFileSync(join(OUT, 'table.md'), [
  '# Blueprint MVP 3: five pendulum blueprints (brief 41)', '',
  'Made by `scripts/interact/blueprint-pendulum-collect.mjs` from the job records of five runs of "what changes a pendulum swing" at Deep on the local interactive stack (8879), the blueprint design kind (Gemini 4 Hydrogen at high, the full checker). The seed is minted per run when the job starts; the dice pick is the control quantities the run kept (the others were fixed). Seconds and cost are of the whole design phase. Each final blueprint (design/) is the parsed JSON that passed the full checker, ready for Build; a run that did not pass has none, and its record is records/<run>.txt.', '',
  '| Run | Seed | Dice pick (of the control quantities) | Result | Seconds | Cost | Final blueprint |', '|---|---|---|---|---|---|---|', ...rows, '',
  `Passed: ${passed} of 5 (${corrected} after the correction). Total cost: $${total.toFixed(4)}.`, '',
].join('\n'));
console.log(`passed ${passed} of 5, $${total.toFixed(4)}; wrote ${OUT}`);
