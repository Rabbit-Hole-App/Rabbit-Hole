#!/usr/bin/env node
// Brief 40: collects the 13 trees prompts run through the live blueprint design kind on the local interactive stack (8879) into docs/features/interact/benchmarks/blueprint-mvp2/. Nothing is judged.
//   node scripts/interact/blueprint-live-collect.mjs --runs <drive-local out dir>[,<dir>...] [--set scripts/interact/sets/trees-prompts.json] [--log <app.log>] [--out <dir>]
// A drive-local run (scripts/interact/drive-local.mjs) leaves results.jsonl (one row per prompt: id, jobId, stage, failure) and <id>-job.json (the job's view and diagnostics). The blueprint record of a job is the
// `interact_blueprint` line its job wrote to the stack's app.log (the same record is in the job's diagnostics.blueprint). Written here, from those and nothing else:
//   <id>.txt      the print command's --full output for the prompt's job (scripts/interact/print-blueprint.mjs)
//   rows.jsonl    one row per model call (quantities, blueprint, correction): ts (the job's creation), id, jobId, kind, seconds, ok, finish, tokens, costUsd, served, error, file
//   table.md      one row per prompt: id, passed or the first problem, the controls, the main picture's part types, the graph or none, seconds, cost; then the total and what failed before the model answered
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '..', '..');
const argv = process.argv.slice(2), opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i < 0 ? dflt : argv[i + 1]; };
const RUNS = (opt('runs', '') || '').split(',').filter(Boolean), SET = resolve(REPO, opt('set', 'scripts/interact/sets/trees-prompts.json')), LOG = opt('log', 'C:/s/spec/owner-local/persist-8879/app.log');
const OUT = resolve(REPO, opt('out', 'docs/features/interact/benchmarks/blueprint-mvp2'));
if (!RUNS.length) { console.log('usage: node scripts/interact/blueprint-live-collect.mjs --runs <drive-local out dir>[,...] [--set <prompts.json>] [--log <app.log>] [--out <dir>]'); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const prompts = readJson(SET), results = new Map();
for (const dir of RUNS) {
  const file = join(dir, 'results.jsonl');
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) { try { const row = JSON.parse(line); results.set(row.id, { ...row, dir }); } catch { /* a cut line */ } }
}
const records = new Map();
for (const line of readFileSync(LOG, 'utf8').split(/\r?\n/)) {
  const at = line.indexOf('{"event":"interact_blueprint"'); if (at < 0) continue;
  try { const { jobId, record } = JSON.parse(line.slice(at)); if (jobId && record) records.set(jobId, record); } catch { /* a cut line is not a record */ }
}

const cell = text => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const dollars = value => `$${value.toFixed(4)}`;
const blueprintOf = record => { const raw = record.blueprint.final === 'first' ? record.blueprint.first?.raw : record.blueprint.corrected?.raw ?? record.blueprint.first?.raw; try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
const controlsOf = b => (b?.inputs ?? []).map(input => `${input.id} (${input.type})`).join(', ') || 'none';
const partsOf = b => { const main = b?.pictures?.main; if (!main) return '-'; return main.type === 'parts' ? [...new Set((main.parts ?? []).map(part => part.type))].join(', ') || 'none' : `kind ${main.kind}`; };
const graphOf = b => { const panel = b?.pictures?.panel; if (b == null) return '-'; if (!panel) return 'none'; return `x: ${panel.x?.over ?? '?'}; lines: ${(panel.series ?? []).map(series => series.of).join(', ') || 'none'}`; };

const rows = [], table = [], failedEarly = [];
let total = 0, seconds = 0;
for (const { id, prompt } of prompts) {
  const result = results.get(id), jobId = result?.jobId ?? null, record = jobId ? records.get(jobId) : null, file = `${id}.txt`;
  const printed = jobId ? spawnSync(process.execPath, [join(HERE, 'print-blueprint.mjs'), jobId, '--full', '--log', LOG], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) : null;
  const job = result ? readJson(join(result.dir, `${id}-job.json`)) : null, created = job?.job?.createdAt ? new Date(job.job.createdAt).toISOString() : null;
  if (!record) {
    const why = result ? `no blueprint record; the job ended ${result.stage}${result.stopReason ? ` (${result.stopReason})` : ''}: ${result.failure ?? 'no failure line'}` : 'no job was made for this prompt';
    writeFileSync(join(OUT, file), `${id}\nprompt: ${prompt}\n${why}\n${job?.diagnostics?.calls ? `calls: ${JSON.stringify(job.diagnostics.calls, null, 2)}\n` : ''}`);
    failedEarly.push(`${id}: ${why}`); table.push(`| ${id} | ${cell(why)} | - | - | - | - | - |`);
    rows.push({ ts: created, id, jobId, kind: 'none', ok: false, error: why, file }); continue;
  }
  writeFileSync(join(OUT, file), printed.stdout);
  const b = blueprintOf(record), problem = record.problems[0];
  const passed = record.passed ? (record.blueprint.final === 'first' ? 'passed (first answer)' : 'passed (after correction)') : (problem ?? 'did not pass');
  table.push(`| ${id} | ${cell(passed)} | ${cell(controlsOf(b))} | ${cell(partsOf(b))} | ${cell(graphOf(b))} | ${record.seconds} | ${dollars(record.costUsd)} |`);
  total += record.costUsd; seconds += record.seconds;
  for (const call of record.calls) {
    rows.push({ ts: created, id, jobId, kind: call.kind, seconds: call.seconds, ok: call.ok, finish: call.finish, tokens: call.tokens ? { input: call.tokens.input, thinking: call.tokens.thinking, output: call.tokens.output } : null, costUsd: call.costUsd, served: call.served, file, ...(call.ok ? {} : { error: call.error }) });
    if (!call.ok) failedEarly.push(`${id} ${call.kind}: ${call.error}${call.tokens ? ' (the provider answered; the answer was refused before the checks)' : ' (no answer, no usage)'}`);
  }
}
writeFileSync(join(OUT, 'rows.jsonl'), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
const passedCount = [...table].filter(line => /\| passed \(/.test(line)).length;
writeFileSync(join(OUT, 'table.md'), [
  '# Blueprint MVP 2: the 13 trees prompts through the live blueprint design kind (brief 40)', '',
  `Made by \`scripts/interact/blueprint-live-collect.mjs\` from the job records of the run on the local interactive stack (8879), Deep, one run per prompt, Gemini 4 Hydrogen at high. Seconds and cost are of the whole design phase (quantities call, blueprint call and the correction when there was one). Copied from each blueprint; nothing is judged. Each prompt's record, as the print command shows it (\`--full\`), is \`<id>.txt\`.`, '',
  '| Id | Passed, or the first problem | Controls | Main picture part types | Graph (x and lines) | Seconds | Cost |', '|---|---|---|---|---|---|---|', ...table, '',
  `Prompts: ${prompts.length}. Passed the light checker: ${passedCount}. Total cost: ${dollars(total)}. Total seconds of the design phases: ${seconds.toFixed(1)}.`, '',
  failedEarly.length ? `## Failures\n\n${failedEarly.map(line => `- ${line}`).join('\n')}\n` : '## Failures\n\nNone: every call was answered by the provider and every job stored its record.\n',
].join('\n'));
console.log(`${prompts.length} prompts, ${records.size} records in the log, ${passedCount} passed, $${total.toFixed(4)}, ${failedEarly.length} failures; wrote ${OUT}`);
