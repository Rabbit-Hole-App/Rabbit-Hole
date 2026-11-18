import { samplingTopK } from './ml-sampling-top-k-data.js';

const { k, tokens, fullPercent, filteredPercent, keptMassPercent } = samplingTopK;

function groupedBars(title, caption) {
  return { spec: { version: 1, diagram: {
    kind: 'bar-chart', variant: 'grouped', title, caption, unit: '%',
    categories: tokens,
    series: [
      { label: 'Full softmax', values: fullPercent },
      { label: `Top-${k} renormalized`, values: filteredPercent },
    ],
  } } };
}

const overview = groupedBars('Keeping only the likeliest tokens',
  `Keep the top ${k} tokens. The other tokens drop to zero, and each kept token gets a bigger share.`);
const standard = groupedBars(`Full softmax and top-${k} sampling`,
  `The kept tokens originally hold ${keptMassPercent}% of the probability. Divide each kept probability by that total.`);
const deep = groupedBars(`Top-${k} renormalizes the kept mass`,
  `For a kept token, $p_i^{\\prime}=p_i/\\sum_{j\\in K}p_j$. For “${tokens[0]}”, $${fullPercent[0]}\\%/${keptMassPercent}\\%=${filteredPercent[0]}\\%$.`);

export const samplingTopKReference = {
  id: 'ml-sampling-top-k',
  lessons: [],
  prompts: ['Does top-k filtering affect the reported probability of the chosen token?'],
  keywords: ['top k filtering', 'top k sampling', 'sampling after top k'],
  useWhen: 'Compare the full model distribution with the filtered distribution used for sampling. A reported probability depends on which distribution is logged.',
  ...standard,
  depths: { overview, standard, deep },
};
