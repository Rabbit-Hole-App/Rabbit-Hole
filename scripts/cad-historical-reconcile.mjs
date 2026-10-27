// Read-only reconciliation of historical CAD model calls, and a dry run of the repair (docs/features/cad.md, Historical rows).
//
// Before fix/cad-action-lifecycle every CAD call's usage action stayed 'running', and before fix/cad-failed-call-refund a billed reply that was
// unusable stayed charged. This script reads the learn D1 and decides, per CAD attempt, from D1 evidence only:
//   ELIGIBLE      the existing policy refunds it (the action is 'failed': cadModelCall threw after a settled charge) and it is not refunded yet
//   NOT ELIGIBLE  delivered (the action completed, a validated source was saved right after the call, or the next call is a repair of it),
//                 not charged, or already refunded
//   UNKNOWN       D1 cannot tell; the CadJobs Durable Object record of the job is needed. 'running' alone is never evidence either way.
//
//   node scripts/cad-historical-reconcile.mjs <dev|prod> reconcile             (read-only table and totals)
//   node scripts/cad-historical-reconcile.mjs <dev|prod> repair --dry-run      (read-only: the rows a repair WOULD write, (A) and (B))
//
// There is no apply mode: `repair` without --dry-run refuses. Applying historical changes needs the owner's approval and a separate, reviewed
// apply mode. Both modes get only a runner that refuses anything but a single SELECT. Credentials are read by NAME from the owner credentials
// file and never printed. Owner-run; the lane that wrote it never ran it against dev or prod.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readOnly } from './motion-refund-failed-job.mjs';
import { encodeBoard } from '../packages/control-plane/src/cad-contract.js';
import { FAILED_ROUTE_REFUND } from '../packages/control-plane/src/learn-usage.js';

export const USAGE = 'usage: cad-historical-reconcile.mjs <dev|prod> reconcile | <dev|prod> repair --dry-run';
// A source saved this long after a call's settlement is still that call's (saveCadSource runs in the same alarm turn, seconds later).
export const SOURCE_WINDOW_MS = 300_000;
const KEY = /^cad-(cj(\w+)([0-9a-f]{32}))-([1-9]\d*)$/; // cad-<job id without non-word characters>-<call number> (cad-jobs.js operationKey)
const credits = micros => `${(micros / 10_000).toLocaleString('en-US', { maximumFractionDigits: 4 })} credits`;
const sqlText = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;

// -> {which, mode} | {error, exit}. Nothing is read from the environment.
export function parseArgs(argv) {
  const [which, mode, ...flags] = argv;
  if (!['dev', 'prod'].includes(which) || !['reconcile', 'repair'].includes(mode)) return { error: USAGE, exit: 2 };
  if (mode === 'reconcile' && flags.length) return { error: `reconcile takes no flags. ${USAGE}`, exit: 2 };
  if (mode === 'repair' && !(flags.length === 1 && flags[0] === '--dry-run')) {
    return { error: 'refused: repair runs only as --dry-run. Applying historical CAD changes needs the owner\'s approval and a separate, reviewed apply mode; this script has none.', exit: 2 };
  }
  return { which, mode };
}

// The three reads. shortcut: every CAD source and derivative row is read (no board filter: the board is only recoverable in JS); fine while
// CAD is restricted, upgrade to a board-scoped read when those tables grow.
export function readEvidence(run) {
  const rows = q => run(q).results ?? [];
  return {
    attempts: rows(`SELECT a.action_id, a.user_id, a.period, a.charge_class, a.status AS action_status, a.result, a.client_key,
        t.attempt_id, t.kind, t.cost_state, t.cost_micros, t.reserved_micros, t.output_tokens, t.started_at, t.settled_at,
        COALESCE(d.refunded_micros, 0) AS refunded_micros, o.category, o.status AS operation_status, o.cost_usd, o.error AS operation_error
      FROM usage_actions a JOIN usage_attempts t ON t.action_id = a.action_id
      LEFT JOIN usage_attempt_detail d ON d.attempt_id = t.attempt_id
      LEFT JOIN usage_operations o ON o.op_id = t.attempt_id
      WHERE a.feature = 'artifact' AND a.client_key LIKE 'cad-%' ORDER BY t.started_at, a.client_key`),
    sources: rows("SELECT id, board_id, sha256, created_at FROM file_sources WHERE family = 'cad' ORDER BY created_at"),
    derivatives: rows("SELECT source_id, kind, options_hash, status FROM file_derivatives WHERE converter = 'cad-execute' AND status = 'ready'"),
  };
}

const boardKey = boardId => encodeBoard(boardId).replace(/\W/g, '');
// -> one record per attempt: {job, call, ..., eligibility, outcome, evidence, missing, policy}
export function classify({ attempts, sources, derivatives }) {
  const parsed = attempts.map(row => {
    const m = KEY.exec(row.client_key || '');
    const cost = Number(row.cost_micros) || 0, refunded = Number(row.refunded_micros) || 0;
    const charged = row.charge_class === 'would_charge' && row.cost_state === 'settled' ? cost - refunded : 0;
    return { ...row, job: m ? m[1] : null, board: m ? m[2] : null, call: m ? Number(m[4]) : null, cost, refunded, charged };
  });
  const seen = new Map(); // board key -> sha256 values saved before, to tell a parameter rebuild (same source text) from a new reply
  const cadSources = sources.map(s => ({ ...s, board: s.board_id ? boardKey(s.board_id) : null })).map(s => {
    const shas = seen.get(s.board) || new Set(); const repeat = shas.has(s.sha256); shas.add(s.sha256); seen.set(s.board, shas); return { ...s, repeat };
  });
  return parsed.map(row => {
    const out = (eligibility, outcome, evidence, missing = null, extra = {}) => ({ job: row.job, call: row.call, attempt_id: row.attempt_id, action_id: row.action_id, user_id: row.user_id,
      period: row.period, client_key: row.client_key, action_status: row.action_status, result: row.result, settled_at: row.settled_at, cost_micros: row.cost, refunded_micros: row.refunded,
      provider_cost_usd: row.cost_usd ?? null, learner_micros: row.charged, eligibility, outcome, evidence, missing, ...extra });
    const hints = [`kind ${row.kind}`, `operation ${row.operation_status ?? 'none'}${row.operation_error ? ` (${row.operation_error})` : ''}`, `output tokens ${row.output_tokens ?? 'unknown'}`];
    if (!row.job) return out('UNKNOWN', 'unparsed', `client key ${row.client_key} is not cad-<job>-<call>`, 'the job this call belongs to');
    if (row.charge_class !== 'would_charge') return out('NOT ELIGIBLE', 'not_charged', `charge class ${row.charge_class}: the learner was never charged`);
    if (row.cost_state !== 'settled' || !(row.cost > 0)) return out('NOT ELIGIBLE', 'not_charged', `cost ${row.cost_state}: no settled charge`);
    if (row.refunded >= row.cost) return out('NOT ELIGIBLE', 'refunded', `already refunded in full (${row.refunded} micros)`);
    if (row.refunded > 0) return out('UNKNOWN', 'part_refunded', `${row.refunded} of ${row.cost} micros already refunded`, 'an owner review: refundAttempt refunds once and never tops up');
    if (row.action_status === 'completed') return out('NOT ELIGIBLE', 'delivered', `action completed/${row.result} (runCadModel after the lifecycle fix: cadModelCall returned an answer)`);
    if (row.action_status === 'failed') return out('ELIGIBLE', 'unusable', 'action failed (runCadModel after the lifecycle fix: cadModelCall threw after a settled charge) and not refunded');
    if (row.action_status !== 'running') return out('UNKNOWN', 'other_status', `action ${row.action_status}`, 'what this status means for a CAD call');
    // 'running' says nothing about the outcome. A validated source saved on the job's board right after this call proves the call returned it.
    const startMs = row.settled_at * 1000 - 1000;
    const nextOnBoard = parsed.filter(o => o.board === row.board && o.attempt_id !== row.attempt_id && o.started_at >= row.started_at && (o.started_at > row.started_at || o.client_key > row.client_key)).map(o => o.started_at * 1000);
    const endMs = Math.min(row.settled_at * 1000 + SOURCE_WINDOW_MS, ...nextOnBoard);
    const overlapping = parsed.filter(o => o.board === row.board && o.job !== row.job && o.started_at * 1000 < endMs && (o.settled_at ?? o.started_at) * 1000 + SOURCE_WINDOW_MS > startMs);
    const fresh = cadSources.filter(s => s.board === row.board && !s.repeat && s.created_at >= startMs && s.created_at < endMs);
    const next = parsed.find(o => o.job === row.job && o.call === row.call + 1);
    const gap = next ? `; next call ${next.started_at - row.settled_at} s after settlement` : '; last call of the job in D1';
    if (fresh.length === 1 && !overlapping.length) {
      const built = derivatives.filter(d => d.source_id === fresh[0].id).map(d => d.kind);
      const policy = built.includes('step') ? null : 'valid design, no published build afterwards: charged under the existing policy';
      return out('NOT ELIGIBLE', 'delivered', `validated source ${fresh[0].id} saved ${Math.round((fresh[0].created_at - row.settled_at * 1000) / 1000)} s after settlement on the job's board${built.length ? `; build published (${[...new Set(built)].sort().join(', ')})` : '; no build published'}${gap}`, null, { policy, repair: 'completed' });
    }
    if (next && next.kind === 'repair' && row.kind !== 'repair') return out('NOT ELIGIBLE', 'delivered', `call ${next.call} is a repair: a repair follows only a delivered design whose build failed or a delivered review that rejected it${gap}`, null, { policy: 'a valid design whose build failed, or a review that rejected the build, then repaired: charged under the existing policy', repair: 'completed' });
    const why = fresh.length > 1 ? `${fresh.length} new sources on the board in the window` : overlapping.length ? 'another CAD job on the board overlaps the window' : 'no validated source followed the call';
    return out('UNKNOWN', 'unknown', `action running; ${why}; ${hints.join(', ')}${gap}`,
      `the CadJobs record of job ${row.job}: state, attempt, error, approval/briefHash, question/answer and lastFailure${next ? ' (an earlier call\'s error is cleared on Retry, so it may be undecidable)' : ''}`);
  });
}

// The repair a dry run reports. (A) cosmetic action status only, no money. (B) refunds, ELIGIBLE only, in refundAttempt's exact shape.
// ponytail: running -> failed/none needs DO evidence of an unusable reply; no D1 rule proves one, so (A) only completes delivered calls.
export function repairPlan(records) {
  const actions = records.filter(r => r.action_status === 'running' && r.repair === 'completed').map(r => ({
    ...r, status: 'completed', resultTo: 'full',
    sql: `UPDATE usage_actions SET status = 'completed', result = 'full', ended_at = ${sqlText(r.settled_at)} WHERE action_id = ${sqlText(r.action_id)} AND status = 'running'`,
  }));
  const refunds = records.filter(r => r.eligibility === 'ELIGIBLE' && r.refunded_micros === 0 && r.learner_micros > 0).map(r => ({
    ...r, micros: r.learner_micros, reason: FAILED_ROUTE_REFUND,
    sql: [`INSERT OR IGNORE INTO usage_attempt_detail (attempt_id) VALUES (${sqlText(r.attempt_id)})`,
      `UPDATE usage_attempt_detail SET refunded_micros = ${r.learner_micros}, refunded_at = <apply time>, refund_reason = '${FAILED_ROUTE_REFUND}' WHERE attempt_id = ${sqlText(r.attempt_id)} AND refunded_micros = 0`,
      `INSERT INTO usage_adjustments (adjustment_id, action_id, user_id, micros, reason, created_at) VALUES (<new adj id>, ${sqlText(r.action_id)}, ${sqlText(r.user_id)}, ${-r.learner_micros}, '${FAILED_ROUTE_REFUND}', <apply time>)`],
  }));
  return { actions, refunds, refundMicros: refunds.reduce((n, r) => n + r.micros, 0) };
}

export function totals(records) {
  const by = {};
  for (const r of records) {
    const t = by[r.eligibility] ||= { attempts: 0, learner_micros: 0, provider_cost_usd: 0 };
    t.attempts++; t.learner_micros += r.learner_micros; t.provider_cost_usd += Number(r.provider_cost_usd) || 0;
  }
  return by;
}

// -> {exit, lines}. Every read goes through readOnly: neither mode can be handed a write.
export function reconcile({ run, mode }) {
  const lines = [], say = line => lines.push(line);
  const records = classify(readEvidence(readOnly(run)));
  say(`${records.length} CAD attempts (usage_actions feature artifact, client key cad-<job>-<call>)`);
  for (const r of records) {
    say(`${r.job ?? '?'} call ${r.call ?? '?'} | attempt ${r.attempt_id} | action ${r.action_status}/${r.result ?? 'null'} | provider cost ${r.provider_cost_usd ?? 'unknown'} USD | learner charge ${r.learner_micros} micros (${credits(r.learner_micros)}) | ${r.eligibility}${r.eligibility === 'NOT ELIGIBLE' ? ` (${r.outcome})` : ''}`);
    say(`    evidence: ${r.evidence}`);
    if (r.missing) say(`    missing: ${r.missing}`);
    if (r.policy) say(`    policy question: ${r.policy}`);
  }
  for (const [eligibility, t] of Object.entries(totals(records))) say(`total ${eligibility}: ${t.attempts} attempts, learner charge ${t.learner_micros} micros (${credits(t.learner_micros)}), provider cost ${t.provider_cost_usd.toFixed(6)} USD`);
  const flagged = records.filter(r => r.policy);
  say(`policy question (charged under the existing policy, not refunded here): ${flagged.length} attempts, ${flagged.reduce((n, r) => n + r.learner_micros, 0)} micros`);
  if (mode === 'repair') {
    const plan = repairPlan(records);
    say(`(A) action status repairs, cosmetic, no money: ${plan.actions.length} rows`);
    for (const a of plan.actions) say(`    ${a.action_id} (${a.job} call ${a.call}): running -> ${a.status}/${a.resultTo}, ended_at ${a.settled_at}\n      ${a.sql}`);
    say(`(B) refunds, reason ${FAILED_ROUTE_REFUND}, ELIGIBLE only: ${plan.refunds.length} rows, ${plan.refundMicros} micros (${credits(plan.refundMicros)})`);
    for (const b of plan.refunds) say(`    ${b.attempt_id} (${b.job} call ${b.call}, user ${b.user_id}): refund ${b.micros} micros (${credits(b.micros)})\n${b.sql.map(s => `      ${s}`).join('\n')}`);
    say('DRY RUN: nothing was written. There is no apply mode: applying needs the owner\'s approval and a separate, reviewed apply mode.');
  }
  return { exit: 0, lines };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) { console.error(parsed.error); process.exit(parsed.exit); }
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
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
  console.log(`${parsed.which} (${database}) at ${new Date().toISOString()}, ${parsed.mode}${parsed.mode === 'repair' ? ' --dry-run' : ''}`);
  const { exit, lines } = reconcile({ run, mode: parsed.mode });
  for (const line of lines) console.log(line);
  process.exit(exit);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
