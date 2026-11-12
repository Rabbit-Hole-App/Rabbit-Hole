import { decisionTreesLesson } from './lesson-decision-trees-data.js';

const thousandths = 1000;

function sampledLine(label, x, count, calculate) {
  const y = Array.from({ length: count }, (_, index) => {
    const at = (x.start + index * x.step) / (x.divisor ?? 1);
    return Math.round(thousandths * calculate(at));
  });
  return { label, kind: 'line', smooth: true, samples: { x, y, divisor: thousandths } };
}

function impurityPlot(depth) {
  const fractions = { start: 0, step: 1, divisor: 10 };
  const entropy = p => p === 0 || p === 1 ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
  return {
    kind: 'coordinate-plot',
    title: depth === 'overview' ? 'Two measures of class mixing' : 'Gini impurity and entropy',
    x: { label: 'Class fraction p', min: 0, max: 1 },
    y: { label: 'Impurity score', min: 0, max: 1 },
    series: [
      sampledLine('Gini impurity', fractions, 11, p => 2 * p * (1 - p)),
      sampledLine('Entropy (bits)', fractions, 11, entropy),
    ],
    annotations: [
      { kind: 'point', x: 0.5, y: 0.5, label: 'Gini peak' },
      { kind: 'point', x: 0.5, y: 1, label: 'Entropy peak' },
    ],
    caption: 'Worked example. $G(p)=2p(1-p)$ and $H(p)=-p\\log_2 p-(1-p)\\log_2(1-p)$.' +
      (depth === 'overview' ? ' Rounded samples.' : depth === 'deep' ?
        ' Rounded samples. At the endpoints, the zero-share term vanishes by continuity.' : ' Samples rounded to 3 decimals.'),
  };
}

function bootstrapCoveragePlot(depth) {
  const omission = sampledLine('Omission after n draws', { start: 1, step: 1 }, 20, n => (1 - 1 / n) ** n);
  const limit = Math.round(thousandths / Math.E) / thousandths;
  const n = decisionTreesLesson.train.length;
  return {
    kind: 'coordinate-plot',
    title: depth === 'overview' ? 'Why about 63% appear' : 'Bootstrap omission by training set size',
    x: { label: 'Training rows n', min: 1, max: 20, integerTicks: true },
    y: { label: 'Chance a row is omitted', min: 0, max: 0.4 },
    series: [omission],
    annotations: [
      { kind: 'reference-line', axis: 'y', value: limit, label: 'Omission limit' },
      ...(depth === 'deep' ? [{ kind: 'point', x: n, y: omission.samples.y[n - 1] / thousandths, label: 'Toy training set' }] : []),
    ],
    caption: depth === 'overview' ? 'Worked example. Rounded limit $1/e≈0.368$ gives expected coverage $1-0.368=0.632$.' :
      depth === 'deep' ? `Worked example. Rounded $(1-1/n)^n$. At ${n} draws use $(${n - 1}/${n})^${n}$. Limit $1/e≈0.368$, so coverage tends to $1-0.368=0.632$.` :
        'Worked example. Omission with replacement is $(1-1/n)^n$. Samples rounded. Limit $1/e≈0.368$ gives expected coverage $1-0.368=0.632$.',
  };
}

export const lessonDecisionTreesAnalyticDemos = [
  {
    name: 'gini-vs-entropy',
    prompt: 'how does Gini impurity change as the fraction of one class goes from 0 to 1, compared with entropy?',
    paraphrase: 'Where do the binary Gini and entropy curves reach their maxima?',
    keywords: ['gini vs entropy', 'gini impurity', 'entropy'],
    useWhen: 'Compare binary Gini impurity and entropy over the same class fractions and mark their exact peaks.',
    diagramAt: impurityPlot,
  },
  {
    name: 'bootstrap-coverage',
    prompt: 'why does a bootstrap sample contain only about 63% of the unique training rows?',
    paraphrase: 'Why are about 37 percent of the original rows left out when we resample with replacement?',
    keywords: ['bootstrap 63', 'out of bag', 'bootstrap coverage'],
    useWhen: 'Plot the omission probability after drawing with replacement and explain expected unique coverage as its complement.',
    diagramAt: bootstrapCoveragePlot,
  },
];
