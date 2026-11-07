import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { balanceLayouts } from './balance-layouts.js';

function rendered(kind, diagram, width = 320) {
  assert.equal(typeof balanceLayouts[kind], 'function', `missing ${kind} layout`);
  const layout = balanceLayouts[kind](diagram, width);
  const svg = renderToStaticMarkup(h('svg', { viewBox: `0 0 ${layout.width} ${layout.height}` }, ...layout.elements));
  const visibleText = svg.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.ok(layout.width >= width && layout.height > 0);
  assert.doesNotMatch(svg, /NaN|Infinity/);
  return { ...layout, svg, visibleText };
}

test('a narrow T-account separates posting sides, totals, and exact debit balance', () => {
  const result = rendered('t-account', {
    account: 'Cash account', unit: 'USD',
    debits: [{ label: 'A long description that must wrap on a small card', amount: 0.1 }, { label: 'Deposit', amount: 0.2 }],
    credits: [{ label: 'Withdrawal', amount: 0.17 }],
  });
  assert.equal(result.width, 320);
  for (const expected of [
    'Cash account', 'USD', 'Debit', 'Credit', 'description', 'Withdrawal',
    'Total debits 0.30', 'Total credits 0.17', 'Debit balance 0.13',
  ]) assert.ok(result.visibleText.includes(expected), expected);
});

test('a T-account reports the balance side and an exact zero balance', () => {
  const a = { account: 'Cash', debits: [{ label: 'Receipt', amount: 0.1 }, { label: 'Second receipt', amount: 0.2 }] };
  const credit = rendered('t-account', { ...a, credits: [{ label: 'Payment', amount: 0.41 }] });
  const balanced = rendered('t-account', { ...a, credits: [{ label: 'Payment', amount: 0.3 }] });
  assert.match(credit.visibleText, /Credit balance 0\.11/);
  assert.match(balanced.visibleText, /Balanced 0\.00/);
});

test('waterfall offsets each signed change from the running balance', () => {
  const result = rendered('waterfall', {
    opening: 0.3, unit: 'USD',
    changes: [{ label: 'Outflow', amount: -0.6 }, { label: 'Inflow', amount: 0.1 }],
  });
  assert.match(result.visibleText, /Opening 0\.30 Outflow −0\.60 Inflow \+0\.10 Closing −0\.20/);
  assert.match(result.visibleText, /USD/);
  const zero = result.elements.find(item => item.props['data-balance-zero'] !== undefined);
  const bars = result.elements.filter(item => item.props['data-balance-step'] !== undefined);
  assert.equal(bars.length, 4);
  const baselineY = Number(zero.props.children.props.points.split(' ')[0].split(',')[1]);
  const [opening, outflow, inflow, closing] = bars.map(item => item.props.children.props);
  const closeTo = (a, b) => assert.ok(Math.abs(a - b) < 0.0001, `${a} != ${b}`);
  closeTo(opening.y + opening.height, baselineY);
  closeTo(outflow.y, opening.y);
  assert.ok(inflow.y > baselineY);
  closeTo(inflow.y + inflow.height, outflow.y + outflow.height);
  closeTo(closing.y, baselineY);
  closeTo(closing.y + closing.height, inflow.y);
});

test('dense waterfall labels get room and all-zero changes keep finite marks', () => {
  const labels = Array.from({ length: 6 }, (_, i) => ({ label: `Reconciliation adjustment ${i + 1}`, amount: 0 }));
  const result = rendered('waterfall', { opening: 0, changes: labels });
  assert.ok(result.width > 320);
  for (const { label } of labels) assert.ok(result.visibleText.includes(label));
  assert.match(result.visibleText, /Closing 0\.00/);
  for (const item of result.elements.filter(element => element.props['data-balance-step'] !== undefined)) {
    assert.equal(item.props.children.type, 'polyline');
  }
});
