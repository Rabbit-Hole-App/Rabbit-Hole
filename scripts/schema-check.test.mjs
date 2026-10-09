// The complete-schema check behind the production release preflight. No network.
//   node --test scripts/schema-check.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CP, SOURCES, expectedSchema, schemaDiff, schemaOf, normalizeSql, mainMigrationDiff } from './schema-check.mjs';

const learn = expectedSchema('learn');
const drop = (schema, key) => Object.fromEntries(Object.entries(schema).filter(([k]) => k !== key));

test('a live learn database equal to the repository build passes', () => {
  assert.deepEqual(schemaDiff(learn, { ...learn }), []);
});

test('the first-table check missed this: every 0011 table present but a Comments index missing is refused', () => {
  // Under the old preflight, 0011 counted as applied when canvas_members existed.
  assert.ok('table:canvas_members' in learn && 'index:canvas_comments_thread' in learn);
  assert.deepEqual(schemaDiff(learn, drop(learn, 'index:canvas_comments_thread')), ['missing index:canvas_comments_thread']);
  assert.deepEqual(schemaDiff(learn, drop(learn, 'table:canvas_comment_reads')), ['missing table:canvas_comment_reads']);
});

test('a table with a missing or different column, an extra object, or a hand-made index is refused', () => {
  const live = { ...learn, 'table:canvas_comments': learn['table:canvas_comments'].replace(',deleted_by TEXT', '') };
  assert.deepEqual(schemaDiff(learn, live), ['different table:canvas_comments']);
  assert.deepEqual(schemaDiff(learn, { ...learn, 'index:hand_made': 'CREATE INDEX hand_made ON canvases(id)' }), ['unexpected index:hand_made']);
});

test('comments, IF NOT EXISTS, quoting and whitespace are not schema; D1 drops comments', () => {
  assert.equal(normalizeSql('CREATE TABLE IF NOT EXISTS "t" (\n  a TEXT, -- note\n  b INT\n)'), normalizeSql('CREATE TABLE t(a TEXT,b INT)'));
  assert.notEqual(normalizeSql('CREATE TABLE t(a TEXT,b INT)'), normalizeSql('CREATE TABLE t(b INT,a TEXT)'));
});

test('internal objects are not schema: sqlite_*, _cf_* and wrangler\'s d1_migrations', () => {
  const rows = [{ type: 'table', name: '_cf_KV', sql: 'x' }, { type: 'table', name: 'd1_migrations', sql: 'x' }, { type: 'index', name: 'sqlite_autoindex_t_1', sql: null }, { type: 'table', name: 't', sql: 'CREATE TABLE t(a)' }];
  assert.deepEqual(Object.keys(schemaOf(rows)), ['table:t']);
});

test('learn migrations are DDL only, so a matching schema identifies the applied migrations', () => {
  for (const f of SOURCES.learn()) {
    // Statement by statement: ON DELETE CASCADE inside a CREATE is not a data change.
    const statements = readFileSync(join(CP, f), 'utf8').replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
    for (const s of statements) assert.match(s, /^CREATE (TABLE|(UNIQUE )?INDEX) IF NOT EXISTS /i, `${f}: "${s.slice(0, 60)}" is not an additive CREATE; schema identity would not cover it`);
  }
});

test('main migration identity: the applied list must name exactly the repository files', () => {
  const files = SOURCES.main().filter(f => f.startsWith('migrations/')).map(f => f.slice('migrations/'.length));
  assert.deepEqual(mainMigrationDiff(files, files), []);
  assert.deepEqual(mainMigrationDiff(files, files.slice(0, -1)), [`not applied ${files.at(-1)}`]);
  assert.deepEqual(mainMigrationDiff(files, [...files, '0099-elsewhere.sql']), ['applied but not in the repository 0099-elsewhere.sql']);
});
