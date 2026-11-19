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
  assert.match(ask, /if \(offer\.handled\) \{ setMsgs\(m => m\.slice\(0, -2\)\); return; \}\n\s+Object\.assign\(outcome, \{ send: true, token: null, answerOnly: false, direct: null \}\);/, 'unhandled: an ordinary turn with its tools, never answer-only (which strips the repository and paper tools)');
  assert.match(flow, /window\.addEventListener\(CODEBASE_OPTIONS_EVENT, again\)/);
  assert.match(flow, /event\.detail\.handled = true; planSeq\.current \+= 1; forgetIntake\(canvas\);\n\s+const reset = \{ \.\.\.st\.current, intakeDone: false, use: null, mode: null, learn: null, learnIntro: null, depthAsk: false, plan: null, planLog: \[\], focus: null, goalChosen: false, elsewhere: false, form: null \};/);
  assert.match(flow, /if \(ask\) sourceArrived\(canvas, repositoryArrival\(reset\.doc\)\);/, 'the opening is written again (learn_open), owner 2026-11-18 22:15');
  assert.equal(CODEBASE_OPTIONS_EVENT, 'rh-codebase-options');
});

// Parity with prod (audit 2026-11-15): the two routes this branch added to every plain chat turn never turn a plain question into an error or strip its tools.
test('a router decision for code-explain goes on as a turn with its token; no flow means an ordinary answer, never "Not available here"', async () => {
  const { routeOutcome } = await import('./generation-proposal-chat.js');
  assert.deepEqual(routeOutcome({ route: 'capability:code-explain', capability: 'code-explain', flow: 'direct', token: 'signed' }), { send: true, token: 'signed' });
  assert.deepEqual(routeOutcome({ route: 'capability:code-explain', capability: 'code-explain', flow: 'direct' }), { send: true, token: null });
  assert.deepEqual(routeOutcome({ route: 'capability:course', capability: 'course', flow: 'direct', args: 'x' }), { direct: { command: 'course', args: 'x' } }, 'other direct commands are unchanged');
});

test('the chat strip: the side columns are as wide as their contents (prod), not a 264 px floor that narrows the composer on a 1280 px window', () => {
  const canvas = read('AdaptiveCanvas.jsx');
  assert.match(canvas, /md:grid-cols-\[minmax\(min-content,1fr\)_minmax\(200px,780px\)_minmax\(min-content,1fr\)\]/);
  assert.doesNotMatch(canvas, /minmax\(264px,1fr\)/);
});
