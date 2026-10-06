import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVerdict, stripVerdict } from '../../control-plane/src/agents/learn-grade.js';
import { hasMarks, sketchText } from './explain-sketch.js';

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

// host stands in for the canvas's SketchHost (docs/features/explain-back-sketch.md); null is a card with no sketch.
function card(block, onGrade, host = null) {
  const make = new Function('React', 'parseVerdict', 'stripVerdict', 'hasMarks', 'sketchText', 'sketchHost', `${moduleSets}
    return function mount(initial, onGrade) {
      const state = { block: initial, draft: '' };
      const latest = { current: initial }, inFlight = { current: false };
      const onChange = next => { state.block = next; latest.current = next; };
      const setDraft = next => { state.draft = typeof next === 'function' ? next(state.draft) : next; };
      const render = () => {
        const block = state.block, draft = state.draft;
        const sketchable = !!sketchHost && block.mode === 'explain_back';
        const sketchMarked = sketchable && hasMarks(block.sketch);
        latest.current = block;
        const verdictText = stripVerdict(block.verdict);
        ${piece('  const commit = async () => {')}
        ${piece('  const retry = () =>')}
        ${statusLine}
        return { commit, retry, waiting: typeof waiting === 'undefined' ? null : waiting };
      };
      return { state, render, type: text => { state.draft = text; } };
    };`);
  return make(null, parseVerdict, stripVerdict, hasMarks, sketchText, host)(block, onGrade);
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

// ---- Explain Back sketch: one submission is one attempt, whatever it holds ----
const sketchCard = { id: 'e1', type: 'challenge', mode: 'explain_back', prompt: 'What happens to token id 2?', expects: ['a row is picked'], answer: null, sketchOpen: true,
  sketch: { strokes: [], shapes: [{ id: 's1', kind: 'rect', x1: 10, y1: 10, x2: 90, y2: 50, text: 'embedding row' }], items: [] } };
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const host = () => ({ captured: [], capture(id) { this.captured.push(id); return Promise.resolve(PNG); } });

test('a sketch alone is submitted: one grade call with the picture and its words, one attempt id, no text needed', async () => {
  const calls = [], h = host();
  const c = card(sketchCard, async (committed, answer, onDelta, sketch) => { calls.push({ committed, answer, sketch }); onDelta('VERDICT: partial\nA start.'); }, h);
  await c.render().commit();
  assert.equal(calls.length, 1);
  assert.deepEqual(h.captured, ['e1'], 'the picture is taken once, of this card');
  assert.equal(calls[0].answer, '');
  assert.deepEqual(calls[0].sketch, { image: PNG, text: sketchText(sketchCard.sketch) });
  assert.equal(calls[0].committed.attemptId, c.state.block.attemptId);
  assert.deepEqual([c.state.block.answer, c.state.block.sketchSubmitted, c.state.block.grading], ['', true, false]);
});

test('text and a sketch are one submission; Explain again keeps both and the resubmit is a new attempt', async () => {
  const calls = [], h = host();
  const c = card(sketchCard, async (committed, answer, onDelta, sketch) => { calls.push({ id: committed.attemptId, answer, sketch }); onDelta('VERDICT: partial\nCloser.'); }, h);
  c.type('the id picks a row');
  await c.render().commit();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].answer, 'the id picks a row');
  assert.ok(calls[0].sketch);
  c.render().retry();
  assert.equal(c.state.draft, 'the id picks a row', 'the text comes back to the field');
  assert.deepEqual([c.state.block.sketchOpen, c.state.block.sketchSubmitted, c.state.block.answer], [true, false, null], 'the sketch opens again, editable');
  assert.deepEqual(c.state.block.sketch, sketchCard.sketch, 'nothing of the drawing is erased');
  await c.render().commit();
  assert.equal(calls.length, 2);
  assert.notEqual(calls[1].id, calls[0].id);
});

test('draw, hide, submit: the hidden sketch is still in the one combined attempt (hiding is presentation only)', async () => {
  const calls = [], h = host();
  const hidden = { ...sketchCard, sketchOpen: false };
  const c = card(hidden, async (committed, answer, onDelta, sketch) => { calls.push({ id: committed.attemptId, answer, sketch }); onDelta('VERDICT: partial\nCloser.'); }, h);
  c.type('the id picks a row');
  await c.render().commit();
  assert.equal(calls.length, 1, 'one grade call');
  assert.equal(calls[0].answer, 'the id picks a row');
  assert.deepEqual(calls[0].sketch, { image: PNG, text: sketchText(sketchCard.sketch) }, 'the hidden drawing rides in the same attempt');
  assert.deepEqual(h.captured, ['e1']);
  assert.deepEqual([c.state.block.sketchSubmitted, c.state.block.attemptId], [true, calls[0].id]);
  // A hidden sketch alone is an answer too.
  const alone = card(hidden, async (committed, answer, onDelta, sketch) => { calls.push({ answer, sketch }); onDelta('VERDICT: good\nYes.'); }, host());
  await alone.render().commit();
  assert.deepEqual([calls[1].answer, !!calls[1].sketch, alone.state.block.sketchSubmitted], ['', true, true]);
});

test('a cleared (empty) sketch or a card with no sketch host submits text only, as before', async () => {
  const sent = [];
  const grade = async (committed, answer, onDelta, sketch) => { sent.push(sketch); onDelta('VERDICT: good\nYes.'); };
  const empty = { strokes: [], shapes: [], items: [] };
  for (const [block, h] of [[{ ...sketchCard, sketch: empty }, host()], [{ ...sketchCard, sketchOpen: false, sketch: empty }, host()], [sketchCard, null]]) {
    const c = card(block, grade, h);
    c.type('words');
    await c.render().commit();
    assert.equal(c.state.block.sketchSubmitted, false);
  }
  assert.deepEqual(sent, [null, null, null]);
  const nothing = card({ ...sketchCard, sketch: empty }, grade, host());
  await nothing.render().commit();
  assert.equal(nothing.state.block.attemptId, undefined, 'no words and no marks: nothing is submitted');
});
