import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANSWER_PLACEHOLDER, PANEL, STOP_TO_SUBMIT, askTutorText, attemptLabel, legacyView, optionText, panelLayout, ratingBadge, serviceView, submitState } from './explain-back-view.js';

// Plan 2026-10-30-explain-back.md sections 3, 7H, 8 and 9: what the Explain-back card shows, from either data path.

test('the answer field keeps the approved placeholder', () => {
  assert.equal(ANSWER_PLACEHOLDER, 'Write an answer, or record a voice note below. You can also add a sketch.');
});

const attempt = (over = {}) => ({ id: 'a1', number: 1, status: 'reviewed', answer: { text: 'x', sketched: false, voice: [], inputs: [] }, feedback: null, rating: null, ...over });

test('the badge is the blue N/10 only for a stored whole rating; Assessing and Not rated are neutral; a draft has none', () => {
  assert.deepEqual(ratingBadge(attempt({ rating: { value: 7 } })), { tone: 'rated', text: '7/10', label: 'Tutor rating: 7 out of 10 for attempt 1' });
  assert.equal(ratingBadge(attempt({ number: 2, rating: { value: 0 } })).text, '0/10', 'a fully assessed wrong answer can be 0');
  assert.equal(ratingBadge(attempt({ rating: { value: 10 } })).text, '10/10');
  for (const value of [null, 7.5, 11, -1, '7']) assert.equal(ratingBadge(attempt({ rating: { value, reason: 'Sketch unreadable' } })).text, 'Not rated', `rating ${value}`);
  assert.match(ratingBadge(attempt({ rating: { value: null, reason: 'Sketch unreadable' } })).label, /not rated\. Sketch unreadable/);
  assert.deepEqual(ratingBadge(attempt({ status: 'reviewing' })), { tone: 'neutral', text: 'Assessing', label: 'Tutor rating for attempt 1: assessing' });
  assert.equal(ratingBadge(attempt({ status: 'failed', rating: { value: 8 } })).text, 'Not rated', 'a failed review never shows a number');
  assert.equal(ratingBadge({ draft: true, id: 'draft', rating: { value: 9 } }), null, 'a draft never inherits a badge');
});

test('native options carry the score as text; labels name the attempt and status', () => {
  assert.equal(optionText(attempt({ number: 2, rating: { value: 8 } })), 'Attempt 2 · Reviewed · 8/10');
  assert.equal(optionText(attempt({ rating: { value: null } })), 'Attempt 1 · Reviewed · Not rated');
  assert.equal(optionText(attempt({ status: 'reviewing' })), 'Attempt 1 · Reviewing');
  assert.equal(attemptLabel({ draft: true, parentNumber: 2 }), 'Draft · revising attempt 2');
  assert.equal(attemptLabel({ draft: true, parentNumber: null }), 'Draft');
});

test('submit readiness: text, sketch, a saved voice note or a ready input alone; recording and saving wait with their reason', () => {
  assert.deepEqual(submitState({ text: '' }), { ready: false, code: 'empty_answer', reason: null });
  assert.equal(submitState({ text: '  ' }).ready, false);
  assert.equal(submitState({ text: 'words' }).ready, true);
  assert.equal(submitState({ text: '', sketched: true }).ready, true);
  assert.equal(submitState({ text: '', voice: { ready: true, blocked: null } }).ready, true, 'voice alone is an answer');
  assert.deepEqual(submitState({ text: 'words', voice: { ready: false, blocked: STOP_TO_SUBMIT } }), { ready: false, code: 'recording_active', reason: STOP_TO_SUBMIT });
  assert.deepEqual(submitState({ text: '', voice: { ready: false, blocked: 'Saving voice note' } }), { ready: false, code: 'upload_in_progress', reason: 'Saving voice note' });
  assert.equal(submitState({ text: '', inputs: [{ state: 'ready' }] }).ready, true, 'a connected input alone is an answer');
  assert.equal(submitState({ text: 'x', inputs: [{ state: 'unavailable' }] }).code, 'evidence_unavailable');
  assert.equal(submitState({ text: 'x'.repeat(4001) }).code, 'text_too_long');
});

test('the legacy card: history first, then the attempt on the block; streaming, interrupted and failed reviews', () => {
  const strip = value => String(value || '').replace(/^VERDICT: \w+\n?/, '');
  const block = { answer: 'second', attemptId: 'b', verdict: '', grading: true, history: [{ attemptId: 'a', answer: 'first', verdict: 'VERDICT: partial\nCloser.', sketchSubmitted: true, reviewFailed: false }] };
  const running = legacyView(block, { strip, inPage: id => id === 'b' });
  assert.deepEqual(running.attempts.map(a => [a.number, a.status, a.answer.text, a.answer.sketched]), [[1, 'reviewed', 'first', true], [2, 'reviewing', 'second', false]]);
  assert.equal(running.attempts[0].feedback.text, 'Closer.');
  assert.equal(legacyView(block, { strip }).attempts[1].status, 'interrupted', 'a saved grading state with no request');
  const failed = legacyView({ answer: 'x', attemptId: 'c', verdict: 'Could not reach the tutor: down', reviewFailed: true }, { strip }).attempts[0];
  assert.deepEqual([failed.status, failed.feedback, failed.error], ['failed', null, 'Could not reach the tutor: down']);
  assert.deepEqual(legacyView({ answer: null }, { strip }).attempts, [], 'a first draft has no attempts');
});

const review = (over = {}) => ({
  v: 1, attemptId: 'a2', assessmentId: 's2', status: 'completed', rubricVersion: 'r1', judgments: [], coverage: [],
  feedback: { strengths: { text: 'You name the force.', citations: [{ evidenceId: 'text', locator: { start: 0, end: 9 } }] }, revisit: { text: 'Velocity points along the path.', citations: [{ evidenceId: 'ev-sketch', locator: {} }, { evidenceId: 'gone', locator: {} }] }, next: { text: 'Redraw the arrow.', citations: [] } },
  comparison: { parentAttemptId: 'a1', parentAssessmentId: 's1', comparable: true, items: [{ criterionId: 'c1', change: 'resolved', baselineCitations: [], currentCitations: [], note: 'You now explain why the force points inward.' }, { criterionId: 'c2', change: 'persisting', baselineCitations: [], currentCitations: [], note: 'The velocity arrow still points inward.' }] },
  rating: { status: 'rated', score: 8, outOf: 10, criteria: [], rubricVersion: 'r1', calculationVersion: 'v1' }, provenance: {},
  ...over,
});

test('the durable store, read in the EB-01 contract names: states, feedback, comparison, citations, rating', () => {
  const raw = {
    attempts: [
      { attemptId: 'a1', submittedContent: { v: 1, kind: 'explain_back', text: '', voice: [{ evidenceId: 'ev-voice', role: 'voice', media: 'audio' }], resources: [], assistance: [] }, assessment: { status: 'completed', provenance: { review: review({ attemptId: 'a1', comparison: undefined, rating: { status: 'unrated', reason: 'voice_unreadable', outOf: 10, criteria: [], rubricVersion: 'r1', calculationVersion: 'v1' } }) } } },
      { attemptId: 'a2', submittedContent: { v: 1, kind: 'explain_back', text: 'The force points inward.', voice: [], sketch: { evidenceId: 'ev-sketch', role: 'sketch', media: 'image' }, resources: [{ evidenceId: 'ev-g', role: 'resource', media: 'group', label: 'Pendulum notes', members: [{}, {}] }], assistance: [], baseline: { parentAttemptId: 'a1', parentAssessmentId: 's1' } }, assessment: { status: 'completed', provenance: { review: review() } } },
      { attemptId: 'a3', submittedContent: { v: 1, kind: 'explain_back', text: 'again', voice: [], resources: [], assistance: [] }, assessment: { status: 'pending' } },
      { attemptId: 'a4', submittedContent: { v: 1, kind: 'explain_back', text: 'lost', voice: [], resources: [], assistance: [] }, assessment: { status: 'unknown' } },
    ],
    draft: { draftId: 'd1', cardId: 'q', revision: 1, answer: { v: 1, kind: 'explain_back', text: 'draft words', voice: [], resources: [], assistance: [], baseline: { parentAttemptId: 'a2', parentAssessmentId: 's2' } } },
  };
  const view = serviceView(raw);
  assert.deepEqual(view.attempts.map(a => [a.number, a.status]), [[1, 'reviewed'], [2, 'reviewed'], [3, 'reviewing'], [4, 'failed']]);
  const [first, second] = view.attempts;
  assert.equal(ratingBadge(first).text, 'Not rated');
  assert.match(ratingBadge(first).label, /voice_unreadable/);
  assert.equal(ratingBadge(second).label, 'Tutor rating: 8 out of 10 for attempt 2');
  assert.deepEqual(second.feedback.sections, { well: 'You name the force.', revisit: 'Velocity points along the path.', next: 'Redraw the arrow.' });
  assert.equal(second.feedback.comparison, 'Resolved: You now explain why the force points inward.\n\nStill to work on: The velocity arrow still points inward.');
  assert.deepEqual(second.feedback.citations.map(c => [c.label, c.quote, c.available, c.attemptId]), [['The force', 'The force', true, 'a2'], ['Sketch', '', true, 'a2'], ['Your answer', '', false, 'a2']]);
  assert.deepEqual([second.answer.sketched, second.parentId, second.answer.inputs], [true, 'a1', [{ id: 'ev-g', kind: 'group', name: 'Pendulum notes', count: 2, scope: '' }]]);
  assert.equal(first.answer.text, '', 'a voice-only answer keeps an empty text');
  assert.match(view.attempts[3].error, /did not finish/);
  assert.deepEqual(view.draft, { id: 'd1', parentId: 'a2', text: 'draft words' });
  assert.deepEqual(serviceView(undefined), { attempts: [], draft: null, loading: true });
  const incomparable = serviceView({ attempts: [{ attemptId: 'a1', submittedContent: { text: 'x' }, assessment: { status: 'completed', provenance: { review: review({ comparison: { parentAttemptId: 'a0', parentAssessmentId: null, comparable: false, reason: 'rubric_changed', items: [] } }) } } }] });
  assert.equal(incomparable.attempts[0].feedback.comparison, 'A comparison with the earlier attempt is not available (rubric changed).');
});

test('the Sketch panel keeps the question beside it at 736, 800 and 1024 px and stacks below 720 px', () => {
  assert.deepEqual(panelLayout(736), { mode: 'side', width: 330, min: 296, max: 330 });
  assert.equal(panelLayout(800).width, 394);
  assert.equal(panelLayout(1024).width, PANEL.initial);
  assert.equal(panelLayout(1600).width, PANEL.initial);
  assert.equal(panelLayout(1600, 900).width, PANEL.max, 'never wider than 700');
  assert.equal(panelLayout(1600, 100).width, PANEL.min, 'never narrower than its floor');
  assert.equal(panelLayout(1024, 900).width, 1024 - 16 - 20 - 326 - 44, 'never over the question');
  assert.deepEqual(panelLayout(390), { mode: 'stack', width: 358, min: 0, max: 0 });
  assert.equal(panelLayout(719).mode, 'stack');
});

test('Ask Tutor fills the composer with the exercise, the attempt and its feedback', () => {
  const text = askTutorText('Why does the bob swing?', attempt({ number: 2, answer: { text: 'gravity', voice: [], inputs: [] }, feedback: { sections: { well: 'Good.', revisit: 'Tension.', next: '' } } }));
  assert.equal(text, 'Explain-back question: Why does the bob swing?\nMy attempt 2: gravity\nWhat you explained well: Good.\nWhat to revisit: Tension.');
});
