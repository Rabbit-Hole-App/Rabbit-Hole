import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAT_CAPABILITIES, CHAT_ROUTES } from './inline-ai-route.js';
import { CODEBASE_OPTIONS_EVENT } from './codebase-use-route.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Owner 2026-11-15: the Tutor's "what can I do with this codebase?" list is re-offered when the learner asks for it in chat, decided by the router (no phrase matching), not a fixed block.
test('codebase-options is a routed standalone capability, so the router decides when the learner is asking for the list', () => {
  assert.equal(CHAT_CAPABILITIES['codebase-options'].flow, 'direct');
  assert.equal(CHAT_CAPABILITIES['codebase-options'].standalone, true);
  assert.match(CHAT_CAPABILITIES['codebase-options'].intent, /what they can do with a code repository/);
  assert.ok(CHAT_ROUTES['codebase-options'], 'offered to the router with the other capabilities');
});

test('a decided codebase-options turn asks the Tutor flow to offer the list again, and is an ordinary answer where no flow is mounted', () => {
  const ask = read('ask.jsx'), flow = read('TutorRehearsal.jsx');
  assert.match(ask, /outcome\.direct\?\.command === 'codebase-options'/);
  assert.match(ask, /new CustomEvent\(CODEBASE_OPTIONS_EVENT, \{ detail: offer \}\)/);
  assert.match(ask, /if \(offer\.handled\) \{ setMsgs\(m => m\.slice\(0, -2\)\); return; \}\n\s+Object\.assign\(outcome, \{ send: true, token: null, answerOnly: true, direct: null \}\);/, 'unhandled: sent as an answer-only turn');
  assert.match(flow, /window\.addEventListener\(CODEBASE_OPTIONS_EVENT, again\)/);
  assert.match(flow, /event\.detail\.handled = true; planSeq\.current \+= 1; forgetIntake\(canvas\); patch\(\{ intakeDone: false, use: null, mode: null, learn: null, learnIntro: null, depthAsk: false, plan: null, planLog: \[\], focus: null, goalChosen: false, elsewhere: false, form: null \}\)/);
  assert.equal(CODEBASE_OPTIONS_EVENT, 'rh-codebase-options');
});
