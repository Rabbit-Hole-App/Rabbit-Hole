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

// table 2 (brief 44): all ten checks OFFLINE ($0) on ten stored blueprints: the five of brief 41 (design-brief41/, a label still has `at`: Build places it around that point) and the last answers of the five live runs of brief 43
// (design-brief43/, a label is near a part). BEFORE is the result of the checker as committed in brief 43 (e1b0c16cb: table 1 below and the offline table of that commit); AFTER is the checker now (arrow from a dot, eight label positions at two gaps, a
// two-line note, the graph asked again without its title).
const BEFORE = { 'b41-pendulum-1': 'F10: arrowhead over the bob (velArrow, bob)', 'b41-pendulum-2': 'F10: arrowhead over the bob (vel_arrow, test_bob)', 'b41-pendulum-3': 'passes all ten checks', 'b41-pendulum-4': 'F10: the label release_label has no clear side', 'b41-pendulum-5': 'F10: arrowhead over the bob (velArrow, bobDot)',
  'b43-pendulum-1': 'F9: the note needs 2 lines; its box allows 1 (text_too_wide)', 'b43-pendulum-2': 'F10: arrowhead over the bob (grav_arrow, bob)', 'b43-pendulum-3': 'F9: the graph needs 300 px; its box is 299.2 (figure_too_big)', 'b43-pendulum-4': 'passes all ten checks (P2)', 'b43-pendulum-5': 'F10: the label ref_lbl has no clear side' };
const offline = [], dropped = [];
for (const [prefix, dir, legacyLabels] of [['b41', 'design-brief41', true], ['b43', 'design-brief43', false]]) for (const id of IDS) {
  const name = `${prefix}-${id}`, file = join(OUT, dir, `${id}.json`);
  if (!existsSync(file)) { offline.push(`| ${name} | ${cell(BEFORE[name])} | no stored blueprint | - |`); continue; }
  const checked = await checkBlueprint(JSON.parse(readFileSync(file, 'utf8')), { legacyLabels });
  if (checked.measured?.facts?.droppedLabels?.length) dropped.push(`${name}: ${[...new Set(checked.measured.facts.droppedLabels.map(entry => entry.label))].join(', ')} (in ${checked.measured.facts.droppedLabels.length} frames)`);
  offline.push(`| ${name} | ${cell(BEFORE[name])} | ${checked.ok ? 'passes all ten checks' : `F${checked.failed}`} | ${cell(checked.ok ? '-' : `check ${checked.failed}: ${checked.problems.slice(0, 2).map(problem => problem.message).join(' / ')}`)} |`);
}
writeFileSync(join(OUT, 'table.md'), [
  '# Blueprint MVP 3: five pendulum blueprints through all ten checks (brief 43)', '',
  '## Table 1: five live runs', '',
  'Made by `scripts/interact/blueprint-pendulum-collect.mjs` from the job records of five runs of "what changes a pendulum swing" at Deep on the local interactive stack (8879): the blueprint design kind, Gemini 4 Hydrogen at high, checks 1 to 10, one correction. A label names the part it is near (`near`) and the program places it (brief 43). The seed is minted per run when the job starts; the dice pick is the control quantities the run kept. P1: the first answer passed all ten checks; P2: it passed after the one correction; F<n>: the check that failed last. Seconds and cost are of the whole design phase.', '',
  '| Run | Seed | Dice pick (of the control quantities) | Result | Check that failed and its sentence | Seconds | Cost | Final blueprint |', '|---|---|---|---|---|---|---|---|', ...rows, '',
  `P1: ${p1}. P2: ${p2}. Failed: ${IDS.length - p1 - p2}. Total cost: $${total.toFixed(4)}.`, '',
  '## Table 2 (brief 44): all ten checks offline on ten stored blueprints', '',
  'Run at $0 on the five blueprints of brief 41 (`design-brief41/`, whose labels still have `at`) and the last answer of each of the five live runs of brief 43 (`design-brief43/`). Before: the checker as committed in brief 43 (`e1b0c16cb`). After: the checker now, with the four Build rules of brief 44 (an arrow that starts at a dot starts at its edge plus 2 px; a label tries eight positions at gaps of 12 then 20 px and is left out and counted when none is clear, which no longer fails check 10; a one-line explanation wider than its note box is given two lines; a graph too tall by at most its title\'s height is drawn without its title).', '',
  '| Blueprint | Before | After | Check that failed and its sentence |', '|---|---|---|---|', ...offline, '',
  `Labels dropped in some frame (counted in notes, no longer a failure): ${dropped.length ? dropped.join('; ') : 'none'}.`, '',
].join('\n'));
console.log(`live: P1 ${p1}, P2 ${p2}, failed ${IDS.length - p1 - p2}, $${total.toFixed(4)}; wrote ${OUT}`);
