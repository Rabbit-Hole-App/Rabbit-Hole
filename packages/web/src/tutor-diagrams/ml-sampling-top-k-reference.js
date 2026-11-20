import { fillVariableText } from './calculation.js';
import { samplingTopK, topKCalculation, topKTemplates, topKVariables } from './ml-sampling-top-k-data.js';

const { k, tokens, fullPercent, filteredPercent, keptMassPercent } = samplingTopK;
const values = { full: fullPercent, k, renormalized: filteredPercent, keptShare: keptMassPercent };
const filled = text => fillVariableText(text, values).text;

// MVP4: the stored title and caption are the templates with the worked example's numbers filled in; `template` is what the author is shown (the numbers as {{v:name}}).
function groupedBars(template) {
  return { template, spec: { version: 1, diagram: {
    kind: 'bar-chart', variant: 'grouped', title: filled(template.title), caption: filled(template.caption), unit: '%',
    categories: tokens,
    series: [
      { label: 'Full softmax', values: fullPercent },
      { label: `Top-${k} renormalized`, values: filteredPercent },
    ],
    variables: topKVariables.map(variable => ({ ...variable })),
  } } };
}

const overview = groupedBars(topKTemplates.overview);
const standard = groupedBars(topKTemplates.standard);
const deep = groupedBars(topKTemplates.deep);

export const samplingTopKReference = {
  id: 'ml-sampling-top-k',
  lessons: [],
  prompts: ['Does top-k filtering affect the reported probability of the chosen token?'],
  keywords: ['top k filtering', 'top k sampling', 'sampling after top k'],
  useWhen: 'Compare the full model distribution with the filtered distribution used for sampling. A reported probability depends on which distribution is logged.',
  ...standard,
  calculation: topKCalculation,
  depths: { overview, standard, deep },
};
