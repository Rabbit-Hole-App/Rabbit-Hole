import test from 'node:test';
import assert from 'node:assert/strict';
import { existingGeneration } from './generation-state.js';

// The job identity a paid card is reused by (generation-state.js existingGeneration), as the server keys the job.
test('existingGeneration: a /motion press or proposal is its own job; other paid cards match by operation once started', () => {
  const motion = (operation, extra = {}) => ({ id: crypto.randomUUID(), type: 'video', mode: 'generate', status: 'ready', operation: { op: 'motion_request', request: '/motion 15s explain photosynthesis', location: { concept: null }, ...operation }, ...extra });
  // Owner message 37: the same prompt pressed again is a new video, so a request alone never matches another card.
  assert.equal(existingGeneration([motion({ request_id: 'press-aaaaaaaa' })], motion({})), null);
  assert.equal(existingGeneration([motion({ request_id: 'press-aaaaaaaa' })], motion({ request_id: 'press-bbbbbbbb' })), null);
  // A resend of one press, and one approved proposal (one video per proposal, learn-video.js), are the same job.
  const press = motion({ request_id: 'press-aaaaaaaa' });
  assert.equal(existingGeneration([press], motion({ request_id: 'press-aaaaaaaa' })), press);
  const made = motion({ request_id: 'press-aaaaaaaa', proposal: { proposal_id: 'gp-1', version: 1 } });
  assert.equal(existingGeneration([made], motion({ proposal: { proposal_id: 'gp-1', version: 2 } })), made);
  // A scene card by its operation; not a card of another type, and not the card itself.
  const scene = { id: 's', type: 'scene', status: 'failed', operation: { op: 'scene', id: 'frustum' } };
  assert.equal(existingGeneration([scene], { type: 'scene', operation: { op: 'scene', id: 'frustum' } }), scene);
  assert.equal(existingGeneration([scene], { type: 'video', operation: { op: 'scene', id: 'frustum' } }), null);
  assert.equal(existingGeneration([scene], scene), null);
  // A card inserted confirmed is started even before its first poll.
  const confirmed = { id: 'c', type: 'video', status: 'idle', confirmedStart: true, operation: { op: 'generate_video', id: 'prism' } };
  assert.equal(existingGeneration([confirmed], { type: 'video', operation: { op: 'generate_video', id: 'prism' } }), confirmed);
  assert.equal(existingGeneration(undefined, confirmed), null);
});
