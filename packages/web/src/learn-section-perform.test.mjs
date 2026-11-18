import test from 'node:test';
import assert from 'node:assert/strict';
import { learnTag, performItem, tagCard } from './learn-section-perform.js';

// A canvas that holds blocks, measures them at once and places every slot card at once (the column's job is AdaptiveCanvas's; here only what perform asks for).
function fakeCanvas(existing = []) {
  const blocks = [...existing], calls = { reveal: [], insert: [] };
  const api = {
    blocks: () => blocks,
    measured: id => blocks.some(block => block.id === id),
    learnPlaced: id => blocks.some(block => block.id === id && block.learn?.slot),
    learnReveal: (id, previous) => { calls.reveal.push([id, previous]); return true; },
    insertCodeExplain: ({ blocks: made, reveal }) => { calls.insert.push({ ids: made.map(block => block.id), reveal }); blocks.push(...made); return made[0].id; },
    updateBlock: (id, change) => { const k = blocks.findIndex(block => block.id === id); if (k >= 0) blocks[k] = change(blocks[k]); return true; },
    addWiki: ({ title }) => { const old = blocks.find(block => block.type === 'wiki' && block.title === title); if (old) return old.id; const id = `wiki-${blocks.length}`; blocks.push({ id, type: 'wiki', title }); return id; },
  };
  return { api, blocks, calls };
}
globalThis.requestAnimationFrame ??= cb => setTimeout(cb, 0);
// learn.since (when a card was put down, §7.3) is a clock reading: checked to be a number, then left out of the comparisons.
const noSince = learn => { const { since, ...rest } = learn || {}; assert.ok(Number.isFinite(since), 'learn.since is set'); return rest; };

test('a section card is a slot card: order, part and the pair\'s item ride on the tag', () => {
  assert.deepEqual(noSince(learnTag({ sectionId: '1.2', itemId: 'i3', order: 2, afterItem: 'i1' }, 'card', 1)), { sectionId: '1.2', itemId: 'i3', role: 'card', slot: true, order: 2, part: 1, after: 'i1' });
  assert.deepEqual(noSince(learnTag({ sectionId: '1.2', itemId: 'i3', afterItem: 'i1' }, 'lead')), { sectionId: '1.2', itemId: 'i3', role: 'lead', slot: true, order: null }, 'only the card of a paired item carries after');
});

// The lead and follow Document cards need CanvasDoc.jsx (a browser module); these items have none.
test('performItem: the card is a slot card linked to the section entry; the first card of a press is centred, a later one follows the card before it', async () => {
  const { api, blocks, calls } = fakeCanvas();
  const out = await performItem({ canvasApi: api, perform: { op: 'wiki', title: 'Tokenization' }, item: {}, ctx: { sectionId: '1.1', itemId: 'i1', order: 0, entry: 'toc-11', first: true } });
  assert.deepEqual(noSince(blocks[0].learn), { sectionId: '1.1', itemId: 'i1', role: 'card', slot: true, order: 0 });
  assert.deepEqual(blocks[0].tocLinks, ['toc-11']);
  assert.equal(out.cardId, blocks[0].id);
  await performItem({ canvasApi: api, perform: { op: 'wiki', title: 'Vocabulary' }, item: {}, ctx: { sectionId: '1.1', itemId: 'i2', order: 1, entry: 'toc-11', previous: blocks[0].id } });
  assert.deepEqual(calls.reveal, [[blocks[0].id, null], [blocks[1].id, blocks[0].id]]);
});

test('a card the canvas already held is tagged and linked but never put in the column', async () => {
  const { api, blocks } = fakeCanvas([{ id: 'old', type: 'wiki', title: 'Tokenization' }]);
  await performItem({ canvasApi: api, perform: { op: 'wiki', title: 'Tokenization' }, item: {}, ctx: { sectionId: '1.1', itemId: 'i1', entry: 'toc-11' } });
  const old = blocks.find(block => block.id === 'old');
  assert.equal(old.learn.slot, false);
  assert.deepEqual(old.tocLinks, ['toc-11']);
  await tagCard(api, 'old', { sectionId: '1.1', itemId: 'i2' });
  assert.equal(blocks.find(block => block.id === 'old').learn.itemId, 'i1', 'a tagged card keeps its first tag');
});
