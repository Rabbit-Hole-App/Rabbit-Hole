// node:sqlite stand-ins for the telemetry tests: a D1 binding (prepare/bind/run/first/all, batch as one transaction) over the
// real migration files, and a synchronous sql() like a Durable Object's storage.sql.exec().toArray().
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export const migration = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

export function d1(sqlite, { fail = () => false } = {}) {
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...bound) => statement(sql, bound),
    run: async () => { if (fail(sql)) throw new Error('D1_ERROR: synthetic outage'); return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
    first: async () => { if (fail(sql)) throw new Error('D1_ERROR: synthetic outage'); return sqlite.prepare(sql).get(...args) ?? null; },
    all: async () => { if (fail(sql)) throw new Error('D1_ERROR: synthetic outage'); return { results: sqlite.prepare(sql).all(...args) }; },
  });
  return {
    prepare: sql => statement(sql),
    batch: async statements => {
      if (statements.some(s => fail(s.sql))) throw new Error('D1_ERROR: synthetic outage');
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(s => ({ meta: { changes: sqlite.prepare(s.sql).run(...s.args).changes } }));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}

// A fresh telemetry database with every migration applied. fail(sql) simulates an outage.
export function telemetryDb(t, options) {
  const sqlite = new DatabaseSync(':memory:');
  // Every telemetry migration, in order, as wrangler would apply them.
  for (const file of readdirSync(new URL('../telemetry-migrations/', import.meta.url)).sort()) sqlite.exec(migration(`telemetry-migrations/${file}`));
  t.after(() => sqlite.close());
  return { sqlite, db: d1(sqlite, options) };
}

export const syncSql = sqlite => (query, ...params) => sqlite.prepare(query).all(...params);
