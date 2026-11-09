import assert from 'node:assert/strict';
import test from 'node:test';
import { Children } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { references } from './ml-batch3c-system-serving-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const sequenceId = 'ml-batch-vs-online-inference';
const matrixId = 'ml-serving-latency-cost';
const rolloutId = 'ml-shadow-canary-ab-rollout';
const children = element => Children.toArray(element.props.children);
const labelText = element => children(element).map(line => line.props.children).join(' ');
const numbers = text => Array.from(text.matchAll(/\d+(?:\.\d+)?/g), ([number]) => Number(number));

function referenceFor(id) {
  const reference = references.find(entry => entry.id === id);
  assert.ok(reference, `${id} must be available as an author reference`);
  return reference;
}

test('batch computes and stores scores before requests while online scores each request', () => {
  const { actors, messages } = referenceFor(sequenceId).spec.diagram;
  assert.deepEqual(actors.map(({ id }) => id).sort(), ['app', 'job', 'model', 'store']);
  assert.deepEqual(messages.map(({ from, to }) => [from, to]), [
    ['job', 'model'], ['model', 'job'], ['job', 'store'],
    ['app', 'store'], ['store', 'app'], ['app', 'model'], ['model', 'app'],
  ]);
  const labels = [/snapshot/i, /batch scores/i, /before requests/i, /batch request/i,
    /stored score/i, /online request.*current features/i, /fresh score/i];
  for (const [i, message] of messages.entries()) assert.match(message.label, labels[i]);
});

test('both serving plans meet the same limits and the stated daily totals follow from the rates', () => {
  const { columns, rows, caption } = referenceFor(matrixId).spec.diagram;
  assert.deepEqual(columns, ['Batch', 'Online']);
  const [entities, requests, peakQps, ageLimit, latencyBudget] = numbers(caption);
  assert.deepEqual([entities, requests, peakQps, ageLimit, latencyBudget], [1, 2, 500, 25, 40]);
  assert.match(caption, /1M entities, 2M requests\/day/);
  const cells = Object.fromEntries(rows.map(row => [row.id, row.cells]));
  const [batchCapacity, onlineCapacity] = cells.capacity.map(numbers);
  const [jobHours, refreshHours] = batchCapacity;
  const [replicas, replicaQps] = onlineCapacity;
  const [[scorePrice, readPrice], [replicaPrice]] = cells.prices.map(numbers);
  assert.deepEqual([jobHours, refreshHours, replicas, replicaQps], [1, 24, 3, 200]);
  assert.deepEqual([scorePrice, readPrice, replicaPrice], [0.4, 0.25, 0.5]);
  assert.equal(refreshHours, ageLimit - jobHours);
  assert.equal(replicas, Math.ceil(peakQps / replicaQps));

  const scoringCost = entities * (24 / refreshHours) * scorePrice;
  const lookupCost = requests * readPrice;
  const [batchTotal, onlineTotal] = cells['daily-cost'].map(cell => numbers(cell)[0]);
  assert.equal(batchTotal, scoringCost + lookupCost);
  assert.equal(onlineTotal, replicas * replicaPrice * 24);
  assert.deepEqual([batchTotal, onlineTotal], [0.9, 36]);

  const [batchLatency, onlineLatency] = cells.latency.map(cell => numbers(cell)[0]);
  assert.deepEqual([batchLatency, onlineLatency], [4, 35]);
  assert.ok(batchLatency <= latencyBudget && onlineLatency <= latencyBudget);
  assert.equal(numbers(cells.freshness[0])[0], jobHours + refreshHours);
  assert.match(cells.freshness[1], /current request features/i);
});

test('the rollout comparison separates exposure, decision authority and success criteria', () => {
  const { columns } = referenceFor(rolloutId).spec.diagram;
  assert.deepEqual(columns.map(({ heading }) => heading), ['Shadow', 'Canary', 'A/B test']);
  const expected = [
    [/copy live requests/i, /current model alone decides/i, /error rates and latency/i],
    [/5% of live requests/i, /new model decides for that 5%/i, /roll back.*guardrail/i],
    [/random.*stable groups/i, /assigned model decides/i, /business metric/i],
  ];
  for (const [column, { items }] of columns.entries()) {
    assert.equal(items.length, 3);
    items.forEach((item, row) => assert.match(item, expected[column][row]));
  }
});

test('all three references round-trip as lint-clean Lesson 19 single-scene specs', () => {
  assert.deepEqual(references.map(({ id }) => id).sort(), [sequenceId, matrixId, rolloutId].sort());
  for (const [id, kind, prompt] of [
    [sequenceId, 'sequence', 'How is predicting on a schedule different from predicting when a request comes in?'],
    [matrixId, 'matrix', 'How do I compare the latency and cost of batch and online predictions?'],
    [rolloutId, 'comparison', 'When would I shadow a new model, canary it, or run an A/B test?'],
  ]) {
    const { lessons, prompts, spec } = referenceFor(id);
    assert.deepEqual(lessons, ['19']);
    assert.deepEqual(prompts, [prompt]);
    assert.equal(spec.version, 1);
    assert.equal(spec.diagram.kind, kind);
    assert.deepEqual(parseTutorDiagram(JSON.stringify(spec)), spec);
    assert.deepEqual(lintDiagramContent(spec), [], id);
  }
  assert.equal(referenceFor(matrixId).spec.diagram.layout, 'teaching');
});

test('all serving stages, matrix cells and rollout labels are visible at 320, 408 and 720 px', () => {
  const sequence = referenceFor(sequenceId).spec.diagram;
  const matrix = referenceFor(matrixId).spec.diagram;
  const rollout = referenceFor(rolloutId).spec.diagram;
  for (const [id, expected] of [
    [sequenceId, [...sequence.actors, ...sequence.messages].map(entry => entry.label)],
    [matrixId, [...matrix.columns, ...matrix.rows.flatMap(({ heading, cells }) => [heading, ...cells])]],
    [rolloutId, rollout.columns.flatMap(({ heading, items }) => [heading, ...items])],
  ]) {
    const { spec } = referenceFor(id);
    for (const width of [320, 408, 720]) {
      const { element, width: renderedWidth, height } = renderTutorDiagram(JSON.stringify(spec), width);
      const svg = renderToStaticMarkup(element);
      assert.match(svg, /^<svg .*role="img"/);
      assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
      assert.ok(renderedWidth >= width && Number.isFinite(height) && height > 0);
      const frame = children(element);
      const body = frame.find(part => part.type === 'g');
      const text = children(body).filter(mark => mark.type === 'text').map(labelText);
      assert.deepEqual(text.sort(), [...expected].sort(), `${id} at ${width} px`);
      if (spec.diagram.caption) assert.equal(labelText(frame.at(-1)), spec.diagram.caption);
      if (id === sequenceId) assert.equal([...svg.matchAll(/data-tutor-arrowhead/g)].length, sequence.messages.length);
    }
  }
});
