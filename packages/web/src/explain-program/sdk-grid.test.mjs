import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeFrame } from './frame.js';
import { SDK_SOURCE } from './sdk.js';
import { GRID_SOURCE } from './sdk-grid.js';

const sdk = new Function(SDK_SOURCE + GRID_SOURCE + '\nreturn sdk;')();
const grid = {
  x: 24, y: 24, w: 340, h: 140,
  rows: [[0.2, 0.8], [0, null]], rowLabels: ['A', 'B'], columnLabels: ['Key 1', 'Key 2'],
};

test('grid lays out labels and values with stable cell IDs as the active cell changes', () => {
  const first = sdk.grid('attention', { ...grid, active: [[0, 1]] });
  const second = sdk.grid('attention', { ...grid, active: [[1, 0]] });
  const byId = (objects, id) => objects.find(object => object.id === 'attention.' + id);
  assert.equal(first.length, 8);
  assert.deepEqual(first.map(object => object.id), second.map(object => object.id));
  assert.equal(byId(first, 'r0c1').role, 'learner');
  assert.equal(byId(second, 'r1c0').text, '0');
  assert.equal(byId(second, 'r1c1').text, undefined);
  assert.equal(byId(first, 'row0').text, 'A');
  assert.equal(byId(first, 'col1').text, 'Key 2');
  for (const objects of [first, second]) assert.equal(normalizeFrame({ width: 400, height: 220, objects }).ok, true);
});

test('grid supports a token strip and bounds its output and layout', () => {
  const objects = sdk.grid('tokens', { x: 0, y: 0, w: 360, h: 38, rows: [['the', 'cat', 'sat']] });
  assert.deepEqual(objects.map(object => object.text), ['the', 'cat', 'sat']);
  const rows = Array.from({ length: 6 }, () => [1, 2, 3, 4, 5, 6]);
  const labels = rows.map((_, index) => String(index));
  assert.equal(sdk.grid('max', { x: 0, y: 0, w: 640, h: 300, rows, rowLabels: labels, columnLabels: labels }).length, 48);
  assert.throws(() => sdk.grid('g', { ...grid, rows: [[1], [2, 3]] }), /rectangular/);
  assert.throws(() => sdk.grid('g', { ...grid, active: [[0, 2]] }), /existing cell/);
  assert.throws(() => sdk.grid('g', { ...grid, rows: [[, 0], [0, 1]] }), /cell value/);
  assert.throws(() => sdk.grid('g', { ...grid, w: 45 }), /more room/);
});

test('readout formats a finite quantity with its unit and fits the same frame contract', () => {
  const options = { x: 30, y: 36, w: 210, h: 38, label: 'Loss', value: 0.276, decimals: 2, unit: 'bits' };
  const objects = sdk.readout('loss', options);
  assert.equal(objects[0].text, 'Loss: 0.28 bits');
  assert.equal(objects[0].role, 'output');
  assert.equal(normalizeFrame({ width: 300, height: 120, objects }).ok, true);
  assert.throws(() => sdk.readout('loss', { ...options, value: Infinity }), /finite/);
  assert.throws(() => sdk.readout('loss', { ...options, decimals: 20 }), /decimals/);
  assert.throws(() => sdk.readout('loss', { ...options, w: 45 }), /more room/);
});
