import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGuestResult, parseManifest } from './contract.js';
import { normalizeFrame } from './frame.js';
import { growthFixture } from './fixtures.js';

// A state readout (manifest readouts[].kind 'state' with labels): the frame reports one of its labels, the card shows it as text.
const state = { id: 'phase', label: 'Motion', kind: 'state', labels: ['Moving up', 'Still for an instant', 'Moving down'] };
const withReadouts = readouts => parseManifest({ ...growthFixture.manifest, readouts });
const box = { kind: 'box', id: 'b', x: 0, y: 0, w: 5, h: 5 };
const frame = readouts => ({ frame: { objects: [box], readouts }, quantities: {} });

test('a readout without kind is a number as before; a state readout lists labels', () => {
  assert.equal(withReadouts([{ id: 'height', label: 'Height', unit: 'm', decimals: 2 }]).ok, true);
  assert.equal(withReadouts([{ id: 'height', label: 'Height', kind: 'number' }]).ok, true);
  assert.equal(withReadouts([state]).ok, true);
  assert.equal(withReadouts([{ ...state, labels: undefined }]).ok, false, 'a state readout needs labels');
  assert.equal(withReadouts([{ ...state, kind: 'number' }]).ok, false, 'only a state readout has labels');
  assert.equal(withReadouts([{ ...state, labels: ['Same', 'Same'] }]).ok, false, 'labels are unique');
  assert.equal(withReadouts([{ ...state, labels: ['Only one'] }]).ok, true, 'a state may have one label (the Overview gravity line is one; 24 of 25 Brief bench attempts failed on a minimum of two)');
  assert.equal(withReadouts([{ ...state, labels: [] }]).ok, false, 'a state has at least one label');
});

test('the frame reports one of the labels, and the card text is that label', () => {
  const manifest = withReadouts([state, { id: 'height', label: 'Height', unit: 'm' }]).value;
  const ok = parseGuestResult(frame([{ id: 'phase', value: 'Still for an instant' }, { id: 'height', value: 4.5 }]), manifest);
  assert.equal(ok.ok, true, ok.issue);
  const shown = normalizeFrame(ok.value.frame, manifest);
  assert.deepEqual(shown.readouts, [{ id: 'phase', label: 'Motion', text: 'Still for an instant', kind: 'state' }, { id: 'height', label: 'Height', text: '4.50 m' }]);
});

test('a label the manifest did not declare, a number for a state, and a string for a number are refused', () => {
  const manifest = withReadouts([state, { id: 'height', label: 'Height', unit: 'm' }]).value;
  for (const readouts of [[{ id: 'phase', value: 'Flying' }], [{ id: 'phase', value: 2 }], [{ id: 'height', value: 'Moving up' }]]) {
    assert.equal(parseGuestResult(frame(readouts), manifest).ok, false, JSON.stringify(readouts));
    assert.equal(normalizeFrame({ objects: [box], readouts }, manifest).ok, false, `normalizeFrame ${JSON.stringify(readouts)}`);
  }
  assert.equal(parseGuestResult(frame([{ id: 'phase', value: 'x'.repeat(41) }]), manifest).ok, false, 'a label is at most 40 characters');
});
