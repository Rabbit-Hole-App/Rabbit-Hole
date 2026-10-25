import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { makeEvent } from '../src/telemetry-contract.js';
import { emitTelemetry, telemetryOutbox, writeEvents } from '../src/telemetry-delivery.js';
import { syncSql, telemetryDb } from './telemetry-fixture.js';

const NOW = 1_760_000_000_000;
const stage = (id, fields = {}) => makeEvent('stage.finished', { event_id: id, job_id: 'job-1', stage: 'render', outcome: 'completed', payload: { duration_ms: 1200 }, ...fields },
  { environment: 'dev', service: 'job', now: NOW });
// A Durable Object's own storage: the job's state table and the outbox in one SQLite database.
function jobStorage(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec('CREATE TABLE jobs (id TEXT PRIMARY KEY, status TEXT)');
  return sqlite;
}
const rows = sqlite => sqlite.prepare('SELECT event_id, occurred_at, ingested_at FROM telemetry_events ORDER BY event_id').all().map(row => ({ ...row }));

test('duplicate delivery: the same event appended twice, or delivered twice, is one telemetry row', async t => {
  const storage = jobStorage(t), { sqlite, db } = telemetryDb(t);
  const outbox = telemetryOutbox(syncSql(storage));
  assert.deepEqual(outbox.append(stage('ev-a'), NOW), { ok: true });
  assert.deepEqual(outbox.append(stage('ev-a'), NOW), { ok: true });
  assert.equal(outbox.health(NOW).pending, 1);
  const sink = (events, now) => writeEvents(db, events, now);
  assert.deepEqual(await outbox.drain(sink, { now: NOW }), { delivered: 1, failed: 0, dead: 0 });
  assert.equal(rows(sqlite).length, 1);
  // A replay after delivery (a restored backup, a retried drain whose delete was lost) adds nothing.
  outbox.append(stage('ev-a'), NOW + 1);
  assert.deepEqual(await outbox.drain(sink, { now: NOW + 1 }), { delivered: 1, failed: 0, dead: 0 });
  assert.equal(await writeEvents(db, [stage('ev-a')], NOW + 2), 0, 'the sink itself ignores a duplicate id');
  assert.equal(rows(sqlite).length, 1);
});

test('delayed delivery keeps the producer time and records the ingestion time apart', async t => {
  const storage = jobStorage(t), { sqlite, db } = telemetryDb(t);
  const outbox = telemetryOutbox(syncSql(storage));
  const twoDaysAgo = NOW - 2 * 86_400_000;
  outbox.append(stage('ev-old', { occurred_at: twoDaysAgo }), twoDaysAgo);
  assert.equal(outbox.health(NOW).oldest_age_ms, 2 * 86_400_000, 'the backlog age is measured');
  await outbox.drain((events, now) => writeEvents(db, events, now), { now: NOW });
  assert.deepEqual(rows(sqlite), [{ event_id: 'ev-old', occurred_at: twoDaysAgo, ingested_at: NOW }]);
  assert.equal(outbox.health(NOW).pending, 0);
});

test('exporter outage: the job state still commits, events wait with backoff, and dead rows are counted not lost', async t => {
  const storage = jobStorage(t), down = telemetryDb(t, { fail: () => true });
  const outbox = telemetryOutbox(syncSql(storage), { maxAttempts: 3 });
  // The state change and its event in one transaction, as a Durable Object's transactionSync would.
  storage.exec('BEGIN');
  storage.prepare('INSERT INTO jobs (id, status) VALUES (?, ?)').run('job-1', 'rendered');
  outbox.append(stage('ev-b'), NOW);
  storage.exec('COMMIT');
  const sink = (events, now) => writeEvents(down.db, events, now);
  assert.deepEqual(await outbox.drain(sink, { now: NOW }), { delivered: 0, failed: 1, dead: 0 });
  assert.equal(storage.prepare('SELECT status FROM jobs').get().status, 'rendered', 'the product write is unaffected');
  assert.deepEqual(await outbox.drain(sink, { now: NOW + 1000 }), { delivered: 0, failed: 0, dead: 0 }, 'not due again before its backoff');
  await outbox.drain(sink, { now: NOW + 31_000 });
  assert.deepEqual(await outbox.drain(sink, { now: NOW + 200_000 }), { delivered: 0, failed: 1, dead: 1 });
  assert.deepEqual(outbox.health(NOW + 200_000), { pending: 0, dead: 1, oldest_age_ms: 0 });
});

test('an invalid event is refused at append, so a drain never carries it', t => {
  const outbox = telemetryOutbox(syncSql(jobStorage(t)));
  const result = outbox.append({ ...stage('ev-c'), prompt: 'private words' }, NOW);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [{ code: 'unknown_field', field: 'prompt' }]);
  assert.equal(outbox.health(NOW).pending, 0);
});

test('restart: a new outbox over the same storage drains what the old one left', async t => {
  const storage = jobStorage(t), { sqlite, db } = telemetryDb(t);
  telemetryOutbox(syncSql(storage)).append(stage('ev-d'), NOW);
  telemetryOutbox(syncSql(storage)).append(stage('ev-e'), NOW); // a second construction re-runs CREATE IF NOT EXISTS harmlessly
  // The isolate is evicted here; a fresh one constructs its outbox from the same SQLite.
  const revived = telemetryOutbox(syncSql(storage));
  assert.deepEqual(await revived.drain((events, now) => writeEvents(db, events, now), { now: NOW + 5 }), { delivered: 2, failed: 0, dead: 0 });
  assert.deepEqual(rows(sqlite).map(r => r.event_id), ['ev-d', 'ev-e']);
});

test('emitTelemetry writes nothing without a binding or an environment, refuses invalid events and survives an outage', async t => {
  const { sqlite, db } = telemetryDb(t);
  const down = telemetryDb(t, { fail: () => true });
  const warned = [];
  t.mock.method(console, 'warn', line => warned.push(String(line)));
  assert.equal(await emitTelemetry({ TELEMETRY_ENVIRONMENT: 'dev' }, stage('ev-f')), false, 'no TELEMETRY_DB');
  assert.equal(await emitTelemetry({ TELEMETRY_DB: db }, stage('ev-f')), false, 'no TELEMETRY_ENVIRONMENT');
  assert.equal(await emitTelemetry({ TELEMETRY_DB: db, TELEMETRY_ENVIRONMENT: 'dev' }, { ...stage('ev-g'), comment: 'private-words-7731' }), false);
  assert.equal(await emitTelemetry({ TELEMETRY_DB: down.db, TELEMETRY_ENVIRONMENT: 'dev' }, stage('ev-h')), false);
  assert.equal(await emitTelemetry({ TELEMETRY_DB: db, TELEMETRY_ENVIRONMENT: 'production' }, stage('ev-i', { environment: 'dev' })), true);
  // The deployment's environment wins over the producer's claim, so a dev event cannot land as production or the reverse.
  assert.deepEqual(sqlite.prepare('SELECT event_id, environment FROM telemetry_events').all().map(row => ({ ...row })), [{ event_id: 'ev-i', environment: 'production' }]);
  assert.ok(warned.some(line => line.includes('telemetry_rejected')) && warned.some(line => line.includes('telemetry_dropped')));
  assert.ok(warned.every(line => !line.includes('private-words-7731')), 'a refusal names the field, never echoes its value');
});
