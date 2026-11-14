// /whiteboard (id whiteboard-video): the web build holds no switch; the SERVER's answer (GET /api/learn/whiteboard/jobs, its
// WHITEBOARD_ENABLED) turns the command on (whiteboard-capability.js). A fake fetch stands in for the route; nothing is reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WHITEBOARD_VIDEO, commandsFor, resolveCommand, whiteboardVideoLive } from './agent/slash.js';
import { loadWhiteboardCapability, resetWhiteboardCapability } from './whiteboard-capability.js';

const names = list => list.map(c => c.name);
const answer = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('the build constant stays off; available: true lists /whiteboard in Chat and Ctrl+K, and the reset hides it again', async () => {
  resetWhiteboardCapability();
  assert.equal(WHITEBOARD_VIDEO, false);
  for (const place of ['learn', 'ctrlk']) assert.ok(!names(commandsFor(place)).includes('whiteboard-video'), place);
  const asked = [];
  assert.equal(await loadWhiteboardCapability(async (url, init) => { asked.push([url, init]); return new Response(JSON.stringify({ available: true }), { status: 200 }); }, { 'X-Workspace': 'w' }), true);
  assert.deepEqual(asked, [['/api/learn/whiteboard/jobs', { headers: { 'X-Workspace': 'w' } }]]);
  assert.equal(whiteboardVideoLive(), true);
  for (const place of ['learn', 'ctrlk']) assert.ok(names(commandsFor(place)).includes('whiteboard-video'), place);
  assert.equal(resolveCommand('/whiteboard tides', 'learn').command.name, 'whiteboard-video');
  resetWhiteboardCapability();
  assert.equal(whiteboardVideoLive(), false);
});

test('anything but an explicit available: true leaves it off, and a failed read is asked again', async () => {
  for (const reply of [answer(200, { available: false }), answer(200, { available: 'true' }), answer(200, {}), answer(404, { error: 'Not found' }),
    async () => new Response('<!doctype html>', { status: 200 }), async () => { throw new Error('offline'); }]) {
    resetWhiteboardCapability();
    assert.equal(await loadWhiteboardCapability(reply), false);
    assert.ok(!names(commandsFor('learn')).includes('whiteboard-video'));
  }
  resetWhiteboardCapability();
  let reads = 0;
  const failing = async () => { reads++; throw new Error('offline'); };
  await loadWhiteboardCapability(failing); await loadWhiteboardCapability(failing);
  assert.equal(reads, 2);
  resetWhiteboardCapability();
});
