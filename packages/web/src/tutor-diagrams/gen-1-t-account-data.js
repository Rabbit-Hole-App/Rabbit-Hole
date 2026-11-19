// Fictional transactions. Derive the ledger in integer cents before converting for display.
export const tAccountInputs = {
  venue: {
    dailyRateCents: 8000,
    advances: [
      { label: 'Booking advance', days: 1 },
      { label: 'Final advance', days: 3 },
    ],
    use: [
      { label: 'Rehearsal rent', days: 2 },
      { label: 'Recital rent', days: 1 },
      { label: 'Cleanup rent', days: 1 },
    ],
  },
  robotics: {
    bills: [
      { label: 'Chassis invoice', quantity: 2, unitCents: 7500 },
      { label: 'Motor invoice', quantity: 4, unitCents: 3000 },
      { label: 'Sensor invoice', quantity: 3, unitCents: 2000 },
    ],
    firstPaymentCents: 9500,
  },
  orchard: {
    cartons: { quantity: 25, unitCents: 146 },
    labels: { quantity: 10, unitCents: 85 },
    sleeves: { quantity: 30, unitCents: 95 },
    returnedSleeves: 10,
  },
};

const dollars = cents => cents / 100;
const subtotal = entries => entries.reduce((total, entry) => total + entry.cents, 0);
const combine = (label, entries) => ({ label, cents: subtotal(entries) });
const cost = ({ quantity, unitCents }) => quantity * unitCents;
const toAmounts = entries => entries.map(({ label, cents }) => ({ label, amount: dollars(cents) }));

function ledger(debits, credits) {
  return { debits: toAmounts(debits), credits: toAmounts(credits) };
}

const { venue, robotics, orchard } = tAccountInputs;
const rentalPostings = entries => entries.map(({ label, days }) => ({ label, cents: days * venue.dailyRateCents }));
const advances = rentalPostings(venue.advances);
const rentalCharges = rentalPostings(venue.use);
const [rehearsal, ...recitalAndCleanup] = rentalCharges;

const bills = robotics.bills.map(item => ({ label: item.label, cents: cost(item) }));
const finalPaymentCents = subtotal(bills) - robotics.firstPaymentCents;
const payments = [
  { label: 'First payment', cents: robotics.firstPaymentCents },
  { label: 'Final payment', cents: finalPaymentCents },
];
const [chassis, ...motorsAndSensors] = bills;

const purchases = [
  { label: 'Berry cartons', cents: cost(orchard.cartons) },
  { label: 'Produce labels', cents: cost(orchard.labels) },
  { label: 'Paper sleeves', cents: cost(orchard.sleeves) },
];
const sleevesReturnedCents = orchard.returnedSleeves * orchard.sleeves.unitCents;
const closingExpenseCents = subtotal(purchases) - sleevesReturnedCents;
const expenseCredits = [
  { label: 'Returned sleeves', cents: sleevesReturnedCents },
  { label: 'Close to income summary', cents: closingExpenseCents },
];
const [cartons, ...labelsAndSleeves] = purchases;

export const tAccountExamples = {
  venue: {
    overview: ledger(advances, [rehearsal, combine('Recital and cleanup', recitalAndCleanup)]),
    full: ledger(advances, rentalCharges),
    days: venue.use.reduce((total, entry) => total + entry.days, 0),
    dailyRate: dollars(venue.dailyRateCents),
    total: dollars(subtotal(rentalCharges)),
  },
  robotics: {
    overview: ledger(payments, [chassis, combine('Motors and sensors', motorsAndSensors)]),
    full: ledger(payments, bills),
    firstPayment: dollars(robotics.firstPaymentCents),
    finalPayment: dollars(finalPaymentCents),
    total: dollars(subtotal(bills)),
  },
  orchard: {
    overview: ledger([cartons, combine('Labels and sleeves', labelsAndSleeves)], expenseCredits),
    full: ledger(purchases, expenseCredits),
    returned: dollars(sleevesReturnedCents),
    closingExpense: dollars(closingExpenseCents),
  },
};
