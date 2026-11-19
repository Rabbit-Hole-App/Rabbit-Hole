import { repairCafeTally } from './gen-1-pool-2-token-links-data.js';
export { derived } from './gen-1-pool-2-token-links-data.js';

const { days, stations, queries, leadingStation } = repairCafeTally;
const dayLabels = days.map(day => day.slice(0, 3));

function weightedLinks(title, caption, activeQueries) {
  return { spec: { version: 1, diagram: {
    kind: 'token-links', title, caption, source: dayLabels, target: stations, queries: activeQueries, normalized: true,
  } } };
}

const overview = weightedLinks('Repair café station choices',
  'Link widths show the share of Saturday’s slips for each station.', [queries[0]]);
const standard = weightedLinks('Repair café preferences by day',
  'Divide each count by its day’s total. The thickest link marks that day’s most popular station.', queries);
const deep = weightedLinks('How the repair café weights are calculated',
  `${leadingStation.station} got ${leadingStation.count} of ${leadingStation.day}’s ${leadingStation.total} slips. Its link weight is ${leadingStation.share}.`, queries);
const keywords = ['repair café slips', 'repair café weights'];

export const references = [{
  id: 'pool-repair-cafe-station-weights',
  lessons: [],
  prompts: ['How do I turn repair café station choice slips into link weights for each day?'],
  keywords,
  shortKeywords: keywords,
  useWhen: 'Use one weighted link per station choice and normalize each day’s tally by its own total.',
  ...standard,
  depths: { overview, standard, deep },
}];
