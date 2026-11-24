import { bookReturn, mugSleeve, posterPrint } from './gen-1-argument-data.js';

function argument(title, claim, support, objection, conclusion, caption) {
  return { spec: { version: 1, diagram: {
    kind: 'argument',
    title,
    claim,
    support: support.map(label => ({ label })),
    objections: [{ label: objection }],
    conclusion,
    ...(caption ? { caption } : {}),
  } } };
}

const returnClaim = 'Keep the library’s after-hours book return.';
const evenUse = `Readers used it on all ${bookReturn.usedEvenings} evenings.`;
const pickupCost = `Extra pickups take ${bookReturn.pickupMinutes} minutes a week.`;
const returnDepths = {
  overview: argument('The library’s after-hours return', returnClaim,
    [`Readers returned ${bookReturn.afterHoursTotal} books after closing.`, evenUse],
    'The bin adds a pickup to each closing round.',
    'Keep the bin and reserve time to empty it.'),
  standard: argument('Is the late book return worth the pickup?', returnClaim,
    [`${bookReturn.afterHoursTotal} of ${bookReturn.totalReturns} returns came after closing.`, evenUse],
    pickupCost,
    `Keep the bin. Pickups fit the ${bookReturn.closingAllowance} minutes set aside each week.`),
  deep: argument('After-hours returns and staff time', returnClaim,
    [`About ${bookReturn.afterHoursPercent}% of returns came after closing.`,
      `The closing schedule still has ${bookReturn.spareMinutes} spare minutes.`],
    pickupCost,
    'Keep the bin within the current schedule. Check the pickup time again if demand grows.',
    'This worked example counts all returns during a trial week.'),
};

const sleeveClaim = 'Use a felt sleeve for a short mug break.';
const untestedDuration = `The trial ended at ${mugSleeve.elapsedMinutes} minutes.`;
const sleeveDepths = {
  overview: argument('A felt sleeve for the mug', sleeveClaim,
    [`Felt mugs averaged ${mugSleeve.feltMean} °C. Bare mugs averaged ${mugSleeve.bareMean} °C.`,
      `Felt mugs ended warmer in all ${mugSleeve.feltLeadCount} trials.`],
    'A longer break was untested.',
    'Use the sleeve for a short break.'),
  standard: argument('Does a felt sleeve keep the mug warmer?', sleeveClaim,
    [`Felt mugs ended ${mugSleeve.retainedDifference} °C warmer on average.`,
      `Felt led in ${mugSleeve.feltLeadCount} of ${mugSleeve.trialCount} matched trials.`],
    untestedDuration,
    'Use the sleeve for the tested break. Measure again for longer breaks.'),
  deep: argument('Heat loss in the matched mug trials', sleeveClaim,
    [`Felt mugs lost ${mugSleeve.feltLoss} °C on average.`,
      `Bare mugs lost ${mugSleeve.bareLoss} °C on average.`],
    untestedDuration,
    `Use felt for the tested break. It reduced average heat loss by ${mugSleeve.retainedDifference} °C.`,
    `Both mugs started at ${mugSleeve.initialTemperature} °C in each worked trial.`),
};

const reducedInks = posterPrint.reduced.inks;
const printClaim = `Print the club poster with ${reducedInks} inks.`;
const logoObjection = `The original logo uses ${posterPrint.logoInks} inks.`;
const posterDepths = {
  overview: argument('An ink plan for the club poster', printClaim,
    [`Materials cost ${posterPrint.reducedAmount} USD.`, `Setup takes ${posterPrint.reduced.setupMinutes} minutes.`],
    'The logo will need different colors.',
    'Use the reduced palette and adapt the logo.'),
  standard: argument('Choose an ink plan within budget', printClaim,
    [`${posterPrint.reducedAmount} USD fits the ${posterPrint.budgetAmount} USD budget.`,
      `Setup takes ${posterPrint.reduced.setupMinutes} minutes versus ${posterPrint.original.setupMinutes} minutes.`],
    logoObjection,
    `Print in ${reducedInks} inks and redraw the logo in that palette.`),
  deep: argument('Poster costs and setup tradeoff', printClaim,
    [`The reduced palette saves ${posterPrint.savedAmount} USD in materials.`,
      `Setup takes ${posterPrint.savedMinutes} fewer minutes.`],
    logoObjection,
    'Use the reduced palette. Keep the key text in the darker ink and recolor the logo.',
    `Both worked options cover the same ${posterPrint.copies} copies.`),
};

export const references = [
  {
    id: 'pool-late-library-return',
    lessons: [],
    prompts: ['Should we keep the late library return bin given the return counts and pickup time?'],
    keywords: ['late library return bin', 'after-hours book return'],
    useWhen: 'Weigh use of a library return bin against the time needed to collect its books.',
    ...returnDepths.standard,
    depths: returnDepths,
  },
  {
    id: 'pool-felt-mug-sleeve',
    lessons: [],
    prompts: ['Do these matched mug trials support using a felt sleeve for a short break?'],
    keywords: ['matched mug trials', 'felt mug sleeve'],
    useWhen: 'Weigh measured heat retention against the duration of the trial.',
    ...sleeveDepths.standard,
    depths: sleeveDepths,
  },
  {
    id: 'pool-club-poster-inks',
    lessons: [],
    prompts: ['Which ink plan should the club use for its poster given the material costs and setup times?'],
    keywords: ['club poster ink plan', 'club poster inks'],
    useWhen: 'Weigh print material cost and setup time against keeping the original logo palette.',
    ...posterDepths.standard,
    depths: posterDepths,
  },
];
