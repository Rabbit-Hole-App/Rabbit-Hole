// Regression checks for the review of cf9216b2..5b3552a5 (fake model and identity; no provider). Each failed on
// 5b3552a5 unless it says otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { inlineTelemetryFetch } from '../src/learn-inline.js';

const post = (path, body) => new Request(`https://dev.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const row = (request_id, extra = {}) => ({ request_id, route: 'bypassed', capability: 'note', outcome: 'accepted', metrics: { stages: { complete: 812.4 } }, ...extra });
const telemetry = (LEARN_DB, app, rows, options) => inlineTelemetryFetch(post('/api/learn/inline/telemetry', { app, rows }), { LEARN_DB }, options);

test('telemetry user_id is users.id on every board kind, never an email', async t => {
  const { sqlite, LEARN_DB } = learnDb(t);
  const userOf = id => sqlite.prepare('SELECT user_id FROM inline_ai_telemetry WHERE request_id = ?').get(id).user_id;
  // A repo- board: repositoryAccess carries the email and no user_id.
  await telemetry(LEARN_DB, 'repo-owner-project', [row('req-repo-000001')], { authorize: async () => ({ name: 'repo-owner-project', owner_email: 'maker@test' }), identify: async () => 'u-maker-1' });
  assert.equal(userOf('req-repo-000001'), 'u-maker-1');
  // A live app: its access is the app's own record, also without user_id.
  await telemetry(LEARN_DB, 'notes-app', [row('req-live-000001')], { authorize: async () => ({ name: 'notes-app' }), identify: async () => 'u-maker-1' });
  assert.equal(userOf('req-live-000001'), 'u-maker-1');
  // A canvas board: canvasAccess already names the user; nobody is asked again.
  await telemetry(LEARN_DB, 'canvas-0a1b2c3d', [row('req-canvas-00001')], { authorize: async () => ({ name: 'canvas-0a1b2c3d', user_id: 'u-canvas' }), identify: async () => assert.fail('canvas access already names the user') });
  assert.equal(userOf('req-canvas-00001'), 'u-canvas');
  // No users.id known: null, never the email the access carries.
  await telemetry(LEARN_DB, 'repo-owner-project', [row('req-anon-000001')], { authorize: async () => ({ name: 'repo-owner-project', owner_email: 'maker@test' }), identify: async () => null });
  assert.equal(userOf('req-anon-000001'), null);
});

test('telemetry units: stage values are milliseconds as numbers; routing is a number or the word bypassed (passes on 5b3552a5 too)', async t => {
  const { sqlite, LEARN_DB } = learnDb(t);
  await telemetry(LEARN_DB, 'canvas-0a1b2c3d', [
    row('req-units-00001', { route: 'jev', metrics: { stages: { routing: 310.4, complete: 2023.7, firstPreview: '12 s' }, counts: { chunks: 41 } } }),
    row('req-units-00002', { route: 'direct', metrics: { stages: { routing: 'bypassed', complete: 95 } } }),
  ], { authorize: async () => ({ name: 'canvas-0a1b2c3d', user_id: 'u' }) });
  const metrics = id => JSON.parse(sqlite.prepare('SELECT metrics_json FROM inline_ai_telemetry WHERE request_id = ?').get(id).metrics_json);
  assert.deepEqual(metrics('req-units-00001').stages, { routing: 310.4, complete: 2023.7 }, 'a non-number stage is dropped, never stored as text');
  assert.equal(metrics('req-units-00001').counts.chunks, 41);
  assert.deepEqual(metrics('req-units-00002').stages, { routing: 'bypassed', complete: 95 });
});
