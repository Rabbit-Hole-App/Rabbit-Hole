// One-off (owner brief 2026-11-13 13:40, section 1): the ledger rows recorded before timing v2 keep their numbers, are marked timing=v1, and get the new columns: repairCauses is read off the job's saved
// findings (the detail=1 JSON under docs/features/interact/evidence/**/job-<id>*.json); a row with no saved job keeps repairCauses empty only when it made no repair, else null (not recorded).
//   node scripts/interact/ledger-backfill.mjs
// Idempotent: a row that already carries a timing marker is left as it is.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LEDGER_COLUMNS, repairCauses } from '../../packages/control-plane/src/interact-ledger.js';
import { LEDGER_DIR, writeRows } from './ledger.mjs';

const EVIDENCE = join(LEDGER_DIR, '..', 'evidence');
const jobFiles = (dir = EVIDENCE) => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? jobFiles(path) : /^job-ej_\w+.*\.json$/.test(name) ? [path] : [];
});
const saved = new Map();
for (const path of jobFiles()) {
  const id = /job-(ej_\w+?)(?:-|\.json)/.exec(path.split(/[\\/]/).at(-1))?.[1];
  const findings = JSON.parse(readFileSync(path, 'utf8')).diagnostics?.findings;
  if (id && findings && !saved.get(id)) saved.set(id, findings);
}
const rows = readFileSync(join(LEDGER_DIR, 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
let filled = 0, missing = 0;
const next = rows.map(row => {
  if (row.timing) return row;
  const findings = saved.get(row.jobId);
  if (findings) filled += 1; else if (row.repairs) missing += 1;
  const repairCause = findings ? repairCauses(findings) : row.repairs ? null : '';
  const out = { ...row, repairCauses: repairCause, msCompose: null, msJudge: null, timing: 'v1' };
  return Object.fromEntries(LEDGER_COLUMNS.map(column => [column, out[column] ?? null]));
});
writeRows(next);
console.log(`ledger backfill: ${next.length} rows, repairCauses read from ${filled} saved jobs, ${missing} rows with repairs and no saved job`);
