import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITIES, can, roleFor, sharedPanelTabs } from './canvas-permissions.js';

const shared = role => ({ role, shared: true, comments: { read: true, post: true } });

test('roleFor: signed out is a guest whatever else is claimed; owner beats member', () => {
  assert.equal(roleFor({ owner: true, member: true }), 'guest');
  assert.equal(roleFor({ signedIn: true, owner: true, member: true }), 'owner');
  assert.equal(roleFor({ signedIn: true, member: true }), 'commenter');
  assert.equal(roleFor({ signedIn: true, commenting: true }), 'commenter');
  assert.equal(roleFor({ signedIn: true }), 'viewer');
});

test('local actions are open to every role on a shared canvas, with no sign-in', () => {
  for (const role of ['guest', 'viewer', 'commenter', 'editor', 'owner'])
    for (const capability of ['canvas.local-edit', 'content.copy', 'card.open', 'media.playback', 'toc.navigate', 'chat.ask', 'map.view'])
      assert.deepEqual(can(capability, shared(role)), { allowed: true, reason: null }, `${role} ${capability}`);
});

test('only owners and editors write the source; visitors are told to fork', () => {
  assert.equal(can('source.write', shared('owner')).allowed, true);
  assert.equal(can('source.write', shared('editor')).allowed, true);
  for (const role of ['guest', 'viewer', 'commenter']) assert.deepEqual(can('source.write', shared(role)), { allowed: false, reason: 'Fork to keep your changes' });
});

test('paid generation, capture, execution and uploads: guests sign in, visitors fork, writers run', () => {
  for (const capability of ['generate.paid', 'generate.explain-card', 'generate.motion', 'generate.3d', 'generate.cad', 'webpage.capture', 'code.execute', 'file.upload']) {
    assert.equal(can(capability, shared('guest')).signIn, true, capability);
    assert.equal(can(capability, shared('guest')).allowed, false, capability);
    const viewer = can(capability, shared('viewer'));
    assert.equal(viewer.allowed, false, capability);
    assert.match(viewer.reason, /^Fork to .+ in your own copy$/);
    assert.equal(can(capability, shared('owner')).allowed, true, capability);
  }
});

test('Explain in Chat is chat.ask (a guest may), the /explain card is generation (a guest may not)', () => {
  assert.equal(can('chat.ask', shared('guest')).allowed, true);
  assert.equal(can('generate.explain-card', shared('guest')).allowed, false);
});

test('the guest Chat allowance: unknown or remaining is allowed, zero asks to sign in; signed in is never capped here', () => {
  assert.equal(can('chat.ask', { role: 'guest', guestChat: { remaining: 3 } }).allowed, true);
  assert.deepEqual(can('chat.ask', { role: 'guest', guestChat: { remaining: 0 } }), { allowed: false, reason: 'Sign in to continue', signIn: true });
  assert.equal(can('chat.ask', { role: 'viewer', guestChat: { remaining: 0 } }).allowed, true);
});

test('owner administration is hidden for visitors and on the shared surface, even for the owner', () => {
  for (const capability of ['owner.admin', 'owner.delete', 'owner.permissions']) {
    assert.equal(can(capability, { role: 'owner', shared: false }).allowed, true);
    for (const role of ['guest', 'viewer', 'commenter', 'editor', 'owner']) assert.equal(can(capability, shared(role)).hidden, true, `${role} ${capability}`);
  }
});

test('Progress, goals and the TOC Tutor never show on a shared canvas', () => {
  for (const capability of ['panel.progress', 'panel.goals', 'toc.tutor']) {
    assert.equal(can(capability, { role: 'owner' }).allowed, true);
    for (const role of ['guest', 'viewer', 'owner']) assert.equal(can(capability, shared(role)).hidden, true, `${role} ${capability}`);
  }
});

test('Context and Files on a shared canvas only when the server says they are shareable', () => {
  assert.equal(can('panel.context', shared('guest')).hidden, true);
  assert.equal(can('panel.context', { ...shared('guest'), shareable: { context: true } }).allowed, true);
  assert.equal(can('panel.files', { ...shared('viewer'), shareable: { context: true } }).hidden, true);
});

test('comments: none on the canvas hides them; guests draft and sign in to post; closed comments say so', () => {
  assert.equal(can('comment.read', { role: 'viewer', shared: true }).hidden, true);
  assert.equal(can('comment.draft', shared('guest')).allowed, true);
  assert.equal(can('comment.post', shared('guest')).signIn, true);
  assert.deepEqual(can('comment.post', { role: 'viewer', shared: true, comments: { read: true, post: false } }), { allowed: false, reason: 'Comments are closed' });
});

test('fork and child canvases need an account; an unknown capability or role is refused, not allowed', () => {
  assert.equal(can('canvas.fork', shared('guest')).signIn, true);
  assert.equal(can('canvas.fork', shared('viewer')).allowed, true);
  assert.equal(can('canvas.child', shared('guest')).signIn, true);
  assert.equal(can('nope', shared('owner')).allowed, false);
  assert.equal(can('source.write', { role: 'root' }).allowed, false);
  assert.ok(CAPABILITIES.length > 30);
});

test('the shared right panel: Chat where the page has one, Find, TOC, Comments only where the canvas has them; never Progress', () => {
  assert.deepEqual(sharedPanelTabs(shared('guest'), { chat: true }), ['chat', 'find', 'toc', 'comments']);
  assert.deepEqual(sharedPanelTabs({ role: 'commenter', shared: true }), ['find', 'toc']);
  assert.ok(!sharedPanelTabs(shared('owner'), { chat: true }).includes('progress'));
});
