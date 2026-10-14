// learn-migrations/0019 (agent-coordination/tasks/chat-workspace-CONTRACT.md B7): the chat answer side tables, additive beside
// the canvas chat's threads and messages, and exactly what repository-schema.sql applies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = readFileSync(new URL('../learn-migrations/0019-chat-message-meta.sql', import.meta.url), 'utf8');

test('0019 is additive, re-runnable and exactly what repository-schema.sql applies', t => {
  const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  for (const table of ['chat_message_meta', 'chat_message_feedback', 'chat_thread_state']) assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
});

test('0019 columns follow the contract, and a rating is up or down, once per message and user', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration);
  const columns = table => sqlite.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  assert.deepEqual(columns('chat_message_meta'), ['message_id', 'thread_id', 'role', 'alternative_of', 'meta_json', 'created_at']);
  assert.deepEqual(columns('chat_message_feedback'), ['message_id', 'user', 'rating', 'reason', 'updated_at']);
  assert.deepEqual(columns('chat_thread_state'), ['thread_id', 'mode', 'draft_json', 'summary_json', 'context_json', 'last_activity_at', 'updated_at']);
  assert.throws(() => sqlite.prepare("INSERT INTO chat_message_feedback (message_id, user, rating, updated_at) VALUES (1, 'a', 'meh', 'now')").run(), /CHECK/);
  sqlite.prepare("INSERT INTO chat_message_feedback (message_id, user, rating, updated_at) VALUES (1, 'a', 'up', 'now')").run();
  assert.throws(() => sqlite.prepare("INSERT INTO chat_message_feedback (message_id, user, rating, updated_at) VALUES (1, 'a', 'down', 'now')").run(), /UNIQUE|PRIMARY/);
});
