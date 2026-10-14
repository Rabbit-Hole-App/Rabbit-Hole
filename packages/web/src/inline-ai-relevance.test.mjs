// Owner task 2026-10-13 (inline context), points 2-5: the context of a selection is chosen by relevance - its diagram,
// labels, heading or section, the text around it, discussion of it and shared terms - never closeness alone and never
// the whole canvas; the canvas title is metadata; supporting material is read-only. The cases are CONTEXT_CASES
// (inline-ai-fixtures.js): the original tree is one of six unrelated boards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, createContextCache, freezeTarget } from './inline-ai-context.js';
import { validateEdit } from './inline-ai-apply.js';
import { CONTEXT_CASES, withBoxes } from './inline-ai-fixtures.js';

const contextOf = (name, { request = CONTEXT_CASES[name].prompt, board = withBoxes(CONTEXT_CASES[name].board()), target = CONTEXT_CASES[name].target, ...options } = {}) => {
  const frozen = freezeTarget(board, target, options);
  return { board, frozen, context: buildContext(board, frozen, { cache: createContextCache(), boardKey: name, request, extras: { title: CONTEXT_CASES[name].title }, ...options }) };
};
const supporting = context => context.related.map(entry => entry.id);

for (const [name, spec] of Object.entries(CONTEXT_CASES)) {
  test(`${name}: the context has what explains the selection and nothing unrelated, however near`, () => {
    const { context } = contextOf(name);
    const ids = supporting(context);
    for (const id of spec.expect) assert.ok(ids.includes(id) || context.target.ids.includes(id), `${id} belongs in the context of ${spec.target}`);
    for (const id of spec.never) assert.ok(!ids.includes(id), `${id} is unrelated to ${spec.target}`);
    assert.ok(context.considered > ids.length, 'it chose from the canvas; it never claims to be all of it');
  });
}

test('relevance, not distance: a far note that names the function is in, the note right beside it is not', () => {
  const { context } = contextOf('code');
  const spec = context.related.find(entry => entry.id === 'spec');
  assert.equal(spec.relation, 'mentions');
  assert.ok(spec.at.x > 1000, 'far away on the canvas');
  assert.ok(!supporting(context).includes('lunch'), 'right beside the code, and unrelated');
});

test('the text read before and after a paragraph, and the heading it sits under', () => {
  const { context } = contextOf('text');
  const of = id => context.related.find(entry => entry.id === id);
  assert.deepEqual([of('p1').relation, of('p1').order, of('p3').relation, of('p3').order], ['flow', 'before', 'flow', 'after']);
  assert.equal(of('h').relation, 'heading');
});

test('a card in a group: its group mates, the group, the section heading above it - not the next section', () => {
  const { context } = contextOf('card');
  assert.equal(context.target.group.label, 'Divide and conquer');
  assert.equal(context.related.find(entry => entry.id === 'quick').relation, 'group');
  assert.equal(context.related.find(entry => entry.id === 'sorting').relation, 'heading');
  assert.ok(!supporting(context).some(id => id === 'bfs' || id === 'graphs'));
});

test('a diagram of plain shapes and drawn arrows: direction and labels kept, an unsure end said, no parent-child', () => {
  const { context } = contextOf('flowchart');
  const between = (a, b) => context.relations.find(r => (r.from === a && r.to === b) || (r.from === b && r.to === a)) || context.connections.find(r => r.other === a || r.other === b);
  const yes = context.relations.find(r => r.from === 'decide' && r.to === 'allow');
  assert.ok(yes, 'decide -> allow, the arrow drawn from the diamond');
  assert.deepEqual([yes.directed, yes.source, yes.label], [true, 'inferred', 'yes'], 'its label is the text at its middle');
  assert.equal(yes.uncertain, true, 'its head lands where two shapes overlap: the reading is unsure, and says so');
  const read = context.relations.find(r => r.from === 'read' && r.to === 'decide');
  assert.deepEqual([read.directed, read.source, read.uncertain], [true, 'inferred', undefined]);
  assert.ok(!JSON.stringify(context).includes('parent'), 'nothing is called a parent or a child');
  assert.ok(between('start', 'read'), 'the step before, two arrows up');
});

test('the canvas title is metadata: it never pulls in the other topic, and it is labelled as such', () => {
  const { context } = contextOf('topics');
  assert.deepEqual(context.metadata, { canvasTitle: 'Linked List' });
  assert.equal(context.broader, undefined);
  assert.ok(!supporting(context).some(id => ['ll1', 'll2', 'll3', 'llTitle'].includes(id)), 'the linked list on the same canvas is another topic');
  assert.equal(context.related.find(entry => entry.id === 'treeTitle').relation, 'heading', 'the heading over the tree names its topic');
  // The learner's own words decide: asking about the list brings it in.
  const asked = contextOf('topics', { request: 'How is this different from a linked list node?' }).context;
  assert.ok(supporting(asked).includes('llTitle'));
});

test('understanding grows, permission does not: supporting objects are in the context, and an edit to one is refused', () => {
  const { board, frozen, context } = contextOf('code');
  assert.ok(supporting(context).includes('spec'));
  const checked = validateEdit({ summary: 'rename', ops: [{ op: 'replace_text', id: 'spec', text: 'cart_total() adds up...' }, { op: 'replace_text', id: 'code', text: 'def cart_total(prices):\n    return sum(prices)' }] }, frozen, board);
  assert.equal(checked.ok, false);
  assert.match(checked.errors.join(' '), /spec is outside the selection/);
});

test('selection only still means the selection alone', () => {
  const { context } = contextOf('code', { selectionOnly: true });
  assert.deepEqual(supporting(context), []);
  assert.deepEqual(context.relations, []);
});

// Real run 2026-10-13 (after): with the whole group selected, as the canvas selects a grouped card, "before" in Quick
// sort's words pulled in Breadth-first search from the next section. Common words never make two things related.
test('a selected group: a shared common word ("before") never pulls in the next section', () => {
  const { context } = contextOf('card', { target: ['merge', 'quick'] });
  assert.ok(!supporting(context).some(id => id === 'bfs' || id === 'graphs'), supporting(context).join(','));
  assert.ok(supporting(context).includes('sorting'));
});

// Owner brief 2026-10-13, creation §2-§4: no selection - an insertion anchor; the same builder, seeded by the region.
import { buildCreationContext, regionSummary } from './inline-ai-context.js';
const creationOf = (board, anchor, request = 'Add an explanation here', style = null) => buildCreationContext(withBoxes(board), anchor, { cache: createContextCache(), boardKey: 'c', request, extras: { title: 'Linked List' }, style });

test('creation beside a diagram: the region and its diagram are the subject; far unrelated material is not; nothing is a target', () => {
  const context = creationOf(CONTEXT_CASES.tree.board(), { x: 760, y: 392 });
  assert.equal(context.creation, true);
  assert.deepEqual(context.target.ids, []);
  const ids = context.related.map(entry => entry.id);
  assert.ok(ids.includes('n23') && ids.includes('n4'), ids.join(','));
  assert.ok(!ids.includes('clutter'), 'the note far below is not about this region');
  assert.deepEqual(context.metadata, { canvasTitle: 'Linked List' }, 'the title stays metadata');
});

test('creation on a blank canvas: no supporting material, nothing weighed; the request and the default look decide', () => {
  const context = creationOf({ shapes: [], items: [], links: [], blocks: [], groups: [], exchanges: [] }, { x: 0, y: 0 }, 'Draw the water cycle');
  assert.deepEqual([context.related.length, context.considered], [0, 0]);
  assert.match(regionSummary(context), /empty canvas/);
});

test('creation: a new topic in the request reaches distant material that shares its terms; the region still reads as region', () => {
  const context = creationOf(CONTEXT_CASES.code.board(), { x: 700, y: 120 }, 'Explain photosynthesis in plants');
  const photo = context.related.find(entry => entry.id === 'photo');
  assert.equal(photo?.relation, 'mentions');
});

test('creation: subject and style travel apart, and the validator gets a compact region summary, never the package', () => {
  const style = { kind: 'ellipse', color: '#37352f', fill: null, font: 'sans', fontSize: 14, route: 'straight', from: 6 };
  const context = creationOf(CONTEXT_CASES.tree.board(), { x: 760, y: 392 }, 'Add a node', style);
  assert.deepEqual(context.style, style);
  assert.ok(!context.related.some(entry => 'style' in entry), 'style is never mixed into the subject entries');
  const summary = regionSummary(context);
  assert.ok(summary.length <= 1500);
  assert.match(summary, /near the insertion point: .*"23"/);
  assert.match(summary, /style: kind ellipse/);
});
