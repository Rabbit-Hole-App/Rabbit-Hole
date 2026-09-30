import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVerdict, stripVerdict } from '../../control-plane/src/agents/learn-grade.js';

// LearningBlocks.jsx cannot load under node, so these run ChallengeBody's real
// commit, retry and status line from its source (grading-8, grading-9,
// lifecycle-7 in docs/features/learn-cleanup.md). Each render re-reads the
// block, as React does after onChange.
const source = readFileSync(new URL('./LearningBlocks.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const body = source.slice(source.indexOf('function ChallengeBody('), source.indexOf('\nfunction QuizBody('));
const piece = start => {
  const at = body.indexOf(start), line = body.slice(at, body.indexOf('\n', at));
  assert.ok(at >= 0, start);
  return line.endsWith('};') ? line : body.slice(at, body.indexOf('\n  };\n', at) + 5);
};
const statusLine = body.match(/\n  const waiting = [^\n]*\n/)?.[0] || '';
const moduleSets = (source.match(/^const gradingAttempts = new Set\(\);$/m) || [''])[0];

function card(block, onGrade) {
  const make = new Function('React', 'parseVerdict', 'stripVerdict', `${moduleSets}
    return function mount(initial, onGrade) {
      const state = { block: initial, draft: '' };
      const latest = { current: initial }, inFlight = { current: false };
      const onChange = next => { state.block = next; latest.current = next; };
      const setDraft = next => { state.draft = typeof next === 'function' ? next(state.draft) : next; };
      const render = () => {
        const block = state.block, draft = state.draft;
        latest.current = block;
        const verdictText = stripVerdict(block.verdict);
        ${piece('  const commit = async () => {')}
        ${piece('  const retry = () =>')}
        ${statusLine}
        return { commit, retry, waiting: typeof waiting === 'undefined' ? null : waiting };
      };
      return { state, render, type: text => { state.draft = text; } };
    };`);
  return make(null, parseVerdict, stripVerdict)(block, onGrade);
}
const challenge = { id: 'c1', type: 'challenge', prompt: 'Why exp?', expects: ['positive'], answer: null };
const held = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };

test('Answer again during a grade: the old attempt\'s verdict never lands in the new attempt', async () => {
  const first = held(), deltas = [];
  const c = card(challenge, async (committed, answer, onDelta) => {
    if (answer === 'first') { deltas.push(onDelta); await first.promise; onDelta('VERDICT: good\nOld.'); return; }
    onDelta('VERDICT: partial\nNew.');
  });
  c.type('first');
  const running = c.render().commit();
  c.render().retry();
  c.type('second');
  await c.render().commit();
  first.release();
  await running;
  assert.equal(c.state.block.answer, 'second');
  assert.equal(c.state.block.verdict, 'VERDICT: partial\nNew.');
  assert.equal(parseVerdict(c.state.block.verdict), 'partial');
  assert.equal(c.state.block.grading, false);
});

test('an error after a streamed verdict keeps the verdict; an error with none shows the error', async () => {
  const late = card(challenge, async (committed, answer, onDelta) => { onDelta('VERDICT: good\nYes.'); throw new Error('stream dropped'); });
  late.type('an answer');
  await late.render().commit();
  assert.deepEqual([late.state.block.verdict, late.state.block.grading], ['VERDICT: good\nYes.', false]);
  const failed = card(challenge, async () => { throw new Error('Tutor down'); });
  failed.type('an answer');
  await failed.render().commit();
  assert.equal(failed.state.block.verdict, 'Could not reach the tutor: Tutor down');
});

test('a grade in flight reads as reading; a saved grading state with no request reads as interrupted', async () => {
  const wait = held();
  const c = card(challenge, async () => { await wait.promise; });
  c.type('an answer');
  const running = c.render().commit();
  assert.equal(c.render().waiting, 'Reading your answer…');
  const reloaded = card({ ...challenge, answer: 'an answer', attemptId: 'a-saved-attempt', verdict: '', grading: true });
  assert.equal(reloaded.render().waiting, 'Grading was interrupted. Answer again to retry.');
  wait.release();
  await running;
});

test('an undo during a grade releases the card: the next answer is committed and graded', async () => {
  const first = held();
  const c = card(challenge, async (committed, answer, onDelta) => {
    if (answer === 'first') { await first.promise; return; }
    onDelta('VERDICT: good\nYes.');
  });
  c.type('first');
  const running = c.render().commit();
  // Ctrl+Z restores the pre-commit block without going through onChange.
  c.state.block = challenge;
  c.render();
  first.release();
  await running;
  c.type('second');
  await c.render().commit();
  assert.deepEqual([c.state.block.answer, c.state.block.verdict, c.state.block.grading], ['second', 'VERDICT: good\nYes.', false]);
});
