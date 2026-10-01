// Paid benchmark driver (owner GO BENCHMARK 2026-10-01, plan at 6f948c69). One run at a time.
// Order: rep 1 of A..F, rep 2, rep 3 (full corpus), then routine-only reps 4 and 5 of A..F.
// Before every run: free memory >= 2 GB, and projected total cost (spent + every remaining run at the
// observed per-turn cost of its arm, or the plan's expected per-turn cost before the arm has data)
// <= $65. An arm whose run was aborted (refused, never retried) is skipped from then on.
// Results stay in OUT (per-trace JSONL appends inside the runner); a resumed driver skips finished runs.
// Usage (PAID, only after GO BENCHMARK): node e2e/tutor-bench-driver.mjs <absolute out dir>
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.argv[2];
if (!OUT) throw Error('usage: node e2e/tutor-bench-driver.mjs <absolute out dir>');
const LOG = `${OUT}/driver.log`;
const BUDGET = 65, FULL = 44, ROUTINE = 11;
const ARMS = ['A', 'B', 'C', 'D', 'E', 'F'];
// plan expected cost per turn (154 turns per arm)
const PLAN_PER_TURN = { A: 5.2 / 154, B: 4.4 / 154, C: 8.1 / 154, D: 3.3 / 154, E: 4.3 / 154, F: 3.6 / 154 };
const runs = [];
for (const rep of [1, 2, 3]) for (const arm of ARMS) runs.push({ arm, stage: `${arm}-r${rep}`, group: null, turns: FULL });
for (const rep of [4, 5]) for (const arm of ARMS) runs.push({ arm, stage: `${arm}-routine-r${rep}`, group: 'routine', turns: ROUTINE });

const log = line => { const text = `${new Date().toISOString()} ${line}`; console.log(text); appendFileSync(LOG, text + '\n'); };
const rowsOf = stage => { const file = `${OUT}/corpus-live-${stage}.jsonl`; return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : []; };
const allRows = () => existsSync(OUT) ? readdirSync(OUT).filter(name => /^corpus-live-.*\.jsonl$/.test(name)).flatMap(name => rowsOf(name.slice(12, -6)).map(row => ({ ...row, _stage: name.slice(12, -6) }))) : [];
const freeGB = () => Number(execFileSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'], { encoding: 'utf8' }).trim()) / 1048576;
const finished = stage => existsSync(`${OUT}/corpus-live-${stage}.summary.json`);

mkdirSync(OUT, { recursive: true });
const dead = new Set();
for (const run of runs) {
  if (finished(run.stage)) { if (rowsOf(run.stage).some(row => row.run_aborted)) dead.add(run.arm); continue; }
  if (dead.has(run.arm)) { log(`skip ${run.stage}: arm ${run.arm} unavailable`); continue; }
  const rows = allRows();
  const spent = rows.reduce((n, row) => n + (row.cost_usd || 0), 0);
  const perTurn = arm => { const own = rows.filter(row => row._stage.startsWith(`${arm}-`)); return own.length ? own.reduce((n, row) => n + (row.cost_usd || 0), 0) / own.length : PLAN_PER_TURN[arm]; };
  const remaining = runs.filter(other => !finished(other.stage) && !dead.has(other.arm)).reduce((n, other) => n + perTurn(other.arm) * other.turns, 0);
  const free = freeGB();
  log(`next ${run.stage}: spent $${spent.toFixed(2)}, projected total $${(spent + remaining).toFixed(2)}, free memory ${free.toFixed(2)} GB`);
  if (free < 2) { log('STOP: free memory under 2 GB'); process.exit(3); }
  if (spent + remaining > BUDGET) { log(`STOP: projected total $${(spent + remaining).toFixed(2)} exceeds $${BUDGET}`); process.exit(4); }
  const args = ['e2e/tutor-corpus-run.mjs', '--live', '--candidate', run.arm, '--stage', run.stage, '--out', OUT, '--budget', String(BUDGET), '--resume', ...(run.group ? ['--group', run.group] : [])];
  const started = Date.now();
  const child = spawnSync('node', args, { cwd: WEB, env: { ...process.env, TUTOR_BENCH_PAID: 'GO' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const done = rowsOf(run.stage);
  const aborted = done.find(row => row.run_aborted)?.run_aborted;
  log(`done ${run.stage}: exit ${child.status}, ${done.length} rows, ${Math.round((Date.now() - started) / 1000)} s, run $${done.reduce((n, row) => n + (row.cost_usd || 0), 0).toFixed(3)}${aborted ? `, ABORTED: ${aborted}` : ''}`);
  if (child.status !== 0) log(`stderr tail: ${String(child.stderr || '').split('\n').slice(-6).join(' | ').slice(0, 600)}`);
  if (aborted && /^budget/.test(aborted)) { log('STOP: budget'); process.exit(4); }
  if (aborted) dead.add(run.arm);
  if (child.status !== 0 && !aborted) { log('STOP: runner failed; inspect before continuing'); process.exit(5); }
}
log('ALL RUNS DONE');
