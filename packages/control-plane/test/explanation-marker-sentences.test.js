// Owner 2026-11-09 (batch-02 review, card 08 attention-weights): a [[visual:n]] marker inside a sentence is moved to after the end of that sentence, so composeVisuals
// no longer cuts the sentence in two. Markers between sentences or at a paragraph start stay where they are; a second pass changes nothing. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeVisuals, markersOutOfSentences } from '../src/learn-primitives.js';

const DIAGRAM = { k: 'diagram', spec: { version: 1, diagram: { kind: 'cycle', title: 'Loop', steps: ['Plan', 'Do', 'Check'] } } };
const fence = v => '```rh-diagram\n' + JSON.stringify(v.spec) + '\n```';
const quiet = t => { const { log } = console; console.log = () => {}; t.after(() => { console.log = log; }); };

// docs/features/explain/review/batch-02/08-attention-weights/card.md (branch explain/review-batch-02), "Body (as saved, visual markers in place)".
const CARD_08 = [
  'Attention weights determine how much focus a model places on different parts of an input sequence when processing a specific token.',
  'For instance, when evaluating the word kite in a sentence, the mechanism assigns higher relevance scores to connected words like red.',
  'Look at the weight distribution in\n\n[[visual:1]]\n\nwhere the queries link source and target tokens with normalized values that sum to one.',
  'Mathematically, this score begins with a dot product between query vectors $Q$ and key vectors $K$, scaling down by the square root of the dimension $d_k$.',
  'Applying the softmax function then normalizes these raw scores into positive probabilities that drive the weighted sum over value vectors $V$.',
].join('\n\n');

test('card 08: the marker inside "Look at the weight distribution in ... where the queries link ..." moves after that sentence', t => {
  quiet(t);
  const out = composeVisuals(CARD_08, [DIAGRAM]);
  const joined = 'Look at the weight distribution in where the queries link source and target tokens with normalized values that sum to one.';
  assert.ok(out.includes(`${joined}\n\n${fence(DIAGRAM)}\n\nMathematically, this score`), out);
  assert.ok(!/in\n\n```/.test(out), 'the sentence is not cut before the fence');
});

test('the move is logged once, naming the visual', t => {
  const { log } = console; const lines = []; console.log = l => lines.push(l); t.after(() => { console.log = log; });
  markersOutOfSentences(CARD_08);
  assert.deepEqual(lines.map(l => JSON.parse(l)).map(({ event, visual }) => ({ event, visual })), [{ event: 'explanation_marker_moved', visual: 1 }]);
});

test('a marker between sentences, at a paragraph start or inline between two sentences is unchanged', t => {
  quiet(t);
  for (const body of ['First idea is here.\n\n[[visual:1]]\n\nthe lowercase start of a paragraph.', 'First idea. [[visual:1]] Second idea.', 'First idea.\n\n[[visual:1]]\n\nSecond idea.', '[[visual:1]]\n\nlowercase after a leading marker.', 'He said "stop."\n\n[[visual:1]]\n\nnext'])
    assert.equal(markersOutOfSentences(body), body);
  assert.equal(composeVisuals('First idea. [[visual:1]] Second idea.', [DIAGRAM]), `First idea.\n\n${fence(DIAGRAM)}\n\nSecond idea.`);
});

test('an inline marker mid-sentence moves to the sentence end; the rest of the paragraph follows it', t => {
  quiet(t);
  assert.equal(markersOutOfSentences('A cache holds copies of data in [[visual:1]] close to the reader, so reads are fast. Misses go to disk.'),
    'A cache holds copies of data in close to the reader, so reads are fast.\n\n[[visual:1]]\n\nMisses go to disk.');
  assert.equal(markersOutOfSentences('The value is $x.y$ in [[visual:1]] where it ends.'), 'The value is $x.y$ in where it ends.\n\n[[visual:1]]');
});

test('two markers, each mid-sentence, both move and keep their order', t => {
  quiet(t);
  const out = markersOutOfSentences('The first thing is shown in [[visual:1]] where it starts. Then the second thing is shown in [[visual:2]] where it ends. Done.');
  assert.equal(out, 'The first thing is shown in where it starts.\n\n[[visual:1]]\n\nThen the second thing is shown in where it ends.\n\n[[visual:2]]\n\nDone.');
});

test('one marker mid-sentence and one between sentences: only the first moves', t => {
  quiet(t);
  assert.equal(markersOutOfSentences('Look at the plot in [[visual:1]] where the line rises. Next idea.\n\n[[visual:2]]\n\nAfter it.'),
    'Look at the plot in where the line rises.\n\n[[visual:1]]\n\nNext idea.\n\n[[visual:2]]\n\nAfter it.');
});

test('a mid-sentence marker whose sentence has no end in its paragraph is left alone', t => {
  quiet(t);
  const body = 'Look at the plot in [[visual:1]] where the line rises\n\nNext paragraph.';
  assert.equal(markersOutOfSentences(body), body);
});

test('idempotent: a second pass changes nothing', t => {
  quiet(t);
  for (const body of [CARD_08, 'A cache holds data in [[visual:1]] close to the reader. Misses go to disk.', 'The first is in [[visual:1]] where it starts. The second is in [[visual:2]] where it ends. Done.']) {
    const once = markersOutOfSentences(body);
    assert.notEqual(once, body);
    assert.equal(markersOutOfSentences(once), once);
  }
});
