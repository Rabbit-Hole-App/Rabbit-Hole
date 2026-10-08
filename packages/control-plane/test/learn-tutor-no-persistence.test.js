// Professor Next Steps integration (owner, 2026-10-07): ordinary Tutor use must keep working with decision-telemetry
// persistence unavailable (v1 persists nothing: docs/features/professor-next-steps.md §3.3; its storage awaits an
// owner-approved migration) and with the held remote migrations unapplied. The integration adds no migration. Resolving any
// canvas on main already reads the 0004/0007-0010 tables (forks, publications, handles, metadata, Trash), which is main's own
// dependency and part of the 0004→0010 deploy order; so this drops the held tables the Tutor-side features use (the 0005
// usage counts the hooks and the repository handoff admit against, the 0005 share pins and repository visibility, the 0006
// learning journeys), registers no trace sink, records every statement, and plans an ordinary turn on a plain canvas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns, readOnlyControlPlane } from './live-storage-spy.js';
import { tutorRoute } from '../src/learn-tutor-routes.js';

const FEATURE_TABLES = ['shared_ask_events', 'board_repository_pins', 'repository_visibility', 'learning_journeys', 'learning_path_versions'];

test('an ordinary Tutor turn plans without the telemetry store and without the held feature tables, and writes nothing', async t => {
  const { sqlite, LEARN_DB } = learnDb(t);
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Board')");
  for (const table of FEATURE_TABLES) sqlite.exec(`DROP TABLE IF EXISTS ${table}`);
  const statements = [];
  const db = { ...LEARN_DB, prepare: sql => { statements.push(sql.replace(/\s+/g, ' ').trim()); return LEARN_DB.prepare(sql); } };
  const turn = { strategy: 'none', move: 'answer', reason: 'r', actions: [{ type: 'respond_text', text: 'Hi.' }] };
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => Response.json({ model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'tool_use', name: 'tutor_response', input: turn }], stop_reason: 'tool_use' });
  const env = { LEARN_DB: db, DB: liveDb(), RUNS: liveRuns(), CONTROL_PLANE: readOnlyControlPlane({ apps: {} }), ANTHROPIC_API_KEY: 'k', TUTOR_PLANNER_FAST_MODEL: 'off', TUTOR_PLANNER_CACHE: 'off' };
  const response = await tutorRoute('/api/learn/tutor/plan', new Request('https://dev.test/api/learn/tutor/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'canvas-0a1b2c3d', context: { turn: { raw_user_message: 'What is a tensor?' } } }) }), env);
  assert.equal(response.status, 200, await response.clone().text());
  const { telemetry, ...body } = await response.json();
  assert.deepEqual(body, turn, 'the plan comes back as the Tutor made it');
  assert.ok(telemetry, 'telemetry goes back to the browser; the server stores none');
  assert.ok(statements.length > 0, 'the canvas was resolved');
  assert.ok(statements.every(sql => !FEATURE_TABLES.some(table => new RegExp(`\\b${table}\\b`).test(sql))), `a held feature table was read: ${statements.join(' | ')}`);
  assert.ok(statements.every(sql => /^SELECT\b/i.test(sql)), `the turn wrote: ${statements.filter(sql => !/^SELECT\b/i.test(sql)).join(' | ')}`);
  assert.ok(statements.every(sql => !/trace|telemetry|tutor_decision/i.test(sql)), 'no telemetry store');
});
