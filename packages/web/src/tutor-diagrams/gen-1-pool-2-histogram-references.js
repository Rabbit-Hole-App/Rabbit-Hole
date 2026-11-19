import { skateRentals } from './gen-1-pool-2-histogram-data.js';
export { derived } from './gen-1-pool-2-histogram-data.js';

const { binEdges, counts, median, peak, total } = skateRentals;
const markers = [{ label: 'Median rental', value: median }];

function histogram(title, caption, markers) {
  return { spec: { version: 1, diagram: {
    kind: 'histogram', title, caption, xLabel: 'Rental duration', unit: 'min',
    binEdges, measure: 'proportion', series: [{ label: 'Skate rentals', values: counts }],
    ...(markers ? { markers } : {}),
  } } };
}

const overview = histogram('Skate rental durations',
  'Each bar shows the share of rentals in that time interval.');
const standard = histogram('Where the skate rental times cluster',
  'The median marker splits the ordered rental times in half.', markers);
const deep = histogram('From skate rental counts to proportions',
  `Of ${total} rentals, ${peak.count} lasted from ${peak.lower} to under ${peak.upper} minutes. The bar height is ${peak.proportion}.`, markers);
const keywords = ['skate rental durations', 'skate rental histogram'];

export const references = [{
  id: 'pool-skate-rental-proportions',
  lessons: [],
  prompts: ['How can I turn skate rental durations into a proportion histogram?'],
  keywords,
  shortKeywords: keywords,
  useWhen: 'Use for a distribution of rental durations when the input is counts and the histogram shows proportions.',
  ...standard,
  depths: { overview, standard, deep },
}];
