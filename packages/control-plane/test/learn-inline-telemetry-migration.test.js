// learn-migrations/0018 (docs/features/inline-ai-editor.md A5): the inline AI telemetry table on its own, so it can be
// approved and applied apart from the feature. Applied to local stacks only until the owner's GO.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('0018 is additive, re-runnable and exactly what repository-schema.sql applies', t => {
  const migration = readFileSync(new URL('../learn-migrations/0018-inline-ai-telemetry.sql', import.meta.url), 'utf8');
  const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM inline_ai_telemetry').get().n, 0);
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
});

test('0018 keeps no content column: only ids, tags, the route, the outcome and the metrics allowlist', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../learn-migrations/0018-inline-ai-telemetry.sql', import.meta.url), 'utf8'));
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(inline_ai_telemetry)').all().map(c => c.name),
    ['request_id', 'created_at', 'user_id', 'board', 'source', 'run_id', 'sha', 'fixture', 'mocked', 'streaming', 'route', 'capability', 'outcome', 'metrics_json']);
  assert.throws(() => sqlite.prepare("INSERT INTO inline_ai_telemetry (request_id, created_at, board, source, route, outcome, metrics_json) VALUES ('r', 'now', 'b', 'live', 'guessed', 'x', '{}')").run(), /CHECK/);
});
