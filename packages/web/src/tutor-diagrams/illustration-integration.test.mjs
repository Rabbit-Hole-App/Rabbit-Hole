import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { parseTutorDiagram, tutorDiagramVisibleText } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';
import { estimationEvaluationReferences, illustrationReferences, transformerWalkthroughReferences } from './reference-library.js';
import budgets from './illustration-token-budgets.json' with { type: 'json' };
import { predictedToken, vocabulary, vocabularyWeights } from './transformer-walkthrough-data.js';

const tensor = { rows: 1, columns: 2, dimensions: 'Two cells', name: 'Input values', values: [1, 2] };
const flow = { kind: 'flow', title: 'Process data',
  nodes: [{ id: 'a', role: 'process', tensor }, { id: 'b', role: 'outcome', label: 'Return output' }],
  edges: [{ from: 'a', to: 'b' }] };
const relationship = { kind: 'relationship', title: 'Data and output',
  nodes: [{ id: 'a', tensor }, { id: 'b', label: 'Output' }],
  edges: [{ from: 'a', to: 'b', label: 'Supplies data to' }] };
const transformation = { kind: 'transformation', title: 'Rescale data',
  before: { label: 'Input', items: [{ tensor }] }, after: { label: 'Output', items: ['Scaled values'] },
  operation: 'Double each value' };
const stack = { kind: 'block-stack', title: 'Check the values',
  blocks: [{ id: 'a', label: 'Input', diagram: { kind: 'tensor', tensor } },
    { id: 'b', label: 'Checks', diagram: { kind: 'flow', steps: ['Read values', 'Check range'] } }] };
const doc = diagram => ({ version: 1, diagram });

test('the new tensor payload survives parsing, visible text and SVG in each supported host', () => {
  for (const diagram of [flow, relationship, transformation, stack, { kind: 'tensor', title: 'Input', tensor }]) {
    const saved = doc(diagram);
    assert.deepEqual(parseTutorDiagram(JSON.stringify(saved)), saved);
    assert.deepEqual(lintDiagramContent(saved), []);
    assert.ok(tutorDiagramVisibleText(saved).includes(tensor.dimensions));
    const { element, width } = renderTutorDiagram(saved, 960);
    assert.equal(width, 960);
    const svg = renderToStaticMarkup(element);
    assert.match(svg, /Two cells/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|\[object Object\]/);
  }
});

test('nested payloads and architecture panels keep semantic validation and fixed layout bounds', () => {
  const panel = { kind: 'comparison', title: 'Compare designs', variant: 'panels', panels: [
    { heading: 'First', diagram: stack },
    { heading: 'Second', diagram: { ...stack, blocks: [stack.blocks[0], { ...stack.blocks[1], role: 'changed' }] } },
  ] };
  assert.deepEqual(parseTutorDiagram(doc(panel)), doc(panel));
  assert.deepEqual(lintDiagramContent(doc(panel)), []);
  assert.throws(() => parseTutorDiagram(doc({ ...flow, nodes: [{ id: 'a', role: 'process' }, flow.nodes[1]] })));
  assert.throws(() => parseTutorDiagram(doc({ ...stack, blocks: [{ ...stack.blocks[0], diagram: stack }, stack.blocks[1]] })));
  const invalidTensor = { ...tensor, values: [1] };
  assert.throws(() => parseTutorDiagram(doc({ ...relationship, nodes: [{ id: 'a', tensor: invalidTensor }, relationship.nodes[1]] })));
});

test('illustration and walkthrough references pass the content contract and per-visual token budget', () => {
  assert.equal(illustrationReferences.length, 7);
  assert.equal(transformerWalkthroughReferences.length, 10);
  assert.equal(budgets.encoding, 'cl100k_base');
  assert.equal(budgets.maxSpecTokens, 300);
  for (const ref of new Set([...illustrationReferences, ...transformerWalkthroughReferences, ...estimationEvaluationReferences])) {
    const variants = { balanced: ref, brief: ref.depths?.overview, detailed: ref.depths?.deep };
    for (const [depth, variant] of Object.entries(variants)) {
      if (!variant) continue;
      const { spec, detailSpec } = variant;
      const visuals = detailSpec ? [spec, detailSpec] : [spec];
      for (const visual of visuals) {
        assert.deepEqual(parseTutorDiagram(visual), visual, ref.id);
        assert.deepEqual(lintDiagramContent(visual), [], ref.id);
      }
      const measured = budgets.refs[ref.id][depth];
      const json = JSON.stringify(detailSpec ? visuals : spec);
      assert.equal(measured.sha256, createHash('sha256').update(json).digest('hex'), ref.id);
      const entries = detailSpec ? measured.visuals : [measured];
      assert.equal(entries.length, visuals.length, ref.id);
      for (const [index, entry] of entries.entries()) {
        assert.equal(entry.sha256, createHash('sha256').update(JSON.stringify(visuals[index])).digest('hex'), ref.id);
        // The older Gemma figure carries six explicit roles in its inset flows.
        const limit = ref.id === 'ml-gemma-decoder-stack' && depth === 'detailed' && index === 0 ? 320 : budgets.maxSpecTokens;
        assert.equal(entry.maxSpecTokens ?? budgets.maxSpecTokens, limit, ref.id);
        assert.ok(entry.tokens > 0 && entry.tokens <= limit, ref.id);
      }
    }
  }
});

test('embedding strips use one consistent value treatment at every depth', () => {
  const reference = transformerWalkthroughReferences.find(ref => ref.id === 'ml-transformer-token-embeddings');
  for (const { spec: { diagram } } of [reference, reference.depths.overview, reference.depths.deep]) {
    assert.equal(diagram.blocks.length, 6);
    const tensors = diagram.blocks.map(block => block.diagram.tensor);
    assert.ok(tensors.every(tensor => tensor.columns === 4));
    const valued = tensors.filter(tensor => tensor.values);
    assert.ok(valued.length === 0 || valued.length === tensors.length, 'all six strips use the same value treatment');
  }
});

// TOK-W: the cells keep their natural width, so a row of six blocks that passes the budget (the request, at least 720, at most 960) wraps at a block boundary: blocks per row at a 320 and at a 960 request.
const blockRows = { 'ml-transformer-token-embeddings': ['3+3', '5+1'], 'ml-transformer-weighted-values': ['4+2', '6'], 'ml-transformer-vocabulary-softmax': ['6', '6'] };
const rowsOf = (spec, width) => {
  const counts = new Map();
  for (const [, y] of renderToStaticMarkup(renderTutorDiagram(spec, width).element).matchAll(/data-block-stack-node="[^"]+"[^>]*><rect[^>]*? y="([\d.]+)"/g)) counts.set(y, (counts.get(y) ?? 0) + 1);
  return [...counts.values()].join('+');
};
test('the walkthrough token, value and vocabulary sequences keep native cells and wrap at block boundaries at every depth', () => {
  const ids = ['ml-transformer-token-embeddings', 'ml-transformer-weighted-values', 'ml-transformer-vocabulary-softmax'];
  for (const id of ids) {
    const ref = transformerWalkthroughReferences.find(reference => reference.id === id);
    for (const variant of [ref.depths.overview, ref, ref.depths.deep]) {
      const spec = [variant.spec, variant.detailSpec].find(item => item?.diagram.orientation === 'horizontal');
      assert.ok(spec, id);
      const { diagram } = spec;
      assert.equal(diagram.blocks.length, 6, id);
      const { width } = renderTutorDiagram(spec, 320);
      assert.ok(width > 320 && width <= 960, id);
      const [narrow, wide] = blockRows[id];
      // The vocabulary overview is the one figure that still fits one row at 320; its balanced and deep depths take five and one.
      const expectedNarrow = id === 'ml-transformer-vocabulary-softmax' && variant !== ref.depths.overview ? '5+1' : narrow;
      assert.equal(rowsOf(spec, 320), expectedNarrow, `${id} rows at 320`);
      assert.equal(rowsOf(spec, 960), wide, `${id} rows at 960`);
      if (id !== 'ml-transformer-vocabulary-softmax') continue;
      assert.deepEqual(diagram.blocks.map(block => block.label), vocabulary);
      assert.deepEqual(diagram.blocks.map(block => block.diagram.tensor.values[0]), vocabularyWeights);
      assert.equal(diagram.blocks.find(block => block.role === 'output').label, predictedToken);
    }
  }
});

// GEM-1: the nested-flow node minimum (180) is below what the Gemma stack needs, so the diagram is wider than a card and scrolls; owner accepted that for this release (18:55), the node minimum is recorded for after it.
test('the detailed Gemma uses numbered notes at 320 and four margin leaders at 960; in the 440 card (408 of room) it is 598 wide and scrolls', () => {
  const gemma = illustrationReferences.find(ref => ref.id === 'ml-gemma-decoder-stack').depths.deep;
  const small = renderTutorDiagram(gemma.spec, 320);
  assert.equal(small.width, 418, 'drawn at 418 for a 320 room: it scrolls');
  const ledger = renderToStaticMarkup(small.element);
  assert.equal((ledger.match(/data-block-stack-callout-row=/g) ?? []).length, 4);
  assert.doesNotMatch(ledger, /data-block-stack-callout-leader/);
  const card = renderTutorDiagram(gemma.spec, 408);
  assert.equal(card.width, 598, 'the drawn width at the 408 of room of a card: wider than the room, so it scrolls');
  assert.equal((renderToStaticMarkup(card.element).match(/data-block-stack-callout-leader=/g) ?? []).length, 4);
  const wide = renderTutorDiagram(gemma.spec, 960);
  assert.equal(wide.width, 960);
  const margin = renderToStaticMarkup(wide.element);
  assert.equal((margin.match(/data-block-stack-callout-leader=/g) ?? []).length, 4);
  assert.equal((margin.match(/data-block-stack-callout-value=/g) ?? []).length, 4);
  assert.match(margin, /Visual 2/);
  assert.match(renderToStaticMarkup(renderTutorDiagram(gemma.detailSpec, 960).element), /data-block-stack-merge="multiply"/);
});
