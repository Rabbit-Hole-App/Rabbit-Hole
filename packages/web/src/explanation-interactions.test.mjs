// E2 anchor and offset mapping (docs/features/explain.md section 5 "Occurrence and revision mapping"; EXP-05-C05, EXP-12-C06): pure checks on explanation-interactions.js.
// Code points against UTF-16, repeated words, a selection across a term pill, Markdown syntax, a multi-field selection, stale revisions, consumption, and
// parity of the revision and the field text with the lead's control-plane contract. The DOM is linkedom; real layout, selection and focus are the owner's browser check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import * as web from './explanation-interactions.js';
import * as server from '../../control-plane/src/explanation-interactions.js';

const dom = html => { const { document } = parseHTML(`<!doctype html><html><body><div id="root">${html}</div></body></html>`); return { document, root: document.getElementById('root') }; };
const cp = text => Array.from(text);

test('the revision and the field text are exactly the contract\'s', async () => {
  const block = { title: 'Why trees', body: 'A **decision tree** asks *questions*.\n\n| a | b |\n|---|---|\n| 1 | 2 |', more: [{ label: 'More', text: '- one\n- two `code`' }] };
  assert.equal(await web.contentRevision(block), await server.contentRevision(block));
  assert.equal(web.contentRevisionInput(block), server.contentRevisionInput(block));
  for (const field of ['body', 'more[0].text', 'more[1].text', 'bogus']) assert.equal(web.fieldText(block, field), server.fieldText(block, field), field);
  assert.equal(web.fieldText(block, 'body'), 'A decision tree asks questions. a b 1 2', 'Markdown syntax removed, whitespace collapsed');
});

test('the revision changes with the text and not with anything else on the card', async () => {
  const block = { title: 'T', body: 'Body', more: [] };
  const a = await web.contentRevision(block);
  assert.equal(await web.contentRevision({ ...block, dx: 90, dy: 4, w: 700, highlights: [{ id: 'h' }], interactionState: { consumed: true } }), a, 'a move, a resize, a highlight or a consumption is not a content edit');
  assert.notEqual(await web.contentRevision({ ...block, body: 'Body.' }), a);
  assert.notEqual(await web.contentRevision({ ...block, more: [{ label: 'x', text: 'y' }] }), a);
});

test('alignment ignores whitespace and inline markup: bold, emphasis, links and lists render as the canonical text', () => {
  const { root } = dom('<p>A <strong>decision</strong> <em>tree</em>\n   asks.</p><ul><li>one</li><li>two</li></ul>');
  const aligned = web.alignField(root, 'A decision tree asks. one two');
  assert.ok(aligned, 'the rendered text and the canonical text are the same characters');
  assert.equal(web.alignField(root, 'A decision tree asks. one TWO'), null, 'any difference refuses the whole field');
  const chrome = dom('<div data-code-block><span data-code-lang>python</span><button data-code-copy>Copy</button><pre>x = 1</pre></div>');
  assert.ok(web.alignField(chrome.root, 'x = 1'), 'a code block\'s language label and Copy button are chrome, not content');
});

test('code points, not UTF-16 units: an emoji before the term shifts nothing', () => {
  const text = 'Say \u{1F600} to the tree, then the tree again.';
  const { root, document } = dom(`<p>${text}</p>`);
  const aligned = web.alignField(root, text);
  assert.ok(aligned);
  // The second "tree": offsets in code points. The emoji is 2 UTF-16 units and 1 code point.
  const occurrences = [...text.matchAll(/tree/g)].map(m => cp(text.slice(0, m.index)).length);
  assert.equal(occurrences.length, 2);
  const [, second] = occurrences;
  assert.equal(second, cp(text).length - cp(' again.').length - 4, 'the code-point offset of the second tree');
  assert.notEqual(second, text.indexOf('tree', text.indexOf('tree') + 1), 'a UTF-16 offset would be one too large');
  // Wrap it and read it back through a selection: the stored anchor is in code points.
  web.decorate(aligned, [{ start: second, end: second + 4, kind: 'term', id: 't-1' }], document);
  const pills = root.querySelectorAll('[data-term-id]');
  assert.equal(pills.length, 1);
  assert.equal(pills[0].textContent, 'tree', 'only the second occurrence is the pill, not every equal word');
  assert.ok(pills[0].previousSibling.data.endsWith('then the '), 'the pill sits at the second occurrence');
  assert.equal(root.querySelectorAll('[data-term-first]').length, 1);
});

test('a selection across a term pill keeps its exact text and the same offsets as before decoration', () => {
  const text = 'A decision tree makes a prediction by asking questions.';
  const { root, document } = dom(`<p>${text}</p>`);
  let aligned = web.alignField(root, text);
  const begin = cp(text).join('').indexOf('decision'), pillStart = begin, pillEnd = begin + 'decision tree'.length;
  web.decorate(aligned, [{ start: pillStart, end: pillEnd, kind: 'term', id: 't-1' }], document);
  aligned = web.alignField(root, text);
  assert.ok(aligned, 'a decorated field still aligns: the pill contributes only its underlying text');
  const [before, pill, after] = Array.from(root.firstChild.childNodes);
  assert.equal(pill.textContent, 'decision tree');
  // From inside "A " (offset 0 of the first text) to inside " makes a" (after 6 chars): crosses the whole pill.
  const range = { startContainer: before, startOffset: 0, endContainer: after, endOffset: ' makes'.length };
  const [segment] = web.anchorsFromRange(range, [{ field: 'body', root, aligned, canonical: text }], 'r1-abc');
  assert.deepEqual({ ...segment }, { field: 'body', start: 0, end: cp('A decision tree makes').length, quote: 'A decision tree makes', prefix: '', suffix: ' a prediction by asking ', contentRevision: 'r1-abc' });
  // Starting inside the pill's text node and ending in the text after it.
  const inner = { startContainer: pill.firstChild, startOffset: 'decision '.length, endContainer: after, endOffset: ' makes'.length };
  assert.equal(web.anchorsFromRange(inner, [{ field: 'body', root, aligned, canonical: text }], 'r')[0].quote, 'tree makes');
  // An element boundary (a triple click ends at the paragraph) covers the rest of the field.
  const wholeLine = { startContainer: root.firstChild, startOffset: 0, endContainer: root.firstChild, endOffset: root.firstChild.childNodes.length };
  assert.equal(web.anchorsFromRange(wholeLine, [{ field: 'body', root, aligned, canonical: text }], 'r')[0].quote, text);
});

test('repeated text in two sections: each anchor names its own field and offsets', () => {
  const a = dom('<p>The tree grows. The tree stops.</p>'), b = dom('<p>Another tree.</p>');
  const fields = [
    { field: 'body', root: a.root, canonical: 'The tree grows. The tree stops.' },
    { field: 'more[0].text', root: b.root, canonical: 'Another tree.' },
  ].map(entry => ({ ...entry, aligned: web.alignField(entry.root, entry.canonical) }));
  assert.ok(fields.every(entry => entry.aligned));
  const second = a.root.firstChild.firstChild;
  const range = { startContainer: second, startOffset: 'The tree grows. The '.length, endContainer: second, endOffset: 'The tree grows. The tree'.length };
  const [only] = web.anchorsFromRange(range, fields, 'r');
  assert.deepEqual([only.field, only.start, only.end, only.quote], ['body', 20, 24, 'tree'], 'the second "tree" of the body, not the first and not the section\'s');
  assert.equal(web.anchorsFromRange(range, fields, 'r').length, 1);
});

test('a selection across two fields stores an ordered list of field segments, never one interval', () => {
  // The two fields live in one document.
  const { document } = parseHTML('<!doctype html><html><body><section id="a"><p>First field ends here.</p></section><section id="b"><p>Second starts now.</p></section></body></html>');
  const ra = document.getElementById('a'), rb = document.getElementById('b');
  const fields = [{ field: 'body', root: ra, canonical: 'First field ends here.' }, { field: 'more[0].text', root: rb, canonical: 'Second starts now.' }].map(e => ({ ...e, aligned: web.alignField(e.root, e.canonical) }));
  const range = { startContainer: ra.firstChild.firstChild, startOffset: 'First '.length, endContainer: rb.firstChild.firstChild, endOffset: 'Second starts'.length };
  const segments = web.anchorsFromRange(range, fields, 'r1-x');
  assert.deepEqual(segments.map(s => [s.field, s.quote]), [['body', 'field ends here.'], ['more[0].text', 'Second starts']]);
  assert.equal(web.quoteOf(segments), 'field ends here. Second starts');
  // A range that begins before the first field and ends in the second covers the first field whole.
  const wide = { startContainer: document.body, startOffset: 0, endContainer: rb.firstChild.firstChild, endOffset: 3 };
  assert.deepEqual(web.anchorsFromRange(wide, fields, 'r').map(s => [s.field, s.quote]), [['body', 'First field ends here.'], ['more[0].text', 'Sec']]);
});

test('a field that does not align (typeset math, a diagram) yields no anchors and no pills', () => {
  const { root } = dom('<p>Energy <span class="katex">E=mc2 E=mc2</span> matters.</p>');
  const aligned = web.alignField(root, 'Energy E=mc^2 matters.');
  assert.equal(aligned, null);
  assert.deepEqual(web.anchorsFromRange({ startContainer: root, startOffset: 0, endContainer: root, endOffset: 1 }, [{ field: 'body', root, aligned, canonical: '' }], 'r'), []);
});

test('decorate then undecorate restores the exact DOM; overlapping term and highlight both apply', () => {
  const text = 'Leaves look green because of chlorophyll in the leaf.';
  const { root, document } = dom(`<p>Leaves look <b>green</b> because of chlorophyll in the leaf.</p>`);
  const html = root.innerHTML;
  const aligned = web.alignField(root, text);
  assert.ok(aligned);
  const chlor = text.indexOf('chlorophyll');
  web.decorate(aligned, [
    { start: chlor, end: chlor + 'chlorophyll'.length, kind: 'term', id: 't-1' },
    { start: text.indexOf('green'), end: chlor + 5, kind: 'highlight', id: 'h-1' },
  ], document);
  assert.equal(root.querySelectorAll('[data-term-id="t-1"]').length >= 1, true);
  const marked = root.querySelectorAll('[data-highlight-ids]');
  assert.ok(marked.length >= 2, 'the highlight spans the bold element and the text after it');
  assert.match(root.querySelector('[data-term-id]').getAttribute('data-highlight-ids'), /h-1/, 'the highlighted half of the pill carries both');
  assert.equal(root.textContent, 'Leaves look green because of chlorophyll in the leaf.', 'decoration adds no text');
  web.undecorate(root);
  assert.equal(root.innerHTML, html);
});

test('stale revisions: terms, highlights and suggestions from another revision are omitted, never moved', async () => {
  const block = { id: 'c', title: 'T', body: 'A decision tree asks questions.', more: [] };
  const revision = await web.contentRevision(block);
  const interactions = { version: 1, displayTextVersion: 1, contentRevision: revision, questions: [{ id: 'q1', text: 'Why?' }, { id: 'q2', text: 'How?' }, { id: 'q3', text: 'When?' }],
    terms: [{ id: 't1', label: 'decision tree', definition: 'A tree of questions.', anchor: { field: 'body', quote: 'decision tree', occurrence: 0, start: 2, end: 15 } }] };
  const fresh = { ...block, interactions };
  assert.equal(web.interactionsCurrent(fresh, revision), true);
  assert.deepEqual(web.termsFor(fresh, revision).map(t => t.id), ['t1']);
  assert.equal(web.suggestionsFor(fresh, revision).length, 3);
  // The same envelope on edited text: the card has another revision.
  const edited = { ...fresh, body: 'A decision tree asks questions!' };
  const next = await web.contentRevision(edited);
  assert.notEqual(next, revision);
  assert.deepEqual(web.termsFor(edited, next), [], 'old terms never attach to equal text in a different revision');
  assert.deepEqual(web.suggestionsFor(edited, next), []);
  // A term whose anchor no longer points at its quote is dropped even on the same revision.
  assert.deepEqual(web.termsFor({ ...fresh, interactions: { ...interactions, terms: [{ ...interactions.terms[0], anchor: { ...interactions.terms[0].anchor, start: 3, end: 16 } }] } }, revision), []);
  // Legacy and E1 cards have no envelope: nothing renders.
  assert.deepEqual(web.suggestionsFor(block, revision), []);
  assert.deepEqual(web.termsFor(block, revision), []);
  // A highlight stays in the card data when its revision is old, and does not decorate.
  const seg = { field: 'body', start: 2, end: 15, quote: 'decision tree', prefix: 'A ', suffix: ' asks', contentRevision: revision };
  const marked = web.withHighlight(fresh, 'h1', [seg], revision);
  assert.equal(web.highlightsFor(marked, revision).length, 1);
  assert.equal(web.highlightsFor({ ...marked, body: 'A decision tree asks questions!' }, next).length, 0);
  assert.equal(marked.highlights.length, 1, 'the stale record is not deleted');
  assert.equal(web.withoutHighlight(marked, 'h1').highlights.length, 0);
});

test('consumption is per revision and persists in the card: a consumed set stays gone, a new revision is a new set', async () => {
  const block = { id: 'c', title: 'T', body: 'Body text here.', more: [] };
  const revision = await web.contentRevision(block);
  const card = { ...block, interactions: { version: 1, displayTextVersion: 1, contentRevision: revision, questions: [{ id: 'a', text: 'A?' }, { id: 'b', text: 'B?' }, { id: 'c', text: 'C?' }], terms: [] } };
  assert.equal(web.suggestionsFor(card, revision).length, 3);
  const used = web.withConsumed(card, revision, { id: 'act-1', question: 'a', destination: 'here' });
  assert.deepEqual(web.suggestionsFor(used, revision), []);
  assert.deepEqual(JSON.parse(JSON.stringify(used)).interactionState, { contentRevision: revision, consumed: true, action: { id: 'act-1', question: 'a', destination: 'here' } }, 'plain JSON: it saves and reloads with the board');
  assert.deepEqual(web.suggestionsFor(JSON.parse(JSON.stringify(used)), revision), [], 'and stays consumed after reload');
  // A state recorded for another revision does not consume this one.
  assert.equal(web.suggestionsFor({ ...card, interactionState: { contentRevision: 'r1-other', consumed: true } }, revision).length, 3);
});
