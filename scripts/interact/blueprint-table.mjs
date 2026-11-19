// Brief 38 MVP 1: the results table of the blueprint run, made by script from what the run saved and nothing else (nothing judged).
//   node scripts/interact/blueprint-table.mjs [dir]      dir defaults to docs/features/interact/benchmarks/blueprint-mvp1; writes <dir>/table.md
// Reads: rows.jsonl (one row per call: arm, level, run or seed, kind first|corrected|quantities, seconds, tokens, cost), blueprints/<arm>-<level>-<n>.first.json and .corrected.json (the model's answers, exactly as returned),
// checks/<same stem>.json (the checker's result { ok, failed, problems }). A cell is P1 (the first answer passed), P2 (passed after the one correction), F<n> (the check that failed last) or F0 (not json), with the seconds
// of the first answer and the cost of the cell (first and correction calls); a dash is a run that was never made.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs/features/interact/benchmarks/blueprint-mvp1'));
const LEVELS = ['xhigh', 'high', 'medium', 'low'], ARMS = ['plain', 'seeded'];
const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; } };
const rows = existsSync(join(DIR, 'rows.jsonl')) ? readFileSync(join(DIR, 'rows.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).map(row => ({ ...row, kind: row.kind === 'blueprint' ? 'first' : row.kind === 'correction' ? 'corrected' : row.kind, cost: row.cost ?? row.costUsd ?? 0 })) : []; // bench-blueprint.mjs writes kind blueprint|correction|quantities|probe and costUsd
const files = name => (existsSync(join(DIR, name)) ? readdirSync(join(DIR, name)) : []);
const stemOf = (arm, level, n) => `${arm}-${level}-${n}`;
const number = value => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const sum = list => list.reduce((total, value) => total + number(value), 0);
const tokensOf = row => (typeof row.tokens === 'number' ? row.tokens : row.tokens && typeof row.tokens === 'object' ? sum(Object.values(row.tokens)) : 0);
const cell = text => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const dollars = value => `$${value.toFixed(2)}`, secs = value => `${value.toFixed(1)} s`;
const median = list => { const sorted = [...list].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : 0; };
const nOf = row => row.run ?? row.seed;

// what one answer file is: undefined (not made), null (made, not json), or the parsed blueprint
const answer = (stem, which) => {
  const path = join(DIR, 'blueprints', `${stem}.${which}.json`);
  if (!existsSync(path)) return undefined;
  const parsed = readJson(path);
  return parsed === undefined || parsed === null || typeof parsed !== 'object' ? null : parsed;
};
const check = (stem, which) => readJson(join(DIR, 'checks', `${stem}.${which}.json`)) ?? readJson(join(DIR, 'checks', `${stem}.json`));

// one cell of the grid: { text, blueprint, outcome: 'P1' | 'P2' | 'F' | null }
function cellOf(arm, level, n) {
  const stem = stemOf(arm, level, n), first = answer(stem, 'first'), corrected = answer(stem, 'corrected');
  if (first === undefined) return { text: '-', blueprint: undefined, outcome: null };
  const callRows = rows.filter(row => row.arm === arm && row.level === level && nOf(row) === n), firstRow = callRows.find(row => row.kind === 'first'), cost = sum(callRows.filter(row => row.kind === 'first' || row.kind === 'corrected').map(row => row.cost));
  const last = corrected !== undefined ? corrected : first, lastWhich = corrected !== undefined ? 'corrected' : 'first', result = last === null ? null : check(stem, lastWhich);
  let result_text, outcome;
  if (last === null) { result_text = 'F0 (not json)'; outcome = 'F'; }
  else if (result?.ok) { result_text = corrected !== undefined ? 'P2' : 'P1'; outcome = result_text; }
  else { result_text = `F${result?.failed ?? '?'}`; outcome = 'F'; }
  // a first answer that passed is P1 even when a later file exists; a corrected file only follows a first that did not pass
  if (first !== null && check(stem, 'first')?.ok) { result_text = 'P1'; outcome = 'P1'; }
  return { text: `${result_text}, ${firstRow ? secs(number(firstRow.seconds)) : '? s'}, ${dollars(cost)}`, blueprint: last ?? undefined, outcome, seconds: firstRow ? number(firstRow.seconds) : null, cost };
}

const controlsOf = blueprint => (blueprint.inputs ?? []).map(input => `${input.id} ${input.type === 'number' ? `${input.min} to ${input.max}` : input.type === 'select' ? (input.options ?? []).map(option => option.value).join(' / ') : input.type === 'boolean' ? 'on / off' : input.type}`).join('; ') || 'none';
const formulaOf = blueprint => (blueprint.relationship?.formula === null ? 'none' : blueprint.relationship?.formula ?? '?');
const partsOf = blueprint => (blueprint.pictures?.main?.parts ?? []).map(part => part.type).join(', ') || 'none';

const out = [`# Blueprint MVP 1: results`, '', `Made by \`scripts/interact/blueprint-table.mjs\` from ${DIR.replace(/\\/g, '/')}. A cell is the result, the seconds of the first answer and the cost of the cell (first answer and correction). P1: the first answer passed the checker. P2: it passed after the one correction. F<n>: it failed; n is the check that failed last. F0 (not json): the answer is not JSON. A dash: never run.`, ''];
const totals = [];
for (const arm of ARMS) {
  const runs = Math.max(5, ...files('blueprints').filter(name => name.startsWith(`${arm}-`)).map(name => Number(name.split('.')[0].split('-')[2]) || 0));
  const grid = {};
  for (const level of LEVELS) for (let n = 1; n <= runs; n++) grid[`${level}/${n}`] = cellOf(arm, level, n);
  out.push(`## ${arm === 'plain' ? 'Plain arm' : 'Seeded arm'}`, '', `| ${arm === 'plain' ? 'Run' : 'Seed'} | ${LEVELS.join(' | ')} |`, `|---|${LEVELS.map(() => '---').join('|')}|`);
  for (let n = 1; n <= runs; n++) out.push(`| ${n} | ${LEVELS.map(level => cell(grid[`${level}/${n}`].text)).join(' | ')} |`);
  out.push('', `### ${arm === 'plain' ? 'Plain' : 'Seeded'} arm: what each answer is (copied from the blueprint, nothing judged)`, '', `| Level | ${arm === 'plain' ? 'Run' : 'Seed'} | Result | Controls | Formula | Parts |`, '|---|---|---|---|---|---|');
  for (const level of LEVELS) for (let n = 1; n <= runs; n++) {
    const one = grid[`${level}/${n}`];
    if (one.text === '-') continue;
    const b = one.blueprint;
    out.push(`| ${level} | ${n} | ${cell(one.text.split(',')[0])} | ${b ? cell(controlsOf(b)) : '-'} | ${b ? cell(formulaOf(b)) : '-'} | ${b ? cell(partsOf(b)) : '-'} |`);
  }
  out.push('', `### ${arm === 'plain' ? 'Plain' : 'Seeded'} arm: totals per level`, '', '| Level | Passed first | Passed after correction | Failed | Median seconds (first answer) | Tokens | Cost |', '|---|---|---|---|---|---|---|');
  for (const level of LEVELS) {
    const cells = Array.from({ length: runs }, (_, k) => grid[`${level}/${k + 1}`]).filter(one => one.outcome), levelRows = rows.filter(row => row.arm === arm && row.level === level), cost = sum(levelRows.map(row => row.cost));
    out.push(`| ${level} | ${cells.filter(one => one.outcome === 'P1').length} | ${cells.filter(one => one.outcome === 'P2').length} | ${cells.filter(one => one.outcome === 'F').length} | ${cells.length ? secs(median(cells.map(one => one.seconds).filter(value => value !== null))) : "-"} | ${sum(levelRows.map(tokensOf))} | ${dollars(cost)} |`);
  }
  const quantities = rows.filter(row => row.arm === arm && row.kind === 'quantities');
  if (quantities.length) out.push('', `The first call of this arm (the quantities, one per level) is counted in the cost of its level: ${quantities.map(row => `${row.level} ${secs(number(row.seconds))}, ${dollars(number(row.cost))}`).join('; ')}.`);
  out.push('');
  totals.push(sum(rows.filter(row => row.arm === arm).map(row => row.cost)));
}
const all = sum(rows.map(row => row.cost)), counted = totals.reduce((a, b) => a + b, 0);
out.push('## Total', '', `Calls: ${rows.length}. Total cost: ${dollars(all)}${Math.abs(all - counted) > 0.005 ? ` (${dollars(all - counted)} of it is in no arm: the probes)` : ''}.`, '');
writeFileSync(join(DIR, 'table.md'), out.join('\n'));
console.log(join(DIR, 'table.md'));
