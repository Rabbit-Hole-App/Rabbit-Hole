// Tutor cleanup (docs/features/explain-on-canvas/receipts/p6-db-runbook.md): the owner-run launcher body for the Learn archive
// backfill (before P6a) and its gate. Not a test tool: it writes to a real database when told to, so the entry point has no
// override flags, no environment switches and no automatic confirmation.
//   node scripts/learn-retire-tutor-runner.mjs <dev|parallel|prod> check      read-only: counts and the verify count; never asks, never writes
//   node scripts/learn-retire-tutor-runner.mjs <dev|parallel|prod> backfill   asks for BACKFILL <ENV>, runs the backfill, verifies 0, writes the receipt
//   node scripts/learn-retire-tutor-runner.mjs <dev|parallel|prod> gate       read-only: the receipt exists AND verify is still 0; exit 0 only then
// Credentials are read BY NAME from the standing .env, only after the typed confirmation (or for a read-only command), and are
// never printed. The SQL is printed by scripts/learn-retire-tutor-data.mjs, whose sha256 is pinned below.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { backfillSql, countSql, verifySql } from './learn-retire-tutor-data.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// sha256 of scripts/learn-retire-tutor-data.mjs with LF line endings. A different file refuses to run.
export const GENERATOR_SHA256 = 'c2a22570bf3dea4a5ea509e03745e1a2c368ef8b346d4015150b08e21df075b6';
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

export async function main({ argv, readFile = f => readFileSync(f, 'utf8'), fileExists = existsSync, writeReceipt, readReceipt, prompt, spawn = spawnSync, log = console.log, now = () => new Date().toISOString() }) {
  const [env, command] = argv;
  if (!ENVS[env] || !['check', 'backfill', 'gate'].includes(command)) throw new Stop('usage: <dev|parallel|prod> <check|backfill|gate>', 2);
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
  const unarchived = () => sql(verifySql()).results[0].unarchived_goals;
  const receiptFile = join(PATHS.receipts, `${env}-backfill-verified.json`);

  if (command === 'gate') {
    const receipt = readReceipt(receiptFile);
    if (!receipt) throw new Stop(`no verified backfill receipt for ${env} (${receiptFile}); run backfill first. P6a must not be released here.`);
    if (receipt.database_id !== database.id || receipt.unarchived_goals !== 0) throw new Stop(`the ${env} receipt does not name ${database.id} with a verify count of 0`);
    const n = unarchived();
    if (n !== 0) throw new Stop(`verify is ${n} now (a journey archived after the receipt, or the P4 recovery branch ran); rerun backfill for ${env}`);
    log(`RESULT OK gate ${env}: receipt ${receipt.verified_at}, verify 0 now`);
    return 0;
  }

  log('counts:', JSON.stringify(sql(countSql()).results[0]));
  const before = unarchived();
  log(`verify: ${before} goal(s) of an archived journey are not archived`);
  if (command === 'check') { log(`RESULT CHECK ${env}: verify=${before} (read-only; nothing was changed)`); return 0; }

  const phrase = `BACKFILL ${env.toUpperCase()}`;
  const answer = await prompt(`P4 (the journey writers retired) must be live in ${env}. Type ${phrase} to archive ${before} goal(s) and record the receipt: `);
  if (answer !== phrase) throw new Stop('cancelled; nothing was changed', 3);
  if (before > 0) sql(backfillSql());
  const after = unarchived();
  if (after !== 0) throw new Stop(`verify is ${after} after the backfill; no receipt was written. Rerun (the backfill is idempotent).`, 4);
  writeReceipt(receiptFile, { env, database: database.name, database_id: database.id, verified_at: now(), unarchived_goals: 0, archived_by_this_run: before, generator_sha256: generator });
  log(`RESULT OK backfill ${env}: archived ${before}, verify 0, receipt ${receiptFile}`);
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
  // A backfill needs a terminal before anything else, so a non-interactive caller is refused before credentials are read.
  if (argv[1] === 'backfill' && !process.stdin.isTTY) { console.log('RESULT FAIL a typed confirmation needs a terminal; nothing was run'); process.exit(2); }
  try { process.exitCode = await main({ argv, prompt, writeReceipt, readReceipt, log }); } catch (error) {
    if (!(error instanceof Stop)) log(`UNEXPECTED ${error.stack || error}`);
    log(`RESULT FAIL ${error.message}`);
    process.exitCode = error instanceof Stop ? error.code : 1;
  }
}
