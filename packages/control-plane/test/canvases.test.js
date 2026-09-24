import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');

// small-learn-dev already holds the older tables and the whole file is applied to it
// again (T12 prep), so the file must stay additive and re-runnable.
test('repository-schema.sql adds the canvases table (T02 section 8.1) and re-applies cleanly', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(schema); sqlite.exec(schema);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(canvases)').all().map(c => c.name), ['id', 'org', 'name', 'owner_email', 'title', 'project', 'created_at', 'archived_at', 'device_id']);
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','A')");
  assert.throws(() => sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','other@test','B')"), /UNIQUE/);
  assert.ok(sqlite.prepare('SELECT created_at FROM canvases').get().created_at);
});
