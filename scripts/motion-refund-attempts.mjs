// PROPOSED, NOT APPROVED (feat/motion-billing-correction). Refunds the learner for Motion attempts the owner has CONFIRMED were charged against
// the proposed billing policy (docs/features/rabbit-hole-motion-v1-harness-spec.md "Billing correction"). Modelled on motion-refund-failed-job.mjs.
//
//   node scripts/motion-refund-attempts.mjs <dev|prod> <action id>              dry run (default): reads, prints the plan, writes nothing
//   node scripts/motion-refund-attempts.mjs <dev|prod> <action id> --dry-run    the same, explicit
//   node scripts/motion-refund-attempts.mjs <dev|prod> <action id> --apply      refunds, ONLY for an action listed in CONFIRMED
//
// Eligibility is an explicit list in this file, never inferred: CANDIDATES are charges under suspicion with the rows the diagnosis recorded;
// CONFIRMED names the candidates the owner has confirmed eligible, each with its evidence. Confirming one is a reviewed commit to this file:
// no flag, file or environment variable can confirm anything. As committed, NOTHING is confirmed: job 1's sub-cause and job 2's stop origin are
// unknown, so a dry run lists both as CANDIDATE, NOT CONFIRMED and --apply refuses them before reading or writing anything.
//
// The refund is refundAttempt (learn-usage.js): the attempt's settled cost stays as recorded (the provider expense is never zeroed),
// usage_attempt_detail.refunded_micros says how much is given back and one usage_adjustments row (negative micros, the reason) is the audit
// line. Exactly once: a second run finds refunded_micros set and changes nothing. The dry run's runner rejects anything but a single SELECT.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { d1Over, readOnly } from './motion-refund-failed-job.mjs';

const OWNER = 'dda2350771a4066e3080c605ba092e0a'; // the learner of both jobs (production read 2026-10-27, integrator)
export const CANDIDATES = Object.freeze({
  'act-8f6d6c98-b6cd-49c2-afde-714d076bce4c': Object.freeze({ job: 'e3a2f10ec8cc5519cb28520c41427e41', operation: 'motion-daeecd76-af4c-4235-9dae-feea0f433fb0', user: OWNER, micros: 1_397_401, status: 'failed',
    billingClass: 1, reason: 'motion_composition_limits_no_result',
    // Recovered 2026-10-27 from LEARN_MEDIA by exact key (read-only): the saved artifact of this orchestrator job. It names OUR static composition gate (composition-limits.js,
    // allowed class 'simple' only), with no reviewer finding: not the learner's request, not a model content judgement. It is evidence, not a confirmation.
    evidence: Object.freeze({ key: 'learn-video-dev/586fc2bcf8df9eec60eb961cd59f294401240dddfd06b947dd6ab041ebc1b1aa/542ad8a879ee9a8ca6b1a96612f42d5ae09b41578bf8cf4f9ec7994a46949104.motion/e3a2f10ec8cc5519cb28520c41427e41.json',
      sha256: 'b4480103131d8f3140605a5fc05f7cfd56d65bd761ab74d2389abe73d2210073', failure_code: 'content_rejected', failure_reason: 'composition limits: the composition is standard, which is not covered for these settings (covered: simple)', findings: 0, blocking: 0 }),
    pending: 'the saved artifact shows our composition-limits gate refused the video (class standard, covered: simple) with no reviewer finding, so it meets the proposed zero-credit rule for our own restriction; the owner has not confirmed the refund' }),
  'act-9a25fc26-9abd-4a04-a6d3-588a360997ac': Object.freeze({ job: '9b739bc92b2431442273e58435969d54', operation: 'motion-66699755-90f0-480d-bb0d-8c97ba4947fc', user: OWNER, micros: 1_018_218, status: 'failed',
    billingClass: 4, reason: 'motion_stop_not_by_learner_no_result',
    pending: 'job 2 was stopped 0.22 s after it started; whether the learner pressed Stop and confirmed it (class 3) or the stop came from elsewhere (class 4) is unknown' }),
});
// action id -> the evidence that confirms it (a receipt path or a decision line). Empty: nothing is eligible.
export const CONFIRMED = Object.freeze({});
const ACTION = /^act-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// -> {which, action, apply} or {error}. Exactly: <dev|prod> <action> [--dry-run|--apply]. Nothing is read from the environment.
export function parseArgs(argv) {
  const [which, action, ...flags] = argv;
  if (!['dev', 'prod'].includes(which)) return { error: 'usage: motion-refund-attempts.mjs <dev|prod> <action id> [--dry-run|--apply]' };
  if (!ACTION.test(action || '')) return { error: `not an action id: ${action}` };
  if (flags.length > 1 || flags.some(flag => !['--dry-run', '--apply'].includes(flag))) return { error: 'flags: --dry-run or --apply (one of them, or neither: a dry run)' };
  return { which, action, apply: flags[0] === '--apply' };
}

const credits = micros => `${(micros / 10_000).toLocaleString('en-US', { maximumFractionDigits: 4 })} credits`;
// The action's rows, checked against what the diagnosis recorded. -> {ok: true, state: 'refund'|'done', ...} | {ok: false, reason}
export function readPlan(run, action, known) {
  const q = `'${action}'`; // ACTION-validated: hex, digits and dashes only
  const found = run(`SELECT a.action_id, a.user_id, a.feature, a.charge_class, a.period, t.attempt_id, t.status AS attempt_status, t.cost_state, t.cost_micros,
      COALESCE(d.refunded_micros, 0) AS refunded_micros FROM usage_actions a JOIN usage_attempts t ON t.action_id = a.action_id
      LEFT JOIN usage_attempt_detail d ON d.attempt_id = t.attempt_id WHERE a.action_id = ${q}`).results ?? [];
  if (found.length !== 1) return { ok: false, reason: `refused: expected exactly one attempt for ${action}, found ${found.length}` };
  const [row] = found;
  const wrong = [['user_id', row.user_id, known.user], ['feature', row.feature, 'video'], ['charge_class', row.charge_class, 'would_charge'], ['attempt status', row.attempt_status, known.status],
    ['cost_state', row.cost_state, 'settled'], ['cost_micros', Number(row.cost_micros), known.micros]].filter(([, got, want]) => got !== want).map(([name, got, want]) => `${name} is ${got}, expected ${want}`);
  if (wrong.length) return { ok: false, reason: `refused: the rows are not the charge the diagnosis recorded (${wrong.join('; ')})` };
  const micros = Number(row.cost_micros), refunded = Number(row.refunded_micros);
  if (refunded > 0 && refunded < micros) return { ok: false, reason: `refused: ${refunded} of ${micros} micro-USD were already refunded; refundAttempt refunds once, so this needs a manual adjustment` };
  return { ok: true, state: refunded >= micros ? 'done' : 'refund', attempt_id: row.attempt_id, period: row.period, micros, refunded_micros: refunded };
}

// Dry run (apply false): reads and reports. Apply: only a CONFIRMED candidate, refused before any read otherwise; refundAttempt once, then read back.
// confirmedList exists for the in-memory test only; main() never passes it, and no argument, file or variable reaches it.
export async function reconcile({ run, action, apply, refund, now = Math.floor(Date.now() / 1000), confirmedList = CONFIRMED }) {
  const lines = [], say = line => lines.push(line);
  const known = CANDIDATES[action], confirmed = known ? confirmedList[action] : undefined;
  if (!known) { say(`refused: ${action} is not a refund candidate (${Object.keys(CANDIDATES).join(', ')})`); return { exit: 1, lines }; }
  if (apply && !confirmed) { say(`REFUSED: ${action} (job ${known.job}) is a CANDIDATE, NOT CONFIRMED eligible: ${known.pending}. Nothing was read or written.`); return { exit: 1, lines }; }
  const plan = readPlan(apply ? run : readOnly(run), action, known);
  if (!plan.ok) { say(plan.reason); return { exit: 1, lines }; }
  say(`${apply ? 'apply' : 'dry run'}: action ${action} (job ${known.job}, operation ${known.operation}), period ${plan.period}, billing class ${known.billingClass}`);
  say(confirmed ? `CONFIRMED eligible: ${confirmed}` : `CANDIDATE, NOT CONFIRMED: ${known.pending}`);
  if (known.evidence) say(`evidence (recovered artifact, sha256 ${known.evidence.sha256}): ${known.evidence.failure_reason}; findings ${known.evidence.findings}, blocking ${known.evidence.blocking}; key ${known.evidence.key}`);
  say(`the attempt was charged ${credits(plan.micros)} (${plan.micros} micro-USD); already refunded ${credits(plan.refunded_micros)}`);
  if (plan.state === 'done') { say('nothing to do: this charge is already refunded in full'); return { exit: 0, lines }; }
  say(`${confirmed ? 'would refund' : 'if confirmed, would refund'} ${credits(plan.micros)} (${plan.micros} micro-USD) through refundAttempt, reason ${known.reason}: refunded_micros on usage_attempt_detail and one usage_adjustments audit row; the settled cost stays as recorded`);
  if (!apply) { say(`DRY RUN: nothing was written.${confirmed ? ' Re-run with --apply to refund.' : ' --apply is refused until this action is confirmed in CONFIRMED.'}`); return { exit: 0, lines }; }
  const given = await refund(d1Over(run), plan.attempt_id, { reason: known.reason, now });
  const after = readPlan(run, action, known);
  say(`refunded ${credits(given)} (${given} micro-USD)`);
  say(after.ok && after.state === 'done' ? 'verified: refunded_micros now equals the charge; a second run changes nothing' : `NOT VERIFIED: re-read the rows (${after.reason ?? after.state})`);
  return { exit: after.ok && after.state === 'done' && given === plan.micros ? 0 : 1, lines };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) { console.error(parsed.error); process.exit(2); }
  // Refused before any credential is read: an unconfirmed apply never reaches the database.
  if (parsed.apply && !(CANDIDATES[parsed.action] && CONFIRMED[parsed.action])) { const { lines } = await reconcile({ run: null, action: parsed.action, apply: true, refund: null }); for (const line of lines) console.log(line); process.exit(1); }
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
