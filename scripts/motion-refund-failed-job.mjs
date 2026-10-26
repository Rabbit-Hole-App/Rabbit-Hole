// Refunds the learner for the failed production Motion job 61f701710ba30bfa591a992844509c0d (owner brief 2026-10-25).
//
// What happened: the job stopped on OUR per-job ceiling (a configuration failure, now code job_ceiling_insufficient), yet the old code charged the
// learner the provider cost it had already incurred: 1,278,157 micro-USD, 127.8 credits, attempt status `failed`, charge_class `would_charge`. The
// US$8.96 "reservation released" on the card was the hold, not a refund. From this release on such a failure charges nothing (learn-video.js
// zeroCredit); this script gives back the one charge made before.
//
//   node scripts/motion-refund-failed-job.mjs <dev|prod> act-c0f759ed-5ce7-4b65-bce0-028745e2c5c1                (dry run: reads, prints the plan, writes nothing)
//   node scripts/motion-refund-failed-job.mjs <dev|prod> act-c0f759ed-5ce7-4b65-bce0-028745e2c5c1 --dry-run      (the same, explicit)
//   node scripts/motion-refund-failed-job.mjs <dev|prod> act-c0f759ed-5ce7-4b65-bce0-028745e2c5c1 --apply        (writes the refund)
//
// Nothing here runs by itself and the lane that wrote it did not run it. `--apply` against prod is an OWNER command.
//
// It uses refundAttempt (learn-usage.js), the existing refund path: the attempt's settled cost stays as recorded (the provider expense is
// preserved), usage_attempt_detail.refunded_micros says how much is given back, the balance counts cost - refunded as used, and one
// usage_adjustments row (micros negative, with the reason) is the audit line. Idempotent: a second run finds refunded_micros set and changes
// nothing. It refuses every action but the one named above (ALLOWED), and refuses the one named above unless the rows are exactly what the
// diagnosis recorded (one attempt, feature video, would_charge, failed, settled at 1,278,157 micros). A dry run is structurally read-only:
// its runner rejects anything that is not a single SELECT. Credentials are read by NAME from the owner credentials file and never printed.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ALLOWED = Object.freeze({
  'act-c0f759ed-5ce7-4b65-bce0-028745e2c5c1': Object.freeze({ job: '61f701710ba30bfa591a992844509c0d', micros: 1_278_157 }),
});
export const REASON = 'motion job 61f701710ba30bfa591a992844509c0d failed on our per-job ceiling (job_ceiling_insufficient), a configuration failure of ours; the learner is not charged for it';
const ACTION = /^act-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// -> {action, apply} or {error}. Exactly: <dev|prod> <action> [--dry-run|--apply]. Nothing is read from the environment: no flag, file or variable confirms anything.
export function parseArgs(argv) {
  const [which, action, ...flags] = argv;
  if (!['dev', 'prod'].includes(which)) return { error: 'usage: motion-refund-failed-job.mjs <dev|prod> <action id> [--dry-run|--apply]' };
  if (!ACTION.test(action || '')) return { error: `not an action id: ${action}` };
  if (flags.some(flag => !['--dry-run', '--apply'].includes(flag)) || (flags.includes('--apply') && flags.includes('--dry-run')) || flags.length > 1) return { error: 'flags: --dry-run or --apply (one of them, or neither: a dry run)' };
  return { which, action, apply: flags[0] === '--apply' };
}

// A runner that can only read: one SELECT, nothing else. The dry run is given only this.
export const readOnly = run => sql => {
  if (!/^\s*SELECT\b/i.test(sql) || /;\s*\S/.test(sql)) throw new Error(`read-only runner refused a statement that is not a single SELECT: ${sql.slice(0, 60)}`);
  return run(sql);
};
const literal = value => {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  throw new Error(`cannot write ${typeof value} into a statement`);
};
// The D1 surface refundAttempt uses (prepare, bind, first, run) over a runner that takes SQL text: every ? is replaced by its value as a literal.
export const d1Over = run => ({
  prepare(text) {
    let args = [];
    const sql = () => {
      let i = 0;
      const out = text.replace(/\?/g, () => { if (i >= args.length) throw new Error('missing bound value'); return literal(args[i++]); });
      if (i !== args.length) throw new Error('more bound values than placeholders');
      return out;
    };
    return { bind(...values) { args = values; return this; }, first: async () => run(sql()).results?.[0] ?? null, run: async () => ({ meta: { changes: run(sql()).meta?.changes ?? 0 } }) };
  },
});

const plural = n => `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} credit${n === 1 ? '' : 's'}`;
// The rows of the action, checked against what the diagnosis recorded. -> {ok: true, state: 'refund'|'done', attempt...} | {ok: false, reason}
export function readPlan(run, action) {
  const known = ALLOWED[action];
  if (!known) return { ok: false, reason: `refused: ${action} is not the action this script is for (${Object.keys(ALLOWED).join(', ')})` };
  const found = run(`SELECT a.action_id, a.user_id, a.feature, a.charge_class, a.status AS action_status, a.period, t.attempt_id, t.status AS attempt_status, t.cost_state, t.cost_micros,
      COALESCE(d.refunded_micros, 0) AS refunded_micros FROM usage_actions a JOIN usage_attempts t ON t.action_id = a.action_id
      LEFT JOIN usage_attempt_detail d ON d.attempt_id = t.attempt_id WHERE a.action_id = ${literal(action)}`).results ?? [];
  if (found.length !== 1) return { ok: false, reason: `refused: expected exactly one attempt for ${action}, found ${found.length}` };
  const [row] = found;
  const wrong = [['feature', row.feature, 'video'], ['charge_class', row.charge_class, 'would_charge'], ['attempt status', row.attempt_status, 'failed'], ['cost_state', row.cost_state, 'settled'], ['cost_micros', Number(row.cost_micros), known.micros]]
    .filter(([, got, want]) => got !== want).map(([name, got, want]) => `${name} is ${got}, expected ${want}`);
  if (wrong.length) return { ok: false, reason: `refused: the rows are not the failed job the diagnosis recorded (${wrong.join('; ')})` };
  const micros = Number(row.cost_micros), refunded = Number(row.refunded_micros);
  // refundAttempt refunds once (its UPDATE matches refunded_micros = 0): a part-refunded charge is the owner's to look at, never topped up blindly.
  if (refunded > 0 && refunded < micros) return { ok: false, reason: `refused: ${refunded} of ${micros} micro-USD were already refunded; refundAttempt refunds once, so this needs a manual adjustment` };
  return { ok: true, state: refunded >= micros ? 'done' : 'refund', attempt_id: row.attempt_id, user_id: row.user_id, period: row.period, micros, refunded_micros: refunded };
}

// Dry run (apply false): reads and reports. Apply: refundAttempt once, then reads the result back. -> {exit, lines}
export async function reconcile({ run, action, apply, refund, now = Math.floor(Date.now() / 1000) }) {
  const lines = [];
  const say = line => lines.push(line);
  const read = apply ? run : readOnly(run); // the dry run cannot be handed anything that writes
  const plan = readPlan(read, action);
  if (!plan.ok) { say(plan.reason); return { exit: 1, lines }; }
  say(`${apply ? 'apply' : 'dry run'}: action ${action} (job ${ALLOWED[action].job}), period ${plan.period}`);
  say(`the attempt was charged ${plural(plan.micros / 10_000)} (${plan.micros} micro-USD); already refunded ${plural(plan.refunded_micros / 10_000)}`);
  if (plan.state === 'done') { say('nothing to do: this charge is already refunded in full'); return { exit: 0, lines }; }
  say(`would refund ${plural(plan.micros / 10_000)} (${plan.micros} micro-USD) through refundAttempt: refunded_micros on usage_attempt_detail and one usage_adjustments audit row; the settled cost stays as recorded`);
  if (!apply) { say('DRY RUN: nothing was written. Re-run with --apply to refund.'); return { exit: 0, lines }; }
  const given = await refund(d1Over(run), plan.attempt_id, { reason: REASON, now });
  const after = readPlan(run, action);
  say(`refunded ${plural(given / 10_000)} (${given} micro-USD)`);
  say(after.ok && after.state === 'done' ? 'verified: refunded_micros now equals the charge; a second run changes nothing' : `NOT VERIFIED: re-read the rows (${after.reason ?? after.state})`);
  return { exit: after.ok && after.state === 'done' && given === plan.micros ? 0 : 1, lines };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) { console.error(parsed.error); process.exit(2); }
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const { refundAttempt } = await import(pathToFileURL(`${ROOT}packages/control-plane/src/learn-usage.js`).href);
  const text = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
  const env = { ...process.env };
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    const m = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (!m) { console.error(`${name} missing`); process.exit(2); }
    env[name] = m[1].trim().replace(/^['"]|['"]$/g, '');
  }
  const [database, config] = parsed.which === 'prod' ? ['rabbit-hole-learn-prod', 'wrangler.rabbit-hole-prod.jsonc'] : ['rabbit-hole-learn-dev', 'wrangler.dev.jsonc'];
  const run = sql => {
    const r = spawnSync(process.execPath, [`${ROOT}node_modules/wrangler/bin/wrangler.js`, 'd1', 'execute', database, '--remote', '--config', config, '--json', '--command', sql],
      { cwd: `${ROOT}packages/web`, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = r.stdout.slice(r.stdout.indexOf('['));
    if (r.status !== 0 || !out) { console.error(`wrangler failed (${r.status}); stderr tail:\n${(r.stderr || '').slice(-400)}`); process.exit(1); }
    return JSON.parse(out)[0];
  };
  console.log(`${parsed.which} (${database}) at ${new Date().toISOString()}`);
  const { exit, lines } = await reconcile({ run, action: parsed.action, apply: parsed.apply, refund: refundAttempt });
  for (const line of lines) console.log(line);
  process.exit(exit);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
