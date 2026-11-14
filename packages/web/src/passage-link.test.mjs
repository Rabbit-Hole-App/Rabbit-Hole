// HL-146 (owner Ctrl+K spec item 6, option B of docs/features/explain/hl-145/server-proposal.md on film/evidence): a passage explained through Ctrl+K inside an EXPLANATION card is saved in that card's own
// highlights (explainedBy: the new card), drawn pink, and the new card carries fromPassage; both ends navigate to each other. Client only: the board save keeps both fields (proved below).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PASSAGE_STATUS_TEXT, explainedIds, heldPassage, holdPassage, linkPassage, passageSource } from './passage-link.js';
import { sharedState } from '../../control-plane/src/shared-privacy.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const REV = 'r1-aaaaaaaaaaaaaaaa', BODY = 'A node holding 4 class A and 4 class B is maximally mixed. A split criterion scores candidate thresholds.';
const QUOTE = 'maximally mixed';
const at = BODY.indexOf(QUOTE);
const SEGMENTS = [{ field: 'body', start: at, end: at + QUOTE.length, quote: QUOTE, prefix: 'class B is ', suffix: '. A split', contentRevision: REV }];
const source = () => ({ id: 'card-a', type: 'explanation', title: 'Split criteria', body: BODY });
const made = () => ({ id: 'card-b', type: 'explanation', title: 'Why maximally mixed?', body: 'Because the classes are balanced.' });

test('linking: the source card saves the explained passage as one more highlight (explainedBy the new card) and the new card names its source', () => {
  const blocks = [source(), made(), { id: 'other', type: 'explanation' }];
  const out = linkPassage(blocks, { cardId: 'card-a', revision: REV, segments: SEGMENTS }, 'card-b');
  assert.deepEqual(out[0].highlights, [{ id: 'explained-card-b', contentRevision: REV, segments: SEGMENTS, explainedBy: 'card-b' }]);
  assert.deepEqual(out[1].fromPassage, { cardId: 'card-a', highlightId: 'explained-card-b', contentRevision: REV });
  assert.equal(out[2], blocks[2], 'other cards are the same objects');
  assert.equal(blocks[0].highlights, undefined, 'the input is not mutated');
});

test('linking keeps the card\'s own plain highlights, and linking the same new card again replaces its entry', () => {
  const plain = { id: 'hl-plain', contentRevision: REV, segments: SEGMENTS };
  const once = linkPassage([{ ...source(), highlights: [plain] }, made()], { cardId: 'card-a', revision: REV, segments: SEGMENTS }, 'card-b');
  assert.equal(once[0].highlights.length, 2);
  assert.equal(once[0].highlights[0], plain);
  const twice = linkPassage(once, { cardId: 'card-a', revision: REV, segments: SEGMENTS }, 'card-b');
  assert.equal(twice[0].highlights.filter(h => h.explainedBy === 'card-b').length, 1);
});

test('linking refuses to guess: no source card, no new card, no segments, no revision, change nothing', () => {
  const blocks = [source(), made()];
  const good = { cardId: 'card-a', revision: REV, segments: SEGMENTS };
  assert.equal(linkPassage(blocks, { ...good, cardId: 'gone' }, 'card-b'), blocks);
  assert.equal(linkPassage(blocks, good, 'not-yet'), blocks);
  assert.equal(linkPassage(blocks, { ...good, segments: [] }, 'card-b'), blocks);
  assert.equal(linkPassage(blocks, { ...good, revision: '' }, 'card-b'), blocks);
  assert.equal(linkPassage(blocks, null, 'card-b'), blocks);
  assert.equal(linkPassage(blocks, { ...good, cardId: 'card-b' }, 'card-b'), blocks, 'a card is never its own source');
});

test('explainedIds: only the explained highlights that still hold on this revision draw pink', () => {
  const linked = linkPassage([{ ...source(), highlights: [{ id: 'hl-plain', contentRevision: REV, segments: SEGMENTS }] }, made()], { cardId: 'card-a', revision: REV, segments: SEGMENTS }, 'card-b')[0];
  assert.deepEqual([...explainedIds(linked, REV)], ['explained-card-b']);
  assert.deepEqual([...explainedIds(linked, 'r1-bbbbbbbbbbbbbbbb')], [], 'a changed revision draws nothing');
  assert.deepEqual([...explainedIds({ ...linked, body: BODY.replace('maximally', 'minimally') }, REV)], [], 'moved text draws nothing');
});

test('status: current, changed text, source card gone, highlight removed, and none when the card has no source', () => {
  const [a, b] = linkPassage([source(), made()], { cardId: 'card-a', revision: REV, segments: SEGMENTS }, 'card-b');
  assert.deepEqual(passageSource([a, b], b), { status: 'current', cardId: 'card-a', highlightId: 'explained-card-b', title: 'Split criteria' });
  assert.equal(passageSource([a, b], made()), null);
  assert.equal(passageSource([{ ...a, body: BODY.replace('maximally', 'minimally') }, b], b).status, 'changed');
  assert.equal(passageSource([b], b).status, 'card-gone');
  assert.equal(passageSource([{ ...a, highlights: [] }, b], b).status, 'highlight-gone');
  for (const key of ['changed', 'card-gone', 'highlight-gone']) assert.ok(PASSAGE_STATUS_TEXT[key].length > 10 && !PASSAGE_STATUS_TEXT[key].includes('...'), key);
});

test('the held passage: the selection toolbar publishes what is selected, Ctrl+K asks for it by card and words (whitespace folded), and a different selection or none gets nothing', () => {
  const held = { revision: REV, segments: SEGMENTS, quote: QUOTE };
  holdPassage('card-a', held);
  assert.equal(heldPassage('card-a', '  maximally\n mixed '), held);
  assert.equal(heldPassage('card-a', 'something else'), null);
  assert.equal(heldPassage('card-z', QUOTE), null);
  holdPassage('card-a', null);
  assert.equal(heldPassage('card-a', QUOTE), null);
  holdPassage('card-a', { revision: REV, segments: [], quote: QUOTE });
  assert.equal(heldPassage('card-a', QUOTE), null, 'no segments, nothing to save');
});

test('the board save keeps both fields: stateText stores the state as sent, the block whitelist is not applied on save, and a reader of the shared link keeps the explained highlight and the link (same board)', () => {
  const boards = read('../../control-plane/src/learn-boards.js');
  assert.match(boards, /function stateText\(state\) \{[\s\S]*?const text = JSON\.stringify\(state\);/, 'the state is stored as sent (learn-boards.js stateText)');
  assert.ok(boards.includes('.bind(id, owner.org, owner.email, app, board, state.text,'), 'the INSERT stores state.text');
  const [a, b] = linkPassage([source(), made()], { cardId: 'card-a', revision: REV, segments: SEGMENTS }, 'card-b');
  const saved = JSON.parse(JSON.stringify({ blocks: [a, b] }));
  assert.equal(saved.blocks[0].highlights[0].explainedBy, 'card-b');
  assert.deepEqual(saved.blocks[1].fromPassage, b.fromPassage);
  const shared = sharedState({ blocks: [a, b] });
  assert.equal(shared.blocks[0].highlights[0].explainedBy, 'card-b', 'only paper cards lose highlights for a reader (shared-privacy.js LEARNER)');
  assert.deepEqual(shared.blocks[1].fromPassage, b.fromPassage);
});

test('wiring: the layer publishes the selection, the field draws explained highlights pink, the menu and a hover icon say Go to card, the new card\'s header says Go to highlight', () => {
  const layer = read('ExplanationInteractions.jsx'), blocks = read('LearningBlocks.jsx'), chip = read('SourceRefChip.jsx'), refs = read('source-refs.js'), css = read('card-layout.css');
  assert.ok(layer.includes("holdPassage(block.id, bar ? { revision, segments: bar.segments, quote: bar.quote } : null)"), 'the toolbar\'s selection is held for Ctrl+K');
  assert.ok(layer.includes('data-explained'), 'explained highlights are marked');
  assert.ok(layer.includes('aria-label="Go to card"') && layer.includes('title="Go to card"'), 'the icon and the menu entry');
  assert.ok(blocks.includes('block.fromPassage ? <PassageHeader'), 'the new card\'s header');
  assert.ok(chip.includes('aria-label="Go to highlight" title="Go to highlight" onClick={() => goToPassage(found)}'), 'Go to highlight');
  assert.ok(refs.includes('fromPassage') && refs.includes('goTo(focus, cardId)'), 'published for the readers, one camera function');
  assert.match(css, /\[data-explained\] \{ background-color: color-mix\(in oklab, var\(--color-explained\) 42%, transparent\)/);
});

test('wiring: Ctrl+K carries the passage (picked highlight, selection), the command links after the card exists, on both paths, and the canvas edits the two blocks without an undo step of its own', () => {
  const picked = read('inline-highlight.js'), editor = read('InlineAiEditor.jsx'), slash = read('learn-slash.js'), page = read('LearnPage.jsx'), canvas = read('AdaptiveCanvas.jsx');
  assert.ok(picked.includes('passage: heldPassage(id, text)'));
  assert.ok(editor.includes('...(highlight.passage ? { passage: { cardId: highlight.id, ...highlight.passage } } : {})'));
  assert.ok(slash.includes('if (started?.blockId && target?.passage) canvas.linkPassage?.(started.blockId, target.passage);'), 'the job path');
  assert.ok(slash.includes('if (blockId && target?.passage) canvas.linkPassage?.(blockId, target.passage);'), 'the written path');
  assert.ok(page.includes('linkPassage: (id, passage) => canvasApi.current?.linkPassage?.(id, passage)'));
  assert.ok(canvas.includes('linkPassage: (cardId, passage) =>'));
  void fileURLToPath;
});
