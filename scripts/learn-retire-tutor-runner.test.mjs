// Tests for the owner-run launcher (backfill, gate and the P6b window). The mutating paths run against an in-memory SQLite behind a
// fake wrangler: no credentials, no network, no real database. The last tests are the enforced-isolation checks (CLAUDE.md
// "Release requirements"): the real entry point, run in a process whose PATH holds only a stub and whose environment holds no
// credentials, must refuse a mutating command before it reads credentials or starts anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { learnDb } from '../packages/control-plane/test/learn-grade-fixture.js';
import { GENERATOR_SHA256, P6A_RECOVERY, P6A_SHA, ROOT, Stop, assertDatabase, main } from './learn-retire-tutor-runner.mjs';
import { RETIRED_OBJECTS } from './learn-retire-tutor-data.mjs';
import { expectedSchema } from './schema-check.mjs';

const RETIRED_DDL = readFileSync(new URL('./fixtures/learn-retired-tables.sql', import.meta.url), 'utf8');
const WS = { org: 'ws', user: 'u', app: 'canvas-0000aaaa', board: 'main' };

// The database production holds before the window: the P6b schema plus the six retired tables (the fixture).
function world(t) {
  const { sqlite } = learnDb(t);
  sqlite.exec(RETIRED_DDL);
  const journey = (id, archived = null) => sqlite.prepare(`INSERT INTO learning_journeys (id, org, owner_user_id, app, board, state, topic, raw_request, request_json, intake_json, registry_json, diagnostic_json, evidence_json, created_at, updated_at, archived_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, '{}', '{}', '{}', '{}', '{}', 'x', 'x', ?)`).run(id, WS.org, WS.user, WS.app, id === 'lj_live' ? 'main' : `b-${id}`, id, id, archived);
  const goal = (journeyId, { origin = 'journey', lifecycle = 'open', revision = 0 } = {}) => sqlite.prepare(`INSERT INTO learn_goals (id, org, owner_user_id, app, board, label, outcome, origin, scope_version, lifecycle, journey_id, activity_id, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '', ?, 0, ?, ?, NULL, ?, 'x', 'x')`).run(`lg_${journeyId}`, WS.org, WS.user, WS.app, WS.board, journeyId, origin, lifecycle, journeyId, revision);
  const statements = [], receipts = new Map(), lines = [], gitCalls = [];
  const spawn = (cmd, args, opts) => {
    assert.equal(opts.env.CLOUDFLARE_API_TOKEN, 'tok');
    assert.deepEqual(args.slice(1, 3), ['d1', 'execute']);
    assert.ok(args.includes('--remote'));
    const text = args[args.indexOf('--command') + 1];
    statements.push(text);
    const read = /^\s*SELECT/i.test(text);
    const results = read ? sqlite.prepare(text).all().map(r => ({ ...r })) : (sqlite.prepare(text).run(), []);
    return { status: 0, stdout: ` wrangler banner\n${JSON.stringify([{ results, success: true, meta: {} }])}\n`, stderr: '' };
  };
  const readFile = f => (f.endsWith('.env') ? 'CLOUDFLARE_API_TOKEN=tok\nCLOUDFLARE_ACCOUNT_ID=acct\n' : readFileSync(f, 'utf8'));
  const gitState = { dirty: '', grep: {}, ancestor: 0, remoteDelete: { status: 0, stderr: '' } };
  const git = args => {
    gitCalls.push(args.join(' '));
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return { status: 0, stdout: 'a'.repeat(40) + '\n' };
    if (args[0] === 'rev-parse') return { status: 0, stdout: 'b'.repeat(40) + '\n' };
    if (args[0] === 'status') return { status: 0, stdout: gitState.dirty };
    if (args[0] === 'fetch' || args[0] === 'cat-file') return { status: 0, stdout: '' };
    if (args[0] === 'merge-base') return { status: gitState.ancestor, stdout: '' };
    if (args[0] === 'grep') { const rev = args[3]; return gitState.grep[rev] ? { status: 0, stdout: gitState.grep[rev] } : { status: 1, stdout: '' }; }
    if (args[0] === 'push') return { status: gitState.remoteDelete.status, stdout: '', stderr: gitState.remoteDelete.stderr };
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  const deps = answers => {
    const queue = [].concat(answers);
    return { readFile, spawn, git, prompt: async () => queue.shift() ?? '', writeReceipt: (f, b) => receipts.set(f, b), readReceipt: f => receipts.get(f) ?? null, log: l => lines.push(l), now: () => '2026-11-06T00:00:00Z' };
  };
  const names = () => new Set(sqlite.prepare("SELECT type || ':' || name AS n FROM sqlite_master").all().map(r => r.n));
  const lifecycle = id => sqlite.prepare('SELECT lifecycle FROM learn_goals WHERE id = ?').get(id)?.lifecycle;
  return { sqlite, journey, goal, statements, receipts, lines, gitCalls, gitState, deps, names, lifecycle };
}
const isWrite = s => !/^\s*SELECT/i.test(s);

// --- P6a: backfill and gate ----------------------------------------------------------------------------------------------

test('check is read-only: it counts, runs only SELECTs and writes no receipt', async t => {
  const w = world(t);
  w.journey('lj_old', '2026-09-01'); w.goal('lj_old');
  assert.equal(await main({ argv: ['dev', 'check'], ...w.deps('') }), 0);
  assert.equal(w.statements.filter(isWrite).length, 0);
  assert.equal(w.receipts.size, 0);
  assert.equal(w.lifecycle('lg_lj_old'), 'open');
  assert.match(w.lines.join('\n'), /RESULT CHECK dev: verify=1/);
});

test('backfill: a wrong typed phrase changes nothing; the right one archives, verifies 0 and writes the receipt', async t => {
  const w = world(t);
  w.journey('lj_old', '2026-09-01'); w.goal('lj_old'); w.journey('lj_live'); w.goal('lj_live');
  await assert.rejects(main({ argv: ['dev', 'backfill'], ...w.deps('backfill dev') }), e => e instanceof Stop && e.code === 3);
  assert.equal(w.statements.filter(isWrite).length, 0);
  assert.equal(w.receipts.size, 0);
  assert.equal(await main({ argv: ['dev', 'backfill'], ...w.deps('BACKFILL DEV') }), 0);
  assert.deepEqual([w.lifecycle('lg_lj_old'), w.lifecycle('lg_lj_live')], ['archived', 'open']);
  const [receipt] = [...w.receipts.values()];
  assert.deepEqual([receipt.env, receipt.database, receipt.unarchived_goals, receipt.archived_by_this_run], ['dev', 'rabbit-hole-learn-dev', 0, 1]);
  assert.equal(receipt.generator_sha256, GENERATOR_SHA256);
});

test('backfill with nothing to archive still needs the typed phrase and writes no UPDATE', async t => {
  const w = world(t);
  await assert.rejects(main({ argv: ['prod', 'backfill'], ...w.deps('') }), e => e.code === 3);
  assert.equal(await main({ argv: ['prod', 'backfill'], ...w.deps('BACKFILL PROD') }), 0);
  assert.equal(w.statements.filter(isWrite).length, 0);
  assert.equal([...w.receipts.keys()][0].endsWith('prod-backfill-verified.json'), true);
});

test('gate refuses without a receipt; passes with a receipt and verify 0; fails when a goal is unarchived again', async t => {
  const w = world(t);
  await assert.rejects(main({ argv: ['dev', 'gate'], ...w.deps('') }), /no verified backfill receipt for dev/);
  await main({ argv: ['dev', 'backfill'], ...w.deps('BACKFILL DEV') });
  assert.equal(await main({ argv: ['dev', 'gate'], ...w.deps('') }), 0);
  w.journey('lj_late', '2026-11-01'); w.goal('lj_late'); // for example the P4 recovery branch ran and archived a journey after the receipt
  await assert.rejects(main({ argv: ['dev', 'gate'], ...w.deps('') }), /verify is 1 now/);
});

test('a database the config does not bind, a changed generator and an unknown command stop before any SQL', async t => {
  const w = world(t);
  assert.throws(() => assertDatabase('prod', '{ "binding": "LEARN_DB", "database_name": "rabbit-hole-learn-dev", "database_id": "028f800f-ce8e-4461-adb2-827f417492eb" }'), /does not bind LEARN_DB to rabbit-hole-learn-prod/);
  const edited = { ...w.deps(''), readFile: f => (f.endsWith('learn-retire-tutor-data.mjs') ? 'export {}' : w.deps('').readFile(f)) };
  await assert.rejects(main({ argv: ['dev', 'check'], ...edited }), /not the pinned/);
  await assert.rejects(main({ argv: ['dev', 'drop'], ...w.deps('') }), e => e.code === 2);
  assert.equal(w.statements.length, 0);
});

test('every environment names its real Learn database and dev and parallel are the same one', () => {
  for (const [env, name, file] of [['dev', 'rabbit-hole-learn-dev', 'wrangler.dev.jsonc'], ['parallel', 'rabbit-hole-learn-dev', 'wrangler.parallel.jsonc'], ['prod', 'rabbit-hole-learn-prod', 'wrangler.rabbit-hole-prod.jsonc']]) {
    assert.equal(assertDatabase(env, readFileSync(join(ROOT, 'packages/web', file), 'utf8')).name, name);
  }
});

// --- P6b: the window -------------------------------------------------------------------------------------------------------

// Rows that exercise every rule of v0.5 7.3: an archived journey's goal (backfill), an untouched placeholder (deleted and its pointer
// cleared), a placeholder the learner renamed (kept), a goal with criteria, one with an attempt, one with an observation.
function window(t) {
  const w = world(t);
  const { sqlite } = w;
  for (const id of ['lj_arch', 'lj_ph', 'lj_renamed', 'lj_crit', 'lj_att', 'lj_obs']) { w.journey(id, id === 'lj_arch' ? '2026-09-01' : null); w.goal(id, { revision: id === 'lj_renamed' ? 2 : 0 }); }
  sqlite.prepare("INSERT INTO learn_goal_criteria (goal_id, scope_version, criterion_id, version, position, label, requirement, requires_reasoning, rubric_version, created_at) VALUES ('lg_lj_crit', 1, 'c', 1, 0, 'l', 'r', 1, 'r1', 'x')").run();
  sqlite.prepare("INSERT INTO learn_attempts (id, org, owner_user_id, app, board, goal_id, activity_id, activity_revision, submission_key, response_kind, content_json, content_hash, criterion_refs_json, source_refs_json, assistance, assistance_refs_json, submitted_at) VALUES ('at1', 'ws', 'u', 'canvas-0000aaaa', 'main', 'lg_lj_att', 'la1', 1, 'k-00000001', 'text', '{}', 'h', '[]', '[]', 'none', '[]', 'x')").run();
  sqlite.prepare("INSERT INTO learn_observations (id, assessment_id, attempt_id, org, owner_user_id, goal_id, criterion_id, criterion_version, fit, reasoning, assistance, observed_at) VALUES ('ob1', 'as1', 'at1', 'ws', 'u', 'lg_lj_obs', 'c', 1, 'met', 'supported', 'none', 'x')").run();
  sqlite.prepare("INSERT INTO learn_coaching_state (org, owner_user_id, app, board, active_goal_id, revision, created_at, updated_at) VALUES ('ws', 'u', 'canvas-0000aaaa', 'main', 'lg_lj_ph', 3, 'x', 'x')").run();
  sqlite.prepare("INSERT INTO learn_grades (org, email, app, mode, attempt_id, grader_protocol_version, prompt, expects, answer) VALUES ('ws', 'e', 'a', 'challenge', 'a1', 'p', 'p', '[]', 'a')").run();
  sqlite.prepare("INSERT INTO tutor_eval_executions (execution_id, run_id, run_date, run_started_at, topic, mode, status, source_sha, tested_tree, harness_version, imported_by, artifact_count, imported_at) VALUES ('e1', 'r', 'd', 's', 't', 'real', 'completed', 's', 't', 'h', 'u', 1, 'x')").run();
  sqlite.prepare("INSERT INTO tutor_eval_artifacts (execution_id, artifact_key, kind, content_type, byte_length, sha256, chunk_count) VALUES ('e1', 'k', 'log', 'text/plain', 1, 's', 1)").run();
  sqlite.prepare("INSERT INTO tutor_eval_artifact_chunks (execution_id, artifact_key, seq, bytes, sha256) VALUES ('e1', 'k', 0, x'00', 's')").run();
  return w;
}
const ready = async (w, env = 'dev') => { await main({ argv: [env, 'backfill'], ...w.deps(`BACKFILL ${env.toUpperCase()}`) }); w.statements.length = 0; };

test('the retired objects are exactly the 13 the P6b schema lacks, and the live database holds them before the window', t => {
  const w = window(t);
  for (const o of RETIRED_OBJECTS) assert.ok(w.names().has(o), o);
  assert.equal(RETIRED_OBJECTS.length, 13);
  const expected = Object.keys(expectedSchema('learn'));
  assert.deepEqual(RETIRED_OBJECTS.filter(o => expected.includes(o)), [], 'the schema sources no longer define any retired object');
});

test('window-check is read-only and refuses without the backfill receipt', async t => {
  const w = window(t);
  await assert.rejects(main({ argv: ['dev', 'window-check'], ...w.deps('') }), /no verified backfill receipt/);
  await ready(w);
  assert.equal(await main({ argv: ['dev', 'window-check'], ...w.deps('') }), 0);
  assert.equal(w.statements.filter(isWrite).length, 0);
  assert.match(w.lines.join('\n'), /RESULT CHECK window dev: ready/);
  assert.match(w.lines.join('\n'), /13 object\(s\) reported unexpected, all retired objects/);
});

test('retire: wrong or missing confirmations change nothing and never touch the P6a recovery branch', async t => {
  const w = window(t);
  await ready(w, 'prod');
  for (const answers of [[''], ['RETIRE PROD', 'yes'], ['retire prod', 'P6A SERVED']]) {
    await assert.rejects(main({ argv: ['prod', 'retire'], ...w.deps(answers) }), e => e.code === 3);
  }
  assert.equal(w.statements.filter(isWrite).length, 0);
  assert.equal(w.gitCalls.some(c => c.startsWith('push')), false);
  assert.equal(w.names().has('table:learn_grades'), true);
});

test('retire (prod): follows v0.5 7.3 exactly, deletes the P6a recovery branch, leaves a clean preflight diff and a receipt', async t => {
  const w = window(t);
  await ready(w, 'prod');
  assert.equal(await main({ argv: ['prod', 'retire'], ...w.deps(['RETIRE PROD', 'P6A SERVED']) }), 0);
  for (const o of RETIRED_OBJECTS) assert.equal(w.names().has(o), false, o);
  const goals = w.sqlite.prepare('SELECT id, lifecycle FROM learn_goals ORDER BY id').all().map(r => [r.id, r.lifecycle]);
  assert.deepEqual(goals, [['lg_lj_arch', 'archived'], ['lg_lj_att', 'open'], ['lg_lj_crit', 'open'], ['lg_lj_obs', 'open'], ['lg_lj_renamed', 'open']], 'only the untouched placeholder went; the archived goal stayed archived');
  assert.equal(w.sqlite.prepare('SELECT active_goal_id FROM learn_coaching_state').get().active_goal_id, null);
  assert.ok(w.gitCalls.includes(`push rabbit-hole --delete ${P6A_RECOVERY}`));
  assert.ok(w.gitCalls.includes(`grep -nE learning_journeys|learning_path_versions|learn_grades|tutor_eval_ ${P6A_SHA} -- packages/control-plane/src packages/web/src packages/web/dev-worker.js packages/web/app-worker.js`));
  const [, done] = [...w.receipts.entries()].find(([f]) => f.endsWith('prod-retire-done.json'));
  assert.deepEqual([done.preflight_diff, done.p6a_recovery_branch, done.steps.length], [[], 'deleted', 9]);
  assert.match(w.lines.join('\n'), /RESULT OK retire prod: the preflight diff/);
});

test('retire (dev) keeps the P6a recovery branch because production still needs it', async t => {
  const w = window(t);
  await ready(w);
  await main({ argv: ['dev', 'retire'], ...w.deps(['RETIRE DEV', 'P6A SERVED']) });
  assert.equal(w.gitCalls.some(c => c.startsWith('push')), false);
});

test('retire is resumable: a rerun after a partial run, and after a complete one, ends clean', async t => {
  const w = window(t);
  await ready(w);
  // a stopped run: the data steps and two drops happened, the rest did not (children first, so the FKs held)
  w.sqlite.exec("UPDATE learn_coaching_state SET active_goal_id = NULL; DELETE FROM learn_goals WHERE id = 'lg_lj_ph'; DROP TABLE tutor_eval_artifact_chunks; DROP TABLE tutor_eval_artifacts;");
  assert.equal(await main({ argv: ['dev', 'retire'], ...w.deps(['RETIRE DEV', 'P6A SERVED']) }), 0);
  for (const o of RETIRED_OBJECTS) assert.equal(w.names().has(o), false, o);
  // after learning_journeys is gone the backfill step is skipped and check still reads
  await main({ argv: ['dev', 'retire'], ...w.deps(['RETIRE DEV', 'P6A SERVED']) });
  assert.equal(await main({ argv: ['dev', 'check'], ...w.deps('') }), 0);
});

test('window refusals: a dirty checkout, a recovery branch that does not descend, a recovery or P6a commit that queries a retired table, a foreign schema difference', async t => {
  const w = window(t);
  await ready(w);
  const attempt = () => main({ argv: ['dev', 'window-check'], ...w.deps('') });
  w.gitState.dirty = ' M scripts/x.mjs';
  await assert.rejects(attempt(), /tracked files are modified/);
  w.gitState.dirty = ''; w.gitState.ancestor = 1;
  await assert.rejects(attempt(), /not a descendant of HEAD/);
  w.gitState.ancestor = 0; w.gitState.grep['b'.repeat(40)] = 'packages/control-plane/src/x.js:1:FROM learning_journeys';
  await assert.rejects(attempt(), /queries a table the window drops/);
  delete w.gitState.grep['b'.repeat(40)]; w.gitState.grep[P6A_SHA] = 'packages/control-plane/src/x.js:1:FROM learn_grades';
  await assert.rejects(attempt(), /P6a .* queries a table/);
  delete w.gitState.grep[P6A_SHA];
  w.sqlite.exec('CREATE TABLE roadmap_unrelated (id TEXT)');
  await assert.rejects(attempt(), /live schema differs from this checkout[\s\S]*roadmap_unrelated/);
  assert.equal(w.statements.filter(isWrite).length, 0);
});

test('retire (prod) stops before any SQL when the P6a recovery branch cannot be deleted', async t => {
  const w = window(t);
  await ready(w, 'prod');
  w.gitState.remoteDelete = { status: 1, stderr: 'remote: Permission denied' };
  await assert.rejects(main({ argv: ['prod', 'retire'], ...w.deps(['RETIRE PROD', 'P6A SERVED']) }), /could not delete .*nothing was dropped/);
  assert.equal(w.statements.filter(isWrite).length, 0);
  w.gitState.remoteDelete = { status: 1, stderr: 'error: unable to delete: remote ref does not exist' };
  assert.equal(await main({ argv: ['prod', 'retire'], ...w.deps(['RETIRE PROD', 'P6A SERVED']) }), 0);
});

// --- enforced isolation ----------------------------------------------------------------------------------------------------

test('enforced isolation: the real entry point refuses a mutating command without a terminal, before credentials or any child process', () => {
  const dir = mkdtempSync(join(tmpdir(), 'retire-isolation-'));
  const marker = join(dir, 'stub-was-run');
  for (const name of ['npx', 'npx.cmd', 'wrangler', 'wrangler.cmd', 'git', 'git.cmd']) writeFileSync(join(dir, name), `echo ran > "${marker}"\n`);
  for (const command of ['backfill', 'retire']) {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'learn-retire-tutor-runner.mjs'), 'prod', command], {
      env: { PATH: dir, SystemRoot: process.env.SystemRoot }, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], input: 'RETIRE PROD\nP6A SERVED\n', timeout: 30000,
    });
    assert.equal(r.status, 2, command);
    assert.match(r.stdout, /needs a terminal; nothing was run/);
    assert.doesNotMatch(r.stdout + r.stderr, /CLOUDFLARE|token/i);
  }
  assert.equal(existsSync(marker), false, 'no stub executable ran');
});
