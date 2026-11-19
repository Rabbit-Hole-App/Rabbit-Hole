#!/usr/bin/env node
// Brief 39: prints the blueprint design phase of one /interactive job on the local interactive stack (8879): the run record the job stored under design:<job>:<rev>:blueprint (control plane, interact-blueprint-design.js).
//   node scripts/interact/print-blueprint.mjs <run id | latest> [--full | --blueprint] [--log <app.log>]
// --blueprint prints only the final blueprint: the parsed JSON that passed checks 1 to 9, saved beside the record (design:<job>:<rev>:blueprint-final). A run that did not pass has none.
// The job also writes its record as one `interact_blueprint` line to the stack's app.log; this reads that log (default: the 8879 stack's), so it needs no sign-in. The same record is in the job's diagnostics
// (GET /api/learn/explain/jobs/<id>?board=<board>&detail=1 with the job owner's session; EXPLAIN_DIAGNOSTICS=true). Default output: the summary, the dice, the calls, the checker's problems and the final blueprint.
// --full adds the quantities answer, every blueprint answer exactly as returned and the checker outputs.
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2), flag = name => argv.includes(`--${name}`), opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i < 0 ? dflt : argv[i + 1]; };
const LOG = opt('log', 'C:/s/spec/owner-local/persist-8879/app.log'), which = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--log');
if (!which) { console.log('usage: node scripts/interact/print-blueprint.mjs <run id | latest> [--full] [--log <app.log>]'); process.exit(2); }

const records = [], finals = new Map();
for (const line of readFileSync(LOG, 'utf8').split(/\r?\n/)) {
  const at = line.indexOf('{"event":"interact_blueprint"'); if (at < 0) continue;
  try { const { jobId, record, final } = JSON.parse(line.slice(at)); if (jobId && record) { records.push(record); finals.set(jobId, final ?? null); } } catch { /* a cut line is not a record */ }
}
const record = which === 'latest' ? records.at(-1) : records.findLast(r => r.jobId === which || r.jobId === `ej_${which.replace(/^ej_/, '')}`);
if (!record) { console.log(`no blueprint record ${which === 'latest' ? '' : `for ${which} `}in ${LOG} (${records.length} records there)`); process.exit(1); }

if (flag('blueprint')) {
  const final = finals.get(record.jobId);
  if (!final) { console.log(`run ${record.jobId} has no final blueprint (${record.passed ? 'it ran before the final blueprint was saved' : 'it did not pass checks 1 to 9'}; --full shows the answers)`); process.exit(1); }
  console.log(JSON.stringify(final, null, 2)); process.exit(0);
}
const parse = text => { try { return JSON.parse(text); } catch { return null; } };
const out = (title, value) => console.log(`\n== ${title}\n${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`);
console.log(`run ${record.jobId}: ${record.passed ? 'PASSED checks 1 to 9' : 'did NOT pass checks 1 to 9'}`);
console.log(`prompt: ${record.prompt}\ndepth: ${record.depth}   model: ${record.model} (${record.effort})   seed: ${record.seed}   seconds: ${record.seconds}   cost: $${record.costUsd.toFixed(4)}`);
out('dice', record.dice ?? 'not reached');
out('calls', record.calls.map(c => `${c.kind}: ${c.ok ? 'answered' : `FAILED ${c.error}`}, ${c.seconds} s, ${c.tokens ? `${c.tokens.input} in + ${c.tokens.thinking} thinking + ${c.tokens.output} out` : 'no usage'}, ${c.costUsd == null ? 'cost unknown' : `$${c.costUsd.toFixed(4)}`}`).join('\n'));
out('problems', record.problems.length ? record.problems.map((p, k) => `${k + 1}. ${p}`).join('\n') : 'none');
const finalRaw = record.blueprint.final === 'first' ? record.blueprint.first?.raw : record.blueprint.corrected?.raw ?? record.blueprint.first?.raw; // a pass gives its answer; a run that did not pass shows the last answer
const blueprint = finalRaw ? parse(finalRaw) : null;
if (blueprint) {
  console.log(`\n== blueprint (${record.blueprint.final ?? (record.blueprint.corrected ? 'corrected, not passed' : 'first, not passed')}): "${blueprint.lesson?.title ?? ''}"; controls: ${(blueprint.inputs ?? []).map(i => i.id).join(', ') || 'none'}`);
  console.log(JSON.stringify(blueprint, null, 2));
} else out('blueprint', finalRaw ? `not valid JSON; the answer as returned:\n${finalRaw}` : 'none (no blueprint call answered)');
if (flag('full')) {
  out('quantities answer (exactly as returned)', record.quantities?.raw ?? 'none');
  out('first blueprint answer (exactly as returned)', record.blueprint.first?.raw ?? 'none');
  out('corrected blueprint answer (exactly as returned)', record.blueprint.corrected?.raw ?? 'none');
  out('checker output, first answer', record.checks.first ?? 'none'); out('checker output, corrected answer', record.checks.corrected ?? 'none');
}
