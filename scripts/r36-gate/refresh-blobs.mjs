// Refreshes the audited git blob of every retry-safe check in templates/transients.json from an application commit. Run it
// after the evidence lines of the checks that changed were re-read (a stage whose blob differs from the candidate's is not retried).
//   node scripts/r36-gate/refresh-blobs.mjs <application commit> [--repo <application checkout>] [--write]
// Without --write it only prints which blobs would change. Evidence lines and the `audited` note are edited by hand.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRANSIENTS = fileURLToPath(new URL('./templates/transients.json', import.meta.url));

// transients.json as it is committed: one line per stage in the two audit tables, every other key on one line.
export function formatTransients(cfg) {
  const entries = (table) => Object.entries(table).map(([stage, value], i, all) => `    ${JSON.stringify(stage)}: ${JSON.stringify(value)}${i < all.length - 1 ? ',' : ''}`);
  const keys = Object.keys(cfg);
  const body = keys.flatMap((key, i) => {
    const comma = i < keys.length - 1 ? ',' : '';
    if (key === 'retrySafe' || key === 'notRetrySafe') return [`  ${JSON.stringify(key)}: {`, ...entries(cfg[key]), `  }${comma}`];
    return [`  ${JSON.stringify(key)}: ${JSON.stringify(cfg[key])}${comma}`];
  });
  return ['{', ...body, '}', ''].join('\n');
}

// -> the config with each retry-safe entry's blob read from blobOf(file) (a git blob id, or null when the file is not there), the
// stages whose blob changed, and the stages whose file is missing (their entry is left as it was).
export function refreshBlobs(cfg, blobOf) {
  const changes = [], missing = [], retrySafe = {};
  for (const [stage, entry] of Object.entries(cfg.retrySafe)) {
    const blob = entry.owner === 'harness' ? entry.blob : blobOf(entry.file);
    if (!blob) { missing.push(stage); retrySafe[stage] = entry; continue; }
    if (blob !== entry.blob) changes.push({ stage, file: entry.file, from: entry.blob, to: blob });
    retrySafe[stage] = { ...entry, blob };
  }
  return { cfg: { ...cfg, retrySafe }, changes, missing };
}

if (process.argv[1] && basename(process.argv[1]) === 'refresh-blobs.mjs') {
  const args = process.argv.slice(2), write = args.includes('--write');
  const at = args.indexOf('--repo'), repo = at >= 0 ? args[at + 1] : process.cwd();
  const commit = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--repo');
  if (!commit) { console.error('usage: node scripts/r36-gate/refresh-blobs.mjs <application commit> [--repo <application checkout>] [--write]'); process.exit(2); }
  const blobOf = file => { const r = spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', `${commit}:${file}`], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
  const { cfg, changes, missing } = refreshBlobs(JSON.parse(readFileSync(TRANSIENTS, 'utf8')), blobOf);
  for (const c of changes) console.log(`${c.stage}: ${c.file} ${c.from.slice(0, 8)} -> ${c.to.slice(0, 8)}`);
  for (const stage of missing) console.log(`${stage}: not in ${commit}, left as it was`);
  console.log(changes.length ? `${changes.length} blob(s) ${write ? 'written' : 'would change (add --write)'}; re-read their evidence lines and the audited note first` : 'every blob is current');
  if (write && changes.length) writeFileSync(TRANSIENTS, formatTransients(cfg));
}
