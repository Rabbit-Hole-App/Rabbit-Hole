import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFrame } from './frame.js';
import { SDK_SOURCE } from './sdk.js';
import { TRACE_SOURCE } from './sdk-trace.js';

const sdk = new Function(`${SDK_SOURCE}\n${TRACE_SOURCE}\nreturn sdk;`)();
const area = { x: 16, y: 16, w: 620, h: 330, domain: [0, 100], unit: 'ms' };
const lanes = [
  { id: 'tools', label: 'Tools', spans: [
    { id: 'search', label: 'Search', start: 0, end: 40, detail: 'Fetched source records' },
    { id: 'parse', label: 'Parse', start: 10, end: 30, parent: 'search' },
    { id: 'retry', label: 'Retry', start: 40, end: 60, dependsOn: ['search'] },
  ] },
  { id: 'answer', label: 'Answer', spans: [
    { id: 'write', label: 'Write', start: 40, end: 100, dependsOn: ['search'] },
  ] },
];
const draw = options => sdk.trace('run', { ...area, lanes, ...options });
const byId = (objects, suffix) => objects.find(object => object.id === `run:${suffix}`);

test('trace puts parallel calls on one clock and stacks overlapping spans on a lane', () => {
  const objects = draw({ cursor: 40 });
  const result = normalizeFrame(sdk.frame(objects, { width: 660, height: 362 }));
  assert.equal(result.ok, true, result.issue);
  const search = byId(objects, 'span:search');
  const parse = byId(objects, 'span:parse');
  const retry = byId(objects, 'span:retry');
  const write = byId(objects, 'span:write');
  assert.equal(search.x + search.w, write.x);
  assert.equal(retry.x, write.x);
  assert.equal(parse.w, search.w / 2);
  assert.notEqual(parse.y, search.y);
  assert.equal(retry.y, search.y);
  assert.equal(byId(objects, 'cursor').from.x, write.x);
  assert.equal(byId(objects, 'dep:search:write').to.x, write.x);
});

test('selecting a span exposes its original time and detail with stable target geometry', () => {
  const original = draw();
  const selected = draw({ selected: 'search' });
  assert.deepEqual(byId(selected, 'span:search'), { ...byId(original, 'span:search'), role: 'learner' });
  for (const text of ['Search', '0 to 40 ms · 40 ms elapsed', 'Fetched source records']) {
    assert.ok(selected.some(object => object.text === text), text);
  }
  assert.equal(byId(draw({ selected: 'parse' }), 'detail:context').text, 'Within Search');
});

test('trace rejects invalid intervals, links, and selection', () => {
  const bad = changes => ({ lanes: [{ ...lanes[0], spans: [{ ...lanes[0].spans[0], ...changes }] }] });
  assert.throws(() => draw(bad({ end: 0 })), /interval/);
  assert.throws(() => draw(bad({ end: 101 })), /interval/);
  assert.throws(() => draw(bad({ parent: 'missing' })), /parent/);
  assert.throws(() => draw(bad({ dependsOn: ['search'] })), /depend/);
  assert.throws(() => draw({ selected: 'missing' }), /selected/);
  assert.throws(() => draw({ cursor: 101 }), /cursor/);
});
