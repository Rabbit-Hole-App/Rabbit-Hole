import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { parseTutorDiagram, tutorDiagramVisibleText } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';
import { illustrationReferences } from './reference-library.js';
import budgets from './illustration-token-budgets.json' with { type: 'json' };

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

test('the seven references and their depth variants pass the content contract and compact token budget', () => {
  assert.equal(illustrationReferences.length, 7);
  assert.equal(budgets.encoding, 'cl100k_base');
  assert.equal(budgets.maxSpecTokens, 300);
  for (const ref of illustrationReferences) {
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
      assert.ok(measured.tokens > 0 && measured.tokens <= 300, ref.id);
    }
  }
});

test('the detailed Gemma uses numbered notes at 320 and four margin leaders at 960', () => {
  const gemma = illustrationReferences.find(ref => ref.id === 'ml-gemma-decoder-stack').depths.deep;
  const small = renderTutorDiagram(gemma.spec, 320);
  assert.equal(small.width, 320);
  const ledger = renderToStaticMarkup(small.element);
  assert.equal((ledger.match(/data-block-stack-callout-row=/g) ?? []).length, 4);
  assert.doesNotMatch(ledger, /data-block-stack-callout-leader/);
  const card = renderTutorDiagram(gemma.spec, 408);
  assert.ok(card.width > 408 && card.width <= 960);
  assert.equal((renderToStaticMarkup(card.element).match(/data-block-stack-callout-leader=/g) ?? []).length, 4);
  const wide = renderTutorDiagram(gemma.spec, 960);
  assert.equal(wide.width, 960);
  const margin = renderToStaticMarkup(wide.element);
  assert.equal((margin.match(/data-block-stack-callout-leader=/g) ?? []).length, 4);
  assert.equal((margin.match(/data-block-stack-callout-value=/g) ?? []).length, 4);
  assert.match(margin, /Visual 2/);
  assert.match(renderToStaticMarkup(renderTutorDiagram(gemma.detailSpec, 960).element), /data-block-stack-merge="multiply"/);
});
