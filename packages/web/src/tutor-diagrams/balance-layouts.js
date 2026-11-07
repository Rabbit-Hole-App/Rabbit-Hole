import { createElement as h } from 'react';
import { formatMinor, sumMinor, toMinor } from './balance-values.js';
import { box, connector, label, lineHeight, textWidth, wrap } from './primitives.js';

const PAD = 12;
const SMALL = 13;
const STEP = lineHeight(SMALL);

function longestWord(text) {
  return Math.max(...text.split(/\s+/u).map(word => textWidth(word, SMALL)));
}

function postingText(posting, width) {
  if (!posting) return null;
  const amount = formatMinor(toMinor(posting.amount));
  const labelWidth = width - 20 - textWidth(amount, SMALL) - 10;
  const stacked = labelWidth < Math.max(60, longestWord(posting.label));
  const lines = wrap(posting.label, stacked ? width - 20 : labelWidth, SMALL);
  return { amount, lines, stacked, height: (lines.length + Number(stacked)) * STEP + 14 };
}

function tAccount({ account, unit, debits, credits }, width) {
  const gap = 12;
  const columnWidth = (width - 2 * PAD - gap) / 2;
  const xAt = index => PAD + index * (columnWidth + gap);
  const accountLines = wrap(unit ? `${account} · ${unit}` : account, width - 2 * PAD, SMALL);
  const accountHeight = accountLines.length * STEP;
  const elements = [label(accountLines, width / 2, PAD + accountHeight / 2, { size: SMALL, weight: 700 })];
  const headerY = PAD + accountHeight + 8;
  for (const [index, heading] of ['Debit', 'Credit'].entries()) {
    const x = xAt(index);
    elements.push(box(x, headerY, columnWidth, 30, { role: index === 0 ? 'process' : 'slate' }));
    elements.push(label(heading, x + columnWidth / 2, headerY + 15, { weight: 700, tone: 'onFill' }));
  }
  const barY = headerY + 36;
  let y = barY + 6;
  for (let index = 0; index < Math.max(debits.length, credits.length); index++) {
    const postings = [postingText(debits[index], columnWidth), postingText(credits[index], columnWidth)];
    const height = Math.max(...postings.map(posting => posting?.height ?? 0));
    for (const [side, posting] of postings.entries()) {
      if (!posting) continue;
      const x = xAt(side);
      const center = y + height / 2;
      const labelCenter = center - (posting.stacked ? STEP / 2 : 0);
      const amountCenter = center + (posting.stacked ? posting.lines.length * STEP / 2 : 0);
      elements.push(box(x, y, columnWidth, height));
      elements.push(label(posting.lines, x + 10, labelCenter, { size: SMALL, anchor: 'start' }));
      elements.push(label(posting.amount, x + columnWidth - 10, amountCenter, { size: SMALL, anchor: 'end', weight: 700 }));
    }
    y += height + 6;
  }

  const debitTotal = sumMinor(debits);
  const creditTotal = sumMinor(credits);
  const totals = [`Total debits ${formatMinor(debitTotal)}`, `Total credits ${formatMinor(creditTotal)}`]
    .map(text => wrap(text, columnWidth - 20, SMALL));
  const totalHeight = Math.max(...totals.map(lines => lines.length)) * STEP + 14;
  for (const [index, lines] of totals.entries()) {
    const x = xAt(index);
    elements.push(box(x, y, columnWidth, totalHeight));
    elements.push(label(lines, x + columnWidth / 2, y + totalHeight / 2, { size: SMALL, weight: 700 }));
  }
  elements.push(connector([[PAD, barY], [width - PAD, barY]], { arrow: false }));
  elements.push(connector([[width / 2, barY], [width / 2, y + totalHeight]], { arrow: false }));
  y += totalHeight + 10;

  const difference = debitTotal - creditTotal;
  const balance = difference === 0 ? 'Balanced' : difference > 0 ? 'Debit balance' : 'Credit balance';
  const balanceLines = wrap(`${balance} ${formatMinor(Math.abs(difference))}`, width - 2 * PAD - 20, SMALL);
  const balanceHeight = balanceLines.length * STEP + 14;
  elements.push(box(PAD, y, width - 2 * PAD, balanceHeight, { role: 'outcome' }));
  elements.push(label(balanceLines, width / 2, y + balanceHeight / 2, { size: SMALL, weight: 700, tone: 'onFill' }));
  return { width, height: y + balanceHeight + PAD, elements };
}

function waterfall({ opening, changes, unit }, requestedWidth) {
  let balance = toMinor(opening);
  const steps = [{ label: 'Opening', start: 0, end: balance, value: formatMinor(balance), role: 'slate' }];
  for (const change of changes) {
    const delta = toMinor(change.amount);
    const start = balance;
    balance += delta;
    steps.push({
      label: change.label, start, end: balance, value: (delta > 0 ? '+' : '') + formatMinor(delta),
      role: delta < 0 ? 'rose' : 'outcome',
    });
  }
  steps.push({ label: 'Closing', start: 0, end: balance, value: formatMinor(balance), role: 'lavender' });

  const left = PAD + 18;
  const minColumn = Math.max(80, ...steps.map(step => Math.ceil(Math.max(
    textWidth(step.value, SMALL), Math.min(126, longestWord(step.label)),
  )) + 10));
  const width = Math.max(requestedWidth, left + minColumn * steps.length + PAD);
  const columnWidth = (width - left - PAD) / steps.length;
  const barWidth = Math.min(54, columnWidth * 0.58);
  const centerAt = index => left + columnWidth * (index + 0.5);
  const units = unit ? wrap(unit, width - left - PAD, SMALL) : [];
  const headerHeight = units.length ? units.length * STEP + 8 : 0;
  const top = PAD + headerHeight;
  const high = Math.max(...steps.flatMap(step => [step.start, step.end]));
  const low = Math.min(...steps.flatMap(step => [step.start, step.end]));
  const span = high - low;
  const chartHeight = span ? 142 : 42;
  const yAt = value => top + (span ? (high - value) / span : 0.5) * chartHeight;
  const zero = yAt(0);
  const elements = units.length
    ? [label(units, left, PAD + units.length * STEP / 2, { anchor: 'start', size: SMALL, tone: 'muted' })]
    : [];
  elements.push(h('g', { 'data-balance-zero': '' }, connector([[left - 3, zero], [width - PAD, zero]], { arrow: false })));
  elements.push(label('0', left - 8, zero, { anchor: 'end', size: SMALL, tone: 'muted' }));

  const names = steps.map(step => wrap(step.label, columnWidth - 10, SMALL));
  const nameHeight = Math.max(...names.map(lines => lines.length)) * STEP;
  const namesY = top + chartHeight + 12;
  for (const [index, step] of steps.entries()) {
    const center = centerAt(index);
    const startY = yAt(step.start);
    const endY = yAt(step.end);
    const x = center - barWidth / 2;
    if (index < steps.length - 1) {
      elements.push(connector([[x + barWidth, endY], [centerAt(index + 1) - barWidth / 2, endY]], { arrow: false, dashed: true }));
    }
    const mark = startY === endY
      ? connector([[x, endY], [x + barWidth, endY]], { arrow: false })
      : box(x, Math.min(startY, endY), barWidth, Math.abs(startY - endY), { role: step.role, radius: 0 });
    elements.push(h('g', { 'data-balance-step': index }, mark));
    elements.push(label(names[index], center, namesY + names[index].length * STEP / 2, { size: SMALL }));
    elements.push(label(step.value, center, namesY + nameHeight + STEP / 2 + 4, { size: SMALL, weight: 700 }));
  }
  return { width, height: namesY + nameHeight + STEP + 4 + PAD, elements };
}

export const balanceLayouts = Object.freeze({
  't-account': tAccount,
  waterfall,
});
