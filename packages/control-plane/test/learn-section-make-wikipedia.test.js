import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/learn-section-make/wikipedia.js';

// ctx.turn.wiki as the research wrapper records read_wikipedia results.
const read = { section: 2, sectionTitle: 'Definition', text: 'A matrix is a rectangular array of numbers arranged in rows and columns. It is used widely.' };
const ctx = anchors => ({ item: { id: 'i7' }, beat: { anchors }, earlier: [], turn: { wiki: { 'Matrix_(mathematics)': { sections: [read] } } } });
const input = quote => ({ title: 'Matrix (mathematics)', section: 'Definition', quote });

test('C §7f.3: a planted quote not in the section gives a card with no highlight and records not_found', async () => {
  const ok = await validate(input('A matrix is a rectangular array of numbers arranged in rows and columns.'), ctx([]));
  assert.equal(ok.perform.quote, 'A matrix is a rectangular array of numbers arranged in rows and columns.');
  assert.deepEqual(ok.record, { highlight: 'found' });
  const planted = await validate(input('A matrix is a kind of table of words.'), ctx([]));
  assert.deepEqual([planted.perform.op, planted.perform.section, planted.perform.quote, planted.record.highlight], ['wiki', 2, null, 'not_found']);
});

test('C §7f.3: a wiki item on a beat with anchors is refused', async () => {
  assert.match((await validate(input('A matrix is a rectangular array of numbers arranged in rows and columns.'), ctx(['prep.py:1-9']))).error, /background beat/);
});
