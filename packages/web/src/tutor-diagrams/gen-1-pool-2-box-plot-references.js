import { derived } from './gen-1-pool-2-box-plot-data.js';

export { derived };

const data = derived();
const coatCheck = 'pool-museum-coat-check-waits';
const paintSwatches = 'pool-paint-swatch-drying-times';
const openingNight = data[coatCheck].summaries[0];
const thinCoat = data[paintSwatches].summaries[0];

function reference(id, { title, prompt, keywords, useWhen, overview, standard, deep }) {
  const { x, summaries } = data[id];
  const boxes = summaries.map(summary => summary.box);
  const view = (list, caption) => ({ spec: { version: 1, diagram: { kind: 'box-plot', title, x, boxes: list, caption } } });
  const balanced = view(boxes, standard);
  return {
    id, lessons: [], prompts: [prompt], keywords, shortKeywords: keywords, useWhen, data: 'illustrative',
    ...balanced, depths: { overview: view(boxes.slice(0, 1), overview), standard: balanced, deep: view(boxes, deep) },
  };
}

export const references = [
  reference(coatCheck, {
    title: 'Museum coat-check waits',
    prompt: 'What do the whiskers and outliers show in the museum coat-check waits?',
    keywords: ['museum coat check', 'coat check waits'],
    useWhen: 'Explain unusually long waits at a museum coat check using observed whiskers and calculated fences.',
    overview: 'Illustrative waits. The dot marks a wait beyond the upper fence.',
    standard: 'Illustrative waits. Opening night has the wider box. Each whisker ends at an observed wait inside its fences.',
    deep: `Illustrative waits. Opening-night IQR is ${openingNight.iqr} min, with an upper fence of ${openingNight.upper} min. The ${openingNight.box.outliers[0].value} min wait lies beyond it.`,
  }),
  reference(paintSwatches, {
    title: 'Paint swatch drying times',
    prompt: 'How do the fences flag unusually fast or slow paint swatch drying times?',
    keywords: ['swatch drying times', 'paint drying fences'],
    useWhen: 'Compare drying times for thin and thick paint coats using observed whiskers and calculated fences.',
    overview: 'Illustrative times. The dot marks a thin swatch that dried unusually fast.',
    standard: 'Illustrative times. The thin coat has a fast outlier and the thick coat a slow one. Read each against its own fences.',
    deep: `Illustrative times. The thin coat IQR is ${thinCoat.iqr} min, giving a lower fence of ${thinCoat.lower} min. The ${thinCoat.box.outliers[0].value} min swatch is below it.`,
  }),
];
