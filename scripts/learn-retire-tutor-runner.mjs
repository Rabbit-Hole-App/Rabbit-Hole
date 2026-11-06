// Tutor cleanup (docs/features/explain-on-canvas/receipts/p6-db-runbook.md): the owner-run launcher body for the Learn archive
// backfill (before P6a), its gate, and the P6b window that retires the old Tutor tables. Not a test tool: it writes to a real
// database when told to, so the entry point has no override flags, no environment switches and no automatic confirmation.
//   node scripts/learn-retire-tutor-runner.mjs <env> check         read-only: counts and the verify count; never asks, never writes
//   node scripts/learn-retire-tutor-runner.mjs <env> backfill      asks for BACKFILL <ENV>, runs the backfill, verifies 0, writes the receipt
//   node scripts/learn-retire-tutor-runner.mjs <env> gate          read-only: the receipt exists AND verify is still 0; exit 0 only then (before P6a)
//   node scripts/learn-retire-tutor-runner.mjs <env> window-check  read-only: every precondition of the P6b window, what retire would change
//   node scripts/learn-retire-tutor-runner.mjs <env> retire        the window: two typed confirmations, then the ordered, resumable retire steps
// <env> is dev, parallel or prod. Credentials are read BY NAME from the standing .env, only after the typed confirmation (or for
// a read-only command), and never printed. The SQL is printed by scripts/learn-retire-tutor-data.mjs, whose sha256 is pinned below.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { RETIRED_OBJECTS, TABLES, backfillSql, countSql, retireSteps, verifySql } from './learn-retire-tutor-data.mjs';
import { MASTER_SQL, expectedSchema, schemaDiff, schemaOf } from './schema-check.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// sha256 of scripts/learn-retire-tutor-data.mjs with LF line endings. A different file refuses to run.
export const GENERATOR_SHA256 = '392207f1d42fe11ffcae718b0bf4593b5c95e254b70b38b578c790f4e06995e3';
// The P6a release commit (feat/tutor-cleanup-p6a-release): the served pair the window must start from, and the commit the recovery grep reads.
// Pinned: if the Lead re-stacks P6a, bump this to the commit that is actually served and rebuild this branch (p6-db-runbook.md, Pins).
export const P6A_SHA = '84d94faabca3e653e0e6b77c954aadcae084a57b';
export const REMOTE = 'rabbit-hole';
// Every P6a recovery branch restores code that joins the retired tables (feat/tutor-cleanup-p6a-recovery, ...-p6a-release-recovery, -r2 and any
// later restack), so the production window deletes all of them: the pattern is matched on the remote, not a fixed list.
export const P6A_RECOVERY = 'feat/tutor-cleanup-p6a*recovery*';
export const P6B_RECOVERY = 'feat/tutor-cleanup-p6b-release-recovery';
const D1 = { dev: ['rabbit-hole-learn-dev', '028f800f-ce8e-4461-adb2-827f417492eb'], prod: ['rabbit-hole-learn-prod', 'f28417c4-d8ce-448e-8687-cc7bc2edf3a8'] };
// parallel and dev bind the same D1 (wrangler.parallel.jsonc and wrangler.dev.jsonc both name rabbit-hole-learn-dev, same id).
export const ENVS = {
  dev: { config: 'packages/web/wrangler.dev.jsonc', db: D1.dev },
  parallel: { config: 'packages/web/wrangler.parallel.jsonc', db: D1.dev },
  prod: { config: 'packages/web/wrangler.rabbit-hole-prod.jsonc', db: D1.prod },
};
export const PATHS = {
  envFile: 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env',
  receipts: 'C:/s/spec/release-queue/tutor-cleanup/receipts',
  logs: 'C:/s/spec/logs',
};
// v0.5 6.5 step 5 (ii): the Worker source must not query a table the window drops, at the P6b commit, at P6a and on the P6b recovery tip.
const TABLE_GREP = 'learning_journeys|learning_path_versions|learn_grades|tutor_eval_';
const WORKER_PATHS = ['packages/control-plane/src', 'packages/web/src', 'packages/web/dev-worker.js', 'packages/web/app-worker.js'];
const KEYS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];
const sha256 = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

export class Stop extends Error { constructor(message, code = 1) { super(message); this.code = code; } }

export function credentialsFrom(text) {
  const out = {};
  for (const key of KEYS) {
    const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
    out[key] = m ? m[1].replace(/\r$/, '').replace(/^"|"$/g, '') : '';
    if (!out[key]) throw new Stop(`missing ${key} in the standing .env (read by name; nothing was run)`, 2);
  }
  return out;
}

// The config must bind LEARN_DB to exactly the database this environment names, or nothing runs.
export function assertDatabase(env, configText) {
  const [name, id] = ENVS[env].db;
  const bound = new RegExp(`"binding":\\s*"LEARN_DB",\\s*"database_name":\\s*"${name}",\\s*"database_id":\\s*"${id}"`);
  if (!bound.test(configText)) throw new Stop(`${ENVS[env].config} does not bind LEARN_DB to ${name} (${id}); nothing was run`, 2);
  return { name, id };
}

export const WRANGLER_JS = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

// wrangler prints a banner before the JSON; the JSON starts at the first line that begins with [.
export function parseWrangler(stdout) {
  const at = stdout.search(/^\[/m);
  if (at < 0) throw new Stop(`wrangler printed no JSON: ${stdout.slice(0, 300)}`);
  const results = JSON.parse(stdout.slice(at));
  if (results.some(r => r.success === false)) throw new Stop('wrangler reported a failed statement');
  return results;
}

// What the production preflight (scripts/prod-release.mjs schemaBlockers) would say about this database against THIS checkout.
// Before the window it must be exactly the 13 retired objects reported as unexpected; after it, nothing.
export const windowDiff = liveRows => {
  const diff = schemaDiff(expectedSchema('learn'), schemaOf(liveRows));
  const retired = diff.filter(d => d.startsWith('unexpected ') && RETIRED_OBJECTS.includes(d.slice('unexpected '.length)));
  return { diff, retired, other: diff.filter(d => !retired.includes(d)) };
};

const defaultGit = args => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });

export async function main({ argv, readFile = f => readFileSync(f, 'utf8'), writeReceipt, readReceipt, prompt, spawn = spawnSync, git = defaultGit, hasWrangler = () => existsSync(WRANGLER_JS), log = console.log, now = () => new Date().toISOString() }) {
  const [env, command] = argv;
  if (!ENVS[env] || !['check', 'backfill', 'gate', 'window-check', 'retire'].includes(command)) throw new Stop('usage: <dev|parallel|prod> <check|backfill|gate|window-check|retire>', 2);
  if (!hasWrangler()) throw new Stop(`wrangler is not installed at ${WRANGLER_JS}; run npm ci in ${ROOT} first (nothing was run)`, 2);
  // Recovery branch of P6b: the six tables are already dropped, so there is nothing left to retire. Backfill, gate, check and window-check stay read-compatible.
  if (command === 'retire') throw new Stop('retire is disabled on the P6b recovery branch: the tables are already dropped', 2);
  const cfg = ENVS[env];
  const database = assertDatabase(env, readFile(join(ROOT, cfg.config)));
  const generator = sha256(readFile(join(ROOT, 'scripts', 'learn-retire-tutor-data.mjs')));
  if (generator !== GENERATOR_SHA256) throw new Stop(`scripts/learn-retire-tutor-data.mjs is ${generator}, not the pinned ${GENERATOR_SHA256}; nothing was run`, 2);
  log(`== ${now()} ${command} on ${database.name} (${env}, remote)`);
  if (env === 'parallel') log(`   note: parallel and dev bind the same database (${database.id}); this run covers both.`);

  let creds = null;
  const sql = text => {
    creds ??= credentialsFrom(readFile(PATHS.envFile));
    const run = spawn(process.execPath, [WRANGLER_JS, 'd1', 'execute', database.name, '--remote', '--config', join(ROOT, cfg.config), '--json', '--command', text.replace(/\s+/g, ' ')],
      { cwd: join(ROOT, 'packages', 'web'), encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, USERPROFILE: process.env.USERPROFILE, ...creds } });
    if (run.status !== 0) throw new Stop(`wrangler exit ${run.status}: ${(run.stderr || run.stdout || '').slice(0, 400)}`, run.status || 1);
    return parseWrangler(run.stdout)[0];
  };
  const presentTables = () => {
    const names = sql(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${TABLES.map(t => `'${t}'`).join(',')})`).results.map(r => r.name);
    return TABLES.filter(t => names.includes(t));
  };
  const unarchived = () => sql(verifySql()).results[0].unarchived_goals;
  const receiptFile = kind => join(PATHS.receipts, `${env}-${kind}.json`);
  const needReceipt = () => {
    const receipt = readReceipt(receiptFile('backfill-verified'));
    if (!receipt) throw new Stop(`no verified backfill receipt for ${env} (${receiptFile('backfill-verified')}); run backfill first`);
    if (receipt.database_id !== database.id || receipt.unarchived_goals !== 0) throw new Stop(`the ${env} receipt does not name ${database.id} with a verify count of 0`);
    return receipt;
  };

  if (command === 'gate') {
    const receipt = needReceipt();
    const n = unarchived();
    if (n !== 0) throw new Stop(`verify is ${n} now (a journey archived after the receipt, or the P4 recovery branch ran); rerun backfill for ${env}`);
    log(`RESULT OK gate ${env}: receipt ${receipt.verified_at}, verify 0 now`);
    return 0;
  }

  if (command === 'window-check' || command === 'retire') return window({ env, command, database, sql, presentTables, unarchived, needReceipt, receiptFile, git, log, now, prompt, writeReceipt, generator });

  const present = presentTables();
  log('counts:', JSON.stringify(sql(countSql(present)).results[0]));
  if (!present.includes('learning_journeys')) {
    if (command === 'check') { log(`RESULT CHECK ${env}: learning_journeys is already retired (read-only; nothing was changed)`); return 0; }
    throw new Stop(`learning_journeys no longer exists in ${env}; the backfill is moot`, 5);
  }
  const before = unarchived();
  log(`verify: ${before} goal(s) of an archived journey are not archived`);
  if (command === 'check') { log(`RESULT CHECK ${env}: verify=${before} (read-only; nothing was changed)`); return 0; }

  const phrase = `BACKFILL ${env.toUpperCase()}`;
  const answer = await prompt(`P4 (the journey writers retired) must be live in ${env}. Type ${phrase} to archive ${before} goal(s) and record the receipt: `);
  if (answer !== phrase) throw new Stop('cancelled; nothing was changed', 3);
  if (before > 0) sql(backfillSql());
  const after = unarchived();
  if (after !== 0) throw new Stop(`verify is ${after} after the backfill; no receipt was written. Rerun (the backfill is idempotent).`, 4);
  writeReceipt(receiptFile('backfill-verified'), { env, database: database.name, database_id: database.id, verified_at: now(), unarchived_goals: 0, archived_by_this_run: before, generator_sha256: generator });
  log(`RESULT OK backfill ${env}: archived ${before}, verify 0, receipt ${receiptFile('backfill-verified')}`);
  return 0;
}

// The P6b window (v0.5 6.5 step 5, 7.2, risk 10). window-check stops before any write; retire continues through the two typed
// confirmations. Every refusal names its fix. Order of the real window, owner side: this command, then immediately prepare and
// release the P6b commit, with no other production release in between.
async function window({ env, command, database, sql, presentTables, unarchived, needReceipt, receiptFile, git, log, now, prompt, writeReceipt, generator }) {
  const head = git(['rev-parse', 'HEAD']).stdout?.trim();
  const dirty = git(['status', '--porcelain', '--untracked-files=no']).stdout?.trim();
  if (dirty) throw new Stop(`tracked files are modified in ${ROOT}; the window runs only from a clean checkout of the P6b commit:\n${dirty}`, 2);
  if (git(['fetch', '-q', REMOTE]).status !== 0) throw new Stop(`git fetch ${REMOTE} failed; the recovery checks need the remote refs`, 2);
  log(`checkout: HEAD ${head}`);

  // (i)/(ii) recovery check: no Worker source at P6b, at the P6a commit or on the P6b recovery tip queries a retired table, and the
  // P6b recovery branch is a descendant of this commit.
  const recoveryTip = git(['rev-parse', '--verify', `${REMOTE}/${P6B_RECOVERY}`]).stdout?.trim();
  if (!recoveryTip) throw new Stop(`${REMOTE}/${P6B_RECOVERY} does not exist; cut and push the recovery branch first`);
  if (git(['merge-base', '--is-ancestor', head, recoveryTip]).status !== 0) throw new Stop(`${P6B_RECOVERY} (${recoveryTip}) is not a descendant of HEAD ${head}; after the drop a branch that does not descend from P6b fails the schema preflight`);
  for (const [label, rev] of [['HEAD (P6b)', head], ['P6a', P6A_SHA], ['the P6b recovery tip', recoveryTip]]) {
    if (git(['cat-file', '-e', `${rev}^{commit}`]).status !== 0) throw new Stop(`${label} ${rev} is not in this clone; git fetch ${REMOTE}`);
    const g = git(['grep', '-nE', TABLE_GREP, rev, '--', ...WORKER_PATHS]);
    if (g.status === 0) throw new Stop(`${label} (${rev}) queries a table the window drops; a rollback to it after the drop would break:\n${g.stdout.slice(0, 600)}`);
    if (g.status !== 1) throw new Stop(`git grep failed at ${label}: ${(g.stderr || '').slice(0, 300)}`);
    log(`recovery check: no query of a retired table at ${label} ${rev.slice(0, 12)}`);
  }

  const receipt = needReceipt();
  log(`backfill receipt: ${receipt.verified_at}`);
  const present = presentTables();
  const rows = sql(MASTER_SQL).results;
  const { retired, other } = windowDiff(rows);
  if (other.length) throw new Stop(`the live schema differs from this checkout in ways the window does not own (a pending migration on this checkout's base, or an object from another branch); the release preflight would still block after the drop:\n  ${other.join('\n  ')}`);
  log('counts:', JSON.stringify(sql(countSql(present)).results[0]));
  if (present.includes('learning_journeys')) {
    const n = unarchived();
    if (n !== 0) throw new Stop(`verify is ${n} now; rerun backfill for ${env}, then the window`);
    log('verify: 0 goals of an archived journey are unarchived');
  }
  log(`preflight today: ${retired.length === 0 ? 'clean (already retired)' : `${retired.length} object(s) reported unexpected, all retired objects`}`);
  const steps = retireSteps(present);
  log(`steps: ${steps.map(s => s.name).join(' | ')}`);
  if (command === 'window-check') { log(`RESULT CHECK window ${env}: ready (read-only; nothing was changed)`); return 0; }

  log('After the drop no rollback below the P6a pair is permitted (code older than P6a joins the dropped tables). A Time Travel restore across the drop is a last resort that needs its own plan and an owner GO. Prepare and release the P6b commit next, with no other production release in between.');
  const phrase = `RETIRE ${env.toUpperCase()}`;
  if ((await prompt(`Type ${phrase} to drop the six tables in ${database.name}: `)) !== phrase) throw new Stop('cancelled; nothing was changed', 3);
  if ((await prompt('Confirm the served pair is the P6a build and no rollback below it is permitted after the drop. Type P6A SERVED: ')) !== 'P6A SERVED') throw new Stop('cancelled; nothing was changed', 3);

  // The P6a recovery branches restore the journey joins: valid only while the tables exist, so the production window deletes them all.
  // (A dev window leaves them: production still needs them until its own window.)
  let recoveryDeleted = 'kept (not the production window)';
  const deletedBranches = [];
  if (env === 'prod') {
    const found = git(['ls-remote', '--heads', REMOTE, P6A_RECOVERY]);
    if (found.status !== 0) throw new Stop(`could not list ${REMOTE}/${P6A_RECOVERY}: ${(found.stderr || '').slice(0, 300)}; nothing was dropped`);
    const branches = (found.stdout || '').split(/\r?\n/).filter(Boolean).map(l => l.split('\t')[1].replace(/^refs\/heads\//, ''));
    for (const branch of branches) {
      const del = git(['push', REMOTE, '--delete', branch]);
      if (del.status !== 0 && !/remote ref does not exist/i.test(del.stderr || '')) throw new Stop(`could not delete ${REMOTE}/${branch}: ${(del.stderr || '').slice(0, 300)}; nothing was dropped`);
      deletedBranches.push(branch);
    }
    recoveryDeleted = deletedBranches.length ? 'deleted' : 'already absent';
    log(`${P6A_RECOVERY}: ${recoveryDeleted}${deletedBranches.length ? ` (${deletedBranches.join(', ')})` : ''}`);
  }

  const done = [];
  for (const step of steps) { sql(step.sql); done.push(step.name); log(`done: ${step.name}`); }
  const after = windowDiff(sql(MASTER_SQL).results);
  if (after.diff.length) throw new Stop(`after the retire the preflight diff is not clean:\n  ${after.diff.join('\n  ')}\nrerun retire (every step is idempotent)`, 4);
  writeReceipt(receiptFile('retire-done'), { env, database: database.name, database_id: database.id, retired_at: now(), head, p6a: P6A_SHA, recovery_tip: recoveryTip, p6a_recovery_branch: recoveryDeleted, p6a_recovery_branches: deletedBranches, steps: done, preflight_diff: [], generator_sha256: generator });
  log(`RESULT OK retire ${env}: the preflight diff against ${head.slice(0, 12)} is clean; prepare and release the P6b commit now`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const logFile = join(PATHS.logs, `tutor-cleanup-db-${argv[0] ?? 'x'}.log`);
  const log = (...a) => { const line = a.join(' '); console.log(line); try { mkdirSync(PATHS.logs, { recursive: true }); appendFileSync(logFile, line + '\n'); } catch { /* the console line is the record */ } };
  const prompt = async question => {
    if (!process.stdin.isTTY) throw new Stop('a typed confirmation needs a terminal; nothing was run', 2);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try { return (await rl.question(question)).trim(); } finally { rl.close(); }
  };
  const writeReceipt = (file, body) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(body, null, 2) + '\n'); };
  const readReceipt = file => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
  // A mutating command needs a terminal before anything else, so a non-interactive caller is refused before credentials are read.
  if (['backfill', 'retire'].includes(argv[1]) && !process.stdin.isTTY) { console.log('RESULT FAIL a typed confirmation needs a terminal; nothing was run'); process.exit(2); }
  try { process.exitCode = await main({ argv, prompt, writeReceipt, readReceipt, log }); } catch (error) {
    if (!(error instanceof Stop)) log(`UNEXPECTED ${error.stack || error}`);
    log(`RESULT FAIL ${error.message}`);
    process.exitCode = error instanceof Stop ? error.code : 1;
  }
}
