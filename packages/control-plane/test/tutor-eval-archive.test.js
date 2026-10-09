// Tutor evaluation archive (learn-migrations/0017, src/tutor-eval-archive.js): byte-exact artifacts, owner-only import,
// an interrupted import stays visibly incomplete. On node:sqlite, built from the same repository-schema.sql the D1 gets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { learnDb } from './learn-grade-fixture.js';
import { TutorEvalArchive, executionFromManifest, chunksOf, CHUNK_BYTES } from '../src/tutor-eval-archive.js';

const migration = readFileSync(new URL('../learn-migrations/0017-tutor-eval-archive.sql', import.meta.url), 'utf8');
const lf = s => s.replace(/\r\n/g, '\n');
const manifest = { run_id: 'r-2026-10-09-a', run_date: '2026-10-09', analysis_version: 'v3', harness_version: '1.4.0', eval_schema_version: 7, topic: 'nanogpt', mode: 'scripted', config_version: 'cfg-1a2b', status: 'completed', jev_cost_usd: null, jev_cost_note: 'scripted run: no JEV call' };
const ids = { importedBy: 'u_owner', sourceSha: 'a'.repeat(40), testedTree: 'b'.repeat(40) };
const exec = (over = {}) => executionFromManifest({ ...manifest, ...over }, { ...ids, artifactCount: over.artifact_count ?? 3 });
const sha = b => createHash('sha256').update(b).digest('hex');
const big = n => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (i * 7 + 3) & 255; return b; };
const archive = t => new TutorEvalArchive(learnDb(t).LEARN_DB);
async function importAll(a, e, artifacts) {
  await a.declare(e);
  for (const [key, kind, bytes] of artifacts) await a.put(e.execution_id, key, kind, bytes);
  return a.complete(e.execution_id);
}
const trio = [['run.json', 'manifest', Buffer.from(JSON.stringify(manifest))], ['aggregate.json', 'aggregate', Buffer.from('{"n":1}')], ['nanogpt-novice.json', 'session', big(3 * CHUNK_BYTES + 17)]];

test('0017 is additive, re-runnable, exactly what repository-schema.sql applies, and apart from learning evidence and telemetry', t => {
  const fresh = new DatabaseSync(':memory:'); t.after(() => fresh.close());
  fresh.exec(migration); fresh.exec(migration);
  const names = fresh.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  assert.deepEqual(names, ['tutor_eval_artifact_chunks', 'tutor_eval_artifacts', 'tutor_eval_artifacts_kind', 'tutor_eval_executions', 'tutor_eval_executions_config', 'tutor_eval_executions_date', 'tutor_eval_executions_topic']);
  for (const n of names) assert.match(n, /^tutor_eval_/, 'nothing touches learning_journeys or next_steps_telemetry');
  const { sqlite } = learnDb(t);
  for (const n of names) assert.equal(lf(sqlite.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(n).sql), lf(fresh.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(n).sql), n);
});

test('a full import round-trips every artifact byte-exactly, chunked above CHUNK_BYTES, and is complete', async t => {
  const a = archive(t), e = exec();
  const s = await importAll(a, e, trio);
  assert.equal(s.complete, true); assert.ok(s.completed_at);
  for (const [key, , bytes] of trio) { const back = await a.bytes(e.execution_id, key); assert.ok(back.equals(bytes), key); assert.equal(sha(back), sha(bytes)); }
  assert.equal(chunksOf(trio[2][2]).length, 4);
  const row = (await a.list())[0];
  assert.equal(row.execution_id, 'r-2026-10-09-a:v3');
  assert.deepEqual([row.topic, row.mode, row.config_version, row.status, row.jev_cost_usd], ['nanogpt', 'scripted', 'cfg-1a2b', 'completed', null], 'unknown cost stays NULL, never 0');
});

test("the run's own outcome is archived as reported: stopped and failed runs import whole; partial never looks completed", async t => {
  const a = archive(t);
  for (const [status, run_id] of [['stopped', 'r-stop'], ['failed', 'r-fail'], ['partial', 'r-part']]) {
    const s = await importAll(a, exec({ run_id, status }), trio);
    assert.equal(s.complete, true, `${status}: the import of the artifacts completed`);
  }
  assert.deepEqual((await a.list()).map(x => x.status), ['stopped', 'failed', 'partial'], 'the status column, not completed_at, carries the run outcome');
  assert.throws(() => exec({ status: 'done' }), /status must be one of/);
  assert.throws(() => exec({ mode: 'live' }), /mode must be one of/);
  assert.throws(() => exec({ jev_cost_usd: -1 }), /non-negative number or null/);
  assert.equal(exec({ mode: 'real', jev_cost_usd: 2.24, jev_cost_note: 'JEV at list price' }).jev_cost_usd, 2.24);
});

test('a duplicate import of the same execution is refused; the same run re-analysed is a new execution', async t => {
  const a = archive(t);
  await importAll(a, exec(), trio);
  await assert.rejects(a.declare(exec()), /already archived: an import is never repeated in place/);
  const again = exec({ analysis_version: 'v4' });
  await importAll(a, again, trio);
  assert.deepEqual((await a.list()).map(x => x.execution_id), ['r-2026-10-09-a:v3', 'r-2026-10-09-a:v4']);
});

test('conflicting artifact bytes under one key are refused, whole or by chunk; identical bytes are a no-op', async t => {
  const a = archive(t), e = exec();
  await a.declare(e);
  await a.put(e.execution_id, 'aggregate.json', 'aggregate', Buffer.from('{"n":1}'));
  await a.put(e.execution_id, 'aggregate.json', 'aggregate', Buffer.from('{"n":1}'));
  await assert.rejects(a.put(e.execution_id, 'aggregate.json', 'aggregate', Buffer.from('{"n":2}')), /already holds different bytes/);
  assert.ok((await a.bytes(e.execution_id, 'aggregate.json')).equals(Buffer.from('{"n":1}')), 'the first bytes stay');
});

test('two separate runs on the same date are two executions', async t => {
  const a = archive(t);
  await importAll(a, exec({ run_id: 'r-2026-10-09-a' }), trio);
  await importAll(a, exec({ run_id: 'r-2026-10-09-b' }), trio);
  assert.equal((await a.list()).filter(x => x.run_date === '2026-10-09').length, 2);
});

test('a partial upload stays visibly incomplete: missing artifacts and missing chunks are named, complete() refuses', async t => {
  const a = archive(t), e = exec();
  await a.declare(e);
  await a.put(e.execution_id, 'run.json', 'manifest', trio[0][2]);
  let s = await a.status(e.execution_id);
  assert.equal(s.complete, false); assert.equal(s.completed_at, null);
  assert.deepEqual(s.missing, ['2 of 3 artifacts never put']);
  await assert.rejects(a.complete(e.execution_id), /incomplete: 2 of 3 artifacts never put/);
  // A chunk lost mid-way (the import process died): the artifact is unverified and cannot be read.
  const { sqlite, LEARN_DB } = learnDb(t); const b = new TutorEvalArchive(LEARN_DB), f = exec({ run_id: 'r-cut' });
  await b.declare(f); await b.put(f.execution_id, 'big.json', 'session', trio[2][2]);
  sqlite.exec("DELETE FROM tutor_eval_artifact_chunks WHERE artifact_key = 'big.json' AND seq = 2");
  sqlite.exec("UPDATE tutor_eval_artifacts SET verified_at = NULL WHERE artifact_key = 'big.json'");
  await assert.rejects(b.bytes(f.execution_id, 'big.json'), /incomplete: 3 of 4 chunks/);
  s = await b.status(f.execution_id);
  assert.deepEqual(s.missing, ['big.json: not verified', '2 of 3 artifacts never put']);
  // The owner re-puts the same bytes: the missing chunk is filled, nothing else rewritten, and it verifies.
  await b.put(f.execution_id, 'big.json', 'session', trio[2][2]);
  assert.ok((await b.bytes(f.execution_id, 'big.json')).equals(trio[2][2]));
});

test('payload-size boundaries: empty, one byte, exactly one chunk, one over, and a corrupted chunk never reassembles', async t => {
  const a = archive(t), e = exec({ artifact_count: 4 });
  await a.declare(e);
  const cases = [['empty', Buffer.alloc(0), 1], ['one', Buffer.from('x'), 1], ['exact', big(CHUNK_BYTES), 1], ['over', big(CHUNK_BYTES + 1), 2]];
  for (const [key, bytes, chunks] of cases) {
    assert.equal(chunksOf(bytes).length, chunks, key);
    await a.put(e.execution_id, key, 'session', bytes);
    assert.ok((await a.bytes(e.execution_id, key)).equals(bytes), key);
  }
  const { sqlite, LEARN_DB } = learnDb(t); const b = new TutorEvalArchive(LEARN_DB), f = exec({ run_id: 'r-corrupt' });
  await b.declare(f); await b.put(f.execution_id, 'over', 'session', big(CHUNK_BYTES + 1));
  sqlite.prepare("UPDATE tutor_eval_artifact_chunks SET bytes = ? WHERE artifact_key = 'over' AND seq = 1").run(Buffer.from('y'));
  await assert.rejects(b.bytes(f.execution_id, 'over'), /does not reassemble to its recorded sha256/);
});

test('a manifest without its identity fields, a bad date, or a short sha/tree is refused before anything is written', () => {
  assert.throws(() => exec({ run_id: undefined }), /lacks run_id/);
  assert.throws(() => exec({ topic: undefined }), /lacks topic/);
  assert.throws(() => exec({ run_date: '9 Oct' }), /YYYY-MM-DD/);
  assert.throws(() => executionFromManifest(manifest, { ...ids, testedTree: 'b'.repeat(8), artifactCount: 1 }), /testedTree must be a full 40-hex id/);
});
