// The shared canvas semantic snapshot (agent-coordination/tasks/2026-10-13-shared-canvas-semantics.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardText, semanticFingerprint, semanticSnapshot } from './canvas-semantics.js';
import { flowBoard, treeBoard, withBoxes } from './inline-ai-fixtures.js';

const both = () => { const tree = treeBoard(), flow = flowBoard(); return { shapes: [...tree.shapes, ...flow.shapes], links: [...tree.links, ...flow.links], items: [...tree.items, ...flow.items], blocks: flow.blocks, groups: flow.groups, exchanges: [] }; };
const rect = (id, text, x, y, extra = {}) => ({ id, kind: 'rect', x1: x, y1: y, x2: x + 120, y2: y + 60, text, ...extra });
const arrow = (id, x1, y1, x2, y2, extra = {}) => ({ id, kind: 'arrow', x1, y1, x2, y2, ...extra });
const moved = (board, dx) => ({ ...board, shapes: board.shapes.map(s => ({ ...s, x1: s.x1 + dx, x2: s.x2 + dx })), items: board.items.map(i => ({ ...i, x: i.x + dx })) });

test('the fingerprint holds under a move, a pan, a selection and a focus change', () => {
  const board = both(), base = semanticSnapshot(board).fingerprint;
  assert.equal(semanticSnapshot(moved(board, 37)).fingerprint, base, 'everything moved together: no grouping or relation changed');
  assert.equal(semanticSnapshot(withBoxes(board)).fingerprint, base, 'measured boxes (a pan or a zoom re-measures) change nothing');
  assert.equal(semanticSnapshot(board, { focus: { ids: ['n23'] } }).fingerprint, base, 'a selection (focus) changes nothing');
  assert.equal(semanticSnapshot(board, { focus: { ids: ['code1', 'para'] }, budget: { objects: 3, chars: 100 } }).fingerprint, base, 'nor a budget');
  assert.equal(semanticFingerprint(semanticSnapshot(board)), semanticFingerprint(semanticSnapshot(board, { focus: { ids: ['dash'] } })), 'list order (focus) is not hashed');
});

test('a text or label edit with the same ids and counts changes the fingerprint', () => {
  const board = both(), base = semanticSnapshot(board).fingerprint;
  const words = { ...board, items: board.items.map(i => (i.id === 'code1' ? { ...i, text: i.text.replace('=+', '+=') } : i)) };
  assert.notEqual(semanticSnapshot(words).fingerprint, base);
  const label = { ...board, links: board.links.map(l => (l.id === 'f1' ? { ...l, label: 'press' } : l)) };
  assert.notEqual(semanticSnapshot(label).fingerprint, base);
  const group = { ...board, groups: board.groups.map(g => (g.id === 'grp' ? { ...g, label: 'Orders' } : g)) };
  assert.notEqual(semanticSnapshot(group).fingerprint, base);
});

test('a relation change changes the fingerprint: a new link, a reversed arrow, a drawn arrow moved to another end', () => {
  const board = both(), base = semanticSnapshot(board).fingerprint;
  assert.notEqual(semanticSnapshot({ ...board, links: [...board.links, { id: 'x', from: 'n3', to: 'n7', head: true }] }).fingerprint, base);
  assert.notEqual(semanticSnapshot({ ...board, links: board.links.map(l => (l.id === 'e4-23' ? { ...l, from: 'n23', to: 'n4' } : l)) }).fingerprint, base);
  const drawn = { shapes: [rect('a', 'A', 0, 0), rect('b', 'B', 300, 0), rect('c', 'C', 300, 200), arrow('ab', 120, 30, 300, 30)], items: [], links: [], blocks: [], groups: [] };
  const before = semanticSnapshot(drawn), after = semanticSnapshot({ ...drawn, shapes: drawn.shapes.map(s => (s.id === 'ab' ? { ...s, x2: 300, y2: 230 } : s)) });
  assert.deepEqual(before.relations.map(r => [r.from, r.to]), [['a', 'b']]);
  assert.deepEqual(after.relations.map(r => [r.from, r.to]), [['a', 'c']]);
  assert.notEqual(after.fingerprint, before.fingerprint);
  const nudged = semanticSnapshot({ ...drawn, shapes: drawn.shapes.map(s => (s.id === 'ab' ? { ...s, x2: 305, y2: 34 } : s)) });
  assert.equal(nudged.fingerprint, before.fingerprint, 'an arrow end nudged within the same shape changes nothing');
});

test('connectors, annotations and drawn arrows are told apart; direction and labels are kept; doubt is kept', () => {
  const board = {
    shapes: [rect('q', 'Valid?', 0, 0), rect('yes', 'Save', 300, 0), rect('no', 'Retry', 0, 200), rect('top', 'Top', 600, 0), rect('over', 'Overlap', 610, 10),
      arrow('a1', 120, 30, 300, 30), arrow('a2', 60, 200, 60, 60, { kind: 'line', startHead: 'none', endHead: 'arrow' }), arrow('a3', 420, 30, 615, 30),
      arrow('back', 300, 50, 120, 50, { startHead: 'arrow', endHead: 'none' }), arrow('both', 60, 60, 300, 50, { startHead: 'arrow', endHead: 'arrow' }),
      { id: 'note', kind: 'sticky', x1: 0, y1: 0, x2: 0, y2: 0 }],
    items: [{ id: 'lbl', kind: 'text', x: 190, y: 14, w: 40, text: 'yes' }, { id: 'name', kind: 'text', x: 0, y: 62, w: 80, text: 'Decision' }],
    links: [{ id: 'c1', from: 'q', to: 'top', head: true, label: 'flows' }, { id: 'n1', from: 'note', to: 'q', kind: 'annotation', head: true }, { id: 'n2', from: 'yes', to: 'q', inline: { requestId: 'r' } }],
    blocks: [], groups: [],
  };
  const s = semanticSnapshot(board);
  const rel = id => s.relations.find(r => r.id === id);
  assert.deepEqual([rel('c1').source, rel('c1').directed, rel('c1').label], ['connector', true, 'flows']);
  assert.equal(rel('n1').source, 'annotation', 'an annotation link, by kind');
  assert.equal(rel('n2').source, 'annotation', 'an annotation link, by inline metadata');
  assert.deepEqual([rel('a1').source, rel('a1').from, rel('a1').to, rel('a1').directed], ['inferred', 'q', 'yes', true]);
  assert.equal(rel('a1').label, 'yes', 'the short text at the arrow middle is its label');
  assert.ok(rel('a1').confidence > 0 && rel('a1').confidence <= 1);
  assert.deepEqual([rel('a2').from, rel('a2').to], ['no', 'q'], 'drawn direction kept: from the tail to the head');
  assert.deepEqual([rel('back').from, rel('back').to, rel('back').directed], ['q', 'yes', true], 'a head at the start points at the start');
  assert.equal(rel('both').directed, false, 'two heads: no single direction, not parent and child');
  assert.ok(rel('a3').confidence < rel('a1').confidence, 'an end over two overlapping shapes keeps its doubt');
  assert.equal(s.objects.find(o => o.id === 'name').labelOf, 'q', 'a short text touching one shape is its label');
  assert.equal(s.objects.find(o => o.id === 'lbl').labelOf, undefined, 'an arrow label labels the arrow, not a shape');
});

test('focus first, then its neighbours, then the rest - and it survives a tight budget, with the cut counted', () => {
  const board = both();
  const s = semanticSnapshot(board, { focus: { ids: ['n23'] }, budget: { objects: 3, chars: 8000 } });
  const ids = [...s.cards, ...s.objects].map(e => e.id);
  assert.equal(s.objects[0].id, 'n23', 'the focus survives, first');
  assert.ok(ids.includes('n4'), 'its connected neighbour survives');
  assert.equal(ids.length, 3);
  const total = semanticSnapshot(board, { budget: { objects: 1000, chars: 100000 } });
  assert.equal(s.omitted.objects, total.cards.length + total.objects.length - 3, 'every object the cut left out is counted');
  assert.ok(s.relations.every(r => ids.includes(r.from) && ids.includes(r.to)));
  const tight = semanticSnapshot(board, { focus: { ids: ['code1'] }, budget: { objects: 80, chars: 20 } });
  assert.equal(tight.objects[0].id, 'code1');
  assert.equal(tight.objects[0].text.length, 20);
  assert.ok(tight.omitted.chars > 0, 'clipped characters are counted');
});

test('cards: their title and words, never a hidden answer; sections from headings; groups with members; no canvas title', () => {
  const board = {
    shapes: [], items: [], links: [], groups: [{ id: 'g', label: 'Set A' }],
    blocks: [
      { id: 'h1', type: 'heading', level: 1, text: 'Hash maps' },
      { id: 'q1', type: 'quiz', question: 'Average lookup?', options: [{ key: 'A', text: 'O(1)', correct: true }, { key: 'B', text: 'O(n)' }], groupId: 'g' },
      { id: 'f1', type: 'flashcards', cards: [{ front: 'Load factor', back: 'SECRET-BACK' }] },
      { id: 'c1', type: 'code', title: 'Sum', brief: 'Add them', setup: 'xs = [1]', starter: 'def f(xs):', solution: 'SECRET-SOLUTION' },
      { id: 'ch', type: 'challenge', prompt: 'Why O(1)?', expects: ['SECRET-EXPECTS'] },
    ],
    exchanges: [{ id: 'x1', question: 'What is a bucket?', answer: 'A slot.' }],
    title: 'Linked List',
  };
  const s = semanticSnapshot(board);
  const text = JSON.stringify(s);
  for (const secret of ['SECRET-BACK', 'SECRET-SOLUTION', 'SECRET-EXPECTS', 'correct', 'Linked List']) assert.ok(!text.includes(secret), secret);
  assert.match(s.cards.find(c => c.id === 'q1').text, /O\(1\)[\s\S]*O\(n\)/);
  assert.equal(s.cards.find(c => c.id === 'q1').sectionId, 'h1');
  assert.deepEqual(s.groups, [{ id: 'g', title: 'Set A', memberIds: ['q1'] }]);
  assert.deepEqual(s.cards.find(c => c.id === 'x1'), { id: 'x1', type: 'chat', title: 'What is a bucket?', text: 'What is a bucket?\nA slot.', groupId: null, sectionId: null });
  assert.match(cardText(board.blocks[3]), /def f\(xs\):/);
});
