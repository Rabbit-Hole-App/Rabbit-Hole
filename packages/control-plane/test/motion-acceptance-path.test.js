// The controlled owner-only acceptance path (owner 2026-10-25): while MOTION_GENERATION_PAUSED is "1" the start route still refuses everyone
// EXCEPT a caller whose VERIFIED full account email is in MOTION_ACCEPTANCE_EMAILS. Pure functions here; the Durable Object and the chat
// turn are driven in motion-allowance.test.js and chat-modes.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceEmails, motionAcceptanceAllowed, motionOffered, motionPaused } from '../src/generation-proposal.js';
import { decideChat } from '../src/chat-capability-route.js';

const OWNER = 'owner@example.test';
const base = { MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: 'm'.repeat(48) };
const paused = extra => ({ ...base, MOTION_GENERATION_PAUSED: '1', ...extra });

test('the list: plain full addresses, comma/space/semicolon separated, lower-cased; entries without an @ are dropped; empty or unset = nobody', () => {
  assert.deepEqual(acceptanceEmails({ MOTION_ACCEPTANCE_EMAILS: ' Owner@Example.Test, second@example.test;third@example.test  junk ' }), [OWNER, 'second@example.test', 'third@example.test']);
  assert.deepEqual(acceptanceEmails({ MOTION_ACCEPTANCE_EMAILS: '' }), []);
  assert.deepEqual(acceptanceEmails({}), []);
  assert.deepEqual(acceptanceEmails(undefined), []);
});

test('paused: the listed account is admitted, everyone else is refused; the match is the whole normalised address, never a prefix, substring or domain', () => {
  const env = paused({ MOTION_ACCEPTANCE_EMAILS: OWNER });
  assert.equal(motionPaused(env, OWNER), false);
  assert.equal(motionPaused(env, '  Owner@Example.TEST '), false, 'normalised');
  for (const email of ['alice@example.test', 'xowner@example.test', 'owner01@example.test', 'owner@example.test.evil.test', 'owner@example.testx', 'owner@example', 'example.test', '@example.test', 'owner', '', null, undefined, 42, { toString: () => OWNER }]) {
    assert.equal(motionPaused(env, email), true, String(email));
  }
  assert.equal(motionPaused(env), true, 'no identity (unverified or missing): refused');
  assert.equal(motionPaused(paused({ MOTION_ACCEPTANCE_EMAILS: '' }), OWNER), true, 'an empty list admits nobody');
  assert.equal(motionPaused(paused({}), OWNER), true, 'an unset list admits nobody');
  assert.equal(motionPaused(paused({ MOTION_ACCEPTANCE_EMAILS: 'example.test, *@example.test, owner@' }), OWNER), true, 'a domain, a wildcard or a prefix in the list matches nothing');
  assert.equal(motionAcceptanceAllowed(env, OWNER), true);
  assert.equal(motionAcceptanceAllowed(env, 'alice@example.test'), false);
});

test('not paused: the list changes nothing for anyone; it never turns Motion on where it is not configured', () => {
  const env = { ...base, MOTION_GENERATION_PAUSED: '0', MOTION_ACCEPTANCE_EMAILS: OWNER };
  assert.equal(motionPaused(env, 'alice@example.test'), false);
  assert.equal(motionOffered(env, 'alice@example.test'), true);
  assert.equal(motionOffered(paused({ MOTION_ACCEPTANCE_EMAILS: OWNER }), 'alice@example.test'), false, 'paused: offered to nobody else');
  assert.equal(motionOffered(paused({ MOTION_ACCEPTANCE_EMAILS: OWNER }), OWNER), true, 'paused: offered to the listed account');
  // No orchestrator configured: the list cannot create one.
  assert.equal(motionOffered({ MOTION_GENERATION_PAUSED: '1', MOTION_ACCEPTANCE_EMAILS: OWNER }, OWNER), false);
});

// The chat route: plain words reach Motion only where it is offered to THIS caller.
test('the chat capability route: while paused, Motion is unavailable to everyone but the listed account', async () => {
  const jev = () => { throw new Error('no model call expected for an explicit command'); };
  const fields = { text: '/motion explain softmax', mode: 'ask' };
  const run = (env, email) => decideChat(env, { email, app: 'canvas-1', requestId: 'r-1', fields, capability: 'motion', enabled: ['motion'] }, { ask: jev });
  const env = paused({ MOTION_ACCEPTANCE_EMAILS: OWNER, ROUTER_KEY: 'x'.repeat(40) });
  const other = await run(env, 'alice@example.test');
  const listed = await run(env, OWNER);
  assert.notEqual(JSON.stringify(other), JSON.stringify(listed), 'the two callers are decided differently');
  assert.match(JSON.stringify(other), /temporarily unavailable|not available/i);
  assert.doesNotMatch(JSON.stringify(listed), /temporarily unavailable/i);
});

// R1b (owner 2026-10-26): the owner signs in with Google, and a provider-reported email never becomes the application principal (auth.js, migration 0026), so
// the list carries the principal the production account really has. The matching semantics are unchanged: whole address, lower-cased.
test('the production owner list: the Google account principal and the Gmail address are admitted while paused; another principal, the look-alike and a prefix are not', () => {
  const env = paused({ MOTION_ACCEPTANCE_EMAILS: 'user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid yudhisteer.chin@gmail.com' });
  assert.equal(motionPaused(env, 'user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid'), false);
  assert.equal(motionPaused(env, 'USER@DDA2350771A4066E3080C605BA092E0A.RABBITHOLE.INVALID'), false, 'case is normalised');
  assert.equal(motionPaused(env, 'yudhisteer.chin@gmail.com'), false);
  for (const email of ['user@0000000000000000000000000000000f.rabbithole.invalid', 'user@dda2350771a4066e3080c605ba092e0b.rabbithole.invalid', 'user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid.evil.test', 'xuser@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid', 'yudhisteer.chin01@gmail.com', 'yudhisteer.chin@gmail.com.evil.test', 'user@rabbithole.invalid']) {
    assert.equal(motionPaused(env, email), true, email);
  }
  assert.deepEqual(acceptanceEmails(env), ['user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid', 'yudhisteer.chin@gmail.com']);
});
