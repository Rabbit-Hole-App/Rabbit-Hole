import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGraph } from '../src/learn-graph-schema.js';
import { validateBoardPlan } from '../src/learn-board.js';
import { getGraphContext, emitGraphEvent } from '../../web/src/graph-context.js';

const math = { op: 'interactive_plot', id: 'math-example', renderer: 'desmos', concept: 'Linear functions', expressions: [{ id: 'line', expression: 'y=m*x+b' }], parameters: { m: { value: 1, min: -5, max: 5, step: 0.1 }, b: { value: 0 } } };
const chart = { op: 'interactive_plot', id: 'data-example', renderer: 'plotly', concept: 'Illustrative training curve', traces: [{ id: 'a', type: 'line', x: [1, 2, 3], y: [1, 0.5, 0.2] }] };
test('one graph operation accepts mathematical expressions and numeric line/scatter/bar charts', () => {
  assert.equal(validateGraph(math), math);
  for (const type of ['line', 'scatter', 'bar']) assert.equal(validateGraph({ ...chart, traces: [{ ...chart.traces[0], type }] }).renderer, 'plotly');
  const plan = { summary: 'Explore', needsClarification: false, blocks: [math, chart].map(operation => ({ kind: 'graph', text: operation.concept, fromObjectId: null, operation })) };
  assert.equal(validateBoardPlan(plan, { relatedObjects: [] }), plan);
});
test('rejects executable fields, unsupported engines/types, mismatched arrays and invalid bounds', () => {
  for (const value of [
    { ...math, javascript: 'alert(1)' }, { ...math, renderer: 'unknown' }, { ...math, parameters: { m: { value: 10, min: 0, max: 5 } } },
    { ...math, parameters: { m: { value: Infinity } } }, { ...math, xAxis: { min: 5, max: 1 } },
    { ...chart, traces: [{ ...chart.traces[0], y: [1] }] }, { ...chart, traces: [{ ...chart.traces[0], type: 'heatmap' }] },
    { ...chart, expressions: math.expressions }, { ...math, traces: chart.traces },
  ]) assert.throws(() => validateGraph(value));
});
test('live context and structured events use changed values, ranges and selected point', () => {
  const shape = { type: 'interactive-graph', meta: { objectId: 'graph-1' }, props: { spec: math, state: { parameters: { m: 3, b: 1 }, expressions: [{ id: 'line', expression: 'y=m*x+b+1' }], xAxis: { min: -3, max: 8 }, selectedPoint: { x: 2, y: 7 } } } };
  let event;
  const editor = { getShape: () => shape, getContainer: () => ({ dispatchEvent: value => { event = value; } }) };
  const context = getGraphContext(editor, 'shape:test');
  assert.deepEqual(context.parameters, { m: 3, b: 1 });
  assert.deepEqual(context.expressions, ['y=m*x+b+1']);
  assert.deepEqual(context.xAxis, { min: -3, max: 8 });
  emitGraphEvent(editor, 'shape:test', 'graph_parameter_changed', { parameter: 'm', value: 3 });
  assert.equal(event.detail.graphId, 'graph-1');
  assert.equal(event.detail.context.parameters.m, 3);
  assert.equal(event.detail.type, 'graph_parameter_changed');
});
