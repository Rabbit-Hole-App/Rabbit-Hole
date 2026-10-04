// packages/control-plane/test/learn-grade-fixture.js
// learn_grades on node:sqlite, built from the same schema file the dev D1 gets,
// behind the slice of the D1 API the store uses.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function learnDb(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  const LEARN_DB = {
    prepare: sql => {
      let args = [];
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) { args = values; return this; },
        first: async () => statement.get(...args) || null,
        all: async () => ({ results: statement.all(...args) }),
        run: async () => ({ meta: statement.run(...args) }),
        runNow: () => ({ meta: statement.run(...args) }),
      };
    },
    // D1 batches are one transaction: a failing statement rolls the earlier ones back. Synchronous, so two
    // requests' batches never interleave on this one connection (D1 serializes them).
    batch: async statements => {
      sqlite.exec('BEGIN');
      try { const out = statements.map(s => s.runNow()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, LEARN_DB };
}

export const baseRow = (overrides = {}) => ({
  org: 'team', email: 'learner@test', app: 'demo-app', board: null, block_id: 'b1', mode: 'challenge',
  attempt_id: 'attempt-0001', source: 'canvas', bench_run: null, bench_set: null, grader_protocol_version: 'jev-grade-p1',
  prompt: 'Why exp?', expects: JSON.stringify(['positive']), answer: 'because', ...overrides,
});
