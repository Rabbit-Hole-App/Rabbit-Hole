// Tutor evaluation archive (learn-migrations/0017, src/tutor-eval-archive.js): byte-exact originals, owner-only import,
// resumable, an interrupted import stays visibly incomplete. On node:sqlite, from the same repository-schema.sql the D1 gets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { learnDb } from './learn-grade-fixture.js';
import { TutorEvalArchive, execution, executionFromRunJson, chunksOf, CHUNK_BYTES, EXECUTION_COLUMNS } from '../src/tutor-eval-archive.js';

const migration = readFileSync(new URL('../learn-migrations/0017-tutor-eval-archive.sql', import.meta.url), 'utf8');
const lf = s => s.replace(/\r\n/g, '\n');
const sha = b => createHash('sha256').update(b).digest('hex');
const big = n => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (i * 7 + 3) & 255; return b; };
const base = { execution_id: 'paid-20261008T180918Z-01a7a508', run_id: 'paid-2026-10-08', run_started_at: '2026-10-08T18:09:18.000Z', run_finished_at: '2026-10-08T18:31:02.000Z',
  topic: 'logistic-regression', mode: 'real', status: 'completed', source_sha: '01a7a508'.padEnd(40, '0'), tested_tree: 'b'.repeat(40), harness_version: '2cb65b39'.padEnd(40, '0'),
  config_version: 'cfg-1a2b3c4d5e', anthropic_usd: 2.24, anthropic_calls: 9, jev_cost_usd: null, jev_cost_note: 'provider reports no cost; included nowhere', imported_by: 'u_owner', artifact_count: 3 };
const exec = (over = {}) => ({ ...base, ...over });
const archive = t => new TutorEvalArchive(learnDb(t).LEARN_DB);
const trio = [['run.json', 'manifest', Buffer.from(JSON.stringify({ run_id: base.run_id })), {}], ['aggregate.json', 'aggregate', Buffer.from('{"n":1}'), { analysisVersion: '2cb65b39' }], ['logistic-regression-novice.json', 'session', big(3 * CHUNK_BYTES + 17), {}]];
async function importAll(a, e, artifacts) {
  await a.declare(e);
  for (const [key, kind, bytes, opts] of artifacts) await a.put(e.execution_id, key, kind, bytes, opts);
  return a.complete(e.execution_id);
}

test('0017 is additive, re-runnable, exactly what repository-schema.sql applies, and apart from learning evidence and telemetry', t => {
  const fresh = new DatabaseSync(':memory:'); t.after(() => fresh.close());
  fresh.exec(migration); fresh.exec(migration);
  const names = fresh.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  assert.deepEqual(names, ['tutor_eval_artifact_chunks', 'tutor_eval_artifacts', 'tutor_eval_artifacts_kind', 'tutor_eval_executions', 'tutor_eval_executions_date', 'tutor_eval_executions_sha', 'tutor_eval_executions_topic']);
  for (const n of names) assert.match(n, /^tutor_eval_/, 'nothing touches learning_journeys or next_steps_telemetry');
  const { sqlite } = learnDb(t);
  for (const n of names) assert.equal(lf(sqlite.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(n).sql), lf(fresh.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(n).sql), n);
  assert.ok(CHUNK_BYTES * 3 < 2_000_000, 'one chunk is far under a D1 row (2,000,000 bytes, platform limits)');
});

test('a full import round-trips every artifact byte-exactly, chunked above CHUNK_BYTES, lists and is complete', async t => {
  const a = archive(t), e = exec();
  const s = await importAll(a, e, trio);
  assert.equal(s.complete, true); assert.ok(s.completed_at);
  for (const [key, , bytes] of trio) { const back = await a.bytes(e.execution_id, key); assert.ok(back.equals(bytes), key); assert.equal(sha(back), sha(bytes)); }
  assert.equal(chunksOf(trio[2][2]).length, 4);
  const [row] = await a.list();
  assert.deepEqual([row.execution_id, row.run_date, row.topic, row.mode, row.status, row.anthropic_usd, row.jev_cost_usd, row.analysis_versions], [base.execution_id, '2026-10-08', 'logistic-regression', 'real', 'completed', 2.24, null, ['2cb65b39']]);
  assert.deepEqual((await a.artifacts(e.execution_id, { kind: 'session' })).map(x => [x.key, x.byte_length, x.content_type]), [['logistic-regression-novice.json', 3 * CHUNK_BYTES + 17, 'application/json']]);
  assert.deepEqual((await a.list({ topic: 'other' })), []);
  assert.equal((await a.list({ sha: base.source_sha, from: '2026-10-08', to: '2026-10-08', status: 'completed' })).length, 1);
});

test('declare is resumable: the same declaration returns the row, a different one is refused; a run never becomes two executions', async t => {
  const a = archive(t);
  const first = await a.declare(exec()); assert.equal(first.resumed, false);
  const again = await a.declare(exec()); assert.equal(again.resumed, true);
  await assert.rejects(a.declare(exec({ status: 'failed' })), /already declared with different status: refused/);
  await assert.rejects(a.declare(exec({ anthropic_usd: 0 })), /different anthropic_usd/);
  assert.equal((await a.list()).length, 1);
});

test('a recomputed aggregate is a new artifact on the same execution under its analysis_version; the original is never replaced', async t => {
  const a = archive(t), e = exec({ artifact_count: 4 });
  await a.declare(e);
  for (const [key, kind, bytes, opts] of trio) await a.put(e.execution_id, key, kind, bytes, opts);
  await a.put(e.execution_id, 'aggregate@6fd6b3c0.json', 'aggregate', Buffer.from('{"n":2}'), { analysisVersion: '6fd6b3c0' });
  await assert.rejects(a.put(e.execution_id, 'aggregate.json', 'aggregate', Buffer.from('{"n":2}'), { analysisVersion: '2cb65b39' }), /already holds different bytes/);
  assert.equal((await a.complete(e.execution_id)).complete, true);
  assert.deepEqual((await a.list())[0].analysis_versions, ['2cb65b39', '6fd6b3c0']);
  await assert.rejects(a.put(e.execution_id, 'x.json', 'aggregate', Buffer.from('{}')), /an aggregate needs its analysis_version/);
  await assert.rejects(a.put(e.execution_id, 'run.log', 'log', Buffer.from('x'), { analysisVersion: 'v' }), /a log has no analysis_version/);
});

test('conflicting bytes under one key are refused, whole or by chunk; identical bytes are a no-op; logs keep their content type', async t => {
  const a = archive(t), e = exec({ artifact_count: 2 });
  await a.declare(e);
  await a.put(e.execution_id, 'run.log', 'log', Buffer.from('line 1\n'));
  await a.put(e.execution_id, 'run.log', 'log', Buffer.from('line 1\n'));
  await assert.rejects(a.put(e.execution_id, 'run.log', 'log', Buffer.from('line 2\n')), /already holds different bytes/);
  await a.put(e.execution_id, 'steps.csv', 'log', Buffer.from('a,b\n'), { contentType: 'text/csv' });
  assert.deepEqual((await a.artifacts(e.execution_id)).map(x => [x.key, x.kind, x.content_type]), [['run.log', 'log', 'text/plain'], ['steps.csv', 'log', 'text/csv']]);
});

test('two separate runs on the same date are two executions', async t => {
  const a = archive(t);
  await importAll(a, exec({ execution_id: 'paid-20261008T154306Z-5484e38d' }), trio);
  await importAll(a, exec({ execution_id: 'paid-20261008T180918Z-01a7a508' }), trio);
  assert.equal((await a.list({ from: '2026-10-08', to: '2026-10-08' })).length, 2);
});

test('a partial upload stays visibly incomplete: missing artifacts, a count mismatch and a lost chunk are named; complete() refuses', async t => {
  const a = archive(t), e = exec();
  await a.declare(e);
  await a.put(e.execution_id, 'run.json', 'manifest', trio[0][2]);
  let s = await a.status(e.execution_id);
  assert.equal(s.complete, false); assert.equal(s.completed_at, null);
  assert.deepEqual(s.missing, ['1 of 3 artifacts verified']);
  await assert.rejects(a.complete(e.execution_id), /incomplete: 1 of 3 artifacts verified/);
  // More artifacts than declared is a mismatch too (Parallel amendment 2), never completed.
  const b = archive(t), f = exec({ execution_id: 'paid-over', artifact_count: 1 });
  await b.declare(f); await b.put(f.execution_id, 'run.json', 'manifest', trio[0][2]); await b.put(f.execution_id, 'run.log', 'log', Buffer.from('x'));
  await assert.rejects(b.complete(f.execution_id), /2 artifacts put, 1 declared/);
  // A chunk lost mid-way (the import process died): unverified, unreadable, and re-putting the same bytes fills only the gap.
  const { sqlite, LEARN_DB } = learnDb(t); const c = new TutorEvalArchive(LEARN_DB), g = exec({ execution_id: 'paid-cut' });
  await c.declare(g); await c.put(g.execution_id, 'big.json', 'session', trio[2][2]);
  sqlite.exec("DELETE FROM tutor_eval_artifact_chunks WHERE artifact_key = 'big.json' AND seq = 2");
  sqlite.exec("UPDATE tutor_eval_artifacts SET verified_at = NULL WHERE artifact_key = 'big.json'");
  await assert.rejects(c.bytes(g.execution_id, 'big.json'), /incomplete: 3 of 4 chunks/);
  assert.deepEqual((await c.status(g.execution_id)).missing, ['big.json: not verified', '0 of 3 artifacts verified']);
  await c.put(g.execution_id, 'big.json', 'session', trio[2][2]);
  assert.ok((await c.bytes(g.execution_id, 'big.json')).equals(trio[2][2]));
});

test('payload-size boundaries: empty, one byte, exactly one chunk, one over, the largest real file; a corrupted chunk never reassembles', async t => {
  const a = archive(t), e = exec({ artifact_count: 5 });
  await a.declare(e);
  const cases = [['empty', Buffer.alloc(0), 1], ['one', Buffer.from('x'), 1], ['exact', big(CHUNK_BYTES), 1], ['over', big(CHUNK_BYTES + 1), 2], ['largest', big(625839), 2]];
  for (const [key, bytes, chunks] of cases) {
    assert.equal(chunksOf(bytes).length, chunks, key);
    await a.put(e.execution_id, key, 'session', bytes);
    assert.ok((await a.bytes(e.execution_id, key)).equals(bytes), key);
  }
  assert.equal((await a.complete(e.execution_id)).complete, true);
  const { sqlite, LEARN_DB } = learnDb(t); const b = new TutorEvalArchive(LEARN_DB), f = exec({ execution_id: 'paid-corrupt', artifact_count: 1 });
  await b.declare(f); await b.put(f.execution_id, 'over', 'session', big(CHUNK_BYTES + 1));
  sqlite.prepare("UPDATE tutor_eval_artifact_chunks SET bytes = ? WHERE artifact_key = 'over' AND seq = 1").run(Buffer.from('y'));
  await assert.rejects(b.bytes(f.execution_id, 'over'), /does not reassemble to its recorded sha256/);
});

test('the run outcome is archived as reported: stopped, failed and partial runs import whole; unknown mode and NULL costs stay so', async t => {
  const a = archive(t);
  const aborted = exec({ execution_id: 'paid-20261008T1536Z-5484e38d-aborted', run_finished_at: null, mode: 'unknown', status: 'stopped', status_note: 'ABORTED.txt only: no bundle, spend unmetered', anthropic_usd: null, anthropic_calls: null, config_version: null, artifact_count: 1 });
  await a.declare(aborted); await a.put(aborted.execution_id, 'ABORTED.txt', 'log', Buffer.from('aborted\n'));
  assert.equal((await a.complete(aborted.execution_id)).complete, true);
  for (const [status, id] of [['failed', 'paid-fail'], ['partial', 'paid-part']]) await importAll(a, exec({ execution_id: id, status, run_finished_at: null }), trio);
  const rows = await a.list();
  assert.deepEqual(rows.map(x => [x.status, x.mode, x.anthropic_usd]), [['stopped', 'unknown', null], ['failed', 'real', 2.24], ['partial', 'real', 2.24]]);
  assert.throws(() => execution(exec({ status: 'done' })), /status must be one of/);
  assert.throws(() => execution(exec({ mode: 'live' })), /mode must be one of/);
  assert.throws(() => execution(exec({ anthropic_usd: -1 })), /anthropic_usd must be a non-negative number or null/);
  assert.throws(() => execution(exec({ run_started_at: '9 Oct' })), /ISO 8601/);
  assert.throws(() => execution(exec({ tested_tree: 'b'.repeat(8) })), /tested_tree must be a full 40-hex id/);
  assert.throws(() => execution(exec({ execution_id: undefined })), /lacks execution_id/);
  assert.equal(EXECUTION_COLUMNS.length, 19);
});

test("today's run.json (run.mjs on main, no execution_id/mode/status) maps with every gap explicit and overridable", async t => {
  const run = { run_id: 'paid-2026-10-08', started_at: '2026-10-08T18:09:18.000Z', sha: 'a'.repeat(40), tree: 'b'.repeat(40), dirty: false, topic: 'logistic-regression', profiles: ['novice'], keys: ['ANTHROPIC_API_KEY'],
    limits: { run_usd: 5, session_usd: 1, review_step_bytes: 4096, max_decisions: 12, budget_seconds: 900 }, models: { product: 'claude-opus-5-5' }, finished_at: '2026-10-08T18:31:02.000Z', anthropic: { total_usd: 2.24, held_usd: 0, calls: 9, refused: 0 } };
  const e = executionFromRunJson(run, { execution_id: 'paid-20261008T180918Z-aaaaaaaa', imported_by: 'u_owner', artifact_count: 3 });
  assert.deepEqual([e.run_date, e.topic, e.mode, e.status, e.source_sha, e.harness_version, e.anthropic_usd, e.anthropic_calls, e.jev_cost_usd], ['2026-10-08', 'logistic-regression', 'real', 'completed', 'a'.repeat(40), 'a'.repeat(40), 2.24, 9, null]);
  assert.match(e.config_version, /^[0-9a-f]{12}$/, 'a digest of limits and models');
  assert.equal(executionFromRunJson({ ...run, finished_at: undefined }, { execution_id: 'x', imported_by: 'u', artifact_count: 3 }).status, 'partial', 'unfinished is partial, never completed');
  assert.equal(executionFromRunJson(run, { execution_id: 'x', imported_by: 'u', artifact_count: 3, status: 'stopped', mode: 'unknown' }).mode, 'unknown', 'the importer may state what the harness could not');
  assert.equal(executionFromRunJson({ ...run, execution_id: 'minted', mode: 'scripted', status: 'failed' }, { imported_by: 'u', artifact_count: 1 }).execution_id, 'minted', 'the next run.mjs writes its own ids');
  assert.throws(() => executionFromRunJson(run, { imported_by: 'u', artifact_count: 3 }), /lacks execution_id/, 'an r27 manifest needs the importer to mint the id');
  const a = archive(t);
  await importAll(a, e, trio);
  assert.ok((await a.bytes(e.execution_id, 'run.json')).equals(trio[0][2]));
});
