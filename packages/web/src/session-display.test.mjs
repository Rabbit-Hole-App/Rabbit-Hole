import test from 'node:test';
import assert from 'node:assert/strict';
import { isInternalPrincipal, personLabel, shownIdentity } from './session-display.js';

// Auth's display contract (docs/features/rabbit-hole-auth-backend.md): the UI shows GET /auth/session's
// display, and never an internal principal such as user@u-1.rabbithole.invalid.
test('the shown identity is the /auth/session display, and an internal principal is never shown', () => {
  const principal = 'user@u-1a2b.rabbithole.invalid';
  assert.equal(isInternalPrincipal(principal), true);
  assert.equal(isInternalPrincipal('u-1a2b-rabbithole-invalid'), true); // its workspace slug
  assert.equal(isInternalPrincipal('ada@corp.com'), false);
  assert.deepEqual(shownIdentity(principal, { signedIn: true, provider: 'github', display: { name: 'Octo Cat', email: null, label: 'Octo Cat' } }), { label: 'Octo Cat', email: null });
  assert.deepEqual(shownIdentity(principal, null), { label: 'Signed in', email: null }); // /auth/session unreachable
  assert.deepEqual(shownIdentity('ada@corp.com', null), { label: 'ada@corp.com', email: 'ada@corp.com' });
  // The name and picture the person chose in Profile come first; nothing else changes shape.
  assert.deepEqual(shownIdentity(principal, null, { name: 'Ada', avatar: 'data:image/png;base64,AA==' }), { label: 'Ada', email: null, avatar: 'data:image/png;base64,AA==' });
  assert.deepEqual(shownIdentity('ada@corp.com', null, { name: null, avatar: null }), { label: 'ada@corp.com', email: 'ada@corp.com' });
  assert.equal(personLabel(principal), 'Rabbit Hole user');
  assert.equal(personLabel('ada@corp.com'), 'ada@corp.com');
});
