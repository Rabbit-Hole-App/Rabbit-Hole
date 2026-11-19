// Worked examples use fictional observations and planning assumptions.
const sum = values => values.reduce((total, value) => total + value, 0);
const mean = values => sum(values) / values.length;

const openHoursReturns = [18, 25, 17, 19, 21];
const afterHoursReturns = [8, 11, 9, 12, 10];
const afterHoursTotal = sum(afterHoursReturns);
const totalReturns = sum(openHoursReturns) + afterHoursTotal;
const minutesPerPickup = 5;
const pickupMinutes = afterHoursReturns.length * minutesPerPickup;
const closingAllowance = 40;

export const bookReturn = {
  openHoursReturns,
  afterHoursReturns,
  afterHoursTotal,
  totalReturns,
  afterHoursPercent: Math.round(afterHoursTotal * 100 / totalReturns),
  usedEvenings: afterHoursReturns.filter(count => count > 0).length,
  minutesPerPickup,
  pickupMinutes,
  closingAllowance,
  spareMinutes: closingAllowance - pickupMinutes,
};

const initialTemperature = 72;
const elapsedMinutes = 20;
const mugTrials = [
  { felt: 55, bare: 46 },
  { felt: 56, bare: 45 },
  { felt: 54, bare: 47 },
];
const feltMean = mean(mugTrials.map(trial => trial.felt));
const bareMean = mean(mugTrials.map(trial => trial.bare));

export const mugSleeve = {
  initialTemperature,
  elapsedMinutes,
  trials: mugTrials,
  trialCount: mugTrials.length,
  feltLeadCount: mugTrials.filter(({ felt, bare }) => felt > bare).length,
  feltMean,
  bareMean,
  feltLoss: initialTemperature - feltMean,
  bareLoss: initialTemperature - bareMean,
  retainedDifference: feltMean - bareMean,
};

const copies = 40;
const budgetCents = 2800;
const minutesPerInk = 12;
const logoInks = 4;

function printOption(inks, unitCents) {
  return { inks, unitCents, totalCents: unitCents * copies, setupMinutes: inks * minutesPerInk };
}

const reduced = printOption(2, 55);
const original = printOption(logoInks, 95);
const dollars = cents => cents / 100;

export const posterPrint = {
  copies,
  budgetCents,
  minutesPerInk,
  logoInks,
  reduced,
  original,
  budgetDollars: dollars(budgetCents),
  reducedDollars: dollars(reduced.totalCents),
  savedDollars: dollars(original.totalCents - reduced.totalCents),
  savedMinutes: original.setupMinutes - reduced.setupMinutes,
};
