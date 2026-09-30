import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

// A brand-new main D1 is built as bootstrap.sql, then every migration in filename order
// (what `wrangler d1 migrations apply` does). schema.sql is the reference for the current shape.
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const migrations = readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort();

function open(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  return db;
}
const apply = (db, names) => { for (const f of names) db.exec(read(`migrations/${f}`)); };
const shape = db => {
  const out = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())
    out[name] = db.prepare(`PRAGMA table_info(${name})`).all().map(c => `${c.name} ${c.type} ${c.notnull} ${c.dflt_value} ${c.pk}`);
  return out;
};
const indexes = db => db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all().map(i => `${i.tbl_name}.${i.name}`);

test('bootstrap.sql and every migration are D1-safe: no explicit transaction', () => {
  for (const f of ['bootstrap.sql', ...migrations.map(m => `migrations/${m}`)])
    assert.doesNotMatch(read(f), /^\s*(BEGIN|COMMIT|ROLLBACK)\b/im, f);
});

test('a fresh database: bootstrap.sql then every migration in order succeeds', t => {
  const db = open(t);
  db.exec(read('bootstrap.sql'));
  for (const f of migrations) assert.doesNotThrow(() => apply(db, [f]), f);
});

test('the fresh build has every table, column and index in schema.sql', t => {
  const built = open(t); built.exec(read('bootstrap.sql')); apply(built, migrations);
  const ref = open(t); ref.exec(read('schema.sql'));
  const got = shape(built);
  for (const [table, cols] of Object.entries(shape(ref))) {
    assert.ok(got[table], `missing table ${table}`);
    for (const c of cols) assert.ok(got[table].includes(c), `${table}: missing or different column ${c}`);
  }
  const gotIdx = indexes(built);
  for (const i of indexes(ref)) assert.ok(gotIdx.includes(i), `missing index ${i}`);
});

test('the migrations alone cannot build a fresh database: bootstrap.sql is required', t => {
  const db = open(t);
  assert.throws(() => apply(db, migrations), /no such table: apps/);
});

test('0026 adds learn_moments to a pre-0026 database exactly as schema.sql defines it', t => {
  const db = open(t); db.exec(read('bootstrap.sql'));
  apply(db, migrations.filter(f => f < '0026'));
  assert.equal(shape(db).learn_moments, undefined);
  apply(db, ['0026-learn-moments.sql']);
  const ref = open(t); ref.exec(read('schema.sql'));
  assert.deepEqual(shape(db).learn_moments, shape(ref).learn_moments);
  assert.ok(indexes(db).includes('learn_moments.idx_learn_moments_org'));
});

test('0026 is a no-op where learn_moments was already created by hand from schema.sql', t => {
  const db = open(t); db.exec(read('bootstrap.sql'));
  apply(db, migrations.filter(f => f < '0026'));
  db.exec(read('schema.sql')); // how the table reached databases before 0026
  db.exec("INSERT INTO learn_moments (org, question, video_id, start) VALUES ('example-test', 'q', 'v', 1)");
  apply(db, ['0026-learn-moments.sql']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learn_moments').get().n, 1);
});
