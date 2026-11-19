// START-3 cold Worker scenario (b): the scheduled path. One accepted step is held (its step_accepted event is due, nothing ran inline). The cron scan (scheduledRoadmapKick) kicks the board's RoadmapJobs object, and the object's ALARM runs the event:
// a fresh isolate in a simulated Worker (no synchronous loader for the lazy reference library) with no /api/ request before it. The card must be DELIVERED (generated and valid): roadmap-events.js catches a throw and retries silently.
import './no-sync-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledRoadmapKick } from '../src/roadmap/roadmap-wire.js';
import { RoadmapJobs } from '../src/roadmap/roadmap-jobs.js';
import { acceptCard, explanation, started, workflow } from './roadmap-workflow-fixture.js';

test('cron scan kicks the RoadmapJobs object and its alarm runs one due step_accepted event from a cold module state: the card is generated and valid', async t => {
  const h = await workflow(t, { script: [explanation()], hold: true });
  const view = await started(h);
  assert.equal((await acceptCard(h, view, 'accept')).status, 202);
  assert.equal(h.authorCalls.length, 0, 'held: nothing ran inline, the event is due');
  const stored = new Map();
  const state = { storage: { get: async key => stored.get(key), put: async (key, value) => { stored.set(key, value); }, setAlarm: async at => { stored.set('alarm', at); }, deleteAlarm: async () => { stored.delete('alarm'); } } };
  const object = new RoadmapJobs(state, h.env);
  const env = { ...h.env, ROADMAP_JOBS: { idFromName: name => name, get: () => ({ fetch: (url, init) => object.fetch(new Request(url, init)) }) } };
  assert.equal(await scheduledRoadmapKick(env), 1, 'the scan found the due event and kicked its board object');
  assert.ok(stored.get('scope'), 'the object stored the scope it was kicked for');
  await object.alarm();
  assert.equal(h.authorCalls.length, 1, 'the alarm ran the event: the quote and the generation read the reference library');
  const row = h.rows('SELECT generation, validation FROM learn_step_results')[0];
  assert.deepEqual([row.generation, row.validation], ['generated', 'passed']);
  assert.deepEqual(h.handlerErrors ?? [], []);
});
