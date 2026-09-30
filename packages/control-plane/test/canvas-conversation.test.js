import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasSeed } from '../src/canvas-conversation.js';

test('canvas branches carry only their own initial exchange and preserve full text', () => {
  const body = { canvas_seed: { question: 'Why this box?', answer: 'A'.repeat(10000) } };
  assert.deepEqual(canvasSeed(body), [{ role: 'user', content: 'Why this box?' }, { role: 'assistant', content: 'A'.repeat(10000) }]);
  assert.deepEqual(canvasSeed({ message: 'A regular question' }), []);
});

test('reject changing an existing thread, non-Learn contexts and unbounded seeds', () => {
  const canvas_seed = { question: 'Why?', answer: 'An explanation.' };
  assert.throws(() => canvasSeed({ canvas_seed, thread_id: 'another-thread' }));
  assert.throws(() => canvasSeed({ canvas_seed }, 'agent'));
  for (const seed of [null, {}, { ...canvas_seed, question: ' ' }, { ...canvas_seed, answer: 1 }, { ...canvas_seed, answer: 'x'.repeat(32001) }]) {
    assert.throws(() => canvasSeed({ canvas_seed: seed }));
  }
});

// duplication-9: the one turn store apiAsk and repositoryAsk share.
test('threadTurns stores the seed, returns the last ten messages oldest first, then stores the learner turn', async () => {
  const { threadTurns } = await import('../src/canvas-conversation.js');
  const { DatabaseSync } = await import('node:sqlite');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE messages (id INTEGER PRIMARY KEY, thread_id TEXT, role TEXT, content TEXT)');
  const db = { batch: async statements => Promise.all(statements.map(statement => statement.run())), prepare: sql => ({ bind: (...values) => ({ all: async () => ({ results: sqlite.prepare(sql).all(...values) }), run: async () => sqlite.prepare(sql).run(...values) }) }) };
  for (let n = 1; n <= 10; n++) sqlite.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)').run('t', 'user', `m${n}`);
  const history = await threadTurns(db, 't', [{ role: 'user', content: 'seed q' }, { role: 'assistant', content: 'seed a' }], 'now');
  assert.deepEqual(history.map(m => m.content), ['m3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'seed q', 'seed a']);
  assert.equal(sqlite.prepare('SELECT content FROM messages ORDER BY id DESC LIMIT 1').get().content, 'now');
  sqlite.close();
});
