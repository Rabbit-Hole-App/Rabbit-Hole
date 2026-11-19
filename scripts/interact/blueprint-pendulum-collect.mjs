#!/usr/bin/env node
// Briefs 41 and 42: collects the five "what changes a pendulum swing" runs through the live blueprint design kind (8879, Deep) into docs/features/interact/benchmarks/blueprint-mvp3/.
//   node scripts/interact/blueprint-pendulum-collect.mjs --runs <drive-local out dir>[,...] [--log <app.log>] [--out <dir>]
// A drive-local run leaves results.jsonl (id pendulum-<n>, jobId); the job's `interact_blueprint` log line holds its run record and, once the run passed, its final blueprint (parsed).
// The design phase runs checks 1 to 9 (brief 42; check 10, the Program fit, is Build's). The checks run in order, so a record made while the design phase still ran check 10 that failed at 10 (the five runs of brief 41) passed 1 to 9.
//   design/pendulum-<n>.json   the final blueprint: the model's last answer, parsed from the text exactly as returned, when it passed checks 1 to 9
//   records/pendulum-<n>.txt   the print command's --full output for the run (every answer exactly as returned, every checker output)
//   table.md                   one row per run: seed, dice pick, passed on checks 1 to 9 or the problems, seconds, cost; then the total
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const passes = check => !!check && (check.ok || check.failed === 10); // passed checks 1 to 9
const rows = []; let total = 0, passed = 0, corrected = 0;
for (const id of ['pendulum-1', 'pendulum-2', 'pendulum-3', 'pendulum-4', 'pendulum-5']) {
  const result = results.get(id), got = result?.jobId ? logged.get(result.jobId) : null;
  if (!got) { rows.push(`| ${id} | - | - | no blueprint record: ${cell(result ? `${result.stage}, ${result.failure}` : 'no job was made')} | - | - | - |`); continue; }
  const { record, final: loggedFinal } = got, pick = record.dice?.ids?.join(', ') ?? '-', of = record.dice?.controlQuantities?.join(', ') ?? '-';
  writeFileSync(join(OUT, 'records', `${id}.txt`), spawnSync(process.execPath, [join(HERE, 'print-blueprint.mjs'), result.jobId, '--full', '--log', LOG], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout);
  const last = record.blueprint.corrected ? 'corrected' : 'first', ok = passes(record.checks[last]);
  const final = loggedFinal ?? (ok ? JSON.parse(record.blueprint[last].raw) : null);
  if (final) writeFileSync(join(OUT, 'design', `${id}.json`), `${JSON.stringify(final, null, 2)}\n`);
  if (ok) passed++; if (ok && last === 'corrected') corrected++; total += record.costUsd;
  const firstAlso = last === 'corrected' && passes(record.checks.first);
  const text = ok ? `passed checks 1 to 9 (${last === 'corrected' ? `after the correction${firstAlso ? '; the first answer also passed 1 to 9' : ''}` : 'first answer'})` : `did not pass: ${(record.checks[last]?.problems ?? []).slice(0, 3).map(problem => problem.message).join(' / ')}`;
  rows.push(`| ${id} | ${record.seed} | ${cell(`${pick} (of ${of})`)} | ${cell(text)} | ${record.seconds} | $${record.costUsd.toFixed(4)} | ${final ? `design/${id}.json` : '-'} |`);
}
writeFileSync(join(OUT, 'table.md'), [
  '# Blueprint MVP 3: five pendulum blueprints (briefs 41 and 42)', '',
  'Made by `scripts/interact/blueprint-pendulum-collect.mjs` from the job records of five runs of "what changes a pendulum swing" at Deep on the local interactive stack (8879), the blueprint design kind (Gemini 4 Hydrogen at high). The seed is minted per run when the job starts; the dice pick is the control quantities the run kept (the others were fixed). Seconds and cost are of the whole design phase as it ran then (quantities call, blueprint call, the correction call).',
  '', 'The design phase checks the blueprint on checks 1 to 9 (the form, the names, the function in QuickJS, the parts move, the controls matter, the parts are drawable, the graph is drawable, the claims hold, the layout fits). Check 10 (building the Program and testing the frame) is Build\'s. These five runs were made while the design phase still ran check 10, and every one of them stopped on check 10 (a label touching a part); checks run in order, so each last answer passed 1 to 9 and is saved as the final blueprint, ready for Build. The runs\' own record of the checker (records/) still says "did NOT pass" because it was made under the old rule. Each file is the model\'s answer parsed from the text exactly as returned.', '',
  '| Run | Seed | Dice pick (of the control quantities) | Result | Seconds | Cost | Final blueprint |', '|---|---|---|---|---|---|---|', ...rows, '',
  `Passed checks 1 to 9: ${passed} of 5 (${corrected} saved after the correction). Total cost of the five runs: $${total.toFixed(4)}.`, '',
].join('\n'));
console.log(`passed checks 1 to 9: ${passed} of 5, $${total.toFixed(4)}; wrote ${OUT}`);
