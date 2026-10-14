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
