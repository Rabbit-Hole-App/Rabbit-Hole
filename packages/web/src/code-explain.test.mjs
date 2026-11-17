// The code-explain card's pure rules (code-explain.js, code-explain-link.js, code-explain-text.js; code-explain-card-spec.md sections 2, 3 steps 5-8 and 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE_EXPLAIN_DEPTHS } from '../../control-plane/src/code-explain-contract.js';
import { DEPTHS, CONTEXT_LINES, GAP_COLLAPSE, GAP_KEEP, codeRefsOf, codeRows, hullOf, openCode, openDetail, resolveTarget, sentenceOfRange, sentencesOf, spansOf, splitSentences, targetsOf } from './code-explain.js';
import { askedFrom, highlightRange, onReveal, revealSentence, takeAskedFrom } from './code-explain-link.js';
import { codeExplainText } from './code-explain-text.js';
import { cardText } from './canvas-semantics.js';
import { repoCodeCard, sameCodeSource } from './code-card.js';

// The spec's nanoGPT example (2a) as the board saves it, with the prose written out (the control plane's contract test has the same card).
const golden = () => ({
  type: 'codeExplain', title: 'How attention hides later tokens', question: 'how does attention hide later tokens?',
  repo: 'karpathy/nanoGPT', commit: '3adf61e154c3fe3fca428ad6bc3818b27a3b8291',
  files: [
    { cardId: 'self', path: 'model.py', ranges: [{ id: 'r1', start: 52, end: 60 }, { id: 'r2', start: 67, end: 70 }] },
    { cardId: 'card-9f2', path: 'configurator.py', ranges: [{ id: 'r3', start: 30, end: 34 }] },
  ],
  mentioned: [{ id: 'm1', path: 'bench.py', start: 88, end: 88 }],
  depth: 'standard',
  depths: {
    brief: { prose: 'Attention sets the scores of later tokens to minus infinity. The softmax then gives them zero weight.', anchors: [{ sentence: 0, target: 'r2' }] },
    standard: {
      prose: 'The model builds a lower-triangular matrix of ones. Positions above the diagonal are zero. The mask is applied with masked_fill before the softmax. The softmax turns minus infinity into zero weight. The config can override the block size.',
      anchors: [{ sentence: 1, target: 'r1' }, { sentence: 2, target: 'r2' }, { sentence: 4, target: 'r3' }],
    },
    detailed: {
      prose: 'Take T equal to 4. The mask is tril of ones. Row zero keeps only its own score. The rest become minus infinity. After the softmax row zero is one and zeros. The same holds for every row. A benchmark exercises this path.',
      anchors: [{ sentence: 1, target: 'r1' }, { sentence: 6, target: 'm1' }],
      trace: { input: 'T = 4', steps: ['mask = tril(ones(4,4))', 'att[0] = [s, -inf, -inf, -inf]', 'softmax -> [1, 0, 0, 0]'] },
    },
  },
  figure: null,
  suggestions: ['Why is the mask added before the softmax?', 'What does -inf do to a probability?', 'What changes with flash attention?'],
  evidence: { model: 'claude-sonnet-5-5', sources: ['model.py:52-60', 'model.py:67-70', 'configurator.py:30-34', 'bench.py:88'], createdAt: '2026-11-15T19:20:00Z' },
});

test('the depths are the contract\'s, in order', () => {
  assert.deepEqual(DEPTHS.map(([id]) => id), CODE_EXPLAIN_DEPTHS);
});

test('sentences split after . ! ? and a closing mark followed by white space, never inside a file name', () => {
  assert.deepEqual(splitSentences('It reads model.py first. Then "mask" is built (see tril)! Is it zero? Yes.'), ['It reads model.py first.', 'Then "mask" is built (see tril)!', 'Is it zero?', 'Yes.']);
  assert.deepEqual(splitSentences('One idea (the mask).  \n  Two `x.y()`. forward() starts a sentence in lower case. Three'), ['One idea (the mask).', 'Two `x.y()`.', 'forward() starts a sentence in lower case.', 'Three']);
  // ponytail: an abbreviation such as "e.g. " ends a sentence here; the prompt tells the model one claim per short sentence, and identifiers start sentences in code prose too.
  assert.equal(splitSentences('Use e.g. tril.').length, 2);
  assert.deepEqual(splitSentences('  '), []);
  assert.deepEqual(splitSentences(undefined), []);
  assert.equal(splitSentences(golden().depths.standard.prose).length, 5);
});

test('a depth\'s anchors land on their sentence; several anchors on one sentence all stay', () => {
  const card = golden(), sentences = sentencesOf(card, 'standard');
  assert.deepEqual(sentences.map(s => s.targets), [[], ['r1'], ['r2'], [], ['r3']]);
  assert.equal(sentences[1].text, 'Positions above the diagonal are zero.');
  card.depths.standard.anchors.push({ sentence: 1, target: 'r2' });
  assert.deepEqual(sentencesOf(card, 'standard')[1].targets, ['r1', 'r2']);
  assert.deepEqual(sentencesOf(card, 'nope'), []);
  // Brief is two sentences; the detailed prose's seventh sentence is the mention.
  assert.equal(sentencesOf(card, 'brief').length, 2);
  assert.deepEqual(sentencesOf(card, 'detailed')[6].targets, ['m1']);
});

test('a click on a range finds the sentence at the current depth, or none when that depth does not anchor it', () => {
  const card = golden();
  assert.equal(sentenceOfRange(card, 'standard', 'r2'), 2);
  assert.equal(sentenceOfRange(card, 'brief', 'r2'), 0);
  assert.equal(sentenceOfRange(card, 'brief', 'r1'), -1);
  assert.equal(sentenceOfRange(card, 'detailed', 'r3'), -1);
});

test('an anchor\'s target is on this card, on a satellite that is still here, or a file:line link; never dropped', () => {
  const card = golden(), present = id => id === 'card-9f2';
  assert.equal(resolveTarget(card, 'r1', present).place, 'self');
  assert.equal(resolveTarget(card, 'r3', present).place, 'card');
  assert.equal(resolveTarget(card, 'r3', present).cardId, 'card-9f2');
  // The satellite deleted: its anchor becomes a link to the same file and lines, and nothing else changes.
  const deleted = resolveTarget(card, 'r3', () => false);
  assert.deepEqual([deleted.place, deleted.path, deleted.start, deleted.end], ['link', 'configurator.py', 30, 34]);
  assert.equal(resolveTarget(card, 'r1', () => false).place, 'self');
  // A mention never had a card.
  assert.equal(resolveTarget(card, 'm1', () => true).place, 'link');
  assert.equal(resolveTarget(card, 'zzz'), null);
  assert.equal(targetsOf(card).size, 4);
});

test('overlapping and touching ranges merge into one span that keeps every id', () => {
  assert.deepEqual(spansOf([{ id: 'b', start: 10, end: 20 }, { id: 'a', start: 1, end: 5 }, { id: 'c', start: 6, end: 8 }, { id: 'd', start: 18, end: 25 }]),
    [{ start: 1, end: 8, ids: ['a', 'c'] }, { start: 10, end: 25, ids: ['b', 'd'] }]);
  assert.deepEqual(spansOf([{ id: 'x', start: 5, end: 4 }, { id: 'y', start: 'a', end: 3 }, null]), []);
  assert.deepEqual(hullOf([{ id: 'r1', start: 52, end: 60 }, { id: 'r2', start: 67, end: 70 }]), { start: 52, end: 70 });
  assert.equal(hullOf([]), null);
});

const file = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ n: from + i, text: `line ${from + i}` }));

test('the code pane highlights the ranges, dims the lines between and cuts what is far from them', () => {
  const rows = codeRows(file(1, 100), [{ id: 'r1', start: 52, end: 60 }, { id: 'r2', start: 67, end: 70 }]);
  const lines = rows.filter(r => r.kind === 'line');
  assert.equal(lines[0].n, 52 - CONTEXT_LINES);
  assert.equal(lines.at(-1).n, 70 + CONTEXT_LINES);
  assert.deepEqual(lines.filter(r => r.ids.length).map(r => r.n), [...Array(9)].map((_, i) => 52 + i).concat([67, 68, 69, 70]));
  // 61-66 are between the ranges: shown (a gap of 6 is under GAP_COLLAPSE) and dimmed; the ranges themselves are not.
  assert.deepEqual(lines.filter(r => r.n >= 61 && r.n <= 66).map(r => r.dim), Array(6).fill(true));
  assert.equal(lines.find(r => r.n === 55).dim, false);
  assert.deepEqual(lines.find(r => r.n === 55).ids, ['r1']);
  assert.equal(rows.some(r => r.kind === 'gap'), false);
});

test('a long gap between two ranges keeps its first and last lines and says how many it hides', () => {
  const rows = codeRows(file(1, 500), [{ id: 'a', start: 5, end: 10 }, { id: 'b', start: 400, end: 402 }]);
  const between = rows.filter(r => r.kind === 'line' && r.n > 10 && r.n < 400).map(r => r.n);
  assert.deepEqual(between, [...Array(GAP_KEEP)].map((_, i) => 11 + i).concat([...Array(GAP_KEEP)].map((_, i) => 400 - GAP_KEEP + i)));
  const marker = rows.find(r => r.kind === 'gap');
  assert.equal(marker.hidden, 389 - 2 * GAP_KEEP); // lines 11..399 are 389
  assert.ok(marker.hidden > GAP_COLLAPSE);
  const at = rows.indexOf(marker);
  assert.equal(rows[at - 1].n, 10 + GAP_KEEP);
  assert.equal(rows[at + 1].n, 400 - GAP_KEEP);
  assert.equal(rows.filter(r => r.kind === 'gap').length, 1);
});

test('Show whole file turns the dimming and the cut off and keeps the highlight', () => {
  const rows = codeRows(file(1, 100), [{ id: 'r1', start: 52, end: 60 }], { whole: true });
  assert.equal(rows.length, 100);
  assert.equal(rows.some(r => r.dim), false);
  assert.equal(rows.filter(r => r.ids.length).length, 9);
});

test('no ranges: every line, nothing dimmed (a plain code card is unchanged)', () => {
  assert.deepEqual(codeRows(file(1, 3), null).map(r => [r.n, r.dim, r.ids.length]), [[1, false, 0], [2, false, 0], [3, false, 0]]);
  assert.deepEqual(codeRows([], [{ id: 'r', start: 1, end: 2 }]), []);
});

test('a satellite shows the lines its ranges span, numbered by the file', () => {
  const rows = codeRows(file(30, 34), [{ id: 'r3', start: 30, end: 34 }]);
  assert.deepEqual(rows.map(r => r.n), [30, 31, 32, 33, 34]);
  assert.equal(rows.every(r => !r.dim && r.ids[0] === 'r3'), true);
});

test('Open in Files dispatches small:open-code by repository, and GitHub at the commit when nothing answers', () => {
  const card = golden(), detail = openDetail(card, { path: 'model.py', start: 52, end: 60 }, 'repo-1234abcd-nanogpt');
  assert.deepEqual(detail, { app: 'repo-1234abcd-nanogpt', repo: 'karpathy/nanoGPT', commit: card.commit, sameRepo: true, path: 'model.py', start: 52, end: 60 });
  assert.equal('app' in openDetail(card, { path: 'model.py', start: 52, end: 60 }), false);
  const seen = [], opened = [];
  // Answered (the repository canvas prevents the default): Files, no GitHub.
  assert.equal(openCode(detail, { dispatch: event => { seen.push(event); event.preventDefault(); return !event.defaultPrevented; }, open: url => opened.push(url) }), 'files');
  assert.equal(seen[0].type, 'small:open-code');
  assert.equal(seen[0].cancelable, true);
  assert.deepEqual(seen[0].detail, detail);
  assert.deepEqual(opened, []);
  // Not answered: GitHub at that commit and those lines.
  assert.equal(openCode(detail, { dispatch: () => true, open: url => opened.push(url) }), 'github');
  assert.deepEqual(opened, [`https://github.com/karpathy/nanoGPT/blob/${card.commit}/model.py#L52-L60`]);
});

test('a suggestion asks about the same code: one code ref per file over the lines its ranges cover, mentions left out', () => {
  const refs = codeRefsOf(golden());
  assert.deepEqual(refs.map(ref => [ref.sourceId, ref.kind, ref.range.start, ref.range.end]), [
    ['code:karpathy/nanoGPT@3adf61e154c3fe3fca428ad6bc3818b27a3b8291:model.py', 'code', 52, 70],
    ['code:karpathy/nanoGPT@3adf61e154c3fe3fca428ad6bc3818b27a3b8291:configurator.py', 'code', 30, 34],
  ]);
});

test('a hovered sentence lights a range, and a pressed range reaches the primary; both are keyed by the primary card', () => {
  const lit = [], heard = [];
  // useLitRange reads the same module state; the store itself is what is checked here.
  const stop = onReveal((owner, range) => heard.push([owner, range]));
  revealSentence('chat-7', 'r2');
  stop();
  revealSentence('chat-7', 'r1');
  assert.deepEqual(heard, [['chat-7', 'r2']]);
  assert.doesNotThrow(() => { highlightRange('chat-7', 'r1'); highlightRange('chat-7', 'r1'); highlightRange('chat-7', null); lit.push(1); });
});

test('a suggestion\'s answer lands beside the card it was asked from, once, and only for that question', () => {
  askedFrom('chat-7', 'Why is the mask added before the softmax?');
  assert.equal(takeAskedFrom('something else'), null);
  assert.equal(takeAskedFrom(' Why is the mask added before the softmax? ', id => id === 'chat-7'), 'chat-7');
  assert.equal(takeAskedFrom('Why is the mask added before the softmax?'), null);
  askedFrom('chat-8', 'q?');
  assert.equal(takeAskedFrom('q?', () => false), null, 'the card is gone: nothing to stand beside');
  askedFrom(null, 'q?');
  assert.equal(takeAskedFrom('q?'), null);
});

test('the card reads as text for search and the AI: question, prose at its depth, files', () => {
  const card = golden();
  assert.match(codeExplainText(card), /how does attention hide later tokens\?/);
  assert.match(codeExplainText(card), /Positions above the diagonal are zero\./);
  assert.match(codeExplainText(card), /Code: model\.py, configurator\.py in karpathy\/nanoGPT/);
  card.depth = 'brief';
  assert.match(codeExplainText(card), /gives them zero weight/);
  card.depth = 'gone';
  assert.match(codeExplainText(card), /Positions above the diagonal/, 'an unknown depth reads as standard');
  assert.equal(cardText(golden()), codeExplainText(golden()));
  assert.equal(codeExplainText(null), '');
});

test('a satellite is the Files reader\'s code card plus ranges and the back-reference, and is still found as the same source', () => {
  const base = { app: 'app', repo: 'karpathy/nanoGPT', commit: 'a'.repeat(40), path: 'configurator.py', start: 30, end: 34 };
  const plain = repoCodeCard(base), satellite = repoCodeCard({ ...base, ranges: [{ id: 'r3', start: 30, end: 34 }], from: 'codeExplain:chat-7' });
  assert.equal('ranges' in plain, false);
  assert.equal('from' in plain, false);
  assert.deepEqual(satellite.ranges, [{ id: 'r3', start: 30, end: 34 }]);
  assert.equal(satellite.from, 'codeExplain:chat-7');
  assert.deepEqual({ ...satellite, ranges: undefined, from: undefined }, { ...plain, ranges: undefined, from: undefined });
  assert.equal(sameCodeSource(plain.source, satellite.source), true);
});

test("a repository chat ask names the canvas goal's use id (codebase-use-route.js canvasUseId), and nothing when there is none", async () => {
  const { canvasUseId } = await import('./codebase-use-route.js');
  const state = { activeActivityId: 'a1', activeGoalId: 'g-uuid', activities: [{ activityId: 'a1', goalId: 'g-uuid', checkpoint: { codebase: { goal: 'understand_feature' } } }] };
  assert.equal(canvasUseId(state), 'understand_feature');
  assert.equal(canvasUseId({ ...state, activeActivityId: 'other' }), null);
  assert.equal(canvasUseId({ ...state, activities: [{ ...state.activities[0], checkpoint: { codebase: { goal: 'not_a_use' } } }] }), null);
  assert.equal(canvasUseId({ ...state, activities: [{ ...state.activities[0], checkpoint: {} }] }), null);
  assert.equal(canvasUseId(null), null);
});
