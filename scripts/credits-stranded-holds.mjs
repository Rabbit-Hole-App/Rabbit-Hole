// Stranded customer reservations (Credits, owner decision 2026-10-25): what the learner-side release changes, and the idempotent
// reconciliation for what the code alone does not touch.
//   node scripts/credits-stranded-holds.mjs report   <dev|prod>            read-only: SELECT only; counts and credits, no user content
//   node scripts/credits-stranded-holds.mjs reconcile <dev|prod>           DRY RUN: the same counts for the rows it would seal
//   node scripts/credits-stranded-holds.mjs reconcile <dev|prod> --apply   seals them: ONE guarded UPDATE, safe to repeat
// Nothing here runs by itself. `--apply` against prod is an owner command (prepared, not run by the Credits lane).
//
// What each number means after the fix (learn-usage.js, docs/features/credits-2500.md "A provider failure after admission"):
//   unknown holds   ended attempts with cost_state 'unknown' that the OLD balance held. The new code holds nothing for them the
//                   moment it is deployed; nothing to write. Reported so the credits given back can be seen.
//   stale running   attempts still 'running' past their operation's bound (HOLD_SECONDS by feature). The new balance already
//                   ignores them; --apply seals them (failed, cost unknown/NULL, settled_at = now) so a late result cannot charge.
//   active running  attempts running within their bound: preserved, never touched.
// Preserved by --apply: every settled charge, every refund, every grant, every reserved_micros and model/provider field (the
// provider-cost evidence). It writes status, cost_state, cost_micros (NULL) and settled_at on stale running attempts only, and
// the statement's own guard (status = 'running') makes a second run change nothing.
// Credentials are taken by NAME from the owner credentials file and never printed.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [mode, which, ...flags] = process.argv.slice(2);
if (!['report', 'reconcile'].includes(mode) || !['dev', 'prod'].includes(which)) { console.error('usage: credits-stranded-holds.mjs report|reconcile dev|prod [--apply]'); process.exit(2); }
const apply = flags.includes('--apply');
if (apply && mode !== 'reconcile') { console.error('--apply belongs to reconcile'); process.exit(2); }
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { HOLD_SECONDS, HOLD_BACKSTOP_SECONDS, holdCase, staleHoldWhere } = await import(pathToFileURL(`${ROOT}packages/control-plane/src/learn-usage.js`).href);
const text = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const env = { ...process.env };
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
  const m = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!m) { console.error(`${name} missing`); process.exit(2); }
  env[name] = m[1].trim().replace(/^['"]|['"]$/g, '');
}
const [database, config] = which === 'prod' ? ['rabbit-hole-learn-prod', 'wrangler.rabbit-hole-prod.jsonc'] : ['rabbit-hole-learn-dev', 'wrangler.dev.jsonc'];
const run = sql => {
  const r = spawnSync(process.execPath, [`${ROOT}node_modules/wrangler/bin/wrangler.js`, 'd1', 'execute', database, '--remote', '--config', config, '--json', '--command', sql],
    { cwd: `${ROOT}packages/web`, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = r.stdout.slice(r.stdout.indexOf('['));
  if (r.status !== 0 || !out) { console.error(`wrangler failed (${r.status}); stderr tail:\n${(r.stderr || '').slice(-400)}`); process.exit(1); }
  return JSON.parse(out)[0];
};
const now = Math.floor(Date.now() / 1000);
const credits = micros => Number(micros || 0) / 10_000;
// The report's twin of staleHoldWhere (same bound, aliased t/a for the join).
const pastBound = `t.cost_state = 'reserved' AND t.status = 'running' AND ${now} - t.started_at >= (${holdCase})`;
const withinBound = `t.cost_state = 'reserved' AND t.status = 'running' AND ${now} - t.started_at < (${holdCase})`;
const scope = "FROM usage_attempts t JOIN usage_actions a ON a.action_id = t.action_id WHERE a.charge_class = 'would_charge'";
const count = (label, where) => {
  const row = run(`SELECT COUNT(DISTINCT a.user_id) AS accounts, COUNT(*) AS attempts, COALESCE(SUM(t.reserved_micros), 0) AS micros ${scope} AND ${where}`).results[0];
  console.log(`${label.padEnd(44)} accounts ${String(row.accounts).padStart(4)}  attempts ${String(row.attempts).padStart(5)}  credits ${credits(row.micros).toLocaleString('en-US')}`);
  return row;
};
console.log(`${mode}${apply ? ' --apply' : ''} on ${which} (${database}) at ${new Date(now * 1000).toISOString()}; bounds ${JSON.stringify(HOLD_SECONDS)}, backstop ${HOLD_BACKSTOP_SECONDS}s`);
count("unknown holds the old balance kept, all months", "t.cost_state = 'unknown' AND t.reserved_micros > 0");
count("  of those, in the current month", `t.cost_state = 'unknown' AND t.reserved_micros > 0 AND a.period = '${new Date(now * 1000).toISOString().slice(0, 7)}'`);
const staleRow = count("stale running past their bound (sealed)", pastBound);
count("active running within their bound (preserved)", withinBound);
count("settled charges (never touched)", "t.cost_state = 'settled'");
if (mode === 'report' || !apply) {
  if (mode === 'reconcile') console.log(`DRY RUN: would seal ${staleRow.attempts} attempt(s) for ${staleRow.accounts} account(s), ${credits(staleRow.micros).toLocaleString('en-US')} credits. Re-run with --apply to write.`);
  process.exit(0);
}
const result = run(`UPDATE usage_attempts SET status = 'failed', cost_state = 'unknown', cost_micros = NULL, settled_at = ${now}
  WHERE ${staleHoldWhere(now)}`);
console.log(`sealed ${result.meta?.changes ?? '?'} attempt(s). Run \`report ${which}\` again: stale running must read 0 and the other counts must not have changed.`);
