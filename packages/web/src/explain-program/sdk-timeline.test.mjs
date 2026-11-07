import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFrame } from './contract.js';
import { normalizeFrame } from './frame.js';
import { SDK_SOURCE } from './sdk.js';
import { TIMELINE_SOURCE } from './sdk-timeline.js';

const sdk = new Function(`${SDK_SOURCE}\n${TIMELINE_SOURCE}\nreturn sdk;`)();
const lanes = [
  { id: 'phase', label: 'Phase', events: [{ id: 'a', at: 0, label: 'Start' }, { id: 'b', at: 5, label: 'Transfer', role: 'output' }] },
  { id: 'input', label: 'Input', events: [{ id: 'a', at: 10, label: 'End' }] },
];
const area = { x: 24, y: 24, w: 520, h: 220, domain: [0, 10], unit: 's', lanes };
const byId = (objects, id) => objects.find(object => object.id === id);

test('timeline plots every lane and event on one numeric scale', () => {
  const objects = sdk.timeline('demo', area);
  const frame = sdk.frame(objects, { width: 580, height: 270 });
  assert.equal(parseFrame(frame).ok, true);
  const normalized = normalizeFrame(frame);
  assert.equal(normalized.ok, true, normalized.issue);
  const first = byId(objects, 'demo:e:phase:a');
  const middle = byId(objects, 'demo:e:phase:b');
  const last = byId(objects, 'demo:e:input:a');
  assert.equal(middle.x, (first.x + last.x) / 2);
  assert.equal(first.y, middle.y);
  assert.ok(first.y < last.y);
  assert.equal(middle.role, 'output');
  for (const value of ['Phase', 'Input', 'Start', 'Transfer', 'End', '0 s', '10 s']) {
    assert.ok(objects.some(object => object.text === value), value);
  }
});

test('moving the timeline cursor changes only the cursor coordinates', () => {
  const at = cursor => sdk.timeline('demo', { ...area, cursor });
  const first = at(0), moved = at(5), end = at(10);
  const isCursor = item => item.id.startsWith('demo:cursor:');
  const cursor = objects => byId(objects, 'demo:cursor:phase');
  assert.deepEqual(first.map(item => item.id), moved.map(item => item.id));
  assert.deepEqual(first.filter(item => !isCursor(item)), moved.filter(item => !isCursor(item)));
  assert.equal(cursor(moved).from.x, (cursor(first).from.x + cursor(end).from.x) / 2);
  assert.equal(cursor(moved).from.x, cursor(moved).to.x);
  assert.equal(cursor(moved).from.y, cursor(first).from.y);
  assert.ok(!sdk.timeline('demo', area).some(isCursor));
  assert.equal(moved.filter(isCursor).length, lanes.length);
  const label = byId(moved, 'demo:e:phase:b:t');
  assert.ok(cursor(moved).from.y > label.y, 'the cursor clears the event label directly above it');
});

test('close events on one lane use distinct text rows', () => {
  const objects = sdk.timeline('demo', { ...area, lanes: [{ id: 'a', label: 'State', events: [
    { id: 'left', at: 4.9, label: 'Ready' }, { id: 'right', at: 5.1, label: 'Done' },
  ] }] });
  const first = byId(objects, 'demo:e:a:left:t');
  const second = byId(objects, 'demo:e:a:right:t');
  assert.ok(Math.abs(first.y - second.y) >= 20);
});

test('timeline refuses malformed lanes and overlong input', () => {
  assert.throws(() => sdk.timeline('demo', { ...area, domain: [3, 1] }), /domain/i);
  assert.throws(() => sdk.timeline('demo', { ...area, cursor: 11 }), /cursor/i);
  assert.throws(() => sdk.timeline('demo', { ...area, unit: 'u'.repeat(17) }), /unit/i);
  assert.throws(() => sdk.timeline('demo', { ...area, lanes: Array(7).fill(lanes[0]) }), /lanes/i);
  assert.throws(() => sdk.timeline('demo', { ...area, lanes: [lanes[0], lanes[0]] }), /duplicate/i);
  const lane = { id: 'one', label: 'Lane' };
  assert.throws(() => sdk.timeline('demo', { ...area, lanes: [{ ...lane, events: [{ id: 'a', at: 11, label: 'Late' }] }] }), /event/i);
  assert.throws(() => sdk.timeline('demo', { ...area, lanes: [{ ...lane, events: [{ id: 'a', at: 1, label: 'A' }, { id: 'a', at: 2, label: 'B' }] }] }), /duplicate/i);
  assert.throws(() => sdk.timeline('demo', { ...area, lanes: [{ ...lane, events: [{ id: 'a', at: 1, label: 'A', role: 'unknown' }] }] }), /role/i);
});
