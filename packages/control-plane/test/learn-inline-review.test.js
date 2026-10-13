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

import { inlineGenerateFetch, inlineRouteFetch } from '../src/learn-inline.js';
import * as inlineRoute from '../../web/src/inline-ai-route.js';

const PROMPT_MAX = inlineRoute.PROMPT_MAX ?? 1000;

const context = { target: { ids: ['n23'], objects: [{ id: 'n23', type: 'shape', text: '23' }] }, connections: [], related: [], complete: { n23: true }, omitted: {} };
const sse = text => new Response([
  `event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } })}\n\n`,
  `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\n`,
  `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} })}\n\n`].join(''), { headers: { 'content-type': 'text/event-stream' } });

test('prompt limit: the worker enforces the shared limit on route and generate, with the reason', async () => {
  const authorize = async () => ({ name: 'canvas-0a1b2c3d' });
  const long = 'a'.repeat(PROMPT_MAX + 1);
  const route = await inlineRouteFetch(post('/api/learn/inline/route', { app: 'canvas-0a1b2c3d', request_id: 'req-0123456789', prompt: long }), {}, { authorize, ask: async () => assert.fail('no JEV call') });
  assert.equal(route.status, 400);
  const routed = await route.json();
  assert.equal(routed.code, 'too_long');
  assert.match(routed.error, /1001 characters; inline requests stop at 1000/);
  const generate = await inlineGenerateFetch(post('/api/learn/inline/generate', { app: 'canvas-0a1b2c3d', request_id: 'req-0123456789', mode: 'explain', route: 'note', prompt: long, context }), {}, { authorize, callModel: async () => assert.fail('no model call') });
  assert.equal(generate.status, 400);
  assert.equal((await generate.json()).code, 'too_long');
  const atLimit = await inlineGenerateFetch(post('/api/learn/inline/generate', { app: 'canvas-0a1b2c3d', request_id: 'req-0123456789', mode: 'explain', route: 'note', prompt: 'a'.repeat(PROMPT_MAX), context }), {}, { authorize, callModel: async () => sse('ok') });
  assert.equal(atLimit.status, 200);
});
