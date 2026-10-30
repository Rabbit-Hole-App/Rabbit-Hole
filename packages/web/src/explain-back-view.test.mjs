import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The canvas's drawing, move and resize gestures finish on window pointermove/pointerup (AdaptiveCanvas drawGesture
// listen, startDrag). A React stopPropagation on those events inside the Sketch panel also stops them before window, so a
// docked stroke never ended (fast-e2e run 41032431618). The panel may stop pointerdown, click and the menus, never these.
test('the Sketch panel never stops pointerup or pointermove on their way to window', () => {
  const source = readFileSync(new URL('./ExplainBackPanel.jsx', import.meta.url), 'utf8');
  const panel = source.slice(source.indexOf('export function SketchPanel('), source.indexOf('\nexport function RatingBadge('));
  assert.ok(panel.length > 1000, 'found the SketchPanel source');
  assert.doesNotMatch(panel, /onPointer(Up|Move)(Capture)?=\{stop\}/);
  assert.doesNotMatch(panel, /onPointer(Up|Move)(Capture)?=\{[^}]*stopPropagation/);
});
import { ANSWER_PLACEHOLDER, PANEL, STOP_TO_SUBMIT, askTutorText, attemptLabel, connectionsOf, draftMemoryKey, inputPillsOf, legacyView, recallDraft, rememberDraft, reviseSketchPlan, locatorText, optionText, panelLayout, ratingBadge, serviceView, stackTop, submitState, teachingAidsOf } from './explain-back-view.js';

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
  // From the workspace alone (fast-e2e 41036157402: a zoomed card must never force a stack at 736, 800 or 1024 px).
  for (const width of [736, 800, 1024]) assert.equal(panelLayout(width).mode, 'side', `side by side at ${width}`);
  assert.deepEqual(panelLayout(720), { mode: 'side', width: 314, min: 296, max: 314 }, 'a readable panel still fits at the breakpoint');
  // Stacked under the whole card, never above the dock's top margin.
  assert.equal(stackTop(500), 512);
  assert.equal(stackTop(-80), 16);
  assert.equal(stackTop(null), 16);
});

test('input pills: a Group is one pill with its count and members; a problem is in the learner\'s words', () => {
  const pills = inputPillsOf([
    { linkId: 'l1', sourceId: 'g', port: 'bottom', kind: 'group', media: 'group', label: 'Pendulum', scope: null, scopeLabel: '', state: 'ready', count: 2, members: [{ id: 'a', label: 'Notes' }, { id: 'b', label: 'Plot' }] },
    { linkId: 'l2', sourceId: 'n', port: 'top', kind: 'source', media: 'notebook', label: 'Run 1', scope: { cells: ['c1'] }, scopeLabel: 'Cell 1', state: 'ready' },
    { linkId: 'l3', sourceId: 'x', port: 'top', kind: 'missing', media: 'card', label: 'Removed source', state: 'unavailable', problem: 'missing' },
  ], problem => ({ missing: 'That source is no longer on the canvas.' })[problem]);
  assert.deepEqual(pills, [
    { id: 'l1', kind: 'group', name: 'Pendulum', scope: '', count: 2, members: ['Notes', 'Plot'], problem: '' },
    { id: 'l2', kind: 'notebook', name: 'Run 1', scope: 'Cell 1', count: undefined, members: [], problem: '' },
    { id: 'l3', kind: 'missing', name: 'Removed source', scope: '', count: undefined, members: [], problem: 'That source is no longer on the canvas.' },
  ]);
  assert.equal(submitState({ text: 'x', inputs: [{ state: 'unavailable' }] }).ready, false, 'an unavailable input blocks Submit until removed');
});

test('citations carry their kind and locator; a missing Group member is unavailable', () => {
  const content = { v: 1, kind: 'explain_back', text: 'abc', voice: [{ evidenceId: 'ev-v', role: 'voice', media: 'audio' }], resources: [{ evidenceId: 'ev-p', role: 'resource', media: 'group', label: 'Notes', members: [{ sourceId: 'm1' }] }], assistance: [] };
  const cites = [{ evidenceId: 'ev-v', locator: { startMs: 42000, endMs: 45000 } }, { evidenceId: 'ev-p', memberId: 'm1', locator: { page: 3 } }, { evidenceId: 'ev-p', memberId: 'gone', locator: { cell: 2 } }];
  const view = serviceView({ attempts: [{ attemptId: 'a1', submittedContent: content, assessment: { status: 'completed', provenance: { review: review({ attemptId: 'a1', comparison: undefined, feedback: { strengths: { text: 'x', citations: cites }, revisit: { text: 'y', citations: [] }, next: { text: 'z', citations: [] } } }) } } }] });
  assert.deepEqual(view.attempts[0].feedback.citations.map(c => [c.kind, c.label, c.available, c.locator]), [
    ['voice', 'Voice note, at 0:42', true, { startMs: 42000, endMs: 45000 }],
    ['resource', 'Notes, page 3', true, { page: 3 }],
    ['resource', 'Notes, cell 2', false, { cell: 2 }],
  ]);
  assert.equal(locatorText({}), '');
});

test('a revision makes the attempt\'s connections again from their recorded source, port and scope', () => {
  assert.deepEqual(connectionsOf([
    { evidenceId: 'e1', assetId: 'file-1', scope: { pages: [2] }, label: 'Paper', connection: { port: 'top', linkId: 'l1', links: [{ linkId: 'l1', port: 'top', sourceId: 'card-1' }] } },
    { evidenceId: 'e2', assetId: 'group-1', label: 'Group' },
  ]), [{ sourceId: 'card-1', port: 'top', scope: { pages: [2] }, label: 'Paper' }, { sourceId: 'group-1', port: 'bottom', scope: null, label: 'Group' }]);
});

test('a Sketch recording blocks Submit while it runs or saves and is an answer once saved', () => {
  assert.deepEqual(submitState({ text: 'x', recording: { ready: false, blocked: STOP_TO_SUBMIT } }), { ready: false, code: 'recording_active', reason: STOP_TO_SUBMIT });
  assert.deepEqual(submitState({ text: '', recording: { ready: false, blocked: 'Saving Sketch recording' } }), { ready: false, code: 'upload_in_progress', reason: 'Saving Sketch recording' });
  assert.equal(submitState({ text: '', recording: { ready: true, blocked: null } }).ready, true, 'a recording alone is an answer');
  assert.equal(submitState({ text: 'x', recording: { ready: false, blocked: 'Sketch recording not saved' } }).ready, false);
});

test('an unsent draft is remembered per app, board and card, so a fork never shows another canvas\'s draft', () => {
  const a = draftMemoryKey('app', 'board-a', 'card-1'), fork = draftMemoryKey('app', 'board-b', 'card-1');
  assert.notEqual(a, fork);
  assert.equal(recallDraft(a), null);
  rememberDraft(a, { text: 'half an answer' });
  rememberDraft(a, { revising: 'at_1', seq: 2 });
  assert.deepEqual(recallDraft(a), { text: 'half an answer', revising: 'at_1', seq: 2 });
  assert.equal(recallDraft(fork), null, 'the fork starts empty');
  rememberDraft(a, { text: '', revising: null, seq: 3 });
  assert.deepEqual(recallDraft(a), { text: '', revising: null, seq: 3 }, 'a submit clears it');
});

test('revising keeps the newest attempt\'s marks only; an older attempt\'s draft starts empty and says why', () => {
  const sketched = n => ({ number: n, answer: { sketched: true } }), plain = n => ({ number: n, answer: { sketched: false } });
  const newest = sketched(2);
  assert.deepEqual(reviseSketchPlan({ attempt: newest, newest, marked: true }), { clear: false, notice: null });
  const older = reviseSketchPlan({ attempt: sketched(1), newest, marked: true });
  assert.equal(older.clear, true);
  assert.match(older.notice, /attempt 1 cannot be edited again here[\s\S]*Ctrl\+Z/);
  assert.deepEqual(reviseSketchPlan({ attempt: plain(1), newest, marked: true }), { clear: true, notice: null }, 'an attempt without a sketch starts without one');
  assert.deepEqual(reviseSketchPlan({ attempt: plain(2), newest: plain(2), marked: true }), { clear: true, notice: null });
  assert.deepEqual(reviseSketchPlan({ attempt: sketched(1), newest, marked: false }), { clear: false, notice: null }, 'nothing to clear');
});

test('Ask Tutor fills the composer with the exercise, the attempt and its feedback', () => {
  const text = askTutorText('Why does the bob swing?', attempt({ number: 2, answer: { text: 'gravity', voice: [], inputs: [] }, feedback: { sections: { well: 'Good.', revisit: 'Tension.', next: '' } } }));
  assert.equal(text, 'Explain-back question: Why does the bob swing?\nMy attempt 2: gravity\nWhat you explained well: Good.\nWhat to revisit: Tension.');
});

test('teaching aids: each named card opens while it exists and is unavailable once removed; an older review lists none', () => {
  const review = { teachingAids: [{ cardId: 'e1', title: 'Centripetal force', kind: 'explanation', reason: 'Shows the inward force.' }, { cardId: 'n1', title: '', kind: 'notebook', reason: 'Try it.' }] };
  assert.deepEqual(teachingAidsOf(review, id => id === 'e1').map(a => [a.id, a.title, a.available, a.reason]), [['e1', 'Centripetal force', true, 'Shows the inward force.'], ['n1', 'Notebook', false, 'Try it.']]);
  assert.deepEqual(teachingAidsOf({}), []);
  assert.deepEqual(teachingAidsOf(null), []);
});
