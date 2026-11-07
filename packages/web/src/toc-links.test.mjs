// Links from a card to a Table of contents section (toc-links.js; owner 2026-11-07 Add a link > Link to TOC): the pure helpers, with the limits,
// the pruning and the copy semantics, and that a link survives a save and a reload without ever reaching the server's canvas-reference index.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TOC_LINKS, ancestorsOf, holdsTocLink, linkedCards, resolvedLinks, sectionChoices, withLiveLinks, withTocLink, withoutTocLink } from './toc-links.js';
import { persistBoard, lightBlocks } from './canvas-persist.js';
import { outlineFrom, removeTocEntry } from './learn-outline-model.js';
import { boardRefs } from '../../control-plane/src/canvas-refs.js';

const card = { id: 'c1', type: 'lesson', title: 'Gradients' };
const outline = [
  { id: 'h1', level: 1, label: 'Intro' },
  { id: 'h2', level: 2, label: 'Slopes' },
  { id: 'h3', level: 3, label: 'Tiny' },
  { id: 'h4', level: 1, label: 'Wrap up' },
  { id: 'roadmap:s1', level: 1, label: 'A roadmap step' },
];

test('withTocLink adds one link per section; a canvas reference card, a heading and a roadmap row hold none', () => {
  const one = withTocLink(card, 'h1');
  assert.deepEqual(one, { tocLinks: ['h1'] });
  assert.deepEqual(withTocLink({ ...card, tocLinks: ['h1'] }, 'h2'), { tocLinks: ['h1', 'h2'] });
  assert.deepEqual(withTocLink({ ...card, tocLinks: ['h1'] }, 'h1'), { reason: 'exists' }, 'never twice');
  assert.deepEqual(withTocLink({ id: 'r', type: 'canvas-ref' }, 'h1'), { reason: 'unsupported' }, 'a reference card IS a link');
  assert.deepEqual(withTocLink({ id: 'x', type: 'heading' }, 'h1'), { reason: 'unsupported' });
  assert.deepEqual(withTocLink(card, 'roadmap:s1'), { reason: 'unsupported' }, 'a roadmap row belongs to the server');
  assert.deepEqual(withTocLink(card, ''), { reason: 'unsupported' });
  assert.deepEqual(withTocLink(null, 'h1'), { reason: 'unsupported' });
  const full = { ...card, tocLinks: Array.from({ length: MAX_TOC_LINKS }, (_, i) => 'e' + i) };
  assert.deepEqual(withTocLink(full, 'new'), { reason: 'limit' });
  assert.equal(holdsTocLink(card), true);
});

test('withoutTocLink answers the remaining links, or null when there was nothing to remove (nothing to undo)', () => {
  assert.deepEqual(withoutTocLink({ ...card, tocLinks: ['h1', 'h2'] }, 'h1'), ['h2']);
  assert.deepEqual(withoutTocLink({ ...card, tocLinks: ['h1'] }, 'h1'), []);
  assert.equal(withoutTocLink({ ...card, tocLinks: ['h1'] }, 'zz'), null);
  assert.equal(withoutTocLink(card, 'h1'), null);
});

test('the ToC side is derived from the cards: linkedCards reads the same links, so the two directions cannot disagree', () => {
  const rows = [['c1', 'Gradients', ['h1', 'h2']], ['c2', 'Loss', ['h2']], ['c3', 'Other', ['h4']]];
  assert.deepEqual(linkedCards(rows, 'h2'), [{ id: 'c1', title: 'Gradients' }, { id: 'c2', title: 'Loss' }]);
  assert.deepEqual(linkedCards(rows, 'h1'), [{ id: 'c1', title: 'Gradients' }]);
  assert.deepEqual(linkedCards(rows, 'h3'), []);
  assert.deepEqual(linkedCards(undefined, 'h1'), []);
});

test('resolvedLinks: a card shows only the sections that still exist, with their current titles', () => {
  const linked = { ...card, tocLinks: ['h2', 'gone', 'h4'] };
  assert.deepEqual(resolvedLinks(linked, outline), [{ id: 'h2', title: 'Slopes' }, { id: 'h4', title: 'Wrap up' }]);
  assert.deepEqual(resolvedLinks(card, outline), []);
  assert.deepEqual(resolvedLinks(linked, []), []);
});

test('withLiveLinks keeps only the links that still name a section, so a card never stops at the limit because of removed sections; unchanged cards come back as is', () => {
  const stale = { ...card, tocLinks: ['h1', 'gone', 'h4'] };
  assert.deepEqual(withLiveLinks(stale, outline).tocLinks, ['h1', 'h4']);
  assert.deepEqual(stale.tocLinks, ['h1', 'gone', 'h4'], 'the input is never mutated');
  const fine = { ...card, tocLinks: ['h1'] };
  assert.equal(withLiveLinks(fine, outline), fine, 'nothing to drop: the same object');
  assert.equal(withLiveLinks(card, outline), card);
  assert.equal(withLiveLinks(undefined, outline), undefined);
  // 20 links, 19 to removed sections: adding a new one works once the dead ones are dropped.
  const crowded = { ...card, tocLinks: ['h1', ...Array.from({ length: MAX_TOC_LINKS - 1 }, (_, i) => 'dead' + i)] };
  assert.deepEqual(withTocLink(crowded, 'h2'), { reason: 'limit' });
  assert.deepEqual(withTocLink(withLiveLinks(crowded, outline), 'h2'), { tocLinks: ['h1', 'h2'] });
});

test('removing a section changes the contents only: the card keeps its link list (so Undo of the removal brings the link back) and shows nothing meanwhile', () => {
  const blocks = [{ id: 'h1', type: 'heading', text: 'Intro', level: 1 }, { id: 'c1', type: 'lesson', title: 'G', tocLinks: ['h1'] }];
  const toc = removeTocEntry(blocks, null, 'h1');
  assert.deepEqual(toc, [], 'only the contents entry goes');
  assert.deepEqual(blocks[1].tocLinks, ['h1'], 'the card is not written');
  assert.deepEqual(resolvedLinks(blocks[1], outlineFrom(blocks, toc)), [], 'no row for a section that is not in the contents');
  assert.deepEqual(resolvedLinks(blocks[1], outlineFrom(blocks, null)), [{ id: 'h1', title: 'Intro' }], 'with the entry back (Undo) the row is back');
});

test('a same-canvas copy keeps its links (the whole block is copied); a section list loses none because a link names a section by id', () => {
  const copy = { ...card, tocLinks: ['h1'], id: 'c1-copy' };
  assert.deepEqual(resolvedLinks(copy, outline), [{ id: 'h1', title: 'Intro' }]);
  // A copy pasted on a canvas that has no such section shows nothing (resolvedLinks) and is harmless: the stale id is never rendered.
  assert.deepEqual(resolvedLinks(copy, [{ id: 'z', level: 1, label: 'Other canvas section' }]), []);
});

test('sectionChoices lists the manual sections in reading order with their number paths, never a roadmap row', () => {
  assert.deepEqual(sectionChoices(outline), [
    { id: 'h1', title: 'Intro', path: '1', level: 1 },
    { id: 'h2', title: 'Slopes', path: '1.1', level: 2 },
    { id: 'h3', title: 'Tiny', path: '1.1.1', level: 3 },
    { id: 'h4', title: 'Wrap up', path: '2', level: 1 },
  ]);
  assert.deepEqual(sectionChoices([]), []);
  assert.deepEqual(sectionChoices(undefined), []);
});

test('ancestorsOf names the headings to unfold so a highlighted row is on screen', () => {
  assert.deepEqual(ancestorsOf(outline, 'h3'), ['h1', 'h2']);
  assert.deepEqual(ancestorsOf(outline, 'h2'), ['h1']);
  assert.deepEqual(ancestorsOf(outline, 'h1'), []);
  assert.deepEqual(ancestorsOf(outline, 'nope'), []);
});

test('the links are saved with the card: a save and a reload keep block.tocLinks, and the server never reads them as canvas references', async () => {
  const blocks = [{ id: 'c1', type: 'lesson', title: 'G', tocLinks: ['h1', 'h2'], refs: [{ id: 'r'.repeat(8) + '-1', target: 'canvas-aaaa1111' }] }];
  // The client write path: persistBoard stores the lightBlocks of the board, whole; the read path parses it back.
  const store = new Map();
  const answer = await persistBoard({ state: { blocks, toc: null }, storageKey: 'k', storage: () => ({ setItem: (key, value) => store.set(key, value) }), onSave: async () => 'ok' });
  assert.ok(answer.local);
  const reloaded = JSON.parse(store.get('k'));
  assert.deepEqual(reloaded.blocks[0].tocLinks, ['h1', 'h2']);
  assert.deepEqual(lightBlocks(blocks)[0].tocLinks, ['h1', 'h2']);
  // The server indexes block.refs only (control-plane canvas-refs.js boardRefs): tocLinks neither count toward its bounds nor become references.
  const indexed = boardRefs({ blocks });
  assert.ok(Array.isArray(indexed));
  assert.equal(indexed.every(ref => !String(ref.target).startsWith('h')), true);
  const many = boardRefs({ blocks: [{ id: 'c2', tocLinks: Array.from({ length: 50 }, (_, i) => 'e' + i) }] });
  assert.deepEqual(many, [], 'fifty section links are not fifty canvas references and cannot trip too_many_refs');
  assert.deepEqual(outlineFrom([{ id: 'h1', type: 'heading', text: 'Intro', level: 1 }]).map(entry => entry.id), ['h1'], 'the entry ids a link names are the outline entry ids');
});
