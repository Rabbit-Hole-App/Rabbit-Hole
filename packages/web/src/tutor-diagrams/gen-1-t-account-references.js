import { tAccountExamples } from './gen-1-t-account-data.js';

function reference({ id, account, prompt, keywords, useWhen, example, overview, standard, deep }) {
  const make = ([title, caption], postings) => ({
    spec: { version: 1, diagram: { kind: 't-account', title, account, unit: 'USD', ...postings, caption } },
  });
  const depths = {
    overview: make(overview, example.overview),
    standard: make(standard, example.full),
    deep: make(deep, example.full),
  };
  return { id, lessons: [], prompts: [prompt], keywords, useWhen, spec: depths.standard.spec, depths };
}

const { venue, robotics, orchard } = tAccountExamples;

export const references = [
  reference({
    id: 'pool-prepaid-recital-venue',
    account: 'Prepaid recital venue',
    prompt: 'Show how prepayments for the dance recital venue are used up in a T-account.',
    keywords: ['prepaid recital venue', 'dance recital venue prepayments'],
    useWhen: 'Follow venue advances into a prepaid asset and rental charges out of that account.',
    example: venue,
    overview: ['Pay ahead for the recital venue', 'Rent paid ahead goes on the left. Rent used goes on the right.'],
    standard: ['Recital venue prepayments and rent', 'The advances create a prepaid asset. Rehearsal, recital and cleanup use up the asset.'],
    deep: ['Clear the prepaid recital venue', `The ${venue.days} rental days cost ${venue.dailyRate} USD each and use all ${venue.total} USD of the advances.`],
  }),
  reference({
    id: 'pool-robotics-parts-payable',
    account: 'Robotics parts payable',
    prompt: 'How do the invoices and payments clear the robotics parts payable account?',
    keywords: ['robotics parts payable', 'robotics supplier bill'],
    useWhen: 'Credit the robotics parts payable account for invoices and debit it for the payments that settle it.',
    example: robotics,
    overview: ['The robotics supplier bill', 'The invoices add to what is owed. The payments clear the bill.'],
    standard: ['Invoices and payments for robot parts', 'Invoice credits increase the payable. Payment debits reduce it.'],
    deep: ['Clear the robotics parts payable', `${robotics.firstPayment} USD paid leaves ${robotics.finalPayment} USD to settle. Both sides total ${robotics.total} USD.`],
  }),
  reference({
    id: 'pool-orchard-packing-expense',
    account: 'Orchard packing expense',
    prompt: 'Show how a sleeve return and the period close clear the orchard packing expense account.',
    keywords: ['orchard packing expense', 'orchard packaging return'],
    useWhen: 'Show expenses charged for orchard packaging, the reversal on a supplier return and the remaining expense closed to income summary.',
    example: orchard,
    overview: ['Packing costs at the orchard', 'Packing purchases are on the left. The return and the closing entry go on the right.'],
    standard: ['Post the orchard packing expenses', 'The sleeve return reverses part of the expense. The closing entry transfers the remaining expense to income summary.'],
    deep: ['Close orchard packing expense', `The sleeve return reverses ${orchard.returned.toFixed(2)} USD. The closing credit transfers ${orchard.closingExpense.toFixed(2)} USD to income summary.`],
  }),
];
