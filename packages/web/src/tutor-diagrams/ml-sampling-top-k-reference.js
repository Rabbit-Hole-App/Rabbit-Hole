import { declareReference, declareSpec } from './calculation.js';
import { samplingTopK, topKCalculation, topKInputs } from './ml-sampling-top-k-data.js';

const { tokens, fullPercent, filteredPercent } = samplingTopK;

// The authoring template of each depth: the numbers the figure draws are the worked example's, and the text fields carry {{v:name}} where a number that follows from the inputs stood. The stored title,
// caption and series label are these with the function's numbers filled in (calculation.js declareSpec), so the stored text and the stored numbers come from the same place.
function groupedBars(title, caption) {
  return { spec: { version: 1, diagram: {
    kind: 'bar-chart', variant: 'grouped', title, caption, unit: '%',
    categories: tokens,
    series: [
      { label: 'Full softmax', values: fullPercent },
      { label: 'Top-{{v:k}} renormalized', values: filteredPercent },
    ],
  } } };
}

const declared = holder => declareSpec(holder, topKCalculation, topKInputs);
const overview = declared(groupedBars('Keeping only the likeliest tokens',
  'Keep the top {{v:k}} tokens. The other tokens drop to zero, and each kept token gets a bigger share.'));
const standard = declared(groupedBars('Full softmax and top-{{v:k}} sampling',
  'The kept tokens originally hold {{v:keptShare}}% of the probability. Divide each kept probability by that total.'));
const deep = declared(groupedBars('Top-{{v:k}} renormalizes the kept mass',
  `For a kept token, $p_i'=p_i/\\sum_{j\\in K}p_j$. For "${tokens[0]}", {{v:full.0}}% / {{v:keptShare}}% = {{v:renormalized.0}}%.`));

export const samplingTopKReference = declareReference({
  id: 'ml-sampling-top-k',
  lessons: [],
  prompts: ['Does top-k filtering affect the reported probability of the chosen token?'],
  keywords: ['top k filtering', 'top k sampling', 'sampling after top k'],
  useWhen: 'Compare the full model distribution with the filtered distribution used for sampling. A reported probability depends on which distribution is logged.',
  ...standard,
  depths: { overview, standard, deep },
}, topKCalculation, topKInputs);
