// START-1: the number formatter is built on first use; the strings it makes are pinned here so the lazy build cannot change a figure.
import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMinor, sumMinor, toMinor } from './balance-values.js';

test('formatMinor: two decimals, thousands separators and a true minus sign', () => {
  const cases = [[0, '0.00'], [5, '0.05'], [100, '1.00'], [123456, '1,234.56'], [99999999, '999,999.99'], [-5, '\u22120.05'], [-123456, '\u22121,234.56'], [100000000, '1,000,000.00']];
  for (const [minor, text] of cases) assert.equal(formatMinor(minor), text, `formatMinor(${minor})`);
});

test('toMinor and sumMinor round to whole cents', () => {
  assert.equal(toMinor(1.005), 100);
  assert.equal(toMinor(19.99), 1999);
  assert.equal(sumMinor([{ amount: 0.1 }, { amount: 0.2 }]), 30);
});
