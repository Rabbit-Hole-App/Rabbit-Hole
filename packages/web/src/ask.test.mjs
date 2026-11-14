// Tutor cleanup P2 (cleanup-v0.4 section 3, ask.jsx): a Next Steps hook click is an ordinary Chat turn. This runs the real sendStep
// source from ask.jsx (sliced out and evaluated with fakes), so a change to it is caught here without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const start = ask.indexOf('const sendStep = async (step, hook) => {'), end = ask.indexOf('if (nextStepRef) nextStepRef.current = sendStep;');
assert.ok(start > 0 && end > start, 'sendStep is found in ask.jsx');
// intercept: the command dispatcher (slashRef.current.intercept); typedOf: the registry's typed name (the written explanation types as /explain).
const sendStepOf = ({ voice = null, busy = false, send, intercept = null }) => new Function('voice', 'busy', 'send', 'slashRef', 'typedOf', `${ask.slice(start, end)} return sendStep;`)(voice, busy, send, { current: intercept ? { intercept } : null }, id => (id === 'explanation' ? 'explain' : id));
const STEP = { v: 1, set_id: 'ns_0c0c0c0c', suggestion_id: 'ns_0c0c0c0c.1', hook: 'Why do some coasts barely see a tide?' };

// Owner 2026-11-13: a Curious suggestion always makes a card: /explain on its words, run directly through the command dispatcher, with no chat turn.
test('a hook click runs /explain on the hook text through the dispatcher and sends no chat turn', async () => {
  const sent = [], run = [];
  const sendStep = sendStepOf({ send: async (...args) => { sent.push(args); }, intercept: line => { run.push(line); return true; } });
  assert.equal(await sendStep(STEP, STEP.hook), true, 'the click was taken');
  assert.deepEqual(run, [`/explain ${STEP.hook}`]);
  assert.deepEqual(sent, [], 'no chat turn');
});

test('a hook click the dispatcher does not take falls back to one Chat turn with the hook text and nothing else', async () => {
  const sent = [];
  const sendStep = sendStepOf({ send: async (...args) => { sent.push(args); }, intercept: () => false });
  assert.equal(await sendStep(STEP, STEP.hook), true, 'the turn was taken');
  assert.deepEqual(sent, [[STEP.hook]], 'exactly one send(), with the hook sentence only: no options, no selected step');
});

test('a hook click while a turn is running is refused and sends nothing; a refused send is reported', async () => {
  const sent = [], run = [];
  assert.equal(await sendStepOf({ busy: true, send: async text => { sent.push(text); }, intercept: line => { run.push(line); return true; } })(STEP, STEP.hook), false);
  assert.deepEqual([sent, run], [[], []]);
  assert.equal(await sendStepOf({ send: async () => false })(STEP, STEP.hook), false, 'send() answering false means the turn was not taken');
});

test('Voice Mode on keeps the spoken path: voice.say with the step, no typed turn', async () => {
  const sent = [], said = [];
  const voice = { on: true, say: (text, options) => { said.push([text, options.nextStep]); return true; } };
  assert.equal(await sendStepOf({ voice, send: async text => { sent.push(text); } })(STEP, STEP.hook), true);
  assert.deepEqual(said, [['', STEP]]);
  assert.deepEqual(sent, []);
});
