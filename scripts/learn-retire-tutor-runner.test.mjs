// Tests for the owner-run backfill launcher. The mutating paths run against an in-memory SQLite behind a fake wrangler: no
// credentials, no network, no real database. The last test is the enforced-isolation check (CLAUDE.md "Release requirements"):
// the real entry point, run in a process whose PATH holds only a stub and whose environment holds no credentials, must refuse
// a mutating command before it reads credentials or starts anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { learnDb } from '../packages/control-plane/test/learn-grade-fixture.js';
import { GENERATOR_SHA256, ROOT, Stop, assertDatabase, main } from './learn-retire-tutor-runner.mjs';

function world(t, { unarchived = 2 } = {}) {
  const { sqlite } = learnDb(t);
  sqlite.exec('DROP TABLE IF EXISTS learning_journeys; CREATE TABLE learning_journeys (id TEXT PRIMARY KEY, archived_at TEXT);');
  for (let i = 0; i < unarchived; i += 1) {
    sqlite.prepare("INSERT INTO learning_journeys (id, archived_at) VALUES (?, '2026-09-01T00:00:00Z')").run(`lj_${i}`);
    sqlite.prepare(`INSERT INTO learn_goals (id, org, owner_user_id, app, board, label, outcome, origin, scope_version, lifecycle, journey_id, activity_id, revision, created_at, updated_at)
      VALUES (?, 'ws', 'u', 'canvas-0000aaaa', 'main', 'g', '', 'journey', 0, 'open', ?, NULL, 0, 'x', 'x')`).run(`lg_lj_${i}`, `lj_${i}`);
  }
  const statements = [], receipts = new Map(), lines = [];
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
  const deps = answer => ({ readFile, spawn, prompt: async () => answer, writeReceipt: (f, b) => receipts.set(f, b), readReceipt: f => receipts.get(f) ?? null, log: l => lines.push(l), now: () => '2026-11-06T00:00:00Z' });
  const unarchivedNow = () => sqlite.prepare("SELECT COUNT(*) AS n FROM learn_goals WHERE lifecycle <> 'archived'").get().n;
  return { statements, receipts, lines, deps, unarchivedNow };
}
const isWrite = s => !/^\s*SELECT/i.test(s);

test('check is read-only: it counts, runs only SELECTs and writes no receipt', async t => {
  const w = world(t);
  assert.equal(await main({ argv: ['dev', 'check'], ...w.deps('') }), 0);
  assert.equal(w.statements.filter(isWrite).length, 0);
  assert.equal(w.receipts.size, 0);
  assert.equal(w.unarchivedNow(), 2);
  assert.match(w.lines.join('\n'), /RESULT CHECK dev: verify=2/);
});

test('backfill: a wrong typed phrase changes nothing; the right one archives, verifies 0 and writes the receipt', async t => {
  const w = world(t);
  await assert.rejects(main({ argv: ['dev', 'backfill'], ...w.deps('backfill dev') }), e => e instanceof Stop && e.code === 3);
  assert.equal(w.statements.filter(isWrite).length, 0);
  assert.equal(w.receipts.size, 0);
  assert.equal(await main({ argv: ['dev', 'backfill'], ...w.deps('BACKFILL DEV') }), 0);
  assert.equal(w.unarchivedNow(), 0);
  const [receipt] = [...w.receipts.values()];
  assert.deepEqual([receipt.env, receipt.database, receipt.unarchived_goals, receipt.archived_by_this_run], ['dev', 'rabbit-hole-learn-dev', 0, 2]);
  assert.equal(receipt.generator_sha256, GENERATOR_SHA256);
});

test('backfill with nothing to archive still needs the typed phrase and writes no UPDATE', async t => {
  const w = world(t, { unarchived: 0 });
  await assert.rejects(main({ argv: ['prod', 'backfill'], ...w.deps('') }), e => e.code === 3);
  assert.equal(await main({ argv: ['prod', 'backfill'], ...w.deps('BACKFILL PROD') }), 0);
  assert.equal(w.statements.filter(isWrite).length, 0);
  assert.equal([...w.receipts.keys()][0].endsWith('prod-backfill-verified.json'), true);
});

test('gate refuses without a receipt; passes with a receipt and verify 0', async t => {
  const w = world(t);
  await assert.rejects(main({ argv: ['dev', 'gate'], ...w.deps('') }), /no verified backfill receipt for dev/);
  await main({ argv: ['dev', 'backfill'], ...w.deps('BACKFILL DEV') });
  assert.equal(await main({ argv: ['dev', 'gate'], ...w.deps('') }), 0);
});

test('gate fails when a goal is unarchived again after the receipt (for example the P4 recovery branch ran)', async t => {
  const w = world(t);
  await main({ argv: ['dev', 'backfill'], ...w.deps('BACKFILL DEV') });
  const reopen = { ...w.deps(''), spawn: (cmd, args, opts) => ({ status: 0, stdout: JSON.stringify([{ results: [{ unarchived_goals: 1 }], success: true, meta: {} }]), stderr: '' }) };
  await assert.rejects(main({ argv: ['dev', 'gate'], ...reopen }), /verify is 1 now/);
});

test('a database the config does not bind, a changed generator and an unknown command stop before any SQL', async t => {
  const w = world(t);
  assert.throws(() => assertDatabase('prod', '{ "binding": "LEARN_DB", "database_name": "rabbit-hole-learn-dev", "database_id": "028f800f-ce8e-4461-adb2-827f417492eb" }'), /does not bind LEARN_DB to rabbit-hole-learn-prod/);
  const edited = { ...w.deps(''), readFile: f => (f.endsWith('learn-retire-tutor-data.mjs') ? 'export {}' : w.deps('').readFile(f)) };
  await assert.rejects(main({ argv: ['dev', 'check'], ...edited }), /not the pinned/);
  await assert.rejects(main({ argv: ['dev', 'retire'], ...w.deps('') }), e => e.code === 2);
  assert.equal(w.statements.length, 0);
});

test('every environment names its real Learn database and dev and parallel are the same one', () => {
  for (const [env, name] of [['dev', 'rabbit-hole-learn-dev'], ['parallel', 'rabbit-hole-learn-dev'], ['prod', 'rabbit-hole-learn-prod']]) {
    assert.ok(assertDatabase(env, readFileSync(join(ROOT, { dev: 'packages/web/wrangler.dev.jsonc', parallel: 'packages/web/wrangler.parallel.jsonc', prod: 'packages/web/wrangler.rabbit-hole-prod.jsonc' }[env]), 'utf8')).name === name);
  }
});

test('enforced isolation: the real entry point refuses a mutating command without a terminal, before credentials or any child process', () => {
  const dir = mkdtempSync(join(tmpdir(), 'retire-isolation-'));
  const marker = join(dir, 'stub-was-run');
  for (const name of ['npx', 'npx.cmd', 'wrangler', 'wrangler.cmd']) writeFileSync(join(dir, name), `echo ran > "${marker}"\n`);
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'learn-retire-tutor-runner.mjs'), 'prod', 'backfill'], {
    env: { PATH: dir, SystemRoot: process.env.SystemRoot }, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], input: 'BACKFILL PROD\n', timeout: 30000,
  });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /needs a terminal; nothing was run/);
  assert.equal(existsSync(marker), false, 'no stub executable ran');
  assert.doesNotMatch(r.stdout + r.stderr, /CLOUDFLARE|token/i);
});
