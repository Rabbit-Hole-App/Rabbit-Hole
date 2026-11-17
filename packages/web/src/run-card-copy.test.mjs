import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RUN_CARD_COPY, headerState, humanizeRunError, knobLabel, scrubRunText, stepState, whatHappens } from './run-card-copy.js';

// Run card UX rework (owner 2026-11-15, run-card-ux-spec.md): humanised states, readable labels, one copy table, nothing hard-coded to a repository.
test('a failed step says what happened in the learner words, never rc, a machine id, an error code, Modal or sandbox', () => {
  const run = { status: 'error', rc: null, stderrTail: 'Traceback (most recent call last):\n  File "x.py", line 3\nValueError: bad value for the number of samples', stdoutTail: '' };
  const h = humanizeRunError(run, { rehearsalPassed: true });
  assert.equal(h.chip, RUN_CARD_COPY.step.didnt);
  assert.match(h.line, /^ValueError: bad value for the number of samples/);
  assert.match(h.line, /it passed in the rehearsal/);
  assert.doesNotMatch(JSON.stringify(h), /rc null|NotFoundError|Modal|sandbox|ta-01/i);
});

test('a session that is gone is the Ended state with its own sentence, whatever the provider text says', () => {
  const run = { status: 'error', stderrTail: '[run failed: NotFoundError: Modal Sandbox with container ID ta-01M7ABCDEFGH not found. This means this Sandbox has already shut down. (Error code: GJI50IIL)]' };
  const h = humanizeRunError(run);
  assert.deepEqual([h.tone, h.chip, h.line], ['warn', RUN_CARD_COPY.header.ended, RUN_CARD_COPY.lines.sessionEnded]);
  assert.doesNotMatch(scrubRunText(run.stderrTail), /ta-01M7|GJI50IIL|Modal|NotFoundError|Sandbox/i);
});

test('timeout and stop have their own chips; a step has five states and a header has five', () => {
  assert.equal(humanizeRunError({ status: 'timeout', sec: 300 }, { timeoutMin: 5 }).chip, 'Stopped at 5 min');
  assert.equal(humanizeRunError({ status: 'stopped' }).line, RUN_CARD_COPY.lines.stoppedByYou);
  assert.equal(stepState(null).label, RUN_CARD_COPY.step.notRun);
  assert.equal(stepState(null, { failedHere: true }).tone, 'danger');
  assert.deepEqual([stepState({ status: 'running', sec: 42 }).tone, stepState({ status: 'done', sec: 70 }).tone], ['accent', 'success']);
  assert.equal(stepState({ status: 'done' }, { note: { tone: 'warn', chip: 'Not run', line: 'x' } }).label, 'Not run');
  assert.deepEqual([undefined, { status: 'starting' }, { status: 'ready' }, { status: 'expired' }, { status: 'failed' }].map(s => headerState(s).button), ['start', 'start', 'stop', 'startAgain', 'tryAgain']);
  assert.equal(headerState({ status: 'ready' }).chip, RUN_CARD_COPY.header.live);
});

test('knob labels are derived from the flag by a rule, a discovery label wins', () => {
  assert.equal(knobLabel('--num_samples'), 'Num samples');
  assert.equal(knobLabel('--max-new-tokens'), 'Max new tokens');
  assert.equal(knobLabel('--start', 'Start text'), 'Start text');
});

test('what a step does: the plan line, else what the rehearsal produced, else nothing', () => {
  assert.equal(whatHappens({ what: 'Writes the training data' }), 'Writes the training data');
  assert.equal(whatHappens({ expected: { files: [{ path: 'a.bin' }, { path: 'b.bin' }] } }), 'Writes a.bin, b.bin');
  assert.equal(whatHappens({ expected: { metrics: [{ name: 'loss' }] } }), 'Prints loss as it goes');
  assert.equal(whatHappens({}), '');
});

test('the card names no repository, file, flag or command in its source (the copy table and the record carry every string)', () => {
  const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
  for (const file of ['RunCard.jsx', 'RunCustom.jsx', 'RunHistory.jsx', 'RunParts.jsx', 'RunOutputs.jsx', 'run-card-copy.js', 'run-card-view.js', 'run-card-knobs.js', 'run-card-history.js']) {
    assert.doesNotMatch(read(file), /nanoGPT|shakespeare|sample\.py|train\.py|--temperature/, file);
  }
  const tabs = read('RunCard.jsx');
  assert.match(tabs, /COPY\.tabs\[id\]/);
  assert.doesNotMatch(tabs, /Rehearsal output|Session not started|Start session/, 'the old strings are gone');
});

test('the compute lines are plain words with the allowance and the renewal date, and never a machine or provider term', () => {
  const out = RUN_CARD_COPY.lines.computeOut('1,000', 'December 1, 12:00 AM UTC');
  assert.match(out, /^You've used this month's compute allowance \(1,000 units\)\. It renews on December 1, 12:00 AM UTC\. Your outputs and runbook stay; runs resume then\.$/);
  for (const line of [out, RUN_CARD_COPY.lines.computeRanOut, RUN_CARD_COPY.lines.computeUnavailable, RUN_CARD_COPY.header.autoStop]) assert.doesNotMatch(line, /Modal|sandbox|rc |credit/i);
  assert.equal(RUN_CARD_COPY.header.autoStop, 'Stops after 10 minutes without a run, or after 60 minutes.');
});
