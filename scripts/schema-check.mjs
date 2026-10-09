// The complete schema a database must have, built from the repository, and its difference from a live database.
// Used by the production release preflight (scripts/prod-release.mjs) instead of "is the first table there".
//   main D1 (DB):        bootstrap.sql, then migrations/ in filename order (what wrangler d1 migrations apply does)
//   learn D1 (LEARN_DB): repository-schema.sql, then learn-migrations/ 0004 onward (repository-schema.sql already
//                        holds learn 0001-0003; rabbit-hole-production.md)
// Every object (table, index, trigger, view) is compared by name and by its normalized SQL: D1 drops SQL comments,
// and IF NOT EXISTS / quoting / whitespace are not schema. Learn migrations are DDL only (checked by the tests), so a
// matching schema is the identity of the applied learn migrations; wrangler does not track them.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CP = fileURLToPath(new URL('../packages/control-plane/', import.meta.url));
const sqlFiles = dir => readdirSync(join(CP, dir)).filter(f => f.endsWith('.sql')).sort().map(f => `${dir}/${f}`);

export const SOURCES = {
  main: () => ['bootstrap.sql', ...sqlFiles('migrations')],
  learn: () => ['repository-schema.sql', ...sqlFiles('learn-migrations').filter(f => !/\/000[123]-/.test(f))],
};

export const normalizeSql = sql => sql == null ? null : sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ')
  .replace(/ ?([(),]) ?/g, '$1').replace(/IF NOT EXISTS /gi, '').replace(/["`]/g, '').trim();

// sqlite_master rows -> { "table:name": normalized sql }. SQLite's own and Cloudflare's internal objects are not schema.
export const schemaOf = rows => Object.fromEntries(rows
  .filter(r => !/^(sqlite_|_cf_)/.test(r.name) && r.name !== 'd1_migrations')
  .map(r => [`${r.type}:${r.name}`, normalizeSql(r.sql)]));

export const MASTER_SQL = "SELECT type, name, sql FROM sqlite_master ORDER BY type, name";

export function expectedSchema(kind, files = SOURCES[kind]()) {
  const db = new DatabaseSync(':memory:');
  try {
    for (const f of files) db.exec(readFileSync(join(CP, f), 'utf8'));
    return schemaOf(db.prepare(MASTER_SQL).all());
  } finally { db.close(); }
}

// -> [] when identical, else one line per missing, unexpected or different object.
export function schemaDiff(expected, live) {
  return [
    ...Object.keys(expected).filter(k => !(k in live)).map(k => `missing ${k}`),
    ...Object.keys(live).filter(k => !(k in expected)).map(k => `unexpected ${k}`),
    ...Object.keys(expected).filter(k => k in live && expected[k] !== live[k]).map(k => `different ${k}`),
  ];
}

// The main D1's migration identity: wrangler's d1_migrations rows must name exactly the files in migrations/.
export function mainMigrationDiff(files, applied) {
  return [
    ...files.filter(f => !applied.includes(f)).map(f => `not applied ${f}`),
    ...applied.filter(f => !files.includes(f)).map(f => `applied but not in the repository ${f}`),
  ];
}
