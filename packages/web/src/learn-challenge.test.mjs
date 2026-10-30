import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVerdict, stripVerdict } from '../../control-plane/src/agents/learn-grade.js';
import { hasMarks, sketchText } from './explain-sketch.js';
import { HISTORY_KEPT, legacyView, pastAttempt } from './explain-back-view.js';

// LearningBlocks.jsx cannot load under node, so these run ChallengeBody's real
// commit and retry from its source (grading-8, grading-9,
// lifecycle-7 in docs/features/learn-cleanup.md). Each render re-reads the
// block, as React does after onChange.
const source = readFileSync(new URL('./LearningBlocks.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const body = source.slice(source.indexOf('function ChallengeBody('), source.indexOf('\nfunction QuizBody('));
const piece = start => {
  const at = body.indexOf(start), line = body.slice(at, body.indexOf('\n', at));
  assert.ok(at >= 0, start);
  return line.endsWith('};') ? line : body.slice(at, body.indexOf('\n  };\n', at) + 5);
};
const moduleSets = (source.match(/^const gradingAttempts = new Set\(\);$/m) || [''])[0];

// ExplainBackPanel.jsx's capture adapter cannot load under node either: its source, run as it is.
const panelSource = readFileSync(new URL('./ExplainBackPanel.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const adapter = panelSource.slice(panelSource.indexOf('export const CAPTURE_FAILED'), panelSource.indexOf('\n}\n', panelSource.indexOf('export async function sketchCapture')) + 3).replace(/^export /gm, '');
const { sketchCapture } = new Function(`${adapter}\nreturn { sketchCapture };`)();

// host stands in for the canvas's SketchHost (packages/web/src/sketch-host.js); null is a card with no sketch.
function card(block, onGrade, host = null) {
  const make = new Function('React', 'parseVerdict', 'stripVerdict', 'hasMarks', 'sketchText', 'sketchHost', 'sketchCapture', 'pastAttempt', 'HISTORY_KEPT', `${moduleSets}
    return function mount(initial, onGrade) {
      const state = { block: initial, draft: '', notice: '' };
      const setNotice = value => { state.notice = value; };
      const latest = { current: initial }, inFlight = { current: false };
      const onChange = next => { state.block = next; latest.current = next; };
      const setDraft = next => { state.draft = typeof next === 'function' ? next(state.draft) : next; };
      const render = () => {
        const block = state.block, draft = state.draft;
        const sketchable = !!sketchHost;
        const sketchMarked = sketchable && hasMarks(block.sketch);
        latest.current = block;
        ${piece('  const commit = async () => {')}
        ${piece('  const retry = () =>')}
        return { commit, retry };
      };
      return { state, render, type: text => { state.draft = text; }, inPage: id => gradingAttempts.has(id) };
    };`);
  return make(null, parseVerdict, stripVerdict, hasMarks, sketchText, host, sketchCapture, pastAttempt, HISTORY_KEPT)(block, onGrade);
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

// Owner 2026-10-30: one Practice card. The old Challenge's own status line is gone; its states are the Practice card's
// (legacyView): a grade running in this page is reviewing, a saved grading state with no request is interrupted.
test('a grade in flight reads as reviewing; a saved grading state with no request reads as interrupted', async () => {
  const wait = held();
  const c = card(challenge, async () => { await wait.promise; });
  c.type('an answer');
  const running = c.render().commit();
  const { inPage } = c;
  assert.equal(legacyView(c.state.block, { strip: stripVerdict, inPage }).attempts[0].status, 'reviewing');
  const reloaded = { ...challenge, answer: 'an answer', attemptId: 'a-saved-attempt', verdict: '', grading: true };
  assert.equal(legacyView(reloaded, { strip: stripVerdict, inPage }).attempts[0].status, 'interrupted');
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

test('text and a sketch are one submission; Revise answer keeps both, files the first attempt in history, and the resubmit is a new attempt', async () => {
  const calls = [], h = host();
  const c = card(sketchCard, async (committed, answer, onDelta, sketch) => { calls.push({ id: committed.attemptId, answer, sketch }); onDelta('VERDICT: partial\nCloser.'); }, h);
  c.type('the id picks a row');
  await c.render().commit();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].answer, 'the id picks a row');
  assert.ok(calls[0].sketch);
  c.render().retry();
  assert.equal(c.state.draft, 'the id picks a row', 'the text comes back to the field');
  // Plan 2026-10-30 section 9: the submitted attempt and its review stay selectable; the Sketch panel is not forced open.
  assert.deepEqual([c.state.block.sketchOpen, c.state.block.sketchSubmitted, c.state.block.answer], [sketchCard.sketchOpen, false, null], 'the sketch stays, editable');
  assert.deepEqual(c.state.block.sketch, sketchCard.sketch, 'nothing of the drawing is erased');
  assert.deepEqual(c.state.block.history, [{ attemptId: calls[0].id, answer: 'the id picks a row', verdict: 'VERDICT: partial\nCloser.', sketchSubmitted: true, reviewFailed: false }]);
  const shown = legacyView(c.state.block, { strip: stripVerdict });
  assert.deepEqual(shown.attempts.map(a => [a.number, a.status, a.answer.text, a.feedback.text]), [[1, 'reviewed', 'the id picks a row', 'Closer.']]);
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

test('an Explain-back sketch that cannot be pictured is not submitted: the learner is told and the work stays', async () => {
  const calls = [];
  const blank = { captured: [], capture(id) { this.captured.push(id); return Promise.resolve(null); } };
  const c = card(sketchCard, async (...args) => { calls.push(args); }, blank);
  c.type('the id picks a row');
  await c.render().commit();
  assert.equal(calls.length, 0, 'no grade request');
  assert.equal(c.state.block.attemptId, undefined, 'no attempt');
  assert.match(c.state.notice, /could not be captured/);
  // The canvas's keyed capture rejects with its own learner-readable reason (sketch-host.js SketchCaptureError).
  const keyed = { captureFor: () => Promise.reject(Object.assign(new Error('The sketch is too detailed to picture.'), { code: 'capture-too-large' })) };
  const k = card(sketchCard, async (...args) => { calls.push(args); }, keyed);
  await k.render().commit();
  assert.deepEqual([calls.length, k.state.notice], [0, 'The sketch is too detailed to picture.']);
  // A keyed capture that works is what the grade receives.
  const good = { captureFor: ({ questionId }) => Promise.resolve({ image: PNG, text: 'x', questionId }) };
  const g = card(sketchCard, async (committed, answer, onDelta, sketch) => { calls.push(sketch); onDelta('VERDICT: good\nYes.'); }, good);
  await g.render().commit();
  assert.deepEqual(calls.at(-1), { image: PNG, text: sketchText(sketchCard.sketch) });
});

test('an Explain-back review that fails is marked failed, not shown as feedback', async () => {
  const c = card({ ...sketchCard, sketch: { strokes: [], shapes: [], items: [] } }, async () => { throw new Error('Tutor down'); }, host());
  c.type('words');
  await c.render().commit();
  assert.deepEqual([c.state.block.reviewFailed, c.state.block.grading], [true, false]);
  const [attempt] = legacyView(c.state.block, { strip: stripVerdict }).attempts;
  assert.deepEqual([attempt.status, attempt.feedback, attempt.error], ['failed', null, 'Could not reach the tutor: Tutor down']);
  // Owner 2026-10-30: one Practice card - an old challenge (no mode) is marked failed the same way.
  const plain = card(challenge, async () => { throw new Error('Tutor down'); });
  plain.type('x');
  await plain.render().commit();
  assert.deepEqual([plain.state.block.reviewFailed, plain.state.block.verdict], [true, 'Could not reach the tutor: Tutor down']);
});
