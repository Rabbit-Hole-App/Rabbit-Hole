import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { tAccountInputs } from './gen-1-t-account-data.js';
import { references } from './gen-1-t-account-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const sum = amounts => amounts.reduce((total, amount) => total + amount, 0);
const postingCents = postings => postings.map(({ amount }) => Math.round(amount * 100));

function verifyPostings(id, overviewDebits, overviewCredits, fullDebits, fullCredits) {
  const reference = references.find(item => item.id === id);
  for (const [depth, { spec }] of Object.entries(reference.depths)) {
    const debits = postingCents(spec.diagram.debits);
    const credits = postingCents(spec.diagram.credits);
    assert.deepEqual(debits, depth === 'overview' ? overviewDebits : fullDebits);
    assert.deepEqual(credits, depth === 'overview' ? overviewCredits : fullCredits);
    assert.equal(sum(debits), sum(credits), depth);
  }
  return reference.depths.deep.spec.diagram.caption;
}

test('recital venue advances cover the full rental schedule', () => {
  const { dailyRateCents, advances, use } = tAccountInputs.venue;
  const debits = advances.map(item => item.days * dailyRateCents);
  const [rehearsal, recital, cleanup] = use.map(item => item.days * dailyRateCents);
  const overviewCredits = [rehearsal, recital + cleanup];
  const fullCredits = [rehearsal, recital, cleanup];
  const caption = verifyPostings('pool-prepaid-recital-venue', debits, overviewCredits, debits, fullCredits);
  const days = sum(use.map(item => item.days));
  assert.equal(caption, `The ${days} rental days cost ${dailyRateCents / 100} USD each and use all ${sum(debits) / 100} USD of the advances.`);
});

test('robotics supplier payments settle the independently extended invoices', () => {
  const { bills, firstPaymentCents } = tAccountInputs.robotics;
  const [chassis, motors, sensors] = bills.map(item => item.quantity * item.unitCents);
  const total = chassis + motors + sensors;
  const remaining = total - firstPaymentCents;
  const debits = [firstPaymentCents, remaining];
  const caption = verifyPostings('pool-robotics-parts-payable', debits, [chassis, motors + sensors], debits, [chassis, motors, sensors]);
  assert.equal(caption, `${firstPaymentCents / 100} USD paid leaves ${remaining / 100} USD to settle. Both sides total ${total / 100} USD.`);
});

test('orchard packing expenses close after reversing the returned sleeves', () => {
  const { cartons, labels, sleeves, returnedSleeves } = tAccountInputs.orchard;
  const cartonCost = cartons.quantity * cartons.unitCents;
  const labelCost = labels.quantity * labels.unitCents;
  const sleeveCost = sleeves.quantity * sleeves.unitCents;
  const returned = returnedSleeves * sleeves.unitCents;
  const remaining = cartonCost + labelCost + ((sleeves.quantity - returnedSleeves) * sleeves.unitCents);
  const credits = [returned, remaining];
  const caption = verifyPostings('pool-orchard-packing-expense', [cartonCost, labelCost + sleeveCost], credits,
    [cartonCost, labelCost, sleeveCost], credits);
  assert.equal(caption, `The sleeve return reverses ${(returned / 100).toFixed(2)} USD. The closing credit transfers ${(remaining / 100).toFixed(2)} USD to income summary.`);
});

test('each t-account depth is a valid single diagram that renders a zero balance at 408 px', () => {
  for (const reference of references) {
    assert.deepEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
    assert.deepEqual(reference.spec, reference.depths.standard.spec);
    for (const { spec } of Object.values(reference.depths)) {
      assert.deepEqual(parseTutorDiagram(spec), spec);
      assert.equal(spec.diagram.kind, 't-account');
      assert.deepEqual(lintDiagramContent(spec), []);

      const { element, width } = renderTutorDiagram(spec, 408);
      const svg = renderToStaticMarkup(element);
      assert.equal(width, 408);
      assert.match(svg, /Balanced 0\.00/);
      assert.doesNotMatch(svg, /NaN|Infinity/);
    }
  }
});
